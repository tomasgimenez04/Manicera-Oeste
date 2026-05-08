<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    $resultado = $conn->query("
        SELECT
            productos.id,
            productos.nombre,
            COALESCE(productos.codigo, '') AS codigo,
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
        WHERE productos.activo = 1
        GROUP BY productos.id, productos.nombre, productos.codigo, productos.unidad_medida, productos.precio_unitario, productos.stock_base
        ORDER BY productos.nombre ASC
    ");

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al consultar productos.']);
        exit;
    }

    $productos = $resultado->fetch_all(MYSQLI_ASSOC);

    foreach ($productos as &$producto) {
        $producto['stock_cantidad'] = floatval($producto['stock_cantidad']);
        $producto['precio_unitario'] = floatval($producto['precio_unitario']);
    }

    echo json_encode($productos);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $nombre = isset($body['nombre']) ? trim($body['nombre']) : '';
    $codigo = isset($body['codigo']) ? trim($body['codigo']) : '';
    $unidadMedida = isset($body['unidad_medida']) ? trim($body['unidad_medida']) : 'kg';
    $stockActual = isset($body['stock_actual']) ? floatval($body['stock_actual']) : 0;
    $precioUnitario = isset($body['precio_unitario']) ? floatval($body['precio_unitario']) : 0;

    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre del producto no puede estar vacío.']);
        exit;
    }

    if ($codigo === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El código del producto es obligatorio.']);
        exit;
    }

    if (!in_array($unidadMedida, ['kg', 'unidad', 'bandeja'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'La unidad de medida debe ser "kg", "unidad" o "bandeja".']);
        exit;
    }

    if (in_array($unidadMedida, ['unidad', 'bandeja'], true) && floor($stockActual) != $stockActual) {
        http_response_code(400);
        echo json_encode(['error' => 'El stock debe ser entero para esa unidad de medida.']);
        exit;
    }

    if ($precioUnitario < 0) {
        http_response_code(400);
        echo json_encode(['error' => 'El precio debe ser mayor o igual a 0.']);
        exit;
    }

    $stmt = $conn->prepare('SELECT id FROM productos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) AND activo = 1');
    $stmt->bind_param('s', $nombre);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Ya existe un producto con ese nombre.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare('SELECT id FROM productos WHERE codigo = ? AND activo = 1');
    $stmt->bind_param('s', $codigo);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Ya existe un producto con ese código.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare('
        INSERT INTO productos (nombre, codigo, unidad_medida, stock_base, precio_unitario)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->bind_param('sssdd', $nombre, $codigo, $unidadMedida, $stockActual, $precioUnitario);

    if ($stmt->execute()) {
        echo json_encode([
            'ok' => true,
            'id' => intval($conn->insert_id),
            'nombre' => $nombre,
            'codigo' => $codigo,
            'unidad_medida' => $unidadMedida,
            'stock_actual' => $stockActual,
            'precio_unitario' => $precioUnitario
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo guardar el producto: ' . $stmt->error]);
    }

    $stmt->close();
    exit;
}

if ($method === 'PUT') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = isset($body['id']) ? intval($body['id']) : 0;
    $nombre = isset($body['nombre']) ? trim($body['nombre']) : '';
    $codigo = isset($body['codigo']) ? trim($body['codigo']) : '';
    $unidadMedida = isset($body['unidad_medida']) ? trim($body['unidad_medida']) : 'kg';
    $stockActual = isset($body['stock_actual']) ? floatval($body['stock_actual']) : 0;
    $precioUnitario = isset($body['precio_unitario']) ? floatval($body['precio_unitario']) : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de producto inválido.']);
        exit;
    }

    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre del producto no puede estar vacío.']);
        exit;
    }

    if ($codigo === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El código del producto es obligatorio.']);
        exit;
    }

    if (!in_array($unidadMedida, ['kg', 'unidad', 'bandeja'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'La unidad de medida debe ser "kg", "unidad" o "bandeja".']);
        exit;
    }

    if (in_array($unidadMedida, ['unidad', 'bandeja'], true) && floor($stockActual) != $stockActual) {
        http_response_code(400);
        echo json_encode(['error' => 'El stock debe ser entero para esa unidad de medida.']);
        exit;
    }

    if ($precioUnitario < 0) {
        http_response_code(400);
        echo json_encode(['error' => 'El precio debe ser mayor o igual a 0.']);
        exit;
    }

    $stmt = $conn->prepare('SELECT id FROM productos WHERE id = ? AND activo = 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'El producto no existe o ya fue eliminado.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare("
        SELECT
            productos.id,
            COALESCE(SUM(
                CASE
                    WHEN movimientos.tipo = 'compra' THEN movimientos.cantidad
                    WHEN movimientos.tipo = 'venta' THEN -movimientos.cantidad
                    ELSE 0
                END
            ), 0) AS movimientos_delta
        FROM productos
        LEFT JOIN movimientos ON movimientos.producto_id = productos.id
        WHERE productos.id = ? AND productos.activo = 1
        GROUP BY productos.id
    ");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $resultadoStock = $stmt->get_result();
    $stockInfo = $resultadoStock ? $resultadoStock->fetch_assoc() : null;
    $stmt->close();

    if (!$stockInfo) {
        http_response_code(404);
        echo json_encode(['error' => 'No se pudo calcular el stock actual del producto.']);
        exit;
    }

    $movimientosDelta = floatval($stockInfo['movimientos_delta']);
    $stockBase = $stockActual - $movimientosDelta;

    $stmt = $conn->prepare('SELECT id FROM productos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) AND activo = 1 AND id <> ?');
    $stmt->bind_param('si', $nombre, $id);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Ya existe un producto con ese nombre.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare('SELECT id FROM productos WHERE codigo = ? AND activo = 1 AND id <> ?');
    $stmt->bind_param('si', $codigo, $id);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Ya existe un producto con ese código.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare('
        UPDATE productos
        SET nombre = ?, codigo = ?, unidad_medida = ?, stock_base = ?, precio_unitario = ?
        WHERE id = ? AND activo = 1
    ');
    $stmt->bind_param('sssddi', $nombre, $codigo, $unidadMedida, $stockBase, $precioUnitario, $id);

    if ($stmt->execute()) {
        echo json_encode([
            'ok' => true,
            'id' => $id,
            'nombre' => $nombre,
            'codigo' => $codigo,
            'unidad_medida' => $unidadMedida,
            'stock_actual' => $stockActual,
            'precio_unitario' => $precioUnitario
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo actualizar el producto.']);
    }

    $stmt->close();
    exit;
}

if ($method === 'DELETE') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = isset($body['id']) ? intval($body['id']) : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de producto inválido.']);
        exit;
    }

    $stmt = $conn->prepare('UPDATE productos SET activo = 0 WHERE id = ?');
    $stmt->bind_param('i', $id);

    if ($stmt->execute()) {
        echo json_encode(['ok' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo desactivar el producto.']);
    }

    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método no permitido.']);
?>
