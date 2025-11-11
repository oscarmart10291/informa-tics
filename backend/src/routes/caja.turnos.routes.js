// backend/src/routes/caja.turnos.routes.js
const express = require('express');
const router = express.Router();

const {
  PrismaClient,
  // Si tu enum existe, descomenta y úsalo en vez de strings:
  // CajaTurnoEstado,
} = require('../generated/prisma');

let prisma;
try { ({ prisma } = require('../utils/prisma')); } catch { prisma = new PrismaClient(); }

// Middlewares (se integran con lo que ya tienes en index.js)
let requirePerm = (() => {
  try { return require('../middlewares/requirePerm'); } catch {
    return () => (_req, _res, next) => next(); // dev fallback
  }
})();

let { getUserIdFromReq } = (() => {
  try { return require('../middlewares/ensureCajaAbierta'); } catch {
    return { getUserIdFromReq: (req) => (req.user && req.user.id) || null };
  }
})();

/** 
 * GET /caja/turnos/actual
 * Retorna el turno abierto (si existe)
 */
router.get('/turnos/actual', requirePerm(['CAJA']), async (_req, res) => {
  try {
    const abierta = await prisma.cajaTurno.findFirst({
      where: { estado: 'ABIERTO' }, // o CajaTurnoEstado.ABIERTO
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ ok: true, turno: abierta || null });
  } catch (e) {
    console.error('[caja.turnos.actual]', e);
    return res.status(500).json({ ok: false, error: 'Error consultando turno actual' });
  }
});

/**
 * POST /caja/turnos/aperturar
 * Body: { montoInicial: number, descripcion?: string, sucursalId?: string }
 */
router.post('/turnos/aperturar', requirePerm(['CAJA']), async (req, res) => {
  const userId = getUserIdFromReq(req) || (req.user && req.user.id) || null;
  const { montoInicial = 0, descripcion = null, sucursalId = null } = req.body || {};

  if (!userId) return res.status(401).json({ ok: false, error: 'Usuario no identificado' });

  try {
    // Si tu lógica es por sucursal, filtra también por sucursalId
    const abierta = await prisma.cajaTurno.findFirst({
      where: { estado: 'ABIERTO' } // , sucursalId
    });

    if (abierta) {
      return res.status(400).json({ ok: false, error: 'Ya existe un turno de caja ABIERTO.' });
    }

    const nuevo = await prisma.cajaTurno.create({
      data: {
        estado: 'ABIERTO',                 // o CajaTurnoEstado.ABIERTO
        montoInicial: Number(montoInicial || 0),
        descripcion,
        creadoPorId: userId,              // si tu modelo lo tiene
        aperturaAt: new Date(),           // si tu modelo lo tiene
        // sucursalId,                    // si aplica en tu modelo
      }
    });

    return res.json({ ok: true, turno: nuevo });
  } catch (e) {
    console.error('[caja.turnos.aperturar]', e);
    return res.status(500).json({ ok: false, error: 'Error al aperturar la caja' });
  }
});

/**
 * POST /caja/turnos/cerrar
 * Body: { montoCierre: number, observacion?: string }
 */
router.post('/turnos/cerrar', requirePerm(['CAJA']), async (req, res) => {
  const userId = getUserIdFromReq(req) || (req.user && req.user.id) || null;
  const { montoCierre = 0, observacion = null } = req.body || {};

  if (!userId) return res.status(401).json({ ok: false, error: 'Usuario no identificado' });

  try {
    const abierta = await prisma.cajaTurno.findFirst({
      where: { estado: 'ABIERTO' },
      orderBy: { createdAt: 'desc' }
    });

    if (!abierta) {
      return res.status(400).json({ ok: false, error: 'No hay un turno ABIERTO para cerrar.' });
    }

    const cerrado = await prisma.cajaTurno.update({
      where: { id: abierta.id },
      data: {
        estado: 'CERRADO',                 // o CajaTurnoEstado.CERRADO
        montoCierre: Number(montoCierre || 0),
        observacionCierre: observacion,    // si tu modelo lo tiene
        cerradoPorId: userId,              // si tu modelo lo tiene
        cerradoAt: new Date(),             // si tu modelo lo tiene
      }
    });

    return res.json({ ok: true, turno: cerrado });
  } catch (e) {
    console.error('[caja.turnos.cerrar]', e);
    return res.status(500).json({ ok: false, error: 'Error al cerrar la caja' });
  }
});

module.exports = router;
