<?php

// ─────────────────────────────────────────────
// stock.php
// GET → devuelve el stock actual de cada producto
//       calculado desde la vista v_stock
// ─────────────────────────────────────────────

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

include 'connection.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido."]);
    exit;
}

$resultado = $conn->query("SELECT id, nombre, stock_kg FROM v_stock ORDER BY nombre ASC");

if (!$resultado) {
    http_response_code(500);
    echo json_encode(["error" => "Error al consultar el stock."]);
    exit;
}

$stock = $resultado->fetch_all(MYSQLI_ASSOC);

// Convertir stock_kg a número
foreach ($stock as &$s) {
    $s['stock_kg'] = floatval($s['stock_kg']);
}

echo json_encode($stock);
?>