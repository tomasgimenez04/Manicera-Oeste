# Manicera Oeste - Sistema de Caja e Inventario

Sistema web local desarrollado para administrar la caja, el stock y la facturación interna de una manicera/distribuidora. Permite registrar ventas, compras, ingresos, egresos, productos, cuentas corrientes, sueldos y comprobantes desde una interfaz simple pensada para uso diario.

## Descripción general

**Manicera Oeste** es una aplicación web hecha con HTML, CSS, JavaScript, PHP y MySQL. Está pensada para ejecutarse de forma local con XAMPP y centralizar la gestión básica de un negocio: movimientos de caja, control de inventario, balance económico y generación de comprobantes.

El sistema trabaja con productos vendidos por **kg**, **unidad** o **bandeja**, calcula stock automáticamente a partir de compras y ventas, y permite visualizar balances por día, semana o mes.

## Funcionalidades principales

- Registro de ventas por producto, cantidad y monto.
- Registro de compras para actualizar caja y stock.
- Registro de otros ingresos y otros egresos.
- Balance económico diario, semanal y mensual.
- Control automático de stock según movimientos.
- ABM de productos con código, unidad de medida, precio y stock.
- Baja lógica de productos para no perder historial.
- Soporte para productos por kg, unidad o bandeja.
- Validación de stock antes de registrar ventas.
- Cálculo automático del monto de venta según precio unitario.
- Facturación interna y generación de comprobantes en PDF.
- Gestión de cuenta corriente.
- Gestión de sueldos y pagos recurrentes.
- Búsqueda, paginación y visualización ordenada de datos.
- Interfaz responsive para facilitar el uso en distintos tamaños de pantalla.

## Tecnologías utilizadas

- **HTML5**: estructura de la interfaz.
- **CSS3**: estilos visuales y diseño responsive.
- **JavaScript**: lógica del frontend, eventos, renderizado y conexión con APIs.
- **PHP**: endpoints backend y conexión con la base de datos.
- **MySQL**: persistencia de productos, movimientos, facturas y registros administrativos.
- **XAMPP**: entorno local con Apache y MySQL.
- **jsPDF**: generación de comprobantes PDF desde el navegador.

## Estructura del proyecto

```text
Manicera-Oeste/
├── index.html          # Interfaz principal del sistema
├── style.css           # Estilos generales y responsive
├── logic.js            # Lógica del frontend y llamadas a la API
├── connection.php      # Conexión a la base de datos MySQL
├── products.php        # API de productos
├── movements.php       # API de ventas, compras, ingresos y egresos
├── stock.php           # API de consulta de stock
├── invoices.php        # API de facturas internas
├── salaries.php        # API de sueldos
├── accounts.php        # API de cuentas corrientes
├── invoices.sql        # Script SQL relacionado con facturación
├── test.php            # Prueba simple de conexión
└── Imagenes/           # Logos e imágenes usadas por el sistema
```

## Módulos del sistema

### Inicio

Panel principal para registrar movimientos diarios:

- Ventas.
- Compras.
- Otros ingresos.
- Otros egresos.

### Balance

Permite consultar el resultado económico del negocio según el período seleccionado:

- Día.
- Semana.
- Mes.

El balance se calcula a partir de los movimientos registrados en la base de datos.

### Facturación

Módulo destinado a generar comprobantes internos a partir de ventas registradas. Utiliza jsPDF para crear archivos PDF desde el navegador.

### Cuenta corriente

Permite registrar y consultar operaciones pendientes de cobro o pagos asociados a clientes/proveedores.

### Sueldos

Módulo para registrar pagos de personal o trabajos eventuales. Soporta distintos tipos de pago:

- Único.
- Diario.
- Semanal.
- Quincenal.
- Mensual.

### Inventario

Incluye dos secciones principales:

- **Stock**: consulta de cantidades disponibles.
- **Productos**: alta, edición y baja lógica de productos.

## Base de datos

La aplicación utiliza una base de datos MySQL llamada:

```sql
manicera_oeste
```

La configuración de conexión se encuentra en `connection.php`:

```php
$host = 'localhost';
$usuario = 'root';
$password = '';
$base = 'manicera_oeste';
```

Tablas principales utilizadas por el sistema:

- `productos`
- `movimientos`
- `facturas`
- tablas relacionadas con sueldos y cuentas corrientes

Campos importantes usados por la aplicación:

- `productos.nombre`
- `productos.codigo`
- `productos.unidad_medida`
- `productos.precio_unitario`
- `productos.stock_base`
- `productos.activo`
- `movimientos.tipo`
- `movimientos.producto_id`
- `movimientos.cantidad`
- `movimientos.monto`
- `movimientos.observacion`
- `movimientos.fecha`

## Instalación y ejecución local

### 1. Clonar el repositorio

```bash
git clone https://github.com/tomasgimenez04/Manicera-Oeste.git
```

### 2. Mover el proyecto a XAMPP

Copiar la carpeta del proyecto dentro de:

```text
C:/xampp/htdocs/
```

Ejemplo:

```text
C:/xampp/htdocs/Manicera-Oeste/
```

### 3. Iniciar servicios

Desde el panel de XAMPP, iniciar:

- Apache
- MySQL

### 4. Crear la base de datos

Entrar a phpMyAdmin y crear una base de datos llamada:

```sql
manicera_oeste
```

Luego importar los scripts SQL correspondientes del proyecto, si están disponibles.

### 5. Revisar la conexión

Verificar que `connection.php` tenga los datos correctos para el entorno local:

```php
$host = 'localhost';
$usuario = 'root';
$password = '';
$base = 'manicera_oeste';
```

### 6. Abrir la aplicación

Desde el navegador:

```text
http://localhost/Manicera-Oeste/
```

Si la carpeta se renombra, cambiar la URL según el nombre utilizado dentro de `htdocs`.

## APIs principales

| Archivo | Responsabilidad |
|---|---|
| `products.php` | Listar, crear, editar y desactivar productos |
| `movements.php` | Registrar y consultar ventas, compras, ingresos y egresos |
| `stock.php` | Consultar el stock actual |
| `invoices.php` | Guardar y consultar facturas internas |
| `salaries.php` | Gestionar sueldos y pagos |
| `accounts.php` | Gestionar cuentas corrientes |

## Flujo de funcionamiento

1. El usuario interactúa con la interfaz desde `index.html`.
2. `style.css` define el diseño visual de la aplicación.
3. `logic.js` maneja eventos, validaciones, renderizados y peticiones `fetch`.
4. Los archivos PHP reciben las peticiones y responden en formato JSON.
5. MySQL almacena productos, movimientos, facturas y registros administrativos.
6. El stock y el balance se actualizan en función de los movimientos registrados.

## Consideraciones importantes

- El sistema está pensado para uso local.
- No requiere instalación de dependencias con npm.
- Para funcionar correctamente necesita Apache, PHP y MySQL.
- Las ventas descuentan stock automáticamente.
- Las compras aumentan stock automáticamente.
- Los ingresos y egresos generales afectan el balance, pero no modifican stock.
- Los productos desactivados no se muestran como activos, pero su historial puede conservarse.

## Posibles mejoras futuras

- Sistema de usuarios y login.
- Roles y permisos.
- Exportación de reportes a Excel.
- Backup automático de base de datos.
- Historial avanzado por cliente o proveedor.
- Filtros por rango personalizado de fechas.
- Panel de métricas con gráficos.
- Deploy en servidor web.

## Autor

Proyecto desarrollado por **Tomás Giménez**.

## Estado del proyecto

Proyecto en desarrollo y mejora continua, orientado a resolver necesidades reales de gestión para Manicera Oeste.
