// backend/src/routes/repartidor.notifs.routes.js
const express = require('express');
const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();
const router = express.Router();

/* =========================
   DEBUG / Health
========================= */
// GET /repartidor/__ping  (verifica que el router está montado)
router.get('/__ping', (req, res) => {
  res.json({ ok: true, where: '/repartidor/__ping' });
});

/* =========================
   Handlers reutilizables
========================= */
async function listNotifs(req, res) {
  try {
    const repartidorId = req.query.repartidorId ? Number(req.query.repartidorId) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const baseFindArgs = {
      orderBy: [
        { visto: 'asc' },        // no vistas primero
        { creadoEn: 'desc' },    // recientes primero
      ],
      include: {
        pedido: {
          select: {
            id: true,
            codigo: true,
            tipoEntrega: true,
            total: true,
            deliveryStatus: true,
          },
        },
        repartidor: { select: { id: true, nombre: true } },
      },
    };

    if (!repartidorId) {
      // Sin repartidorId → comportamiento simple
      const all = await prisma.repartidorNotif.findMany({
        take: limit,
        ...baseFindArgs,
      });
      return res.json(all);
    }

    // 1) Trae todas las ESPECÍFICAS del repartidor
    const especificas = await prisma.repartidorNotif.findMany({
      where: { repartidorId },
      take: limit,             // trae hasta el límite con prioridad
      ...baseFindArgs,
    });

    // 2) Construye el set de pedidoId ya cubiertos (usa el ESCALAR)
    const cubiertos = new Set(
      especificas.map(n => n.pedidoId).filter(id => id != null)
    );

    // 3) Completa con BROADCAST solo de pedidos no cubiertos
    const faltan = Math.max(0, limit - especificas.length);
    let broadcast = [];
    if (faltan > 0) {
      broadcast = await prisma.repartidorNotif.findMany({
        where: {
          repartidorId: null,
          // evita duplicar por pedidoId
          NOT: { pedidoId: { in: Array.from(cubiertos) } },
        },
        take: faltan * 3,      // buffer por si algunas no tienen pedidoId
        ...baseFindArgs,
      });
    }

    // 4) Merge provisional
    const merged = [...especificas, ...broadcast];

    // 5) Colapsa por pedidoId (prioriza específicas). Si no hay pedidoId, usa la notif.id
    const seen = new Set();
    const out = [];
    for (const n of merged) {
      // clave por pedidoId si existe; si no, por id de la notif
      const key = n.pedidoId != null ? `p:${n.pedidoId}` : `n:${n.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
      if (out.length >= limit) break;
    }

    // 6) Orden final consistente (por si el merge cambió el orden)
    out.sort((a, b) => {
      if (a.visto !== b.visto) return a.visto ? 1 : -1;
      return new Date(b.creadoEn) - new Date(a.creadoEn);
    });

    return res.json(out);
  } catch (e) {
    console.error('GET notifs ->', e);
    res.status(500).json({ error: 'No se pudieron cargar notificaciones' });
  }
}


async function markOne(req, res) {
  try {
    const id = Number(req.params.id);
    const n = await prisma.repartidorNotif.update({
      where: { id },
      data: { visto: true },
    });
    res.json(n);
  } catch (e) {
    console.error('PATCH notifs/:id/visto ->', e);
    res.status(500).json({ error: 'No se pudo marcar como vista' });
  }
}

async function markAll(req, res) {
  try {
    const repartidorId = req.query.repartidorId ? Number(req.query.repartidorId) : null;
    const where = repartidorId
      ? { visto: false, OR: [{ repartidorId }, { repartidorId: null }] }
      : { visto: false };

    const { count } = await prisma.repartidorNotif.updateMany({
      where,
      data: { visto: true },
    });

    res.json({ ok: true, count });
  } catch (e) {
    console.error('PATCH notifs/visto-todas ->', e);
    res.status(500).json({ error: 'No se pudieron marcar todas como vistas' });
  }
}

async function testCreate(_req, res) {
  try {
    const pedido = await prisma.pedidoCliente.findFirst({ orderBy: { id: 'desc' } });
    const notif = await prisma.repartidorNotif.create({
      data: {
        titulo: 'Nuevo pedido para reparto',
        cuerpo: pedido
          ? `Pedido ${pedido.codigo} · Q${Number(pedido.total || 0).toFixed(2)}`
          : 'Pedido nuevo',
        pedidoId: pedido?.id || null,
        repartidorId: null, // broadcast a todos
      },
    });
    res.json({ ok: true, notif });
  } catch (e) {
    console.error('POST notifs/test ->', e);
    res.status(500).json({ error: 'No se pudo crear la notificación de prueba' });
  }
}

/* =========================================================
   Rutas oficiales bajo /repartidor (mount corto)
========================================================= */
router.get('/notifs', listNotifs);
router.patch('/notifs/:id/visto', markOne);
router.patch('/notifs/visto-todas', markAll);
router.post('/notifs/test', testCreate);

/* =========================================================
   Aliases si alguna vez montas en /repartidor/notifs (mount largo)
========================================================= */
router.get('/', listNotifs);
router.patch('/:id/visto', markOne);
router.patch('/visto-todas', markAll);
router.post('/test', testCreate);

module.exports = router;
