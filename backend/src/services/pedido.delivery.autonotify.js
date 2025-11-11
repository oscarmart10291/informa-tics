// Dispara correos cuando cambia pedidoCliente.deliveryStatus, venga de donde venga.
const { sendEmail } = require('./email');

const UP = (s='') => String(s||'').toUpperCase();
const Q  = (n) => `Q${Number(n||0).toFixed(2)}`;

function itemsHtml(items = []) {
  if (!items?.length) return '<p><em>Sin productos</em></p>';
  const rows = items.map(i => `
    <tr>
      <td style="padding:.25rem .5rem">${i.qty ?? 1}× ${i.nombre}${i.nota ? ` <em style="color:#64748b">(nota: ${i.nota})</em>` : ''}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(i.precio)}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(Number(i.precio) * Number(i.qty || 1))}</td>
    </tr>
  `).join('');
  return `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
      <thead><tr style="background:#f8fafc">
        <th align="left" style="padding:.4rem .5rem">Producto</th>
        <th align="right" style="padding:.4rem .5rem">Precio</th>
        <th align="right" style="padding:.4rem .5rem">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

const mailTpl = {
  ASIGNADO_A_REPARTIDOR: p => ({
    subject: `Pedido #${p.codigo} asignado a repartidor`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif">
        <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} fue asignado a repartidor!</h2>
        <p style="margin:.25rem 0">En breve pasará a recogerlo.</p>
        ${UP(p.tipoEntrega)==='DOMICILIO'?`<p><b>Receptor:</b> ${p.receptorNombre || '-'}</p>`:''}
        ${UP(p.tipoEntrega)==='DOMICILIO'?`<p><b>Dirección:</b> ${p.direccion || '-'}</p>`:''}
        ${itemsHtml(p.items || [])}
        <p style="margin:.75rem 0; font-size:16px"><b>Total: Q${Number(p.total||0).toFixed(2)}</b></p>
      </div>`
  }),
  EN_CAMINO: p => ({
    subject: `Pedido #${p.codigo} en camino`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif">
        <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} va en camino!</h2>
        <p style="margin:.25rem 0">Nuestro repartidor ya salió hacia tu dirección. 🚗💨</p>
        ${UP(p.tipoEntrega)==='DOMICILIO'?`<p><b>Receptor:</b> ${p.receptorNombre || '-'}</p>`:''}
        ${UP(p.tipoEntrega)==='DOMICILIO'?`<p><b>Dirección:</b> ${p.direccion || '-'}</p>`:''}
        ${itemsHtml(p.items || [])}
        <p style="margin:.75rem 0; font-size:16px"><b>Total: Q${Number(p.total||0).toFixed(2)}</b></p>
      </div>`
  }),
  ENTREGADO: p => ({
    subject: `Pedido #${p.codigo} entregado`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif">
        <h2 style="margin:0 0 .25rem">Pedido #${p.codigo} entregado ✅</h2>
        <p style="margin:.25rem 0">¡Gracias por tu compra!</p>
        ${itemsHtml(p.items || [])}
        <p style="margin:.75rem 0; font-size:16px"><b>Total: Q${Number(p.total||0).toFixed(2)}</b></p>
      </div>`
  }),
};

async function maybeNotify(pedido) {
  if (!pedido) return;
  if (UP(pedido.tipoEntrega) !== 'DOMICILIO') return;
  const to = pedido.clienteEmail || pedido.cliente?.correo || pedido.correo;
  if (!to) return;

  const status = UP(pedido.deliveryStatus || '');
  const tpl = mailTpl[status];
  if (!tpl) return;

  const { subject, html } = tpl(pedido);
  try {
    await sendEmail({ to, subject, html });
  } catch (e) {
    console.error('✉️ AutoNotify email error:', e?.message || e);
  }
}

/**
 * Registra un middleware en Prisma para disparar correos
 * cuando se cambie deliveryStatus de PedidoCliente desde cualquier ruta.
 */
function attachPedidoDeliveryAutoNotify(prisma) {
  prisma.$use(async (params, next) => {
    const isPedidoUpdate =
      params.model === 'PedidoCliente' &&
      (params.action === 'update' || params.action === 'upsert' || params.action === 'updateMany');

    const data = params.args?.data || {};
    const touchedDelivery =
      isPedidoUpdate && Object.prototype.hasOwnProperty.call(data, 'deliveryStatus');

    const result = await next(params);

    if (touchedDelivery) {
      try {
        // Para updateMany no tenemos un id directo → mejor recargar por where si aplica,
        // o si hay id, usarlo. Para 99% de casos de app, update es por id.
        const id = result?.id || params.args?.where?.id;
        if (id) {
          const ped = await prisma.pedidoCliente.findUnique({
            where: { id: Number(id) },
            include: { items: true },
          });
          await maybeNotify(ped);
        } else if (params.args?.where) {
          // Fallback para updateMany: intentamos traer los pedidos impactados (pocos casos)
          const list = await prisma.pedidoCliente.findMany({
            where: params.args.where,
            include: { items: true },
          });
          for (const p of list) await maybeNotify(p);
        }
      } catch (e) {
        console.error('AutoNotify delivery hook error:', e?.message || e);
      }
    }

    return result;
  });
}

module.exports = { attachPedidoDeliveryAutoNotify };
