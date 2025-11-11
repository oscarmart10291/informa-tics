// backend/src/services/barra.assigner.js
const { PrismaClient } = require("../generated/prisma");
const { broadcast } = require("../services/notificaciones.sse"); // ⬅️ SSE
const prisma = new PrismaClient();

const CAPACIDAD_POR_BARTENDER = 4;

// Promueve el ítem más antiguo ASIGNADO a PREPARANDO si el bartender no tiene ninguno preparando
async function promoteNextForBartender(bartenderId) {
  const enPrep = await prisma.ordenItem.count({
    where: { bartenderId, estado: "PREPARANDO" }
  });
  if (enPrep > 0) return;

  const siguiente = await prisma.ordenItem.findFirst({
    where: { bartenderId, estado: "ASIGNADO", tipo: "BEBIDA" },
    orderBy: { asignadoEn: "asc" }
  });
  if (!siguiente) return;

  await prisma.ordenItem.update({
    where: { id: siguiente.id },
    data: { estado: "PREPARANDO", asignadoEn: siguiente.asignadoEn ?? new Date() }
  });
}

// Reasignar un ítem rechazado a OTRO bartender (no al que lo rechazó)
async function reassignItemToAnotherBartender(itemId, excludeBartenderId) {
  const item = await prisma.ordenItem.findUnique({ where: { id: itemId } });
  if (!item || item.estado !== "PENDIENTE" || item.bartenderId !== null || item.tipo !== "BEBIDA") {
    return false;
  }

  // Bartenders activos; si no hay, fallback a rol BARTENDER
  let ids = (await prisma.barraBartender.findMany({ where: { activo: true } }))
    .map(b => b.bartenderId)
    .filter(id => id !== excludeBartenderId);

  if (!ids.length) {
    const bartenders = await prisma.usuario.findMany({
      where: { rol: { nombre: "BARTENDER" }, estado: true, NOT: { id: excludeBartenderId } },
      select: { id: true }
    });
    ids = bartenders.map(b => b.id);
  }
  if (!ids.length) return false;

  const cargas = await Promise.all(
    ids.map(async id => ({
      id,
      abiertos: await prisma.ordenItem.count({
        where: { bartenderId: id, estado: { in: ["ASIGNADO", "PREPARANDO"] } }
      })
    }))
  );
  cargas.sort((a, b) => a.abiertos - b.abiertos);

  const candidato = cargas.find(c => c.abiertos < CAPACIDAD_POR_BARTENDER);
  if (!candidato) return false;

  // Asignar + notificar
  const upd = await prisma.ordenItem.update({
    where: { id: itemId },
    data: { bartenderId: candidato.id, estado: "ASIGNADO", asignadoEn: new Date() },
    include: { orden: { select: { codigo: true, mesa: true } } } // ⬅️ mesa/código para el toast
  });

  try {
    broadcast("BARRA", {
      type: "NUEVO_PEDIDO_BARRA",
      itemId: upd.id,
      nombre: upd.nombre,
      nota: upd.nota,
      ordenCodigo: upd.orden?.codigo || null,
      mesa: upd.orden?.mesa || null,
      creadoEn: new Date().toISOString(),
    });
  } catch {}

  await promoteNextForBartender(candidato.id);
  return true;
}

// Reparte PENDIENTES (BEBIDA) entre bartenders balanceando carga.
// Luego garantiza 1 en PREPARANDO por bartender si tiene cola.
async function rebalanceAssignmentsBarra() {
  console.log("[REB-BARRA] start");

  // 1) Bartenders activos o fallback a rol BARTENDER
  let ids = (await prisma.barraBartender.findMany({ where: { activo: true } }))
    .map(b => b.bartenderId);

  if (!ids.length) {
    const bartenders = await prisma.usuario.findMany({
      where: { rol: { nombre: "BARTENDER" }, estado: true },
      select: { id: true }
    });
    ids = bartenders.map(b => b.id);
    console.log("[REB-BARRA] sin activos, usando bartenders:", ids);
  }
  if (!ids.length) {
    console.log("[REB-BARRA] no hay bartenders disponibles");
    return;
  }

  // 2) Pool PENDIENTE sin bartender (BEBIDA)
  const pool = await prisma.ordenItem.findMany({
    where: { estado: "PENDIENTE", bartenderId: null, tipo: "BEBIDA" },
    orderBy: { creadoEn: "asc" }
  });
  console.log("[REB-BARRA] pendientes sin bartender:", pool.length);

  // 3) Balanceo por carga
  const cargas = await Promise.all(
    ids.map(async id => ({
      id,
      abiertos: await prisma.ordenItem.count({
        where: { bartenderId: id, estado: { in: ["ASIGNADO", "PREPARANDO"] } }
      })
    }))
  );
  cargas.sort((a, b) => a.abiertos - b.abiertos);

  for (const b of cargas) {
    const capacidad = Math.max(0, CAPACIDAD_POR_BARTENDER - b.abiertos);
    if (capacidad <= 0) continue;

    const aAsignar = pool.splice(0, capacidad);
    for (const item of aAsignar) {
      const upd = await prisma.ordenItem.update({
        where: { id: item.id },
        data: { bartenderId: b.id, estado: "ASIGNADO", asignadoEn: new Date() },
        include: { orden: { select: { codigo: true, mesa: true } } } // ⬅️
      });
      console.log("[REB-BARRA] asignado item", item.id, "-> bartender", b.id);

      // 🔔 Toast en BARRA
      try {
        broadcast("BARRA", {
          type: "NUEVO_PEDIDO_BARRA",
          itemId: upd.id,
          nombre: upd.nombre,
          nota: upd.nota,
          ordenCodigo: upd.orden?.codigo || null,
          mesa: upd.orden?.mesa || null,
          creadoEn: new Date().toISOString(),
        });
      } catch {}
    }
  }

  // 4) Auto-promoción por bartender
  for (const b of cargas) {
    await promoteNextForBartender(b.id);
  }

  console.log("[REB-BARRA] end");
}

module.exports = {
  rebalanceAssignmentsBarra,
  promoteNextForBartender,
  reassignItemToAnotherBartender
};
