const express = require('express');
const router = express.Router();
const { EgresoEstado, PrismaClient } = require("../generated/prisma");
let prisma;
try { ({ prisma } = require('../utils/prisma')); } catch { prisma = new PrismaClient(); }

const { sendEmail } = require('../services/email');

let { broadcastMesa } = (() => {
  try { return require('../services/mesas.events'); } catch { return {}; }
})();

/* ============================ Constantes negocio ============================ */
const OPEN_HOUR = 7; // 07:00
const CLOSE_HOUR = 22; // 22:00
const OPEN_ORDER_BLOCK_MINS = 180; // margen de 3h
const ANTICIPOS_PERMITIDOS = [50, 100, 150, 200, 250, 300];

/* ============================ Helpers ============================ */
function withinBusinessHours(ini, fin) {
  if (!ini || !fin) return false;
  if (ini.toDateString() !== fin.toDateString()) return false;
  const sh = ini.getHours(), sm = ini.getMinutes();
  const eh = fin.getHours(), em = fin.getMinutes();
  if (sh < OPEN_HOUR) return false;
  if (eh > CLOSE_HOUR) return false;
  if (eh === CLOSE_HOUR && em > 0) return false;
  return true;
}
function notPast(ini) {
  const now = new Date();
  return ini.getTime() >= now.getTime();
}
function startOfToday(d = new Date()) {
  const z = new Date(d);
  z.setHours(0,0,0,0);
  return z;
}
function endOfToday(d = new Date()) {
  const z = new Date(d);
  z.setHours(23,59,59,999);
  return z;
}
const fmtQ = (n) => `Q${Number(n || 0).toFixed(2)}`;

/* ============================ Plantillas email ============================ */
function htmlReservaConfirmada(r) {
  const inicio = new Date(r.fechaHora).toLocaleString('es-GT', { hour12: false });
  const fin = new Date(r.hastaHora).toLocaleString('es-GT', { hour12: false });
  return `<div style="font-family:Segoe UI,Arial,sans-serif">
    <h2>✅ Reserva confirmada</h2>
    <p>Hola <b>${r.nombre}</b>, tu <b>mesa #${r.mesa?.numero}</b> quedó reservada:</p>
    <ul>
      <li><b>Inicio:</b> ${inicio}</li>
      <li><b>Fin:</b> ${fin}</li>
      <li><b>Anticipo:</b> ${fmtQ(r.monto)}</li>
      <li><b>Teléfono:</b> ${r.telefono}</li>
    </ul>
    <p>Nota: ${r.nota ? r.nota : '<em>Sin nota</em>'}</p>
    <p>Si cancelas con al menos 24h, devolvemos el anticipo según política.</p>
  </div>`;
}
function htmlReservaCancelada(r, conReembolso) {
  const inicio = new Date(r.fechaHora).toLocaleString('es-GT', { hour12: false });
  const fin = new Date(r.hastaHora).toLocaleString('es-GT', { hour12: false });
  const pol = conReembolso
    ? `Se procesó un reembolso de ${fmtQ(r.refundMonto || r.monto)}.`
    : `No aplica reembolso (menos de 24h).`;
  return `<div style="font-family:Segoe UI,Arial,sans-serif">
    <h2>❌ Reserva cancelada</h2>
    <p>Tu reserva de la mesa #${r.mesa?.numero} (${inicio} – ${fin}) fue cancelada.</p>
    <p>${pol}</p>
    ${r.refundMotivo ? `<p>Motivo: ${r.refundMotivo}</p>` : ''}
  </div>`;
}

/* =================== Disponibilidad (rango) =================== */
router.get('/disponibles', async (req, res) => {
  try {
    const desde = new Date(req.query.desde || req.query.fechaHora);
    const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date(desde.getTime() + 2*60*60*1000);

    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return res.status(400).json({ error: 'Rango inválido' });
    }
    if (hasta <= desde) return res.status(422).json({ error: 'La hora fin debe ser mayor' });
    if (hasta.getTime() - desde.getTime() > 3 * 60 * 60 * 1000) {
      return res.status(422).json({ error: 'Máx 3 horas' });
    }
    if (!notPast(desde)) return res.status(422).json({ error: 'La hora ya pasó' });
    if (!withinBusinessHours(desde, hasta)) {
      return res.status(422).json({ error: 'Horario permitido 07:00–22:00' });
    }

    // mesas ocupadas por reservas
    const reservas = await prisma.reserva.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        AND: [{ fechaHora: { lt: hasta } }, { hastaHora: { gt: desde } }],
      },
      select: { mesaId: true }
    });
    const ocupadasPorReserva = new Set(reservas.map(r => r.mesaId));

    // mesas ocupadas por orden activa (si reserva empieza pronto)
    let mesasConOrdenAbierta = [];
    const now = new Date();
    const bloqueHasta = new Date(now.getTime() + OPEN_ORDER_BLOCK_MINS * 60 * 1000);
    if (desde < bloqueHasta) {
      const abiertas = await prisma.orden.findMany({
        where: { finishedAt: null },
        select: { mesa: true },
      });
      const nums = [...new Set((abiertas || []).map(o => o.mesa))];
      if (nums.length) {
        const mesasByNum = await prisma.mesa.findMany({
          where: { numero: { in: nums } },
          select: { id: true }
        });
        mesasConOrdenAbierta = mesasByNum.map(m => m.id);
      }
    }

    const ocupadas = new Set([...ocupadasPorReserva, ...mesasConOrdenAbierta]);

    const mesas = await prisma.mesa.findMany({
      where: { activa: true },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true, capacidad: true, estado: true, reservadaPor: true }
    });

    const out = mesas.map(m => {
      const porOrden = mesasConOrdenAbierta.includes(m.id);
      return {
        id: m.id,
        numero: m.numero,
        capacidad: m.capacidad,
        estado: ocupadas.has(m.id) ? 'RESERVADA' : m.estado,
        reservadaPor: m.reservadaPor || null,
        disponible: !ocupadas.has(m.id),
        conflictoTexto: ocupadasPorReserva.has(m.id)
          ? 'Reservada en ese rango'
          : (porOrden ? 'Ocupada por orden activa' : null),
      };
    });

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando mesas disponibles' });
  }
});

/* ====== Crear (CONFIRMADA + PAGADA) ====== */
router.post('/', async (req, res) => {
  try {
    const { mesaId, desde, hasta, nombre, telefono, nota, email } = req.body || {};
    const anticipoReq = Number(req.body?.anticipo);
    const ini = new Date(desde || req.body.fechaHora);
    const fin = new Date(hasta || (ini ? new Date(ini.getTime() + 2*60*60*1000) : NaN));

    if (!mesaId || Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime()) || !nombre) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    if (!/^\d{8}$/.test(String(telefono || ''))) {
      return res.status(422).json({ error: 'Teléfono inválido' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) {
      return res.status(422).json({ error: 'Correo inválido' });
    }
    if (!Number.isFinite(anticipoReq) || !ANTICIPOS_PERMITIDOS.includes(anticipoReq)) {
      return res.status(422).json({ error: 'Anticipo inválido' });
    }
    if (fin <= ini) return res.status(422).json({ error: 'La hora fin debe ser mayor' });
    if (fin.getTime() - ini.getTime() > 3 * 60 * 60 * 1000) {
      return res.status(422).json({ error: 'Máx 3 horas' });
    }
    if (!notPast(ini)) return res.status(422).json({ error: 'La hora ya pasó' });
    if (!withinBusinessHours(ini, fin)) {
      return res.status(422).json({ error: 'Horario permitido 07:00–22:00' });
    }

    const mesa = await prisma.mesa.findUnique({ where: { id: Number(mesaId) } });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (mesa.activa === false) return res.status(409).json({ error: 'Mesa desactivada' });

    // bloquear por orden activa
    const now = new Date();
    const bloqueHasta = new Date(now.getTime() + OPEN_ORDER_BLOCK_MINS * 60 * 1000);
    const ordenAbierta = await prisma.orden.findFirst({
      where: { mesa: mesa.numero, finishedAt: null },
      select: { id: true }
    });
    if (ordenAbierta && ini < bloqueHasta) {
      return res.status(409).json({ error: 'Mesa ocupada por orden activa' });
    }

    // choque con reservas
    const choque = await prisma.reserva.findFirst({
      where: {
        mesaId: mesa.id,
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        AND: [{ fechaHora: { lt: fin } }, { hastaHora: { gt: ini } }],
      }
    });
    if (choque) return res.status(409).json({ error: 'La mesa ya está reservada en ese rango' });

    const r = await prisma.reserva.create({
      data: {
        mesaId: mesa.id,
        fechaHora: ini,
        hastaHora: fin,
        nombre,
        telefono: String(telefono),
        email: String(email),
        nota: nota || null,
        monto: anticipoReq,               // 👈 Anticipo elegido
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        pagoMetodo: 'TARJETA',
        pagoReferencia: `sim_${Date.now()}`,
        pagadoEn: new Date(),
      },
      include: { mesa: true }
    });

    try {
      await prisma.mesa.update({
        where: { id: mesa.id },
        data: { estado: 'RESERVADA', reservadaPor: nombre },
      });
    } catch {}

    if (r.email) {
      try {
        await sendEmail({ to: r.email, subject: 'Reserva confirmada', html: htmlReservaConfirmada(r) });
      } catch {}
    }

    if (broadcastMesa) try { broadcastMesa({ type: 'mesa:reservada:pagada', mesaId: r.mesaId }); } catch {}

    res.json(r);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear la reserva' });
  }
});

/* =================== Mis reservas (por email/teléfono) =================== */
router.get('/mis', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    const tel = String(req.query.telefono || '').trim();
    if (!email && !tel) return res.status(400).json({ error: 'Falta email o teléfono' });

    const where = email ? { email: { equals: email, mode: 'insensitive' } } : { telefono: tel };
    const list = await prisma.reserva.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      include: { mesa: true },
    });

    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error listando tus reservas' });
  }
});

/* =================== HISTORIAL =================== */
router.get('/historial', async (req, res) => {
  try {
    const { desde, hasta, estado, q } = req.query || {};
    const where = {};

    if (desde || hasta) {
      where.fechaHora = {};
      if (desde) where.fechaHora.gte = new Date(desde);
      if (hasta) where.fechaHora.lte = new Date(hasta);
    }

    if (estado && ['PENDIENTE','CONFIRMADA','CANCELADA','CUMPLIDA'].includes(String(estado).toUpperCase())) {
      where.estado = String(estado).toUpperCase();
    } else {
      where.pagoEstado = 'PAGADO';
    }

    if (q) {
      const txt = String(q).trim();
      const mesaNum = Number.isFinite(Number(txt)) ? Number(txt) : null;
      where.OR = [
        { nombre: { contains: txt, mode: 'insensitive' } },
        { telefono: { contains: txt, mode: 'insensitive' } },
        ...(mesaNum != null ? [{ mesa: { numero: mesaNum } }] : []),
      ];
    }

    const list = await prisma.reserva.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      include: { mesa: { select: { numero: true } } }
    });

    const out = list.map(r => ({
      id: r.id,
      fechaHora: r.fechaHora,
      hastaHora: r.hastaHora,
      mesaNumero: r.mesa?.numero ?? null,
      nombre: r.nombre,
      telefono: r.telefono,
      estado: r.estado,
      pagoEstado: r.pagoEstado,
      anticipo: Number(r.monto || 0),
      refundMonto: Number(r.refundMonto || 0),
      refundEstado: r.refundEstado || 'NO_APLICA',
      refundMotivo: r.refundMotivo || null,
      nota: r.nota || null,
    }));

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error listando historial' });
  }
});

/* ===== listado crudo (admin) ===== */
router.get('/admin', async (_req, res) => {
  try {
    const list = await prisma.reserva.findMany({
      orderBy: { creadoEn: 'desc' },
      include: { mesa: true }
    });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error listando reservas' });
  }
});

let { broadcastCaja } = (() => {
  try { return require('../services/caja.events'); } catch { return {}; }
})();

/* =================== Cancelar (ADMIN) =================== */
router.post('/:id/cancelar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { motivo, reembolsar, cajeroId } = req.body || {};

    const r0 = await prisma.reserva.findUnique({ where: { id }, include: { mesa: true } });
    if (!r0) return res.status(404).json({ error: 'Reserva no encontrada' });

    const haremosRefund = !!reembolsar;

    const data = {
      estado: 'CANCELADA',
      canceladaEn: new Date(),
      refundMotivo: motivo || null,
      refundEstado: haremosRefund ? 'PROCESADO' : 'RECHAZADO',
      refundMonto: haremosRefund ? (r0.monto || 0) : 0,
      refundEn: haremosRefund ? new Date() : null,
    };

    const r = await prisma.reserva.update({ where: { id }, data, include: { mesa: true } });

    await prisma.mesa.update({
      where: { id: r.mesaId },
      data: { estado: 'DISPONIBLE', reservadaPor: null }
    });

    if (haremosRefund) {
      await prisma.egresoCaja.create({
        data: {
          cajeroId: Number(cajeroId || 1),
          monto: Number(r.refundMonto),
          motivo: `Devolución reserva #${r.id}`,
          estado: EgresoEstado.APROBADO,
          autorizadoPorId: Number(cajeroId || 1),
          autorizadoEn: new Date(),
          observacion: 'Reembolso automático por cancelación de reserva',
        }
      });
      if (broadcastCaja) {
        broadcastCaja({ type: 'egreso_nuevo', motivo: 'Reembolso reserva', monto: Number(r.refundMonto) });
      }
    }

    try {
      if (r.email) {
        const asunto = haremosRefund ? 'Reserva cancelada (con reembolso)' : 'Reserva cancelada';
        const html = htmlReservaCancelada(r, haremosRefund);
        await sendEmail({ to: r.email, subject: asunto, html });
      }
    } catch (e) {
      console.error('✉️ Email cancelación falló:', e?.message);
    }

    if (broadcastMesa) {
      try { broadcastMesa({ type: 'mesa:liberada', mesaId: r.mesaId }); } catch {}
    }

    res.json({ ok: true, reserva: r });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo cancelar la reserva' });
  }
});

/* =================== Cancelar (CLIENTE, con reglas) =================== */
/**
 * Reglas:
 * - Solo el titular (email) puede cancelar su reserva.
 * - Máximo 1 cancelación por día por email (se marca con refundMotivo prefijo "[CLIENTE]").
 * - Si faltan ≥24h para el inicio, hay reembolso; si faltan <24h, no hay reembolso.
 * - No se permite cancelar si la reserva ya inició o ya pasó.
 */
router.post('/:id/cancelar-cliente', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reqEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!id || !reqEmail) return res.status(400).json({ error: 'Solicitud inválida (falta email o id)' });

    const r0 = await prisma.reserva.findUnique({
      where: { id },
      include: { mesa: true }
    });
    if (!r0) return res.status(404).json({ error: 'Reserva no encontrada' });

    if (String(r0.email || '').trim().toLowerCase() !== reqEmail) {
      return res.status(403).json({ error: 'No puedes cancelar una reserva que no te pertenece' });
    }

    if (!['CONFIRMADA', 'PENDIENTE'].includes(String(r0.estado))) {
      return res.status(409).json({ error: 'La reserva no se puede cancelar en su estado actual' });
    }

    const now = new Date();
    if (now >= new Date(r0.fechaHora)) {
      return res.status(409).json({ error: 'La reserva ya inició o está en el pasado' });
    }

    // Límite: 1 cancelación por día por email (solo las hechas por el cliente)
    const hoyIni = startOfToday(now);
    const hoyFin = endOfToday(now);
    const cancelsHoy = await prisma.reserva.count({
      where: {
        email: { equals: reqEmail, mode: 'insensitive' },
        estado: 'CANCELADA',
        canceladaEn: { gte: hoyIni, lte: hoyFin },
        refundMotivo: { startsWith: '[CLIENTE]' }, // solo cancelaciones de este endpoint
      }
    });
    if (cancelsHoy >= 1) {
      return res
        .status(429)
        .json({ error: 'El día de hoy ya cancelaste una reservación. Intenta mañana.' });
    }

    // Política de reembolso
    const diffMs = new Date(r0.fechaHora).getTime() - now.getTime();
    const reembolsar = diffMs >= 24 * 60 * 60 * 1000;

    const data = {
      estado: 'CANCELADA',
      canceladaEn: now,
      refundMotivo: reembolsar
        ? '[CLIENTE] Cancelación por el cliente (≥24h)'
        : '[CLIENTE] Cancelación por el cliente (<24h)',
      refundEstado: reembolsar ? 'PROCESADO' : 'RECHAZADO',
      refundMonto: reembolsar ? (r0.monto || 0) : 0,
      refundEn: reembolsar ? now : null,
    };

    const r = await prisma.reserva.update({
      where: { id },
      data,
      include: { mesa: true }
    });

    // liberar mesa
    await prisma.mesa.update({
      where: { id: r.mesaId },
      data: { estado: 'DISPONIBLE', reservadaPor: null }
    });

    // Asiento de caja si hubo reembolso
    if (reembolsar) {
      try {
        await prisma.egresoCaja.create({
          data: {
            cajeroId: 1, // sistema
            monto: Number(r.refundMonto),
            motivo: `Devolución reserva #${r.id}`,
            estado: EgresoEstado.APROBADO,
            autorizadoPorId: 1,
            autorizadoEn: now,
            observacion: 'Reembolso automático por cancelación de cliente',
          }
        });
        if (broadcastCaja) {
          broadcastCaja({ type: 'egreso_nuevo', motivo: 'Reembolso reserva (cliente)', monto: Number(r.refundMonto) });
        }
      } catch (e) {
        console.warn('No se pudo registrar egreso de caja para el reembolso:', e?.message);
      }
    }

    // Email al cliente (siempre)
    try {
      if (r.email) {
        const asunto = reembolsar ? 'Reserva cancelada (con reembolso)' : 'Reserva cancelada';
        const html = htmlReservaCancelada(r, reembolsar);
        await sendEmail({ to: r.email, subject: asunto, html });
      }
    } catch (e) {
      console.error('✉️ Email cancelación (cliente) falló:', e?.message);
    }

    if (broadcastMesa) {
      try { broadcastMesa({ type: 'mesa:liberada', mesaId: r.mesaId }); } catch {}
    }

    return res.json({ ok: true, reserva: r });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo cancelar la reserva' });
  }
});

/* =================== Próximas reservas / EN CURSO =================== */
router.get('/proximas', async (req, res) => {
  try {
    const min = Number(req.query.min ?? 0);
    const max = Number(req.query.max ?? 180);
    const now = new Date();
    const from = new Date(now.getTime() + min * 60 * 1000);
    const to = new Date(now.getTime() + max * 60 * 1000);

    const list = await prisma.reserva.findMany({
      where: {
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        AND: [
          { fechaHora: { lte: to } },
          { hastaHora: { gte: from } },
        ],
      },
      select: {
        id: true,
        mesaId: true,
        fechaHora: true,
        hastaHora: true,
        mesa: { select: { numero: true } },
        nombre: true,
      },
      orderBy: { fechaHora: 'asc' },
    });

    res.json(list.map(r => ({
      reservaId: r.id,
      mesaId: r.mesaId,
      mesaNumero: r.mesa?.numero ?? null,
      inicio: r.fechaHora,
      fin: r.hastaHora,
      cliente: r.nombre,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo próximas reservas' });
  }
});

/* =================== Alertas (≤win minutos) + EN CURSO =================== */
router.get('/alertas', async (req, res) => {
  try {
    const win = Number(req.query.win ?? 45);
    const now = new Date();
    const to = new Date(now.getTime() + win * 60 * 1000);

    const list = await prisma.reserva.findMany({
      where: {
        estado: 'CONFIRMADA',
        pagoEstado: 'PAGADO',
        AND: [
          { fechaHora: { lte: to } },
          { hastaHora: { gte: now } },
        ],
      },
      select: {
        id: true,
        mesaId: true,
        fechaHora: true,
        mesa: { select: { numero: true } },
        nombre: true,
      },
      orderBy: { fechaHora: 'asc' },
    });

    res.json(list.map(r => ({
      reservaId: r.id,
      mesaId: r.mesaId,
      mesaNumero: r.mesa?.numero ?? null,
      inicio: r.fechaHora,
      cliente: r.nombre,
      minutos: Math.max(0, Math.round((new Date(r.fechaHora) - now) / 60000)),
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo alertas de reservas' });
  }
});

module.exports = router;
