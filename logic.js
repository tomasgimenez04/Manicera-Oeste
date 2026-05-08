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
    invoices: new URL('invoices.php', APP_BASE).href,
    salaries: new URL('salaries.php', APP_BASE).href,
    accounts: new URL('accounts.php', APP_BASE).href
};

const INVOICE_ASSET_URLS = {
    instagram: new URL('Imagenes/Logo de instagram.png', APP_BASE).href,
    whatsapp: new URL('Imagenes/Logo de Whatsapp.png', APP_BASE).href
};

const PAGE_SIZE = 10;

let productos = [];
let movimientosInicio = [];
let movimientosBalance = [];
let ventasFacturacion = [];
let sueldosActivos = [];
let cuentasCorrientes = [];
let resumenSueldos = {
    pendientes: 0,
    pagados_mes: 0,
    egresos_mes: 0
};
let resumenCuentasCorrientes = {
    pendientes: 0,
    parciales: 0,
    cobrado_mes: 0
};
let stockActual = [];
let filtroActual = 'dia';
let filtroFacturacionActual = 'dia';
let productoEnEdicionId = null;
let facturacionSeleccionada = new Set();
let facturacionIdsFacturados = new Set();
let historialSueldoAbierto = null;
let sueldoEnEdicionId = null;
let sueldosPagando = new Set();
let cuentaCorrienteItemsForm = [];
let cuentaCorrientePagoId = null;
let cuentaCorrienteHistorialId = null;
let cuentasPagando = new Set();
const invoiceImageCache = new Map();
let visibleCounts = {
    inicio: PAGE_SIZE,
    balance: PAGE_SIZE,
    facturacion: PAGE_SIZE,
    sueldos: PAGE_SIZE,
    cuentasCorrientes: PAGE_SIZE,
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
    const unidadesValidas = ['kg', 'unidad', 'bandeja'];

    if (typeof source === 'string') {
        return unidadesValidas.includes(source) ? source : 'kg';
    }

    return source && unidadesValidas.includes(source.unidad_medida) ? source.unidad_medida : 'kg';
}

function usaCantidadEntera(unidad) {
    const unidadMedida = getUnidadMedida(unidad);
    return unidadMedida === 'unidad' || unidadMedida === 'bandeja';
}

function getUnidadTexto(unidad, value) {
    const unidadMedida = getUnidadMedida(unidad);

    if (unidadMedida === 'kg') {
        return 'kg';
    }

    if (unidadMedida === 'bandeja') {
        return Math.abs(Number(value)) === 1 ? 'bandeja' : 'bandejas';
    }

    return Math.abs(Number(value)) === 1 ? 'unidad' : 'unidades';
}

function formatCantidadNumero(value, unidad, minFractionDigits, maxFractionDigits) {
    const cantidad = Number(value);
    const cantidadSegura = Number.isFinite(cantidad) ? cantidad : 0;
    const unidadMedida = getUnidadMedida(unidad);
    const minimumFractionDigits = usaCantidadEntera(unidadMedida) ? 0 : minFractionDigits;
    const maximumFractionDigits = usaCantidadEntera(unidadMedida) ? 0 : maxFractionDigits;

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

function formatSalaryType(value) {
    switch (value) {
        case 'unico':
            return 'Único';
        case 'diario':
            return 'Diario';
        case 'semanal':
            return 'Semanal';
        case 'quincenal':
            return 'Quincenal';
        case 'mensual':
            return 'Mensual';
        default:
            return value || '-';
    }
}

function isIncomeType(tipo) {
    return tipo === 'venta' || tipo === 'ingreso';
}

function isExpenseType(tipo) {
    return tipo === 'compra' || tipo === 'egreso';
}

function getToastVariantForTipo(tipo) {
    return isIncomeType(tipo) ? 'venta' : 'compra';
}

function getMovimientoDisplayName(item) {
    if (item && item.producto) {
        return formatearNombreProducto(item.producto, item.codigo);
    }

    if (item && item.observacion) {
        return item.observacion;
    }

    return 'Sin detalle';
}

function getMovimientoCantidadText(item) {
    if (!item || Number(item.producto_id) <= 0) {
        return '-';
    }

    const cantidad = Number(item && item.cantidad != null ? item.cantidad : 0);

    if (!Number.isFinite(cantidad) || cantidad === 0) {
        return '-';
    }

    return fmtCantidad(cantidad, item.unidad_medida);
}

function getProductStockClass(value) {
    const cantidad = Number(value);

    if (cantidad >= 5) {
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
            throw new Error(`La respuesta de ${url} no es JSON válido.`);
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

function getSueldoById(sueldoId) {
    return sueldosActivos.find((item) => Number(item.id) === Number(sueldoId)) || null;
}

function getCuentaCorrienteById(cuentaId) {
    return cuentasCorrientes.find((item) => Number(item.id) === Number(cuentaId)) || null;
}

function getPrecioUnitario(source) {
    const precio = source && source.precio_unitario != null ? Number(source.precio_unitario) : 0;
    return Number.isFinite(precio) ? precio : 0;
}

function getPrecioLabel(source) {
    const unidadMedida = getUnidadMedida(source);

    if (unidadMedida === 'unidad') {
        return 'por unidad';
    }

    if (unidadMedida === 'bandeja') {
        return 'por bandeja';
    }

    return 'por kg';
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

function getFacturacionItemId(item) {
    if (!item) {
        return '';
    }

    if (item.facturacion_id) {
        return String(item.facturacion_id);
    }

    if (item.id != null) {
        return `mov-${item.id}`;
    }

    return '';
}

function getSelectedFacturacionItems() {
    return ventasFacturacion.filter((item) => facturacionSeleccionada.has(getFacturacionItemId(item)));
}

function closeInventoryDropdown() {
    const dropdown = document.getElementById('nav-inventario');
    const trigger = document.getElementById('nav-inventario-trigger');

    if (!dropdown || !trigger) {
        return;
    }

    dropdown.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
}

function toggleInventoryDropdown() {
    const dropdown = document.getElementById('nav-inventario');
    const trigger = document.getElementById('nav-inventario-trigger');

    if (!dropdown || !trigger) {
        return;
    }

    const willOpen = !dropdown.classList.contains('is-open');
    closeInventoryDropdown();

    if (willOpen) {
        dropdown.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    }
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

function updateModalBodyLock() {
    const hasOpenModal = document.querySelector('.product-modal:not(.is-hidden), .salary-modal:not(.is-hidden), .account-modal:not(.is-hidden)') !== null;
    document.body.classList.toggle('modal-open', hasOpenModal);
}

function getCuentaCorrienteEstadoVisual(cuenta) {
    const total = Number(cuenta && cuenta.monto_total) || 0;
    const saldo = Number(cuenta && cuenta.saldo_restante) || 0;
    const estado = cuenta && cuenta.estado ? cuenta.estado : 'pendiente';

    if (estado === 'parcial' && total > 0 && saldo > 0 && saldo < total * 0.2) {
        return 'casi-saldada';
    }

    return estado;
}

function getCuentaCorrienteEstadoLabel(cuenta) {
    const visualState = getCuentaCorrienteEstadoVisual(cuenta);

    if (visualState === 'casi-saldada') {
        return 'Casi saldada';
    }

    if (visualState === 'saldada') {
        return 'Saldada';
    }

    if (visualState === 'parcial') {
        return 'Parcial';
    }

    return 'Pendiente';
}

function isCuentaCorrienteVencida(cuenta) {
    if (!cuenta || !cuenta.fecha_vencimiento || cuenta.estado === 'saldada') {
        return false;
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueDate = new Date(`${cuenta.fecha_vencimiento}T00:00:00`);

    if (Number.isNaN(dueDate.getTime())) {
        return false;
    }

    return dueDate < todayStart;
}

function calcCuentaCorrienteItemSubtotal(cantidad, precioUnitario) {
    return Number((Number(cantidad || 0) * Number(precioUnitario || 0)).toFixed(2));
}

function createCuentaCorrienteDraftItem() {
    return {
        producto_id: '',
        producto: '',
        codigo: '',
        unidad_medida: 'kg',
        cantidad: '',
        precio_unitario: '',
        subtotal: 0
    };
}

function ensureCuentaCorrienteDraftRows() {
    if (!cuentaCorrienteItemsForm.length) {
        cuentaCorrienteItemsForm = [createCuentaCorrienteDraftItem()];
    }
}

function isCuentaCorrienteFormItemValid(item) {
    if (!item) {
        return false;
    }

    const productoId = Number(item.producto_id);
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);

    if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(precioUnitario) || precioUnitario <= 0) {
        return false;
    }

    if (usaCantidadEntera(item.unidad_medida) && !Number.isInteger(cantidad)) {
        return false;
    }

    return true;
}

function getCuentaCorrienteFormPayloadItems() {
    return cuentaCorrienteItemsForm
        .filter((item) => isCuentaCorrienteFormItemValid(item))
        .map((item) => ({
            producto_id: Number(item.producto_id),
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario)
        }));
}

function isCuentaCorrienteMovimiento(item) {
    return item && normalizarTexto(item.observacion).startsWith('cuenta corriente:');
}

function isCuentaCorrientePagoMovimiento(item) {
    return item && normalizarTexto(item.observacion).startsWith('pago cuenta corriente:');
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
        createLoadMoreButton('Ver más', onClick)
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
        createLoadMoreButton('Ver más', onClick)
    );

    return wrapper;
}

function appendNextTablePage(config) {
    const {
        tbody,
        items,
        key,
        colspan,
        createRow
    } = config;

    const currentVisibleCount = Math.min(visibleCounts[key], items.length);
    increaseVisibleCount(key);

    const visibleItems = getVisibleItems(items, key);
    const nextItems = visibleItems.slice(currentVisibleCount);
    const loadMoreRow = tbody.querySelector('.load-more-cell')?.parentElement || null;
    const fragment = document.createDocumentFragment();

    nextItems.forEach((item) => {
        fragment.appendChild(createRow(item));
    });

    if (loadMoreRow) {
        loadMoreRow.remove();
    }

    if (visibleItems.length < items.length) {
        fragment.appendChild(createLoadMoreTableRow(colspan, visibleItems.length, items.length, () => {
            appendNextTablePage(config);
        }));
    }

    tbody.appendChild(fragment);
}

function appendNextListPage(config) {
    const {
        container,
        items,
        key,
        createRow
    } = config;

    const currentVisibleCount = Math.min(visibleCounts[key], items.length);
    increaseVisibleCount(key);

    const visibleItems = getVisibleItems(items, key);
    const nextItems = visibleItems.slice(currentVisibleCount);
    const loadMoreBlock = container.querySelector('.load-more-shell--list');
    const fragment = document.createDocumentFragment();

    nextItems.forEach((item) => {
        fragment.appendChild(createRow(item));
    });

    if (loadMoreBlock) {
        loadMoreBlock.remove();
    }

    if (visibleItems.length < items.length) {
        fragment.appendChild(createLoadMoreListBlock(visibleItems.length, items.length, () => {
            appendNextListPage(config);
        }));
    }

    container.appendChild(fragment);
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
            appendNextTablePage(config);
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
            appendNextListPage(config);
        }));
    }

    replaceChildren(container, children);
}

function setBadge(element, tipo, labelOverride = '') {
    element.classList.remove('venta', 'compra', 'ingreso', 'egreso');
    element.classList.add(tipo);

    if (labelOverride) {
        element.textContent = labelOverride;
        return;
    }

    if (tipo === 'venta') {
        element.textContent = 'Venta';
        return;
    }

    if (tipo === 'compra') {
        element.textContent = 'Compra';
        return;
    }

    if (tipo === 'ingreso') {
        element.textContent = 'Ingreso';
        return;
    }

    element.textContent = 'Egreso';
}

function isSalaryPaymentMovimiento(item) {
    return item && item.tipo === 'compra' && normalizarTexto(item.observacion).startsWith('sueldo:');
}

// Render de selects, tablas y listas
function createOption(producto) {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = `${formatearNombreProducto(producto.nombre, producto.codigo)} - ${getUnidadMedida(producto)}`;
    return option;
}

function getProductPickerParts(select) {
    const shell = select ? select.closest('[data-product-picker]') : null;

    if (!shell) {
        return null;
    }

    return {
        shell,
        trigger: shell.querySelector('[data-product-picker-trigger]'),
        value: shell.querySelector('[data-product-picker-value]'),
        menu: shell.querySelector('[data-product-picker-menu]'),
        options: shell.querySelector('[data-product-picker-options]')
    };
}

function closeProductPicker(select) {
    const parts = getProductPickerParts(select);

    if (!parts) {
        return;
    }

    parts.shell.classList.remove('is-open');
    parts.menu.classList.add('is-hidden');
    parts.trigger.setAttribute('aria-expanded', 'false');
}

function closeAllProductPickers(exceptSelect = null) {
    document.querySelectorAll('.product-picker__native').forEach((select) => {
        if (exceptSelect && select === exceptSelect) {
            return;
        }

        closeProductPicker(select);
    });
}

function closeAllAccountActionMenus(exceptMenu = null) {
    document.querySelectorAll('.account-actions-menu').forEach((menu) => {
        if (exceptMenu && menu === exceptMenu) {
            return;
        }

        menu.classList.remove('is-open');
        const trigger = menu.querySelector('.account-actions-menu__trigger');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}

function toggleAccountActionMenu(menu) {
    if (!menu) {
        return;
    }

    const trigger = menu.querySelector('.account-actions-menu__trigger');
    const isOpen = menu.classList.contains('is-open');

    if (isOpen) {
        menu.classList.remove('is-open');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
        return;
    }

    closeAllAccountActionMenus(menu);
    menu.classList.add('is-open');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
    }
}

function openProductPicker(select) {
    const parts = getProductPickerParts(select);

    if (!parts) {
        return;
    }

    closeAllProductPickers(select);
    parts.shell.classList.add('is-open');
    parts.menu.classList.remove('is-hidden');
    parts.trigger.setAttribute('aria-expanded', 'true');
}

function toggleProductPicker(select) {
    const parts = getProductPickerParts(select);

    if (!parts) {
        return;
    }

    if (parts.shell.classList.contains('is-open')) {
        closeProductPicker(select);
        return;
    }

    openProductPicker(select);
}

function syncProductPicker(select) {
    const parts = getProductPickerParts(select);

    if (!parts) {
        return;
    }

    const selectedOption = select.options[select.selectedIndex] || select.options[0] || null;
    parts.value.textContent = selectedOption ? selectedOption.textContent : 'Selecciona un producto';

    const optionButtons = Array.from(select.options).map((option) => {
        const button = document.createElement('button');
        const isSelected = option.value === select.value;

        button.type = 'button';
        button.className = 'product-picker__option';
        button.textContent = option.textContent;
        button.disabled = option.value === '';
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', isSelected ? 'true' : 'false');

        button.addEventListener('click', () => {
            if (option.value === '') {
                return;
            }

            select.value = option.value;
            syncProductPicker(select);
            closeProductPicker(select);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        return button;
    });

    replaceChildren(parts.options, optionButtons);
}

function initProductPicker(select) {
    const parts = getProductPickerParts(select);

    if (!parts || parts.shell.dataset.enhanced === 'true') {
        return;
    }

    parts.shell.dataset.enhanced = 'true';
    parts.trigger.addEventListener('click', () => {
        toggleProductPicker(select);
    });
    syncProductPicker(select);
}

function actualizarCampoCantidad(prefix) {
    const input = document.getElementById(`${prefix}-cantidad`);

    if (!input) {
        return;
    }

    const select = document.getElementById(`${prefix}-producto`);
    const producto = select ? getProductoById(parseInt(select.value, 10)) : null;
    const unidadMedida = getUnidadMedida(producto);

    input.step = usaCantidadEntera(unidadMedida) ? '1' : '0.5';
    input.placeholder = usaCantidadEntera(unidadMedida) ? '0' : '0.0';
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

    setBadge(tipo, item.tipo, isSalaryPaymentMovimiento(item) ? 'Pago' : '');
    producto.textContent = getMovimientoDisplayName(item);
    cantidad.textContent = isSalaryPaymentMovimiento(item) ? '-' : getMovimientoCantidadText(item);
    monto.textContent = `${isIncomeType(item.tipo) ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${isIncomeType(item.tipo) ? 'positive' : 'negative'}`;
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
    setBadge(tipo, item.tipo, isSalaryPaymentMovimiento(item) ? 'Pago' : '');
    producto.textContent = getMovimientoDisplayName(item);
    cantidad.textContent = getMovimientoCantidadText(item);
    monto.textContent = `${isIncomeType(item.tipo) ? '+' : '-'}${fmt(item.monto)}`;
    monto.className = `amount ${isIncomeType(item.tipo) ? 'positive' : 'negative'}`;

    return row;
}

function updateFacturacionButtonState() {
    const button = document.getElementById('btn-generar-factura');

    if (!button) {
        return;
    }

    button.disabled = facturacionSeleccionada.size === 0;
    button.classList.toggle('is-active', facturacionSeleccionada.size > 0);
}

function updateFacturacionSelectionSummary() {
    const summary = document.getElementById('facturacion-selection-summary');

    if (!summary) {
        return;
    }

    const selectedItems = getSelectedFacturacionItems();
    const count = selectedItems.length;
    const total = selectedItems.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const label = count === 1 ? 'venta seleccionada' : 'ventas seleccionadas';

    summary.textContent = `${count} ${label} - Total: ${fmtCurrencyAmount(total)}`;
    summary.classList.toggle('is-empty', count === 0);
    summary.classList.toggle('is-active', count > 0);
}

function setFacturacionSeleccion(itemId, checked, row) {
    const selectionId = String(itemId || '');

    if (!selectionId) {
        return;
    }

    if (checked) {
        facturacionSeleccionada.add(selectionId);
    } else {
        facturacionSeleccionada.delete(selectionId);
    }

    if (row) {
        row.classList.toggle('is-selected', checked);
    }

    updateFacturacionButtonState();
    updateFacturacionSelectionSummary();
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
    const selectionId = getFacturacionItemId(item);
    const isSelected = facturacionSeleccionada.has(selectionId);
    const detailText = item.facturacion_origen === 'cuenta_corriente'
        ? `${item.producto} - Cuenta corriente: ${item.cliente}`
        : item.producto;

    fecha.textContent = item.fecha;
    hora.textContent = item.hora;
    producto.textContent = detailText;
    codigo.textContent = item.codigo || '-';
    cantidad.textContent = fmtCantidad(item.cantidad, item.unidad_medida);
    monto.textContent = fmtCurrencyAmount(item.monto);
    monto.className = 'amount positive';

    checkbox.type = 'checkbox';
    checkbox.className = 'selection-checkbox';
    checkbox.checked = isSelected;
    checkbox.setAttribute('aria-label', `Seleccionar venta ${selectionId}`);
    checkbox.addEventListener('change', () => {
        setFacturacionSeleccion(selectionId, checkbox.checked, row);
    });

    row.classList.toggle('is-selected', isSelected);
    replaceChildren(seleccion, [checkbox]);

    return row;
}

function createSueldoRow(item) {
    const row = cloneTemplate('tpl-sueldo-row');
    const descripcion = row.querySelector('[data-field="descripcion"]');
    const monto = row.querySelector('[data-field="monto"]');
    const tipo = row.querySelector('[data-field="tipo"]');
    const proximo = row.querySelector('[data-field="proximo"]');
    const estado = row.querySelector('[data-field="estado"]');
    const acciones = row.querySelector('[data-field="acciones"]');
    const statusBadge = document.createElement('span');
    const actionsWrap = document.createElement('div');
    const payButton = document.createElement('button');
    const editButton = document.createElement('button');
    const historyButton = document.createElement('button');
    const deleteButton = document.createElement('button');
    const isProcessingPay = sueldosPagando.has(Number(item.id));
    const isPaid = item.estado_periodo === 'pagado';

    descripcion.textContent = item.descripcion;
    monto.textContent = fmtCurrencyAmount(item.monto);
    monto.className = 'amount';
    tipo.textContent = formatSalaryType(item.tipo_pago);
    proximo.textContent = item.proximo_pago || '-';

    statusBadge.className = `salary-status salary-status--${isPaid ? 'paid' : 'pending'}`;
    statusBadge.textContent = isPaid ? 'Pagado' : 'Pendiente';
    replaceChildren(estado, [statusBadge]);

    actionsWrap.className = 'salary-actions';

    payButton.type = 'button';
    payButton.className = 'btn btn-primary btn-sm salary-pay-btn';
    payButton.textContent = isProcessingPay ? 'Pagando...' : 'Pagar';
    payButton.disabled = isPaid || isProcessingPay;
    payButton.addEventListener('click', async () => {
        await pagarSueldo(item.id);
    });

    editButton.type = 'button';
    editButton.className = 'btn btn-secondary btn-sm salary-edit-btn';
    editButton.textContent = '✏️ Modificar';
    editButton.addEventListener('click', () => {
        openSalaryEditModal(item.id);
    });

    historyButton.type = 'button';
    historyButton.className = 'btn btn-secondary btn-sm';
    historyButton.textContent = 'Ver historial';
    historyButton.addEventListener('click', async () => {
        await verHistorial(item.id, item.descripcion);
    });

    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-primary btn-danger btn-sm';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', async () => {
        await eliminarSueldo(item.id, item.descripcion);
    });

    actionsWrap.append(payButton, editButton, historyButton, deleteButton);
    replaceChildren(acciones, [actionsWrap]);

    return row;
}

function createCuentaCorrienteRow(cuenta) {
    const row = cloneTemplate('tpl-cuenta-corriente-row');
    const cliente = row.querySelector('[data-field="cliente"]');
    const creacion = row.querySelector('[data-field="creacion"]');
    const vencimiento = row.querySelector('[data-field="vencimiento"]');
    const total = row.querySelector('[data-field="total"]');
    const pagado = row.querySelector('[data-field="pagado"]');
    const saldo = row.querySelector('[data-field="saldo"]');
    const estado = row.querySelector('[data-field="estado"]');
    const acciones = row.querySelector('[data-field="acciones"]');
    const actionsWrap = document.createElement('div');
    const triggerButton = document.createElement('button');
    const menu = document.createElement('div');
    const statusBadge = document.createElement('span');
    const payButton = document.createElement('button');
    const historyButton = document.createElement('button');
    const archiveButton = document.createElement('button');
    const visualState = getCuentaCorrienteEstadoVisual(cuenta);
    const isPaid = cuenta.estado === 'saldada';
    const isProcessingPay = cuentasPagando.has(Number(cuenta.id));
    const creationDate = formatSqlDateParts(cuenta.fecha_creacion).fecha;
    const dueDate = cuenta.fecha_vencimiento ? formatSqlDateParts(cuenta.fecha_vencimiento).fecha : '-';

    cliente.textContent = cuenta.cliente;
    creacion.textContent = creationDate || '-';
    vencimiento.textContent = dueDate || '-';
    vencimiento.classList.toggle('account-date--overdue', isCuentaCorrienteVencida(cuenta));
    total.textContent = fmtCurrencyAmount(cuenta.monto_total);
    pagado.textContent = fmtCurrencyAmount(cuenta.monto_pagado);
    saldo.textContent = fmtCurrencyAmount(cuenta.saldo_restante);
    saldo.className = 'amount';

    statusBadge.className = `account-status account-status--${visualState}`;
    statusBadge.textContent = getCuentaCorrienteEstadoLabel(cuenta);
    replaceChildren(estado, [statusBadge]);

    actionsWrap.className = 'account-actions-menu';

    triggerButton.type = 'button';
    triggerButton.className = 'account-actions-menu__trigger';
    triggerButton.textContent = 'Acciones ▾';
    triggerButton.setAttribute('aria-haspopup', 'menu');
    triggerButton.setAttribute('aria-expanded', 'false');
    triggerButton.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleAccountActionMenu(actionsWrap);
    });

    menu.className = 'account-actions-menu__dropdown';
    menu.setAttribute('role', 'menu');

    payButton.type = 'button';
    payButton.className = 'account-actions-menu__item account-pay-btn';
    payButton.textContent = isProcessingPay ? '💰 Guardando...' : '💰 Registrar pago';
    payButton.disabled = isPaid || isProcessingPay;
    payButton.addEventListener('click', () => {
        closeAllAccountActionMenus();
        openAccountPaymentModal(cuenta.id);
    });

    historyButton.type = 'button';
    historyButton.className = 'account-actions-menu__item';
    historyButton.textContent = '📋 Ver pagos';
    historyButton.addEventListener('click', async () => {
        closeAllAccountActionMenus();
        await verHistorialPagosCuentaCorriente(cuenta.id, cuenta.cliente);
    });

    archiveButton.type = 'button';
    archiveButton.className = 'account-actions-menu__item account-actions-menu__item--danger account-actions-menu__item--separated';
    archiveButton.textContent = '🗄 Archivar';
    archiveButton.addEventListener('click', async () => {
        closeAllAccountActionMenus();
        await archivarCuentaCorriente(cuenta.id, cuenta.cliente);
    });

    menu.append(payButton, historyButton, archiveButton);
    actionsWrap.append(triggerButton, menu);
    replaceChildren(acciones, [actionsWrap]);

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
    const stockStatus = getProductStockClass(producto.stock_cantidad);

    nombre.textContent = producto.nombre;
    codigo.textContent = producto.codigo || '';
    codigo.classList.toggle('is-hidden', !producto.codigo);
    stock.textContent = fmtCantidad(producto.stock_cantidad, producto.unidad_medida);
    precio.textContent = getPrecioTexto(producto);
    stock.classList.remove('product-stock--high', 'product-stock--medium', 'product-stock--empty');
    stock.classList.add(stockStatus);
    row.classList.remove('product-card--high', 'product-card--medium', 'product-card--empty');
    row.classList.add(`product-card--${stockStatus.replace('product-stock--', '')}`);
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
        emptyMessage: 'Aún no hay movimientos hoy.',
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
        emptyMessage: 'Sin movimientos en este período.',
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
        emptyMessage: 'Sin ventas en este período.',
        createRow: createFacturacionRow,
        rerender: renderFacturacionTable
    });
}

function renderSueldosSummary() {
    const pendientes = document.getElementById('sueldos-pendientes');
    const pagadosMes = document.getElementById('sueldos-pagados-mes');
    const egresosMes = document.getElementById('sueldos-egresos-mes');

    if (!pendientes || !pagadosMes || !egresosMes) {
        return;
    }

    pendientes.textContent = String(resumenSueldos.pendientes || 0);
    pagadosMes.textContent = String(resumenSueldos.pagados_mes || 0);
    egresosMes.textContent = fmtCurrencyAmount(resumenSueldos.egresos_mes || 0);
}

function renderSueldosTable() {
    const tbody = document.getElementById('tabla-sueldos');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: sueldosActivos,
        key: 'sueldos',
        colspan: 6,
        emptyMessage: 'No hay sueldos activos registrados.',
        createRow: createSueldoRow,
        rerender: renderSueldosTable
    });
}

function renderCuentaCorrienteSummary() {
    const pendientes = document.getElementById('cc-resumen-pendientes');
    const parciales = document.getElementById('cc-resumen-parciales');
    const cobrado = document.getElementById('cc-resumen-cobrado');

    if (!pendientes || !parciales || !cobrado) {
        return;
    }

    pendientes.textContent = fmtCurrencyAmount(resumenCuentasCorrientes.pendientes || 0);
    parciales.textContent = fmtCurrencyAmount(resumenCuentasCorrientes.parciales || 0);
    cobrado.textContent = fmtCurrencyAmount(resumenCuentasCorrientes.cobrado_mes || 0);
}

function renderCuentasCorrientesTable() {
    const tbody = document.getElementById('tabla-cuentas-corrientes');
    if (!tbody) {
        return;
    }

    renderPaginatedTable({
        tbody,
        items: cuentasCorrientes,
        key: 'cuentasCorrientes',
        colspan: 8,
        emptyMessage: 'No hay cuentas corrientes activas registradas.',
        createRow: createCuentaCorrienteRow,
        rerender: renderCuentasCorrientesTable
    });
}

function renderCuentaCorrienteFormItems() {
    const tbody = document.getElementById('cc-form-items-body');
    if (!tbody) {
        return;
    }

    ensureCuentaCorrienteDraftRows();

    const rows = cuentaCorrienteItemsForm.map((item, index) => {
        const row = document.createElement('tr');
        const producto = document.createElement('td');
        const cantidad = document.createElement('td');
        const precio = document.createElement('td');
        const subtotal = document.createElement('td');
        const quitar = document.createElement('td');
        const select = document.createElement('select');
        const cantidadInput = document.createElement('input');
        const precioInput = document.createElement('input');
        const removeButton = document.createElement('button');

        select.className = 'account-row-select';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Selecciona un producto';
        select.appendChild(placeholderOption);

        productos.forEach((productoItem) => {
            const option = document.createElement('option');
            option.value = String(productoItem.id);
            option.textContent = formatearNombreProducto(productoItem.nombre, productoItem.codigo);
            option.selected = Number(item.producto_id) === Number(productoItem.id);
            select.appendChild(option);
        });

        cantidadInput.type = 'number';
        cantidadInput.className = 'account-row-input';
        cantidadInput.min = '0';
        cantidadInput.placeholder = 'Ej: 10';
        cantidadInput.value = item.cantidad === '' ? '' : String(item.cantidad);

        precioInput.type = 'number';
        precioInput.className = 'account-row-input account-row-input--price';
        precioInput.min = '0';
        precioInput.step = '0.01';
        precioInput.placeholder = '0';
        precioInput.value = item.precio_unitario === '' ? '' : String(item.precio_unitario);

        const syncQuantityInput = () => {
            const usaEntero = usaCantidadEntera(item.unidad_medida);
            cantidadInput.step = usaEntero ? '1' : '0.01';
        };

        const recalculateRow = () => {
            item.subtotal = calcCuentaCorrienteItemSubtotal(item.cantidad, item.precio_unitario);
            subtotal.textContent = fmtCurrencyAmount(item.subtotal);
            actualizarCuentaCorrienteFormState();
        };

        select.addEventListener('change', () => {
            const productoSeleccionado = getProductoById(parseInt(select.value, 10));

            item.producto_id = productoSeleccionado ? Number(productoSeleccionado.id) : '';
            item.producto = productoSeleccionado ? productoSeleccionado.nombre : '';
            item.codigo = productoSeleccionado ? (productoSeleccionado.codigo || '') : '';
            item.unidad_medida = getUnidadMedida(productoSeleccionado);
            item.precio_unitario = productoSeleccionado ? getPrecioUnitario(productoSeleccionado) : '';

            precioInput.value = item.precio_unitario === '' ? '' : Number(item.precio_unitario).toFixed(2);
            syncQuantityInput();
            recalculateRow();
        });

        cantidadInput.addEventListener('input', () => {
            item.cantidad = cantidadInput.value === '' ? '' : Number(cantidadInput.value);
            recalculateRow();
        });

        precioInput.addEventListener('input', () => {
            item.precio_unitario = precioInput.value === '' ? '' : Number(precioInput.value);
            recalculateRow();
        });

        syncQuantityInput();

        producto.appendChild(select);
        cantidad.appendChild(cantidadInput);
        precio.appendChild(precioInput);
        subtotal.textContent = fmtCurrencyAmount(item.subtotal);
        subtotal.className = 'amount';

        removeButton.type = 'button';
        removeButton.className = 'btn btn-primary btn-danger btn-sm account-remove-item-btn';
        removeButton.textContent = 'Quitar';
        removeButton.setAttribute('aria-label', `Quitar ${item.producto}`);
        removeButton.title = `Quitar ${item.producto}`;
        removeButton.addEventListener('click', () => {
            quitarItemDelFormulario(index);
        });

        quitar.appendChild(removeButton);
        row.append(producto, cantidad, precio, subtotal, quitar);
        return row;
    });

    const addRow = document.createElement('tr');
    const addCell = document.createElement('td');
    const addButton = document.createElement('button');

    addRow.className = 'account-form-add-row';
    addCell.colSpan = 5;
    addButton.type = 'button';
    addButton.className = 'btn btn-secondary account-add-item-btn';
    addButton.textContent = '+ Agregar producto';
    addButton.addEventListener('click', agregarItemAlFormulario);
    addCell.appendChild(addButton);
    addRow.appendChild(addCell);

    replaceChildren(tbody, [...rows, addRow]);
    actualizarCuentaCorrienteFormState();
}

function actualizarCuentaCorrienteFormState() {
    const totalEl = document.getElementById('cc-form-total');
    const totalWrap = document.getElementById('cc-form-total-wrap');
    const clientInput = document.getElementById('cc-cliente');
    const createBtn = document.getElementById('btn-crear-cuenta-corriente');
    const hint = document.getElementById('cc-form-hint');
    const payloadItems = getCuentaCorrienteFormPayloadItems();
    const total = payloadItems.reduce((sum, item) => sum + calcCuentaCorrienteItemSubtotal(item.cantidad, item.precio_unitario), 0);

    if (totalEl) {
        totalEl.textContent = fmtCurrencyAmount(total);
    }

    if (totalWrap) {
        totalWrap.classList.toggle('is-empty', payloadItems.length === 0);
    }

    if (createBtn) {
        const hasClient = clientInput && clientInput.value.trim() !== '';
        const isReady = hasClient && payloadItems.length > 0;
        createBtn.disabled = !isReady;

        if (hint) {
            hint.classList.toggle('is-hidden', isReady);
        }
    }
}

function openSalaryHistoryModal(title = 'Historial de pagos') {
    const modal = document.getElementById('salary-history-modal');
    const subtitle = document.getElementById('salary-history-subtitle');

    if (!modal) {
        return;
    }

    if (subtitle) {
        subtitle.textContent = `Pagos registrados de ${title}.`;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    updateModalBodyLock();
}

function closeSalaryHistoryModal() {
    const modal = document.getElementById('salary-history-modal');
    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    updateModalBodyLock();
    historialSueldoAbierto = null;
}

function openSalaryEditModal(id) {
    const modal = document.getElementById('salary-edit-modal');
    const sueldo = getSueldoById(id);

    if (!modal || !sueldo) {
        showToast('No se encontró el sueldo a modificar.', 'error');
        return;
    }

    sueldoEnEdicionId = Number(id);
    document.getElementById('editar-sueldo-descripcion').value = sueldo.descripcion || '';
    document.getElementById('editar-sueldo-monto').value = Number(sueldo.monto || 0).toFixed(2);
    document.getElementById('editar-sueldo-tipo-pago').value = sueldo.tipo_pago || 'unico';
    document.getElementById('editar-sueldo-fecha-inicio').value = sueldo.fecha_inicio || '';
    document.getElementById('editar-sueldo-fecha-fin').value = sueldo.fecha_fin || '';

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    updateModalBodyLock();
}

function closeSalaryEditModal() {
    const modal = document.getElementById('salary-edit-modal');
    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    updateModalBodyLock();
    sueldoEnEdicionId = null;
}

function renderSalaryHistoryRows(items) {
    const tbody = document.getElementById('salary-history-body');
    if (!tbody) {
        return;
    }

    if (!items.length) {
        replaceChildren(tbody, [createEmptyTableRow(2, 'Sin pagos registrados.')]);
        return;
    }

    const rows = items.map((item) => {
        const row = document.createElement('tr');
        const fecha = document.createElement('td');
        const monto = document.createElement('td');

        fecha.textContent = item.fecha_pago_formateada || item.fecha_pago || '-';
        monto.textContent = fmtCurrencyAmount(item.monto_pagado);
        monto.className = 'amount';
        row.append(fecha, monto);
        return row;
    });

    replaceChildren(tbody, rows);
}

function openAccountPaymentModal(id) {
    const modal = document.getElementById('account-payment-modal');
    const cuenta = getCuentaCorrienteById(id);

    if (!modal || !cuenta) {
        showToast('No se encontró la cuenta corriente seleccionada.', 'error');
        return;
    }

    cuentaCorrientePagoId = Number(id);
    const saldoRestante = Number(cuenta.saldo_restante || 0);
    document.getElementById('account-payment-client').textContent = cuenta.cliente || '-';
    document.getElementById('account-payment-balance').textContent = fmtCurrencyAmount(saldoRestante);
    document.getElementById('account-payment-subtitle').textContent = `Registra un cobro para la cuenta corriente de ${cuenta.cliente}.`;
    document.getElementById('account-payment-amount').value = '';
    document.getElementById('account-payment-amount').placeholder = saldoRestante > 0 ? saldoRestante.toFixed(2) : '0';
    document.getElementById('account-payment-amount').max = String(saldoRestante.toFixed(2));
    document.getElementById('account-payment-note').value = '';
    const fillTotalButton = document.getElementById('account-payment-fill-total');
    if (fillTotalButton) {
        fillTotalButton.textContent = fmtCurrencyAmount(saldoRestante);
        fillTotalButton.dataset.amount = saldoRestante.toFixed(2);
        fillTotalButton.disabled = saldoRestante <= 0;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    updateModalBodyLock();
}

function closeAccountPaymentModal() {
    const modal = document.getElementById('account-payment-modal');
    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    cuentaCorrientePagoId = null;
    updateModalBodyLock();
}

function completarPagoCuentaCorrienteTotal() {
    if (!cuentaCorrientePagoId) {
        return;
    }

    const cuenta = getCuentaCorrienteById(cuentaCorrientePagoId);
    const amountInput = document.getElementById('account-payment-amount');
    const saldoRestante = Number(cuenta && cuenta.saldo_restante) || 0;

    if (!amountInput || saldoRestante <= 0) {
        return;
    }

    amountInput.value = saldoRestante.toFixed(2);
    amountInput.focus();
    amountInput.select();
}

function openAccountHistoryModal(cliente = 'la cuenta corriente seleccionada') {
    const modal = document.getElementById('account-history-modal');
    const subtitle = document.getElementById('account-history-subtitle');

    if (!modal) {
        return;
    }

    if (subtitle) {
        subtitle.textContent = `Historial de cobros de ${cliente}.`;
    }

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    updateModalBodyLock();
}

function closeAccountHistoryModal() {
    const modal = document.getElementById('account-history-modal');
    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    cuentaCorrienteHistorialId = null;
    updateModalBodyLock();
}

function renderAccountHistoryRows(items) {
    const tbody = document.getElementById('account-history-body');
    const totalEl = document.getElementById('account-history-total-value');
    if (!tbody) {
        return;
    }

    if (!items.length) {
        replaceChildren(tbody, [createEmptyTableRow(3, 'Sin pagos registrados.')]);
        if (totalEl) {
            totalEl.textContent = fmtCurrencyAmount(0);
        }
        return;
    }

    const total = items.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const rows = items.map((item) => {
        const row = document.createElement('tr');
        const fecha = document.createElement('td');
        const monto = document.createElement('td');
        const observacion = document.createElement('td');

        fecha.textContent = item.fecha_formateada || item.fecha || '-';
        monto.textContent = fmtCurrencyAmount(item.monto);
        monto.className = 'amount';
        observacion.textContent = item.observacion || '-';
        row.append(fecha, monto, observacion);
        return row;
    });

    replaceChildren(tbody, rows);

    if (totalEl) {
        totalEl.textContent = fmtCurrencyAmount(total);
    }
}

function formatSqlDateParts(value) {
    const text = String(value || '').trim();

    if (!text) {
        return {
            fecha: '-',
            hora: '-'
        };
    }

    const [datePart = '', timePart = ''] = text.split(' ');
    const [year, month, day] = datePart.split('-');

    if (!year || !month || !day) {
        return {
            fecha: '-',
            hora: '-'
        };
    }

    return {
        fecha: `${day}/${month}/${year}`,
        hora: timePart.slice(0, 5) || '-'
    };
}

function mapCuentaCorrienteItemsToFacturacion(cuentas) {
    return ensureArray(cuentas).flatMap((cuenta) => {
        const dateParts = formatSqlDateParts(cuenta.fecha_creacion);
        return ensureArray(cuenta.items).map((item) => ({
            facturacion_id: `cc-${cuenta.id}-${item.id}`,
            id: item.id,
            fecha: dateParts.fecha,
            hora: dateParts.hora,
            producto: item.producto,
            cliente: cuenta.cliente,
            codigo: item.codigo || '',
            unidad_medida: item.unidad_medida || 'kg',
            cantidad: Number(item.cantidad || 0),
            monto: Number(item.subtotal || 0),
            producto_id: Number(item.producto_id || 0),
            precio_unitario: Number(item.precio_unitario || 0),
            facturacion_origen: 'cuenta_corriente',
            cuenta_corriente_id: Number(cuenta.id)
        }));
    });
}

function getFacturacionSortTimestamp(item) {
    const fecha = String(item && item.fecha ? item.fecha : '');
    const hora = String(item && item.hora ? item.hora : '00:00');
    const [day, month, year] = fecha.split('/');

    if (!day || !month || !year) {
        return 0;
    }

    const isoText = `${year}-${month}-${day}T${hora || '00:00'}:00`;
    const timestamp = new Date(isoText).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function createLocalDateFromFacturacionItem(item) {
    const fecha = String(item && item.fecha ? item.fecha : '');
    const [day, month, year] = fecha.split('/').map((value) => Number(value));

    if (!day || !month || !year) {
        return null;
    }

    const date = new Date(year, month - 1, day);
    return Number.isFinite(date.getTime()) ? date : null;
}

function isFacturacionItemWithinFilter(item, filtro) {
    const itemDate = createLocalDateFromFacturacionItem(item);
    if (!itemDate) {
        return false;
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (filtro === 'dia') {
        return itemDate.getTime() === todayStart.getTime();
    }

    if (filtro === 'semana') {
        const dayOfWeek = todayStart.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(todayStart);
        monday.setDate(todayStart.getDate() + mondayOffset);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return itemDate >= monday && itemDate <= sunday;
    }

    if (filtro === 'mes') {
        return itemDate.getFullYear() === todayStart.getFullYear()
            && itemDate.getMonth() === todayStart.getMonth();
    }

    return true;
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
        emptyMessage: 'Sin datos de stock aún.',
        createRow: createStockRow,
        rerender: renderStockList
    });
}

function updateProductModalUnitText(unidad) {
    const unitLabel = document.getElementById('product-modal-unit');

    if (!unitLabel) {
        return;
    }

    unitLabel.textContent = `Unidad de medida: ${getUnidadMedida(unidad)}.`;
}

function updateProductModalStockInput(unidad) {
    const stockInput = document.getElementById('editar-producto-stock');

    if (!stockInput) {
        return;
    }

    const unidadMedida = getUnidadMedida(unidad);
    stockInput.step = usaCantidadEntera(unidadMedida) ? '1' : '0.5';
    stockInput.placeholder = usaCantidadEntera(unidadMedida) ? '0' : '0.0';
}

function openProductModal(producto) {
    const modal = document.getElementById('product-modal');

    if (!modal || !producto) {
        return;
    }

    const stockActual = Number(producto.stock_cantidad || 0);

    productoEnEdicionId = producto.id;
    document.getElementById('editar-producto-nombre').value = producto.nombre || '';
    document.getElementById('editar-producto-codigo').value = producto.codigo || '';
    document.getElementById('editar-producto-unidad').value = getUnidadMedida(producto);
    updateProductModalStockInput(producto);
    document.getElementById('editar-producto-stock').value = usaCantidadEntera(producto)
        ? String(Math.round(stockActual))
        : stockActual.toFixed(2);
    document.getElementById('editar-producto-precio').value = getPrecioUnitario(producto).toFixed(2);
    updateProductModalUnitText(producto);

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    updateModalBodyLock();
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');

    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    updateModalBodyLock();
    productoEnEdicionId = null;
}

async function guardarCambiosProducto() {
    if (!productoEnEdicionId) {
        showToast('No hay un producto seleccionado para modificar.', 'error');
        return;
    }

    const nombreInput = document.getElementById('editar-producto-nombre');
    const codigoInput = document.getElementById('editar-producto-codigo');
    const unidadInput = document.getElementById('editar-producto-unidad');
    const stockInput = document.getElementById('editar-producto-stock');
    const precioInput = document.getElementById('editar-producto-precio');
    const nombre = nombreInput.value.trim();
    const codigo = codigoInput.value.trim();
    const unidad_medida = unidadInput ? unidadInput.value : 'kg';
    const stock_actual = stockInput ? parseFloat(stockInput.value) : NaN;
    const precio_unitario = parseFloat(precioInput.value) || 0;

    if (!nombre) {
        showToast('Escribí el nombre del producto.', 'error');
        return;
    }

    if (!codigo) {
        showToast('Escribí el código del producto.', 'error');
        return;
    }

    if (!Number.isFinite(stock_actual)) {
        showToast('Escribí un stock válido.', 'error');
        return;
    }

    if (usaCantidadEntera(unidad_medida) && !Number.isInteger(stock_actual)) {
        showToast(`Para productos por ${unidad_medida}, el stock debe ser entero.`, 'error');
        return;
    }

    if (precio_unitario < 0) {
        showToast('Escribí un precio mayor o igual a 0.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.productos, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productoEnEdicionId, nombre, codigo, unidad_medida, stock_actual, precio_unitario })
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

function splitPdfTextLines(doc, text, maxWidth) {
    const value = String(text || '-').trim() || '-';
    const lines = doc.splitTextToSize(value, maxWidth);
    return Array.isArray(lines) && lines.length ? lines : ['-'];
}

async function loadInvoiceImageData(url) {
    if (invoiceImageCache.has(url)) {
        return invoiceImageCache.get(url);
    }

    const promise = new Promise((resolve) => {
        const image = new Image();

        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                const context = canvas.getContext('2d');

                if (!context) {
                    resolve(null);
                    return;
                }

                context.drawImage(image, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (error) {
                console.error(error);
                resolve(null);
            }
        };

        image.onerror = () => resolve(null);
        image.src = url;
    });

    invoiceImageCache.set(url, promise);
    return promise;
}

async function loadInvoiceContactAssets() {
    const [instagramLogo, whatsappLogo] = await Promise.all([
        loadInvoiceImageData(INVOICE_ASSET_URLS.instagram),
        loadInvoiceImageData(INVOICE_ASSET_URLS.whatsapp)
    ]);

    return {
        instagramLogo,
        whatsappLogo
    };
}

function drawInvoicePdf(doc, factura, assets = {}) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const contentRight = pageWidth - marginX;
    const centerX = pageWidth / 2;
    const qtyX = marginX;
    const productX = 50;
    const unitX = 154;
    const totalX = contentRight;
    const productWidth = unitX - productX - 14;
    const infoLeftX = marginX;
    const infoRightX = 133;
    const iconSize = 5;
    const contactTextX = infoRightX + iconSize + 3;
    const footerReserve = 54;
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
        doc.text('$ UNIT', unitX, y, { align: 'right' });
        doc.text('IMPORTE', totalX, y, { align: 'right' });
        y += 3;
        drawSeparator();
        y += 6;
    };

    const beginFirstPage = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('MANICERA OESTE', centerX, y, { align: 'center' });

        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('DISTRIBUIDORA MAYORISTA', centerX, y, { align: 'center' });

        y += 6;
        doc.setFontSize(9);
        doc.text('Laureana Ferrari 403', infoLeftX, y);

        if (assets.instagramLogo) {
            doc.addImage(assets.instagramLogo, 'PNG', infoRightX, y - 3.8, iconSize, iconSize);
        }

        doc.text('maniceraoeste_manicor', contactTextX, y);

        y += 5;
        doc.text('Palomar', infoLeftX, y);

        if (assets.whatsappLogo) {
            doc.addImage(assets.whatsappLogo, 'PNG', infoRightX, y - 3.8, iconSize, iconSize);
        }

        doc.text('1121564919', contactTextX, y);

        y += 5;
        doc.text('Buenos Aires, Argentina', infoLeftX, y);

        y += 7;
        drawSeparator();

        y += 8;
        doc.setFont('courier', 'bold');
        doc.setFontSize(12);
        doc.text(`PRESUPUESTO N\u00B0: ${factura.numeroFormateado}`, marginX, y);
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
        doc.text(`PRESUPUESTO N\u00B0: ${factura.numeroFormateado}`, marginX, y);
        doc.text(`FECHA: ${factura.fecha}`, contentRight, y, { align: 'right' });
        y += 6;
        drawSeparator();
        y += 8;
        drawTableHeader();
    };

    beginFirstPage();

    factura.items.forEach((item) => {
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        const productLines = splitPdfTextLines(doc, item.producto, productWidth);
        const rowHeight = productLines.length > 1 ? productLines.length * 5 : 7;

        if (y + rowHeight > pageHeight - 42) {
            beginNextPage();
            doc.setFont('courier', 'normal');
            doc.setFontSize(10);
        }

        doc.text(fmtCantidadDetalle(item.cantidad, item.unidad_medida), qtyX, y);
        doc.text(productLines, productX, y);
        doc.text(fmtCurrencyAmount(getPrecioUnitarioMovimiento(item)), unitX, y, { align: 'right' });
        doc.text(fmtCurrencyAmount(item.monto), totalX, y, { align: 'right' });
        y += productLines.length > 1 ? rowHeight + 2 : 7;
    });

    if (y > pageHeight - footerReserve) {
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

    y += 6;
    doc.setFontSize(9);
    const disclaimerLines = splitPdfTextLines(
        doc,
        'CONTROLE LA MERCADERÍA, UNA VEZ RETIRADA DEL DEPÓSITO O ENTREGADA NO SE ACEPTAN RECLAMOS NI SE REALIZAN CAMBIOS.',
        pageWidth - (marginX * 2)
    );
    doc.text(disclaimerLines, pageWidth / 2, y, { align: 'center' });
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
    const itemsIds = items.map((item) => getFacturacionItemId(item)).filter(Boolean);

    if (button) {
        button.disabled = true;
    }

    try {
        const response = await fetchJson(API.invoices, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items_ids: itemsIds
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
            total: Number(response.total || 0),
            items
        };
        const invoiceAssets = await loadInvoiceContactAssets();

        drawInvoicePdf(doc, factura, invoiceAssets);
        doc.save(getInvoiceFileName(factura.numeroFormateado, factura.fecha));

        facturacionSeleccionada.clear();
        await cargarFacturacion();
        showToast(`Factura N${factura.numeroFormateado} generada.`, 'venta');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al generar la factura.'), 'error');
    } finally {
        updateFacturacionButtonState();
        updateFacturacionSelectionSummary();
    }
}

// Inicializacion y eventos de interfaz
document.addEventListener('DOMContentLoaded', () => {
    actualizarFecha();

    ['v-producto', 'c-producto'].forEach((id) => {
        const select = document.getElementById(id);
        if (select) {
            initProductPicker(select);
        }
    });

    document.querySelectorAll('.nav-btn[data-section], .nav-dropdown__item[data-section]').forEach((btn) => {
        btn.addEventListener('click', () => {
            showSection(btn.dataset.section, btn);
        });
    });

    const inventoryTrigger = document.getElementById('nav-inventario-trigger');
    if (inventoryTrigger) {
        inventoryTrigger.addEventListener('click', () => {
            toggleInventoryDropdown();
        });
    }

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

    document.querySelectorAll('[data-register-other]').forEach((btn) => {
        btn.addEventListener('click', () => {
            registrarOtroMovimiento(btn.dataset.registerOther);
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

    const salaryRegisterBtn = document.getElementById('btn-registrar-sueldo');
    if (salaryRegisterBtn) {
        salaryRegisterBtn.addEventListener('click', registrarSueldo);
    }

    const ccCreateBtn = document.getElementById('btn-crear-cuenta-corriente');
    if (ccCreateBtn) {
        ccCreateBtn.addEventListener('click', crearCuentaCorriente);
    }

    ['v-producto', 'c-producto'].forEach((id) => {
        const select = document.getElementById(id);
        if (!select) {
            return;
        }

        select.addEventListener('change', () => {
            syncProductPicker(select);
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

    const ccClienteInput = document.getElementById('cc-cliente');
    if (ccClienteInput) {
        ccClienteInput.addEventListener('input', actualizarCuentaCorrienteFormState);
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

    const productUnitSelect = document.getElementById('editar-producto-unidad');
    if (productUnitSelect) {
        productUnitSelect.addEventListener('change', () => {
            updateProductModalUnitText(productUnitSelect.value);
            updateProductModalStockInput(productUnitSelect.value);
        });
    }

    document.querySelectorAll('[data-salary-close]').forEach((element) => {
        element.addEventListener('click', closeSalaryHistoryModal);
    });

    const salaryHistoryCloseBtn = document.getElementById('salary-history-close-btn');
    if (salaryHistoryCloseBtn) {
        salaryHistoryCloseBtn.addEventListener('click', closeSalaryHistoryModal);
    }

    document.querySelectorAll('[data-salary-edit-close]').forEach((element) => {
        element.addEventListener('click', closeSalaryEditModal);
    });

    const salaryEditCloseBtn = document.getElementById('salary-edit-close-btn');
    if (salaryEditCloseBtn) {
        salaryEditCloseBtn.addEventListener('click', closeSalaryEditModal);
    }

    const salaryEditSaveBtn = document.getElementById('salary-edit-save-btn');
    if (salaryEditSaveBtn) {
        salaryEditSaveBtn.addEventListener('click', guardarCambiosSueldo);
    }

    document.querySelectorAll('[data-account-payment-close]').forEach((element) => {
        element.addEventListener('click', closeAccountPaymentModal);
    });

    const accountPaymentCloseBtn = document.getElementById('account-payment-close-btn');
    if (accountPaymentCloseBtn) {
        accountPaymentCloseBtn.addEventListener('click', closeAccountPaymentModal);
    }

    const accountPaymentSaveBtn = document.getElementById('account-payment-save-btn');
    if (accountPaymentSaveBtn) {
        accountPaymentSaveBtn.addEventListener('click', registrarPagoCuentaCorriente);
    }

    const accountPaymentFillTotalBtn = document.getElementById('account-payment-fill-total');
    if (accountPaymentFillTotalBtn) {
        accountPaymentFillTotalBtn.addEventListener('click', completarPagoCuentaCorrienteTotal);
    }

    document.querySelectorAll('[data-account-history-close]').forEach((element) => {
        element.addEventListener('click', closeAccountHistoryModal);
    });

    const accountHistoryCloseBtn = document.getElementById('account-history-close-btn');
    if (accountHistoryCloseBtn) {
        accountHistoryCloseBtn.addEventListener('click', closeAccountHistoryModal);
    }

    const salaryStartInput = document.getElementById('sueldo-fecha-inicio');
    if (salaryStartInput && !salaryStartInput.value) {
        salaryStartInput.value = new Date().toISOString().slice(0, 10);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllProductPickers();
            closeAllAccountActionMenus();
            closeInventoryDropdown();
            closeProductModal();
            closeSalaryHistoryModal();
            closeSalaryEditModal();
            closeAccountPaymentModal();
            closeAccountHistoryModal();
        }
    });

    document.addEventListener('click', (event) => {
        const picker = event.target.closest('[data-product-picker]');
        const accountMenu = event.target.closest('.account-actions-menu');
        const inventoryMenu = event.target.closest('.nav-dropdown');

        if (!picker) {
            closeAllProductPickers();
        }

        if (!accountMenu) {
            closeAllAccountActionMenus();
        }

        if (!inventoryMenu) {
            closeInventoryDropdown();
        }
    });

    cargarInicio();
    cargarProductosEnSelects();
    renderCuentaCorrienteFormItems();
});

// Carga de datos y acciones principales
function showSection(id, btn) {
    document.querySelectorAll('.section').forEach((section) => section.classList.remove('active'));
    document.querySelectorAll('.nav-btn, .nav-dropdown__item').forEach((navBtn) => navBtn.classList.remove('active'));
    document.querySelectorAll('.nav-dropdown').forEach((dropdown) => dropdown.classList.remove('is-active'));

    const section = document.getElementById(id);
    if (!section) {
        showToast(`No existe la seccion "${id}".`, 'error');
        return;
    }

    section.classList.add('active');
    const targetBtn = btn || document.querySelector(`.nav-btn[data-section="${id}"], .nav-dropdown__item[data-section="${id}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    if (id === 'stock' || id === 'productos') {
        const inventoryDropdown = document.getElementById('nav-inventario');
        if (inventoryDropdown) {
            inventoryDropdown.classList.add('is-active');
        }
    }

    closeInventoryDropdown();

    if (id === 'inicio') cargarInicio();
    if (id === 'registrar' || id === 'cuenta-corriente') cargarProductosEnSelects();
    if (id === 'sueldos') cargarSueldos();
    if (id === 'cuenta-corriente') cargarCuentasCorrientes();
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
                syncProductPicker(select);
                return;
            }

            replaceChildren(select, productos.map(createOption));
            syncProductPicker(select);
        });

        actualizarCampoCantidad('v');
        actualizarCampoCantidad('c');
        calcularMontoVenta();
        renderCuentaCorrienteFormItems();
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

    if (usaCantidadEntera(unidadMedida) && !Number.isInteger(cantidad)) {
        showToast(`Para productos por ${unidadMedida}, la cantidad debe ser entera.`, 'error');
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

        showToast(tipo === 'venta' ? 'Venta registrada.' : 'Compra registrada.', getToastVariantForTipo(tipo));
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al guardar el movimiento.'), 'error');
    }
}

async function registrarOtroMovimiento(tipo) {
    const prefix = tipo === 'ingreso' ? 'oi' : 'oe';
    const descripcionInput = document.getElementById(`${prefix}-descripcion`);
    const montoInput = document.getElementById(`${prefix}-monto`);
    const observacion = descripcionInput ? descripcionInput.value.trim() : '';
    const monto = montoInput ? parseFloat(montoInput.value) || 0 : 0;

    if (!observacion) {
        showToast('Escribí una descripción.', 'error');
        return;
    }

    if (monto <= 0) {
        showToast('Escribí un monto mayor a 0.', 'error');
        return;
    }

    try {
        const data = await fetchJson(API.movimientos, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, monto, observacion })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        if (descripcionInput) {
            descripcionInput.value = '';
        }

        if (montoInput) {
            montoInput.value = '';
        }

        showToast(tipo === 'ingreso' ? 'Ingreso registrado.' : 'Egreso registrado.', getToastVariantForTipo(tipo));
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al guardar el movimiento.'), 'error');
    }
}

async function cargarSueldos() {
    try {
        const data = await fetchJson(API.salaries);
        const payload = Array.isArray(data) ? { items: data, resumen: {} } : (data || {});

        sueldosActivos = ensureArray(payload.items);
        resumenSueldos = {
            pendientes: Number(payload.resumen && payload.resumen.pendientes) || 0,
            pagados_mes: Number(payload.resumen && payload.resumen.pagados_mes) || 0,
            egresos_mes: Number(payload.resumen && payload.resumen.egresos_mes) || 0
        };

        resetVisibleCount('sueldos');
        renderSueldosSummary();
        renderSueldosTable();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar sueldos.'), 'error');
    }
}

function clearCuentaCorrienteForm() {
    const clientInput = document.getElementById('cc-cliente');
    const dueDateInput = document.getElementById('cc-fecha-vencimiento');
    cuentaCorrienteItemsForm = [createCuentaCorrienteDraftItem()];

    if (clientInput) {
        clientInput.value = '';
    }

    if (dueDateInput) {
        dueDateInput.value = '';
    }

    renderCuentaCorrienteFormItems();
}

function agregarItemAlFormulario() {
    cuentaCorrienteItemsForm.push(createCuentaCorrienteDraftItem());

    renderCuentaCorrienteFormItems();
}

function quitarItemDelFormulario(index) {
    cuentaCorrienteItemsForm.splice(index, 1);
    renderCuentaCorrienteFormItems();
}

async function cargarCuentasCorrientes() {
    try {
        const data = await fetchJson(API.accounts);
        const payload = Array.isArray(data) ? { items: data, resumen: {} } : (data || {});

        cuentasCorrientes = ensureArray(payload.items);
        resumenCuentasCorrientes = {
            pendientes: Number(payload.resumen && payload.resumen.pendientes) || 0,
            parciales: Number(payload.resumen && payload.resumen.parciales) || 0,
            cobrado_mes: Number(payload.resumen && payload.resumen.cobrado_mes) || 0
        };

        resetVisibleCount('cuentasCorrientes');
        renderCuentaCorrienteSummary();
        renderCuentasCorrientesTable();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar cuentas corrientes.'), 'error');
    }
}

async function crearCuentaCorriente() {
    const clienteInput = document.getElementById('cc-cliente');
    const dueDateInput = document.getElementById('cc-fecha-vencimiento');
    const cliente = clienteInput ? clienteInput.value.trim() : '';
    const fecha_vencimiento = dueDateInput ? dueDateInput.value.trim() : '';
    const items = getCuentaCorrienteFormPayloadItems();

    if (!cliente) {
        showToast('Escribí el nombre del cliente.', 'error');
        return;
    }

    if (!items.length) {
        showToast('Agrega al menos un producto a la cuenta corriente.', 'error');
        return;
    }

    try {
        const data = await fetchJson(`${API.accounts}?accion=crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente,
                fecha_vencimiento: fecha_vencimiento || null,
                items
            })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        clearCuentaCorrienteForm();
        await cargarCuentasCorrientes();

        if (typeof cargarStock === 'function') {
            await cargarStock();
        }

        if (typeof cargarInicio === 'function') {
            await cargarInicio();
        }

        if (typeof cargarBalance === 'function') {
            await cargarBalance();
        }

        showToast('Cuenta corriente creada.', 'venta');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al crear la cuenta corriente.'), 'error');
    }
}

async function registrarPagoCuentaCorriente() {
    if (!cuentaCorrientePagoId) {
        showToast('No hay una cuenta corriente seleccionada.', 'error');
        return;
    }

    const cuentaId = Number(cuentaCorrientePagoId);
    const cuenta = getCuentaCorrienteById(cuentaCorrientePagoId);
    const amountInput = document.getElementById('account-payment-amount');
    const noteInput = document.getElementById('account-payment-note');
    const monto = amountInput ? parseFloat(amountInput.value) || 0 : 0;
    const observacion = noteInput ? noteInput.value.trim() : '';
    const saldoRestante = Number(cuenta && cuenta.saldo_restante) || 0;

    if (monto <= 0) {
        showToast('Escribí un monto mayor a 0.', 'error');
        return;
    }

    if (monto > saldoRestante) {
        showToast('El monto no puede superar el saldo restante.', 'error');
        return;
    }

    cuentasPagando.add(cuentaId);
    renderCuentasCorrientesTable();

    try {
        const data = await fetchJson(`${API.accounts}?accion=pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cuenta_id: cuentaId,
                monto,
                observacion
            })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        closeAccountPaymentModal();
        await cargarCuentasCorrientes();

        if (typeof cargarInicio === 'function') {
            await cargarInicio();
        }

        if (typeof cargarBalance === 'function') {
            await cargarBalance();
        }

        showToast('Pago registrado en cuenta corriente.', 'venta');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al registrar el pago.'), 'error');
    } finally {
        cuentasPagando.delete(cuentaId);
        renderCuentasCorrientesTable();
    }
}

async function verHistorialPagosCuentaCorriente(id, cliente = 'esta cuenta corriente') {
    try {
        cuentaCorrienteHistorialId = Number(id);
        const data = await fetchJson(`${API.accounts}?id=${Number(id)}`);
        const items = ensureArray(data);
        renderAccountHistoryRows(items);
        openAccountHistoryModal(cliente);
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar el historial de pagos.'), 'error');
    }
}

async function archivarCuentaCorriente(id, cliente) {
    if (!confirm(`Archivar la cuenta corriente de "${cliente}"?`)) {
        return;
    }

    try {
        const data = await fetchJson(`${API.accounts}?accion=archivar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        await cargarCuentasCorrientes();
        showToast('Cuenta corriente archivada.', 'compra');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al archivar la cuenta corriente.'), 'error');
    }
}

function cargarProductosEnSelect() {
    return cargarProductosEnSelects();
}

function abrirModalPago(id) {
    openAccountPaymentModal(id);
}

function registrarPago() {
    return registrarPagoCuentaCorriente();
}

function verHistorialPagos(id, cliente) {
    return verHistorialPagosCuentaCorriente(id, cliente);
}

function archivarCuenta(id, cliente) {
    return archivarCuentaCorriente(id, cliente);
}

async function registrarSueldo() {
    const descripcionInput = document.getElementById('sueldo-descripcion');
    const montoInput = document.getElementById('sueldo-monto');
    const tipoInput = document.getElementById('sueldo-tipo-pago');
    const fechaInicioInput = document.getElementById('sueldo-fecha-inicio');
    const fechaFinInput = document.getElementById('sueldo-fecha-fin');
    const descripcion = descripcionInput ? descripcionInput.value.trim() : '';
    const monto = montoInput ? parseFloat(montoInput.value) || 0 : 0;
    const tipo_pago = tipoInput ? tipoInput.value : 'unico';
    const fecha_inicio = fechaInicioInput ? fechaInicioInput.value : '';
    const fecha_fin = fechaFinInput ? fechaFinInput.value.trim() : '';

    if (!descripcion) {
        showToast('Escribí una descripción del sueldo.', 'error');
        return;
    }

    if (monto <= 0) {
        showToast('Escribí un monto mayor a 0.', 'error');
        return;
    }

    if (!fecha_inicio) {
        showToast('Selecciona la fecha de inicio.', 'error');
        return;
    }

    try {
        const data = await fetchJson(`${API.salaries}?accion=crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion,
                monto,
                tipo_pago,
                fecha_inicio,
                fecha_fin: fecha_fin || null
            })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        if (descripcionInput) {
            descripcionInput.value = '';
        }

        if (montoInput) {
            montoInput.value = '';
        }

        if (tipoInput) {
            tipoInput.value = 'unico';
        }

        if (fechaFinInput) {
            fechaFinInput.value = '';
        }

        if (fechaInicioInput) {
            fechaInicioInput.value = new Date().toISOString().slice(0, 10);
        }

        showToast('Sueldo registrado.', 'venta');
        await cargarSueldos();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al registrar el sueldo.'), 'error');
    }
}

async function guardarCambiosSueldo() {
    if (!sueldoEnEdicionId) {
        showToast('No hay un sueldo seleccionado para modificar.', 'error');
        return;
    }

    const descripcionInput = document.getElementById('editar-sueldo-descripcion');
    const montoInput = document.getElementById('editar-sueldo-monto');
    const tipoInput = document.getElementById('editar-sueldo-tipo-pago');
    const fechaInicioInput = document.getElementById('editar-sueldo-fecha-inicio');
    const fechaFinInput = document.getElementById('editar-sueldo-fecha-fin');
    const descripcion = descripcionInput ? descripcionInput.value.trim() : '';
    const monto = montoInput ? parseFloat(montoInput.value) || 0 : 0;
    const tipo_pago = tipoInput ? tipoInput.value : 'unico';
    const fecha_inicio = fechaInicioInput ? fechaInicioInput.value : '';
    const fecha_fin = fechaFinInput ? fechaFinInput.value.trim() : '';

    if (!descripcion) {
        showToast('Escribí una descripción del sueldo.', 'error');
        return;
    }

    if (monto <= 0) {
        showToast('Escribí un monto mayor a 0.', 'error');
        return;
    }

    if (!fecha_inicio) {
        showToast('Selecciona la fecha de inicio.', 'error');
        return;
    }

    try {
        const data = await fetchJson(`${API.salaries}?accion=modificar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sueldo_id: Number(sueldoEnEdicionId),
                descripcion,
                monto,
                tipo_pago,
                fecha_inicio,
                fecha_fin: fecha_fin || null
            })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        closeSalaryEditModal();
        await cargarSueldos();
        showToast('Sueldo actualizado.', 'venta');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al modificar el sueldo.'), 'error');
    }
}

async function pagarSueldo(id) {
    const sueldoId = Number(id);

    if (sueldosPagando.has(sueldoId)) {
        return;
    }

    sueldosPagando.add(sueldoId);
    renderSueldosTable();

    try {
        const data = await fetchJson(`${API.salaries}?accion=pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sueldo_id: sueldoId })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        await cargarSueldos();

        if (typeof cargarInicio === 'function') {
            await cargarInicio();
        }

        if (typeof cargarBalance === 'function') {
            await cargarBalance();
        }

        showToast('Pago de sueldo registrado.', 'compra');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al pagar el sueldo.'), 'error');
    } finally {
        sueldosPagando.delete(sueldoId);
        renderSueldosTable();
    }
}

async function verHistorial(id, descripcion = 'este sueldo') {
    try {
        historialSueldoAbierto = Number(id);
        const data = await fetchJson(`${API.salaries}?id=${Number(id)}`);
        const items = ensureArray(data);
        renderSalaryHistoryRows(items);
        openSalaryHistoryModal(descripcion);
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar el historial del sueldo.'), 'error');
    }
}

async function eliminarSueldo(id, descripcion) {
    if (!confirm(`Desactivar "${descripcion}"?`)) {
        return;
    }

    try {
        const data = await fetchJson(API.salaries, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });

        if (data && data.error) {
            showToast(data.error, 'error');
            return;
        }

        await cargarSueldos();
        showToast('Sueldo eliminado.', 'compra');
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al eliminar el sueldo.'), 'error');
    }
}

async function cargarInicio() {
    try {
        movimientosInicio = ensureArray(await fetchJson(`${API.movimientos}?filtro=dia`));
        resetVisibleCount('inicio');

        const ingresos = movimientosInicio
            .filter((item) => isIncomeType(item.tipo))
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = movimientosInicio
            .filter((item) => isExpenseType(item.tipo))
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
            .filter((item) => isIncomeType(item.tipo))
            .reduce((sum, item) => sum + Number(item.monto || 0), 0);
        const egresos = movimientosBalance
            .filter((item) => isExpenseType(item.tipo))
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
        const [movimientosData, cuentasData, facturasData] = await Promise.all([
            fetchJson(`${API.movimientos}?filtro=${filtroFacturacionActual}&tipo=venta`),
            fetchJson(API.accounts),
            fetchJson(API.invoices)
        ]);
        const movimientos = ensureArray(movimientosData);
        const ventasCaja = movimientos.filter((item) => {
            return item.tipo === 'venta' && Number(item.producto_id) > 0 && Number(item.monto || 0) > 0;
        });
        const cuentasPayload = Array.isArray(cuentasData) ? { items: cuentasData } : (cuentasData || {});
        const ventasCuentaCorriente = mapCuentaCorrienteItemsToFacturacion(cuentasPayload.items)
            .filter((item) => isFacturacionItemWithinFilter(item, filtroFacturacionActual));
        facturacionIdsFacturados = new Set(ensureArray(facturasData && facturasData.billed_items));

        ventasFacturacion = [...ventasCaja, ...ventasCuentaCorriente]
            .filter((item) => !facturacionIdsFacturados.has(getFacturacionItemId(item)))
            .sort((a, b) => {
                return getFacturacionSortTimestamp(b) - getFacturacionSortTimestamp(a);
            });
        facturacionSeleccionada.clear();
        resetVisibleCount('facturacion');
        renderFacturacionTable();
        updateFacturacionButtonState();
        updateFacturacionSelectionSummary();
    } catch (error) {
        console.error(error);
        showToast(getErrorMessage(error, 'Error al cargar ventas para facturación.'), 'error');
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
        showToast('Escribí el nombre del producto.', 'error');
        return;
    }

    if (!codigo) {
        showToast('Escribí el código del producto.', 'error');
        return;
    }

    if (precio_unitario <= 0) {
        showToast('Escribí un precio mayor a 0.', 'error');
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
