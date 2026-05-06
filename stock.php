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
    echo json_encode(['error' => 'Método no permitido.']);
    exit;
}

$resultado = $conn->query("
    SELECT
        productos.id,
        productos.nombre,
        COALESCE(productos.codigo, '') AS codigo,
        COALESCE(productos.unidad_medida, 'kg') AS unidad_medida,
        COALESCE(SUM(
            CASE
                WHEN movimientos.tipo = 'compra' THEN movimientos.cantidad
                WHEN movimientos.tipo = 'venta' THEN -movimientos.cantidad
                ELSE 0
            END
        ), 0) AS stock_cantidad
    FROM productos
    LEFT JOIN movimientos ON movimientos.producto_id = productos.id
    WHERE productos.activo = 1
    GROUP BY productos.id, productos.nombre, productos.codigo, productos.unidad_medida
    ORDER BY stock_cantidad DESC, productos.nombre ASC
");

if (!$resultado) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al consultar el stock.']);
    exit;
}

$stock = $resultado->fetch_all(MYSQLI_ASSOC);

foreach ($stock as &$item) {
    $item['stock_cantidad'] = floatval($item['stock_cantidad']);
}

echo json_encode($stock);
?>
