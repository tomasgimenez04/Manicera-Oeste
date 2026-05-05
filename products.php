<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($metodo === 'GET') {
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
    }

    echo json_encode($productos);
    exit;
}

if ($metodo === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $nombre = isset($body['nombre']) ? trim($body['nombre']) : '';
    $codigo = isset($body['codigo']) ? trim($body['codigo']) : '';
    $unidad_medida = isset($body['unidad_medida']) ? trim($body['unidad_medida']) : 'kg';

    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre del producto no puede estar vacio.']);
        exit;
    }

    if ($codigo === '') {
        http_response_code(400);
        echo json_encode(['error' => 'El codigo del producto es obligatorio.']);
        exit;
    }

    if (!in_array($unidad_medida, ['kg', 'unidad'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'La unidad de medida debe ser "kg" o "unidad".']);
        exit;
    }

    $stmt = $conn->prepare('SELECT id FROM productos WHERE nombre = ? AND activo = 1');
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
        echo json_encode(['error' => 'Ya existe un producto con ese codigo.']);
        $stmt->close();
        exit;
    }

    $stmt->close();

    $stmt = $conn->prepare('INSERT INTO productos (nombre, codigo, unidad_medida) VALUES (?, ?, ?)');
    $stmt->bind_param('sss', $nombre, $codigo, $unidad_medida);

    if ($stmt->execute()) {
        echo json_encode([
            'ok' => true,
            'id' => $conn->insert_id,
            'nombre' => $nombre,
            'codigo' => $codigo,
            'unidad_medida' => $unidad_medida
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo guardar el producto: ' . $stmt->error]);
    }

    $stmt->close();
    exit;
}

if ($metodo === 'DELETE') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = isset($body['id']) ? intval($body['id']) : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de producto invalido.']);
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
echo json_encode(['error' => 'Metodo no permitido.']);
?>
