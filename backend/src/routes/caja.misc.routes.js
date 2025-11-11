// backend/src/routes/caja.misc.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

let { broadcastCaja } = (() => {
  try { return require('../services/caja.events'); } catch { return {}; }
})();

/* =========================
   Helpers básicos
========================= */
function getUserId(req) {
  return Number(req?.user?.id || req?.body?.cajeroId || req?.query?.cajeroId || 0) || null;
}
async function getTurnoAbiertoDe(cajeroId) {
  if (!cajeroId) return null;
  return prisma.cajaTurno.findFirst({
    where: { estado: 'ABIERTA', cajeroId: Number(cajeroId) },
    orderBy: { autorizadoEn: 'desc' },
  });
}
async function requireTurnoAbierto(req, res, next) {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ msg: 'No autenticado' });
    const turno = await getTurnoAbiertoDe(uid);
    if (!turno) return res.status(403).json({ msg: 'Este cajero no tiene una apertura de caja autorizada' });
    req.turnoActual = turno;
    next();
  } catch (e) {
    console.error('[requireTurnoAbierto]', e);
    res.status(500).json({ msg: 'Error verificando turno' });
  }
}

// rango de hoy según HH:mm (00:00–23:59 por defecto)
function rangoHoy(hhFrom = '00:00', hhTo = '23:59') {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const [fh, fm] = String(hhFrom).split(':').map(n => Number(n) || 0);
  const [th, tm] = String(hhTo).split(':').map(n => Number(n) || 0);
  const desde = new Date(y, m, d, fh, fm, 0, 0);
  const hasta = new Date(y, m, d, th, tm, 59, 999);
  return { desde, hasta };
}

/* =========================
   VENTAS DEL DÍA (consulta)
========================= */
router.get('/ventas', async (req, res) => {
  try {
    const metodo = (req.query.metodo || 'Todos').toString().toUpperCase();
    const { desde, hasta } = rangoHoy(req.query.desde || '00:00', req.query.hasta || '23:59');

    const where = { fechaPago: { gte: desde, lte: hasta } };
    if (metodo === 'EFECTIVO' || metodo === 'TARJETA') where.metodoPago = metodo;

    const tickets = await prisma.ticketVenta.findMany({
      where,
      orderBy: { fechaPago: 'desc' },
      include: {
        orden: { select: { codigo: true, mesa: true, meseroId: true } },
        cajero: { select: { id: true, nombre: true } },
      },
    });

    const mOp = (req.query.mOp || '').trim(); // =, >, <, >=, <=
    const mVal = Number(req.query.m);
    let rows = tickets.map(t => ({
      id: t.id,
      hora: t.fechaPago,
      ordenCodigo: t.orden?.codigo || '',
      mesa: t.orden?.mesa ?? null,
      cajero: t.cajero?.nombre || null,
      metodo: t.metodoPago,
      total: Number(t.totalAPagar || 0),
      anticipo: Number(t.anticipoAplicado || 0) || 0,
    }));

    if (!Number.isNaN(mVal) && ['=','>','<','>=','<='].includes(mOp)) {
      rows = rows.filter(r => {
        const v = r.total;
        return (
          (mOp === '='  && v === mVal) ||
          (mOp === '>'  && v >  mVal) ||
          (mOp === '<'  && v <  mVal) ||
          (mOp === '>=' && v >= mVal) ||
          (mOp === '<=' && v <= mVal)
        );
      });
    }

    const totalBruto = rows.reduce((a, r) => a + r.total, 0);

    // efectivo neto del día (recibido - cambio) solo EFECTIVO
    const ticketsEfe = tickets.filter(t => t.metodoPago === 'EFECTIVO');
    const efectivoIngresado = ticketsEfe
      .reduce((a, t) => a + (Number(t.montoRecibido || 0) - Number(t.cambio || 0)), 0);

    // egresos aprobados hoy
    const egresosAprobados = await prisma.egresoCaja.findMany({
      where: {
        estado: 'APROBADO',
        creadoEn: { gte: desde, lte: hasta },
      },
      select: { monto: true },
    });
    const egresosHoy = egresosAprobados.reduce((a, e) => a + Number(e.monto || 0), 0);

    const efectivoNeto = Number((efectivoIngresado - egresosHoy).toFixed(2));
    const promedio = rows.length ? Number((totalBruto / rows.length).toFixed(2)) : 0;

    res.json({
      resumen: {
        tickets: rows.length,
        totalBruto: Number(totalBruto.toFixed(2)),
        efectivoNeto,
        egresosAprobadosHoy: Number(egresosHoy.toFixed(2)),
        promedioPorTicket: promedio,
      },
      rows,
    });
  } catch (e) {
    console.error('GET /ventas', e);
    res.status(500).json({ error: 'Error listando ventas' });
  }
});

/* =========================
   EGRESOS
========================= */

// Resumen del día + lista (del cajero autenticado)
router.get('/egresos/hoy', requireTurnoAbierto, async (req, res) => {
  try {
    const { desde, hasta } = rangoHoy('00:00', '23:59');
    const uid = getUserId(req);

    // efectivo ingresado hoy
    const ticketsEfe = await prisma.ticketVenta.findMany({
      where: { metodoPago: 'EFECTIVO', fechaPago: { gte: desde, lte: hasta } },
      select: { montoRecibido: true, cambio: true },
    });
    const efectivoIngresado = ticketsEfe
      .reduce((a, t) => a + (Number(t.montoRecibido || 0) - Number(t.cambio || 0)), 0);

    // egresos del día (propios)
    const egresosHoy = await prisma.egresoCaja.findMany({
      where: { creadoEn: { gte: desde, lte: hasta }, cajeroId: uid },
      orderBy: { id: 'desc' },
      include: { autorizadoPor: { select: { nombre: true } } },
    });

    const comprometido = egresosHoy
      .filter(e => e.estado !== 'RECHAZADO')
      .reduce((a, e) => a + Number(e.monto || 0), 0);

    const disponible = Number((efectivoIngresado - comprometido).toFixed(2));

    const solicitudes = egresosHoy.map(e => ({
      id: e.id,
      creadoEn: e.creadoEn,
      motivo: e.motivo,
      monto: Number(e.monto || 0),
      estado: e.estado,
      autorizacion: e.autorizadoPor ? `Aprobado por ${e.autorizadoPor.nombre}` : (e.estado === 'RECHAZADO' ? 'Rechazado' : '-'),
      observacion: e.observacion || null,
    }));

    res.json({
      efectivoDia: Number(efectivoIngresado.toFixed(2)),
      comprometido: Number(comprometido.toFixed(2)),
      disponible,
      solicitudes,
      solicitudesCount: solicitudes.length,
    });
  } catch (e) {
    console.error('GET /egresos/hoy', e);
    res.status(500).json({ error: 'Error en resumen de egresos' });
  }
});

// Crear solicitud de egreso (principal)
router.post('/egresos', requireTurnoAbierto, async (req, res) => {
  try {
    const uid = getUserId(req);
    const { monto, motivo } = req.body || {};
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!motivo || String(motivo).trim().length < 3) return res.status(400).json({ error: 'Motivo requerido' });

    const nuevo = await prisma.egresoCaja.create({
      data: {
        cajeroId: uid,
        monto: m,
        motivo: String(motivo).trim(),
        estado: 'PENDIENTE',
      },
      include: { cajero: { select: { id: true, nombre: true } } }
    });

    try { broadcastCaja && broadcastCaja({ type: 'egreso_nuevo', egresoId: nuevo.id }); } catch {}

    res.json({ ok: true, egreso: nuevo });
  } catch (e) {
    console.error('POST /egresos', e);
    res.status(500).json({ error: 'Error creando egreso' });
  }
});

// Alias compatible con UI vieja: POST /egresos/solicitar
router.post('/egresos/solicitar', requireTurnoAbierto, async (req, res) => {
  try {
    const uid = getUserId(req);
    const { monto, motivo } = req.body || {};
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!motivo || String(motivo).trim().length < 3) return res.status(400).json({ error: 'Motivo requerido' });

    const nuevo = await prisma.egresoCaja.create({
      data: { cajeroId: uid, monto: m, motivo: String(motivo).trim(), estado: 'PENDIENTE' },
      include: { cajero: { select: { id: true, nombre: true } } }
    });

    try { broadcastCaja && broadcastCaja({ type: 'egreso_nuevo', egresoId: nuevo.id }); } catch {}

    res.json({ ok: true, egreso: nuevo });
  } catch (e) {
    console.error('POST /egresos/solicitar', e);
    res.status(500).json({ error: 'Error creando egreso' });
  }
});

module.exports = router;
