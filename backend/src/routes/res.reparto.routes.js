// src/routes/ordenes.reparto.routes.js
const express = require('express');
const router = express.Router();

// PrismaClient (desde src/routes → subir a src/generated/prisma)
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// Middleware de permisos (desde src/routes → subir a src/middlewares)
const requirePerm = require('../middlewares/requirePerm');

/* ================================
   Constantes del flujo de reparto
=================================== */
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

/* Util: obtiene el id del repartidor desde auth o body/query (fallback para pruebas) */
function getRepartidorId(req) {
  if (req.user?.id) return Number(req.user.id); // si authorize llenó req.user
  if (req.body?.repartidorId) return Number(req.body.repartidorId);
  if (req.query?.repartidorId) return Number(req.query.repartidorId);
  return undefined;
}

/* ================= Rutas Reparto (protegidas por permiso) ================ */

/**
 * REQ-REP-51: Ver pedidos listos (pendientes por tomar)
 * Mantengo el path /pendientes y también /listos como alias.
 */
async function getListosHandler(_req, res) {
  try {
    const lista = await prisma.pedidoCliente.findMany({
      where: {
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        deliveryStatus: DELIVERY.LISTO,
      },
      orderBy: [
        { readyAt: 'asc' },
        { creadoEn: 'asc' },
      ],
      select: {
        id: true,
        codigo: true,
        total: true,
        readyAt: true,
        receptorNombre: true,
        telefono: true,
        direccion: true,
      },
    });
    res.json(lista);
  } catch (err) {
    console.error('GET /reparto/listos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos listos' });
  }
}

router.get('/pendientes', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), getListosHandler);
router.get('/listos', requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }), getListosHandler);

/**
 * REQ-REP-56: Ver “mis entregas” (en curso u opcionalmente todas)
 */
router.get(
  '/mios',
  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }),
  async (req, res) => {
    try {
      const repartidorId = getRepartidorId(req);
      if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

      const { soloActivos } = req.query;
      const whereBase = { repartidorId };

      const where = soloActivos
        ? { ...whereBase, deliveryStatus: { in: [DELIVERY.ASIGNADO, DELIVERY.EN_CAMINO] } }
        : whereBase;

      const lista = await prisma.pedidoCliente.findMany({
        where,
        orderBy: [
          { deliveredAt: 'desc' },
          { assignedAt: 'desc' },
          { creadoEn: 'desc' }, // ojo: en tu schema es "creadoEn"
        ],
      });
      res.json(lista);
    } catch (err) {
      console.error('GET /reparto/mios:', err);
      res.status(500).json({ error: 'Error al obtener mis pedidos' });
    }
  }
);

/**
 * REQ-REP-52 y REQ-REP-58: Tomar pedido (asignar a repartidor)
 * updateMany evita carrera: solo asigna si sigue LISTO y sin repartidor.
 */
router.patch(
  '/:id/tomar',
  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const repartidorId = getRepartidorId(req);
      if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

      const pedido = await prisma.pedidoCliente.findUnique({ where: { id } });
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.tipoEntrega !== TIPO_ENTREGA.DOMICILIO)
        return res.status(400).json({ error: 'El pedido no es a domicilio' });

      const { count } = await prisma.pedidoCliente.updateMany({
        where: {
          id,
          deliveryStatus: DELIVERY.LISTO,
          repartidorId: null,
        },
        data: {
          repartidorId,
          deliveryStatus: DELIVERY.ASIGNADO,
          assignedAt: new Date(),
        },
      });

      if (count === 0) {
        return res.status(409).json({ error: 'El pedido ya fue tomado por otro repartidor o cambió de estado' });
      }

      const upd = await prisma.pedidoCliente.findUnique({ where: { id } });
      res.json(upd);
    } catch (err) {
      console.error('PATCH /reparto/:id/tomar:', err);
      res.status(500).json({ error: 'Error al tomar el pedido' });
    }
  }
);

/**
 * REQ-REP-53: Iniciar entrega (ASIGNADO -> EN_CAMINO)
 */
router.patch(
  '/:id/iniciar',
  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const repartidorId = getRepartidorId(req);
      if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

      const pedido = await prisma.pedidoCliente.findUnique({ where: { id } });
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.repartidorId && pedido.repartidorId !== repartidorId)
        return res.status(403).json({ error: 'Este pedido está asignado a otro repartidor' });
      if (pedido.deliveryStatus !== DELIVERY.ASIGNADO)
        return res.status(400).json({ error: `No se puede iniciar desde ${pedido.deliveryStatus}` });

      const upd = await prisma.pedidoCliente.update({
        where: { id },
        data: {
          deliveryStatus: DELIVERY.EN_CAMINO,
          startedAt: new Date(),
        },
      });
      res.json(upd);
    } catch (err) {
      console.error('PATCH /reparto/:id/iniciar:', err);
      res.status(500).json({ error: 'Error al iniciar la entrega' });
    }
  }
);

/**
 * REQ-REP-53: Marcar ENTREGADO (EN_CAMINO -> ENTREGADO)
 */
router.patch(
  '/:id/entregado',
  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const repartidorId = getRepartidorId(req);

      const pedido = await prisma.pedidoCliente.findUnique({ where: { id } });
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.deliveryStatus !== DELIVERY.EN_CAMINO)
        return res.status(400).json({ error: `No se puede marcar entregado desde ${pedido.deliveryStatus}` });
      if (repartidorId && pedido.repartidorId && pedido.repartidorId !== repartidorId)
        return res.status(403).json({ error: 'Este pedido está asignado a otro repartidor' });

      const upd = await prisma.pedidoCliente.update({
        where: { id },
        data: {
          deliveryStatus: DELIVERY.ENTREGADO,
          deliveredAt: new Date(),
        },
      });
      res.json(upd);
    } catch (err) {
      console.error('PATCH /reparto/:id/entregado:', err);
      res.status(500).json({ error: 'Error al marcar entregado' });
    }
  }
);

/**
 * REQ-REP-54: Registrar observación del repartidor
 */
router.post(
  '/:id/observacion',
  requirePerm(['ACCESO_VISTA_REPARTO'], { strict: false }),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const repartidorId = getRepartidorId(req);
      const { texto } = req.body || {};
      if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });
      if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'Texto requerido' });

      const pedido = await prisma.pedidoCliente.findUnique({ where: { id } });
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const obs = await prisma.observacionEntrega.create({
        data: {
          pedidoId: id,
          repartidorId,
          texto: String(texto).trim(),
        },
      });
      res.json(obs);
    } catch (err) {
      console.error('POST /reparto/:id/observacion:', err);
      res.status(500).json({ error: 'Error al guardar observación' });
    }
  }
);

module.exports = router;
