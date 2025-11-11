// backend/src/services/pedido.delivery.js
const { notifyTicketIfFinal } = require('./orden.finalizado.notify');
const { PrismaClient } = require("../generated/prisma");
const { sendEmail } = require("./email");

// 🔔 PASO 2: servicio para notificar a repartidor
const { notifyPedidoListoParaEntrega } = require("./repartidor.notify");

const prisma = new PrismaClient();

const up = (s='') => String(s||'').toUpperCase();
const Q  = (n) => `Q${Number(n||0).toFixed(2)}`;

function pedidoItemsHtml(items = []) {
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
      <thead>
        <tr style="background:#f8fafc">
          <th align="left"  style="padding:.4rem .5rem">Producto</th>
          <th align="right" style="padding:.4rem .5rem">Precio</th>
          <th align="right" style="padding:.4rem .5rem">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Cuando TODOS los ítems de la orden están LISTO:
 * - Si es DOMICILIO  -> deliveryStatus = LISTO_PARA_ENTREGA (repartidorId = null)
 * - Si es LOCAL      -> deliveryStatus = LISTO_PARA_RECOGER
 * - Marca readyAt y avisa por correo.
 * - 🔔 Si es DOMICILIO, crea notificación para REPARTIDOR (broadcast).
 */
async function evaluatePedidoForDelivery(ordenId) {
  if (!ordenId) return { ok: true, changed: false, reason: "ordenId vacío" };

  // 1) ¿Quedan ítems pendientes?
  const restantes = await prisma.ordenItem.count({
    where: { ordenId, estado: { not: "LISTO" } },
  });
  if (restantes > 0) {
    return { ok: true, changed: false, reason: "Aún hay ítems pendientes" };
  }

  // 2) Obtener pedidoCliente
  const pedido = await prisma.pedidoCliente.findFirst({
    where: { ordenId },
    include: { items: true },
  });
  if (!pedido) return { ok: true, changed: false, reason: "Sin PedidoCliente asociado" };

  const esDom = up(pedido.tipoEntrega) === "DOMICILIO";
  const newDeliveryStatus = esDom ? "LISTO_PARA_ENTREGA" : "LISTO_PARA_RECOGER";

  // 3) Actualizar estado (IMPORTANTE: usar deliveryStatus que consume Reparto)
  const updated = await prisma.pedidoCliente.update({
    where: { id: pedido.id },
    data: {
      deliveryStatus: newDeliveryStatus,
      readyAt: new Date(),
      // DOMICILIO: se mantiene sin repartidor asignado
      ...(esDom ? { repartidorId: null } : {}),
    },
  });

  // 🔔 PASO 2: notificar a REPARTIDOR cuando el pedido quedó LISTO_PARA_ENTREGA (DOMICILIO)
  if (esDom && newDeliveryStatus === "LISTO_PARA_ENTREGA") {
    try {
      await notifyPedidoListoParaEntrega({
        id: updated.id,
        codigo: pedido.codigo,   // ya lo teníamos desde el findFirst
        total: pedido.total ?? 0 // total actual del pedido
      });
    } catch (e) {
      console.error("notifyPedidoListoParaEntrega falló:", e?.message);
    }
  }

  // 4) Correo al cliente
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif">
      <h2 style="margin:0 0 .25rem">¡Tu pedido #${pedido.codigo} está listo!</h2>
      <p style="margin:.25rem 0">
        ${esDom
          ? "Un repartidor pasará a recogerlo en el restaurante en breve."
          : "Puedes pasar a recogerlo en el restaurante."}
      </p>
      ${pedidoItemsHtml(pedido.items || [])}
      <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(pedido.total)}</b></p>
    </div>`;

  try {
    if (pedido.clienteEmail) {
      await sendEmail({
        to: pedido.clienteEmail,
        subject: `Pedido #${pedido.codigo} ${esDom ? "listo para entrega" : "listo para recoger"}`,
        html,
      });
    }
  } catch (err) {
    console.error("✉️ No se pudo enviar correo de pedido listo:", err?.message);
  }

  return { ok: true, changed: true, set: newDeliveryStatus };
}

/**
 * Marca un PedidoCliente como ENTREGADO y dispara el envío del PDF del ticket por correo.
 * Úsalo cuando el repartidor finaliza la entrega.
 *
 * @param {number|string} pedidoClienteId
 * @param {{ repartidorId?: number }} opts  (opcional)
 * @returns {Promise<object>} el registro actualizado de PedidoCliente
 */
async function marcarPedidoEntregado(pedidoClienteId, opts = {}) {
  const id = Number(pedidoClienteId);
  if (!id) throw new Error('pedidoClienteId inválido');

  const updated = await prisma.pedidoCliente.update({
    where: { id },
    data: {
      deliveryStatus: 'ENTREGADO',
      ...(opts.repartidorId ? { repartidorId: Number(opts.repartidorId) } : {}),
      // si tienes columna entregadoAt, descomenta:
      // entregadoAt: new Date(),
    },
  });

  // 🔔 Enviar ticket PDF al cliente (no bloquea la respuesta HTTP)
  try {
    // notifyTicketIfFinal acepta un objeto con id de la orden y deliveryStatus = 'ENTREGADO'
    notifyTicketIfFinal({ id: updated.ordenId, deliveryStatus: 'ENTREGADO' });
  } catch (e) {
    console.error('notifyTicketIfFinal falló:', e?.message);
  }

  return updated;
}

module.exports = {
  evaluatePedidoForDelivery,
  marcarPedidoEntregado,
};
