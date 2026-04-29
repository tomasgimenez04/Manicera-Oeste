const APP_BASE = (() => {
    if (window.location.protocol === 'file:') {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const projectDir = parts.length >= 2 ? parts[parts.length - 2] : 'manicera_oeste';
        return `http://localhost/${projectDir}/`;
    }

    return new URL('./', window.location.href).href;
})();

const API = {
    productos: new URL('products.php', APP_BASE).href,
    movimientos: new URL('movements.php', APP_BASE).href,
    stock: new URL('stock.php', APP_BASE).href
};

let productos = [];
let filtroActual = 'dia';

const hoy = new Date();
document.getElementById('fecha-hoy').textContent = hoy.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
});

function showToast(msg, tipo) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${tipo}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 2500);
}

function fmt(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error(`La respuesta de ${url} no es JSON valido.`);
        }
    }

    if (!response.ok) {
        const message = data && data.error ? data.error : `HTTP ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function ensureArray(data) {
    return Array.isArray(data) ? data : [];
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            showSection(btn.dataset.section, btn);
        });
    });

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            setFiltro(btn.dataset.filter, btn);
        });
    });

    document.querySelectorAll('[data-register]').forEach((btn) => {
        btn.addEventListener('click', () => {
            registrar(btn.dataset.register);
        });
    });

    const agregarBtn = document.getElementById('btn-agregar-producto');
    if (agregarBtn) {
        agregarBtn.addEventListener('click', agregarProducto);
    }

    cargarInicio();
    cargarProductosEnSelects();
});

function showSection(id, btn) {
    document.querySelectorAll('.section').forEach((section) => section.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((navBtn) => navBtn.classList.remove('active'));

    const section = document.getElementById(id);
    if (!section) {
        showToast(`No existe la seccion "${id}".`, 'error');
        return;
    }

    section.classList.add('active');
    btn.classList.add('active');

    if (id === 'inicio') cargarInicio();
    if (id === 'registrar') cargarProductosEnSelects();
    if (id === 'balance') cargarBalance();
    if (id === 'stock') cargarStock();
    if (id === 'productos') cargarProductos();
}

async function cargarProductosEnSelects() {
    try {
        productos = ensureArray(await fetchJson(API.productos));

        ['v-producto', 'c-producto'].forEach((id) => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = productos.map((producto) => (
                `<option value="${producto.id}">${producto.nombre}</option>`
            )).join('');
        });
    } catch (error) {
        console.error(error);
        showToast('Error al cargar productos.', 'error');
    }
}

async function registrar(tipo) {
    const prefix = tipo === 'venta' ? 'v' : 'c';
    const producto_id = parseInt(document.getElementById(`${prefix}-producto`).value, 10);
    const kg = parseFloat(document.getElementById(`${prefix}-kg`).value) || 0;
    const monto = parseFloat(document.getElementById(`${prefix}-monto`).value) || 0;
    const observacion = document.getElementById(`${prefix}-obs`).value.trim();

    if (kg <= 0 || monto <= 0) {
        showToast('Completa cantidad y monto.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.movimientos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, producto_id, kg, monto, observacion })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        document.getElementById(`${prefix}-kg`).value = '';
        document.getElementById(`${prefix}-monto`).value = '';
        document.getElementById(`${prefix}-obs`).value = '';

        showToast(tipo === 'venta' ? 'Venta registrada.' : 'Compra registrada.', tipo);
    } catch (error) {
        console.error(error);
        showToast('Error al guardar el movimiento.', 'error');
    }
}

async function cargarInicio() {
    try {
        const mov = ensureArray(await fetchJson(`${API.movimientos}?filtro=dia`));
        const ingresos = mov
            .filter((item) => item.tipo === 'venta')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = mov
            .filter((item) => item.tipo === 'compra')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const balance = ingresos - egresos;

        document.getElementById('stat-ingresos').textContent = fmt(ingresos);
        document.getElementById('stat-egresos').textContent = fmt(egresos);

        const balanceEl = document.getElementById('stat-balance');
        balanceEl.textContent = fmt(balance);
        balanceEl.style.color = balance >= 0 ? 'var(--blue)' : 'var(--red)';

        const tbody = document.getElementById('tabla-inicio');
        const recientes = mov.slice(0, 10);

        if (!recientes.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty">Aun no hay movimientos hoy.</td></tr>';
            return;
        }

        tbody.innerHTML = recientes.map((item) => `
            <tr>
                <td><span class="badge badge-${item.tipo}">${item.tipo === 'venta' ? 'Venta' : 'Compra'}</span></td>
                <td>${item.producto}</td>
                <td>${item.kg} kg</td>
                <td class="${item.tipo === 'venta' ? 'amount-pos' : 'amount-neg'}">
                    ${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}
                </td>
                <td style="color: var(--text-hint)">${item.hora}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        showToast('Error al cargar movimientos.', 'error');
    }
}

function setFiltro(filtro, btn) {
    filtroActual = filtro;
    document.querySelectorAll('.filter-btn').forEach((filterBtn) => filterBtn.classList.remove('active'));
    btn.classList.add('active');
    cargarBalance();
}

async function cargarBalance() {
    try {
        const mov = ensureArray(await fetchJson(`${API.movimientos}?filtro=${filtroActual}`));
        const ingresos = mov
            .filter((item) => item.tipo === 'venta')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = mov
            .filter((item) => item.tipo === 'compra')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const balance = ingresos - egresos;

        document.getElementById('b-ingresos').textContent = fmt(ingresos);
        document.getElementById('b-egresos').textContent = fmt(egresos);
        document.getElementById('b-count').textContent = mov.length;

        const totalEl = document.getElementById('b-total');
        totalEl.textContent = (balance >= 0 ? '+' : '') + fmt(balance);
        totalEl.className = `bl-value ${balance >= 0 ? 'positivo' : 'negativo'}`;

        const tbody = document.getElementById('tabla-balance');
        if (!mov.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin movimientos en este periodo.</td></tr>';
            return;
        }

        tbody.innerHTML = mov.map((item) => `
            <tr>
                <td>${item.fecha}</td>
                <td style="color: var(--text-hint)">${item.hora}</td>
                <td><span class="badge badge-${item.tipo}">${item.tipo === 'venta' ? 'Venta' : 'Compra'}</span></td>
                <td>${item.producto}</td>
                <td>${item.kg} kg</td>
                <td class="${item.tipo === 'venta' ? 'amount-pos' : 'amount-neg'}">
                    ${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        showToast('Error al cargar balance.', 'error');
    }
}

async function cargarStock() {
    try {
        const stock = ensureArray(await fetchJson(API.stock));
        const lista = document.getElementById('stock-lista');

        if (!stock.length) {
            lista.innerHTML = '<p class="empty">Sin datos de stock aun.</p>';
            return;
        }

        lista.innerHTML = stock.map((item) => {
            const alerta = Number(item.stock_kg) < 5;
            return `
                <div class="stock-row">
                    <span class="stock-nombre">${item.nombre}</span>
                    <span class="stock-kg ${alerta ? 'alerta' : ''}">
                        ${Number(item.stock_kg).toFixed(1)} kg
                        ${alerta ? '<span class="stock-tag">stock bajo</span>' : ''}
                    </span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error(error);
        showToast('Error al cargar stock.', 'error');
    }
}

async function cargarProductos() {
    try {
        productos = ensureArray(await fetchJson(API.productos));
        const lista = document.getElementById('productos-lista');

        if (!productos.length) {
            lista.innerHTML = '<p class="empty">No hay productos cargados.</p>';
            return;
        }

        lista.innerHTML = productos.map((producto) => `
            <div class="stock-row">
                <span class="stock-nombre">${producto.nombre}</span>
                <button
                    class="btn btn-outline"
                    style="font-size:12px; padding: 4px 10px;"
                    data-eliminar-id="${producto.id}"
                    data-eliminar-nombre="${producto.nombre}"
                >
                    Eliminar
                </button>
            </div>
        `).join('');

        document.querySelectorAll('[data-eliminar-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                eliminarProducto(btn.dataset.eliminarId, btn.dataset.eliminarNombre);
            });
        });
    } catch (error) {
        console.error(error);
        showToast('Error al cargar productos.', 'error');
    }
}

async function agregarProducto() {
    const input = document.getElementById('nuevo-producto');
    const nombre = input.value.trim();

    if (!nombre) {
        showToast('Escribi el nombre del producto.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        input.value = '';
        showToast('Producto agregado.', 'venta');
        cargarProductos();
        cargarProductosEnSelects();
    } catch (error) {
        console.error(error);
        showToast('Error al agregar producto.', 'error');
    }
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`Eliminar "${nombre}"? Los movimientos historicos no se borran.`)) {
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: parseInt(id, 10) })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        showToast('Producto eliminado.', 'venta');
        cargarProductos();
        cargarProductosEnSelects();
    } catch (error) {
        console.error(error);
        showToast('Error al eliminar producto.', 'error');
    }
}
