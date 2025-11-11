// backend/src/middlewares/requirePerm.js

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}
const STRICT_PERMS = parseBool(process.env.STRICT_PERMS);

// Debug opcional
const PERMS_DEBUG = parseBool(process.env.PERMS_DEBUG) || parseBool(process.env.LOGIN_DEBUG);

// Normaliza un arreglo de permisos a UPPER_SNAKE_CASE (soporta string u objeto)
function normalize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') return p.clave || p.nombre || p.key || '';
      return '';
    })
    .filter(Boolean)
    .map((s) => String(s).trim().toUpperCase().replace(/\s+/g, '_'));
}

// Lee permisos del usuario desde req.user (+ rol como permiso implícito)
function readUserPerms(req) {
  const raw = (req.user && (req.user.permisos || req.user?.rol?.permisos)) || [];
  const perms = normalize(raw);

  // Rol como permiso implícito
  const roleName = String(req?.user?.rol?.nombre || req?.user?.rol || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (roleName) perms.push(roleName);

  // ADMIN/ADMINISTRADOR => wildcard
  if (roleName === 'ADMIN' || roleName === 'ADMINISTRADOR') perms.push('*');

  return Array.from(new Set(perms));
}

/**
 * requirePerm(anyOf, opts)
 * - anyOf: string | string[] | objetos {nombre|clave|key}
 * - opts.strict: boolean (sobrescribe STRICT_PERMS global)
 */
module.exports = function requirePermBase(anyOf = [], opts = {}) {
  const need = normalize(Array.isArray(anyOf) ? anyOf : [anyOf]);
  const strict = typeof opts.strict === 'boolean' ? opts.strict : STRICT_PERMS;

  return (req, res, next) => {
    try {
      // 🚧 DEV: si NO es estricto, nunca bloquees por permisos
      if (!strict) {
        if (PERMS_DEBUG) console.warn('[requirePerm] DEV lax bypass', { need });
        return next();
      }

      // En estricto, si no se pide nada, pasa
      if (need.length === 0) return next();

      // En estricto, sin usuario => 401
      if (!req.user) {
        if (PERMS_DEBUG) console.warn('[requirePerm] 401 UNAUTHENTICATED (strict=true, no req.user)');
        return res.status(401).json({ error: 'UNAUTHENTICATED' });
      }

      const have = readUserPerms(req);

      // Super-permiso
      if (have.includes('*')) {
        if (PERMS_DEBUG) console.log('[requirePerm] acceso por wildcard *');
        return next();
      }

      // ¿Alguno de los requeridos?
      const ok = need.some((perm) => have.includes(perm));
      if (!ok) {
        if (PERMS_DEBUG) console.warn('[requirePerm] 403 FORBIDDEN', { need, have });
        return res.status(403).json({ error: 'Permiso insuficiente', need });
      }

      return next();
    } catch (e) {
      console.error('requirePerm error:', e);
      return res.status(500).json({ error: 'Error en middleware de permisos' });
    }
  };
};
