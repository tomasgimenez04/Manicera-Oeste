// Configuracion y estado global
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
    invoices: new URL('invoices.php', APP_BASE).href
};

const PAGE_SIZE = 10;

let productos = [];
let movimientosInicio = [];
let movimientosBalance = [];
let ventasFacturacion = [];
let stockActual = [];
let filtroActual = 'dia';
let filtroFacturacionActual = 'dia';
let productoEnEdicionId = null;
let facturacionSeleccionada = new Set();
let visibleCounts = {
    inicio: PAGE_SIZE,
    balance: PAGE_SIZE,
    facturacion: PAGE_SIZE,
    stock: PAGE_SIZE,
    productos: PAGE_SIZE
};

// Utilidades generales
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

function getUnidadMedida(source) {
    if (typeof source === 'string') {
        return source === 'unidad' ? 'unidad' : 'kg';
    }

    return source && source.unidad_medida === 'unidad' ? 'unidad' : 'kg';
}

function getUnidadTexto(unidad, value) {
    if (getUnidadMedida(unidad) !== 'unidad') {
        return 'kg';
    }

    return Math.abs(Number(value)) === 1 ? 'unidad' : 'unidades';
}

function formatCantidadNumero(value, unidad, minFractionDigits, maxFractionDigits) {
    const cantidad = Number(value);
    const cantidadSegura = Number.isFinite(cantidad) ? cantidad : 0;
    const unidadMedida = getUnidadMedida(unidad);
    const minimumFractionDigits = unidadMedida === 'unidad' ? 0 : minFractionDigits;
    const maximumFractionDigits = unidadMedida === 'unidad' ? 0 : maxFractionDigits;

    return cantidadSegura.toLocaleString('es-AR', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

function fmtCantidad(value, unidad = 'kg') {
    return `${formatCantidadNumero(value, unidad, 1, 1)} ${getUnidadTexto(unidad, value)}`;
}

function fmtCantidadDetalle(value, unidad = 'kg') {
    return `${formatCantidadNumero(value, unidad, 2, 2)} ${getUnidadTexto(unidad, value)}`;
}

function fmtPrice(value) {
    const precio = Number(value);
    return (Number.isFinite(precio) ? precio : 0).toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function fmtCurrencyAmount(value) {
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

function getProductoById(productoId) {
    return productos.find((item) => Number(item.id) === Number(productoId)) || null;
}

function getPrecioUnitario(source) {
    const precio = source && source.precio_unitario != null ? Number(source.precio_unitario) : 0;
    return Number.isFinite(precio) ? precio : 0;
}

function getPrecioLabel(source) {
    return getUnidadMedida(source) === 'unidad' ? 'por unidad' : 'por kg';
}

function getPrecioTexto(source) {
    return `${fmtPrice(getPrecioUnitario(source))} ${getPrecioLabel(source)}`;
}

function getPrecioUnitarioMovimiento(source) {
    const cantidad = Number(source && source.cantidad != null ? source.cantidad : 0);
    const monto = Number(source && source.monto != null ? source.monto : 0);

    if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(monto) || monto <= 0) {
        return 0;
    }

    return monto / cantidad;
}

function formatInvoiceNumber(numero) {
    const value = Number(numero) || 0;
    return String(value).padStart(5, '0');
}

function formatInvoiceFileDate(fecha) {
    return String(fecha || '').replace(/\//g, '');
}

function getInvoiceFileName(numero, fecha) {
    return `factura-N${formatInvoiceNumber(numero)}-${formatInvoiceFileDate(fecha)}.pdf`;
}

function getSelectedFacturacionItems() {
    return ventasFacturacion.filter((item) => facturacionSeleccionada.has(Number(item.id)));
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

// Helpers de renderizado
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

// Render de selects, tablas y listas
function createOption(producto) {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = `${formatearNombreProducto(producto.nombre, producto.codigo)} - ${getUnidadMedida(producto)}`;
    return option;
}

function actualizarCampoCantidad(prefix) {
    const input = document.getElementById(`${prefix}-cantidad`);

    if (!input) {
        return;
    }

    const select = document.getElementById(`${prefix}-producto`);
    const producto = select ? getProductoById(parseInt(select.value, 10)) : null;
    const unidadMedida = getUnidadMedida(producto);

    input.step = unidadMedida === 'unidad' ? '1' : '0.5';
    input.placeholder = unidadMedida === 'unidad' ? '0' : '0.0';
}

function calcularMontoVenta() {
    const montoInput = document.getElementById('v-monto');

    if (!montoInput) {
        return;
    }

    const select = document.getElementById('v-producto');
    const producto = select ? getProductoById(parseInt(select.value, 10)) : null;
    const cantidad = parseFloat(document.getElementById('v-cantidad').value) || 0;
    const precio = getPrecioUnitario(producto);

    if (!producto || precio <= 0) {
        return;
    }

    if (cantidad <= 0) {
        montoInput.value = '';
        return;
    }

    montoInput.value = (cantidad * precio).toFixed(2);
}

function createInicioRow(item) {
    const row = cloneTemplate('tpl-inicio-row');
    const tipo = row.querySelector('[data-field="tipo"]');
    const producto = row.querySelector('[data-field="producto"]');
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const monto = row.querySelector('[data-field="monto"]');
    const hora = row.querySelector('[data-field="hora"]');

    setBadge(tipo, item.tipo);
    producto.textContent = formatearNombreProducto(item.producto, item.codigo);
    cantidad.textContent = fmtCantidad(item.cantidad, item.unidad_medida);
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
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const monto = row.querySelector('[data-field="monto"]');

    fecha.textContent = item.fecha;
    hora.textContent = item.hora;
    setBadge(tipo, item.tipo);
    producto.textContent = formatearNombreProducto(item.producto, item.codigo);
    cantidad.textContent = fmtCantidad(item.cantidad, item.unidad_medida);
    monto.textContent = `${item.tipo === 'venta' ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${item.tipo === 'venta' ? 'positive' : 'negative'}`;

    return row;
}

function updateFacturacionButtonState() {
    const button = document.getElementById('btn-generar-factura');

    if (!button) {
        return;
    }

    button.disabled = facturacionSeleccionada.size === 0;
}

function setFacturacionSeleccion(itemId, checked, row) {
    const numericId = Number(itemId);

    if (checked) {
        facturacionSeleccionada.add(numericId);
    } else {
        facturacionSeleccionada.delete(numericId);
    }

    if (row) {
        row.classList.toggle('is-selected', checked);
    }

    updateFacturacionButtonState();
}

function createFacturacionRow(item) {
    const row = cloneTemplate('tpl-facturacion-row');
    const seleccion = row.querySelector('[data-field="seleccion"]');
    const fecha = row.querySelector('[data-field="fecha"]');
    const hora = row.querySelector('[data-field="hora"]');
    const producto = row.querySelector('[data-field="producto"]');
    const codigo = row.querySelector('[data-field="codigo"]');
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const monto = row.querySelector('[data-field="monto"]');
    const checkbox = document.createElement('input');
    const isSelected = facturacionSeleccionada.has(Number(item.id));

    fecha.textContent = item.fecha;
    hora.textContent = item.hora;
    producto.textContent = item.producto;
    codigo.textContent = item.codigo || '-';
    cantidad.textContent = fmtCantidad(item.cantidad, item.unidad_medida);
    monto.textContent = fmtCurrencyAmount(item.monto);
    monto.className = 'amount positive';

    checkbox.type = 'checkbox';
    checkbox.className = 'selection-checkbox';
    checkbox.checked = isSelected;
    checkbox.setAttribute('aria-label', `Seleccionar venta ${item.id}`);
    checkbox.addEventListener('change', () => {
        setFacturacionSeleccion(item.id, checkbox.checked, row);
    });

    row.classList.toggle('is-selected', isSelected);
    replaceChildren(seleccion, [checkbox]);

    return row;
}

function createStockRow(item) {
    const row = cloneTemplate('tpl-stock-row');
    const nombre = row.querySelector('[data-field="nombre"]');
    const cantidad = row.querySelector('[data-field="cantidad"]');
    const tag = row.querySelector('[data-field="tag"]');
    const stock = row.querySelector('.stock-kg');
    const alerta = Number(item.stock_cantidad) < 5;

    nombre.textContent = formatearNombreProducto(item.nombre, item.codigo);
    cantidad.textContent = fmtCantidad(item.stock_cantidad, item.unidad_medida);

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
    const precio = row.querySelector('[data-field="precio"]');
    const editButton = row.querySelector('[data-action="modificar"]');
    const deleteButton = row.querySelector('[data-action="eliminar"]');

    nombre.textContent = producto.nombre;
    codigo.textContent = producto.codigo ? `(${producto.codigo})` : '';
    codigo.classList.toggle('is-hidden', !producto.codigo);
    stock.textContent = `Stock actual: ${fmtCantidad(producto.stock_cantidad, producto.unidad_medida)}`;
    precio.textContent = `Precio actual: ${getPrecioTexto(producto)}`;
    stock.classList.remove('product-stock--high', 'product-stock--medium', 'product-stock--empty');
    stock.classList.add(getProductStockClass(producto.stock_cantidad));
    editButton.addEventListener('click', () => {
        openProductModal(producto);
    });
    deleteButton.addEventListener('click', () => {
        eliminarProducto(producto.id, formatearNombreProducto(producto.nombre, producto.codigo));
    });

    return row;
}

function getBusquedaProductoNombre() {
    const input = document.getElementById('buscar-producto');
    return input ? input.value : '';
}

function getProductosFiltrados() {
    const terminoNombre = normalizarTexto(getBusquedaProductoNombre());

    if (!terminoNombre) {
        return productos;
    }

    return productos.filter((producto) => {
        return normalizarTexto(producto.nombre).includes(terminoNombre);
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

function renderFacturacionTable() {
    const tbody = document.getElementById('tabla-facturacion');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: ventasFacturacion,
        key: 'facturacion',
        colspan: 7,
        emptyMessage: 'Sin ventas en este periodo.',
        createRow: createFacturacionRow,
        rerender: renderFacturacionTable
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

function openProductModal(producto) {
    const modal = document.getElementById('product-modal');

    if (!modal || !producto) {
        return;
    }

    productoEnEdicionId = producto.id;
    document.getElementById('editar-producto-nombre').value = producto.nombre || '';
    document.getElementById('editar-producto-codigo').value = producto.codigo || '';
    document.getElementById('editar-producto-precio').value = getPrecioUnitario(producto).toFixed(2);
    document.getElementById('product-modal-unit').textContent = `Unidad de medida: ${getUnidadMedida(producto)}. Precio actual ${getPrecioLabel(producto)}.`;

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');

    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    productoEnEdicionId = null;
}

async function guardarCambiosProducto() {
    if (!productoEnEdicionId) {
        showToast('No hay un producto seleccionado para modificar.', 'error');
        return;
    }

    const nombreInput = document.getElementById('editar-producto-nombre');
    const codigoInput = document.getElementById('editar-producto-codigo');
    const precioInput = document.getElementById('editar-producto-precio');
    const nombre = nombreInput.value.trim();
    const codigo = codigoInput.value.trim();
    const precio_unitario = parseFloat(precioInput.value) || 0;

    if (!nombre) {
        showToast('Escribi el nombre del producto.', 'error');
        return;
    }

    if (!codigo) {
        showToast('Escribi el codigo del producto.', 'error');
        return;
    }

    if (precio_unitario <= 0) {
        showToast('Escribi un precio mayor a 0.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productoEnEdicionId, nombre, codigo, precio_unitario })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        closeProductModal();
        showToast('Producto actualizado.', 'venta');
        await cargarProductos();
        await cargarProductosEnSelects();
        calcularMontoVenta();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al actualizar el producto.'), 'error');
    }
}

function truncatePdfText(doc, text, maxWidth) {
    let value = String(text || '');

    while (value.length > 0 && doc.getTextWidth(value) > maxWidth) {
        value = `${value.slice(0, -4)}...`;
    }

    return value || '-';
}

function drawInvoicePdf(doc, factura) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const contentRight = pageWidth - marginX;
    const qtyX = marginX;
    const productX = 42;
    const codeX = 116;
    const unitX = 156;
    const totalX = contentRight;
    let y = 20;

    const drawSeparator = () => {
        doc.setLineWidth(0.4);
        doc.line(marginX, y, contentRight, y);
    };

    const drawTableHeader = () => {
        doc.setFont('courier', 'bold');
        doc.setFontSize(10);
        doc.text('CANT.', qtyX, y);
        doc.text('PRODUCTO', productX, y);
        doc.text('COD.', codeX, y);
        doc.text('$ UNIT', unitX, y, { align: 'right' });
        doc.text('IMPORTE', totalX, y, { align: 'right' });
        y += 3;
        drawSeparator();
        y += 6;
    };

    const beginFirstPage = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('MANICERA OESTE', marginX, y);

        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('DISTRIBUIDORA MAYORISTA', marginX, y);

        y += 6;
        doc.setFontSize(9);
        doc.text('Direccion - Localidad, Provincia', marginX, y);

        y += 7;
        drawSeparator();

        y += 8;
        doc.setFont('courier', 'bold');
        doc.setFontSize(12);
        doc.text(`FACTURA N°: ${factura.numeroFormateado}`, marginX, y);
        doc.text(`FECHA: ${factura.fecha}`, contentRight, y, { align: 'right' });

        y += 8;
        drawSeparator();
        y += 8;
        drawTableHeader();
    };

    const beginNextPage = () => {
        doc.addPage();
        y = 18;
        doc.setFont('courier', 'bold');
        doc.setFontSize(11);
        doc.text(`FACTURA N°: ${factura.numeroFormateado}`, marginX, y);
        doc.text(`FECHA: ${factura.fecha}`, contentRight, y, { align: 'right' });
        y += 6;
        drawSeparator();
        y += 8;
        drawTableHeader();
    };

    beginFirstPage();

    factura.items.forEach((item) => {
        if (y > pageHeight - 42) {
            beginNextPage();
        }

        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.text(fmtCantidadDetalle(item.cantidad, item.unidad_medida), qtyX, y);
        doc.text(truncatePdfText(doc, item.producto, 68), productX, y);
        doc.text(truncatePdfText(doc, item.codigo || '-', 22), codeX, y);
        doc.text(fmtCurrencyAmount(getPrecioUnitarioMovimiento(item)), unitX, y, { align: 'right' });
        doc.text(fmtCurrencyAmount(item.monto), totalX, y, { align: 'right' });
        y += 7;
    });

    if (y > pageHeight - 36) {
        beginNextPage();
    }

    y += 2;
    drawSeparator();
    y += 10;

    doc.setFont('courier', 'normal');
    doc.setFontSize(11);
    doc.text('SUBTOTAL:', 136, y);
    doc.text(fmtCurrencyAmount(factura.total), totalX, y, { align: 'right' });

    y += 8;
    doc.setFont('courier', 'bold');
    doc.text('TOTAL:', 136, y);
    doc.text(fmtCurrencyAmount(factura.total), totalX, y, { align: 'right' });

    y += 12;
    drawSeparator();
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Comprobante interno - Manicera Oeste', pageWidth / 2, y, { align: 'center' });
}

async function generarFactura() {
    const items = getSelectedFacturacionItems();

    if (!items.length) {
        showToast('Selecciona al menos una venta para facturar.', 'error');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('No se pudo cargar la libreria PDF.', 'error');
        return;
    }

    const button = document.getElementById('btn-generar-factura');
    const total = items.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const itemsIds = items.map((item) => Number(item.id));

    if (button) {
        button.disabled = true;
    }

    try {
        const response = await fetchJson(API.invoices, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items_ids: itemsIds,
                total
            })
        });

        if (!response || !response.ok) {
            throw new Error('No se pudo guardar la factura.');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        const factura = {
            numero: response.numero,
            numeroFormateado: response.numero_formateado || formatInvoiceNumber(response.numero),
            fecha: response.fecha || new Date().toLocaleDateString('es-AR'),
            total,
            items
        };

        drawInvoicePdf(doc, factura);
        doc.save(getInvoiceFileName(factura.numeroFormateado, factura.fecha));

        facturacionSeleccionada.clear();
        updateFacturacionButtonState();
        renderFacturacionTable();
        showToast(`Factura N${factura.numeroFormateado} generada.`, 'venta');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al generar la factura.'), 'error');
    } finally {
        updateFacturacionButtonState();
    }
}

// Inicializacion y eventos de interfaz
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

    document.querySelectorAll('.facturacion-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            setFacturacionFiltro(btn.dataset.facturacionFilter, btn);
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

    const facturaBtn = document.getElementById('btn-generar-factura');
    if (facturaBtn) {
        facturaBtn.addEventListener('click', generarFactura);
    }

    ['v-producto', 'c-producto'].forEach((id) => {
        const select = document.getElementById(id);
        if (!select) {
            return;
        }

        select.addEventListener('change', () => {
            const prefix = id.startsWith('v-') ? 'v' : 'c';
            actualizarCampoCantidad(prefix);

            if (prefix === 'v') {
                calcularMontoVenta();
            }
        });
    });

    const ventaCantidadInput = document.getElementById('v-cantidad');
    if (ventaCantidadInput) {
        ventaCantidadInput.addEventListener('input', calcularMontoVenta);
    }

    ['buscar-producto'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) {
            return;
        }

        input.addEventListener('input', () => {
            resetVisibleCount('productos');
            renderProductosList();
        });
    });

    document.querySelectorAll('[data-product-close]').forEach((element) => {
        element.addEventListener('click', closeProductModal);
    });

    const productCloseBtn = document.getElementById('product-close-btn');
    if (productCloseBtn) {
        productCloseBtn.addEventListener('click', closeProductModal);
    }

    const productSaveBtn = document.getElementById('product-save-btn');
    if (productSaveBtn) {
        productSaveBtn.addEventListener('click', guardarCambiosProducto);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeProductModal();
        }
    });

    cargarInicio();
    cargarProductosEnSelects();
});

// Carga de datos y acciones principales
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
    if (id === 'facturacion') cargarFacturacion();
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

        actualizarCampoCantidad('v');
        actualizarCampoCantidad('c');
        calcularMontoVenta();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar productos.'), 'error');
    }
}

async function registrar(tipo) {
    const prefix = tipo === 'venta' ? 'v' : 'c';
    const producto_id = parseInt(document.getElementById(`${prefix}-producto`).value, 10);
    const cantidad = parseFloat(document.getElementById(`${prefix}-cantidad`).value) || 0;
    let monto = parseFloat(document.getElementById(`${prefix}-monto`).value) || 0;
    const observacion = document.getElementById(`${prefix}-obs`).value.trim();
    const productoSeleccionado = getProductoById(producto_id);
    const unidadMedida = getUnidadMedida(productoSeleccionado);
    const precioUnitario = getPrecioUnitario(productoSeleccionado);

    if (!producto_id) {
        showToast('Selecciona un producto.', 'error');
        return;
    }

    if (cantidad <= 0 || monto <= 0) {
        showToast('Completa cantidad y monto.', 'error');
        return;
    }

    if (unidadMedida === 'unidad' && !Number.isInteger(cantidad)) {
        showToast('Para productos por unidad, la cantidad debe ser entera.', 'error');
        return;
    }

    if (tipo === 'venta' && monto <= 0 && precioUnitario > 0) {
        monto = Number((cantidad * precioUnitario).toFixed(2));
        document.getElementById('v-monto').value = monto.toFixed(2);
    }

    try {
        const data = await fetchJson(API.movimientos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, producto_id, cantidad, monto, observacion })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        document.getElementById(`${prefix}-cantidad`).value = '';
        document.getElementById(`${prefix}-monto`).value = '';
        document.getElementById(`${prefix}-obs`).value = '';

        if (tipo === 'venta') {
            calcularMontoVenta();
        }

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

function setFacturacionFiltro(filtro, btn) {
    filtroFacturacionActual = filtro;
    document.querySelectorAll('.facturacion-filter-btn').forEach((filterBtn) => filterBtn.classList.remove('active'));
    btn.classList.add('active');
    cargarFacturacion();
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

async function cargarFacturacion() {
    try {
        const movimientos = ensureArray(await fetchJson(`${API.movimientos}?filtro=${filtroFacturacionActual}&tipo=venta`));
        ventasFacturacion = movimientos.filter((item) => item.tipo === 'venta');
        facturacionSeleccionada.clear();
        resetVisibleCount('facturacion');
        renderFacturacionTable();
        updateFacturacionButtonState();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar ventas para facturacion.'), 'error');
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
    const unidadInput = document.getElementById('nueva-unidad-medida');
    const precioInput = document.getElementById('nuevo-precio');
    const nombre = input.value.trim();
    const codigo = codigoInput.value.trim();
    const unidad_medida = unidadInput ? unidadInput.value : 'kg';
    const precio_unitario = precioInput ? parseFloat(precioInput.value) || 0 : 0;

    if (!nombre) {
        showToast('Escribi el nombre del producto.', 'error');
        return;
    }

    if (!codigo) {
        showToast('Escribi el codigo del producto.', 'error');
        return;
    }

    if (precio_unitario <= 0) {
        showToast('Escribi un precio mayor a 0.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, codigo, unidad_medida, precio_unitario })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        input.value = '';
        codigoInput.value = '';
        if (precioInput) {
            precioInput.value = '';
        }
        if (unidadInput) {
            unidadInput.value = 'kg';
        }
        showToast('Producto agregado.', 'venta');
        await cargarProductos();
        await cargarProductosEnSelects();
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
        await cargarProductos();
        await cargarProductosEnSelects();
        calcularMontoVenta();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al eliminar producto.'), 'error');
    }
}
