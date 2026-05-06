<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo no permitido.']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$items_ids = isset($body['items_ids']) && is_array($body['items_ids']) ? $body['items_ids'] : [];
$total = isset($body['total']) ? floatval($body['total']) : 0;

$items_ids = array_values(array_unique(array_filter(array_map('intval', $items_ids), function ($value) {
    return $value > 0;
})));

if (count($items_ids) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Debes seleccionar al menos una venta para facturar.']);
    exit;
}

if ($total <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'El total de la factura debe ser mayor a 0.']);
    exit;
}

$items_ids_text = implode(',', $items_ids);
$fecha_guardado = date('Y-m-d H:i:s');
$fecha_formateada = date('d/m/Y');

try {
    $conn->begin_transaction();

    $resultado = $conn->query('SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM facturas');

    if (!$resultado) {
        throw new Exception('No se pudo obtener el numero correlativo de factura.');
    }

    $fila = $resultado->fetch_assoc();
    $numero = intval($fila['siguiente']);
    $numero_formateado = str_pad((string) $numero, 5, '0', STR_PAD_LEFT);

    $stmt = $conn->prepare('INSERT INTO facturas (numero, fecha, total, items_ids) VALUES (?, ?, ?, ?)');

    if (!$stmt) {
        throw new Exception('No se pudo preparar el guardado de la factura.');
    }

    $stmt->bind_param('isds', $numero, $fecha_guardado, $total, $items_ids_text);

    if (!$stmt->execute()) {
        throw new Exception('No se pudo guardar la factura.');
    }

    $stmt->close();
    $conn->commit();

    echo json_encode([
        'ok' => true,
        'id' => $conn->insert_id,
        'numero' => $numero,
        'numero_formateado' => $numero_formateado,
        'fecha' => $fecha_formateada,
        'total' => round($total, 2),
        'items_ids' => $items_ids_text
    ]);
} catch (Throwable $error) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => $error->getMessage()]);
}
?>
