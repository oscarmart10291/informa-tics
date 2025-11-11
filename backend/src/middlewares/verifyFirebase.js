// backend/src/middlewares/verifyFirebase.js
const admin = require('../firebaseAdmin');

/**
 * Middleware para verificar ID Tokens de Firebase.
 * Si el token es válido, agrega los datos del usuario a req.user y req.firebaseUser.
 */
const DISABLE = String(process.env.DISABLE_FIREBASE_AUTH || '').toLowerCase() === 'true';

module.exports = async function verifyFirebase(req, res, next) {
  try {
    if (DISABLE) {
      req.user = {
        uid: 'dev-user',
        email: 'dev@example.com',
        name: 'Dev User',
        firebaseBypassed: true,
      };
      req.firebaseUser = req.user;
      return next();
    }

    if (!admin || !admin.apps || !admin.apps.length) {
      return res.status(500).json({ error: 'Firebase no configurado en el servidor' });
    }

    const authHeader = req.headers.authorization || '';
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Falta encabezado Authorization Bearer' });
    }

    const idToken = parts[1];
    const decoded = await admin.auth().verifyIdToken(idToken, true);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
      claims: decoded,
    };
    req.firebaseUser = decoded; // ✅ compatibilidad con rutas que usan firebaseUser

    console.log('[verifyFirebase] uid:', decoded.uid, ' email:', decoded.email);
    next();
  } catch (err) {
    console.error('[verifyFirebase] error:', err.message);
    return res.status(401).json({ error: 'Token inválido', detail: err.message });
  }
};
