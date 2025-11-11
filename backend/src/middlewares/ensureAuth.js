// backend/src/middlewares/ensureAuth.js
// Middleware de autenticación.
// 1) Si hay JWT en Authorization o cookie `token`, valida y asigna req.user.
// 2) Fallback para desarrollo: si llega cajeroId en body/query, lo acepta para no bloquear pruebas.
//    Quitar el fallback en producción si se usa JWT real.

const jwt = require('jsonwebtoken');

module.exports = function ensureAuth(req, res, next) {
  try {
    const hdr = String(req.headers.authorization || '');
    const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const raw = bearer || (req.cookies ? req.cookies.token : null);

    if (raw) {
      const payload = jwt.verify(raw, process.env.JWT_SECRET);
      req.user = payload && typeof payload === 'object' ? payload : null;
      return next();
    }

    // Fallback temporal (solo dev)
    const cajeroIdFallback = Number(req.body?.cajeroId || req.query?.cajeroId || 0) || null;
    if (cajeroIdFallback) {
      req.user = { id: cajeroIdFallback, rol: 'CAJERO' };
      return next();
    }

    return res.status(401).json({ error: 'UNAUTHORIZED' });
  } catch (_err) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
};
