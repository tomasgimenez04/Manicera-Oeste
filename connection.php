<?php

$host = 'localhost';
$usuario = 'root';
$password = '';
$base = 'manicera_oeste';

$conn = new mysqli($host, $usuario, $password, $base);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Conexion fallida: ' . $conn->connect_error]);
    exit;
}

$conn->set_charset('utf8mb4');
?>
