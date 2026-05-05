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

$filtro = isset($_GET['filtro']) ? $_GET['filtro'] : 'dia';

switch ($filtro) {
    case 'semana':
        $desde = 'DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        break;
    case 'mes':
        $desde = "DATE_FORMAT(NOW(), '%Y-%m-01')";
        break;
    case 'dia':
    default:
        $desde = 'CURDATE()';
        break;
}

$sql = "
    SELECT
        movimientos.id,
        DATE_FORMAT(movimientos.fecha, '%d/%m/%Y') AS fecha,
        DATE_FORMAT(movimientos.fecha, '%H:%i') AS hora,
        productos.nombre AS producto,
        COALESCE(productos.codigo, '') AS codigo_producto,
        COALESCE(productos.unidad_medida, 'kg') AS unidad_medida,
        movimientos.cantidad,
        movimientos.monto
    FROM movimientos
    LEFT JOIN productos ON productos.id = movimientos.producto_id
    WHERE movimientos.tipo = 'venta'
      AND DATE(movimientos.fecha) >= $desde
    ORDER BY movimientos.fecha DESC
";

$resultado = $conn->query($sql);

if (!$resultado) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al consultar tickets.']);
    exit;
}

$tickets = $resultado->fetch_all(MYSQLI_ASSOC);

foreach ($tickets as &$ticket) {
    $ticket['cantidad'] = floatval($ticket['cantidad']);
    $ticket['monto'] = floatval($ticket['monto']);
}

echo json_encode($tickets);
?>
