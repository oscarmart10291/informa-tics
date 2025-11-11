// backend/src/routes/caja_pagos.js
const express = require('express');
const router = express.Router();

/** 
 * Exporta como factory para poder inyectar prisma y middlewares (auth/requirePerm)
 * Uso en index.js:
 *   const cajaPagos = require('./routes/caja_pagos');
 *   app.use('/caja', cajaPagos(prisma, { auth, requirePerm }));
 */
module.exports = function(prisma, { auth, requirePerm } = {}) {
  // Helpers ------------------------------
  function itemsTotal(items) {
    return (items || []).reduce((acc, it) => {
      const sub = typeof it.subtotal === 'number' && !Number.isNaN(it.subtotal)
        ? it.subtotal
        : (Number(it.precio || 0) * Number(it.qty || 1));
      return acc + sub;
    }, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /caja/orden/:ordenId/anticipo-restante
  // Calcula total de la orden, total pagado (items.pagado = true) y restante
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/orden/:ordenId/anticipo-restante',
    auth,
    requirePerm(['CAJA'], { strict: false }),
    async (req, res) => {
      try {
        const ordenId = Number(req.params.ordenId);
        if (!ordenId) return res.status(400).json({ error: 'ordenId inválido' });

        const orden = await prisma.orden.findUnique({ where: { id: ordenId } });
        if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

        const items = await prisma.ordenItem.findMany({ where: { ordenId } });
        const total    = itemsTotal(items);
        const pagado   = itemsTotal(items.filter(i => i.pagado === true));
        const restante = Math.max(0, total - pagado);

        res.json({ ordenId, total, pagado, restante });
      } catch (e) {
        console.error('[GET /caja/orden/:ordenId/anticipo-restante]', e);
        res.status(500).json({ error: 'Error al calcular anticipo/restante' });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /caja/pendientes
  // Lista órdenes en PENDIENTE_PAGO/TERMINADA con items y su flag pagado
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/pendientes',
    auth,
    requirePerm(['CAJA'], { strict: false }),
    async (_req, res) => {
      try {
        const ordenes = await prisma.orden.findMany({
          where: { estado: { in: ['PENDIENTE_PAGO', 'TERMINADA'] } },
          orderBy: { id: 'desc' },
          include: {
            mesero: { select: { id: true, nombre: true } },
            items:  { select: { id: true, nombre: true, precio: true, qty: true, subtotal: true, pagado: true } },
          },
        });

        const data = ordenes.map(o => ({
          id: o.id,
          codigo: o.codigo,
          mesa: o.mesa,
          fecha: o.fecha,
          mesero: o.mesero || null,
          items: (o.items || []).map(it => ({
            id: it.id,
            nombre: it.nombre,
            precio: Number(it.precio || 0),
            qty: Number(it.qty || 1),
            subtotal: typeof it.subtotal === 'number' ? it.subtotal : Number(it.precio || 0) * Number(it.qty || 1),
            pagado: !!it.pagado,
          })),
        }));

        res.json({ ordenes: data });
      } catch (e) {
        console.error('[GET /caja/pendientes]', e);
        res.status(500).json({ error: 'Error listando órdenes pendientes' });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /caja/pagar-parcial
  // body: { ordenId:number, itemIds:number[], metodoPago?:'EFECTIVO'|'TARJETA', montoRecibido:number, posCorrelativo?:string }
  // Marca ítems como pagados y devuelve totales (no crea TicketVenta)
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/pagar-parcial',
    auth,
    requirePerm(['CAJA'], { strict: false }),
    async (req, res) => {
      try {
        const { ordenId, itemIds, metodoPago, montoRecibido, posCorrelativo } = req.body || {};
        const ordenIdNum = Number(ordenId);
        const recibido   = Number(montoRecibido || 0);

        if (!ordenIdNum) return res.status(400).json({ error: 'ordenId requerido' });
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
          return res.status(400).json({ error: 'itemIds vacío' });
        }

        const orden = await prisma.orden.findUnique({ where: { id: ordenIdNum } });
        if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

        const itemsSel = await prisma.ordenItem.findMany({
          where: { ordenId: ordenIdNum, id: { in: itemIds.map(Number) } }
        });
        if (itemsSel.length !== itemIds.length) {
          return res.status(400).json({ error: 'Selección inválida (ítems no pertenecen a la orden)' });
        }
        if (itemsSel.some(i => i.pagado)) {
          return res.status(409).json({ error: 'La selección incluye ítems ya pagados' });
        }

        const subtotal = itemsTotal(itemsSel);

        // Validación del método:
        const mp = String(metodoPago || 'EFECTIVO').toUpperCase();
        if (mp === 'EFECTIVO') {
          if (!Number.isFinite(recibido) || recibido < subtotal) {
            return res.status(400).json({ error: `Monto recibido insuficiente. Subtotal: Q ${subtotal.toFixed(2)}` });
          }
        } else if (mp === 'TARJETA') {
          if (!posCorrelativo || String(posCorrelativo).trim() === '') {
            return res.status(400).json({ error: 'Correlativo POS requerido' });
          }
        } else {
          return res.status(400).json({ error: 'Método de pago inválido' });
        }

        const cambio = mp === 'EFECTIVO' ? Math.max(0, Number((recibido - subtotal).toFixed(2))) : 0;

        // Transacción: marcar pagados y recalcular totales
        await prisma.$transaction([
          prisma.ordenItem.updateMany({
            where: { id: { in: itemsSel.map(i => i.id) } },
            data:  { pagado: true },
          }),
        ]);

        const all = await prisma.ordenItem.findMany({ where: { ordenId: ordenIdNum } });
        const total    = itemsTotal(all);
        const pagado   = itemsTotal(all.filter(i => i.pagado));
        const restante = Math.max(0, total - pagado);

        // Si ya no queda nada pendiente, ponemos la orden en PAGADA
        if (restante === 0) {
          await prisma.orden.update({
            where: { id: ordenIdNum },
            data: { estado: 'PAGADA' },
          });
        } else if (orden.estado !== 'PENDIENTE_PAGO') {
          await prisma.orden.update({
            where: { id: ordenIdNum },
            data: { estado: 'PENDIENTE_PAGO' },
          });
        }

        res.json({
          ok: true,
          ordenId: ordenIdNum,
          metodoPago: mp,
          subtotal,
          recibido,
          cambio,
          total,
          pagado,
          restante,
        });
      } catch (e) {
        console.error('[POST /caja/pagar-parcial]', e);
        res.status(500).json({ error: 'Error procesando pago parcial' });
      }
    }
  );

  return router;
};
