// backend/src/routes/reparto.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// ✉️ Servicio de correo y utils locales
const { sendEmail } = require('../services/email');
const up = (s='') => String(s||'').toUpperCase();
const Q  = (n) => `Q${Number(n||0).toFixed(2)}`;

// 🔔 Envío de PDF de ticket cuando queda ENTREGADO
const { notifyTicketIfFinal } = require('../services/orden.finalizado.notify');

/* =========================
   Convenciones de estados
=========================== */
const DELIVERY = {
  LISTO: 'LISTO_PARA_ENTREGA',
  ASIGNADO: 'ASIGNADO_A_REPARTIDOR',
  EN_CAMINO: 'EN_CAMINO',
  ENTREGADO: 'ENTREGADO',
};
const TIPO_ENTREGA = { DOMICILIO: 'DOMICILIO', LOCAL: 'LOCAL' };

/* =========================
   Helpers de request
=========================== */
function getRepartidorId(req) {
  if (req.user?.id) return Number(req.user.id);
  if (req.headers['x-repartidor-id']) return Number(req.headers['x-repartidor-id']);
  if (req.query?.repartidorId) return Number(req.query.repartidorId);
  if (req.body?.repartidorId) return Number(req.body.repartidorId);
  return null;
}

/* =========================
   HTML para correos
=========================== */
function pedidoItemsHtml(items=[]) {
  if (!items?.length) return '<p><em>Sin productos</em></p>';
  const rows = items.map(i=>`
    <tr>
      <td style="padding:.25rem .5rem">${i.qty||1}× ${i.nombre}${i.nota?` <em style="color:#64748b">(nota: ${i.nota})</em>`:''}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(i.precio)}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(Number(i.precio)*Number(i.qty||1))}</td>
    </tr>
  `).join('');
  return `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
      <thead><tr style="background:#f8fafc">
        <th align="left"  style="padding:.4rem .5rem">Producto</th>
        <th align="right" style="padding:.4rem .5rem">Precio</th>
        <th align="right" style="padding:.4rem .5rem">Subtotal</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>`;
}

const emailAsignadoRepartidorHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} fue asignado a repartidor!</h2>
    <p style="margin:.25rem 0">En breve pasará a recogerlo.</p>
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p><b>Receptor:</b> ${p.receptorNombre || '-'}</p>`:''}
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p><b>Dirección:</b> ${p.direccion || '-'}</p>`:''}
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;
const emailEnCaminoHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} va en camino!</h2>
    <p style="margin:.25rem 0">Nuestro repartidor ya salió hacia tu dirección. 🚗💨</p>
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p><b>Receptor:</b> ${p.receptorNombre || '-'}</p>`:''}
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p><b>Dirección:</b> ${p.direccion || '-'}</p>`:''}
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;
// ⚠️ En ENTREGADO no mandamos correo simple; el PDF de la ticket se envía con notifyTicketIfFinal.

/**
 * Carga el pedido y envía correo según 'status' (solo DOMICILIO).
 */
async function sendDeliveryEmail(pedidoId, status) {
  try {
    const p = await prisma.pedidoCliente.findUnique({
      where: { id: Number(pedidoId) },
      include: { items: true },
    });
    if (!p) return;
    if (up(p.tipoEntrega) !== 'DOMICILIO') return;
    if (!p.clienteEmail) return;

    const S = up(status);
    if (S === DELIVERY.ASIGNADO) {
      await sendEmail({ to: p.clienteEmail, subject: `Pedido #${p.codigo} asignado a repartidor`, html: emailAsignadoRepartidorHtml(p) });
    } else if (S === DELIVERY.EN_CAMINO) {
      await sendEmail({ to: p.clienteEmail, subject: `Pedido #${p.codigo} en camino`, html: emailEnCaminoHtml(p) });
    }
    // En ENTREGADO NO: lo hace notifyTicketIfFinal.
  } catch (e) {
    console.error('✉️ sendDeliveryEmail fallo:', e?.message || e);
  }
}

/* ==============================
   Select base para listados
============================== */
const selectPedidoForList = {
  id: true,
  codigo: true,
  creadoEn: true,
  tipoEntrega: true,
  deliveryStatus: true,
  direccion: true,
  telefono: true,
  receptorNombre: true,
  total: true,
  orden: { 
    select: { 
      id: true, 
      codigo: true, 
      mesa: true, 
      finishedAt: true,
      items: { select: { id: true, nombre: true, precio: true, nota: true } },
    } 
  },
  items: { select: { id: true, nombre: true, qty: true, precio: true, nota: true } },
  // 👇 última observación de entrega (si existe)
  observaciones: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, texto: true, createdAt: true, repartidorId: true }
  }
};

/* ==============================
   Normalizador para el front
============================== */
function normalizePedido(p) {
  let items = Array.isArray(p.items)
    ? p.items.map(it => ({
        id: it.id,
        nombre: it.nombre,
        precio: Number(it.precio || 0),
        qty: Number(it.qty || 1),
        nota: (it.nota || '').trim() || null,
      }))
    : [];

  if (items.length === 0 && p.orden?.items?.length) {
    items = p.orden.items.map(it => ({
      id: it.id,
      nombre: it.nombre,
      precio: Number(it.precio || 0),
      qty: 1,
      nota: (it.nota || '').trim() || null,
    }));
  }

  const ultimaObservacion = Array.isArray(p.observaciones) && p.observaciones[0]
    ? {
        id: p.observaciones[0].id,
        texto: p.observaciones[0].texto,
        createdAt: p.observaciones[0].createdAt,
        repartidorId: p.observaciones[0].repartidorId,
      }
    : null;

  return {
    id: p.id,
    codigo: p.codigo,
    creadoEn: p.creadoEn,
    tipoEntrega: p.tipoEntrega,
    deliveryStatus: p.deliveryStatus,
    direccion: p.direccion,
    telefono: p.telefono,
    receptorNombre: p.receptorNombre,
    total: Number(p.total || 0),
    nota: null,
    items,
    // 👇 útiles para UI (chip “Notas” y mostrar en historial)
    ultimaObservacion,
    lastEntregaObs: ultimaObservacion?.texto || null,
  };
}

/* ==============================
   Health / Debug
============================== */
router.get('/health', (_req, res) => {
  res.json({ ok: true, at: '/reparto', ts: new Date().toISOString() });
});

/* =========================================================
   A) Disponibles (pool): listos y sin repartidor
========================================================= */
async function handlerDisponibles(_req, res) {
  try {
    const pedidos = await prisma.pedidoCliente.findMany({
      where: {
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        deliveryStatus: DELIVERY.LISTO,
        repartidorId: null,
      },
      orderBy: [{ readyAt: 'asc' }, { creadoEn: 'asc' }],
      select: selectPedidoForList,
    });
    res.json(pedidos.map(normalizePedido));
  } catch (e) {
    console.error('GET /reparto/disponibles', e);
    res.status(500).json({ error: 'No se pudo cargar la cola de reparto' });
  }
}
router.get('/disponibles', handlerDisponibles);
router.get('/listos',      handlerDisponibles); // alias

/* =========================================================
   B) Mis entregas (asignado / en camino)
========================================================= */
async function handlerMis(req, res) {
  try {
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const soloActivos = String(req.query.soloActivos || '') === '1';
    const where = {
      repartidorId,
      ...(soloActivos ? { deliveryStatus: { in: [DELIVERY.ASIGNADO, DELIVERY.EN_CAMINO] } } : {}),
    };

    const mine = await prisma.pedidoCliente.findMany({
      where,
      orderBy: [
        { deliveryStatus: 'asc' }, // ASIGNADO primero, luego EN_CAMINO
        { assignedAt: 'desc' },
        { creadoEn: 'desc' },
      ],
      select: selectPedidoForList,
    });
    res.json(mine.map(normalizePedido));
  } catch (e) {
    console.error('GET /reparto/mias', e);
    res.status(500).json({ error: 'No se pudieron cargar tus entregas' });
  }
}
router.get('/mias', handlerMis);
router.get('/mios', handlerMis); // alias

/* =========================
   C) Historial (entregados)
=========================== */
router.get('/historial', async (req, res) => {
  try {
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const hist = await prisma.pedidoCliente.findMany({
      where: { repartidorId, deliveryStatus: DELIVERY.ENTREGADO },
      orderBy: [{ deliveredAt: 'desc' }, { creadoEn: 'desc' }],
      select: selectPedidoForList,
    });
    res.json(hist.map(normalizePedido));
  } catch (e) {
    console.error('GET /reparto/historial', e);
    res.status(500).json({ error: 'No se pudo cargar historial' });
  }
});

/* =========================================================
   D) Reclamar (tomar) uno
========================================================= */
async function handlerClaim(req, res) {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const r = await prisma.pedidoCliente.updateMany({
      where: {
        id: pedidoId,
        tipoEntrega: TIPO_ENTREGA.DOMICILIO,
        deliveryStatus: DELIVERY.LISTO,
        repartidorId: null,
      },
      data: {
        repartidorId,
        deliveryStatus: DELIVERY.ASIGNADO,
        assignedAt: new Date(),
      },
    });

    if (r.count === 0) return res.status(409).json({ error: 'Ya fue tomado por otro repartidor' });

    // ✉️ correo: ASIGNADO
    await sendDeliveryEmail(pedidoId, DELIVERY.ASIGNADO);

    const upd = await prisma.pedidoCliente.findUnique({ where: { id: pedidoId }, select: selectPedidoForList });
    res.json({ ok: true, pedido: normalizePedido(upd) });
  } catch (e) {
    console.error('CLAIM pedido', e);
    res.status(500).json({ error: 'No se pudo reclamar' });
  }
}
router.post('/:pedidoId/claim',  handlerClaim);
router.patch('/:pedidoId/tomar', handlerClaim); // alias

/* =========================================================
   E) Reclamar varios
========================================================= */
router.post('/claim-bulk', async (req, res) => {
  try {
    const { pedidoIds = [] } = req.body || {};
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const tomados = [];
    for (const id of pedidoIds) {
      const r = await prisma.pedidoCliente.updateMany({
        where: {
          id,
          tipoEntrega: TIPO_ENTREGA.DOMICILIO,
          deliveryStatus: DELIVERY.LISTO,
          repartidorId: null,
        },
        data: {
          repartidorId,
          deliveryStatus: DELIVERY.ASIGNADO,
          assignedAt: new Date(),
        },
      });
      if (r.count === 1) tomados.push(id);
    }

    if (tomados.length === 0) return res.status(409).json({ error: 'Ninguno disponible; alguien se adelantó' });

    try { await Promise.all(tomados.map(id => sendDeliveryEmail(id, DELIVERY.ASIGNADO))); } catch(e) { console.error('bulk mail:', e?.message); }

    res.json({ ok: true, ids: tomados });
  } catch (e) {
    console.error('POST /reparto/claim-bulk', e);
    res.status(500).json({ error: 'No se pudo reclamar en lote' });
  }
});

/* =========================================================
   F) Pasar a EN_CAMINO
========================================================= */
async function handlerEnCamino(req, res) {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const r = await prisma.pedidoCliente.updateMany({
      where: { id: pedidoId, repartidorId, deliveryStatus: DELIVERY.ASIGNADO },
      data: { deliveryStatus: DELIVERY.EN_CAMINO, startedAt: new Date() },
    });

    if (r.count === 0) return res.status(400).json({ error: 'No se pudo pasar a EN_CAMINO' });

    // ✉️ correo: EN_CAMINO
    await sendDeliveryEmail(pedidoId, DELIVERY.EN_CAMINO);

    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /reparto/:pedidoId/en-camino', e);
    res.status(500).json({ error: 'No se pudo cambiar a EN_CAMINO' });
  }
}
router.patch('/:pedidoId/en-camino', handlerEnCamino);
router.patch('/:pedidoId/iniciar',   handlerEnCamino); // alias

/* =========================================================
   G1) Crear observación independiente
========================================================= */
router.post('/:pedidoId/observaciones', async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    const { texto = '' } = req.body || {};
    const t = String(texto || '').trim();

    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });
    if (!t) return res.status(400).json({ error: 'Texto de observación vacío' });

    const ped = await prisma.pedidoCliente.findUnique({
      where: { id: pedidoId },
      select: { id: true, repartidorId: true }
    });
    if (!ped) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (Number(ped.repartidorId) !== Number(repartidorId)) {
      return res.status(403).json({ error: 'No puedes agregar observaciones a pedidos de otro repartidor' });
    }

    const obs = await prisma.observacionEntrega.create({
      data: { pedidoId, repartidorId, texto: t.slice(0, 1000) },
      select: { id: true, texto: true, createdAt: true, repartidorId: true, pedidoId: true }
    });

    res.status(201).json({ ok: true, observacion: obs });
  } catch (e) {
    console.error('POST /reparto/:pedidoId/observaciones', e);
    res.status(500).json({ error: 'No se pudo guardar la observación' });
  }
});

/* =========================================================
   G2) Marcar ENTREGADO (con observación opcional)
========================================================= */
async function handlerEntregar(req, res) {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const repartidorId = getRepartidorId(req);
    if (!repartidorId) return res.status(400).json({ error: 'Falta repartidorId' });

    const obsText = String(req.body?.observacion || '').trim().slice(0, 1000);

    await prisma.$transaction(async (tx) => {
      // 1) crear observación si viene texto
      if (obsText) {
        await tx.observacionEntrega.create({
          data: { pedidoId, repartidorId, texto: obsText }
        });
      }
      // 2) marcar ENTREGADO
      const r = await tx.pedidoCliente.updateMany({
        where: {
          id: pedidoId,
          repartidorId,
          deliveryStatus: { in: [DELIVERY.ASIGNADO, DELIVERY.EN_CAMINO] },
        },
        data: { deliveryStatus: DELIVERY.ENTREGADO, deliveredAt: new Date() },
      });
      if (r.count === 0) {
        // forzar rollback
        throw new Error('No se pudo marcar como ENTREGADO');
      }
    });

    // ✅ Enviar PDF de la ticket al cliente (no bloquea la respuesta)
    try {
      const ped = await prisma.pedidoCliente.findUnique({
        where: { id: pedidoId },
        select: { ordenId: true }
      });
      if (ped?.ordenId) {
        notifyTicketIfFinal({ id: ped.ordenId, deliveryStatus: DELIVERY.ENTREGADO });
      }
    } catch (e) {
      console.error('notifyTicketIfFinal ENTREGADO falló:', e?.message || e);
    }

    // Devolver actualizado (con última observación)
    const updated = await prisma.pedidoCliente.findUnique({
      where: { id: pedidoId },
      select: selectPedidoForList,
    });

    res.json({ ok: true, pedido: normalizePedido(updated) });
  } catch (e) {
    console.error('PATCH /reparto/:pedidoId/entregar', e);
    res.status(500).json({ error: e?.message || 'No se pudo marcar ENTREGADO' });
  }
}
router.patch('/:pedidoId/entregar',  handlerEntregar);
router.patch('/:pedidoId/entregado', handlerEntregar); // alias

module.exports = router;
