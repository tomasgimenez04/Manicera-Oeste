<?php

// ─────────────────────────────────────────────
// productos.php
// GET    → devuelve lista de productos activos
// POST   → agrega un producto nuevo
// DELETE → desactiva un producto (no lo borra)
// ─────────────────────────────────────────────

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE");
header("Access-Control-Allow-Headers: Content-Type");

include 'connection.php';

$metodo = $_SERVER['REQUEST_METHOD'];

// ─────────────────────────────────────────────
// GET — listar productos activos
// Uso: fetch('productos.php')
// ─────────────────────────────────────────────
if ($metodo === 'GET') {

    $resultado = $conn->query("SELECT id, nombre FROM productos WHERE activo = 1 ORDER BY nombre ASC");

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(["error" => "Error al consultar productos."]);
        exit;
    }

    $productos = $resultado->fetch_all(MYSQLI_ASSOC);
    echo json_encode($productos);
    exit;
}

// ─────────────────────────────────────────────
// POST — agregar producto nuevo
// Uso: fetch('productos.php', { method: 'POST', body: JSON.stringify({ nombre: 'Maní hervido' }) })
// ─────────────────────────────────────────────
if ($metodo === 'POST') {

    $body   = json_decode(file_get_contents("php://input"), true);
    $nombre = isset($body['nombre']) ? trim($body['nombre']) : '';

    if (empty($nombre)) {
        http_response_code(400);
        echo json_encode(["error" => "El nombre del producto no puede estar vacío."]);
        exit;
    }

    // Verificar que no exista ya un producto con ese nombre
    $stmt = $conn->prepare("SELECT id FROM productos WHERE nombre = ? AND activo = 1");
    $stmt->bind_param("s", $nombre);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(400);
        echo json_encode(["error" => "Ya existe un producto con ese nombre."]);
        $stmt->close();
        exit;
    }
    $stmt->close();

    // Insertar el producto nuevo
    $stmt = $conn->prepare("INSERT INTO productos (nombre) VALUES (?)");
    $stmt->bind_param("s", $nombre);

    if ($stmt->execute()) {
        echo json_encode([
            "ok"     => true,
            "id"     => $conn->insert_id,
            "nombre" => $nombre
        ]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "No se pudo guardar el producto."]);
    }

    $stmt->close();
    exit;
}

// ─────────────────────────────────────────────
// DELETE — desactivar producto
// Uso: fetch('productos.php', { method: 'DELETE', body: JSON.stringify({ id: 3 }) })
// ─────────────────────────────────────────────
if ($metodo === 'DELETE') {

    $body = json_decode(file_get_contents("php://input"), true);
    $id   = isset($body['id']) ? intval($body['id']) : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(["error" => "ID de producto inválido."]);
        exit;
    }

    // Marcar como inactivo en lugar de borrar
    // así los movimientos históricos siguen teniendo referencia al producto
    $stmt = $conn->prepare("UPDATE productos SET activo = 0 WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(["ok" => true]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "No se pudo desactivar el producto."]);
    }

    $stmt->close();
    exit;
}

// Método no permitido
http_response_code(405);
echo json_encode(["error" => "Método no permitido."]);
?>