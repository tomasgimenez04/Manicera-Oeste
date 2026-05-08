<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

date_default_timezone_set('America/Argentina/Buenos_Aires');

function respond_json($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function get_json_input() {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function normalize_invoice_item_ids($items) {
    if (!is_array($items)) {
        return [];
    }

    $values = array_map(function ($value) {
        return trim((string) $value);
    }, $items);

    $values = array_filter($values, function ($value) {
        return $value !== '';
    });

    return array_values(array_unique($values));
}

function parse_invoice_item_id($value) {
    if (preg_match('/^mov-(\d+)$/', $value, $matches)) {
        return [
            'tipo' => 'movimiento',
            'movimiento_id' => intval($matches[1])
        ];
    }

    if (preg_match('/^cc-(\d+)-(\d+)$/', $value, $matches)) {
        return [
            'tipo' => 'cuenta_corriente',
            'cuenta_id' => intval($matches[1]),
            'item_id' => intval($matches[2])
        ];
    }

    return null;
}

function get_billed_item_ids(mysqli $conn) {
    $result = $conn->query('SELECT items_ids FROM facturas');
    if (!$result) {
        throw new Exception('No se pudo consultar las ventas ya facturadas.', 500);
    }

    $ids = [];

    while ($row = $result->fetch_assoc()) {
        $itemIds = normalize_invoice_item_ids(explode(',', (string) ($row['items_ids'] ?? '')));
        foreach ($itemIds as $itemId) {
            $ids[$itemId] = true;
        }
    }

    return array_keys($ids);
}

function resolve_invoice_items(mysqli $conn, array $itemsIds) {
    $movementIds = [];
    $accountItemIds = [];

    foreach ($itemsIds as $itemId) {
        $parsed = parse_invoice_item_id($itemId);
        if (!$parsed) {
            throw new Exception('Hay ventas seleccionadas con un identificador inválido.', 400);
        }

        if ($parsed['tipo'] === 'movimiento') {
            $movementIds[] = $parsed['movimiento_id'];
            continue;
        }

        $accountItemIds[] = $parsed['item_id'];
    }

    $amountsById = [];

    if ($movementIds) {
        $movementIdList = implode(',', array_map('intval', $movementIds));
        $movementResult = $conn->query("
            SELECT
                id,
                monto
            FROM movimientos
            WHERE id IN ($movementIdList)
              AND tipo = 'venta'
              AND producto_id IS NOT NULL
              AND monto > 0
        ");

        if (!$movementResult) {
            throw new Exception('No se pudo consultar una o más ventas seleccionadas.', 500);
        }

        while ($row = $movementResult->fetch_assoc()) {
            $amountsById['mov-' . intval($row['id'])] = round(floatval($row['monto']), 2);
        }
    }

    if ($accountItemIds) {
        $itemIdList = implode(',', array_map('intval', $accountItemIds));
        $accountItemsResult = $conn->query("
            SELECT
                cc_items.id,
                cc_items.cuenta_id,
                cc_items.subtotal
            FROM cc_items
            INNER JOIN cuentas_corrientes ON cuentas_corrientes.id = cc_items.cuenta_id
            WHERE cc_items.id IN ($itemIdList)
              AND cuentas_corrientes.activo = 1
        ");

        if (!$accountItemsResult) {
            throw new Exception('No se pudo consultar uno o más ítems de cuenta corriente.', 500);
        }

        while ($row = $accountItemsResult->fetch_assoc()) {
            $rawId = 'cc-' . intval($row['cuenta_id']) . '-' . intval($row['id']);
            $amountsById[$rawId] = round(floatval($row['subtotal']), 2);
        }
    }

    $total = 0.0;

    foreach ($itemsIds as $itemId) {
        if (!array_key_exists($itemId, $amountsById)) {
            throw new Exception('Hay ventas seleccionadas que ya no existen o no pueden facturarse.', 400);
        }

        $total += $amountsById[$itemId];
    }

    return [
        'items_ids' => $itemsIds,
        'total' => round($total, 2)
    ];
}

function acquire_invoice_lock(mysqli $conn) {
    $result = $conn->query("SELECT GET_LOCK('manicera_oeste_facturas', 10) AS invoice_lock");
    if (!$result) {
        throw new Exception('No se pudo reservar la numeración de facturas.', 500);
    }

    $row = $result->fetch_assoc();
    if (!$row || intval($row['invoice_lock']) !== 1) {
        throw new Exception('No se pudo reservar la numeración de facturas. Intenta nuevamente.', 503);
    }
}

function release_invoice_lock(mysqli $conn) {
    $conn->query("SELECT RELEASE_LOCK('manicera_oeste_facturas')");
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    try {
        respond_json([
            'billed_items' => get_billed_item_ids($conn)
        ]);
    } catch (Throwable $error) {
        $status = intval($error->getCode());
        if ($status < 400 || $status > 599) {
            $status = 500;
        }

        respond_json(['error' => $error->getMessage()], $status);
    }
}

if ($method !== 'POST') {
    respond_json(['error' => 'Método no permitido.'], 405);
}

$body = get_json_input();
$itemsIds = normalize_invoice_item_ids($body['items_ids'] ?? []);

if (!$itemsIds) {
    respond_json(['error' => 'Debes seleccionar al menos una venta para facturar.'], 400);
}

$lockAcquired = false;
$transactionStarted = false;

try {
    acquire_invoice_lock($conn);
    $lockAcquired = true;

    $conn->begin_transaction();
    $transactionStarted = true;

    $alreadyBilled = array_flip(get_billed_item_ids($conn));
    foreach ($itemsIds as $itemId) {
        if (isset($alreadyBilled[$itemId])) {
            throw new Exception('Una o más ventas seleccionadas ya fueron facturadas.', 409);
        }
    }

    $invoiceItems = resolve_invoice_items($conn, $itemsIds);
    $total = $invoiceItems['total'];

    if ($total <= 0) {
        throw new Exception('El total de la factura debe ser mayor a 0.', 400);
    }

    $result = $conn->query('SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM facturas');
    if (!$result) {
        throw new Exception('No se pudo obtener el número correlativo de factura.', 500);
    }

    $row = $result->fetch_assoc();
    $numero = intval($row['siguiente']);
    $numeroFormateado = str_pad((string) $numero, 5, '0', STR_PAD_LEFT);
    $fechaGuardado = date('Y-m-d H:i:s');
    $fechaFormateada = date('d/m/Y');
    $itemsIdsText = implode(',', $invoiceItems['items_ids']);

    $stmt = $conn->prepare('
        INSERT INTO facturas (numero, fecha, total, items_ids)
        VALUES (?, ?, ?, ?)
    ');

    if (!$stmt) {
        throw new Exception('No se pudo preparar el guardado de la factura.', 500);
    }

    $stmt->bind_param('isds', $numero, $fechaGuardado, $total, $itemsIdsText);

    if (!$stmt->execute()) {
        $stmt->close();
        throw new Exception('No se pudo guardar la factura.', 500);
    }

    $facturaId = intval($conn->insert_id);
    $stmt->close();

    $conn->commit();
    $transactionStarted = false;

    release_invoice_lock($conn);
    $lockAcquired = false;

    respond_json([
        'ok' => true,
        'id' => $facturaId,
        'numero' => $numero,
        'numero_formateado' => $numeroFormateado,
        'fecha' => $fechaFormateada,
        'total' => $total,
        'items_ids' => $itemsIdsText
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        $conn->rollback();
    }

    if ($lockAcquired) {
        release_invoice_lock($conn);
    }

    $status = intval($error->getCode());
    if ($status < 400 || $status > 599) {
        $status = 500;
    }

    respond_json(['error' => $error->getMessage()], $status);
}
?>
