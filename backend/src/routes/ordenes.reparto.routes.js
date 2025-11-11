// backend/src/routes/ordenes.reparto.routes.js
const express = require('express');
const router = express.Router();

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// Si tu middleware tiene otro nombre/ruta, ajústalo aquí:
const requirePerm = require('../middlewares/requirePerm');

/* ==============================
   Constantes / utilidades
============================== */
const DELIVERY = {
  LISTO: 'LISTO_PARA_ENTREGA',
  ASIGNADO: 'ASIGNADO_A_REPARTIDOR',
  EN_CAMINO: 'EN_CAMINO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
};

const TIPO_ENTREGA = {
  DOMICILIO: 'DOMICILIO',
  LOCAL: 'LOCAL',
};

// Extrae repartidorId desde auth / headers / body / query
function getRepartidorId(req) {
  if (req.user?.id) return Number(req.user.id);
  if (req.headers['x-repartidor-id']) return Number(req.headers['x-repartidor-id']);
  if (req.body?.repartidorId) return Number(req.body.repartidorId);
  if (req.query?.repartidorId) return Number(req.query.repartidorId);
  return null;
}

// Campos que consume el frontend de Repartidor.jsx
const selectPedidoForList = {
  id: true,
  codigo: true,
  creadoEn: true,
  tipoEntrega: true,
  deliveryStatus: true,
  direccion: true,
  telefono: true,
  receptorNombre: true,
  total: true,
  orden: {
    select: {
      id: true,
      codigo: true,
      mesa: true,
      finishedAt: true,
    },
  },
  items: { select: { nombre: true, qty: true } },
};

/* ==============================
   Salud / debug
============================== */
router.get('/health', (_req, res) => {
  res.json({ ok: true, at: '/reparto', ts: new Date().toISOString() });
});

/* =========================================================
   A) Disponibles (pool): listos y sin repartidor
   - RUTA OFICIAL:      GET /reparto/disponibles
   - ALIAS PARA FRONT:  GET /reparto/listos
========================================================= */
async function handlerDisponibles(_req, res) {
  try {
    const pedidos = await prisma.pedidoCliente.findMany({
      where: {
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        deliveryStatus: DELIVERY.LISTO,
        repartidorId: null,
      },
      orderBy: [{ readyAt: 'asc' }, { creadoEn: 'asc' }],
      select: selectPedidoForList,
    });
    res.json(pedidos);
  } catch (err) {
    console.error('GET /reparto/disponibles:', err);
    res.status(500).json({ error: 'Error al obtener pedidos disponibles' });
  }
}
router.get('/disponibles', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), handlerDisponibles);
router.get('/listos',      requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), handlerDisponibles); // alias

/* =========================================================
   B) Mis entregas: asignado / en camino
   - RUTA OFICIAL:      GET /reparto/mis
   - ALIAS PARA FRONT:  GET /reparto/mios
   - COMPAT:            GET /reparto/mias (por si ya la usabas)
========================================================= */
async function handlerMis(req, res) {
  try {
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    // El front a veces manda ?soloActivos=1 (opcional)
    const pedidos = await prisma.pedidoCliente.findMany({
      where: {
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        repartidorId,
        deliveryStatus: { in: [DELIVERY.ASIGNADO, DELIVERY.EN_CAMINO] },
      },
      orderBy: [{ assignedAt: 'asc' }, { creadoEn: 'asc' }],
      select: selectPedidoForList,
    });
    res.json(pedidos);
  } catch (err) {
    console.error('GET /reparto/mis:', err);
    res.status(500).json({ error: 'Error al obtener mis entregas' });
  }
}
router.get('/mis',  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), handlerMis);
router.get('/mios', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), handlerMis);  // alias
router.get('/mias', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), handlerMis);  // compat

/* =========================================================
   C) Historial del repartidor: entregados
========================================================= */
router.get('/historial', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    const pedidos = await prisma.pedidoCliente.findMany({
      where: {
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        repartidorId,
        deliveryStatus: DELIVERY.ENTREGADO,
      },
      orderBy: [{ deliveredAt: 'desc' }, { creadoEn: 'desc' }],
      select: selectPedidoForList,
    });
    res.json(pedidos);
  } catch (err) {
    console.error('GET /reparto/historial:', err);
    res.status(500).json({ error: 'Error al obtener historial de entregas' });
  }
});

/* =========================================================
   D) Reclamar (tomar) uno
========================================================= */
router.post('/:pedidoId/claim', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    const r = await prisma.pedidoCliente.updateMany({
      where: {
        id: pedidoId,
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        deliveryStatus: DELIVERY.LISTO,
        repartidorId: null,
      },
      data: {
        repartidorId,
        deliveryStatus: DELIVERY.ASIGNADO,
        assignedAt: new Date(),
      },
    });

    if (r.count === 0) {
      return res.status(409).json({ error: 'Ya fue tomado por otro repartidor' });
    }
    res.json({ ok: true, pedidoId });
  } catch (err) {
    console.error('POST /reparto/:pedidoId/claim:', err);
    res.status(500).json({ error: 'Error al reclamar pedido' });
  }
});

/* =========================================================
   E) Reclamar (tomar) varios
========================================================= */
router.post('/claim-bulk', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const { pedidoIds = [] } = req.body || {};
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    const tomados = [];
    for (const id of pedidoIds) {
      const r = await prisma.pedidoCliente.updateMany({
        where: {
          id,
          tipoEntrega: TIPO_ENTREGA.DOMICILIO,
          deliveryStatus: DELIVERY.LISTO,
          repartidorId: null,
        },
        data: {
          repartidorId,
          deliveryStatus: DELIVERY.ASIGNADO,
          assignedAt: new Date(),
        },
      });
      if (r.count === 1) tomados.push(id);
    }

    if (tomados.length === 0) {
      return res.status(409).json({ error: 'Ninguno disponible; alguien se adelantó' });
    }
    res.json({ ok: true, tomados });
  } catch (err) {
    console.error('POST /reparto/claim-bulk:', err);
    res.status(500).json({ error: 'Error al reclamar pedidos' });
  }
});

/* =========================================================
   F) Cambios de estado: En camino / Entregado
========================================================= */
router.patch('/:pedidoId/en-camino', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    const r = await prisma.pedidoCliente.updateMany({
      where: { id: pedidoId, repartidorId, deliveryStatus: DELIVERY.ASIGNADO },
      data: { deliveryStatus: DELIVERY.EN_CAMINO, startedAt: new Date() },
    });

    if (r.count === 0) return res.status(400).json({ error: 'No se pudo pasar a EN_CAMINO' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /reparto/:pedidoId/en-camino:', err);
    res.status(500).json({ error: 'Error al cambiar a EN_CAMINO' });
  }
});

router.patch('/:pedidoId/entregar', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });

    const r = await prisma.pedidoCliente.updateMany({
      where: { id: pedidoId, repartidorId, deliveryStatus: { in: [DELIVERY.ASIGNADO, DELIVERY.EN_CAMINO] } },
      data: { deliveryStatus: DELIVERY.ENTREGADO, deliveredAt: new Date() },
    });

    if (r.count === 0) return res.status(400).json({ error: 'No se pudo marcar como ENTREGADO' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /reparto/:pedidoId/entregar:', err);
    res.status(500).json({ error: 'Error al marcar ENTREGADO' });
  }
});

/* =========================================================
   G) Observación del repartidor (opcional)
========================================================= */
router.post('/:pedidoId/observacion', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    const { texto } = req.body || {};
    if (!repartidorId) return res.status(401).json({ error: 'Falta repartidorId' });
    if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'Texto requerido' });

    const obs = await prisma.observacionEntrega.create({
      data: { pedidoId, repartidorId, texto: String(texto).trim() },
    });
    res.json(obs);
  } catch (err) {
    console.error('POST /reparto/:pedidoId/observacion:', err);
    res.status(500).json({ error: 'Error al guardar observación' });
  }
});

module.exports = router;
