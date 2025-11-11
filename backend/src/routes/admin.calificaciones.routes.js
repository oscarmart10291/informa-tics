// backend/src/routes/admin.calificaciones.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// ⛔️ (Opcional) Middleware de auth admin
// const ensureAdmin = (req,res,next)=>{ /* TODO */ next(); };

function parseRange(q) {
  const today = new Date();
  const start = q.from ? new Date(q.from) : new Date(today.getFullYear(), today.getMonth(), 1);
  const end   = q.to   ? new Date(q.to)   : new Date(today.getFullYear(), today.getMonth()+1, 1);
  return { start, end };
}
function up(s=''){ return String(s||'').toUpperCase(); }

function buildWhere(q) {
  const { start, end } = parseRange(q);
  const w = { createdAt: { gte: start, lt: end } };
  const tipo = up(q.tipoEntrega || '');
  if (tipo === 'DOMICILIO' || tipo === 'LOCAL') {
    w.pedido = { is: { tipoEntrega: tipo } };
  }
  return w;
}

function countOptions(list = []) {
  const map = new Map();
  for (const v of list) {
    if (!v) continue;
    const k = String(v);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([texto, count]) => ({ texto, count }))
    .sort((a,b)=> b.count - a.count);
}

/* =============================
   GET /admin/calificaciones/resumen
   KPIs + “top motivos” + últimos N
============================= */
router.get('/resumen', /*ensureAdmin,*/ async (req, res) => {
  try {
    const where = buildWhere(req.query);

    // 👉 añadimos repartidorId y ordenId del pedido
    const rows = await prisma.calificacionPedido.findMany({
      where,
      include: {
        pedido: {
          select: {
            id: true,
            codigo: true,
            tipoEntrega: true,
            creadoEn: true,
            repartidorId: true,
            ordenId: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // ====== KPIs / Top motivos (igual que antes) ======
    const kpis = {
      total: rows.length,
      comidaAvg: 0,
      repartidorAvg: 0,
      atencionAvg: 0,
      pctBuenas: 0,
      pctMalas: 0
    };

    let sumComida=0, nComida=0, sumRep=0, nRep=0, sumAt=0, nAt=0;
    let buenas=0, malas=0;

    const comidaOpts = [];
    const repOpts = [];
    const atOpts = [];

    for (const r of rows) {
      if (typeof r.comida === 'number') { sumComida += r.comida; nComida++; }
      if (typeof r.repartidor === 'number') { sumRep += r.repartidor; nRep++; }
      if (typeof r.atencionCliente === 'number') { sumAt += r.atencionCliente; nAt++; }

      const sec = (r.repartidor ?? r.atencionCliente ?? 0);
      const worst = Math.min(r.comida || 0, sec || 0);
      const best  = Math.max(r.comida || 0, sec || 0);
      if (best >= 4) buenas++;
      if (worst > 0 && worst <= 2) malas++;

      (Array.isArray(r.comidaOpciones) && r.comidaOpciones.length) && comidaOpts.push(...r.comidaOpciones);
      (Array.isArray(r.repartidorOpciones) && r.repartidorOpciones.length) && repOpts.push(...r.repartidorOpciones);
      (Array.isArray(r.atencionOpciones) && r.atencionOpciones.length) && atOpts.push(...r.atencionOpciones);
    }

    kpis.comidaAvg = nComida ? +(sumComida/nComida).toFixed(2) : 0;
    kpis.repartidorAvg = nRep ? +(sumRep/nRep).toFixed(2) : 0;
    kpis.atencionAvg   = nAt ? +(sumAt/nAt).toFixed(2) : 0;
    kpis.pctBuenas = rows.length ? +(100*buenas/rows.length).toFixed(1) : 0;
    kpis.pctMalas  = rows.length ? +(100*malas/rows.length).toFixed(1) : 0;

    const top = {
      comida: countOptions(comidaOpts).slice(0,8),
      repartidor: countOptions(repOpts).slice(0,8),
      atencion: countOptions(atOpts).slice(0,8),
    };

    // ====== NUEVO: mapear "atendido por" ======
    // Repartidores (DOMICILIO)
    const repIds = Array.from(new Set(
      rows.map(r => (r.pedido?.tipoEntrega === 'DOMICILIO' ? Number(r.pedido?.repartidorId || 0) : 0))
          .filter(Boolean)
    ));
    const repUsers = repIds.length
      ? await prisma.usuario.findMany({ where: { id: { in: repIds } }, select: { id: true, nombre: true } })
      : [];
    const repMap = new Map(repUsers.map(u => [Number(u.id), u.nombre]));

    // Cajeros por orden (LOCAL) -> tomamos el ticket más reciente de esa orden
    const ordenIds = Array.from(new Set(
      rows.map(r => (r.pedido?.tipoEntrega === 'LOCAL' ? Number(r.pedido?.ordenId || 0) : 0))
          .filter(Boolean)
    ));
    const tkList = ordenIds.length
      ? await prisma.ticketVenta.findMany({
          where: { ordenId: { in: ordenIds } },
          orderBy: [{ ordenId: 'asc' }, { id: 'desc' }],
          include: { cajero: { select: { id: true, nombre: true } } }
        })
      : [];
    const cajeroPorOrden = new Map();
    for (const t of tkList) {
      if (!cajeroPorOrden.has(t.ordenId)) {
        cajeroPorOrden.set(t.ordenId, t.cajero ? { id: t.cajero.id, nombre: t.cajero.nombre } : null);
      }
    }

    // últimos 30 con “atendido por”
    const ultimas = rows.slice(0, 30).map(r => {
      let atendidoPorTipo = null, atendidoPorId = null, atendidoPor = null;

      if (r.pedido?.tipoEntrega === 'DOMICILIO') {
        const rid = Number(r.pedido?.repartidorId || 0);
        if (rid) {
          atendidoPorTipo = 'REPARTIDOR';
          atendidoPorId   = rid;
          atendidoPor     = repMap.get(rid) || null;
        }
      } else if (r.pedido?.tipoEntrega === 'LOCAL') {
        const cj = cajeroPorOrden.get(Number(r.pedido?.ordenId || 0));
        if (cj) {
          atendidoPorTipo = 'CAJERO';
          atendidoPorId   = cj.id || null;
          atendidoPor     = cj.nombre || null;
        }
      }

      return {
        id: r.id,
        createdAt: r.createdAt,
        pedidoId: r.pedidoId,
        codigo: r.pedido?.codigo,
        tipoEntrega: r.pedido?.tipoEntrega,
        comida: r.comida,
        repartidor: r.repartidor,
        atencionCliente: r.atencionCliente,
        comentario: r.comentario || '',
        comidaOpciones: r.comidaOpciones || [],
        repartidorOpciones: r.repartidorOpciones || [],
        atencionOpciones: r.atencionOpciones || [],
        // 👇 NUEVO
        atendidoPorTipo,
        atendidoPorId,
        atendidoPor,
      };
    });

    res.json({ kpis, top, ultimas });
  } catch (e) {
    console.error('Admin resumen calificaciones:', e);
    res.status(500).json({ error: 'No se pudo obtener el resumen' });
  }
});

/* =============================
   GET /admin/calificaciones/bajas
============================= */
router.get('/bajas', /*ensureAdmin,*/ async (req,res)=>{
  try{
    const where = buildWhere(req.query);
    const rows = await prisma.calificacionPedido.findMany({
      where,
      include: { pedido: { select:{ id:true, codigo:true, tipoEntrega:true, creadoEn:true } } },
      orderBy:{ createdAt:'desc' }
    });

    const list = rows
      .filter(r => (r.comida && r.comida<=3) || (r.repartidor && r.repartidor<=3) || (r.atencionCliente && r.atencionCliente<=3))
      .slice(0, 100);

    res.json(list);
  }catch(e){
    console.error('Admin calificaciones bajas:', e);
    res.status(500).json({ error:'No se pudo obtener la lista' });
  }
});

/* =============================
   GET /admin/calificaciones/export
============================= */
router.get('/export', /*ensureAdmin,*/ async (req,res)=>{
  try{
    const where = buildWhere(req.query);
    const rows = await prisma.calificacionPedido.findMany({
      where,
      include: { pedido: { select:{ id:true, codigo:true, tipoEntrega:true, creadoEn:true } } },
      orderBy:{ createdAt:'desc' }
    });

    const header = [
      'fecha','codigo','tipoEntrega','comida','repartidor','atencion','comentario',
      'comidaOpciones','repartidorOpciones','atencionOpciones'
    ];
    const lines = [header.join(',')];
    for(const r of rows){
      const line = [
        r.createdAt.toISOString(),
        r.pedido?.codigo || '',
        r.pedido?.tipoEntrega || '',
        r.comida ?? '',
        r.repartidor ?? '',
        r.atencionCliente ?? '',
        (r.comentario||'').replaceAll('\n',' ').replaceAll(',',';'),
        (r.comidaOpciones||[]).join('|').replaceAll(',',';'),
        (r.repartidorOpciones||[]).join('|').replaceAll(',',';'),
        (r.atencionOpciones||[]).join('|').replaceAll(',',';'),
      ].map(v=>`"${String(v)}"`).join(',');
      lines.push(line);
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="calificaciones.csv"');
    res.send(csv);
  }catch(e){
    console.error('Admin export calificaciones:', e);
    res.status(500).json({ error:'No se pudo exportar' });
  }
});

module.exports = router;
