// backend/src/routes/cliente.pedidos.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const { sendTicketPdfForOrden } = require('../services/ticket.pdf.mailer');
const { rebalanceAssignments } = require('../services/cocina.assigner');
let rebalanceBarAssignments = null;
try { ({ rebalanceBarAssignments } = require('../services/barra.assigner')); } catch {}

const { sendEmail } = require('../services/email');

const up = (s='') => String(s||'').toUpperCase();
const Q  = (n) => `Q${Number(n||0).toFixed(2)}`;

/* ===========================
   Helpers HTML para correos
=========================== */
function pedidoItemsHtml(items=[]) {
  if (!items.length) return '<p><em>Sin productos</em></p>';
  const rows = items.map(i=>`
    <tr>
      <td style="padding:.25rem .5rem">${i.qty}× ${i.nombre}${i.nota?` <em style="color:#64748b">(nota: ${i.nota})</em>`:''}</td>
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

/* ===========================
   Plantillas de correos
=========================== */
const emailPedidoRecibidoHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Recibimos tu pedido #${p.codigo}!</h2>
    <p style="margin:.25rem 0">Estado: <b>En espera de preparación</b></p>
    <p style="margin:.25rem 0">Entrega: <b>${up(p.tipoEntrega)}</b> · Pago: <b>${up(p.metodoPago)}</b></p>
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p style="margin:.25rem 0">Receptor: <b>${p.receptorNombre || '-'}</b></p>`:''}
    ${up(p.tipoEntrega)==='DOMICILIO'?`<p style="margin:.25rem 0">Dirección: ${p.direccion || '-'}</p>`:''}
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
    <p style="color:#64748b">Te avisaremos cuando esté listo.</p>
  </div>
`;
const emailPedidoEditadoHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">Cambios en tu pedido #${p.codigo}</h2>
    <p style="margin:.25rem 0">Actualizaste tu pedido correctamente.</p>
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total actualizado: ${Q(p.total)}</b></p>
  </div>
`;
const emailPedidoCanceladoHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">Pedido #${p.codigo} cancelado</h2>
    <p style="margin:.25rem 0">Tu pedido fue cancelado correctamente.</p>
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;
const emailPedidoListoParaRecogerHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} está listo para recoger!</h2>
    <p style="margin:.25rem 0">Puedes pasar por caja/mostrador cuando gustes.</p>
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;
const emailAsignadoRepartidorHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} fue asignado a repartidor!</h2>
    <p style="margin:.25rem 0">En breve pasará a recogerlo.</p>
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;
const emailEnCaminoHtml = (p) => `
  <div style="font-family:Segoe UI,Arial,sans-serif">
    <h2 style="margin:0 0 .25rem">¡Tu pedido #${p.codigo} va en camino!</h2>
    <p style="margin:.25rem 0">Nuestro repartidor ya salió hacia tu dirección. 🚗💨</p>
    ${pedidoItemsHtml(p.items||[])}
    <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(p.total)}</b></p>
  </div>
`;

/* ===========================
   Utilidades
=========================== */
function normalizarTipo(raw) {
  const t = up(raw);
  if (!t) return null;
  if (t.includes('BEB')) return 'BEBIDA';
  if (t.includes('COM')) return 'PLATILLO';
  if (t==='BEBIDA' || t==='PLATILLO') return t;
  return null;
}
async function resolverTipoDeItem(it) {
  const t1 = normalizarTipo(it?.tipo);
  if (t1) return t1;
  try {
    const where = it?.id || it?.platilloId ? { id:Number(it.id||it.platilloId) } : { nombre:String(it?.nombre||'') };
    const p = await prisma.platillo.findFirst({ where, include:{ categoria:{ select:{ tipo:true } } } });
    if (p?.categoria?.tipo) {
      const t2 = normalizarTipo(p.categoria.tipo);
      if (t2) return t2;
    }
  } catch {}
  return 'PLATILLO';
}

async function deriveEstadoPedido(pedido) {
  if (!pedido) return 'PENDIENTE';
  const persist = up(pedido.estado);
  if (['CANCELADA','ENTREGADA'].includes(persist)) return persist;
  if (!pedido.ordenId) return 'PENDIENTE';

  const items = await prisma.ordenItem.findMany({ where:{ ordenId: pedido.ordenId }, select:{ estado:true } });
  if (!items.length) return 'PENDIENTE';

  const ests = items.map(i=>up(i.estado));
  const todosPend = ests.every(e=>e==='PENDIENTE');
  const todosList = ests.every(e=>e==='LISTO');
  const algunoEnPrep = ests.some(e=>e==='ASIGNADO' || e==='PREPARANDO');
  const algunoListo  = ests.some(e=>e==='LISTO');

  if (todosPend) return 'PENDIENTE';
  if (todosList) return up(pedido.tipoEntrega)==='DOMICILIO' ? 'EN_ESPERA_DE_REPARTIDOR' : 'LISTO_PARA_RECOGER';
  if (algunoEnPrep || algunoListo) return 'EN_PREPARACION';
  return 'PENDIENTE';
}
async function canCancelPedido(pedido) {
  if (!pedido?.ordenId) return true;
  const items = await prisma.ordenItem.findMany({ where:{ ordenId: pedido.ordenId }, select:{ estado:true } });
  return items.every(it=>up(it.estado)==='PENDIENTE');
}
async function withTicketInfo(p) {
  if (!p?.ordenId) return { ...p, ticketId:null, ticketMetodoPago:null };
  const tk = await prisma.ticketVenta.findFirst({
    where: { ordenId: p.ordenId },
    orderBy: { id: 'desc' },
    select: { id:true, metodoPago:true },
  });

  let estadoFinal = p.estadoDerivado || p.estado;

  // Si es LOCAL y ya tiene ticket -> ENTREGADO
  if (tk && (p.tipoEntrega || '').toUpperCase() === 'LOCAL') {
    estadoFinal = 'ENTREGADO';
  }

  return { ...p, ticketId: tk?.id || null, ticketMetodoPago: tk?.metodoPago || null, estadoDerivado: estadoFinal };
}

/* Recompute util */
async function recomputeEstadoYNotificarSiListo(pedidoId) {
  const p = await prisma.pedidoCliente.findUnique({
    where: { id: Number(pedidoId) },
    include: { items: true },
  });
  if (!p) return null;

  const derivado = await deriveEstadoPedido(p);
  if (derivado !== p.estado) {
    const upd = await prisma.pedidoCliente.update({
      where: { id: p.id },
      data: { estado: derivado },
      include: { items: true },
    });

    if (derivado === 'LISTO_PARA_RECOGER' && up(upd.tipoEntrega) === 'LOCAL' && upd.clienteEmail) {
      try {
        await sendEmail({
          to: upd.clienteEmail,
          subject: `Pedido #${upd.codigo} listo para recoger`,
          html: emailPedidoListoParaRecogerHtml(upd),
        });
      } catch (e) {
        console.error('✉️ Email listo para recoger fallo:', e?.message);
      }
    }
    return upd;
  }
  return p;
}
async function recomputeByOrdenId(ordenId) {
  const ped = await prisma.pedidoCliente.findFirst({ where: { ordenId: Number(ordenId) } });
  if (ped) return recomputeEstadoYNotificarSiListo(ped.id);
  return null;
}

/* ===========================
   Rutas
=========================== */

/** POST /cliente/pedidos */
router.post('/', async (req,res)=>{
  try {
    const { clienteEmail, entrega, pago, direccion, telefono, receptorNombre, items, total } = req.body;
    if (!clienteEmail) return res.status(400).json({ error:'Falta clienteEmail' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error:'Agrega al menos un platillo' });
    if (!entrega || !pago) return res.status(400).json({ error:'Tipo de entrega y método de pago son obligatorios' });

    const ENT = String(entrega).toLowerCase();
    const PAY = String(pago).toLowerCase();

    if (ENT==='domicilio' && PAY!=='tarjeta') {
      return res.status(400).json({ error:'Para domicilio el pago debe ser con tarjeta en línea' });
    }
    const metodoPedido = (PAY==='tarjeta') ? 'TARJETA' : 'PAGO_EN_LOCAL';

    if (ENT==='domicilio') {
      if (!direccion || !telefono || !receptorNombre) {
        return res.status(400).json({ error:'Para domicilio: dirección, teléfono y receptorNombre son obligatorios' });
      }
      if (!/^\d{8}$/.test(String(telefono))) {
        return res.status(400).json({ error:'El teléfono debe tener exactamente 8 dígitos (solo números).' });
      }
    }

    const pedido = await prisma.pedidoCliente.create({
      data: {
        clienteEmail,
        tipoEntrega: ENT.toUpperCase(),
        metodoPago:  metodoPedido,
        direccion: ENT==='domicilio' ? direccion : null,
        telefono:  ENT==='domicilio' ? telefono  : null,
        receptorNombre: ENT==='domicilio' ? receptorNombre : null,
        total: Number(total||0),
        items: {
          create: items.map(i=>({
            platilloId: Number(i.id),
            nombre: i.nombre,
            precio: Number(i.precio),
            qty: Number(i.qty||1),
            nota: i.nota || null,
          })),
        },
      },
      include: { items:true },
    });

    try {
      await sendEmail({
        to: clienteEmail,
        subject: `Pedido #${pedido.codigo} recibido`,
        html: emailPedidoRecibidoHtml(pedido),
      });
    } catch(e){ console.error('✉️ Email recibido fallo:', e?.message); }

    res.status(201).json(pedido);
  } catch (e) {
    console.error('Crear pedido cliente:', e);
    res.status(500).json({ error:'No se pudo crear el pedido' });
  }
});

/** GET /cliente/pedidos?email=xxx */
router.get('/', async (req, res) => {
  try {
    const where = req.query.email ? { clienteEmail: req.query.email } : {};
    const pedidos = await prisma.pedidoCliente.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      include: {
        items: true,
        calificacion: true,
        // ✅ solo RELACIONES aquí:
        repartidor: { select: { id: true, nombre: true } },
        observaciones: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, texto: true, createdAt: true, repartidorId: true }
        }
      }
    });

    const enriched = await Promise.all(
      pedidos.map(async (p) => {
        const withTk = await withTicketInfo({
          ...p,
          estadoDerivado: await deriveEstadoPedido(p),
        });

        const ultimaObservacion =
          Array.isArray(p.observaciones) && p.observaciones[0]
            ? {
                id: p.observaciones[0].id,
                texto: p.observaciones[0].texto,
                createdAt: p.observaciones[0].createdAt,
                repartidorId: p.observaciones[0].repartidorId,
              }
            : null;

        // nombre del repartidor (o fallback a #id)
        const repartidorNombre =
          p.repartidor?.nombre ??
          (ultimaObservacion?.repartidorId ? `#${ultimaObservacion.repartidorId}` : null) ??
          (p.repartidorId ? `#${p.repartidorId}` : null); // p.repartidorId es escalar y ya viene en el objeto

        // nombre del cajero (último ticket de la orden) — solo LOCAL
        let cajeroNombre = null;
        if (String(p.tipoEntrega).toUpperCase() === 'LOCAL' && p.ordenId) {
          const lastTk = await prisma.ticketVenta.findFirst({
            where: { ordenId: p.ordenId },
            orderBy: { id: 'desc' },
            include: { cajero: { select: { nombre: true } } },
          });
          cajeroNombre = lastTk?.cajero?.nombre || null;
        }

        return {
          ...withTk,
          ultimaObservacion,
          repartidorNombre,
          cajeroNombre,
        };
      })
    );

    res.json(enriched);
  } catch (e) {
    console.error('Listar pedidos cliente:', e);
    res.status(500).json({ error: 'No se pudo obtener el historial' });
  }
});
/** PATCH /cliente/pedidos/:id/cancelar */
router.patch('/:id/cancelar', async (req,res)=>{
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedidoCliente.findUnique({
      where:{ id }, include:{ orden:{ include:{ items:true } }, items:true }
    });
    if (!pedido) return res.status(404).json({ error:'Pedido no encontrado' });
    if (up(pedido.estado)==='CANCELADA') return res.status(409).json({ error:'El pedido ya está cancelado' });
    if (up(pedido.estado)==='ENTREGADA') return res.status(409).json({ error:'El pedido ya fue entregado' });

    const tk = pedido.ordenId ? await prisma.ticketVenta.findFirst({ where:{ ordenId: pedido.ordenId } }) : null;
    if (up(pedido.metodoPago)==='TARJETA' || tk) {
      return res.status(403).json({ error:'Este pedido fue pagado con tarjeta o ya tiene ticket. No se puede cancelar aquí.' });
    }

    if (!await canCancelPedido(pedido)) {
      return res.status(409).json({ error:'La orden ya fue tomada por cocina/barra; no se puede cancelar.' });
    }

    const upd = await prisma.$transaction(async tx=>{
      if (pedido.ordenId) {
        await tx.ordenItem.deleteMany({ where:{ ordenId: pedido.ordenId } });
        await tx.orden.delete({ where:{ id: pedido.ordenId } });
      }
      return tx.pedidoCliente.update({
        where:{ id },
        data:{ estado:'CANCELADA', ordenId:null },
        include:{ items:true },
      });
    });

    try {
      await sendEmail({
        to: upd.clienteEmail,
        subject: `Pedido #${upd.codigo} cancelado`,
        html: emailPedidoCanceladoHtml(upd),
      });
    } catch(e){ console.error('✉️ Email cancelación fallo:', e?.message); }

    res.json(upd);
  } catch (e) {
    console.error('Cancelar pedido cliente:', e);
    res.status(500).json({ error:'No se pudo cancelar el pedido' });
  }
});

/** PATCH /cliente/pedidos/:id  (editar + sincroniza ORDEN) */
router.patch('/:id', async (req,res)=>{
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.pedidoCliente.findUnique({
      where:{ id }, include:{ items:true, orden:{ include:{ items:true } } }
    });
    if (!pedido) return res.status(404).json({ error:'Pedido no encontrado' });

    const tk = pedido.ordenId ? await prisma.ticketVenta.findFirst({ where:{ ordenId: pedido.ordenId } }) : null;
    if (up(pedido.metodoPago)==='TARJETA' || tk) {
      return res.status(403).json({ error:'Este pedido fue pagado con tarjeta o ya tiene ticket. No se puede editar aquí.' });
    }

    if (!await canCancelPedido(pedido)) {
      return res.status(409).json({ error:'El pedido está en preparación o listo, no se puede editar.' });
    }

    const { entrega, pago, direccion, telefono, receptorNombre, items } = req.body;
    const data = {};
    if (entrega) data.tipoEntrega = entrega.toUpperCase();
    if (pago) {
      const PAY = String(pago).toLowerCase();
      if (up(data.tipoEntrega || pedido.tipoEntrega)==='DOMICILIO' && PAY!=='tarjeta') {
        return res.status(400).json({ error:'Para domicilio el pago debe ser con tarjeta en línea' });
      }
      data.metodoPago = PAY==='tarjeta' ? 'TARJETA' : 'PAGO_EN_LOCAL';
    }

    if (up(entrega || pedido.tipoEntrega)==='DOMICILIO') {
      if (typeof direccion !== 'undefined') data.direccion = direccion || null;
      if (typeof telefono  !== 'undefined') data.telefono  = telefono || null;
      if (typeof receptorNombre !== 'undefined') data.receptorNombre = receptorNombre || null;

      // validar teléfono (8 dígitos) cuando sea DOMICILIO
      const telToValidate = (typeof telefono !== 'undefined') ? telefono : pedido.telefono;
      if (!/^\d{8}$/.test(String(telToValidate || ''))) {
        return res.status(400).json({ error:'El teléfono debe tener exactamente 8 dígitos (solo números).' });
      }
    } else {
      data.direccion = null; data.telefono = null; data.receptorNombre = null;
    }

    let total = 0;
    let itemsForOrder = items;
    if (Array.isArray(items)) {
      await prisma.pedidoClienteItem.deleteMany({ where:{ pedidoId:id } });
      await prisma.pedidoClienteItem.createMany({
        data: items.map(i=>{
          const row = {
            pedidoId:id,
            platilloId: Number(i.platilloId ?? i.id),
            nombre: i.nombre,
            precio: Number(i.precio),
            qty: Number(i.qty||1),
            nota: i.nota || null,
          };
          total += row.precio * row.qty;
          return row;
        }),
      });
      data.total = total;
    } else {
      itemsForOrder = (pedido.items||[]).map(i=>({
        id: i.platilloId, nombre:i.nombre, precio:i.precio, qty:i.qty, nota:i.nota
      }));
    }

    let upd = await prisma.pedidoCliente.update({ where:{ id }, data, include:{ items:true } });

    if (pedido.ordenId) {
      const itemsPlano = [];
      for (const it of (itemsForOrder||[])) {
        const n = Math.max(1, Number(it.qty||1));
        const tipo = await resolverTipoDeItem(it);
        const base = {
          ordenId: pedido.ordenId,
          nombre: String(it.nombre||'').trim(),
          precio: Number(it.precio||0),
          nota: (it.nota||'').trim() || null,
          tipo, estado:'PENDIENTE',
        };
        for (let k=0;k<n;k++) itemsPlano.push(base);
      }
      await prisma.$transaction(async tx=>{
        await tx.ordenItem.deleteMany({ where:{ ordenId: pedido.ordenId } });
        if (itemsPlano.length) await tx.ordenItem.createMany({ data: itemsPlano });
        await tx.orden.update({ where:{ id: pedido.ordenId }, data:{ estado:'EN_ESPERA', finishedAt:null } });
      });

      const derivado = await deriveEstadoPedido({ ...upd, ordenId: pedido.ordenId });
      upd = await prisma.pedidoCliente.update({ where:{ id }, data:{ estado: derivado }, include:{ items:true } });
    }

    try {
      await sendEmail({ to: upd.clienteEmail, subject:`Cambios en tu pedido #${upd.codigo}`, html: emailPedidoEditadoHtml(upd) });
    } catch(e){ console.error('✉️ Email edición fallo:', e?.message); }

    res.json(upd);
  } catch (e) {
    console.error('Editar pedido cliente:', e);
    res.status(500).json({ error:'No se pudo editar el pedido' });
  }
});

/** POST /cliente/pedidos/a-cocina */
router.post('/a-cocina', async (req,res)=>{
  try {
    const { pedidoClienteId, entrega, pago, direccion='', telefono='', receptorNombre='', items=[] } = req.body||{};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error:'Agrega al menos un platillo' });

    let pedidoPre = null;
    if (pedidoClienteId) {
      pedidoPre = await prisma.pedidoCliente.findUnique({
        where:{ id:Number(pedidoClienteId) }, select:{ id:true, codigo:true, tipoEntrega:true }
      });
    }

    const itemsPlano = [];
    for (const it of items) {
      const n = Math.max(1, Number(it.qty||1));
      const tipo = await resolverTipoDeItem(it);
      const base = { nombre:String(it.nombre||'').trim(), precio:Number(it.precio||0), nota:(it.nota||'').trim()||null, tipo, estado:'PENDIENTE' };
      for (let k=0;k<n;k++) itemsPlano.push(base);
    }

    const orden = await prisma.orden.create({
      data: { codigo: pedidoPre?.codigo || undefined, mesa:0, estado:'EN_ESPERA', items:{ create: itemsPlano } },
      include: { items:true },
    });

    try { await rebalanceAssignments(); } catch {}
    try { if (rebalanceBarAssignments) await rebalanceBarAssignments(); } catch {}

    let pedidoData = null;
    if (pedidoPre) {
      const pedFull = await prisma.pedidoCliente.findUnique({ where:{ id: pedidoPre.id } });
      const derivado = await deriveEstadoPedido({ ...pedFull, ordenId: orden.id });
      pedidoData = await prisma.pedidoCliente.update({ where:{ id: pedidoPre.id }, data:{ ordenId: orden.id, estado: derivado } });
    }

    res.status(201).json({ mensaje:'Orden enviada a cocina/barra', orden, pedido: pedidoData, meta:{ entrega,pago,direccion,telefono,receptorNombre } });
  } catch (e) {
    console.error('Crear orden desde cliente (a-cocina) ERROR:', e);
    res.status(500).json({ error: e?.meta?.cause || e?.message || 'No se pudo enviar a cocina' });
  }
});

/* ===========================
   Calificación
=========================== */

// Opciones permitidas (para guardar en JSON)
const CAL_OPTS = {
  comida: [
    'Sabor excelente',
    'Sabor no muy bueno',
    'Presentación atractiva',
    'Presentación descuidada',
    'Excelente relación calidad/precio',
    'Calidad no acorde al precio',
  ],
  repartidor: [
    'Puntual en la entrega',
    'Trato amable',
    'Comunicación clara',
    'Cuidado del pedido',
    'Trato poco amable',
    'Retraso en la entrega',
    'Pedido mal manejado / derramado',
    'No avisó al llegar',
  ],
  atencion: [
    'Amable',
    'Rápida atención',
    'Orden correcta',
    'Atención lenta',
    'Errores en el pedido entregado',
  ]
};

// ✅ FIX: permitir el máximo por grupo (o todo si quieres cambiar el valor)
function sanitizeOptions(list = [], allowed = [], max = allowed.length) {
  const set = new Set(allowed);
  return (Array.isArray(list) ? list : [])
    .map(v => String(v || '').trim())
    .filter(v => v && set.has(v))
    .slice(0, max); // pon .slice(0, max) o elimínalo si no quieres límite
}

/** POST /cliente/pedidos/:id/calificar */
router.post('/:id/calificar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      comida,
      repartidor,
      atencionCliente,
      comentario,
      comidaOpciones,
      repartidorOpciones,
      atencionOpciones,
    } = req.body || {};

    const p = await prisma.pedidoCliente.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });

    // ⛔ no permitir recalificar
    const existente = await prisma.calificacionPedido.findUnique({ where: { pedidoId: id } });
    if (existente) {
      return res.status(409).json({ error: 'Este pedido ya fue calificado.', calificacion: existente });
    }

    const isDom = String(p.tipoEntrega).toUpperCase() === 'DOMICILIO';

    // Permitir calificar solo si corresponde
    if (isDom) {
      if (String(p.deliveryStatus).toUpperCase() !== 'ENTREGADO') {
        return res.status(409).json({ error: 'Solo puedes calificar cuando el pedido haya sido ENTREGADO.' });
      }
    } else {
      if (!p.ordenId) return res.status(409).json({ error: 'Pedido sin orden asociada.' });
      const tk = await prisma.ticketVenta.findFirst({
        where: { ordenId: p.ordenId, estado: 'VALIDO' },
      });
      if (!tk) return res.status(409).json({ error: 'Solo puedes calificar cuando el pedido haya sido cobrado en caja.' });
    }

    const valComida = Number(comida || 0);
    const valSec = isDom ? Number(repartidor || 0) : Number(atencionCliente || 0);
    if (!(valComida >= 1 && valComida <= 5 && valSec >= 1 && valSec <= 5)) {
      return res.status(400).json({ error: 'Las calificaciones deben estar entre 1 y 5' });
    }

    const saved = await prisma.calificacionPedido.create({
      data: {
        pedidoId: id,
        comida: valComida,
        repartidor: isDom ? valSec : null,
        atencionCliente: !isDom ? valSec : null,
        comentario: comentario || null,
        // ✅ máximos por grupo: comida(6), repartidor(8), atención(5)
        comidaOpciones:     sanitizeOptions(comidaOpciones,     CAL_OPTS.comida,     6),
        repartidorOpciones: isDom ? sanitizeOptions(repartidorOpciones, CAL_OPTS.repartidor, 8) : null,
        atencionOpciones:  !isDom ? sanitizeOptions(atencionOpciones,  CAL_OPTS.atencion,  5) : null,
      },
    });

    res.json(saved);
  } catch (e) {
    console.error('Calificar pedido:', e);
    res.status(500).json({ error: 'No se pudo guardar la calificación' });
  }
});

/* =========================== */
router.patch('/:id/delivery', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { deliveryStatus } = req.body || {};
    if (!deliveryStatus) return res.status(400).json({ error: 'deliveryStatus es requerido' });

    const prev = await prisma.pedidoCliente.findUnique({
      where: { id },
      select: { id:true, ordenId:true, clienteEmail:true, tipoEntrega:true, codigo:true, items:true }
    });
    if (!prev) return res.status(404).json({ error: 'Pedido no encontrado' });

    const nuevoEstado = up(String(deliveryStatus));
    const upd = await prisma.pedidoCliente.update({
      where: { id },
      data: { deliveryStatus: nuevoEstado },
      include: { items: true },
    });

    if (up(upd.tipoEntrega) === 'DOMICILIO' && upd.clienteEmail) {
      try {
        if (nuevoEstado === 'ASIGNADO_A_REPARTIDOR') {
          await sendEmail({ to: upd.clienteEmail, subject:`Pedido #${upd.codigo} asignado a repartidor`, html: emailAsignadoRepartidorHtml(upd) });
        } else if (nuevoEstado === 'EN_CAMINO') {
          await sendEmail({ to: upd.clienteEmail, subject:`Pedido #${upd.codigo} en camino`, html: emailEnCaminoHtml(upd) });
        } else if (nuevoEstado === 'ENTREGADO') {
          if (prev.ordenId) {
            sendTicketPdfForOrden(prev.ordenId).catch(e => console.error('delivery ENTREGADO (PDF) fallo:', e?.message));
          }
        }
      } catch (e) {
        console.error('✉️ Email delivery fallo:', e?.message);
      }
    }

    res.json(upd);
  } catch (e) {
    console.error('Actualizar deliveryStatus:', e);
    res.status(500).json({ error: 'No se pudo actualizar el deliveryStatus' });
  }
});

router.patch('/:id/recompute', async (req, res) => {
  try {
    const upd = await recomputeEstadoYNotificarSiListo(Number(req.params.id));
    res.json(upd || { ok:false });
  } catch (e) {
    console.error('Recompute pedido:', e);
    res.status(500).json({ error: 'No se pudo recomputar el estado' });
  }
});

module.exports = router;
module.exports.recomputeByOrdenId = recomputeByOrdenId;
