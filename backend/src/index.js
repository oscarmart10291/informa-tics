// backend/src/index.js
process.env.TZ = 'America/Guatemala';
console.log('🕓 Zona horaria fijada en:', process.env.TZ);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const reportesMesasRoutes = require('./routes/reporteria.mesas');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Si corres detrás de Nginx/Cloudflare/etc. en PROD
if (IS_PROD) {
  app.set('trust proxy', 1);
}

// Prisma autosync Caja
const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();
const { startCajaAutoSync } = require('./services/caja.autosync');

// ========== MIDDLEWARES (usa los tuyos y adáptalos) ==========

// auth puede venir exportado de varias formas; normalizamos
let auth = require('./middlewares/autorice');
if (auth && typeof auth !== 'function') {
  if (typeof auth.auth === 'function') auth = auth.auth;
  else if (typeof auth.default === 'function') auth = auth.default;
}
// fallback si no encontramos función (no rompemos en dev)
if (typeof auth !== 'function') {
  console.error('[BOOT] auth middleware no es función. Valor:', auth);
  auth = (_req, _res, next) => next();
}

// requirePerm tuyo devuelve (anyOf:Array, opts) => middleware
let requirePermBase = require('./middlewares/requirePerm');
if (requirePermBase && typeof requirePermBase !== 'function') {
  if (typeof requirePermBase.requirePerm === 'function') requirePermBase = requirePermBase.requirePerm;
  else if (typeof requirePermBase.default === 'function') requirePermBase = requirePermBase.default;
}
const requirePerm = (anyOf = [], opts = {}) => {
  const arr = Array.isArray(anyOf) ? anyOf : [anyOf];
  return requirePermBase(arr, opts);
};

// ========== Helpers Router (detecta router directo vs factory) ==========
function normalizeExport(mod) {
  if (mod && typeof mod === 'object' && mod.default) return mod.default;
  return mod;
}
function looksLikeExpressRouter(r) {
  return typeof r === 'function' && typeof r.use === 'function' && typeof r.handle === 'function';
}
function mountRouter(prefix, mod) {
  const m = normalizeExport(mod);
  if (!m) {
    console.warn(`[BOOT] No se montó ${prefix}: módulo vacío/null`);
    return;
  }
  try {
    if (looksLikeExpressRouter(m)) {
      app.use(prefix, m);
      return;
    }
    if (typeof m === 'function') {
      const r = m(prisma, { auth, requirePerm });
      if (!looksLikeExpressRouter(r)) {
        console.warn(`[BOOT] Factory de ${prefix} no devolvió un Router válido. Tipo:`, typeof r);
        return;
      }
      app.use(prefix, r);
      return;
    }
    console.warn(`[BOOT] ${prefix}: export no reconocido (tipo ${typeof m}). Se omite.`);
  } catch (e) {
    console.error(`[BOOT] Error montando ${prefix}:`, e);
  }
}

// Routers (algunos pueden ser factory, otros Router directo)
const reportesRoutes        = require('./routes/reportes.routes');
const reportesVentasRoutes  = require('./routes/reportes.ventas.routes'); // ventas/top/tiempos/comprobantes (nuevo)
const ticketVentasRoutes    = require('./routes/ticket-ventas.routes');

/* =========================
   IPs LAN para logs y CORS
========================= */
function getLocalIPv4s() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  return ips;
}
const localIPs = getLocalIPv4s();

/* =========================
   ORIGINS permitidos
========================= */
const ORIGINS = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const FRONTEND_URL = (process.env.FRONTEND_URL || '').trim();
if (FRONTEND_URL) ORIGINS.push(FRONTEND_URL);

// En dev, añade algunos defaults para DX
if (!IS_PROD && ORIGINS.length === 0) {
  ORIGINS.push(
    'http://localhost:3000','http://127.0.0.1:3000',
    'http://localhost:3002','http://127.0.0.1:3002',
    'http://localhost:5001','http://127.0.0.1:5001',
    'http://localhost:5173','http://127.0.0.1:5173',
  );
  for (const ip of localIPs) {
    ['3000','3002','5001','5173'].forEach(p => ORIGINS.push(`http://${ip}:${p}`));
  }
}

/* =========================
   Middlewares
========================= */
app.use(express.json());

app.use(cors({
  origin(origin, cb) {
    if (!origin || ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origen no permitido -> ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  const reqHdr = req.headers['access-control-request-headers'];
  // Incluye X-User-Json para compatibilidad (solo útil en DEV si lo usas)
  res.header('Access-Control-Allow-Headers', reqHdr || 'Content-Type, Authorization, X-User-Json, X-Requested-With');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* =========================
   Añadidos clave
========================= */
app.use((_, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.use((req, res, next) => {
  if (req.path === '/sse') return next();
  const t = setTimeout(() => console.warn(`[WARN +5s] ${req.method} ${req.originalUrl}`), 5000);
  res.on('finish', () => clearTimeout(t));
  res.on('close', () => clearTimeout(t));
  next();
});

// 👇 **APLICA AUTH ANTES DE LAS RUTAS**
app.use(auth);

// (opcional) diagnóstico de usuario actual (mejor desactivar en PROD)
if (!IS_PROD) {
  app.get('/debug/whoami', (req, res) => res.json({ user: req.user }));
}
app.use('/caja', require('./routes/caja.egresos.admin.routes'));

/* =========================
   Rutas (requires)
========================= */
const loginRoutes             = require('./routes/login.routes');
const usuarioRoutes           = require('./routes/usuarios.routes');
const rolesRoutes             = require('./routes/rol.routes');
const historialRoutes         = require('./routes/historial.routes');
const platillosRoutes         = require('./routes/platillos.routes');
const categoriaRoutes         = require('./routes/categoria.routes');
const permisosRoutes          = require('./routes/permisos.routes');
const ordenesMeseroRoutes     = require('./routes/ordenes.mesero.routes');
const ordenesBarraRoutes      = require('./routes/ordenes.barra.routes');
const ordenesCocinaRoutes     = require('./routes/ordenes.cocina.routes');
const changePwdRoutes         = require('./routes/auth.change.routes');
const authGoogleClienteRoutes = require('./routes/auth.google.cliente.routes');
const pedidosClienteRoutes    = require('./routes/pedidos.cliente.routes');
const mesasRoutes             = require('./routes/mesas.routes');
const cajaRoutes              = require('./routes/caja.routes');
const cajaPagosRoutes         = require('./routes/caja_pagos');            // pagos parciales / anticipo
const cajaMiscRoutes          = require('./routes/caja.misc.routes');      // ventas del día + egresos
const clientePagosRoutes      = require('./routes/cliente.pagos.routes');
const meseroNotifsRoutes      = require('./routes/mesero.notifs.routes');

// 🔔 SSE (usar UN solo handler)
const { sseHandler }          = require('./services/notificaciones.sse');

// Reparto
const repartoRoutes           = require('./routes/reparto.routes');
const repartoStream           = require('./routes/reparto.stream');
const repartidorNotifsRoutes  = require('./routes/repartidor.notifs.routes');
const reservasRoutes          = require('./routes/reservas.routes');

/* ========= (opcional) Router de turnos de caja ========= */
let cajaTurnosRoutes = null;
try { cajaTurnosRoutes = require('./routes/caja.turnos.routes'); }
catch { console.warn('[BOOT] ./routes/caja.turnos.routes no encontrado (aún). Se omite montaje.'); }

/* =========================
   Healthchecks
========================= */
app.get('/', (_req, res) => res.send('Backend corriendo 🚀'));
app.get('/ping', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) => res.json({ ok: true }));

/* =========================
   Prefijos (ORDEN IMPORTA)
========================= */
// Auth / usuarios / catálogo
app.use('/auth', changePwdRoutes);
app.use('/auth', authGoogleClienteRoutes);

app.use('/login', loginRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/roles', rolesRoutes);
app.use('/historial', historialRoutes);
app.use('/platillos', platillosRoutes);
app.use('/categorias', categoriaRoutes);
app.use('/permisos', permisosRoutes);

// Órdenes
app.use('/ordenes', ordenesMeseroRoutes);

// Cocina
app.use('/cocina', ordenesCocinaRoutes);
app.use('/ordenes/cocina', ordenesCocinaRoutes); // alias
app.use('/caja', require('./routes/caja.routes'));
app.use('/mesas', require('./routes/mesas.routes'));

// Barra
app.use('/barra', ordenesBarraRoutes);
app.use('/ordenes/barra', ordenesBarraRoutes); // alias

// Mesas y Caja
app.use('/mesas', mesasRoutes);
app.use('/caja', cajaRoutes);
app.use('/moneda', require('./routes/tipocambio.routes'));


// ✅ NUEVO: Propina/ajustes (si existe archivo propina.routes.js)
let propinaRoutes;
try { propinaRoutes = require('./routes/propina.routes'); } catch (_) {}
if (propinaRoutes) mountRouter('/propina', propinaRoutes);

// ...
app.use('/admin/calificaciones', require('./routes/admin.calificaciones.routes'));
// ...

// (opcional) Turnos de caja
if (cajaTurnosRoutes) {
  const routerTurnos = normalizeExport(cajaTurnosRoutes);
  if (looksLikeExpressRouter(routerTurnos)) {
    app.use('/caja', routerTurnos);
  } else if (typeof routerTurnos === 'function') {
    const r = routerTurnos(prisma, { auth, requirePerm });
    if (looksLikeExpressRouter(r)) app.use('/caja', r);
  }
}

// pagos parciales / anticipo-restante
mountRouter('/caja', cajaPagosRoutes);

// Dashboard de reportería (ventas del día + egresos)
app.use('/reportes', require('./routes/reportes.dashboard.routes'));

mountRouter('/caja', cajaMiscRoutes);

// ✅ NUEVO: reportería de mesas (uso)
app.use('/reportes', reportesMesasRoutes);

// Cliente
app.use('/cliente/pedidos', pedidosClienteRoutes);
app.use('/cliente/pagos', clientePagosRoutes);

// Notificaciones Mesero
app.use('/mesero/notifs', meseroNotifsRoutes);

// Reparto
app.use('/reparto', repartoRoutes);
app.use('/reparto/stream', repartoStream);

// Repartidor
app.use('/repartidor', repartidorNotifsRoutes);

app.use('/reservas', reservasRoutes);

// ✅ Reportería (ventas/top/tiempos + exports) — protegida
mountRouter('/reportes', reportesVentasRoutes);
mountRouter('/reportes', reportesRoutes);

// ✅ Comprobantes (TicketVenta + exports) — protegida
mountRouter('/ticket-ventas', ticketVentasRoutes);

// 🔁 QUITADO: alias de impresión (ahora lo sirve /caja/tickets/:id/impresion en caja.routes.js)
// app.get('/caja/tickets/:id/impresion', (req, res) => {
//   const id = encodeURIComponent(req.params.id);
//   return res.redirect(302, `/ticket-ventas/${id}/print`);
// });

// 🔁 QUITADO: alias SSE para caja (usa el /caja/stream de caja.routes.js)
// app.get('/caja/stream', sseHandler);

// SSE (handler directo en /sse, ANTES del 404)
app.get('/sse', sseHandler);

// backend/src/server.js  (o tu entrypoint)
const { startReservasAutoSweep } = require('./services/reservas.sweep');
startReservasAutoSweep({ everyMs: 30_000 });

/* =========================
   Test Mail (opcional)
========================= */
let sendEmail;
try { ({ sendEmail } = require('./services/email')); } catch (_) {}
if (sendEmail) {
app.get('/test-mail', async (_req, res) => {
  try {
    const { sendEmail } = require('./services/email');
    await sendEmail({
      to: process.env.REPLY_TO || 'tu-correo@ejemplo.com',
      subject: 'Prueba correo (Resend)',
      html: '<h3>Hola 👋</h3><p>Prueba vía Resend API.</p>',
    });
    res.send('OK: correo enviado');
  } catch (e) {
    console.error('❌ Error test-mail:', e);
    res.status(500).send(e.message);
  }
});
}

/* =========================
   404 y manejador de errores
========================= */
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

/* =========================
   Autosync y listen
========================= */
startCajaAutoSync(prisma, 3000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend en http://0.0.0.0:${PORT}`);
  console.log('Orígenes CORS permitidos:', ORIGINS);
});
