<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
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

function format_date_br($value) {
    if (!$value) {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->format('d/m/Y');
    } catch (Throwable $error) {
        return null;
    }
}

function format_datetime_br($value) {
    if (!$value) {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->format('d/m/Y H:i');
    } catch (Throwable $error) {
        return null;
    }
}

function get_account_state($montoTotal, $montoPagado, $estadoActual = null) {
    if ($estadoActual === 'archivada') {
        return 'archivada';
    }

    if ($montoPagado <= 0) {
        return 'pendiente';
    }

    if ($montoPagado >= $montoTotal) {
        return 'saldada';
    }

    return 'parcial';
}

function get_account_row(mysqli $conn, $cuentaId, $forUpdate = false) {
    $sql = '
        SELECT
            id,
            cliente,
            fecha_creacion,
            fecha_vencimiento,
            monto_total,
            monto_pagado,
            estado,
            activo
        FROM cuentas_corrientes
        WHERE id = ? AND activo = 1
    ';

    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $cuentaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    $row['id'] = intval($row['id']);
    $row['monto_total'] = floatval($row['monto_total']);
    $row['monto_pagado'] = floatval($row['monto_pagado']);
    return $row;
}

function get_account_items(mysqli $conn, array $cuentaIds) {
    if (!$cuentaIds) {
        return [];
    }

    $idList = implode(',', array_map('intval', $cuentaIds));
    $result = $conn->query("
        SELECT
            cc_items.id,
            cc_items.cuenta_id,
            cc_items.producto_id,
            cc_items.cantidad,
            cc_items.precio_unitario,
            cc_items.subtotal,
            COALESCE(productos.nombre, '') AS producto,
            COALESCE(productos.codigo, '') AS codigo,
            COALESCE(productos.unidad_medida, 'kg') AS unidad_medida
        FROM cc_items
        INNER JOIN cuentas_corrientes ON cuentas_corrientes.id = cc_items.cuenta_id
        LEFT JOIN productos ON productos.id = cc_items.producto_id
        WHERE cc_items.cuenta_id IN ($idList)
        ORDER BY cc_items.id ASC
    ");

    $itemsByCuenta = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $cuentaId = intval($row['cuenta_id']);
            if (!isset($itemsByCuenta[$cuentaId])) {
                $itemsByCuenta[$cuentaId] = [];
            }

            $itemsByCuenta[$cuentaId][] = [
                'id' => intval($row['id']),
                'cuenta_id' => $cuentaId,
                'producto_id' => intval($row['producto_id']),
                'producto' => $row['producto'],
                'codigo' => $row['codigo'],
                'unidad_medida' => $row['unidad_medida'],
                'cantidad' => floatval($row['cantidad']),
                'precio_unitario' => floatval($row['precio_unitario']),
                'subtotal' => floatval($row['subtotal'])
            ];
        }
    }

    return $itemsByCuenta;
}

function get_payments_count_by_account(mysqli $conn, array $cuentaIds) {
    if (!$cuentaIds) {
        return [];
    }

    $idList = implode(',', array_map('intval', $cuentaIds));
    $result = $conn->query("
        SELECT
            cuenta_id,
            COUNT(*) AS pagos_realizados
        FROM cc_pagos
        WHERE cuenta_id IN ($idList)
        GROUP BY cuenta_id
    ");

    $counts = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $counts[intval($row['cuenta_id'])] = intval($row['pagos_realizados']);
        }
    }

    return $counts;
}

function get_account_payment_history(mysqli $conn, $cuentaId) {
    $stmt = $conn->prepare('
        SELECT
            id,
            cuenta_id,
            monto,
            observacion,
            fecha
        FROM cc_pagos
        WHERE cuenta_id = ?
        ORDER BY fecha DESC, id DESC
    ');
    $stmt->bind_param('i', $cuentaId);
    $stmt->execute();
    $result = $stmt->get_result();
    $items = [];

    while ($row = $result->fetch_assoc()) {
        $items[] = [
            'id' => intval($row['id']),
            'cuenta_id' => intval($row['cuenta_id']),
            'monto' => floatval($row['monto']),
            'observacion' => $row['observacion'],
            'fecha' => $row['fecha'],
            'fecha_formateada' => format_datetime_br($row['fecha'])
        ];
    }

    $stmt->close();
    return $items;
}

function get_active_product(mysqli $conn, $productoId) {
    $stmt = $conn->prepare('
        SELECT
            id,
            nombre,
            COALESCE(codigo, "") AS codigo,
            COALESCE(unidad_medida, "kg") AS unidad_medida,
            COALESCE(precio_unitario, 0) AS precio_unitario
        FROM productos
        WHERE id = ? AND activo = 1
    ');
    $stmt->bind_param('i', $productoId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    $row['id'] = intval($row['id']);
    $row['precio_unitario'] = floatval($row['precio_unitario']);
    return $row;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET' && isset($_GET['id'])) {
    $cuentaId = intval($_GET['id']);

    if ($cuentaId <= 0) {
        respond_json(['error' => 'ID de cuenta inválido.'], 400);
    }

    $history = get_account_payment_history($conn, $cuentaId);
    respond_json($history);
}

if ($method === 'GET') {
    $today = new DateTimeImmutable('today');
    $monthStart = $today->modify('first day of this month')->setTime(0, 0, 0);
    $nextMonthStart = $monthStart->modify('+1 month');

    $result = $conn->query('
        SELECT
            id,
            cliente,
            fecha_creacion,
            fecha_vencimiento,
            monto_total,
            monto_pagado,
            estado,
            activo
        FROM cuentas_corrientes
        WHERE activo = 1 AND estado <> "archivada"
        ORDER BY fecha_creacion DESC, id DESC
    ');

    if (!$result) {
        respond_json(['error' => 'Error al consultar cuentas corrientes.'], 500);
    }

    $cuentas = [];
    $cuentaIds = [];

    while ($row = $result->fetch_assoc()) {
        $row['id'] = intval($row['id']);
        $row['monto_total'] = floatval($row['monto_total']);
        $row['monto_pagado'] = floatval($row['monto_pagado']);
        $cuentas[] = $row;
        $cuentaIds[] = $row['id'];
    }

    $itemsByCuenta = get_account_items($conn, $cuentaIds);
    $paymentsCount = get_payments_count_by_account($conn, $cuentaIds);

    $monthlyStmt = $conn->prepare('
        SELECT COALESCE(SUM(monto), 0) AS total_mes
        FROM cc_pagos
        WHERE fecha >= ? AND fecha < ?
    ');
    $monthStartSql = $monthStart->format('Y-m-d H:i:s');
    $nextMonthSql = $nextMonthStart->format('Y-m-d H:i:s');
    $monthlyStmt->bind_param('ss', $monthStartSql, $nextMonthSql);
    $monthlyStmt->execute();
    $monthlyRow = $monthlyStmt->get_result()->fetch_assoc();
    $monthlyStmt->close();

    $pendientesTotal = 0.0;
    $parcialesTotal = 0.0;
    $responseItems = [];

    foreach ($cuentas as $cuenta) {
        $cuentaId = $cuenta['id'];
        $saldoRestante = max(round($cuenta['monto_total'] - $cuenta['monto_pagado'], 2), 0);
        $estado = get_account_state($cuenta['monto_total'], $cuenta['monto_pagado'], $cuenta['estado']);

        if ($estado === 'pendiente') {
            $pendientesTotal += $saldoRestante;
        } elseif ($estado === 'parcial') {
            $parcialesTotal += $saldoRestante;
        }

        $responseItems[] = [
            'id' => $cuentaId,
            'cliente' => $cuenta['cliente'],
            'fecha_creacion' => $cuenta['fecha_creacion'],
            'fecha_creacion_formateada' => format_datetime_br($cuenta['fecha_creacion']),
            'fecha_vencimiento' => $cuenta['fecha_vencimiento'],
            'fecha_vencimiento_formateada' => format_date_br($cuenta['fecha_vencimiento']),
            'monto_total' => $cuenta['monto_total'],
            'monto_pagado' => $cuenta['monto_pagado'],
            'saldo_restante' => $saldoRestante,
            'estado' => $estado,
            'activo' => intval($cuenta['activo']),
            'pagos_realizados' => intval($paymentsCount[$cuentaId] ?? 0),
            'items' => $itemsByCuenta[$cuentaId] ?? []
        ];
    }

    respond_json([
        'items' => $responseItems,
        'resumen' => [
            'pendientes' => round($pendientesTotal, 2),
            'parciales' => round($parcialesTotal, 2),
            'cobrado_mes' => round(floatval($monthlyRow['total_mes'] ?? 0), 2)
        ]
    ]);
}

if ($method === 'POST') {
    $action = trim($_GET['accion'] ?? '');
    $body = get_json_input();

    if ($action === 'crear') {
        $cliente = trim($body['cliente'] ?? '');
        $fechaVencimiento = isset($body['fecha_vencimiento']) ? trim((string) $body['fecha_vencimiento']) : '';
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];

        if ($cliente === '') {
            respond_json(['error' => 'El cliente es obligatorio.'], 400);
        }

        if (!$items) {
            respond_json(['error' => 'Agrega al menos un producto a la cuenta corriente.'], 400);
        }

        $validatedItems = [];
        $montoTotal = 0.0;

        foreach ($items as $index => $item) {
            $productoId = intval($item['producto_id'] ?? 0);
            $cantidad = floatval($item['cantidad'] ?? 0);
            $precioUnitario = floatval($item['precio_unitario'] ?? 0);

            if ($productoId <= 0) {
                respond_json(['error' => 'Producto inválido en la lista de cuenta corriente.'], 400);
            }

            if ($cantidad <= 0) {
                respond_json(['error' => 'La cantidad debe ser mayor a 0 en todos los productos.'], 400);
            }

            if ($precioUnitario <= 0) {
                respond_json(['error' => 'El precio unitario debe ser mayor a 0 en todos los productos.'], 400);
            }

            $producto = get_active_product($conn, $productoId);
            if (!$producto) {
                respond_json(['error' => "El producto del item #" . ($index + 1) . " no existe o fue eliminado."], 404);
            }

            if (in_array($producto['unidad_medida'], ['unidad', 'bandeja'], true) && floor($cantidad) != $cantidad) {
                respond_json(['error' => "La cantidad del producto {$producto['nombre']} debe ser entera."], 400);
            }

            $subtotal = round($cantidad * $precioUnitario, 2);
            $montoTotal += $subtotal;

            $validatedItems[] = [
                'producto_id' => $productoId,
                'producto' => $producto['nombre'],
                'cantidad' => $cantidad,
                'precio_unitario' => $precioUnitario,
                'subtotal' => $subtotal
            ];
        }

        if ($montoTotal <= 0) {
            respond_json(['error' => 'El total de la cuenta corriente debe ser mayor a 0.'], 400);
        }

        $fechaVencimientoValue = $fechaVencimiento !== '' ? $fechaVencimiento : null;

        try {
            $conn->begin_transaction();

            $stmt = $conn->prepare('
                INSERT INTO cuentas_corrientes (cliente, fecha_vencimiento, monto_total, monto_pagado, estado, activo)
                VALUES (?, ?, ?, 0, "pendiente", 1)
            ');
            $stmt->bind_param('ssd', $cliente, $fechaVencimientoValue, $montoTotal);

            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception('No se pudo crear la cuenta corriente.', 500);
            }

            $cuentaId = intval($conn->insert_id);
            $stmt->close();

            foreach ($validatedItems as $item) {
                $itemStmt = $conn->prepare('
                    INSERT INTO cc_items (cuenta_id, producto_id, cantidad, precio_unitario, subtotal)
                    VALUES (?, ?, ?, ?, ?)
                ');
                $itemStmt->bind_param(
                    'iiddd',
                    $cuentaId,
                    $item['producto_id'],
                    $item['cantidad'],
                    $item['precio_unitario'],
                    $item['subtotal']
                );

                if (!$itemStmt->execute()) {
                    $itemStmt->close();
                    throw new Exception('No se pudo guardar un item de la cuenta corriente.', 500);
                }

                $itemStmt->close();

                $observacion = 'Cuenta corriente: ' . $cliente;
                $movementStmt = $conn->prepare('
                    INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
                    VALUES ("venta", ?, ?, 0, ?)
                ');
                $movementStmt->bind_param('ids', $item['producto_id'], $item['cantidad'], $observacion);

                if (!$movementStmt->execute()) {
                    $movementStmt->close();
                    throw new Exception('No se pudo registrar el movimiento de stock de la cuenta corriente.', 500);
                }

                $movementStmt->close();
            }

            $conn->commit();

            respond_json([
                'ok' => true,
                'id' => $cuentaId
            ]);
        } catch (Throwable $error) {
            $conn->rollback();
            $status = intval($error->getCode());
            if ($status < 400 || $status > 599) {
                $status = 500;
            }

            respond_json(['error' => $error->getMessage()], $status);
        }
    }

    if ($action === 'pagar') {
        $cuentaId = intval($body['cuenta_id'] ?? 0);
        $monto = floatval($body['monto'] ?? 0);
        $observacion = trim($body['observacion'] ?? '');

        if ($cuentaId <= 0) {
            respond_json(['error' => 'Selecciona una cuenta corriente válida.'], 400);
        }

        if ($monto <= 0) {
            respond_json(['error' => 'El monto del pago debe ser mayor a 0.'], 400);
        }

        try {
            $conn->begin_transaction();

            $cuenta = get_account_row($conn, $cuentaId, true);
            if (!$cuenta || $cuenta['estado'] === 'archivada') {
                throw new Exception('La cuenta corriente no existe o ya fue archivada.', 404);
            }

            $saldoRestante = max(round($cuenta['monto_total'] - $cuenta['monto_pagado'], 2), 0);

            if ($saldoRestante <= 0) {
                throw new Exception('La cuenta corriente ya está saldada.', 400);
            }

            if ($monto > $saldoRestante + 0.00001) {
                throw new Exception('El monto no puede superar el saldo restante.', 400);
            }

            $observacionValue = $observacion !== '' ? $observacion : null;
            $pagoStmt = $conn->prepare('
                INSERT INTO cc_pagos (cuenta_id, monto, observacion)
                VALUES (?, ?, ?)
            ');
            $pagoStmt->bind_param('ids', $cuentaId, $monto, $observacionValue);

            if (!$pagoStmt->execute()) {
                $pagoStmt->close();
                throw new Exception('No se pudo registrar el pago de la cuenta corriente.', 500);
            }

            $pagoStmt->close();

            $nuevoPagado = round($cuenta['monto_pagado'] + $monto, 2);
            $nuevoEstado = get_account_state($cuenta['monto_total'], $nuevoPagado);

            $updateStmt = $conn->prepare('
                UPDATE cuentas_corrientes
                SET monto_pagado = ?, estado = ?
                WHERE id = ?
            ');
            $updateStmt->bind_param('dsi', $nuevoPagado, $nuevoEstado, $cuentaId);

            if (!$updateStmt->execute()) {
                $updateStmt->close();
                throw new Exception('No se pudo actualizar el estado de la cuenta corriente.', 500);
            }

            $updateStmt->close();

            $movementObservation = 'Pago cuenta corriente: ' . $cuenta['cliente'];
            $movementStmt = $conn->prepare('
                INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
                VALUES ("venta", NULL, 1, ?, ?)
            ');
            $movementStmt->bind_param('ds', $monto, $movementObservation);

            if (!$movementStmt->execute()) {
                $movementStmt->close();
                throw new Exception('No se pudo registrar el movimiento del cobro.', 500);
            }

            $movementStmt->close();

            $conn->commit();

            respond_json([
                'ok' => true,
                'id' => $cuentaId,
                'estado' => $nuevoEstado,
                'monto_pagado' => $nuevoPagado
            ]);
        } catch (Throwable $error) {
            $conn->rollback();
            $status = intval($error->getCode());
            if ($status < 400 || $status > 599) {
                $status = 500;
            }

            respond_json(['error' => $error->getMessage()], $status);
        }
    }

    if ($action === 'archivar') {
        $cuentaId = intval($body['id'] ?? 0);

        if ($cuentaId <= 0) {
            respond_json(['error' => 'Selecciona una cuenta corriente válida.'], 400);
        }

        $payments = get_account_payment_history($conn, $cuentaId);
        if ($payments) {
            respond_json(['error' => 'No se puede archivar una cuenta con pagos registrados.'], 400);
        }

        $stmt = $conn->prepare('
            UPDATE cuentas_corrientes
            SET estado = "archivada"
            WHERE id = ? AND activo = 1
        ');
        $stmt->bind_param('i', $cuentaId);

        if (!$stmt->execute()) {
            $stmt->close();
            respond_json(['error' => 'No se pudo archivar la cuenta corriente.'], 500);
        }

        if ($stmt->affected_rows === 0) {
            $stmt->close();
            respond_json(['error' => 'La cuenta corriente no existe o ya fue archivada.'], 404);
        }

        $stmt->close();
        respond_json(['ok' => true]);
    }

    respond_json(['error' => 'Acción no válida.'], 400);
}

if ($method === 'DELETE') {
    $body = get_json_input();
    $cuentaId = intval($body['id'] ?? 0);

    if ($cuentaId <= 0) {
        respond_json(['error' => 'ID de cuenta inválido.'], 400);
    }

    $payments = get_account_payment_history($conn, $cuentaId);
    if ($payments) {
        respond_json(['error' => 'No se puede eliminar una cuenta con pagos registrados.'], 400);
    }

    $stmt = $conn->prepare('UPDATE cuentas_corrientes SET activo = 0 WHERE id = ? AND activo = 1');
    $stmt->bind_param('i', $cuentaId);

    if (!$stmt->execute()) {
        $stmt->close();
        respond_json(['error' => 'No se pudo desactivar la cuenta corriente.'], 500);
    }

    if ($stmt->affected_rows === 0) {
        $stmt->close();
        respond_json(['error' => 'La cuenta corriente no existe o ya fue eliminada.'], 404);
    }

    $stmt->close();
    respond_json(['ok' => true]);
}

respond_json(['error' => 'Método no permitido.'], 405);
