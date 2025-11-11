// backend/src/routes/auth.google.cliente.routes.js
const express = require("express");
const router = express.Router();
const verifyFirebase = require("../middlewares/verifyFirebase");
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

// Helpers
function normPermKey(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "_");
}
function normalizePerms(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(p => (typeof p === "string" ? p : (p?.nombre || p?.key || "")))
    .filter(Boolean)
    .map(normPermKey);
}

// ==================== LOGIN GOOGLE CLIENTE ==================== //
router.post("/google-cliente", verifyFirebase, async (req, res) => {
  try {
    const fUser = req.firebaseUser || req.user || {};
    const emailFromToken = (fUser.email || "").toLowerCase();
    const emailFromBody  = (req.body?.email || "").toLowerCase();
    const email = emailFromToken || emailFromBody;

    if (!email) return res.status(400).json({ error: "No hay email (token/body)" });

    const nombreGoogle = fUser.name || email.split("@")[0] || "Cliente";

    // 1️⃣ Asegurar rol Cliente
    let rolCliente = await prisma.rol.findFirst({ where: { nombre: "Cliente" } });
    if (!rolCliente) rolCliente = await prisma.rol.create({ data: { nombre: "Cliente" } });

    // 2️⃣ Buscar usuario existente
    const existente = await prisma.usuario.findFirst({
      where: { correo: { equals: email, mode: "insensitive" } },
      include: { rol: true },
    });

    let usuario;
    if (existente) {
      const esCliente = existente.rol?.nombre?.toLowerCase() === "cliente";
      if (esCliente) {
        usuario = await prisma.usuario.update({
          where: { id: existente.id },
          data: {
            nombre: nombreGoogle,
            usuario: existente.usuario || email,
            estado: true,
            debeCambiarPassword: false,
          },
          include: { rol: true },
        });
      } else {
        usuario = await prisma.usuario.update({
          where: { id: existente.id },
          data: { estado: true, debeCambiarPassword: false },
          include: { rol: true },
        });
      }
    } else {
      // 3️⃣ Crear nuevo cliente
      usuario = await prisma.usuario.create({
        data: {
          nombre: nombreGoogle,
          usuario: email,
          correo: email,
          contrasena: null,
          rolId: rolCliente.id,
          estado: true,
          debeCambiarPassword: false,
        },
        include: { rol: true },
      });
    }

    // 4️⃣ Permisos por rol
    const rolId = usuario.rolId || usuario.rol?.id;
    const links = await prisma.permisoPorRol.findMany({
      where: { rolId },
      select: { permiso: { select: { nombre: true } } },
    });
    const permisosStr = normalizePerms(links.map(l => l.permiso));

    const { contrasena, ...usuarioSinClave } = usuario;
    return res.json({
      mensaje: "Login Google Cliente OK",
      mustChange: false,
      usuario: { ...usuarioSinClave, permisos: permisosStr },
    });
  } catch (err) {
    console.error("google-cliente error:", err);
    res.status(500).json({ error: "Error autenticando cliente" });
  }
});

module.exports = router;
