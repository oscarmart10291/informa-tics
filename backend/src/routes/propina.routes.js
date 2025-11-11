// backend/src/routes/propina.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// Tu middleware de permisos (devuelve (anyOf, opts) => middleware)
let requirePerm = require('../middlewares/requirePerm');
if (requirePerm && typeof requirePerm !== 'function') {
  if (typeof requirePerm.requirePerm === 'function') requirePerm = requirePerm.requirePerm;
  else if (typeof requirePerm.default === 'function') requirePerm = requirePerm.default;
}

// === Ajusta esta lista a los permisos que equivalen a "solo admin" en tu app ===
const ADMIN_PERMS = ['GESTIONAR_ROLES', 'CONFIGURAR_USUARIOS']; // cámbialos si tu admin usa otros

function clamp(n, min, max) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : min;
}
async function readTipSettings() {
  const [act, pct] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'tip_active' } }),
    prisma.setting.findUnique({ where: { key: 'tip_percent' } }),
  ]);
  const activa = String(act?.value ?? 'false').toLowerCase() === 'true';
  const porcentaje = clamp(pct?.value ?? 0, 0, 100);
  return { activa, porcentaje };
}
async function writeTipSettings({ activa, porcentaje }) {
  const a = !!activa;
  const p = clamp(porcentaje, 0, 100);

  await prisma.setting.upsert({
    where: { key: 'tip_active' },
    update: { value: String(a) },
    create: { key: 'tip_active', value: String(a) },
  });
  await prisma.setting.upsert({
    where: { key: 'tip_percent' },
    update: { value: String(p) },
    create: { key: 'tip_percent', value: String(p) },
  });
  return { activa: a, porcentaje: p };
}

/**
 * GET /propina/reglas/activas?scope=CAJA
 * Respuesta esperada por tu AdminPropina.jsx:
 * { regla: { scope:'CAJA', activa:boolean, porcentaje:number } }
 */
router.get('/reglas/activas', async (req, res) => {
  try {
    const scope = String(req.query.scope || 'CAJA').toUpperCase();
    const { activa, porcentaje } = await readTipSettings();
    return res.json({ regla: { scope, activa, porcentaje } });
  } catch (e) {
    console.error('GET /propina/reglas/activas', e);
    return res.status(500).json({ error: 'No se pudo obtener la regla de propina' });
  }
});

/**
 * PUT /propina/reglas/activas
 * Body: { scope?:'CAJA', activa:boolean, porcentaje:number }
 * Solo admin.
 */
router.put(
  '/reglas/activas',
  requirePerm(ADMIN_PERMS), // 🔒 Solo admin
  async (req, res) => {
    try {
      const activa = !!req.body?.activa;
      const porcentaje = clamp(req.body?.porcentaje, 0, 100);
      const saved = await writeTipSettings({ activa, porcentaje });
      return res.json({ ok: true, regla: { scope: 'CAJA', ...saved } });
    } catch (e) {
      console.error('PUT /propina/reglas/activas', e);
      return res.status(500).json({ error: 'No se pudo guardar la regla de propina' });
    }
  }
);

/**
 * GET /propina/estado-caja
 * Endpint simple para la vista de Caja.
 * Respuesta: { activa, porcentaje }
 * (Si prefieres restringirlo solo a cajeros, cambia a requirePerm(['CAJA']))
 */
router.get('/estado-caja', async (_req, res) => {
  try {
    const { activa, porcentaje } = await readTipSettings();
    return res.json({ activa, porcentaje });
  } catch (e) {
    console.error('GET /propina/estado-caja', e);
    return res.status(500).json({ error: 'No se pudo obtener el estado de propina' });
  }
});

module.exports = router;
