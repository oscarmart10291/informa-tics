// backend/src/services/caja.autosync.js
// Marca automáticamente una orden como PENDIENTE_PAGO cuando:
// - TODOS los items de la orden están LISTO
// - tiene un PedidoCliente enlazado
// - es pickup (NO DOMICILIO)
// - y el método NO fue TARJETA (o sea, pagar en el local)

let broadcastCaja = null;
try {
  ({ broadcastCaja } = require('./caja.events'));
} catch (_) {
  // si no existe, seguimos sin notificar
}

const up = (s='') => String(s||'').toUpperCase();

async function scanAndMarkPendingPayment(prisma) {
  // Órdenes que aún no están en PENDIENTE_PAGO / PAGADA / CANCELADA
  const ordenes = await prisma.orden.findMany({
    where: { estado: { notIn: ['PENDIENTE_PAGO', 'PAGADA', 'CANCELADA'] } },
    include: { items: true },
  });

  for (const o of ordenes) {
    const items = o.items || [];
    if (!items.length) continue;

    const todosListos = items.every(it => up(it.estado) === 'LISTO');
    if (!todosListos) continue;

    // ¿Está ligada a un PedidoCliente?
    const pedido = await prisma.pedidoCliente.findFirst({ where: { ordenId: o.id } });
    if (!pedido) continue;

    const entrega = up(pedido.tipoEntrega);
    const metodo  = up(pedido.metodoPago || '');
    const isPickup      = entrega !== 'DOMICILIO';
    const esPagoEnLocal = metodo !== 'TARJETA'; // 'PAGO_EN_LOCAL' u otro no-tarjeta

    if (isPickup && esPagoEnLocal) {
      await prisma.orden.update({
        where: { id: o.id },
        data: { estado: 'PENDIENTE_PAGO' },
      });
      try { broadcastCaja && broadcastCaja({ type: 'orden_pendiente_pago', ordenId: o.id }); } catch {}
    }
  }
}

function startCajaAutoSync(prisma, intervalMs = 3000) {
  setInterval(() => {
    scanAndMarkPendingPayment(prisma).catch(() => {});
  }, intervalMs);
}

module.exports = { startCajaAutoSync };
