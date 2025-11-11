// backend/src/routes/caja.egresos.admin.routes.js
const express = require('express');
const router = express.Router();

const { PrismaClient, EgresoEstado } = require('../generated/prisma');
const prisma = new PrismaClient();

const requirePerm = require('../middlewares/requirePerm');
let { broadcastCaja } = (() => {
  try { return require('../services/caja.events'); } catch { return {}; }
})();

/* =========================
   GET /caja/egresos/pendientes
   Lista de egresos con estado PENDIENTE (todos los cajeros)
========================= */
router.get(
  '/egresos/pendientes',
  requirePerm(['ADMIN', 'AUTORIZAR_EGRESO'], { strict: false }),
  async (_req, res) => {
    try {
      const list = await prisma.egresoCaja.findMany({
        where: { estado: EgresoEstado.PENDIENTE },
        orderBy: { id: 'desc' },
        include: {
          cajero: { select: { id: true, nombre: true } },
        },
      });

      const egresos = list.map(e => ({
        id: e.id,
        creadoEn: e.creadoEn,
        motivo: e.motivo,
        monto: Number(e.monto || 0),
        estado: e.estado,
        cajero: e.cajero ? { id: e.cajero.id, nombre: e.cajero.nombre } : null,
        cajeroNombre: e.cajero?.nombre || null,
        observacion: e.observacion || null,
      }));

      res.json({ egresos });
    } catch (e) {
      console.error('[GET /caja/egresos/pendientes]', e);
      res.status(500).json({ error: 'Error listando egresos pendientes' });
    }
  }
);

/* =========================
   PATCH /caja/egresos/:id/autorizar
   Body: { accion: "APROBAR"|"RECHAZAR", observacion?: string }
========================= */
router.patch(
  '/egresos/:id/autorizar',
  requirePerm(['ADMIN', 'AUTORIZAR_EGRESO'], { strict: false }),
  async (req, res) => {
    try {
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ msg: 'ID inválido' });

      const accion = String(req.body?.accion || '').toUpperCase();
      const obs = (req.body?.observacion || '').toString().trim();
      const adminId = Number(req.user?.id || req.body?.adminId || 0) || null;

      if (!['APROBAR', 'RECHAZAR'].includes(accion)) {
        return res.status(400).json({ msg: 'Acción inválida' });
      }
      if (accion === 'RECHAZAR' && obs.length < 3) {
        return res.status(400).json({ msg: 'Para rechazar, agrega una observación (mín. 3 caracteres).' });
      }

      const eg = await prisma.egresoCaja.findUnique({ where: { id } });
      if (!eg) return res.status(404).json({ msg: 'Egreso no existe' });
      if (eg.estado !== EgresoEstado.PENDIENTE) {
        return res.status(409).json({ msg: `No se puede actualizar, estado actual: ${eg.estado}` });
      }

      const nuevoEstado = accion === 'APROBAR' ? EgresoEstado.APROBADO : EgresoEstado.RECHAZADO;

      const upd = await prisma.egresoCaja.update({
        where: { id },
        data: {
          estado: nuevoEstado,
          observacion: obs || null,
          autorizadoPorId: adminId,
          autorizadoEn: new Date(),
        },
        include: { cajero: { select: { id: true, nombre: true } } },
      });

      try { broadcastCaja && broadcastCaja({ type: 'egreso_actualizado', egresoId: upd.id, estado: upd.estado }); } catch {}

      return res.json({
        ok: true,
        msg: nuevoEstado === EgresoEstado.APROBADO ? 'Egreso aprobado' : 'Egreso rechazado',
        egreso: {
          id: upd.id,
          cajero: upd.cajero ? { id: upd.cajero.id, nombre: upd.cajero.nombre } : null,
          motivo: upd.motivo,
          monto: Number(upd.monto || 0),
          estado: upd.estado,
          observacion: upd.observacion,
          autorizadoPorId: upd.autorizadoPorId,
          autorizadoEn: upd.autorizadoEn,
          creadoEn: upd.creadoEn,
        }
      });
    } catch (e) {
      console.error('[PATCH /caja/egresos/:id/autorizar]', e);
      res.status(500).json({ msg: 'No se pudo actualizar el egreso' });
    }
  }
);

module.exports = router;
