// backend/src/routes/login.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const router = express.Router();

/* ===== helpers ===== */
const toKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '_');

function normalizePerms(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      // de rol: { permiso: { nombre } }
      if (p && p.permiso && typeof p.permiso.nombre === 'string') return p.permiso.nombre;
      // directos: { permiso: { nombre } } ó string
      if (p && typeof p === 'object') return p.nombre || p.key || p.clave || '';
      if (typeof p === 'string') return p;
      return '';
    })
    .filter(Boolean)
    .map(toKey);
}

async function comparePassword(input, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    try { return await bcrypt.compare(input, stored); } catch { return false; }
  }
  return input === stored; // fallback texto plano
}

function buildUsuarioDTO(dbUser, permisosStr) {
  const rolNombre = (typeof dbUser.rol === 'string'
    ? dbUser.rol
    : (dbUser.rol?.nombre || '')
  );

  return {
    id: dbUser.id,
    nombre: dbUser.nombre || dbUser.name || '',
    rol: rolNombre ? { nombre: rolNombre } : null,
    permisos: permisosStr || [],
    debeCambiarPassword: Boolean(dbUser.debeCambiarPassword),
  };
}

/* ===== /login ===== */
router.post('/', async (req, res) => {
  try {
    const rawUser = String(
      req.body?.usuario ??
      req.body?.login ??
      req.body?.correo ??      // ← tu esquema usa "correo"
      ''
    ).trim();

    const rawPass = String(
      req.body?.contrasena ??
      req.body?.password ??
      ''
    ).trim();

    if (!rawUser || !rawPass) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    // Buscar por usuario O correo (⚠️ tu esquema NO tiene "email")
    const user = await prisma.usuario.findFirst({
      where: {
        estado: true,
        OR: [{ usuario: rawUser }, { correo: rawUser }],
      },
      include: {
        rol: true,
        // permisos directos del usuario (join table)
        permisos: { include: { permiso: { select: { nombre: true } } } },
      },
    });

    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    const ok = await comparePassword(rawPass, user.contrasena || '');
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    // Permisos por ROL
    let permisosRol = [];
    if (user.rolId || user.rol?.id) {
      const rolId = user.rolId || user.rol?.id;
      const links = await prisma.permisoPorRol.findMany({
        where: { rolId },
        select: { permiso: { select: { nombre: true } } },
      });
      permisosRol = links; // normalizePerms espera array que puede contener { permiso: { nombre } }
    }

    // Permisos directos por usuario (ya vienen incluídos arriba en user.permisos)
    const permisosUsuario = (user.permisos || []).map(pu => pu.permiso).filter(Boolean);

    const permisosStr = normalizePerms([
      ...permisosUsuario, // { nombre }
      ...permisosRol,     // { permiso: { nombre } }
    ]);

    // Si es admin, puede que quieras darle todo; de lo contrario, deja los calculados
    const rolNombre = String(user.rol?.nombre || '').trim().toLowerCase();
    const isAdmin = rolNombre === 'administrador' || rolNombre === 'admin';
    let permisosFinal = permisosStr;
    if (isAdmin) {
      const allPerms = await prisma.permiso.findMany({ select: { nombre: true } });
      permisosFinal = normalizePerms(allPerms);
    }

    // Usuario DTO para el front
    const usuarioDTO = buildUsuarioDTO(user, permisosFinal);

    // En DEV sin JWT, no es necesario enviar token; si quieres mantener compat con front, envía null
    return res.status(200).json({
      ok: true,
      token: null, // ← en dev sin JWT
      mustChange: usuarioDTO.debeCambiarPassword,
      usuario: usuarioDTO,
    });
  } catch (error) {
    console.error('[POST /login] error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
