// backend/src/services/ticket.html.js
const up  = (s='') => String(s||'').toUpperCase();
const qtz = (n) => `Q ${(Number(n||0)).toFixed(2)}`;
const mesaTextoDe = (mesaTexto, mesa) =>
  mesaTexto || (typeof mesa === 'number'
    ? (mesa === 0 ? 'Pedido en línea' : `Mesa ${mesa}`)
    : 'Pedido en línea');

function headerOrdenLinea({ id, codigo }, mesaStr) {
  const code = codigo || '•';
  return `<div class="muted" style="margin:2px 0 6px">Orden #${id || ''} • ${code} – ${mesaStr}</div>`;
}

function clienteBloque(pedidoLike = {}) {
  const nom = pedidoLike.clienteNombre || pedidoLike.nombreCliente || pedidoLike.nombre || pedidoLike.receptorNombre || '';
  const tel = pedidoLike.telefonoEntrega || pedidoLike.telefono || pedidoLike.celular || '';
  const dir = pedidoLike.direccionEntrega || pedidoLike.direccion || '';
  const rows = [];
  if (nom) rows.push(`<div><b>Cliente:</b> ${nom}</div>`);
  if (tel) rows.push(`<div><b>Tel:</b> ${tel}</div>`);
  if (dir) rows.push(`<div><b>Dirección:</b> ${dir}</div>`);
  if (!rows.length) return '';
  return `<div class="muted" style="margin:6px 0 8px">${rows.join('')}</div>`;
}

function itemsBloque(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map(r => {
    const qty = Number(r.qty || 1);
    const name = `${qty > 1 ? `${qty}× ` : ''}${r.nombre || ''}${r.nota ? ` <em style="color:#64748b">(nota: ${r.nota})</em>` : ''}`;
    const sub  = Number(r.precio || 0) * qty;
    return `
      <tr>
        <td style="padding:4px 0">${name}</td>
        <td style="padding:4px 0; text-align:right">${qtz(sub)}</td>
      </tr>`;
  }).join('');
  return `<table class="items"><tbody>${rows}</tbody></table>`;
}

function posTexto(ticket, pedidoLike) {
  if (up(ticket?.metodoPago) !== 'TARJETA') return '';
  const online = /(EN\s*LINEA|ONLINE)/i.test(String(pedidoLike?.metodoPago || pedidoLike?.tipoPago || ''));
  const txt = ticket?.posCorrelativo || (online ? 'ONLINE' : '');
  return `<div>POS: ${txt || ''}</div>`;
}

function htmlSkeleton(inner, title='Ticket'){
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${title}</title>
<style>
  body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;margin:0;padding:10px}
  .ticket{width:260px;margin:0 auto}
  h1{font-size:14px;text-align:center;margin:8px 0}
  .muted{color:#666;font-size:11px}
  .thin{border:0;border-top:1px solid #999;margin:6px 0}
  .dash{margin:8px 0 10px;border:0;border-top:1px dashed #999}
  .big{font-size:16px;font-weight:700}
  table.items{width:100%;font-size:12px;border-collapse:collapse}
</style></head><body>
${inner}
</body></html>`;
}

/* ====== TICKET a partir de un ticket de venta (con items) ====== */
function ticketHtmlFromTicket(ticket, pedidoLike) {
  const fecha = new Date(ticket.fechaPago || Date.now());
  const orden  = ticket.orden || {}; // si el mailer inyecta orden con items
  const mesaStr = mesaTextoDe(pedidoLike?.mesaTexto, pedidoLike?.mesa);

  // Usamos items de la orden si existen (qty, nota, precio)
  const items = (orden.items || []).map(it => ({
    nombre: it.nombre, nota: it.nota, precio: Number(it.precio || 0), qty: Number(it.qty || 1),
  }));

  const inner = `
  <div class="ticket">
    <h1>Ticket de Venta</h1>
    <div class="muted">${fecha.toLocaleString('es-GT')}</div>
    ${headerOrdenLinea({ id: orden.id, codigo: orden.codigo }, mesaStr)}
    ${clienteBloque(pedidoLike)}
    <hr class="thin" />
    ${itemsBloque(items)}
    <hr class="dash" />
    <div class="tot">
      <div class="big">Total: ${qtz(Number(ticket.totalAPagar || 0))}</div>
      <div>Método: ${up(ticket.metodoPago || '')}</div>
      ${posTexto(ticket, pedidoLike)}
      ${up(ticket.metodoPago) === 'EFECTIVO'
        ? `<div>Recibido: ${qtz(Number(ticket.montoRecibido || 0))} – Cambio: ${qtz(Number(ticket.cambio || 0))}</div>`
        : ''
      }
    </div>
    <p class="muted" style="margin-top:10px">No válido como factura</p>
  </div>`;
  return htmlSkeleton(inner, `Ticket #${ticket.id}`);
}

/* ====== Fallback: TICKET a partir del pedido (si no hay ticket guardado) ====== */
function ticketHtmlFromPedido(p) {
  const fecha = new Date(p.pagadoEn || p.actualizadoEn || p.creadoEn || Date.now());
  const mesaStr = mesaTextoDe(p.mesaTexto, p.mesa);

  const items = (p.items || []).map(it => ({
    nombre: it.nombre,
    nota: it.nota,
    precio: Number(it.precio || 0),
    qty: Number(it.qty || 1),
  }));

  const metodo = up(p.ticketMetodoPago || p.metodoPago || 'EFECTIVO');
  const pos    = p.ticketPosCorrelativo ||
                 (/(EN\s*LINEA|ONLINE)/i.test(String(p.metodoPago||'')) ? 'ONLINE' : '');

  const inner = `
  <div class="ticket">
    <h1>Ticket de Venta</h1>
    <div class="muted">${fecha.toLocaleString('es-GT')}</div>
    ${headerOrdenLinea({ id: p.id, codigo: p.codigo }, mesaStr)}
    ${clienteBloque(p)}
    <hr class="thin" />
    ${itemsBloque(items)}
    <hr class="dash" />
    <div class="tot">
      <div class="big">Total: ${qtz(Number(p.total || 0))}</div>
      <div>Método: ${metodo}</div>
      ${metodo === 'TARJETA' ? `<div>POS: ${pos || ''}</div>` : ''}
      ${metodo === 'EFECTIVO'
        ? `<div>Recibido: ${qtz(Number(p.ticketMontoRecibido || 0))} – Cambio: ${qtz(Number(p.ticketCambio || 0))}</div>`
        : ''
      }
      ${p.ticketId || p.ticketAprobado ? '' : `<div class="muted"><em>PENDIENTE DE PAGO</em></div>`}
    </div>
    <p class="muted" style="margin-top:10px">No válido como factura</p>
  </div>`;
  return htmlSkeleton(inner, `Ticket ${p.codigo || p.id || ''}`);
}

module.exports = { ticketHtmlFromTicket, ticketHtmlFromPedido };
