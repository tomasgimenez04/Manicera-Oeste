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

function actualizarFecha() {
    const fechaHoy = document.getElementById('fecha-hoy');
    const hoy = new Date();

    fechaHoy.textContent = hoy.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

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

function cloneTemplate(id) {
    const template = document.getElementById(id);

    if (!template) {
        throw new Error(`No existe el template "${id}".`);
    }

    return template.content.firstElementChild.cloneNode(true);
}

function createEmptyTableRow(colspan, text) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.colSpan = colspan;
    cell.className = 'empty';
    cell.textContent = text;

    row.appendChild(cell);
    return row;
}

function createEmptyParagraph(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'empty';
    paragraph.textContent = text;
    return paragraph;
}

function replaceChildren(element, children) {
    element.replaceChildren(...children);
}

function setBadge(element, tipo) {
    element.classList.remove('venta', 'compra');
    element.classList.add(tipo);
    element.textContent = tipo === 'venta' ? 'Venta' : 'Compra';
}

function createOption(producto) {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = producto.nombre;
    return option;
}

function createInicioRow(item) {
    const row = cloneTemplate('tpl-inicio-row');
    const tipo = row.querySelector('[data-field="tipo"]');
    const producto = row.querySelector('[data-field="producto"]');
    const kg = row.querySelector('[data-field="kg"]');
    const monto = row.querySelector('[data-field="monto"]');
    const hora = row.querySelector('[data-field="hora"]');

    setBadge(tipo, item.tipo);
    producto.textContent = item.producto;
    kg.textContent = `${item.kg} kg`;
    monto.textContent = `${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${item.tipo === 'venta' ? 'positive' : 'negative'}`;
    hora.textContent = item.hora;

    return row;
}

function createBalanceRow(item) {
    const row = cloneTemplate('tpl-balance-row');
    const fecha = row.querySelector('[data-field="fecha"]');
    const hora = row.querySelector('[data-field="hora"]');
    const tipo = row.querySelector('[data-field="tipo"]');
    const producto = row.querySelector('[data-field="producto"]');
    const kg = row.querySelector('[data-field="kg"]');
    const monto = row.querySelector('[data-field="monto"]');

    fecha.textContent = item.fecha;
    hora.textContent = item.hora;
    setBadge(tipo, item.tipo);
    producto.textContent = item.producto;
    kg.textContent = `${item.kg} kg`;
    monto.textContent = `${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${item.tipo === 'venta' ? 'positive' : 'negative'}`;

    return row;
}

function createStockRow(item) {
    const row = cloneTemplate('tpl-stock-row');
    const nombre = row.querySelector('[data-field="nombre"]');
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const tag = row.querySelector('[data-field="tag"]');
    const stock = row.querySelector('.stock-kg');
    const alerta = Number(item.stock_kg) < 5;

    nombre.textContent = item.nombre;
    cantidad.textContent = `${Number(item.stock_kg).toFixed(1)} kg`;

    if (alerta) {
        stock.classList.add('alerta');
        tag.classList.remove('is-hidden');
    } else {
        stock.classList.remove('alerta');
        tag.classList.add('is-hidden');
    }

    return row;
}

function createProductoRow(producto) {
    const row = cloneTemplate('tpl-producto-row');
    const nombre = row.querySelector('[data-field="nombre"]');
    const button = row.querySelector('[data-action="eliminar"]');

    nombre.textContent = producto.nombre;
    button.addEventListener('click', () => {
        eliminarProducto(producto.id, producto.nombre);
    });

    return row;
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarFecha();

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

            if (!productos.length) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No hay productos';
                replaceChildren(select, [option]);
                return;
            }

            replaceChildren(select, productos.map(createOption));
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

    if (!producto_id) {
        showToast('Selecciona un producto.', 'error');
        return;
    }

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
        balanceEl.className = `summary-value amount ${balance >= 0 ? 'positive' : 'negative'}`;

        const tbody = document.getElementById('tabla-inicio');
        const recientes = mov.slice(0, 10);

        if (!recientes.length) {
            replaceChildren(tbody, [createEmptyTableRow(5, 'Aun no hay movimientos hoy.')]);
            return;
        }

        replaceChildren(tbody, recientes.map(createInicioRow));
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
        totalEl.className = `balance-total amount ${balance >= 0 ? 'positive' : 'negative'}`;

        const tbody = document.getElementById('tabla-balance');
        if (!mov.length) {
            replaceChildren(tbody, [createEmptyTableRow(6, 'Sin movimientos en este periodo.')]);
            return;
        }

        replaceChildren(tbody, mov.map(createBalanceRow));
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
            replaceChildren(lista, [createEmptyParagraph('Sin datos de stock aun.')]);
            return;
        }

        replaceChildren(lista, stock.map(createStockRow));
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
            replaceChildren(lista, [createEmptyParagraph('No hay productos cargados.')]);
            return;
        }

        replaceChildren(lista, productos.map(createProductoRow));
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
