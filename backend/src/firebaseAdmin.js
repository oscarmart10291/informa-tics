const admin = require('firebase-admin');

function parseSvcFromEnv() {
  // A: Si tienes el JSON codificado en base64 (Railway)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64) {
    try {
      const jsonStr = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64,
        'base64'
      ).toString('utf8');
      const svc = JSON.parse(jsonStr);
      if (svc.private_key?.includes('\\n')) {
        svc.private_key = svc.private_key.replace(/\\n/g, '\n');
      }
      return svc;
    } catch (err) {
      console.error('[Firebase] Base64 inválido:', err.message);
    }
  }

  // B: Si estás en local y tienes FIREBASE_SERVICE_ACCOUNT_JSON en .env
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (svc.private_key?.includes('\\n')) {
        svc.private_key = svc.private_key.replace(/\\n/g, '\n');
      }
      return svc;
    } catch (e) {
      console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT inválido:', e.message);
    }
  }

  return null;
}

let inited = false;
try {
  const svc = parseSvcFromEnv();
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    inited = true;
    console.log('[Firebase] Admin inicializado ✅');
  } else {
    console.warn('[Firebase] Sin credenciales, Admin NO inicializado.');
  }
} catch (e) {
  console.error('[Firebase] Falló la inicialización:', e);
}

module.exports = admin;
module.exports.__inited = inited;
