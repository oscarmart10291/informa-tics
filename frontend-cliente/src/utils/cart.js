// frontend-cliente/src/utils/cart.js
const KEY = "cart_cliente";

// 🔔 notificación global para actualizar componentes (CartPanel)
export function notifyCart() {
  window.dispatchEvent(new CustomEvent("cart:update"));
}

function baseCart() {
  return {
    pedidoId: null,       // si vienes a editar un pedido existente
    items: [],            // { id, nombre, precio, qty, nota?, tipo? }
    entrega: "local",     // "local" | "domicilio"
    pago: "efectivo",     // "efectivo" | "tarjeta"
    direccion: "",
    telefono: "",
    receptorNombre: ""    // nombre de quien recibe (solo domicilio)
  };
}

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || baseCart();
  } catch {
    return baseCart();
  }
}

export function setCart(c) {
  localStorage.setItem(KEY, JSON.stringify(c));
  notifyCart();
  return c;
}

export function clearCart() {
  return setCart(baseCart());
}

// item = { id, nombre, precio, nota?, tipo? }   // tipo: 'COMESTIBLE'|'BEBIBLE' o 'PLATILLO'|'BEBIDA'
export function addItem(item) {
  const cart = getCart();
  const idx = cart.items.findIndex(
    i => i.id === item.id && (i.nota || "") === (item.nota || "")
  );
  if (idx >= 0) {
    cart.items[idx].qty += 1;
    if (!cart.items[idx].tipo && item.tipo) cart.items[idx].tipo = item.tipo; // conserva tipo si llega ahora
  } else {
    cart.items.push({ ...item, qty: 1 });
  }
  return setCart(cart);
}

export function setQty(id, qty, nota) {
  const cart = getCart();
  cart.items = cart.items
    .map(i =>
      i.id === id && (i.nota || "") === (nota || "")
        ? { ...i, qty: Math.max(1, Number(qty) || 1) }
        : i
    )
    .filter(i => i.qty > 0);
  return setCart(cart);
}

export function updateNote(id, oldNote, newNote) {
  const cart = getCart();
  cart.items = cart.items.map(i =>
    i.id === id && (i.nota || "") === (oldNote || "")
      ? { ...i, nota: newNote }
      : i
  );
  return setCart(cart);
}

export function removeItem(id, nota) {
  const cart = getCart();
  cart.items = cart.items.filter(
    i => !(i.id === id && (i.nota || "") === (nota || ""))
  );
  return setCart(cart);
}

// === Preferencias del pedido ===
export function setEntrega(v)  {
  const c = getCart();
  c.entrega = v;
  if (v === "local") {
    c.direccion = "";
    c.telefono = "";
    c.receptorNombre = ""; // limpia al pasar a local
  }
  return setCart(c);
}
export function setPago(v)           { const c = getCart(); c.pago = v; return setCart(c); }
export function setDireccion(v)      { const c = getCart(); c.direccion = v; return setCart(c); }
export function setTelefono(v)       { const c = getCart(); c.telefono = v; return setCart(c); }
export function setReceptorNombre(v) { const c = getCart(); c.receptorNombre = v; return setCart(c); }

export function subtotal() {
  const c = getCart();
  return (c.items || []).reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.qty) || 1), 0);
}

// Alias por conveniencia
export function total() { return subtotal(); }

/** Carga un pedido existente al carrito para editarlo en /cliente/pedido */
export function loadPedidoToCart(pedido) {
  const cart = baseCart();
  cart.pedidoId = pedido.id;
  cart.entrega = (pedido.tipoEntrega || "LOCAL").toString().toLowerCase() === "domicilio" ? "domicilio" : "local";
  cart.pago    = (pedido.metodoPago  || "EFECTIVO").toString().toLowerCase() === "tarjeta" ? "tarjeta" : "efectivo";
  cart.direccion = pedido.direccion || "";
  cart.telefono  = pedido.telefono  || "";
  cart.receptorNombre = pedido.receptorNombre || "";
  cart.items = (pedido.items || []).map(it => ({
    id: it.platilloId ?? it.id,
    nombre: it.nombre,
    precio: Number(it.precio),
    qty: Number(it.qty || 1),
    nota: it.nota || ""
    // tipo podría no venir desde historial; se infiere al confirmar si hace falta
  }));
  return setCart(cart);
}

/* ===================== Helpers para imprimir y para la API ===================== */

/**
 * Devuelve el payload estándar para tu API a partir del carrito.
 * (Útil para el POST /cliente/pedidos)
 */
export function payloadParaApi() {
  const c = getCart();
  return {
    tipoEntrega: c.entrega === "domicilio" ? "DOMICILIO" : "LOCAL",
    metodoPago:  c.pago === "tarjeta" ? "TARJETA" : "EFECTIVO",
    direccion: c.direccion || "",
    telefono:  c.telefono  || "",
    nombre:    c.receptorNombre || "",
    items: (c.items || []).map(it => ({
      id: it.id,
      qty: Number(it.qty || 1),
      precio: Number(it.precio || 0),
      nota: it.nota || ""
    }))
  };
}

/**
 * Arma un objeto "pedido" listo para la ticket compacta del historial.
 * Úsalo con imprimirTicketCliente(pedidoDesdeCartParaTicket({...})).
 *
 * @param {Object} extra - datos opcionales del backend (id, codigo, flags de pago…)
 *   Ej: { id, codigo, ticketId, ticketAprobado, ticketPosCorrelativo, ticketMontoRecibido, ticketCambio }
 */
export function pedidoDesdeCartParaTicket(extra = {}) {
  const c = getCart();
  const t = total();

  return {
    // Identificadores opcionales (si vienen del backend)
    id: extra.id,
    codigo: extra.codigo,

    // Entrega / Cliente
    tipoEntrega: c.entrega === "domicilio" ? "DOMICILIO" : "LOCAL",
    clienteNombre: c.receptorNombre || "",
    telefonoEntrega: c.telefono || "",
    direccionEntrega: c.direccion || "",

    // Ítems
    items: (c.items || []).map(it => ({
      id: it.id,
      nombre: (Number(it.qty) || 1) > 1 ? `${it.nombre} (x${Number(it.qty)})` : it.nombre,
      precio: Number(it.precio || 0),
      qty: Number(it.qty || 1),
      nota: it.nota || ""
    })),

    // Totales / Pago
    total: t,
    ticketMetodoPago: c.pago === "tarjeta" ? "TARJETA" : "EFECTIVO",
    metodoPago: c.pago === "tarjeta" ? "TARJETA" : "EFECTIVO", // compatibilidad

    // Opcionales que puede pasar el backend
    ticketId: extra.ticketId,
    ticketAprobado: extra.ticketAprobado,
    ticketPosCorrelativo: extra.ticketPosCorrelativo,
    ticketMontoRecibido: extra.ticketMontoRecibido,
    ticketCambio: extra.ticketCambio,

    // Tiempo (si la ticket muestra fecha)
    creadoEn: new Date().toISOString()
  };
}
