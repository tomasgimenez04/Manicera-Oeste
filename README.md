# 🥜 Manicera Oeste — Software de Gestión de Caja

Software de flujo de caja desarrollado a medida para **Manicera Oeste**, negocio mayorista de maní y derivados.

Permite registrar ventas y compras, controlar el stock en kilos y visualizar el balance de caja por día, semana o mes.

---

## ✨ Funcionalidades

- **Inicio** — Resumen del día: ingresos, egresos y balance con últimos movimientos
- **Registrar** — Carga de ventas e ingresos / compras y egresos con detalle por producto
- **Balance** — Filtros por día, semana y mes con detalle completo de movimientos
- **Stock** — Control de kilos disponibles calculado automáticamente, con alerta de stock bajo
- **Productos** — ABM de productos: agregar y eliminar sin perder historial

---

## 🛠️ Tecnologías utilizadas

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | PHP 8.x |
| Base de datos | MySQL |
| Entorno local | XAMPP |

---

## ⚙️ Instalación

### 1 — Requisitos previos
- [XAMPP](https://www.apachefriends.org) instalado (incluye Apache + MySQL + PHP)
- Cualquier navegador moderno (Chrome, Firefox, Edge)

### 2 — Clonar o copiar el proyecto

**Opción A — Clonar desde GitHub:**
```bash
cd C:\xampp\htdocs
git clone https://github.com/tomasgimenez04/Manicera-Oeste.git manicera_oeste
```

**Opción B — Copiar manualmente:**
Copiar la carpeta del proyecto dentro de:
```
C:\xampp\htdocs\manicera_oeste\
```

### 3 — Crear la base de datos

1. Iniciar **Apache** y **MySQL** desde el panel de XAMPP
2. Abrir el navegador en `http://localhost/phpmyadmin`
3. Crear una base de datos llamada `manicera_oeste`
4. Ir a la pestaña **SQL**, pegar y ejecutar el contenido del archivo `caja_mani.sql`

### 4 — Configurar la conexión

Abrir el archivo `connection.php` y verificar los datos:

```php
$host     = "localhost";
$usuario  = "root";       // usuario por defecto de XAMPP
$password = "";           // vacío por defecto en XAMPP
$base     = "manicera_oeste";
```

> En la mayoría de instalaciones de XAMPP no hay que cambiar nada.

### 5 — Abrir la aplicación

Con Apache y MySQL corriendo, abrir en el navegador:
```
http://localhost/manicera_oeste/
```

---

## 📁 Estructura del proyecto

```
manicera_oeste/
├── connection.php     → Conexión a la base de datos
├── products.php       → API: ABM de productos
├── movements.php      → API: registro y consulta de movimientos
├── stock.php          → API: stock actual por producto
├── index.html         → Interfaz principal
├── style.css          → Estilos
└── logic.js           → Lógica del frontend
```

---

## 🗄️ Base de datos

**Tablas:**
- `productos` — productos activos del negocio
- `movimientos` — registro de ventas y compras

**Vistas:**
- `v_movimientos` — movimientos con nombre de producto incluido
- `v_stock` — kilos disponibles por producto (calculado automáticamente)
- `v_balance_diario` — ingresos, egresos y balance agrupados por día

---

## 💻 Uso diario

1. Encender la PC
2. Abrir el panel de XAMPP y hacer clic en **Start** en Apache y MySQL
3. Abrir el navegador en `http://localhost/manicera_oeste/`



