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
    $resultado = $conn->query("SELECT id, nombre, COALESCE(codigo, '') AS codigo FROM productos WHERE activo = 1 ORDER BY nombre ASC");

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al consultar productos.']);
        exit;
    }

    echo json_encode($resultado->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($metodo === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $nombre = isset($body['nombre']) ? trim($body['nombre']) : '';
    $codigo = isset($body['codigo']) ? trim($body['codigo']) : '';

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

    $stmt = $conn->prepare('INSERT INTO productos (nombre, codigo) VALUES (?, ?)');
    $stmt->bind_param('ss', $nombre, $codigo);

    if ($stmt->execute()) {
        echo json_encode([
            'ok' => true,
            'id' => $conn->insert_id,
            'nombre' => $nombre,
            'codigo' => $codigo
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
