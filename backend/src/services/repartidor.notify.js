// src/services/repartidor.notify.js
const { PrismaClient, Prisma } = require("../generated/prisma");
const prisma = new PrismaClient();

const { notifyRepartidores, notifyRepartidor } = require("./notificaciones.sse");

/**
 * Crea la notif SOLO si aún no existe (pedidoId, repartidorId, tipo).
 * - Si ya existe: NO emite SSE (así no “vuelve a caer”).
 * - Si no existe: la crea y emite SSE (una sola vez).
 *
 * NOTA: usamos findFirst porque repartidorId puede ser NULL y en Postgres
 * los índices únicos con NULL permiten duplicados; además blindamos contra
 * carreras con try/catch (P2002).
 */
async function upsertRepartidorNotif({ pedidoId, tipo, titulo, cuerpo, repartidorId = null }) {
  const rid = repartidorId == null ? null : Number(repartidorId);

  // 1) ¿Ya existe?
  let existing = await prisma.repartidorNotif.findFirst({
    where: { pedidoId, tipo, repartidorId: rid },
    include: {
      pedido: { select: { id: true, codigo: true, total: true, tipoEntrega: true, deliveryStatus: true } }
    }
  });
  if (existing) return existing; // no re-emitimos SSE

  // 2) Intento crear; si hay carrera, P2002 => releer y devolver
  let created;
  try {
    created = await prisma.repartidorNotif.create({
      data: { pedidoId, repartidorId: rid, tipo, titulo, cuerpo },
      include: {
        pedido: { select: { id: true, codigo: true, total: true, tipoEntrega: true, deliveryStatus: true } }
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      existing = await prisma.repartidorNotif.findFirst({
        where: { pedidoId, tipo, repartidorId: rid },
        include: {
          pedido: { select: { id: true, codigo: true, total: true, tipoEntrega: true, deliveryStatus: true } }
        }
      });
      return existing || null;
    }
    throw e;
  }

  // 3) Solo si REALMENTE se creó, emitimos SSE
  const payload = {
    notifId: created.id,
    pedidoId: created.pedidoId,
    titulo: created.titulo,
    cuerpo: created.cuerpo,
    tipo: created.tipo,
    creadoEn: created.creadoEn,
    pedido: created.pedido,
  };

  try {
    if (created.repartidorId) {
      notifyRepartidor(created.repartidorId, "NUEVO_PEDIDO_REPARTO", payload);
    } else {
      notifyRepartidores("NUEVO_PEDIDO_REPARTO", payload);
    }
  } catch (err) {
    console.error("SSE notify error:", err?.message || err);
  }

  return created;
}

/* Atajos semánticos */
async function notifyPedidoListoParaEntrega(pedido) {
  return upsertRepartidorNotif({
    pedidoId: pedido.id,
    repartidorId: null,
    tipo: "PEDIDO_LISTO",
    titulo: "Pedido listo para reparto",
    cuerpo: `Pedido ${pedido.codigo} listo · Q${Number(pedido.total || 0).toFixed(2)}`
  });
}

async function notifyPedidoAsignadoARepartidor(pedido) {
  if (!pedido.repartidorId) return null;
  return upsertRepartidorNotif({
    pedidoId: pedido.id,
    repartidorId: Number(pedido.repartidorId),
    tipo: "PEDIDO_ASIGNADO",
    titulo: "Pedido asignado",
    cuerpo: `Te asignaron el pedido ${pedido.codigo} · Q${Number(pedido.total || 0).toFixed(2)}`
  });
}

async function notifyPedidoEnCamino(pedido) {
  if (!pedido.repartidorId) return null;
  return upsertRepartidorNotif({
    pedidoId: pedido.id,
    repartidorId: Number(pedido.repartidorId),
    tipo: "EN_CAMINO",
    titulo: "Pedido en camino",
    cuerpo: `Pedido ${pedido.codigo} va en camino`
  });
}

async function notifyPedidoEntregado(pedido) {
  if (!pedido.repartidorId) return null;
  return upsertRepartidorNotif({
    pedidoId: pedido.id,
    repartidorId: Number(pedido.repartidorId),
    tipo: "ENTREGADO",
    titulo: "Pedido entregado",
    cuerpo: `Pedido ${pedido.codigo} entregado`
  });
}

module.exports = {
  upsertRepartidorNotif,
  notifyPedidoListoParaEntrega,
  notifyPedidoAsignadoARepartidor,
  notifyPedidoEnCamino,
  notifyPedidoEntregado,
};
