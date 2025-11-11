// src/middlewares/ensureCajaAbierta.js
// Middleware que impide cobrar si el cajero no tiene una apertura autorizada y activa.

const { PrismaClient, CajaTurnoEstado } = require("../generated/prisma");
const prisma = new PrismaClient();

/**
 * Obtiene el id de usuario autenticado desde req.user (o cabezal como fallback).
 * Ajusta esta función si tu middleware de auth expone el usuario de otra forma.
 */
function getUserIdFromReq(req) {
  const id = req?.user?.id || req?.usuario?.id || req?.auth?.id || req.headers["x-user-id"];
  return id ? Number(id) : null;
}

/**
 * Verifica que el usuario tenga un turno de caja "ABIERTA".
 * Si no lo tiene, responde 403.
 */
async function ensureCajaAbierta(req, res, next) {
  try {
    const uid = getUserIdFromReq(req);
    if (!uid) return res.status(401).json({ msg: "No autenticado" });

    const turno = await prisma.cajaTurno.findFirst({
      where: { cajeroId: uid, estado: CajaTurnoEstado.ABIERTA },
      orderBy: { id: "desc" },
    });

    if (!turno) {
      return res.status(403).json({
        msg: "No tienes una apertura de caja autorizada y activa. Solicítala para poder cobrar.",
      });
    }
    // Adjuntamos el turno a la request por si se requiere en auditoría
    req.cajaTurno = turno;
    next();
  } catch (e) {
    console.error("[ensureCajaAbierta]", e);
    res.status(500).json({ msg: "No se pudo validar apertura de caja" });
  }
}

module.exports = { ensureCajaAbierta, getUserIdFromReq };
