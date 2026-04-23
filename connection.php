<?php

// ─────────────────────────────────────────────
// connection.php
// Establece la conexión con la base de datos.
// Este archivo no hace nada solo — otros archivos
// lo incluyen con: include 'connection .php';
// ─────────────────────────────────────────────

$host     = "localhost";
$usuario  = "root";       // usuario por defecto de XAMPP
$password = "";           // contraseña vacía por defecto en XAMPP
$base     = "manicera_oeste"; // nombre de la base de datos 

$conn = new mysqli($host, $usuario, $password, $base);

// Si la conexión falla, devuelve un error en JSON y corta la ejecución
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "Conexión fallida: " . $conn->connect_error]);
    exit;
}

// Para que MySQL devuelva bien los acentos y caracteres especiales
$conn->set_charset("utf8mb4");

?>