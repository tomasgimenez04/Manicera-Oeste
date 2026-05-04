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
    stock: new URL('stock.php', APP_BASE).href,
    tickets: new URL('tickets.php', APP_BASE).href
};

const PAGE_SIZE = 10;

let productos = [];
let movimientosInicio = [];
let movimientosBalance = [];
let ticketsVentas = [];
let stockActual = [];
let filtroActual = 'dia';
let filtroTicketsActual = 'dia';
let ticketActual = null;
let visibleCounts = {
    inicio: PAGE_SIZE,
    balance: PAGE_SIZE,
    tickets: PAGE_SIZE,
    stock: PAGE_SIZE,
    productos: PAGE_SIZE
};

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

function fmtKg(value) {
    const cantidad = Number(value);
    return `${(Number.isFinite(cantidad) ? cantidad : 0).toFixed(1)} kg`;
}

function fmtKgTicket(value) {
    const cantidad = Number(value);
    return `${(Number.isFinite(cantidad) ? cantidad : 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} kg`;
}

function fmtCurrencyTicket(value) {
    const monto = Number(value);
    return (Number.isFinite(monto) ? monto : 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getProductStockClass(value) {
    const cantidad = Number(value);

    if (cantidad > 10) {
        return 'product-stock--high';
    }

    if (cantidad > 0) {
        return 'product-stock--medium';
    }

    return 'product-stock--empty';
}

function getErrorMessage(error, fallback) {
    if (error && typeof error.message === 'string' && error.message.trim() !== '') {
        return error.message;
    }

    return fallback;
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

function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatearNombreProducto(nombre, codigo) {
    if (!codigo) {
        return nombre;
    }

    return `${nombre} (${codigo})`;
}

function getTicketCodigo(item) {
    return item && item.codigo_producto ? item.codigo_producto : (item && item.codigo ? item.codigo : '');
}

function buildTicketData(item) {
    return {
        id: item && item.id ? item.id : '-',
        fecha: item && item.fecha ? item.fecha : '-',
        hora: item && item.hora ? item.hora : '-',
        producto: item && item.producto ? item.producto : '-',
        codigo: getTicketCodigo(item) || 'Sin codigo',
        kg: item && item.kg ? item.kg : 0,
        monto: item && item.monto ? item.monto : 0
    };
}

function getTicketFileName(ticket) {
    const fecha = String(ticket.fecha || 'sin-fecha').replace(/\//g, '-');
    return `ticket-${ticket.id}-${fecha}.pdf`;
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

function resetVisibleCount(key) {
    visibleCounts[key] = PAGE_SIZE;
}

function increaseVisibleCount(key) {
    visibleCounts[key] += PAGE_SIZE;
}

function getVisibleItems(items, key) {
    return items.slice(0, visibleCounts[key]);
}

function createLoadMoreButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'load-more-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

function createLoadMoreMeta(visible, total) {
    const meta = document.createElement('span');
    meta.className = 'load-more-meta';
    meta.textContent = `Mostrando ${visible} de ${total}`;
    return meta;
}

function createLoadMoreTableRow(colspan, visible, total, onClick) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    const shell = document.createElement('div');

    cell.colSpan = colspan;
    cell.className = 'load-more-cell';
    shell.className = 'load-more-shell';
    shell.append(
        createLoadMoreMeta(visible, total),
        createLoadMoreButton('Ver mas', onClick)
    );

    cell.appendChild(shell);
    row.appendChild(cell);

    return row;
}

function createLoadMoreListBlock(visible, total, onClick) {
    const wrapper = document.createElement('div');

    wrapper.className = 'load-more-shell load-more-shell--list';
    wrapper.append(
        createLoadMoreMeta(visible, total),
        createLoadMoreButton('Ver mas', onClick)
    );

    return wrapper;
}

function renderPaginatedTable(config) {
    const {
        tbody,
        items,
        key,
        colspan,
        emptyMessage,
        createRow,
        rerender
    } = config;

    if (!items.length) {
        replaceChildren(tbody, [createEmptyTableRow(colspan, emptyMessage)]);
        return;
    }

    const visibleItems = getVisibleItems(items, key);
    const rows = visibleItems.map(createRow);

    if (visibleItems.length < items.length) {
        rows.push(createLoadMoreTableRow(colspan, visibleItems.length, items.length, () => {
            increaseVisibleCount(key);
            rerender();
        }));
    }

    replaceChildren(tbody, rows);
}

function renderPaginatedList(config) {
    const {
        container,
        items,
        key,
        emptyMessage,
        createRow,
        rerender
    } = config;

    if (!items.length) {
        replaceChildren(container, [createEmptyParagraph(emptyMessage)]);
        return;
    }

    const visibleItems = getVisibleItems(items, key);
    const children = visibleItems.map(createRow);

    if (visibleItems.length < items.length) {
        children.push(createLoadMoreListBlock(visibleItems.length, items.length, () => {
            increaseVisibleCount(key);
            rerender();
        }));
    }

    replaceChildren(container, children);
}

function setBadge(element, tipo) {
    element.classList.remove('venta', 'compra');
    element.classList.add(tipo);
    element.textContent = tipo === 'venta' ? 'Venta' : 'Compra';
}

function createOption(producto) {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = formatearNombreProducto(producto.nombre, producto.codigo);
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
    producto.textContent = formatearNombreProducto(item.producto, item.codigo);
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
    producto.textContent = formatearNombreProducto(item.producto, item.codigo);
    kg.textContent = `${item.kg} kg`;
    monto.textContent = `${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${item.tipo === 'venta' ? 'positive' : 'negative'}`;

    return row;
}

function createTicketRow(item) {
    const row = cloneTemplate('tpl-ticket-row');
    const id = row.querySelector('[data-field="id"]');
    const fecha = row.querySelector('[data-field="fecha"]');
    const hora = row.querySelector('[data-field="hora"]');
    const producto = row.querySelector('[data-field="producto"]');
    const kg = row.querySelector('[data-field="kg"]');
    const monto = row.querySelector('[data-field="monto"]');
    const ticket = row.querySelector('[data-field="ticket"]');
    const button = document.createElement('button');

    id.textContent = `#${item.id}`;
    fecha.textContent = item.fecha;
    hora.textContent = item.hora;
    producto.textContent = formatearNombreProducto(item.producto, getTicketCodigo(item));
    kg.textContent = fmtKg(item.kg);
    monto.textContent = fmtCurrencyTicket(item.monto);
    monto.className = 'amount positive';
    ticket.className = 'ticket-cell';

    button.type = 'button';
    button.className = 'btn btn-secondary btn-sm ticket-open-btn';
    button.textContent = 'Ver ticket';
    button.addEventListener('click', () => {
        openTicketModal(item);
    });

    replaceChildren(ticket, [button]);

    return row;
}

function createStockRow(item) {
    const row = cloneTemplate('tpl-stock-row');
    const nombre = row.querySelector('[data-field="nombre"]');
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const tag = row.querySelector('[data-field="tag"]');
    const stock = row.querySelector('.stock-kg');
    const alerta = Number(item.stock_kg) < 5;

    nombre.textContent = formatearNombreProducto(item.nombre, item.codigo);
    cantidad.textContent = fmtKg(item.stock_kg);

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
    const codigo = row.querySelector('[data-field="codigo"]');
    const stock = row.querySelector('[data-field="stock"]');
    const button = row.querySelector('[data-action="eliminar"]');

    nombre.textContent = producto.nombre;
    codigo.textContent = producto.codigo ? `(${producto.codigo})` : '';
    codigo.classList.toggle('is-hidden', !producto.codigo);
    stock.textContent = `Stock actual: ${fmtKg(producto.stock_kg)}`;
    stock.classList.remove('product-stock--high', 'product-stock--medium', 'product-stock--empty');
    stock.classList.add(getProductStockClass(producto.stock_kg));
    button.addEventListener('click', () => {
        eliminarProducto(producto.id, formatearNombreProducto(producto.nombre, producto.codigo));
    });

    return row;
}

function getBusquedaProductoNombre() {
    const input = document.getElementById('buscar-producto');
    return input ? input.value : '';
}

function getBusquedaProductoCodigo() {
    const input = document.getElementById('buscar-codigo');
    return input ? input.value : '';
}

function coincideCodigoEnOrden(codigoProducto, busquedaCodigo) {
    const codigoNormalizado = normalizarTexto(codigoProducto);
    const busquedaNormalizada = normalizarTexto(busquedaCodigo);

    if (!busquedaNormalizada) {
        return true;
    }

    return codigoNormalizado.startsWith(busquedaNormalizada);
}

function getProductosFiltrados() {
    const terminoNombre = normalizarTexto(getBusquedaProductoNombre());
    const terminoCodigo = normalizarTexto(getBusquedaProductoCodigo());

    if (!terminoNombre && !terminoCodigo) {
        return productos;
    }

    return productos.filter((producto) => {
        const coincideNombre = !terminoNombre || normalizarTexto(producto.nombre).includes(terminoNombre);
        const coincideCodigo = coincideCodigoEnOrden(producto.codigo, terminoCodigo);

        return coincideNombre && coincideCodigo;
    });
}

function renderProductosList() {
    const lista = document.getElementById('productos-lista');
    if (!lista) {
        return;
    }

    if (!productos.length) {
        replaceChildren(lista, [createEmptyParagraph('No hay productos cargados.')]);
        return;
    }

    const productosFiltrados = getProductosFiltrados();

    if (!productosFiltrados.length) {
        replaceChildren(lista, [createEmptyParagraph('No se encontraron productos que coincidan con la busqueda.')]);
        return;
    }

    renderPaginatedList({
        container: lista,
        items: productosFiltrados,
        key: 'productos',
        emptyMessage: 'No hay productos cargados.',
        createRow: createProductoRow,
        rerender: renderProductosList
    });
}

function renderInicioTable() {
    const tbody = document.getElementById('tabla-inicio');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: movimientosInicio,
        key: 'inicio',
        colspan: 5,
        emptyMessage: 'Aun no hay movimientos hoy.',
        createRow: createInicioRow,
        rerender: renderInicioTable
    });
}

function renderBalanceTable() {
    const tbody = document.getElementById('tabla-balance');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: movimientosBalance,
        key: 'balance',
        colspan: 6,
        emptyMessage: 'Sin movimientos en este periodo.',
        createRow: createBalanceRow,
        rerender: renderBalanceTable
    });
}

function renderTicketsTable() {
    const tbody = document.getElementById('tabla-tickets');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: ticketsVentas,
        key: 'tickets',
        colspan: 7,
        emptyMessage: 'Sin tickets en este periodo.',
        createRow: createTicketRow,
        rerender: renderTicketsTable
    });
}

function renderStockList() {
    const lista = document.getElementById('stock-lista');
    if (!lista) {
        return;
    }

    renderPaginatedList({
        container: lista,
        items: stockActual,
        key: 'stock',
        emptyMessage: 'Sin datos de stock aun.',
        createRow: createStockRow,
        rerender: renderStockList
    });
}

function openTicketModal(item) {
    const modal = document.getElementById('ticket-modal');

    if (!modal) {
        return;
    }

    ticketActual = buildTicketData(item);

    document.getElementById('ticket-numero').textContent = `#${ticketActual.id}`;
    document.getElementById('ticket-fecha').textContent = ticketActual.fecha;
    document.getElementById('ticket-hora').textContent = ticketActual.hora;
    document.getElementById('ticket-producto').textContent = ticketActual.producto;
    document.getElementById('ticket-codigo').textContent = ticketActual.codigo;
    document.getElementById('ticket-cantidad').textContent = fmtKgTicket(ticketActual.kg);
    document.getElementById('ticket-total').textContent = fmtCurrencyTicket(ticketActual.monto);

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeTicketModal() {
    const modal = document.getElementById('ticket-modal');

    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function downloadTicketPdf() {
    if (!ticketActual) {
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('No se pudo cargar la libreria PDF.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [210, 80]
    });
    const left = 7;
    const right = 73;
    const center = 40;
    let y = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('MANICERA OESTE', center, y, { align: 'center' });

    y += 9;
    doc.setFontSize(11);
    doc.text('TICKET DE CONTROL', center, y, { align: 'center' });

    y += 7;
    doc.line(left, y, right, y);

    const drawLine = (label, value, large = false) => {
        y += large ? 10 : 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(large ? 11 : 9);
        doc.text(label, left, y);
        doc.setFont('helvetica', large ? 'bold' : 'normal');
        doc.setFontSize(large ? 13 : 9);
        doc.text(String(value), right, y, { align: 'right' });
    };

    drawLine('Nro Ticket:', `#${ticketActual.id}`);
    drawLine('Fecha:', ticketActual.fecha);
    drawLine('Hora:', ticketActual.hora);

    y += 5;
    doc.line(left, y, right, y);

    drawLine('Producto:', ticketActual.producto);
    drawLine('Codigo:', ticketActual.codigo);
    drawLine('Kg:', fmtKgTicket(ticketActual.kg));
    drawLine('Monto total:', fmtCurrencyTicket(ticketActual.monto), true);

    doc.save(getTicketFileName(ticketActual));
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarFecha();

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            showSection(btn.dataset.section, btn);
        });
    });

    document.querySelectorAll('.balance-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            setFiltro(btn.dataset.filter, btn);
        });
    });

    document.querySelectorAll('.ticket-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            setTicketFiltro(btn.dataset.ticketFilter, btn);
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

    ['buscar-producto', 'buscar-codigo'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) {
            return;
        }

        input.addEventListener('input', () => {
            resetVisibleCount('productos');
            renderProductosList();
        });
    });

    document.querySelectorAll('[data-ticket-close]').forEach((element) => {
        element.addEventListener('click', closeTicketModal);
    });

    const ticketCloseBtn = document.getElementById('ticket-close-btn');
    if (ticketCloseBtn) {
        ticketCloseBtn.addEventListener('click', closeTicketModal);
    }

    const ticketPdfBtn = document.getElementById('ticket-pdf-btn');
    if (ticketPdfBtn) {
        ticketPdfBtn.addEventListener('click', downloadTicketPdf);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeTicketModal();
        }
    });

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
    if (id === 'tickets') cargarTickets();
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
        showToast(getErrorMessage(error, 'Error al cargar productos.'), 'error');
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
        showToast(getErrorMessage(error, 'Error al guardar el movimiento.'), 'error');
    }
}

async function cargarInicio() {
    try {
        movimientosInicio = ensureArray(await fetchJson(`${API.movimientos}?filtro=dia`));
        resetVisibleCount('inicio');

        const ingresos = movimientosInicio
            .filter((item) => item.tipo === 'venta')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = movimientosInicio
            .filter((item) => item.tipo === 'compra')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const balance = ingresos - egresos;

        document.getElementById('stat-ingresos').textContent = fmt(ingresos);
        document.getElementById('stat-egresos').textContent = fmt(egresos);

        const balanceEl = document.getElementById('stat-balance');
        balanceEl.textContent = fmt(balance);
        balanceEl.className = `summary-value amount ${balance >= 0 ? 'positive' : 'negative'}`;
        renderInicioTable();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar movimientos.'), 'error');
    }
}

function setFiltro(filtro, btn) {
    filtroActual = filtro;
    document.querySelectorAll('.balance-filter-btn').forEach((filterBtn) => filterBtn.classList.remove('active'));
    btn.classList.add('active');
    cargarBalance();
}

function setTicketFiltro(filtro, btn) {
    filtroTicketsActual = filtro;
    document.querySelectorAll('.ticket-filter-btn').forEach((filterBtn) => filterBtn.classList.remove('active'));
    btn.classList.add('active');
    cargarTickets();
}

async function cargarBalance() {
    try {
        movimientosBalance = ensureArray(await fetchJson(`${API.movimientos}?filtro=${filtroActual}`));
        resetVisibleCount('balance');

        const ingresos = movimientosBalance
            .filter((item) => item.tipo === 'venta')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = movimientosBalance
            .filter((item) => item.tipo === 'compra')
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const balance = ingresos - egresos;

        document.getElementById('b-ingresos').textContent = fmt(ingresos);
        document.getElementById('b-egresos').textContent = fmt(egresos);
        document.getElementById('b-count').textContent = movimientosBalance.length;

        const totalEl = document.getElementById('b-total');
        totalEl.textContent = (balance >= 0 ? '+' : '') + fmt(balance);
        totalEl.className = `balance-total amount ${balance >= 0 ? 'positive' : 'negative'}`;
        renderBalanceTable();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar balance.'), 'error');
    }
}

async function cargarTickets() {
    try {
        ticketsVentas = ensureArray(await fetchJson(`${API.tickets}?filtro=${filtroTicketsActual}`));
        resetVisibleCount('tickets');
        renderTicketsTable();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar tickets.'), 'error');
    }
}

async function cargarStock() {
    try {
        stockActual = ensureArray(await fetchJson(API.stock));
        resetVisibleCount('stock');
        renderStockList();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar stock.'), 'error');
    }
}

async function cargarProductos() {
    try {
        productos = ensureArray(await fetchJson(API.productos));
        resetVisibleCount('productos');
        renderProductosList();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar productos.'), 'error');
    }
}

async function agregarProducto() {
    const input = document.getElementById('nuevo-producto');
    const codigoInput = document.getElementById('nuevo-codigo');
    const nombre = input.value.trim();
    const codigo = codigoInput.value.trim();

    if (!nombre) {
        showToast('Escribi el nombre del producto.', 'error');
        return;
    }

    if (!codigo) {
        showToast('Escribi el codigo del producto.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, codigo })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        input.value = '';
        codigoInput.value = '';
        showToast('Producto agregado.', 'venta');
        cargarProductos();
        cargarProductosEnSelects();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al agregar producto.'), 'error');
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
        showToast(getErrorMessage(error, 'Error al eliminar producto.'), 'error');
    }
}
