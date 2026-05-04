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
        productos.id,
        productos.nombre,
        COALESCE(productos.codigo, '') AS codigo,
        COALESCE(v_stock.stock_kg, 0) AS stock_kg
    FROM productos
    LEFT JOIN v_stock ON v_stock.id = productos.id
    WHERE productos.activo = 1
    ORDER BY COALESCE(v_stock.stock_kg, 0) DESC, productos.nombre ASC
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
