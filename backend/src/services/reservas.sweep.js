// backend/src/services/reservas.sweep.js
const { PrismaClient } = require("../generated/prisma");

let prisma;
try { ({ prisma } = require("../utils/prisma")); } catch { prisma = new PrismaClient(); }

// opcional (si existe) para notificar al front por SSE
let { broadcastMesa } = (() => { try { return require("./mesas.events"); } catch { return {}; } })();

async function autoSweepReservasYMesas() {
  const now = new Date();

  // 1) Cancelar no-show: CONFIRMADA/PAGADO vencidas que no se usaron
  const vencidas = await prisma.reserva.findMany({
    where: {
      estado: "CONFIRMADA",
      pagoEstado: "PAGADO",
      hastaHora: { lt: now },
      verificadaPorMeseroId: null,
      aplicadoEnOrdenId: null,
    },
    select: { id: true, mesaId: true },
  });

  if (vencidas.length) {
    const resIds = vencidas.map(r => r.id);
    const mesasIds = [...new Set(vencidas.map(r => r.mesaId))];

    await prisma.$transaction([
      prisma.reserva.updateMany({
        where: { id: { in: resIds } },
        data: {
          estado: "CANCELADA",
          canceladaEn: now,
          refundEstado: "RECHAZADO",
          refundMonto: 0,
          refundMotivo: "No se presentó (auto)",
        },
      }),
      prisma.mesa.updateMany({
        where: { id: { in: mesasIds } },
        data: { estado: "DISPONIBLE", reservadaPor: null },
      }),
    ]);

    try { mesasIds.forEach(mesaId => broadcastMesa?.({ type: "mesa:liberada", mesaId })); } catch {}
  }

  // 2) Mesas marcadas RESERVADA pero sin reserva ACTIVA -> liberar
  const mesasMarcadas = await prisma.mesa.findMany({
    where: { estado: "RESERVADA" },
    select: { id: true },
  });

  if (mesasMarcadas.length) {
    const activas = await prisma.reserva.findMany({
      where: {
        mesaId: { in: mesasMarcadas.map(m => m.id) },
        estado: "CONFIRMADA",
        pagoEstado: "PAGADO",
        fechaHora: { lte: now },
        hastaHora: { gt: now },
      },
      select: { mesaId: true },
    });
    const setActivas = new Set(activas.map(a => a.mesaId));
    const liberar = mesasMarcadas.filter(m => !setActivas.has(m.id)).map(m => m.id);

    if (liberar.length) {
      await prisma.mesa.updateMany({
        where: { id: { in: liberar } },
        data: { estado: "DISPONIBLE", reservadaPor: null },
      });
      try { liberar.forEach(mesaId => broadcastMesa?.({ type: "mesa:liberada", mesaId })); } catch {}
    }
  }

  // 3) Opcional: si hay reserva ACTIVA, asegurar que la mesa esté marcada como RESERVADA
  const activasAhora = await prisma.reserva.findMany({
    where: {
      estado: "CONFIRMADA",
      pagoEstado: "PAGADO",
      fechaHora: { lte: now },
      hastaHora: { gt: now },
    },
    select: { mesaId: true, nombre: true },
  });

  if (activasAhora.length) {
    const nombrePorMesa = new Map(activasAhora.map(a => [a.mesaId, a.nombre]));
    const porMarcar = await prisma.mesa.findMany({
      where: { id: { in: Array.from(nombrePorMesa.keys()) }, estado: { not: "RESERVADA" } },
      select: { id: true },
    });
    if (porMarcar.length) {
      await prisma.$transaction(
        porMarcar.map(m =>
          prisma.mesa.update({
            where: { id: m.id },
            data: { estado: "RESERVADA", reservadaPor: nombrePorMesa.get(m.id) || null },
          })
        )
      );
    }
  }
}

/* ---------- Scheduler ---------- */
let _timer = null;
let _running = false;

async function _tick() {
  if (_running) return;
  _running = true;
  try { await autoSweepReservasYMesas(); }
  catch (e) { console.error("autoSweepReservasYMesas error:", e?.message || e); }
  finally { _running = false; }
}

/** Inicia el barrido automático. */
function startReservasAutoSweep({ everyMs = 60_000 } = {}) {
  if (_timer) return;              // ya iniciado
  setImmediate(_tick);             // primera pasada al arrancar
  _timer = setInterval(_tick, everyMs);
  console.log(`[sweep] reservas/mesas cada ${everyMs}ms`);
}

/** Detiene el barrido (por si lo necesitas en tests). */
function stopReservasAutoSweep() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

module.exports = {
  autoSweepReservasYMesas,
  startReservasAutoSweep,
  stopReservasAutoSweep,
};
