let movimientos = [];
let filtroActual = "dia";

const fechaHoy = document.getElementById("fecha-hoy");
const hoy = new Date();

fechaHoy.textContent = hoy.toLocaleDateString("es-AR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric"
});

function showSection(id, btn) {
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.remove("active");
  });

  document.querySelectorAll(".nav-btn").forEach((navBtn) => {
    navBtn.classList.remove("active");
  });

  document.getElementById(id).classList.add("active");
  btn.classList.add("active");

  if (id === "inicio") renderInicio();
  if (id === "balance") renderBalance();
  if (id === "stock") renderStock();
}

function showToast(msg, tipo) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show ${tipo}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

function fmt(n) {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function registrar(tipo) {
  const prefijo = tipo === "venta" ? "v" : "c";
  const producto = document.getElementById(`${prefijo}-producto`).value;
  const kg = parseFloat(document.getElementById(`${prefijo}-kg`).value) || 0;
  const monto = parseFloat(document.getElementById(`${prefijo}-monto`).value) || 0;
  const obs = document.getElementById(`${prefijo}-obs`).value.trim();

  if (kg <= 0 || monto <= 0) {
    showToast("Completá cantidad y monto.", "error");
    return;
  }

  movimientos.unshift({
    tipo,
    producto,
    kg,
    monto,
    obs,
    fecha: new Date()
  });

  document.getElementById(`${prefijo}-kg`).value = "";
  document.getElementById(`${prefijo}-monto`).value = "";
  document.getElementById(`${prefijo}-obs`).value = "";

  showToast(
    tipo === "venta" ? "Venta registrada" : "Compra registrada",
    tipo
  );

  renderInicio();
}

function renderInicio() {
  const hoyStr = new Date().toDateString();
  const movHoy = movimientos.filter((mov) => mov.fecha.toDateString() === hoyStr);
  const ingresos = movHoy
    .filter((mov) => mov.tipo === "venta")
    .reduce((suma, mov) => suma + mov.monto, 0);
  const egresos = movHoy
    .filter((mov) => mov.tipo === "compra")
    .reduce((suma, mov) => suma + mov.monto, 0);
  const balance = ingresos - egresos;

  document.getElementById("stat-ingresos").textContent = fmt(ingresos);
  document.getElementById("stat-egresos").textContent = fmt(egresos);

  const balanceEl = document.getElementById("stat-balance");
  balanceEl.textContent = fmt(balance);
  balanceEl.className = `stat-value ${balance >= 0 ? "blue" : "red"}`;

  const tbody = document.getElementById("tabla-inicio");
  const recientes = movimientos.slice(0, 10);

  if (!recientes.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Aún no hay movimientos registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = recientes.map((mov) => {
    const hora = mov.fecha.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const signo = mov.tipo === "venta" ? "+" : "-";
    const claseMonto = mov.tipo === "venta" ? "amount-pos" : "amount-neg";
    const tipoTexto = mov.tipo === "venta" ? "Venta" : "Compra";

    return `
      <tr>
        <td><span class="badge badge-${mov.tipo}">${tipoTexto}</span></td>
        <td>${mov.producto}</td>
        <td>${mov.kg} kg</td>
        <td class="${claseMonto}">${signo}${fmt(mov.monto)}</td>
        <td class="text-hint">${hora}</td>
      </tr>`;
  }).join("");
}

function setFiltro(filtro, el) {
  filtroActual = filtro;

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  el.classList.add("active");
  renderBalance();
}

function filtrarPorPeriodo(lista) {
  const ahora = new Date();

  return lista.filter((mov) => {
    if (filtroActual === "dia") {
      return mov.fecha.toDateString() === ahora.toDateString();
    }

    if (filtroActual === "semana") {
      return ahora - mov.fecha < 7 * 24 * 60 * 60 * 1000;
    }

    if (filtroActual === "mes") {
      return mov.fecha.getMonth() === ahora.getMonth()
        && mov.fecha.getFullYear() === ahora.getFullYear();
    }

    return true;
  });
}

function renderBalance() {
  const movs = filtrarPorPeriodo(movimientos);
  const ingresos = movs
    .filter((mov) => mov.tipo === "venta")
    .reduce((suma, mov) => suma + mov.monto, 0);
  const egresos = movs
    .filter((mov) => mov.tipo === "compra")
    .reduce((suma, mov) => suma + mov.monto, 0);
  const balance = ingresos - egresos;

  document.getElementById("b-ingresos").textContent = fmt(ingresos);
  document.getElementById("b-egresos").textContent = fmt(egresos);
  document.getElementById("b-count").textContent = movs.length;

  const balanceEl = document.getElementById("b-total");
  balanceEl.textContent = (balance >= 0 ? "+" : "") + fmt(balance);
  balanceEl.className = `bl-value ${balance >= 0 ? "positivo" : "negativo"}`;

  const tbody = document.getElementById("tabla-balance");

  if (!movs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin movimientos en este período.</td></tr>';
    return;
  }

  tbody.innerHTML = movs.map((mov) => {
    const fecha = mov.fecha.toLocaleDateString("es-AR");
    const hora = mov.fecha.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const signo = mov.tipo === "venta" ? "+" : "-";
    const claseMonto = mov.tipo === "venta" ? "amount-pos" : "amount-neg";
    const tipoTexto = mov.tipo === "venta" ? "Venta" : "Compra";

    return `
      <tr>
        <td>${fecha}</td>
        <td class="text-hint">${hora}</td>
        <td><span class="badge badge-${mov.tipo}">${tipoTexto}</span></td>
        <td>${mov.producto}</td>
        <td>${mov.kg} kg</td>
        <td class="${claseMonto}">${signo}${fmt(mov.monto)}</td>
      </tr>`;
  }).join("");
}

function renderStock() {
  const stock = {};

  movimientos.forEach((mov) => {
    if (!stock[mov.producto]) stock[mov.producto] = 0;
    stock[mov.producto] += mov.tipo === "compra" ? mov.kg : -mov.kg;
  });

  const lista = document.getElementById("stock-lista");
  const productos = Object.keys(stock);

  if (!productos.length) {
    lista.innerHTML = '<p class="empty">El stock se calcula automáticamente a partir de las compras y ventas registradas.</p>';
    return;
  }

  lista.innerHTML = productos.map((producto) => {
    const kg = stock[producto];
    const alerta = kg < 5;

    return `
      <div class="stock-row">
        <span class="stock-nombre">${producto}</span>
        <span class="stock-kg ${alerta ? "alerta" : ""}">
          ${kg.toFixed(1)} kg
          ${alerta ? '<span class="stock-tag">stock bajo</span>' : ""}
        </span>
      </div>`;
  }).join("");
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section, btn);
    });
  });

  document.querySelectorAll("[data-register]").forEach((btn) => {
    btn.addEventListener("click", () => {
      registrar(btn.dataset.register);
    });
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFiltro(btn.dataset.filter, btn);
    });
  });
}

bindEvents();
renderInicio();
