// backend/src/routes/caja.routes.js
const express = require('express');
const {
  PrismaClient,
  MetodoPago,
  OrdenEstado,
  EgresoEstado,
  CajaTurnoEstado
} = require("../generated/prisma");

const requirePerm = require('../middlewares/requirePerm');
const { addCajaClient, broadcastCaja } = require('../services/caja.events');
const { getUserIdFromReq } = require('../middlewares/ensureCajaAbierta');

const prisma = new PrismaClient();
const router = express.Router();

/* =============================== Utils =============================== */
function calcTotal(items) {
  const t = (items || []).reduce((acc, it) => acc + Number(it.precio || 0), 0);
  return Number(t.toFixed(2));
}
function todayRange() {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date();   end.setHours(23,59,59,999);
  return { start, end };
}
function dayRangeOf(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
  const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
  return { start, end };
}

// Identidad flexible: token -> header -> query -> body -> fallback helper
function getUidFlex(req) {
  // 1) Token puesto por tu middleware (si existe)
  const fromUser = Number(req?.user?.id || 0);

  // 2) Headers (útil en Netlify/Railway, evita depender de cookies)
  const fromHeader = Number(
    req.get('X-Cajero-Id') ||
    req.get('X-User-Id')   ||
    req.get('x-cajero-id') ||
    req.get('x-user-id')   ||
    0
  );

  // 3) Querystring
  const fromQuery = Number(
    req?.query?.cajeroId || req?.query?.userId || req?.query?.adminId || 0
  );

  // 4) Body JSON
  const fromBody = Number(
    (req?.body && (
      req.body.cajeroId ?? 
      req.body.userId   ?? 
      req.body.adminId  ?? 
      (req.body.turno && req.body.turno.cajeroId)
    )) || 0
  );

  if (fromUser)   return fromUser;
  if (fromHeader) return fromHeader;
  if (fromQuery)  return fromQuery;
  if (fromBody)   return fromBody;

  // 5) Fallback a tu helper local (si existe)
  try {
    const x = getUserIdFromReq(req);
    if (x) return Number(x) || null;
  } catch {}

  return null;
}
// ¿Tiene turno ABIERTA?
async function tieneTurnoAbierto(uid) {
  if (!uid) return false;
  const t = await prisma.cajaTurno.findFirst({
    where: { cajeroId: Number(uid), estado: CajaTurnoEstado.ABIERTA },
    orderBy: { id: 'desc' }
  });
  return !!t;
}

// “Pedido en línea”
async function getOnlineInfo(ordenId) {
  const p = await prisma.pedidoCliente.findFirst({
    where: { ordenId: Number(ordenId) },
    select: { id: true },
  });
  return { esOnline: !!p, mesaTexto: p ? 'Pedido en línea' : null };
}

/** Anticipo por orden (reserva aplicada) */
async function findAnticipoForOrden(orden) {
  if (!orden) return 0;

  let r = await prisma.reserva.findFirst({
    where: { aplicadoEnOrdenId: orden.id },
    select: { id: true, monto: true }
  });
  if (r) return Number(r.monto || 50);

  r = await prisma.reserva.findFirst({
    where: {
      estado: 'CONFIRMADA',
      pagoEstado: 'PAGADO',
      aplicadoEnOrdenId: null,
      mesa: orden.mesa != null ? { numero: Number(orden.mesa) } : undefined,
      AND: [
        { fechaHora: { lte: orden.fecha || new Date() } },
        { hastaHora: { gte: orden.fecha || new Date() } },
      ],
    },
    select: { id: true, monto: true }
  });
  return r ? Number(r.monto || 50) : 0;
}

/** Anticipo aplicado a un ticket (por pago u orden). */
async function findAnticipoForTicket(ticket) {
  if (!ticket) return 0;
  let r = await prisma.reserva.findFirst({
    where: { aplicadoEnPagoId: ticket.id },
    select: { monto: true }
  });
  if (r) return Number(r.monto || 50);

  if (ticket.ordenId) {
    r = await prisma.reserva.findFirst({
      where: { aplicadoEnOrdenId: ticket.ordenId },
      select: { monto: true }
    });
    if (r) return Number(r.monto || 50);
  }
  return 0;
}

/** Anticipo restante de una orden (para pagos parciales) */
async function anticipoRestante(ordenId) {
  const o = await prisma.orden.findUnique({ where: { id: ordenId } });
  const anticipo = await findAnticipoForOrden(o);
  const prev = await prisma.ticketVenta.aggregate({
    _sum: { anticipoAplicado: true },
    where: { ordenId },
  });
  const aplicado = Number(prev._sum.anticipoAplicado || 0);
  return Math.max(0, Number(anticipo) - aplicado);
}

/* ===== Helper “a prueba de schema” para TicketVenta ===== */
async function safeCreateTicketVenta(tx, fullData) {
  try {
    return await tx.ticketVenta.create({
      data: fullData,
      include: { orden: { include: { items: true } } },
    });
  } catch (e1) {
    console.warn('[ticketVenta.create] payload completo falló:', e1?.code, e1?.message);
    const minimal = {
      ordenId: fullData.ordenId,
      metodoPago: fullData.metodoPago,
      totalAPagar: fullData.totalAPagar,
      montoRecibido: fullData.montoRecibido ?? fullData.totalAPagar,
      cambio: fullData.cambio ?? 0,
      fechaPago: fullData.fechaPago || new Date(),
      cajeroId: fullData.cajeroId ?? null,
    };
    return await tx.ticketVenta.create({
      data: minimal,
      include: { orden: { include: { items: true } } },
    });
  }
}

/* ====== Helpers para conteo de billetes ====== */
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function denomsTotal(raw){
  if(!raw) return 0;
  const m = new Map(Object.entries(raw).map(
    ([k,v]) => [String(k).toLowerCase().replace('.', '_'), toNum(v)]
  ));
  const get = (k)=> toNum(m.get(k) || 0);
  return Number((
    get('q200')*200 + get('q100')*100 + get('q50')*50 + get('q20')*20 +
    get('q10')*10  + get('q5')*5    + get('q1')*1   +
    get('q0_50')*0.5 + get('q0_25')*0.25
  ).toFixed(2));
}

/* ====== Propina (helpers) ====== */

/** Compatibilidad con setting clave `tip_percent` */
async function getTipPercent() {
  const s = await prisma.setting.findUnique({ where: { key: 'tip_percent' } });
  const n = Number(s?.value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Lee configuración de propina.
 *  - Intenta tabla de reglas (propinaRegla) si existe.
 *  - Si no existe, cae a settings: `tip_active` (bool) y `tip_percent` (num).
 */
async function getTipConfig() {
  // 1) Intentar tabla de reglas (si existe)
  try {
    const regla = await prisma.propinaRegla.findFirst({
      where: { activa: true, scope: 'CAJA' },
      orderBy: { id: 'desc' },
      select: { activa: true, porcentaje: true }
    });
    if (regla) {
      const pct = Number(regla.porcentaje || 0);
      return { activa: !!regla.activa && pct > 0, porcentaje: pct > 0 ? pct : 0 };
    }
  } catch { /* Si no existe la tabla, continuamos */ }

  // 2) Fallback a settings
  let activa = false;
  try {
    const sAct = await prisma.setting.findUnique({ where: { key: 'tip_active' } });
    const val = String(sAct?.value ?? '').toLowerCase();
    activa = ['1','true','sí','si','yes','on'].includes(val);
  } catch {}

  const porcentaje = await getTipPercent();
  return { activa: !!activa && porcentaje > 0, porcentaje };
}

/** ¿Debe aplicarse propina? Local = sí; Online no-local = no. */
async function shouldApplyTip(ordenId) {
  const pc = await prisma.pedidoCliente.findFirst({
    where: { ordenId: Number(ordenId) },
    select: { tipoEntrega: true }
  });
  if (!pc) return true; // orden de mesa (local)
  return String(pc.tipoEntrega || '').toUpperCase() === 'LOCAL';
}

/* =============================== SSE =============================== */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  addCajaClient(res);
});

/* ✅ NUEVO: Propina visible para CAJA (solo lectura)
   GET /caja/propina -> { activa, porcentaje } */
router.get('/propina', requirePerm(['CAJA'], { strict: false }), async (_req, res) => {
  try {
    const { activa, porcentaje } = await getTipConfig();
    res.json({ activa, porcentaje, tipPercent: porcentaje });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener propina' });
  }
});

/* ======================== Órdenes pendientes ======================== */
router.get('/pendientes', requirePerm(['CAJA'], { strict: false }), async (_req, res) => {
  try {
    const ordenes = await prisma.orden.findMany({
      where: { estado: OrdenEstado.PENDIENTE_PAGO },
      include: { items: true, mesero: { select: { id: true, nombre: true } } },
      orderBy: { id: 'asc' },
    });

    const data = await Promise.all(
      ordenes.map(async (o) => {
        const { esOnline, mesaTexto } = await getOnlineInfo(o.id);
        const anticipo = await findAnticipoForOrden(o);
        const itemsNoPagados = (o.items || []).filter(it => !it.pagado);
        if (itemsNoPagados.length === 0) return null;

        return {
          id: o.id,
          codigo: o.codigo,
          mesa: o.mesa,
          mesaTexto: mesaTexto || String(o.mesa),
          esOnline,
          fecha: o.fecha,
          total: calcTotal(itemsNoPagados),
          items: o.items.map(it => ({ ...it, pagado: !!it.pagado })),
          mesero: o.mesero || null,
          anticipo,
        };
      })
    );

    res.json(data.filter(Boolean));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo pendientes' });
  }
});

/* ========================= Detalle de orden ========================= */
router.get('/orden/:id', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const o = await prisma.orden.findUnique({
      where: { id },
      include: { items: true, mesero: { select: { id: true, nombre: true } } },
    });
    if (!o) return res.status(404).json({ error: 'Orden no encontrada' });

    const { esOnline, mesaTexto } = await getOnlineInfo(o.id);
    const anticipo = await findAnticipoForOrden(o);
    const items = (o.items || []).map(it => ({ ...it, pagado: !!it.pagado }));
    const itemsPend = items.filter(it => !it.pagado);

    res.json({
      id: o.id,
      codigo: o.codigo,
      mesa: o.mesa,
      mesaTexto: mesaTexto || String(o.mesa),
      esOnline,
      fecha: o.fecha,
      estado: o.estado,
      total: calcTotal(itemsPend),
      items,
      mesero: o.mesero || null,
      anticipo,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo detalle' });
  }
});

/* ===== Anticipo restante de una orden (lo pide tu UI) ===== */
router.get('/orden/:id/anticipo-restante', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  try {
    const ordenId = Number(req.params.id);
    if (!ordenId) return res.status(400).json({ error: 'ID inválido' });
    const restante = await anticipoRestante(ordenId);
    res.json({ restante: Number(restante.toFixed(2)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo calcular anticipo restante' });
  }
});

/* ================= Pagar ORDEN COMPLETA ================ */
router.post('/pagar', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  const { ordenId, metodoPago, montoRecibido, posCorrelativo, clienteNombre } = req.body;
  try {
    const uid = getUidFlex(req);
    if (!uid) return res.status(401).json({ error: 'NO_AUTH' });
    if (!(await tieneTurnoAbierto(uid))) {
      return res.status(401).json({ error: 'NO_TURNO_ABIERTO' });
    }

    const o = await prisma.orden.findUnique({ where: { id: Number(ordenId) }, include: { items: true } });
    if (!o) return res.status(404).json({ error: 'Orden no existe' });
    if (o.estado !== OrdenEstado.PENDIENTE_PAGO) return res.status(400).json({ error: 'Estado inválido para pago' });

    const itemsPend = (o.items || []).filter(it => !it.pagado);
    const total = calcTotal(itemsPend);

    let reserva = await prisma.reserva.findFirst({ where: { aplicadoEnOrdenId: o.id } });
    if (!reserva) {
      reserva = await prisma.reserva.findFirst({
        where: {
          estado: 'CONFIRMADA',
          pagoEstado: 'PAGADO',
          aplicadoEnOrdenId: null,
          mesa: o.mesa != null ? { numero: Number(o.mesa) } : undefined,
          AND: [{ fechaHora: { lte: o.fecha || new Date() } }, { hastaHora: { gte: o.fecha || new Date() } }],
        },
      });
    }

    const anticipoPend = await anticipoRestante(o.id);
    const anticipo = reserva ? Math.min(Number(reserva.monto || 50), anticipoPend) : anticipoPend;

    // ===== Propina (respeta "activa") =====
    const { activa: tipActiva, porcentaje: tipPercent } = await getTipConfig();
    const applyTip = tipActiva && await shouldApplyTip(o.id);
    const base = Math.max(0, total - anticipo);
    const propina = applyTip ? Number((base * (tipPercent / 100)).toFixed(2)) : 0;
    const neto = Number((base + propina).toFixed(2));

    // Validaciones por método
    if (metodoPago === MetodoPago.EFECTIVO) {
      const rec = Number(montoRecibido);
      if (!Number.isFinite(rec) || rec < neto) return res.status(400).json({ error: 'Monto insuficiente' });
    } else if (metodoPago === MetodoPago.TARJETA) {
      if (!posCorrelativo || String(posCorrelativo).trim() === '') {
        return res.status(400).json({ error: 'Correlativo POS requerido' });
      }
    } else return res.status(400).json({ error: 'Método de pago inválido' });

    const cambio = metodoPago === MetodoPago.EFECTIVO ? Number((Number(montoRecibido) - neto).toFixed(2)) : 0;

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await safeCreateTicketVenta(tx, {
        ordenId: o.id,
        metodoPago,
        // Montos
        subtotal: base,
        impuestos: propina,            // << Propina registrada aquí si aplica
        descuentos: 0,
        anticipoAplicado: Number(anticipo || 0),
        totalAPagar: neto,
        montoRecibido: metodoPago === MetodoPago.EFECTIVO ? Number(montoRecibido) : neto,
        cambio,
        // Otros
        posCorrelativo: metodoPago === MetodoPago.TARJETA ? String(posCorrelativo) : null,
        clienteNombre: clienteNombre || null,
        fechaPago: new Date(),
        cajeroId: uid || null,
        snapshot: (o.items || []).filter(it => !it.pagado).map(it => ({
          id: it.id, nombre: it.nombre, precio: it.precio
        })),
      });

      if (itemsPend.length) {
        await tx.ordenItem.updateMany({ where: { ordenId: o.id, pagado: false }, data: { pagado: true, ticketVentaId: t.id } });
      }
      if (reserva) {
        try {
          await tx.reserva.update({ where: { id: reserva.id }, data: { aplicadoEnOrdenId: o.id, aplicadoEnPagoId: t.id } });
        } catch (e) { console.warn('[reserva.update] no asociada', e?.code, e?.message); }
      }
      const quedan = await tx.ordenItem.count({ where: { ordenId: o.id, pagado: false } });
      await tx.orden.update({
        where: { id: o.id },
        data: { estado: quedan === 0 ? OrdenEstado.PAGADA : OrdenEstado.PENDIENTE_PAGO, totalPagado: neto },
      });

      return { ...t, anticipo: Number(anticipo || 0) };
    });

    broadcastCaja({ type: 'orden_pagada', ordenId: o.id });
    res.json({ ok: true, ticket });
  } catch (e) {
    console.error('POST /caja/pagar', e);
    res.status(500).json({ error: 'Error procesando pago', detail: e?.message, code: e?.code, meta: e?.meta });
  }
});

/* ============ Pagar PARCIAL ============ */
async function pagarParcialHandler(req, res) {
  const { ordenId, itemIds, metodoPago, montoRecibido, posCorrelativo, clienteNombre } = req.body || {};
  try {
    const uid = getUidFlex(req);
    if (!uid) return res.status(401).json({ error: 'NO_AUTH' });
    if (!(await tieneTurnoAbierto(uid))) {
      return res.status(401).json({ error: 'NO_TURNO_ABIERTO' });
    }

    const o = await prisma.orden.findUnique({ where: { id: Number(ordenId) }, include: { items: true } });
    if (!o) return res.status(404).json({ error: 'Orden no existe' });
    if (o.estado !== OrdenEstado.PENDIENTE_PAGO) return res.status(400).json({ error: 'Estado inválido para pago' });

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos un ítem' });
    }

    const ids = itemIds.map(Number);
    const elegidos = (o.items || []).filter(it => ids.includes(Number(it.id)));
    if (elegidos.length !== ids.length) return res.status(400).json({ error: 'Hay ítems inválidos' });
    if (elegidos.some(it => it.pagado)) return res.status(400).json({ error: 'Hay ítems ya pagados' });

    const totalSel = calcTotal(elegidos);
    const anticipoPend = await anticipoRestante(o.id);
    const anticipoAplicar = Math.min(anticipoPend, totalSel);

    // ===== Propina (respeta "activa") =====
    const { activa: tipActiva, porcentaje: tipPercent } = await getTipConfig();
    const applyTip = tipActiva && await shouldApplyTip(o.id);
    const base = Math.max(0, totalSel - anticipoAplicar);
    const propina = applyTip ? Number((base * (tipPercent / 100)).toFixed(2)) : 0;
    const neto = Number((base + propina).toFixed(2));

    if (metodoPago === MetodoPago.EFECTIVO) {
      const rec = Number(montoRecibido);
      if (!Number.isFinite(rec) || rec < neto) return res.status(400).json({ error: 'Monto insuficiente' });
    } else if (metodoPago === MetodoPago.TARJETA) {
      if (!posCorrelativo || String(posCorrelativo).trim() === '') {
        return res.status(400).json({ error: 'Correlativo POS requerido' });
      }
    } else return res.status(400).json({ error: 'Método de pago inválido' });

    const cambio = metodoPago === MetodoPago.EFECTIVO ? Number((Number(montoRecibido) - neto).toFixed(2)) : 0;

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await safeCreateTicketVenta(tx, {
        ordenId: o.id,
        metodoPago,
        subtotal: base,
        impuestos: propina,         // << Propina aquí también si aplica
        descuentos: 0,
        anticipoAplicado: Number(anticipoAplicar || 0),
        totalAPagar: neto,
        montoRecibido: metodoPago === MetodoPago.EFECTIVO ? Number(montoRecibido) : neto,
        cambio,
        posCorrelativo: metodoPago === MetodoPago.TARJETA ? String(posCorrelativo) : null,
        clienteNombre: clienteNombre || null,
        fechaPago: new Date(),
        cajeroId: getUidFlex(req) || null,
        snapshot: elegidos.map(it => ({ id: it.id, nombre: it.nombre, precio: it.precio })),
      });

      await tx.ordenItem.updateMany({
        where: { ordenId: o.id, id: { in: elegidos.map(it => it.id) } },
        data: { pagado: true, ticketVentaId: t.id },
      });

      const quedan = await tx.ordenItem.count({ where: { ordenId: o.id, pagado: false } });
      await tx.orden.update({
        where: { id: o.id },
        data: { estado: quedan === 0 ? OrdenEstado.PAGADA : OrdenEstado.PENDIENTE_PAGO },
      });

      return { ...t, anticipo: Number(anticipoAplicar || 0) };
    });

    broadcastCaja({ type: 'orden_pagada', ordenId: o.id });
    res.json({ ok: true, ticket });
  } catch (e) {
    console.error('POST /caja/pagar-parcial', e);
    res.status(500).json({ error: 'Error procesando pago parcial', detail: e?.message, code: e?.meta });
  }
}
router.post('/pagar/parcial', requirePerm(['CAJA'], { strict: false }), pagarParcialHandler);
router.post('/pagar-parcial',  requirePerm(['CAJA'], { strict: false }), pagarParcialHandler);

/* ===================== Ventas del día ===================== */
/** Inyecta dos sentinelas: APERTURA y CIERRE del turno de hoy (si existen). */
router.get('/ventas/hoy', requirePerm(['CAJA'], { strict: false }), async (_req, res) => {
  try {
    const { start, end } = todayRange();

    const ventasDb = await prisma.ticketVenta.findMany({
      where: { fechaPago: { gte: start, lte: end } },
      include: { orden: { include: { items: true } } },
      orderBy: { id: 'asc' },
    });

    const ventas = [];
    for (const v of ventasDb) {
      let esOnline = false;
      let mesaTexto = null;
      if (v.orden?.id) {
        const info = await getOnlineInfo(v.orden.id);
        esOnline = info.esOnline;
        mesaTexto = info.mesaTexto || (v.orden?.mesa != null ? String(v.orden.mesa) : null);
      }
      const anticipo = await findAnticipoForTicket(v);
      ventas.push({
        id: v.id,
        folio: v.id,
        orden: { id: v.orden?.id, codigo: v.orden?.codigo, items: v.orden?.items || [] },
        mesa: v.orden?.mesa ?? null,
        mesaTexto,
        esOnline,
        cajero: null,
        cajeroNombre: null,
        metodoPago: v.metodoPago,
        total: Number(v.totalAPagar || 0),
        fechaVenta: v.fechaPago,
        posCorrelativo: v.posCorrelativo || null,
        anticipo: Number(v.anticipoAplicado || anticipo || 0),
      });
    }

    // --- Apertura/cierre del turno de hoy como "transacciones"
    const turnoHoy = await prisma.cajaTurno.findFirst({
      where: { solicitadoEn: { gte: start, lte: end } },
      orderBy: { id: 'desc' }
    });

    if (turnoHoy && Number(turnoHoy.montoApertura || 0) > 0) {
      ventas.unshift({
        id: `APERT-${turnoHoy.id}`,
        folio: `APERT-${turnoHoy.id}`,
        orden: null, mesa: null, mesaTexto: '—', esOnline: false,
        cajero: null, cajeroNombre: null,
        metodoPago: 'APERTURA',
        total: Number(turnoHoy.montoApertura || 0),
        fechaVenta: turnoHoy.solicitadoEn || turnoHoy.autorizadoEn || turnoHoy.solicitadoEn,
        posCorrelativo: null, anticipo: 0,
      });
    }
    if (turnoHoy && Number(turnoHoy.montoCierre || 0) > 0 && turnoHoy.estado === CajaTurnoEstado.CERRADA) {
      ventas.push({
        id: `CIERR-${turnoHoy.id}`,
        folio: `CIERR-${turnoHoy.id}`,
        orden: null, mesa: null, mesaTexto: '—', esOnline: false,
        cajero: null, cajeroNombre: null,
        metodoPago: 'CIERRE',
        total: Number(turnoHoy.montoCierre || 0),
        fechaVenta: turnoHoy.cierreAutorizadoEn || turnoHoy.cerradoEn || turnoHoy.cierreSolicitadoEn,
        posCorrelativo: null, anticipo: 0,
      });
    }

    const tickets = ventas.length;
    const total = ventas.reduce((a, v) => a + Number(v.total || 0), 0);
    const porMetodo = ventas.reduce((acc, v) => {
      const k = String(v.metodoPago || '').toUpperCase();
      acc[k] = Number((acc[k] || 0) + Number(v.total || 0));
      return acc;
    }, {});
    const promedio = tickets ? Number((total / tickets).toFixed(2)) : 0;

    const efectivoTotal = Number(porMetodo.EFECTIVO || 0);
    const egresosAprob = await prisma.egresoCaja.aggregate({
      _sum: { monto: true },
      where: { estado: EgresoEstado.APROBADO, autorizadoEn: { gte: start, lte: end } }
    });
    const netoEfectivo = Number((efectivoTotal - Number(egresosAprob._sum.monto || 0)).toFixed(2));

    res.json({
      ventas,
      resumen: {
        tickets,
        total: Number(total.toFixed(2)),
        promedio,
        porMetodo,
        egresosAprobados: Number((egresosAprob._sum.monto || 0).toFixed(2)),
        netoEfectivo,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo ventas del día' });
  }
});

/* ===================== Egresos de hoy (simple) ===================== */
router.get('/egresos/hoy', requirePerm(['CAJA'], { strict: false }), async (_req, res) => {
  try {
    const { start, end } = todayRange();
    const list = await prisma.egresoCaja.findMany({
      where: { creadoEn: { gte: start, lte: end } },
      orderBy: { id: 'desc' }
    });
    const total = list.reduce((a, e) => a + Number(e.monto || 0), 0);
    res.json({ egresos: list, total: Number(total.toFixed(2)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo egresos de hoy' });
  }
});

/* ===================== Impresión de ticket ===================== */
router.get('/tickets/:id/impresion', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const t = await prisma.ticketVenta.findUnique({
      where: { id },
      include: { orden: { include: { items: true } } }
    });
    if (!t) return res.status(404).send('Ticket no existe');

    const items = Array.isArray(t.snapshot) && t.snapshot.length
      ? t.snapshot
      : (t.orden?.items || []).map(it => ({ nombre: it.nombre, precio: Number(it.precio || 0), nota: it.nota }));

    const rows = items.map((it, idx)=>`
      <tr><td>${idx+1}</td><td>${it.nombre}${it.nota?` <em style="color:#64748b">(nota: ${it.nota})</em>`:''}</td><td style="text-align:right">Q${Number(it.precio||0).toFixed(2)}</td></tr>
    `).join('');

    const totalOriginal = items.reduce((a, it)=> a + Number(it.precio||0), 0);
    const anticipo = Number(t.anticipoAplicado || 0);
    const base     = Number(t.subtotal || Math.max(0, totalOriginal - anticipo));
    const propina  = Number(t.impuestos || 0);
    const totalAPagar = Number(t.totalAPagar || (base + propina));

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket #${t.id}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:6px}th{background:#f8fafc}</style>
</head><body>
<h2>Ticket de venta #${t.id}</h2>
<div>Orden: <b>${t.orden?.codigo ?? '-'}</b> · Fecha: <b>${new Date(t.fechaPago).toLocaleString()}</b></div>
<div>Método de pago: <b>${t.metodoPago}</b>${t.metodoPago==='TARJETA' && t.posCorrelativo ? ` · POS: <b>${t.posCorrelativo}</b>`:''}</div><hr/>
<table><thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Precio</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:8px">Anticipo aplicado: <b>Q${anticipo.toFixed(2)}</b></p>
<p>Subtotal: <b>Q${base.toFixed(2)}</b></p>
${propina > 0 ? `<p>Propina: <b>Q${propina.toFixed(2)}</b></p>` : ''}
<p style="font-weight:700">Total a pagar: Q${totalAPagar.toFixed(2)}</p>
<script>window.print&&setTimeout(()=>window.print(),300)</script></body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('No se pudo generar el ticket');
  }
});

/* ========================= Turnos de caja ========================= */

// GET /caja/mi-estado
router.get('/mi-estado', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  try {
    const uid = getUidFlex(req);
    if (!uid) return res.status(401).json({ error: 'NO_AUTH' });

    const turno = await prisma.cajaTurno.findFirst({
      where: { cajeroId: uid },
      orderBy: { id: 'desc' }
    });

    return res.json({ ok: true, turno: turno || null });
  } catch (e) {
    console.error('GET /caja/mi-estado', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /caja/solicitar (apertura)
router.post('/solicitar', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  try {
    const uid = getUidFlex(req);
    if (!uid) return res.status(401).json({ error: 'NO_AUTH' });

    const { conteoInicial, montoApertura } = req.body || {};

    const existente = await prisma.cajaTurno.findFirst({
      where: {
        cajeroId: uid,
        estado: { in: [CajaTurnoEstado.PENDIENTE, CajaTurnoEstado.ABIERTA, CajaTurnoEstado.CIERRE_PENDIENTE] }
      }
    });
    if (existente) return res.status(400).json({ error: 'YA_TIENE_TURNO' });

    const totalFromDenoms = denomsTotal(conteoInicial);
    const totalField = Number(conteoInicial?.total ?? conteoInicial?.TOTAL);
    const total = Number.isFinite(totalField) && totalField > 0
      ? totalField
      : (Number.isFinite(Number(montoApertura)) && Number(montoApertura) > 0
          ? Number(montoApertura)
          : totalFromDenoms);

    const turno = await prisma.cajaTurno.create({
      data: {
        cajeroId: uid,
        estado: CajaTurnoEstado.PENDIENTE,
        montoApertura: Number(total || 0),
        conteoInicial: { ...(conteoInicial || {}), total: Number(total || totalFromDenoms || 0) },
        solicitadoEn: new Date()
      }
    });

    return res.json({ ok: true, turno });
  } catch (e) {
    console.error('POST /caja/solicitar', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ---------- Autorizar/rechazar APERTURA (ADMIN) ---------- */
async function autorizarTurnoCore(req, res) {
  const adminId = getUidFlex(req);
  if (!adminId) return res.status(401).json({ error: 'NO_AUTH' });

  const b = req.body || {};
  const rawTurnoId = (b.turnoId ?? b.id ?? b?.turno?.id ?? req.query?.turnoId ?? 0);
  const turnoId = Number(rawTurnoId);
  if (!turnoId) return res.status(400).json({ error: 'FALTA_TURNO_ID' });

  const aprobar = (b.aprobar !== undefined) ? !!b.aprobar
                 : (b.rechazar !== undefined) ? !b.rechazar
                 : true;

  try {
    const turno = await prisma.cajaTurno.update({
      where: { id: turnoId },
      data: aprobar
        ? { estado: CajaTurnoEstado.ABIERTA,  autorizadoPorId: adminId, autorizadoEn: new Date() }
        : { estado: CajaTurnoEstado.RECHAZADA, autorizadoPorId: adminId, autorizadoEn: new Date() }
    });

    broadcastCaja({ type: aprobar ? 'apertura_autorizada' : 'apertura_rechazada', turnoId: turno.id });
    return res.json({ ok: true, turno, aprobado: aprobar });
  } catch (e) {
    console.error('[autorizarTurnoCore]', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
router.post('/autorizar', requirePerm(['ADMIN'], { strict: false }), autorizarTurnoCore);
router.post('/turnos/admin/autorizar', requirePerm(['ADMIN'], { strict: false }), autorizarTurnoCore);
router.post('/turnos/admin/rechazar', requirePerm(['ADMIN'], { strict: false }), async (req, res) => {
  req.body = { ...(req.body || {}), aprobar: false };
  return autorizarTurnoCore(req, res);
});

/* ---------- Solicitar CIERRE (CAJERO) ---------- */
router.post('/:id/solicitar-cierre', requirePerm(['CAJA'], { strict: false }), async (req, res) => {
  try {
    const uid = getUidFlex(req);
    if (!uid) return res.status(401).json({ error: 'NO_AUTH' });

    const turnoId = Number(req.params.id || 0);
    if (!turnoId) return res.status(400).json({ error: 'FALTA_TURNO_ID' });

    const { conteoFinal } = req.body || {};
    const totalFinal = denomsTotal(conteoFinal);
    if (!Number.isFinite(totalFinal)) return res.status(400).json({ error: 'CONTEO_INVALIDO' });

    const turno = await prisma.cajaTurno.findUnique({ where: { id: turnoId } });
    if (!turno) return res.status(404).json({ error: 'TURNO_NO_EXISTE' });
    if (turno.cajeroId !== uid) return res.status(403).json({ error: 'NO_OWNER' });
    if (turno.estado !== CajaTurnoEstado.ABIERTA) return res.status(400).json({ error: 'TURNO_NO_ABIERTO' });

    const upd = await prisma.cajaTurno.update({
      where: { id: turnoId },
      data: {
        estado: CajaTurnoEstado.CIERRE_PENDIENTE,
        conteoFinal: { ...(conteoFinal || {}), total: Number(totalFinal.toFixed(2)) },
        montoCierre: Number(totalFinal.toFixed(2)),
        cierreSolicitadoEn: new Date()
      }
    });

    broadcastCaja({ type: 'cierre_solicitado', turnoId: upd.id });
    return res.json({ ok: true, turno: upd });
  } catch (e) {
    console.error('POST /caja/:id/solicitar-cierre', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ---------- Autorizar/rechazar CIERRE (ADMIN) ---------- */
async function autorizarCierreCore(req, res) {
  const adminId = getUidFlex(req);
  if (!adminId) return res.status(401).json({ error: 'NO_AUTH' });

  const b = req.body || {};
  const rawTurnoId = (b.turnoId ?? b.id ?? b?.turno?.id ?? req.query?.turnoId ?? 0);
  const turnoId = Number(rawTurnoId);
  if (!turnoId) return res.status(400).json({ error: 'FALTA_TURNO_ID' });

  const aprobar = (b.aprobar !== undefined) ? !!b.aprobar
                 : (b.rechazar !== undefined) ? !b.rechazar
                 : true;

  try {
    const turno = await prisma.cajaTurno.findUnique({ where: { id: turnoId } });
    if (!turno) return res.status(404).json({ error: 'TURNO_NO_EXISTE' });
    if (turno.estado !== CajaTurnoEstado.CIERRE_PENDIENTE) {
      return res.status(400).json({ error: 'NO_EN_CIERRE_PENDIENTE' });
    }

    const upd = await prisma.cajaTurno.update({
      where: { id: turnoId },
      data: aprobar
        ? {
            estado: CajaTurnoEstado.CERRADA,
            cierreAutorizadoPorId: adminId,
            cierreAutorizadoEn: new Date(),
            cerradoEn: new Date()
          }
        : { estado: CajaTurnoEstado.ABIERTA }
    });

    broadcastCaja({ type: aprobar ? 'cierre_autorizado' : 'cierre_rechazado', turnoId: upd.id });
    return res.json({ ok: true, turno: upd, aprobado: aprobar });
  } catch (e) {
    console.error('[autorizarCierreCore]', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
router.post('/turnos/admin/autorizar-cierre', requirePerm(['ADMIN'], { strict: false }), autorizarCierreCore);
router.post('/turnos/admin/rechazar-cierre', requirePerm(['ADMIN'], { strict: false }), async (req, res) => {
  req.body = { ...(req.body || {}), aprobar: false };
  return autorizarCierreCore(req, res);
});

/* ---------- Preview de cierre (contra apertura de HOY) ---------- */
router.get('/turnos/admin/preview-cierre', requirePerm(['ADMIN'], { strict: false }), async (req, res) => {
  try {
    const turnoId = Number(req.query.turnoId || 0);
    if (!turnoId) return res.status(400).json({ error: 'FALTA_TURNO_ID' });

    const t = await prisma.cajaTurno.findUnique({ where: { id: turnoId } });
    if (!t) return res.status(404).json({ error: 'TURNO_NO_EXISTE' });

    const { start, end } = dayRangeOf(t.solicitadoEn || new Date());

    // Ingresos en EFECTIVO reales (recibido - cambio)
    const ticketsEf = await prisma.ticketVenta.findMany({
      where: { fechaPago: { gte: start, lte: end }, metodoPago: MetodoPago.EFECTIVO },
      select: { montoRecibido: true, cambio: true }
    });
    const efectivoIngresado = ticketsEf.reduce((a, r) => a + (Number(r.montoRecibido || 0) - Number(r.cambio || 0)), 0);

    const egresos = await prisma.egresoCaja.aggregate({
      _sum: { monto: true },
      where: { estado: EgresoEstado.APROBADO, autorizadoEn: { gte: start, lte: end } }
    });
    const egresosAprobados = Number(egresos._sum.monto || 0);

    const apertura   = Number(t.montoApertura || 0);
    const efectivoNeto = Number((efectivoIngresado - egresosAprobados).toFixed(2));
    const esperado   = Number((apertura + efectivoNeto).toFixed(2));
    const declarado  = Number(t.montoCierre || denomsTotal(t.conteoFinal) || 0);
    const diferencia = Number((declarado - esperado).toFixed(2));

    res.json({ apertura, efectivoIngresado, egresosAprobados, efectivoNeto, esperado, declarado, diferencia });
  } catch (e) {
    console.error('GET /caja/turnos/admin/preview-cierre', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* ---------- (Antiguo) cerrar turno directo: bloqueado ---------- */
router.post('/:id/cerrar', requirePerm(['CAJA', 'ADMIN'], { strict: false }), async (_req, res) => {
  return res.status(400).json({ error: 'USE_SOLICITAR_CIERRE' });
});

/* ==================== ADMIN: list y cierre de ayer ==================== */
router.get('/turnos/admin/list', requirePerm(['ADMIN'], { strict: false }), async (req, res) => {
  try {
    const raw = String(req.query.estado || '').toUpperCase();
    const whereEstado = raw && raw !== 'TODOS' ? { estado: raw } : {};

    const list = await prisma.cajaTurno.findMany({
      where: whereEstado,
      include: { cajero: { select: { id: true, nombre: true } } },
      orderBy: { id: 'desc' }
    });

    res.json({
      turnos: list.map((t) => ({
        id: t.id,
        cajeroId: t.cajeroId,
        cajero: t.cajero ? { id: t.cajero.id, nombre: t.cajero.nombre } : null,
        estado: t.estado,

        // apertura
        montoApertura: Number(t.montoApertura || 0),
        conteoInicial: t.conteoInicial || {},
        solicitadoEn: t.solicitadoEn || null,
        autorizadoEn: t.autorizadoEn || null,

        // cierre
        montoCierre: Number(t.montoCierre || 0),
        conteoFinal: t.conteoFinal || {},
        totalCierre: Number((t.montoCierre || denomsTotal(t.conteoFinal || {})).toFixed(2)),
        cierreSolicitadoEn: t.cierreSolicitadoEn || null,
        cierreAutorizadoEn: t.cierreAutorizadoEn || null,

        cerradoEn: t.cerradoEn || null,
      }))
    });
  } catch (e) {
    console.error('GET /caja/turnos/admin/list', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

router.get('/turnos/cierre/ayer', requirePerm(['ADMIN'], { strict: false }), async (_req, res) => {
  try {
    const end = new Date(); end.setHours(0,0,0,0);
    const start = new Date(end); start.setDate(start.getDate() - 1);
    const closeEnd = new Date(end.getTime() - 1);

    const ventasEfec = await prisma.ticketVenta.aggregate({
      _sum: { totalAPagar: true },
      where: { fechaPago: { gte: start, lte: closeEnd }, metodoPago: MetodoPago.EFECTIVO }
    });
    const efectivo = Number(ventasEfec._sum.totalAPagar || 0);

    const egresosAprob = await prisma.egresoCaja.aggregate({
      _sum: { monto: true },
      where: { estado: EgresoEstado.APROBADO, autorizadoEn: { gte: start, lte: closeEnd } }
    });
    const egresosAprobados = Number(egresosAprob._sum.monto || 0);

    const neto = Number((efectivo - egresosAprobados).toFixed(2));
    res.json({ efectivo, egresosAprobados, neto });
  } catch (e) {
    console.error('GET /caja/turnos/cierre/ayer', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
