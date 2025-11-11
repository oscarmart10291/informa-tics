// backend/src/routes/cliente.pagos.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient, MetodoPago, OrdenEstado } = require('../generated/prisma');
const prisma = new PrismaClient();

const Q  = (n)=>`Q${Number(n||0).toFixed(2)}`;
const total = (items=[]) => Number(items.reduce((a,i)=>a+Number(i.precio||0),0).toFixed(2));

router.post('/tarjeta/capturar', async (req,res)=>{
  try {
    const pedidoId = Number(req.body?.pedidoClienteId);
    if (!pedidoId) return res.status(400).json({ error:'pedidoClienteId requerido' });

    let p = await prisma.pedidoCliente.findUnique({ where:{ id: pedidoId }, include:{ items:true } });
    if (!p) return res.status(404).json({ error:'Pedido no existe' });

    if (!p.ordenId) {
      const itemsPlano = [];
      for (const it of (p.items||[])) {
        const n = Math.max(1, Number(it.qty||1));
        const base = { nombre:String(it.nombre||''), precio:Number(it.precio||0), nota:it.nota||null, tipo:'PLATILLO', estado:'PENDIENTE' };
        for (let k=0;k<n;k++) itemsPlano.push(base);
      }
      const ord = await prisma.orden.create({ data:{ codigo:p.codigo, mesa:0, estado:'EN_ESPERA', items:{ create: itemsPlano } }, include:{ items:true } });
      await prisma.pedidoCliente.update({ where:{ id: p.id }, data:{ ordenId: ord.id } });
      p.ordenId = ord.id;
    }

    const ord = await prisma.orden.findUnique({ where:{ id: p.ordenId }, include:{ items:true } });
    const tot = total(ord.items);

    const ticket = await prisma.$transaction(async tx => {
      const t = await tx.ticketVenta.create({
        data:{
          ordenId: ord.id, metodoPago: MetodoPago.TARJETA,
          totalAPagar: tot, montoRecibido: tot, cambio: 0,
          posCorrelativo: 'ONLINE', fechaPago: new Date()
        },
        include:{ orden:true }
      });
      await tx.orden.update({ where:{ id: ord.id }, data:{ estado: OrdenEstado.PAGADA, totalPagado: tot } });
      await tx.pedidoCliente.update({ where:{ id: p.id }, data:{ metodoPago: 'TARJETA' } });
      return t;
    });

    res.json({ ok:true, ticketId: ticket.id, ordenId: ord.id, codigo: ord.codigo, total: tot });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:'No se pudo capturar el pago' });
  }
});

router.get('/tickets/:id', async (req,res)=>{
  try {
    const id = Number(req.params.id);
    const t = await prisma.ticketVenta.findUnique({ where:{ id }, include:{ orden:{ include:{ items:true } } } });
    if (!t) return res.status(404).send('Ticket no existe');

    const rows = (t.orden?.items||[]).map((it,idx)=>`
      <tr><td>${idx+1}</td><td>${it.nombre}${it.nota?` <em style="color:#64748b">(nota: ${it.nota})</em>`:''}</td><td style="text-align:right">${Q(it.precio)}</td></tr>
    `).join('');

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket #${t.id}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:6px}th{background:#f8fafc}</style>
</head><body>
<h2>Ticket de venta #${t.id}</h2>
<div>Orden: <b>${t.orden?.codigo ?? '-'}</b> · Fecha: <b>${new Date(t.fechaPago).toLocaleString()}</b></div>
<div>Método de pago: <b>${t.metodoPago}</b></div><hr/>
<table><thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Precio</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-weight:700">Total: ${Q(t.totalAPagar)}</p>
<script>window.print&&setTimeout(()=>window.print(),300)</script></body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('No se pudo generar el ticket');
  }
});

module.exports = router;
