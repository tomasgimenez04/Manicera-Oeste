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
        v_movimientos.id,
        DATE_FORMAT(v_movimientos.fecha, '%d/%m/%Y') AS fecha,
        DATE_FORMAT(v_movimientos.fecha, '%H:%i') AS hora,
        v_movimientos.producto,
        COALESCE(productos.codigo, '') AS codigo_producto,
        v_movimientos.kg,
        v_movimientos.monto
    FROM v_movimientos
    LEFT JOIN productos ON productos.id = v_movimientos.producto_id
    WHERE v_movimientos.tipo = 'venta'
      AND DATE(v_movimientos.fecha) >= $desde
    ORDER BY v_movimientos.fecha DESC
";

$resultado = $conn->query($sql);

if (!$resultado) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al consultar tickets.']);
    exit;
}

$tickets = $resultado->fetch_all(MYSQLI_ASSOC);

foreach ($tickets as &$ticket) {
    $ticket['kg'] = floatval($ticket['kg']);
    $ticket['monto'] = floatval($ticket['monto']);
}

echo json_encode($tickets);
?>
