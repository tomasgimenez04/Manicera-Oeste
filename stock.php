<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo no permitido.']);
    exit;
}

$resultado = $conn->query("
    SELECT
        v_stock.id,
        v_stock.nombre,
        COALESCE(productos.codigo, '') AS codigo,
        v_stock.stock_kg
    FROM v_stock
    LEFT JOIN productos ON productos.id = v_stock.id
    ORDER BY v_stock.nombre ASC
");

if (!$resultado) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al consultar el stock.']);
    exit;
}

$stock = $resultado->fetch_all(MYSQLI_ASSOC);

foreach ($stock as &$item) {
    $item['stock_kg'] = floatval($item['stock_kg']);
}

echo json_encode($stock);
?>
