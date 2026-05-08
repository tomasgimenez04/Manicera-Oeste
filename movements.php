<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

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

function get_product_snapshot(mysqli $conn, $productoId) {
    $stmt = $conn->prepare("
        SELECT
            productos.id,
            productos.nombre,
            COALESCE(productos.unidad_medida, 'kg') AS unidad_medida,
            COALESCE(productos.precio_unitario, 0) AS precio_unitario,
            COALESCE(productos.stock_base, 0) + COALESCE(SUM(
                CASE
                    WHEN movimientos.tipo = 'compra' THEN movimientos.cantidad
                    WHEN movimientos.tipo = 'venta' THEN -movimientos.cantidad
                    ELSE 0
                END
            ), 0) AS stock_cantidad
        FROM productos
        LEFT JOIN movimientos ON movimientos.producto_id = productos.id
        WHERE productos.id = ? AND productos.activo = 1
        GROUP BY productos.id, productos.nombre, productos.unidad_medida, productos.precio_unitario, productos.stock_base
    ");
    $stmt->bind_param('i', $productoId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    $row['id'] = intval($row['id']);
    $row['precio_unitario'] = floatval($row['precio_unitario']);
    $row['stock_cantidad'] = floatval($row['stock_cantidad']);
    return $row;
}

function uses_integer_quantity($unidadMedida) {
    return $unidadMedida === 'unidad' || $unidadMedida === 'bandeja';
}

function format_quantity_label($cantidad, $unidadMedida) {
    $value = floatval($cantidad);

    if ($unidadMedida === 'kg') {
        return number_format($value, 2, ',', '.') . ' kg';
    }

    $label = $unidadMedida === 'bandeja'
        ? (abs($value) === 1.0 ? 'bandeja' : 'bandejas')
        : (abs($value) === 1.0 ? 'unidad' : 'unidades');

    return number_format($value, 0, ',', '.') . ' ' . $label;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    $filtro = isset($_GET['filtro']) ? $_GET['filtro'] : 'dia';
    $whereFecha = 'DATE(movimientos.fecha) = CURDATE()';

    switch ($filtro) {
        case 'semana':
            $whereFecha = 'YEARWEEK(movimientos.fecha, 1) = YEARWEEK(CURDATE(), 1)';
            break;
        case 'mes':
            $whereFecha = "DATE_FORMAT(movimientos.fecha, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')";
            break;
        case 'dia':
        default:
            $whereFecha = 'DATE(movimientos.fecha) = CURDATE()';
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
        WHERE $whereFecha
        ORDER BY movimientos.fecha DESC
    ";

    $resultado = $conn->query($sql);

    if (!$resultado) {
        respond_json(['error' => 'Error al consultar movimientos.'], 500);
    }

    $movimientos = $resultado->fetch_all(MYSQLI_ASSOC);

    foreach ($movimientos as &$movimiento) {
        $movimiento['cantidad'] = floatval($movimiento['cantidad']);
        $movimiento['monto'] = floatval($movimiento['monto']);
    }

    respond_json($movimientos);
}

if ($method !== 'POST') {
    respond_json(['error' => 'Método no permitido.'], 405);
}

$body = get_json_input();
$tipo = isset($body['tipo']) ? trim($body['tipo']) : '';
$productoId = isset($body['producto_id']) ? intval($body['producto_id']) : 0;
$cantidad = isset($body['cantidad']) ? floatval($body['cantidad']) : (isset($body['kg']) ? floatval($body['kg']) : 0);
$monto = isset($body['monto']) ? floatval($body['monto']) : 0;
$observacion = isset($body['observacion']) ? trim($body['observacion']) : null;

if (!in_array($tipo, ['venta', 'compra', 'ingreso', 'egreso'], true)) {
    respond_json(['error' => "El tipo debe ser 'venta', 'compra', 'ingreso' o 'egreso'."], 400);
}

$requiereProducto = $tipo === 'venta' || $tipo === 'compra';
$producto = null;

if ($requiereProducto && $productoId <= 0) {
    respond_json(['error' => 'Producto inválido.'], 400);
}

if ($requiereProducto && $cantidad <= 0) {
    respond_json(['error' => 'La cantidad debe ser mayor a 0.'], 400);
}

if (!$requiereProducto && $observacion === '') {
    respond_json(['error' => 'La descripción es obligatoria.'], 400);
}

if ($requiereProducto) {
    $producto = get_product_snapshot($conn, $productoId);

    if (!$producto) {
        respond_json(['error' => 'Producto inválido.'], 400);
    }

    if (uses_integer_quantity($producto['unidad_medida']) && floor($cantidad) != $cantidad) {
        respond_json(['error' => 'La cantidad debe ser entera para ese producto.'], 400);
    }

    if ($tipo === 'venta' && $cantidad > $producto['stock_cantidad'] + 0.00001) {
        $disponible = format_quantity_label($producto['stock_cantidad'], $producto['unidad_medida']);
        respond_json(['error' => 'Stock insuficiente para ' . $producto['nombre'] . '. Disponible: ' . $disponible . '.'], 400);
    }

    if ($tipo === 'venta' && $monto <= 0 && $producto['precio_unitario'] > 0) {
        $monto = round($cantidad * $producto['precio_unitario'], 2);
    }
}

if ($monto <= 0) {
    respond_json(['error' => 'El monto debe ser mayor a 0.'], 400);
}

$observacionValue = $observacion !== '' ? $observacion : null;

if ($requiereProducto) {
    $stmt = $conn->prepare('
        INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->bind_param('sidds', $tipo, $productoId, $cantidad, $monto, $observacionValue);
} else {
    $stmt = $conn->prepare('
        INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
        VALUES (?, NULL, NULL, ?, ?)
    ');
    $stmt->bind_param('sds', $tipo, $monto, $observacionValue);
}

if ($stmt->execute()) {
    $id = intval($conn->insert_id);
    $stmt->close();
    respond_json([
        'ok' => true,
        'id' => $id
    ]);
}

$stmt->close();
respond_json(['error' => 'No se pudo guardar el movimiento.'], 500);
?>
