# Manicera Oeste - Sistema de Caja

Aplicacion web hecha para registrar compras, ventas, stock y tickets internos de control.

## Que hace

- Registra ventas y compras por producto
- Calcula stock automaticamente desde los movimientos
- Permite usar productos por `kg` o por `unidad`
- Muestra balance por dia, semana y mes
- Genera tickets internos para ventas

## Estructura del proyecto

Cada archivo tiene una responsabilidad concreta:

- `index.html`: estructura visual de la app, secciones, templates y modal del ticket
- `style.css`: todos los estilos de la interfaz, responsive e impresion
- `logic.js`: logica del frontend, eventos, renderizado y llamadas a la API
- `connection.php`: conexion a MySQL
- `products.php`: API para listar, crear y desactivar productos
- `movements.php`: API para registrar y consultar movimientos
- `stock.php`: API para consultar stock actual
- `tickets.php`: API para listar tickets de ventas
- `test.php`: chequeo simple de conexion

## Base de datos esperada

Tablas principales:

- `productos`
- `movimientos`

Campos importantes usados por la app:

- `productos.unidad_medida`
- `movimientos.cantidad`

## Flujo general

1. `index.html` carga la interfaz
2. `style.css` aplica el diseno
3. `logic.js` conecta botones, formularios y tablas
4. Los archivos PHP responden en JSON
5. MySQL guarda productos y movimientos

## Ejecutar en local

1. Iniciar Apache y MySQL en XAMPP
2. Verificar la configuracion de `connection.php`
3. Abrir `http://localhost/manicera_oeste/`

## Nota de mantenimiento

Si se agrega una nueva funcionalidad:

- HTML nuevo en `index.html`
- estilos nuevos en `style.css`
- eventos, fetch y render en `logic.js`
- consultas o persistencia en el PHP que corresponda
