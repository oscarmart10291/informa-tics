// backend/src/config/jwt.js
const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET || 'dev-secret';
const EXPIRES = process.env.JWT_EXPIRES || '12h';

// --- helpers para normalizar permisos ---
function toKey(p) {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') return p.clave || p.nombre || p.key || '';
  return '';
}
function normPerms(list) {
  return (Array.isArray(list) ? list : [])
    .map(toKey)
    .filter(Boolean)
    .map(s => String(s).trim().toUpperCase().replace(/\s+/g, '_'));
}

function signUser(user) {
  const srcPerms = (Array.isArray(user?.permisos) && user.permisos.length)
    ? user.permisos
    : (Array.isArray(user?.rol?.permisos) ? user.rol.permisos : []);
  const permisos = normPerms(srcPerms);

  const payload = {
    id: user.id,
    nombre: user.nombre || user.name || '',
    rol: user.rol ? { nombre: user.rol.nombre || user.rol } : null,
    permisos,
    debeCambiarPassword: Boolean(user.debeCambiarPassword),
  };

  // En DEV no lo usaremos, pero queda disponible
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signUser, verifyToken };
