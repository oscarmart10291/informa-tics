// backend/src/routes/permisos.routes.js
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

/* ========== Helpers ========== */
async function ensurePerm(nombre) {
  if (!nombre || !String(nombre).trim()) {
    throw new Error("Nombre de permiso inválido");
  }
  // upsert por nombre (asumiendo que nombre es único)
  const perm = await prisma.permiso.upsert({
    where: { nombre },
    create: { nombre },
    update: {},
  });
  return perm;
}

async function ensurePerms(names = []) {
  const out = [];
  for (const n of names) out.push(await ensurePerm(n));
  return out;
}

async function assignPermToRoleByName(permName, roleName = "Administrador") {
  const perm = await ensurePerm(permName);

  const role = await prisma.rol.findUnique({
    where: { nombre: roleName },
  });
  if (!role) throw new Error(`Rol "${roleName}" no existe`);

  const exists = await prisma.permisoPorRol.findFirst({
    where: { rolId: role.id, permisoId: perm.id },
  });
  if (!exists) {
    await prisma.permisoPorRol.create({
      data: { rolId: role.id, permisoId: perm.id },
    });
  }

  return { permiso: perm, rol: role };
}

/* ========== Endpoints existentes ========== */

// Obtener todos los permisos disponibles
router.get("/", async (_req, res) => {
  try {
    const permisos = await prisma.permiso.findMany();
    res.json(permisos);
  } catch (error) {
    console.error("Error al obtener permisos:", error);
    res.status(500).json({ error: "Error al obtener permisos" });
  }
});

// Crear un nuevo rol y asignarle permisos (por IDs)
router.post("/crear-rol-con-permisos", async (req, res) => {
  const { nombreRol, permisos } = req.body;

  if (!nombreRol || !Array.isArray(permisos)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  try {
    const rolExistente = await prisma.rol.findUnique({
      where: { nombre: nombreRol.trim() },
    });
    if (rolExistente) {
      return res.status(400).json({ error: "El rol ya existe" });
    }

    const nuevoRol = await prisma.rol.create({
      data: { nombre: nombreRol.trim() },
    });

    if (permisos.length) {
      const relaciones = permisos.map((permisoId) => ({
        rolId: nuevoRol.id,
        permisoId,
      }));
      await prisma.permisoPorRol.createMany({ data: relaciones });
    }

    res.json({ mensaje: "Rol creado y permisos asignados correctamente" });
  } catch (error) {
    console.error("Error al crear rol con permisos:", error);
    res.status(500).json({ error: "Error al crear rol con permisos" });
  }
});

// Obtener todos los roles con sus permisos (devuelve IDs)
router.get("/roles-con-permisos", async (_req, res) => {
  try {
    const roles = await prisma.rol.findMany({
      include: { permisos: { include: { permiso: true } } },
      orderBy: { nombre: "asc" },
    });

    const resultado = roles.map((rol) => ({
      id: rol.id,
      nombre: rol.nombre,
      permisos: rol.permisos.map((p) => p.permisoId), // <- IDs
    }));

    res.json(resultado);
  } catch (error) {
    console.error("Error al obtener roles con permisos:", error);
    res.status(500).json({ error: "Error al obtener roles con permisos" });
  }
});

// Actualizar los permisos de un rol existente (por IDs)
router.put("/actualizar", async (req, res) => {
  const { rolId, permisos } = req.body;

  if (!rolId || !Array.isArray(permisos)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  try {
    const rol = await prisma.rol.findUnique({ where: { id: rolId } });
    if (!rol) return res.status(404).json({ error: "Rol no encontrado" });

    // No dejar sin permisos al Administrador
    if (rol.nombre.toLowerCase() === "administrador" && permisos.length === 0) {
      return res
        .status(400)
        .json({ error: "No puedes quitar todos los permisos al Administrador." });
    }

    await prisma.permisoPorRol.deleteMany({ where: { rolId } });

    if (permisos.length > 0) {
      const relaciones = permisos.map((permisoId) => ({ rolId, permisoId }));
      await prisma.permisoPorRol.createMany({ data: relaciones });
    }

    res.json({ mensaje: "Permisos actualizados correctamente" });
  } catch (error) {
    console.error("Error al actualizar permisos:", error);
    res.status(500).json({ error: "Error al actualizar permisos del rol" });
  }
});

//
// 🔹 Renombrar rol
//
router.put("/rol/:id/nombre", async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del rol es obligatorio." });
  }

  try {
    const rol = await prisma.rol.findUnique({ where: { id: Number(id) } });
    if (!rol) return res.status(404).json({ error: "Rol no encontrado" });

    // Bloquear renombrar Administrador
    if (rol.nombre.toLowerCase() === "administrador") {
      return res
        .status(400)
        .json({ error: "No puedes renombrar el rol Administrador." });
    }

    // Evitar duplicados
    const existe = await prisma.rol.findUnique({
      where: { nombre: nombre.trim() },
    });
    if (existe) {
      return res.status(400).json({ error: "Ya existe un rol con ese nombre." });
    }

    const actualizado = await prisma.rol.update({
      where: { id: Number(id) },
      data: { nombre: nombre.trim() },
    });

    res.json({ mensaje: "Nombre de rol actualizado.", rol: actualizado });
  } catch (error) {
    console.error("Error al renombrar rol:", error);
    res.status(500).json({ error: "Error al renombrar el rol" });
  }
});

/* ========== NUEVO: Seeds/Utilidades para reportería ========== */

/**
 * Asegura que exista REPORTES_VER y lo asigna al rol Administrador.
 * Úsalo una vez (o cada vez que montes ambientes).
 */
router.post("/seed/admin-enable-reportes", async (_req, res) => {
  try {
    const { permiso, rol } = await assignPermToRoleByName("REPORTES_VER", "Administrador");
    res.json({
      ok: true,
      mensaje: `Permiso "${permiso.nombre}" asignado al rol "${rol.nombre}".`,
      permisoId: permiso.id,
      rolId: rol.id,
    });
  } catch (error) {
    console.error("seed admin-enable-reportes:", error);
    res.status(500).json({ error: error.message || "Error al seedear reportería" });
  }
});

/**
 * (Opcional) Asegurar una lista de permisos por nombre.
 * body: { nombres: ["REPORTES_VER", "OTRO_PERMISO"] }
 * devuelve mapa { nombre, id }
 */
router.post("/ensure", async (req, res) => {
  try {
    const nombres = Array.isArray(req.body?.nombres) ? req.body.nombres : [];
    if (!nombres.length) return res.status(400).json({ error: "nombres vacío" });

    const perms = await ensurePerms(nombres.map((x) => String(x).trim()).filter(Boolean));
    res.json({
      ok: true,
      permisos: perms.map((p) => ({ id: p.id, nombre: p.nombre })),
    });
  } catch (error) {
    console.error("ensure permisos:", error);
    res.status(500).json({ error: error.message || "Error al asegurar permisos" });
  }
});

module.exports = router;
