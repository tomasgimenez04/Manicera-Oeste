// ─────────────────────────────────────────────
// logic.js
// Lógica principal de la app.
// Se comunica con el backend PHP via fetch().
// ─────────────────────────────────────────────

const API = {
    productos:   'productos.php',
    movimientos: 'movimientos.php',
    stock:       'stock.php'
};

// ─────────────────────────────────────────────
// Estado global
// ─────────────────────────────────────────────
let productos    = [];
let filtroActual = 'dia';

// ─────────────────────────────────────────────
// Fecha en el header
// ─────────────────────────────────────────────
const hoy = new Date();
document.getElementById('fecha-hoy').textContent =
    hoy.toLocaleDateString('es-AR', {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric'
    });

// ─────────────────────────────────────────────
// Toast de feedback
// ─────────────────────────────────────────────
function showToast(msg, tipo) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast show ' + tipo;
    setTimeout(() => { t.className = 'toast'; }, 2500);
}

// ─────────────────────────────────────────────
// Formateo de moneda
// ─────────────────────────────────────────────
function fmt(n) {
    return '$' + Math.round(n).toLocaleString('es-AR');
}

// ─────────────────────────────────────────────
// EVENT LISTENERS — se conectan al cargar la página
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.section;
            showSection(seccion, btn);
        });
    });

    // Filtros de balance
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filtro = btn.dataset.filter;
            setFiltro(filtro, btn);
        });
    });

    // Botones de registrar venta/compra
    document.querySelectorAll('[data-register]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.register;
            registrar(tipo);
        });
    });

    // Botón agregar producto
    document.getElementById('btn-agregar-producto').addEventListener('click', agregarProducto);

    // Cargar datos iniciales
    cargarInicio();
    cargarProductosEnSelects();
});

// ─────────────────────────────────────────────
// Navegación entre secciones
// ─────────────────────────────────────────────
function showSection(id, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');

    if (id === 'inicio')    cargarInicio();
    if (id === 'registrar') cargarProductosEnSelects();
    if (id === 'balance')   cargarBalance();
    if (id === 'stock')     cargarStock();
    if (id === 'productos') cargarProductos();
}

// ─────────────────────────────────────────────
// PRODUCTOS — cargar en los <select> del form
// ─────────────────────────────────────────────
async function cargarProductosEnSelects() {
    try {
        const res = await fetch(API.productos);
        productos = await res.json();

        ['v-producto', 'c-producto'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = productos.map(p =>
                `<option value="${p.id}">${p.nombre}</option>`
            ).join('');
        });

    } catch (err) {
        showToast('Error al cargar productos.', 'error');
    }
}

// ─────────────────────────────────────────────
// REGISTRAR movimiento (venta o compra)
// ─────────────────────────────────────────────
async function registrar(tipo) {
    const p           = tipo === 'venta' ? 'v' : 'c';
    const producto_id = parseInt(document.getElementById(p + '-producto').value);
    const kg          = parseFloat(document.getElementById(p + '-kg').value)    || 0;
    const monto       = parseFloat(document.getElementById(p + '-monto').value) || 0;
    const observacion = document.getElementById(p + '-obs').value.trim();

    if (kg <= 0 || monto <= 0) {
        showToast('Completá cantidad y monto.', 'error');
        return;
    }

    try {
        const res  = await fetch(API.movimientos, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ tipo, producto_id, kg, monto, observacion })
        });

        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        document.getElementById(p + '-kg').value    = '';
        document.getElementById(p + '-monto').value = '';
        document.getElementById(p + '-obs').value   = '';

        showToast(
            tipo === 'venta' ? '✓ Venta registrada' : '✓ Compra registrada',
            tipo
        );

    } catch (err) {
        showToast('Error al guardar. Revisá la conexión.', 'error');
    }
}

// ─────────────────────────────────────────────
// INICIO — resumen del día
// ─────────────────────────────────────────────
async function cargarInicio() {
    try {
        const res = await fetch(API.movimientos + '?filtro=dia');
        const mov = await res.json();

        const ing = mov.filter(m => m.tipo === 'venta') .reduce((s, m) => s + m.monto, 0);
        const egr = mov.filter(m => m.tipo === 'compra').reduce((s, m) => s + m.monto, 0);
        const bal = ing - egr;

        document.getElementById('stat-ingresos').textContent = fmt(ing);
        document.getElementById('stat-egresos').textContent  = fmt(egr);

        const balEl       = document.getElementById('stat-balance');
        balEl.textContent = fmt(bal);
        balEl.style.color = bal >= 0 ? 'var(--blue)' : 'var(--red)';

        const tbody  = document.getElementById('tabla-inicio');
        const recien = mov.slice(0, 10);

        if (!recien.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">Aún no hay movimientos hoy.</td></tr>';
            return;
        }

        tbody.innerHTML = recien.map(m => `
            <tr>
                <td><span class="badge badge-${m.tipo}">${m.tipo === 'venta' ? 'Venta' : 'Compra'}</span></td>
                <td>${m.producto}</td>
                <td>${m.kg} kg</td>
                <td class="${m.tipo === 'venta' ? 'amount-pos' : 'amount-neg'}">
                    ${m.tipo === 'venta' ? '+' : '-'}${fmt(m.monto)}
                </td>
                <td style="color: var(--text-hint)">${m.hora}</td>
            </tr>`).join('');

    } catch (err) {
        showToast('Error al cargar movimientos.', 'error');
    }
}

// ─────────────────────────────────────────────
// BALANCE — con filtro dia/semana/mes
// ─────────────────────────────────────────────
function setFiltro(filtro, btn) {
    filtroActual = filtro;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cargarBalance();
}

async function cargarBalance() {
    try {
        const res = await fetch(API.movimientos + '?filtro=' + filtroActual);
        const mov = await res.json();

        const ing = mov.filter(m => m.tipo === 'venta') .reduce((s, m) => s + m.monto, 0);
        const egr = mov.filter(m => m.tipo === 'compra').reduce((s, m) => s + m.monto, 0);
        const bal = ing - egr;

        document.getElementById('b-ingresos').textContent = fmt(ing);
        document.getElementById('b-egresos').textContent  = fmt(egr);
        document.getElementById('b-count').textContent    = mov.length;

        const el       = document.getElementById('b-total');
        el.textContent = (bal >= 0 ? '+' : '') + fmt(bal);
        el.className   = 'bl-value ' + (bal >= 0 ? 'positivo' : 'negativo');

        const tbody = document.getElementById('tabla-balance');

        if (!mov.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin movimientos en este período.</td></tr>';
            return;
        }

        tbody.innerHTML = mov.map(m => `
            <tr>
                <td>${m.fecha}</td>
                <td style="color: var(--text-hint)">${m.hora}</td>
                <td><span class="badge badge-${m.tipo}">${m.tipo === 'venta' ? 'Venta' : 'Compra'}</span></td>
                <td>${m.producto}</td>
                <td>${m.kg} kg</td>
                <td class="${m.tipo === 'venta' ? 'amount-pos' : 'amount-neg'}">
                    ${m.tipo === 'venta' ? '+' : '-'}${fmt(m.monto)}
                </td>
            </tr>`).join('');

    } catch (err) {
        showToast('Error al cargar balance.', 'error');
    }
}

// ─────────────────────────────────────────────
// STOCK — calculado desde v_stock
// ─────────────────────────────────────────────
async function cargarStock() {
    try {
        const res   = await fetch(API.stock);
        const stock = await res.json();

        const lista = document.getElementById('stock-lista');

        if (!stock.length) {
            lista.innerHTML = '<p class="empty">Sin datos de stock aún.</p>';
            return;
        }

        lista.innerHTML = stock.map(s => {
            const alerta = s.stock_kg < 5;
            return `
                <div class="stock-row">
                    <span class="stock-nombre">${s.nombre}</span>
                    <span class="stock-kg ${alerta ? 'alerta' : ''}">
                        ${parseFloat(s.stock_kg).toFixed(1)} kg
                        ${alerta ? '<span class="stock-tag">stock bajo</span>' : ''}
                    </span>
                </div>`;
        }).join('');

    } catch (err) {
        showToast('Error al cargar stock.', 'error');
    }
}

// ─────────────────────────────────────────────
// PRODUCTOS — ABM
// ─────────────────────────────────────────────
async function cargarProductos() {
    try {
        const res = await fetch(API.productos);
        productos = await res.json();

        const lista = document.getElementById('productos-lista');

        if (!productos.length) {
            lista.innerHTML = '<p class="empty">No hay productos cargados.</p>';
            return;
        }

        lista.innerHTML = productos.map(p => `
            <div class="stock-row">
                <span class="stock-nombre">${p.nombre}</span>
                <button class="btn btn-outline" style="font-size:12px; padding: 4px 10px;"
                    data-eliminar-id="${p.id}" data-eliminar-nombre="${p.nombre}">
                    Eliminar
                </button>
            </div>`).join('');

        // Agregar listeners a los botones de eliminar recién creados
        document.querySelectorAll('[data-eliminar-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                eliminarProducto(btn.dataset.eliminarId, btn.dataset.eliminarNombre);
            });
        });

    } catch (err) {
        showToast('Error al cargar productos.', 'error');
    }
}

async function agregarProducto() {
    const input  = document.getElementById('nuevo-producto');
    const nombre = input.value.trim();

    if (!nombre) {
        showToast('Escribí el nombre del producto.', 'error');
        return;
    }

    try {
        const res  = await fetch(API.productos, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ nombre })
        });

        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        input.value = '';
        showToast('✓ Producto agregado.', 'venta');
        cargarProductos();

    } catch (err) {
        showToast('Error al agregar producto.', 'error');
    }
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"? Los movimientos históricos no se borran.`)) return;

    try {
        const res  = await fetch(API.productos, {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: parseInt(id) })
        });

        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        showToast('✓ Producto eliminado.', 'venta');
        cargarProductos();

    } catch (err) {
        showToast('Error al eliminar producto.', 'error');
    }
}
