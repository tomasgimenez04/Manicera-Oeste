<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($metodo === 'GET') {
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
            v_movimientos.tipo,
            v_movimientos.producto,
            v_movimientos.producto_id,
            COALESCE(productos.codigo, '') AS codigo,
            v_movimientos.kg,
            v_movimientos.monto,
            v_movimientos.observacion,
            DATE_FORMAT(v_movimientos.fecha, '%d/%m/%Y') AS fecha,
            DATE_FORMAT(v_movimientos.fecha, '%H:%i') AS hora
        FROM v_movimientos
        LEFT JOIN productos ON productos.id = v_movimientos.producto_id
        WHERE DATE(v_movimientos.fecha) >= $desde
        ORDER BY v_movimientos.fecha DESC
    ";

    $resultado = $conn->query($sql);

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al consultar movimientos.']);
        exit;
    }

    $movimientos = $resultado->fetch_all(MYSQLI_ASSOC);

    foreach ($movimientos as &$movimiento) {
        $movimiento['kg'] = floatval($movimiento['kg']);
        $movimiento['monto'] = floatval($movimiento['monto']);
    }

    echo json_encode($movimientos);
    exit;
}

if ($metodo === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    $tipo = isset($body['tipo']) ? trim($body['tipo']) : '';
    $producto_id = isset($body['producto_id']) ? intval($body['producto_id']) : 0;
    $kg = isset($body['kg']) ? floatval($body['kg']) : 0;
    $monto = isset($body['monto']) ? floatval($body['monto']) : 0;
    $observacion = isset($body['observacion']) ? trim($body['observacion']) : null;

    if (!in_array($tipo, ['venta', 'compra'], true)) {
        http_response_code(400);
        echo json_encode(['error' => "El tipo debe ser 'venta' o 'compra'."]);
        exit;
    }

    if ($producto_id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Producto invalido.']);
        exit;
    }

    if ($kg <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'La cantidad en kg debe ser mayor a 0.']);
        exit;
    }

    if ($monto <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'El monto debe ser mayor a 0.']);
        exit;
    }

    $stmt = $conn->prepare('
        INSERT INTO movimientos (tipo, producto_id, kg, monto, observacion)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->bind_param('sidds', $tipo, $producto_id, $kg, $monto, $observacion);

    if ($stmt->execute()) {
        echo json_encode([
            'ok' => true,
            'id' => $conn->insert_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo guardar el movimiento.']);
    }

    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Metodo no permitido.']);
?>
