<?php

// ─────────────────────────────────────────────
// movements.php
// GET  → lista movimientos (filtro: dia, semana, mes)
// POST → guarda una venta o compra nueva
// ─────────────────────────────────────────────

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type");

include 'connection.php';

$metodo = $_SERVER['REQUEST_METHOD'];

// ─────────────────────────────────────────────
// GET — listar movimientos con filtro de fecha
// Uso: fetch('movimientos.php?filtro=dia')
//      fetch('movimientos.php?filtro=semana')
//      fetch('movimientos.php?filtro=mes')
//      fetch('movimientos.php')  → devuelve todos
// ─────────────────────────────────────────────
if ($metodo === 'GET') {

    $filtro = isset($_GET['filtro']) ? $_GET['filtro'] : 'dia';

    // Definir el rango de fechas según el filtro
    switch ($filtro) {
        case 'semana':
            $desde = "DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
            break;
        case 'mes':
            $desde = "DATE_FORMAT(NOW(), '%Y-%m-01')";
            break;
        case 'dia':
        default:
            $desde = "CURDATE()";
            break;
    }

    // Usamos la vista v_movimientos para traer el nombre del producto ya incluido
    $sql = "
        SELECT
            id,
            tipo,
            producto,
            producto_id,
            kg,
            monto,
            observacion,
            DATE_FORMAT(fecha, '%d/%m/%Y') AS fecha,
            DATE_FORMAT(fecha, '%H:%i')    AS hora
        FROM v_movimientos
        WHERE DATE(fecha) >= $desde
        ORDER BY fecha DESC
    ";

    $resultado = $conn->query($sql);

    if (!$resultado) {
        http_response_code(500);
        echo json_encode(["error" => "Error al consultar movimientos."]);
        exit;
    }

    $movimientos = $resultado->fetch_all(MYSQLI_ASSOC);

    // Convertir kg y monto a números (vienen como string desde MySQL)
    foreach ($movimientos as &$m) {
        $m['kg']    = floatval($m['kg']);
        $m['monto'] = floatval($m['monto']);
    }

    echo json_encode($movimientos);
    exit;
}

// ─────────────────────────────────────────────
// POST — guardar un movimiento nuevo
// Uso: fetch('movimientos.php', {
//   method: 'POST',
//   body: JSON.stringify({
//     tipo:        'venta',       // o 'compra'
//     producto_id: 1,
//     kg:          10.5,
//     monto:       5000,
//     observacion: 'cliente mayorista'  // opcional
//   })
// })
// ─────────────────────────────────────────────
if ($metodo === 'POST') {

    $body = json_decode(file_get_contents("php://input"), true);

    // Validar campos obligatorios
    $tipo        = isset($body['tipo'])        ? trim($body['tipo'])        : '';
    $producto_id = isset($body['producto_id']) ? intval($body['producto_id']) : 0;
    $kg          = isset($body['kg'])          ? floatval($body['kg'])      : 0;
    $monto       = isset($body['monto'])       ? floatval($body['monto'])   : 0;
    $observacion = isset($body['observacion']) ? trim($body['observacion']) : null;

    if (!in_array($tipo, ['venta', 'compra'])) {
        http_response_code(400);
        echo json_encode(["error" => "El tipo debe ser 'venta' o 'compra'."]);
        exit;
    }

    if ($producto_id <= 0) {
        http_response_code(400);
        echo json_encode(["error" => "Producto inválido."]);
        exit;
    }

    if ($kg <= 0) {
        http_response_code(400);
        echo json_encode(["error" => "La cantidad en kg debe ser mayor a 0."]);
        exit;
    }

    if ($monto <= 0) {
        http_response_code(400);
        echo json_encode(["error" => "El monto debe ser mayor a 0."]);
        exit;
    }

    // Insertar el movimiento
    $stmt = $conn->prepare("
        INSERT INTO movimientos (tipo, producto_id, kg, monto, observacion)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->bind_param("sidds", $tipo, $producto_id, $kg, $monto, $observacion);

    if ($stmt->execute()) {
        echo json_encode([
            "ok" => true,
            "id" => $conn->insert_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "No se pudo guardar el movimiento."]);
    }

    $stmt->close();
    exit;
}

// Método no permitido
http_response_code(405);
echo json_encode(["error" => "Método no permitido."]);
?>