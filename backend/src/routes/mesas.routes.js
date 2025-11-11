// backend/src/routes/mesas.routes.js
const express = require('express');
const { PrismaClient, MesaEstado } = require("../generated/prisma");
const requirePerm = require('../middlewares/requirePerm');
const { addClient, broadcastMesa } = require('../services/mesas.events');

const prisma = new PrismaClient();
const router = express.Router();

const toInt = (v) =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v))
    ? null
    : Number(v);

/* ===================== SSE público ===================== */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  addClient(res);
});

/* ===================== Barrido auto ===================== */
async function autoSweepReservasYMesas() {
  const now = new Date();

  // 1) No-show
  const vencidas = await prisma.reserva.findMany({
    where: {
      estado: 'CONFIRMADA',
      pagoEstado: 'PAGADO',
      hastaHora: { lt: now },
      verificadaPorMeseroId: null,
      aplicadoEnOrdenId: null,
    },
    select: { id: true, mesaId: true },
  });

  if (vencidas.length) {
    const resIds   = vencidas.map(r => r.id);
    const mesasIds = [...new Set(vencidas.map(r => r.mesaId))];

    await prisma.$transaction([
      prisma.reserva.updateMany({
        where: { id: { in: resIds } },
        data: {
          estado: 'CANCELADA',
          canceladaEn: now,
          refundEstado: 'RECHAZADO',
          refundMonto: 0,
          refundMotivo: 'No se presentó (auto)',
        },
      }),
      prisma.mesa.updateMany({
        where: { id: { in: mesasIds } },
        data: { estado: 'DISPONIBLE', reservadaPor: null },
      }),
    ]);

    try { mesasIds.forEach(mesaId => broadcastMesa({ type: 'mesa:liberada', mesaId })); } catch {}
  }

  // 2) Mesas en RESERVADA pero sin reserva ACTIVA ahora -> liberar
  const mesasMarcadas = await prisma.mesa.findMany({
    where: { estado: 'RESERVADA' },
    select: { id: true },
  });

  if (mesasMarcadas.length) {
    const activas = await prisma.reserva.findMany({
      where: {
        mesaId: { in: mesasMarcadas.map(m => m.id) },
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        fechaHora: { lte: now },
        hastaHora: { gt: now },
      },
      select: { mesaId: true },
    });
    const setActivas = new Set(activas.map(a => a.mesaId));
    const liberarIds = mesasMarcadas.filter(m => !setActivas.has(m.id)).map(m => m.id);

    if (liberarIds.length) {
      await prisma.mesa.updateMany({
        where: { id: { in: liberarIds } },
        data: { estado: 'DISPONIBLE', reservadaPor: null },
      });
      try { liberarIds.forEach(mesaId => broadcastMesa({ type: 'mesa:liberada', mesaId })); } catch {}
    }
  }

  // 3) asegurar que mesas con reserva ACTIVA estén marcadas como RESERVADA
  const activasAhora = await prisma.reserva.findMany({
    where: {
      estado: 'CONFIRMADA',
      pagoEstado: 'PAGADO',
      fechaHora: { lte: now },
      hastaHora: { gt: now },
    },
    select: { mesaId: true, nombre: true },
  });
  if (activasAhora.length) {
    const ids = activasAhora.map(a => a.mesaId);
    const porIdNombre = new Map(activasAhora.map(a => [a.mesaId, a.nombre]));
    const paraMarcar = await prisma.mesa.findMany({
      where: { id: { in: ids }, estado: { not: 'RESERVADA' } },
      select: { id: true },
    });
    if (paraMarcar.length) {
      await prisma.$transaction(
        paraMarcar.map(m =>
          prisma.mesa.update({
            where: { id: m.id },
            data: { estado: 'RESERVADA', reservadaPor: porIdNombre.get(m.id) || null },
          })
        )
      );
    }
  }
}

/* ===================== Estado calculado ===================== */
async function listWithComputedEstado({ onlyActive = false } = {}) {
  const now = new Date();

  const whereMesas = onlyActive ? { activa: true } : {};
  const [mesas, abiertas, reservasActivas] = await Promise.all([
    prisma.mesa.findMany({ where: whereMesas, orderBy: [{ numero: 'asc' }] }),
    prisma.orden.findMany({ where: { finishedAt: null }, select: { mesa: true } }),
    prisma.reserva.findMany({
      where: {
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        fechaHora: { lte: now },
        hastaHora: { gt: now },
      },
      select: { mesaId: true, nombre: true },
    }),
  ]);

  const ocupadasPorOrden = new Set((abiertas || []).map(o => o.mesa));
  const nombrePorMesaId  = new Map(reservasActivas.map(r => [r.mesaId, r.nombre]));

  return (mesas || []).map(m => {
    if (ocupadasPorOrden.has(m.numero)) return { ...m, estado: 'OCUPADA' };
    const nombre = nombrePorMesaId.get(m.id) || null;
    if (nombre) return { ...m, estado: 'RESERVADA', reservadaPor: nombre };
    return { ...m, estado: 'DISPONIBLE', reservadaPor: null };
  });
}

/* ===================== Resumen (mesero/bartender) ===================== */
// ⬇️ ahora SÓLO mesas activas
router.get('/resumen', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await autoSweepReservasYMesas();
    const out = await listWithComputedEstado({ onlyActive: true });
    res.json(out);
  } catch (e) {
    console.error('GET /mesas/resumen', e);
    res.status(500).json({ error: 'No se pudieron obtener las mesas' });
  }
});

/* ============ Status por número (SIN modificar schema) ============ */
/**
 * Devuelve datos de la mesa por número + datos mínimos de reserva ACTIVA.
 * Como el schema no tiene personas/pax, minRaciones = 0.
 * Respuesta: { id, numero, estado, reservadaPor, minimoReserva, minRaciones, reservaId, reservaRango }
 */
router.get('/:numero/status', requirePerm([], { strict: false }), async (req, res) => {
  try {
    const numero = Number(req.params.numero);
    if (!Number.isFinite(numero)) return res.status(400).json({ error: 'Número inválido' });

    const mesa = await prisma.mesa.findFirst({
      where: { numero },
      select: { id: true, numero: true, estado: true, reservadaPor: true }
    });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const now = new Date();
    const reserva = await prisma.reserva.findFirst({
      where: {
        mesaId: mesa.id,
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        fechaHora: { lte: now },
        hastaHora: { gte: now },
      },
      orderBy: { fechaHora: 'desc' },
      select: { id: true, monto: true, fechaHora: true, hastaHora: true,
        personas: true, cantidadPersonas: true, pax: true, asistentes: true, cantidad: true }
    });

    // Personas opcional (si tu schema no tiene, quedará 0)
    const cand = [reserva?.personas, reserva?.cantidadPersonas, reserva?.pax, reserva?.asistentes, reserva?.cantidad]
      .map(Number).find(v => Number.isFinite(v) && v > 0);
    const personas = cand || 0;

    res.json({
      id: mesa.id,
      numero: mesa.numero,
      estado: mesa.estado,
      reservadaPor: mesa.reservadaPor || null,
      minimoReserva: Number(reserva?.monto || 0), // <<-- MONTO MÍNIMO EN Q
      minRaciones: personas,                      // <<-- raciones/personas (0 si no hay)
      reservaId: reserva?.id || null,
      reservaRango: reserva ? { desde: reserva.fechaHora, hasta: reserva.hastaHora } : null
    });
  } catch (e) {
    console.error('GET /mesas/:numero/status', e);
    res.status(500).json({ error: 'No se pudo obtener el estado de la mesa' });
  }
});






/* ===================== Listar (admin) ===================== */
router.get(
  '/',
  requirePerm(['CONFIGURAR_MESAS'], { strict: false }),
  async (_req, res) => {
    try {
      const out = await listWithComputedEstado({ onlyActive: false });
      res.json(out);
    } catch (e) {
      console.error('GET /mesas', e);
      res.status(500).json({ error: 'No se pudieron obtener las mesas' });
    }
  }
);

/* ===================== Mesas disponibles (crear orden) ===================== */
router.get(
  '/disponibles',
  requirePerm([], { strict: false }),
  async (_req, res) => {
    try {
      const now = new Date();

      const [mesas, abiertas, activas] = await Promise.all([
        prisma.mesa.findMany({ where: { activa: true }, orderBy: [{ numero: 'asc' }] }),
        prisma.orden.findMany({ where: { finishedAt: null }, select: { mesa: true } }),
        prisma.reserva.findMany({
          where: {
            estado: 'CONFIRMADA',
            pagoEstado: 'PAGADO',
            fechaHora: { lte: now },
            hastaHora: { gt: now },
          },
          select: { mesaId: true },
        }),
      ]);

      const ocupadas = new Set((abiertas || []).map(o => o.mesa));
      const reservadasAhora = new Set((activas || []).map(a => a.mesaId));

      const disponibles = (mesas || []).filter(
        m => !ocupadas.has(m.numero) && !reservadasAhora.has(m.id)
      );

      res.json(disponibles);
    } catch (e) {
      console.error('GET /mesas/disponibles', e);
      res.status(500).json({ error: 'No se pudieron obtener las mesas disponibles' });
    }
  }
);

/* ===================== Crear mesa (admin) ===================== */
router.post(
  '/',
  requirePerm(['CONFIGURAR_MESAS'], { strict: false }),
  async (req, res) => {
    try {
      let { numero, capacidad } = req.body || {};
      numero = Number(numero);
      capacidad = Number(capacidad);

      if (!Number.isInteger(numero) || numero < 1) {
        return res.status(400).json({ error: 'numero inválido' });
      }
      if (!Number.isInteger(capacidad) || capacidad < 1) {
        return res.status(400).json({ error: 'capacidad inválido' });
      }

      const mesa = await prisma.mesa.create({
        data: {
          numero,
          capacidad,
          estado: MesaEstado.DISPONIBLE,
          reservadaPor: null,
        },
      });

      broadcastMesa({ type: 'mesa_created', mesa });
      return res.status(201).json(mesa);
    } catch (e) {
      console.error('POST /mesas ERR:', e?.code, e?.message, e?.meta);
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'El número de mesa ya existe' });
      }
      return res.status(500).json({ error: 'No se pudo crear la mesa' });
    }
  }
);

/* ===================== Editar (admin) ===================== */
router.patch(
  '/:id',
  requirePerm(['CONFIGURAR_MESAS'], { strict: false }),
  async (req, res) => {
    try {
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const data = {};
      if (req.body.numero != null) {
        const n = toInt(req.body.numero);
        if (!n || n < 1) return res.status(400).json({ error: 'numero inválido' });
        data.numero = n;
      }
      if (req.body.capacidad != null) {
        const c = toInt(req.body.capacidad);
        if (!c || c < 1) return res.status(400).json({ error: 'capacidad inválido' });
        data.capacidad = c;
      }

      const mesa = await prisma.mesa.update({ where: { id }, data });
      broadcastMesa({ type: 'mesa_updated', mesa });
      res.json(mesa);
    } catch (e) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'El número de mesa ya existe' });
      }
      console.error('PATCH /mesas/:id', e);
      res.status(500).json({ error: 'No se pudo actualizar la mesa' });
    }
  }
);

/* ===================== Eliminar mesa (admin) ===================== */
router.delete(
  '/:id',
  requirePerm(['CONFIGURAR_MESAS'], { strict: false }),
  async (req, res) => {
    try {
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const mesa = await prisma.mesa.findUnique({
        where: { id },
        select: { id: true, numero: true },
      });
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

      const ordenAbierta = await prisma.orden.findFirst({
        where: { mesa: mesa.numero, finishedAt: null },
        select: { id: true },
      });
      if (ordenAbierta) {
        return res.status(409).json({ error: 'La mesa está siendo usada por un mesero' });
      }

      const now = new Date();
      const reservaPendiente = await prisma.reserva.findFirst({
        where: {
          mesaId: mesa.id,
          estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
          hastaHora: { gt: now },
        },
        select: { id: true },
      });
      if (reservaPendiente) {
        return res.status(409).json({ error: 'Mesa con reserva pendiente' });
      }

      await prisma.mesa.delete({ where: { id } });
      try { broadcastMesa({ type: 'mesa_deleted', mesaId: id, numero: mesa.numero }); } catch {}

      return res.json({ ok: true, mensaje: 'Mesa eliminada' });
    } catch (e) {
      if (e?.code === 'P2003') {
        return res.status(409).json({
          error: 'No se puede eliminar por historial relacionado. Considera desactivarla.',
        });
      }
      console.error('DELETE /mesas/:id', e);
      return res.status(500).json({ error: 'No se pudo eliminar la mesa' });
    }
  }
);

/* ===================== Activar / Desactivar mesa ===================== */
router.patch('/:id/activar', requirePerm(['CONFIGURAR_MESAS'], { strict: false }), async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const { activa } = req.body || {};
    if (typeof activa !== 'boolean') {
      return res.status(400).json({ error: 'Campo "activa" debe ser booleano' });
    }

    const mesa = await prisma.mesa.findUnique({ where: { id }, select: { id: true, numero: true } });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    if (activa === false) {
      const ordenAbierta = await prisma.orden.findFirst({
        where: { mesa: mesa.numero, finishedAt: null },
        select: { id: true },
      });
      if (ordenAbierta) return res.status(409).json({ error: 'Mesa en uso (orden abierta)' });

      const now = new Date();
      const reservaPendiente = await prisma.reserva.findFirst({
        where: {
          mesaId: mesa.id,
          estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
          hastaHora: { gt: now },
        },
        select: { id: true },
      });
      if (reservaPendiente) return res.status(409).json({ error: 'Mesa con reserva pendiente o activa' });
    }

    const upd = await prisma.mesa.update({ where: { id }, data: { activa } });
    broadcastMesa({ type: 'mesa_toggle', mesa: upd });
    res.json(upd);
  } catch (e) {
    console.error('PATCH /mesas/:id/activar', e);
    res.status(500).json({ error: 'No se pudo cambiar el estado de la mesa' });
  }
});

/* ===================== Reservar / Liberar (admin) ===================== */
router.patch(
  '/:id/reservar',
  requirePerm(['CONFIGURAR_MESAS'], { strict: false }),
  async (req, res) => {
    try {
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const mesa = await prisma.mesa.findUnique({ where: { id } });
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

      const { reservada, reservadaPor } = req.body || {};

      if (reservada === true) {
        const nombre = String(reservadaPor || '').trim();
        if (!nombre) return res.status(400).json({ error: 'Debe indicar "reservadaPor"' });

        const abiertas = await prisma.orden.count({
          where: { finishedAt: null, mesa: mesa.numero },
        });
        if (abiertas > 0) return res.status(409).json({ error: 'La mesa está ocupada' });

        const upd = await prisma.mesa.update({
          where: { id },
          data: { estado: MesaEstado.RESERVADA, reservadaPor: nombre },
        });
        broadcastMesa({ type: 'mesa_reserved', mesa: upd });
        return res.json(upd);
      }

      if (reservada === false) {
        const upd = await prisma.mesa.update({
          where: { id },
          data: { estado: MesaEstado.DISPONIBLE, reservadaPor: null },
        });
        broadcastMesa({ type: 'mesa_reserved', mesa: upd });
        return res.json(upd);
      }

      res.status(400).json({ error: 'Campo "reservada" debe ser booleano' });
    } catch (e) {
      console.error('PATCH /mesas/:id/reservar', e);
      res.status(500).json({ error: 'No se pudo cambiar el estado de reserva' });
    }
  }
);

module.exports = router;
