// backend/src/middlewares/autorice.js
// Auth flexible:
// - PROD (hay JWT_SECRET): exige Authorization: Bearer <token> válido
// - DEV  (NO hay JWT_SECRET): acepta X-User-Json, ?token=..., DEV_USER_ID, y decode sin verificar
// - PUBLIC PATHS pasan siempre
// - STRICT_PERMS=true => si no hay req.user en rutas NO públicas => 401

const { verifyToken } = (() => {
  try { return require('../config/jwt'); } catch { return { verifyToken: null }; }
})();

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

const hasSecret    = Boolean(process.env.JWT_SECRET);
const STRICT_PERMS = parseBool(process.env.STRICT_PERMS);
const DEV_USER_ID  = Number(process.env.DEV_USER_ID || 0);
const LOGIN_DEBUG  = parseBool(process.env.LOGIN_DEBUG);

// ---- PUBLIC PATHS (ampliables por env AUTH_PUBLIC_PATHS) ----
const DEFAULT_PUBLIC = [
  /^\/login(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/ping$/i,
  /^\/health$/i,
  /^\/sse(?:\/|$)/i,
  /^\/caja\/stream$/i,
  /^\/test-mail$/i,
];

const EXTRA_PUBLIC = String(process.env.AUTH_PUBLIC_PATHS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(p => (p.startsWith('^') ? new RegExp(p, 'i')
                               : new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:/|$)', 'i')));

const PUBLIC_PATTERNS = [...DEFAULT_PUBLIC, ...EXTRA_PUBLIC];

// ========== Prisma opcional (solo si DEV_USER_ID > 0) ==========
let prisma = null;
if (DEV_USER_ID > 0) {
  try {
    const { PrismaClient } = require('../generated/prisma');
    prisma = new PrismaClient();
  } catch (e) {
    console.warn('[autorice] Prisma no disponible; DEV_USER_ID ignorado.');
  }
}

// ---- helpers ----
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
function tryParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function tryBase64JSON(s) { try { return JSON.parse(Buffer.from(String(s), 'base64').toString('utf8')); } catch { return null; } }

async function loadDevUserFromDB() {
  if (!prisma || !DEV_USER_ID) return null;
  try {
    const u = await prisma.usuario.findUnique({
      where: { id: DEV_USER_ID },
      include: { rol: { include: { permisos: true } }, permisos: true },
    });
    if (!u) return null;

    const srcPerms = (Array.isArray(u?.permisos) && u.permisos.length)
      ? u.permisos
      : (u?.rol?.permisos || []);

    return {
      id: u.id,
      nombre: u.nombre || '',
      rol: u.rol ? { nombre: u.rol.nombre } : null,
      permisos: normPerms(srcPerms),
      debeCambiarPassword: Boolean(u.debeCambiarPassword),
    };
  } catch (e) {
    console.error('[autorice] error cargando DEV_USER_ID:', e?.message || e);
    return null;
  }
}

function normalizeUser(u) {
  if (!u || typeof u !== 'object') return null;

  const rolNombre =
    typeof u.rol === 'string'
      ? u.rol
      : (u.rol && (u.rol.nombre || u.rol.key)) || '';

  const srcPerms = (Array.isArray(u?.permisos) && u.permisos.length)
    ? u.permisos
    : (Array.isArray(u?.rol?.permisos) ? u.rol.permisos : []);
  const permisos = normPerms(srcPerms);

  return {
    ...u,
    rol: rolNombre
      ? { ...(typeof u.rol === 'object' ? u.rol : {}), nombre: rolNombre }
      : (u.rol || null),
    permisos,
  };
}

function isPublic(req) {
  if (req.method === 'OPTIONS') return true; // preflight
  const p = req.path || req.originalUrl || '';
  return PUBLIC_PATTERNS.some(rx => rx.test(p));
}

async function auth(req, res, next) {
  req.user = null;

  // 1) Rutas públicas
  if (isPublic(req)) {
    if (LOGIN_DEBUG) console.log('[autorice] public:', req.method, req.path);
    return next();
  }

  const authz = String(req.headers['authorization'] || '').trim();

  // 2) PROD: Authorization: Bearer <token> (si hay SECRET)
  if (hasSecret && typeof verifyToken === 'function' && /^bearer\s+/i.test(authz)) {
    const token = authz.replace(/^bearer\s+/i, '').trim();
    try {
      const payload = verifyToken(token); // {id, nombre, rol, permisos,...}
      req.user = normalizeUser(payload || null);
    } catch (e) {
      if (LOGIN_DEBUG) console.warn('[autorice] JWT inválido:', e?.message || e);
      req.user = null;
    }
  }

  // 3-6) SOLO DEV (no hay SECRET): vías alternativas
  if (!hasSecret && !req.user) {
    // 3) Decodificar Bearer sin verificar (útil si traes un JWT "fake")
    if (/^bearer\s+/i.test(authz)) {
      const token = authz.replace(/^bearer\s+/i, '').trim();
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const json = Buffer.from(parts[1], 'base64url').toString('utf8');
          req.user = normalizeUser(JSON.parse(json));
        } catch {}
      }
    }

    // 4) X-User-Json (JSON o base64)
    if (!req.user) {
      const uJson = req.headers['x-user-json'];
      if (uJson) {
        const parsed = tryParseJSON(String(uJson)) || tryBase64JSON(String(uJson));
        if (parsed && typeof parsed === 'object') req.user = normalizeUser(parsed);
      }
    }

    // 5) ?token= (JSON/base64) — útil para SSE en dev
    if (!req.user && req.query?.token) {
      const parsed = tryParseJSON(String(req.query.token)) || tryBase64JSON(String(req.query.token));
      if (parsed && typeof parsed === 'object') req.user = normalizeUser(parsed);
    }

    // 6) DEV_USER_ID
    if (!req.user && DEV_USER_ID > 0) {
      req.user = await loadDevUserFromDB();
    }
  }

  // 7) Modo estricto: si aún no hay user => 401
  if (!req.user && STRICT_PERMS) {
    if (LOGIN_DEBUG) console.warn('[autorice] 401 UNAUTHENTICATED (strict=true) en', req.method, req.path);
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }

  return next();
}

module.exports = auth;
module.exports.auth = auth;
module.exports.default = auth;
