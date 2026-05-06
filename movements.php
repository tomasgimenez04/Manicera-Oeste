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
            movimientos.id,
            movimientos.tipo,
            COALESCE(productos.nombre, '') AS producto,
            movimientos.producto_id,
            COALESCE(productos.codigo, '') AS codigo,
            COALESCE(productos.unidad_medida, 'kg') AS unidad_medida,
            movimientos.cantidad,
            movimientos.monto,
            movimientos.observacion,
            DATE_FORMAT(movimientos.fecha, '%d/%m/%Y') AS fecha,
            DATE_FORMAT(movimientos.fecha, '%H:%i') AS hora
        FROM movimientos
        LEFT JOIN productos ON productos.id = movimientos.producto_id
        WHERE DATE(movimientos.fecha) >= $desde
        ORDER BY movimientos.fecha DESC
    ";

    $resultado = $conn->query($sql);

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al consultar movimientos.']);
        exit;
    }

    $movimientos = $resultado->fetch_all(MYSQLI_ASSOC);

    foreach ($movimientos as &$movimiento) {
        $movimiento['cantidad'] = floatval($movimiento['cantidad']);
        $movimiento['monto'] = floatval($movimiento['monto']);
    }

    echo json_encode($movimientos);
    exit;
}

if ($metodo === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    $tipo = isset($body['tipo']) ? trim($body['tipo']) : '';
    $producto_id = isset($body['producto_id']) ? intval($body['producto_id']) : 0;
    $cantidad = isset($body['cantidad']) ? floatval($body['cantidad']) : (isset($body['kg']) ? floatval($body['kg']) : 0);
    $monto = isset($body['monto']) ? floatval($body['monto']) : 0;
    $observacion = isset($body['observacion']) ? trim($body['observacion']) : null;

    if (!in_array($tipo, ['venta', 'compra', 'ingreso', 'egreso'], true)) {
        http_response_code(400);
        echo json_encode(['error' => "El tipo debe ser 'venta', 'compra', 'ingreso' o 'egreso'."]);
        exit;
    }

    $requiereProducto = $tipo === 'venta' || $tipo === 'compra';

    if ($requiereProducto && $producto_id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Producto inválido.']);
        exit;
    }

    if ($requiereProducto && $cantidad <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'La cantidad debe ser mayor a 0.']);
        exit;
    }

    if (!$requiereProducto && $observacion === '') {
        http_response_code(400);
        echo json_encode(['error' => 'La descripción es obligatoria.']);
        exit;
    }

    if ($tipo === 'venta' && $monto <= 0) {
        $stmtPrecio = $conn->prepare('SELECT COALESCE(precio_unitario, 0) AS precio_unitario FROM productos WHERE id = ? AND activo = 1');
        $stmtPrecio->bind_param('i', $producto_id);
        $stmtPrecio->execute();
        $resultadoPrecio = $stmtPrecio->get_result();
        $producto = $resultadoPrecio ? $resultadoPrecio->fetch_assoc() : null;
        $stmtPrecio->close();

        if ($producto) {
            $precio_unitario = floatval($producto['precio_unitario']);

            if ($precio_unitario > 0) {
                $monto = round($cantidad * $precio_unitario, 2);
            }
        }
    }

    if ($monto <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'El monto debe ser mayor a 0.']);
        exit;
    }

    if ($requiereProducto) {
        $stmt = $conn->prepare('
            INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->bind_param('sidds', $tipo, $producto_id, $cantidad, $monto, $observacion);
    } else {
        $stmt = $conn->prepare('
            INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
            VALUES (?, NULL, NULL, ?, ?)
        ');
        $stmt->bind_param('sds', $tipo, $monto, $observacion);
    }

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
echo json_encode(['error' => 'Método no permitido.']);
?>
