// frontend-cliente/src/utils/ticketClientePDF.js
function qtz(n){ const v=Number(n||0); return Number.isNaN(v)?'Q 0.00':`Q ${v.toFixed(2)}`; }
const hasText = (v) => typeof v === 'string' && v.trim();

const mesaTextoDe = (mesaTexto, mesa) =>
  mesaTexto || (typeof mesa === 'number'
    ? (mesa === 0 ? 'Pedido en línea' : `Mesa ${mesa}`)
    : 'Pedido en línea');

function domicilioBloque(p){
  const te=(p.tipoEntrega||'').toUpperCase();
  if(te!=='DOMICILIO') return '';
  const nombre = p.clienteNombre || p.nombreCliente || p.nombre || '';
  const tel    = p.telefonoEntrega || p.telefono || p.celular || '';
  const dir    = p.direccionEntrega || p.direccion || '';
  const lineas=[];
  if(nombre) lineas.push(`<div><b>Cliente:</b> ${nombre}</div>`);
  if(tel)    lineas.push(`<div><b>Tel:</b> ${tel}</div>`);
  if(dir)    lineas.push(`<div><b>Dirección:</b> ${dir}</div>`);
  if(!lineas.length) return '';
  return `<div style="margin:6px 0" class="muted">${lineas.join('')}</div>`;
}

/** Construye el HTML del ticket (mismo layout que historial) */
export function buildTicketHTMLFromPedido(p){
  const fecha = new Date(p.pagadoEn || p.actualizadoEn || p.creadoEn || Date.now());

  // 👇 función para normalizar el nombre y NO duplicar (xN)
  const displayItem = (it) => {
    const qty = Number(it.qty || 1);
    // quita cualquier "(xN)" que ya venga al final del nombre
    const base = String(it.nombre || '').replace(/\s*\(x\s*\d+\)\s*$/i, '').trim();
    const nombre = qty > 1 ? `${base} (x${qty})` : base;
    return { nombre, precio: Number(it.precio || 0), nota: it.nota };
  };

  const orden = {
    id: p.id,
    codigo: p.codigo,
    mesa: typeof p.mesa==='number' ? p.mesa : null,
    items: (p.items || []).map(displayItem) // 👈 usa la normalización
  };

  const mesaTextoDe = (mesaTexto,mesa)=> mesaTexto || (typeof mesa==='number'?(mesa===0?'Pedido en línea':`Mesa ${mesa}`):'Pedido en línea');
  const mesaStrFromPedido = typeof p.mesa==='number' ? `Mesa ${p.mesa}` : 'Pedido en línea';
  const mesaStr = mesaTextoDe(p.mesaTexto, p.mesa) || mesaStrFromPedido;

  const itemsHtml = (orden.items||[]).map(r=>`
    <tr>
      <td>${r.nombre}${r.nota?` <em style="color:#64748b">(nota: ${r.nota})</em>`:''}</td>
      <td style="text-align:right">Q ${Number(r.precio).toFixed(2)}</td>
    </tr>
  `).join('');

  const totalAPagar = Number(p.total||0);
  const metodo = String(p.ticketMetodoPago || p.metodoPago || '').toUpperCase() || 'EFECTIVO';
  const pagado = !!p.ticketId || p.ticketAprobado === true;
  const posCorrelativo = p.ticketPosCorrelativo || '';
  const rec = typeof p.ticketMontoRecibido==='number'? p.ticketMontoRecibido : (pagado? totalAPagar : 0);
  const cam = typeof p.ticketCambio==='number'? p.ticketCambio : 0;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Ticket #${p.ticketId || orden.id || ''}</title>
<style>
  body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;margin:0;padding:10px}
  .ticket{width:260px;margin:0 auto}
  h1{font-size:14px;text-align:center;margin:8px 0}
  table{width:100%;font-size:12px;border-collapse:collapse}
  .tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}
  .muted{color:#666;font-size:11px}
  @media print { @page { size: auto; margin: 6mm; } }
</style></head>
<body onload="window.focus();window.print();">
  <div class="ticket">
    <h1>Ticket de Venta</h1>
    <div class="muted">${fecha.toLocaleString('es-GT')}</div>
    <div>Orden #${orden.id || ''} • ${orden.codigo || ''} – ${mesaStr}</div>
    ${(() => {
      const te=(p.tipoEntrega||'').toUpperCase();
      if(te!=='DOMICILIO') return '';
      const nombre = p.clienteNombre || p.nombreCliente || p.nombre || '';
      const tel    = p.telefonoEntrega || p.telefono || p.celular || '';
      const dir    = p.direccionEntrega || p.direccion || '';
      const lineas=[];
      if(nombre) lineas.push(`<div><b>Cliente:</b> ${nombre}</div>`);
      if(tel)    lineas.push(`<div><b>Tel:</b> ${tel}</div>`);
      if(dir)    lineas.push(`<div><b>Dirección:</b> ${dir}</div>`);
      return lineas.length ? `<div style="margin:6px 0" class="muted">${lineas.join('')}</div>` : '';
    })()}
    <hr />
    <table>${itemsHtml}</table>
    <div class="tot">
      <div>Total: <strong>Q ${totalAPagar.toFixed(2)}</strong></div>
      <div>Método: ${metodo}</div>
      ${metodo==='TARJETA' ? `<div>POS: ${posCorrelativo || ''}</div>` : ''}
      ${metodo==='EFECTIVO' ? `<div>Recibido: Q ${rec.toFixed(2)} – Cambio: Q ${cam.toFixed(2)}</div>` : ''}
      ${pagado ? '' : `<div class="muted"><em>PENDIENTE DE PAGO</em></div>`}
    </div>
    <p class="muted">No válido como factura</p>
  </div>
</body></html>`;
}

/** Abre una ventana nueva e imprime el ticket */
export function imprimirTicketCliente(p){
  const w = window.open('', '_blank');
  if(!w){ setTimeout(()=>imprimirTicketCliente(p),150); return; }
  const html = buildTicketHTMLFromPedido(p);
  w.document.open(); w.document.write(html); w.document.close();
}
