// backend/src/routes/reportes.routes.js
const express = require('express');
const dayjs = require('dayjs');
const weekOfYear = require('dayjs/plugin/weekOfYear');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

dayjs.extend(weekOfYear);

module.exports = function reportesRoutes(prisma, { auth, requirePerm }) {
  const router = express.Router();

  /* ===================== Helpers comunes ===================== */
  function parseRange(qs) {
    let from = null, to = null;
    if (qs.desde) from = dayjs(qs.desde + 'T00:00:00').toDate();
    if (qs.hasta) to   = dayjs(qs.hasta + 'T23:59:59.999').toDate();
    return { from, to };
  }
  function groupKey(dt, by) {
    const d = dayjs(dt);
    if (by === 'week')  return `${d.year()}-W${String(d.week()).padStart(2,'0')}`;
    if (by === 'month') return d.format('YYYY-MM');
    return d.format('YYYY-MM-DD');
  }
  function asGTQ(n) {
    const v = Number(n || 0);
    return 'Q ' + v.toFixed(2);
  }
  function getRangeFromQuery(qs) {
    const periodo = String(qs.periodo || '').toLowerCase();
    if (periodo === 'dia' && qs.dia) {
      const d = dayjs(qs.dia);
      return { from: d.startOf('day').toDate(), to: d.endOf('day').toDate() };
    }
    if (periodo === 'semana' && qs.anio && qs.semana) {
      const d = dayjs().year(Number(qs.anio)).week(Number(qs.semana));
      return { from: d.startOf('week').toDate(), to: d.endOf('week').toDate() };
    }
    if (periodo === 'mes' && qs.anio && qs.mes) {
      const d = dayjs(`${qs.anio}-${String(qs.mes).padStart(2,'0')}-01`);
      return { from: d.startOf('month').toDate(), to: d.endOf('month').toDate() };
    }
    const { from, to } = parseRange(qs);
    return { from, to };
  }

  // Branding para PDFs/Excels
  function resolveLogoPath() {
    let envPath = process.env.APP_LOGO_PATH;
    if (envPath) {
      const p = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    const candidates = [
      path.resolve(__dirname, '../../public/icon-admin-192.png'),
      path.resolve(__dirname, '../../../public/icon-admin-192.png'),
      path.resolve(__dirname, '../../../frontend/public/icon-admin-192.png'),
      path.resolve(process.cwd(), 'frontend/public/icon-admin-192.png'),
      path.resolve(process.cwd(), 'frontend/public/favicon-admin.png'),
    ];
    for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
    return null;
  }

  /* ====================================================================== */
  /* ====================== 1) Ventas itemizadas ========================== */
  /* ====================================================================== */
  router.get('/ventas/itemizadas', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const { from, to } = parseRange(req.query);
      const metodoPago = (() => {
        const s = String(req.query.metodoPago || '').toUpperCase().trim();
        return s === 'EFECTIVO' || s === 'TARJETA' ? s : undefined;
      })();

      const where = {};
      if (from || to) where.fechaPago = {};
      if (from) where.fechaPago.gte = from;
      if (to)   where.fechaPago.lte = to;
      if (metodoPago) where.metodoPago = metodoPago;

      const tickets = await prisma.ticketVenta.findMany({
        where,
        select: {
          id: true,
          fechaPago: true,
          serie: true,
          numero: true,
          metodoPago: true,
          orden: {
            select: {
              mesa: true,
              items: { select: { nombre: true, qty: true, precio: true, subtotal: true, nota: true } }
            }
          }
        },
        orderBy: { fechaPago: 'desc' }
      });

      const rows = [];
      for (const t of tickets) {
        const mesaNumero = typeof t?.orden?.mesa === 'number' ? t.orden.mesa : null;
        for (const it of (t?.orden?.items || [])) {
          const qty = Math.max(1, Number(it.qty || 1));
          const unit = it.precio != null ? Number(it.precio) : Number(it.subtotal || 0) / qty;
          for (let i = 0; i < qty; i++) {
            rows.push({
              fecha: t.fechaPago,
              nombre: it.nombre,
              ingreso: Number(unit || 0),
              serie: (t.serie && t.serie.trim()) ? t.serie : '',
              numero: t.numero ?? null,
              mesa: mesaNumero,
              metodoPago: t.metodoPago || ''
            });
          }
        }
      }
      rows.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const total = rows.reduce((acc, r) => acc + Number(r.ingreso || 0), 0);
      res.json({ ok: true, count: rows.length, total, rows });
    } catch (err) {
      console.error('[ventas-itemizadas][ERROR]', err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

/* ========================= EXPORT: VENTAS (Excel) ========================= */
router.get('/ventas/export/excel', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const metodoPago = (() => {
      const s = String(req.query.metodoPago || '').toUpperCase().trim();
      return s === 'EFECTIVO' || s === 'TARJETA' ? s : undefined;
    })();

    const where = {};
    if (from || to) where.fechaPago = {};
    if (from) where.fechaPago.gte = from;
    if (to)   where.fechaPago.lte = to;
    if (metodoPago) where.metodoPago = metodoPago;

    const tickets = await prisma.ticketVenta.findMany({
      where,
      select: {
        id: true,
        fechaPago: true,
        metodoPago: true,
        orden: { select: { mesa: true, items: { select: { nombre: true, qty: true, precio: true, subtotal: true } } } }
      },
      orderBy: { fechaPago: 'desc' }
    });

    // construir filas (una por unidad vendida)
    const rows = [];
    for (const t of tickets) {
      const mesaNumero = typeof t?.orden?.mesa === 'number' ? t.orden.mesa : null;
      for (const it of (t?.orden?.items || [])) {
        const qty  = Math.max(1, Number(it.qty || 1));
        const unit = it.precio != null ? Number(it.precio) : Number(it.subtotal || 0) / qty;
        for (let i = 0; i < qty; i++) {
          rows.push({
            fecha: t.fechaPago,
            item: it.nombre,
            ingreso: Number(unit || 0),
            mesa: mesaNumero,
            metodoPago: t.metodoPago || ''
          });
        }
      }
    }
    rows.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const totalVentas = rows.reduce((acc, r) => acc + Number(r.ingreso || 0), 0);

    const XL_COLORS = { headDark:'111827', headText:'FFFFFF', zebra1:'FFFFFF', zebra2:'FAFAFA', border:'E5E7EB', text:'111827' };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventas');

    // Encabezado
    ws.mergeCells('A1:E1');
    const tCell = ws.getCell('A1');
    tCell.value = 'Ventas';
    tCell.font = { bold: true, size: 20, color: { argb: XL_COLORS.text } };
    const lines = [
      process.env.APP_RESTAURANT_NAME || 'Restaurante Morales',
      process.env.APP_RESTAURANT_CITY || 'Morales, Izabal',
      `Desde: ${req.query.desde || '-'}   Hasta: ${req.query.hasta || '-'}`,
      `Método de pago: ${metodoPago || 'TODOS'}`,
      `Total ventas: Q ${totalVentas.toFixed(2)}`     // <<<<<<<<<<
    ];
    lines.forEach((line, i) => {
      ws.mergeCells(2 + i, 1, 2 + i, 5);
      const c = ws.getCell(2 + i, 1);
      c.value = line;
      c.font = { size: 11, color: { argb: '374151' } };
    });

    const R = 6;
    ws.columns = [
      { key:'fecha',   width:22 },
      { key:'mesa',    width:8,  style:{ alignment:{ horizontal:'center' } } },
      { key:'metodo',  width:12 },
      { key:'item',    width:40 },
      { key:'ingreso', width:14, style:{ alignment:{ horizontal:'right' } } },
    ];
ws.getRow(R).values = ['Fecha','Mesa','Método','Ítem','Ingreso'];

    ws.getRow(R).values = ['Fecha','Mesa','Método','Ítem','Ingreso'];
    const hdr = ws.getRow(R);
    hdr.font = { bold: true, color: { argb: XL_COLORS.headText } };
    hdr.alignment = { vertical: 'middle', horizontal: 'center' };
    hdr.height = 20;
    hdr.eachCell(c => {
      c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:XL_COLORS.headDark} };
      c.border = { top:{style:'thin',color:{argb:XL_COLORS.border}}, bottom:{style:'thin',color:{argb:XL_COLORS.border}} };
    });

    const first = R+1;
    rows.forEach(r => ws.addRow([
    r.fecha ? dayjs(r.fecha).format('YYYY-MM-DD HH:mm:ss') : '',
    r.mesa ?? '',
    r.metodoPago,
    r.item,
    r.ingreso
    ]));
    ws.getColumn(5).numFmt = '"Q" #,##0.00';


    // zebra
    for (let rr = first; rr <= ws.lastRow.number; rr++) {
  const fill = (rr - first) % 2 === 0 ? XL_COLORS.zebra1 : XL_COLORS.zebra2;
  for (let c = 1; c <= 5; c++) ws.getCell(rr, c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:fill} };
}

    // Fila TOTAL
    const totalRow = ws.addRow(['', '', '', 'TOTAL', totalVentas]);
    totalRow.font = { bold: true };
    totalRow.eachCell((c, idx) => {
      if (idx >= 1 && idx <= 7) c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'F3F4F6'} };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ventas_itemizadas.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[export ventas excel][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al exportar Excel (ventas)' });
  }
});

/* ========================= EXPORT: VENTAS (PDF) ========================= */
router.get('/ventas/export/pdf', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const metodoPago = (() => {
      const s = String(req.query.metodoPago || '').toUpperCase().trim();
      return s === 'EFECTIVO' || s === 'TARJETA' ? s : undefined;
    })();

    const where = {};
    if (from || to) where.fechaPago = {};
    if (from) where.fechaPago.gte = from;
    if (to)   where.fechaPago.lte = to;
    if (metodoPago) where.metodoPago = metodoPago;

    const tickets = await prisma.ticketVenta.findMany({
      where,
      select: {
        id: true, fechaPago: true, serie: true, numero: true, metodoPago: true,
        orden: { select: { mesa: true, items: { select: { nombre: true, qty: true, precio: true, subtotal: true } } } }
      },
      orderBy: { fechaPago: 'desc' }
    });

    const rows = [];
    for (const t of tickets) {
      const mesaNumero = typeof t?.orden?.mesa === 'number' ? t.orden.mesa : null;
      for (const it of (t?.orden?.items || [])) {
        const qty  = Math.max(1, Number(it.qty || 1));
        const unit = it.precio != null ? Number(it.precio) : Number(it.subtotal || 0) / qty;
        for (let i = 0; i < qty; i++) {
          rows.push({
            fecha: t.fechaPago,
            item: it.nombre,
            ingreso: Number(unit || 0),
            serie: (t.serie && t.serie.trim()) ? t.serie : '',
            numero: t.numero ?? null,
            mesa: mesaNumero,
            metodoPago: t.metodoPago || ''
          });
        }
      }
    }
    rows.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    const totalVentas = rows.reduce((acc, r) => acc + Number(r.ingreso || 0), 0);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=ventas_itemizadas.pdf');

    const doc = new PDFDocument({ size:'LETTER', layout:'landscape', margins:{ top:40, bottom:40, left:50, right:50 } });
    doc.pipe(res);

    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const LOGO = resolveLogoPath();
    if (LOGO) { try { doc.image(LOGO, right - 44, 34, { width: 44 }); } catch {} }

    // Título + encabezado
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text('Ventas', left, 40);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`${process.env.APP_RESTAURANT_NAME || 'Restaurante Morales'} • ${process.env.APP_RESTAURANT_CITY || 'Morales, Izabal'}`);
    doc.font('Helvetica').fontSize(10).fillColor('#6B7280')
      .text(`Desde: ${req.query.desde || '-'}  |  Hasta: ${req.query.hasta || '-'}`);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`Método de pago: ${metodoPago || 'TODOS'}`);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827')
      .text(`Total ventas: Q ${totalVentas.toFixed(2)}`);                 // <<<<<<<<<<
    doc.moveDown(0.6);

    const PAD = 10, headerH = 24, rowH = 20;
    const zebra = ['#FFFFFF', '#FAFAFA'];
    const colsDef = [
    { t:'Fecha',   p:0.25 },
    { t:'Mesa',    p:0.10, align:'center' },
    { t:'Método',  p:0.12 },
    { t:'Ítem',    p:0.43 },
    { t:'Ingreso', p:0.10, align:'right' },
  ];


    function drawHeader(cols, y0) {
      doc.save().rect(left, y0, contentW, headerH).fill('#111827').restore();
      let x = left + PAD;
      cols.forEach(c => {
        let fs = 10; doc.font('Helvetica-Bold');
        while (fs > 7 && doc.widthOfString(c.t, { size: fs }) > (c.w - PAD*2)) fs -= 0.5;
        doc.fontSize(fs).fillColor('#FFFFFF').text(c.t, x, y0 + 6, { width: c.w - PAD*2, align: c.align || 'left', lineBreak:false });
        x += c.w;
      });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      return { y: y0 + headerH };
    }
    function ensure(h, colsDef) {
      const available = doc.page.height - doc.page.margins.bottom - 24;
      if (doc.y + h > available) {
        doc.addPage({ size:'LETTER', layout:'landscape', margins: doc.page.margins });
        const widths = colsDef.map(c => Math.floor(c.p * (doc.page.width - doc.page.margins.left - doc.page.margins.right)));
        const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));
        return drawHeader(cols, doc.y);
      }
      return null;
    }

    const widths = colsDef.map(c => Math.floor(c.p * contentW));
    const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));
    let hdr = drawHeader(cols, doc.y);
    let y = hdr.y;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const maybeHdr = ensure(rowH, colsDef);
      if (maybeHdr) { hdr = maybeHdr; y = hdr.y; }
      doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();

      const values = [
      r.fecha ? dayjs(r.fecha).format('YYYY-MM-DD HH:mm') : '',
      r.mesa ?? '',
      r.metodoPago,
      r.item,
      'Q ' + Number(r.ingreso || 0).toFixed(2)
    ];
          let x = left + PAD;
      cols.forEach((c, idx) => {
        doc.text(values[idx], x, y + 4, { width: c.w - PAD*2, align: c.align || 'left', lineBreak: false });
        x += c.w;
      });
      y += rowH;
    }

    // Pie: TOTAL grande a la derecha
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
      .text(`TOTAL: Q ${totalVentas.toFixed(2)}`, right - 180, doc.y, { width: 180, align: 'right' });

    doc.end();
  } catch (err) {
    console.error('[export ventas pdf][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al exportar PDF (ventas)' });
  }
});

  /* ====================================================================== */
  /* ====================== 2) Comprobantes (lista) ======================= */
  /* ====================================================================== */
  router.get('/comprobantes', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const parseMetodoPago = (v) => {
        const s = String(v || '').toUpperCase().trim();
        return s === 'EFECTIVO' || s === 'TARJETA' ? s : null;
      };

      const { from, to } = getRangeFromQuery(req.query);
      if (!from || !to) return res.status(400).json({ mensaje: 'Rango inválido' });

      const buscar     = String(req.query.buscar || '').trim();
      const metodoPago = parseMetodoPago(req.query.metodoPago);
      const modoRaw    = String(req.query.modo || 'auto').toLowerCase();
      const modo       = ['auto', 'serie', 'mesa'].includes(modoRaw) ? modoRaw : 'auto';
      const buscarNum  = Number.isInteger(Number(buscar)) ? Number(buscar) : null;

      const andWhere = [
        { fechaPago: { gte: from } },
        { fechaPago: { lte: to   } },
      ];
      if (metodoPago) andWhere.push({ metodoPago: { equals: metodoPago } });

      if (buscar) {
        if (modo === 'mesa' || (modo === 'auto' && buscarNum !== null)) {
          andWhere.push({ orden: { is: { mesa: buscarNum ?? -999999 } } });
        } else {
          andWhere.push({
            OR: [
              { serie: { contains: buscar, mode: 'insensitive' } },
              { orden: { is: { codigo: { contains: buscar, mode: 'insensitive' } } } },
            ],
          });
        }
      }

      const rows = await prisma.ticketVenta.findMany({
        where: { AND: andWhere },
        include: { orden: { select: { id: true, codigo: true, mesa: true} } },
        orderBy: { fechaPago: 'desc' },
      });

      const data = rows.map(t => ({
        id: t.id,
        fecha: t.fechaPago,
        total: Number(t.totalAPagar || 0),
        metodoPago: String(t.metodoPago || ''),
        serie: (t.serie && t.serie.trim()) ? t.serie : (t.orden?.codigo || ''),
        mesaNumero: (typeof t.orden?.mesa === 'number') ? t.orden.mesa : null,
      }));

      res.json({
        ok: true,
        periodo: req.query.periodo || null,
        dia: req.query.dia || null,
        anio: req.query.anio || null,
        mes: req.query.mes || null,
        semana: req.query.semana || null,
        desde: req.query.desde || null,
        hasta: req.query.hasta || null,
        buscar,
        modo,
        metodoPago: metodoPago || 'TODOS',
        data,
      });
    } catch (err) {
      console.error('Reporte comprobantes error:', err);
      res.status(500).json({ mensaje: 'Error al generar comprobantes' });
    }
  });

  /* ====================================================================== */
  /* ============================ 3) TOP ================================== */
  /* ====================================================================== */
  async function buildTop({ tipo, periodo, criterio, desde, hasta, limit = 10 }) {
    const groupBy = periodo === 'semana' ? 'week' : (periodo === 'mes' ? 'month' : 'day');
    const { from, to } = parseRange({ desde, hasta });

    const whereTickets = {};
    if (from || to) whereTickets.fechaPago = {};
    if (from) whereTickets.fechaPago.gte = from;
    if (to)   whereTickets.fechaPago.lte = to;

    const tickets = await prisma.ticketVenta.findMany({
      where: whereTickets,
      select: { id: true, fechaPago: true, ordenId: true },
    });

    if (!tickets.length) return { topGlobal: [], ganadores: [], detallePorPeriodo: {} };

    const ordenIds = tickets.map(t => t.ordenId).filter(Boolean);
    if (!ordenIds.length) return { topGlobal: [], ganadores: [], detallePorPeriodo: {} };

    const items = await prisma.ordenItem.findMany({
      where: { ordenId: { in: ordenIds }, tipo },
      select: { nombre: true, precio: true, qty: true, subtotal: true, ordenId: true },
    });

    const fechaPorOrden = new Map();
    for (const t of tickets) fechaPorOrden.set(t.ordenId, t.fechaPago);

    const global = new Map();
    const periodDetail = new Map();

    for (const it of items) {
      const cantidad = Number(it.qty || 1);
      const ingreso  = it.subtotal != null ? Number(it.subtotal) : (Number(it.precio || 0) * cantidad);
      const pkey = groupKey(fechaPorOrden.get(it.ordenId), groupBy);

      const g = global.get(it.nombre) || { nombre: it.nombre, cantidad: 0, ingreso: 0 };
      g.cantidad += cantidad; g.ingreso += ingreso; global.set(it.nombre, g);

      const m = periodDetail.get(pkey) || new Map();
      const v = m.get(it.nombre) || { nombre: it.nombre, cantidad: 0, ingreso: 0 };
      v.cantidad += cantidad; v.ingreso += ingreso; m.set(it.nombre, v);
      periodDetail.set(pkey, m);
    }

    const sortFn = (a, b) => {
      if (criterio === 'ingreso') return b.ingreso - a.ingreso || b.cantidad - a.cantidad;
      return b.cantidad - a.cantidad || b.ingreso - a.ingreso;
    };

    const topGlobal = Array.from(global.values()).sort(sortFn).slice(0, limit);

    const ganadores = [];
    const detallePorPeriodo = {};
    for (const [pkey, m] of Array.from(periodDetail.entries()).sort((a,b)=> a[0].localeCompare(b[0]))) {
      const arr = Array.from(m.values()).sort(sortFn);
      ganadores.push({ periodo: pkey, ganador: arr[0] || null });
      detallePorPeriodo[pkey] = arr.slice(0, limit);
    }

    return { topGlobal, ganadores, detallePorPeriodo };
  }

  /* ========================= CATALOGOS: Productos ========================= */
  router.get('/catalogos/productos', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const tipo = String(req.query.tipo || '').toUpperCase(); // BEBIDA | PLATILLO | (vacío)
      const where = {};
      if (tipo === 'BEBIDA' || tipo === 'PLATILLO') where.tipo = tipo;

      const rows = await prisma.ordenItem.groupBy({
        by: ['tipo', 'nombre'],
        where,
        _sum: { qty: true },
      });

      const productos = rows
        .map(r => ({
          tipo: r.tipo,
          nombre: r.nombre,
          usados: Number(r._sum?.qty || 0),
        }))
        .sort((a, b) => b.usados - a.usados || a.nombre.localeCompare(b.nombre));

      res.json({ ok: true, productos });
    } catch (err) {
      console.error('[catalogos-productos][ERROR]', err);
      res.status(500).json({ ok: false, mensaje: 'Error al listar productos' });
    }
  });

// backend/src/routes/reportes.routes.js  (reemplaza la ruta /catalogos/empleados)

  /* ========================= CATALOGOS: Empleados ========================= */
  // Devuelve preparadores (COCINERO / BARTENDER) en el rango; filtra por tipo si se envía.
  router.get('/catalogos/empleados', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      const tipoQ = String(req.query.tipo || 'TODOS').toUpperCase(); // TODOS | PLATILLO | BEBIDA

      // Rango por fechaPago (tickets)
      const { from, to } = (() => {
        let f = null, t = null;
        if (desde) f = dayjs(desde + 'T00:00:00').toDate();
        if (hasta) t = dayjs(hasta + 'T23:59:59.999').toDate();
        return { from: f, to: t };
      })();

      const whereT = {};
      if (from || to) whereT.fechaPago = {};
      if (from) whereT.fechaPago.gte = from;
      if (to)   whereT.fechaPago.lte = to;

      // Traemos solo los ítems de las órdenes para hallar a los preparadores
      const tickets = await prisma.ticketVenta.findMany({
        where: whereT,
        select: {
          id: true,
          orden: {
            select: {
              items: {
                select: {
                  tipo: true,
                  chef: { select: { id: true, nombre: true } },
                  bartender: { select: { id: true, nombre: true } },
                }
              }
            }
          }
        }
      });

      const mapa = new Map(); // key: nombre lowercase -> { id, nombre, rol }
      for (const t of tickets) {
        const items = t?.orden?.items || [];
        for (const it of items) {
          const itTipo = String(it?.tipo || '').toUpperCase();
          if (tipoQ !== 'TODOS' && itTipo !== tipoQ) continue;

          if (itTipo === 'PLATILLO' && it?.chef?.nombre) {
            const key = it.chef.nombre.trim().toLowerCase();
            if (!mapa.has(key)) mapa.set(key, { id: it.chef.id ?? null, nombre: it.chef.nombre, rol: 'COCINERO' });
          }
          if (itTipo === 'BEBIDA' && it?.bartender?.nombre) {
            const key = it.bartender.nombre.trim().toLowerCase();
            if (!mapa.has(key)) mapa.set(key, { id: it.bartender.id ?? null, nombre: it.bartender.nombre, rol: 'BARTENDER' });
          }
        }
      }

      const empleados = Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
      res.json({ ok: true, empleados, rolesDisponibles: ['COCINERO', 'BARTENDER'] });
    } catch (err) {
      console.error('[catalogos-empleados][ERROR]', err);
      res.status(500).json({ ok: false, mensaje: 'Error al listar empleados' });
    }
  });


  router.get('/top', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const tipo     = (req.query.tipo || 'PLATILLO').toUpperCase();
      const periodo  = String(req.query.periodo || 'dia').toLowerCase();
      const criterio = String(req.query.criterio || 'cantidad').toLowerCase();
      const limit    = Math.max(1, Math.min(50, Number(req.query.limit || 10)));

      const { topGlobal, ganadores, detallePorPeriodo } = await buildTop({
        tipo, periodo, criterio, desde: req.query.desde, hasta: req.query.hasta, limit
      });

      res.json({
        tipo, periodo, criterio,
        desde: req.query.desde || null,
        hasta: req.query.hasta || null,
        topGlobal,
        ganadoresPorPeriodo: ganadores,
        detallePorPeriodo
      });
    } catch (err) {
      console.error('Reporte top error:', err);
      res.status(500).json({ mensaje: 'Error al generar reporte top' });
    }
  });

/* ========================= EXPORT: TOP (Excel) ========================= */
router.get('/top/export/excel', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const tipo     = (req.query.tipo || 'PLATILLO').toUpperCase();
    const periodo  = String(req.query.periodo || 'dia').toLowerCase();
    const criterio = String(req.query.criterio || 'cantidad').toLowerCase();
    const limit    = Math.max(1, Math.min(50, Number(req.query.limit || 10)));

    const { topGlobal, ganadores } = await buildTop({
      tipo, periodo, criterio, desde: req.query.desde, hasta: req.query.hasta, limit
    });

    const ganGlobal = topGlobal[0] || null;

    const XL_COLORS = { headDark:'111827', headText:'FFFFFF', zebra1:'FFFFFF', zebra2:'FAFAFA', border:'E5E7EB', text:'111827' };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Top ${tipo === 'BEBIDA' ? 'Bebidas' : 'Platillos'}`);

    // Header helper
    function excelHeaderBlock(ws, { title, lines = [] }) {
      ws.mergeCells('A1:C1');
      const t = ws.getCell('A1');
      t.value = title;
      t.font = { bold: true, size: 20, color: { argb: XL_COLORS.text } };
      lines.forEach((line, i) => {
        ws.mergeCells(2 + i, 1, 2 + i, 3);
        const c = ws.getCell(2 + i, 1);
        c.value = line;
        c.font = { size: 11, color: { argb: '374151' } };
      });
      return 6;
    }
    function excelStyleHeaderRowDark(row) {
      row.font = { bold: true, color: { argb: XL_COLORS.headText } };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.height = 20;
      row.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.headDark } };
        c.border = { top:{style:'thin',color:{argb:XL_COLORS.border}}, bottom:{style:'thin',color:{argb:XL_COLORS.border}} };
      });
    }
    function excelZebra(ws, fromRow, toRow, cols) {
      for (let r = fromRow; r <= toRow; r++) {
        const fill = (r - fromRow) % 2 === 0 ? XL_COLORS.zebra1 : XL_COLORS.zebra2;
        for (let c = 1; c <= cols; c++) {
          ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
    }

    const mainTitle = `Top ${tipo === 'BEBIDA' ? 'Bebidas' : 'Platillos'}`;
    excelHeaderBlock(ws, {
      title: mainTitle,
      lines: [
        `Periodo: ${periodo.toUpperCase()}   |   Criterio: ${criterio.toUpperCase()}   |   Top: ${limit}`,
        `${process.env.APP_RESTAURANT_NAME || 'Restaurante Morales'}`,
        `${process.env.APP_RESTAURANT_CITY || 'Morales, Izabal'}`,
        `Desde: ${req.query.desde || '-'}   Hasta: ${req.query.hasta || '-'}`,
        ganGlobal ? `Ganador global: ${ganGlobal.nombre} — Cant.: ${ganGlobal.cantidad}  |  Ingreso: Q ${ganGlobal.ingreso.toFixed(2)}` : 'Ganador global: —' // <<<<<<<<<<
      ],
    });

    // Tabla Top Global
    const TABLE_HEADER_ROW = 6;
    ws.columns = [
      { key: 'nombre',   width: 42, style: { alignment: { horizontal: 'left'  } } },
      { key: 'cantidad', width: 14, style: { alignment: { horizontal: 'right' } } },
      { key: 'ingreso',  width: 16, style: { alignment: { horizontal: 'right' } } },
    ];
    ws.getRow(TABLE_HEADER_ROW).values = ['Nombre', 'Cantidad', 'Ingreso'];
    excelStyleHeaderRowDark(ws.getRow(TABLE_HEADER_ROW));
    const firstDataRow = TABLE_HEADER_ROW + 1;
    topGlobal.forEach(r => ws.addRow([r.nombre, r.cantidad, r.ingreso]));
    ws.getColumn(2).numFmt = '#,##0';
    ws.getColumn(3).numFmt = '"Q" #,##0.00';
    if (ws.lastRow.number >= firstDataRow) excelZebra(ws, firstDataRow, ws.lastRow.number, 3);

    // Espacio y "Ganador por período"
    let r0 = ws.lastRow.number + 2;
    ws.mergeCells(r0, 1, r0, 3);
    ws.getCell(r0, 1).value = `Ganador por ${periodo}`;
    ws.getCell(r0, 1).font = { bold: true, size: 12, color: { argb: XL_COLORS.text } };

    ws.getRow(r0 + 1).values = ['Período', 'Nombre (cant.)', 'Ingreso'];
    excelStyleHeaderRowDark(ws.getRow(r0 + 1));

    ganadores.forEach(g => {
      const nombreCant = g.ganador ? `${g.ganador.nombre} (${g.ganador.cantidad})` : '—';
      const ingreso    = g.ganador ? g.ganador.ingreso : 0;
      ws.addRow([g.periodo, nombreCant, ingreso]);
    });
    ws.getColumn(3).numFmt = '"Q" #,##0.00';
    const gpFirst = r0 + 2;
    if (ws.lastRow.number >= gpFirst) excelZebra(ws, gpFirst, ws.lastRow.number, 3);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=top_${tipo.toLowerCase()}_${periodo}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel top error:', err);
    res.status(500).json({ mensaje: 'Error al exportar Excel (top)' });
  }
});


  /* ========================= EXPORT: TOP (PDF) ========================= */
  router.get('/top/export/pdf', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const tipo     = (req.query.tipo || 'PLATILLO').toUpperCase();
      const periodo  = String(req.query.periodo || 'dia').toLowerCase();
      const criterio = String(req.query.criterio || 'cantidad').toLowerCase();
      const limit    = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
      const R_NAME   = process.env.APP_RESTAURANT_NAME || 'Restaurante Morales';
      const R_CITY   = process.env.APP_RESTAURANT_CITY || 'Morales, Izabal';
      const LOGO     = resolveLogoPath();

      const { topGlobal, ganadores } = await buildTop({
        tipo, periodo, criterio, desde: req.query.desde, hasta: req.query.hasta, limit
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=top_${tipo.toLowerCase()}_${periodo}.pdf`);

      const doc = new PDFDocument({ size:'LETTER', layout:'portrait', margins:{ top:40, bottom:40, left:50, right:50 } });
      doc.pipe(res);

      const left  = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      if (LOGO) { try { doc.image(LOGO, right - 44, 34, { width: 44 }); } catch {} }

      const titulo = `Top ${tipo === 'BEBIDA' ? 'Bebidas' : 'Platillos'}`;
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(titulo, left, 40);
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('#374151')
         .text(`Periodo: ${periodo.toUpperCase()}  |  Criterio: ${criterio.toUpperCase()}  |  Top: ${limit}`);
      doc.fontSize(10).fillColor('#6B7280').text(`${R_NAME} • ${R_CITY}`);
      doc.fontSize(10).fillColor('#374151').text(`Desde: ${req.query.desde || '-'}  |  Hasta: ${req.query.hasta || '-'}`);
      doc.moveDown(0.6);

      const PAD = 10;
      const headerH = 24;
      const rowH = 22;
      const colW = [Math.floor(contentW*0.56), Math.floor(contentW*0.18), contentW - Math.floor(contentW*0.56) - Math.floor(contentW*0.18)];
      const zebra = ['#FFFFFF', '#FAFAFA'];

      function drawTopHeader(startY) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Top global', left, startY);
        const tableY = doc.y + 6;
        doc.save().rect(left, tableY, contentW, headerH).fill('#F3F4F6').restore();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
        ['Nombre','Cantidad','Ingreso'].forEach((h,i)=>{
          const cx = left + colW.slice(0,i).reduce((a,b)=>a+b,0) + PAD;
          doc.text(h, cx, tableY + 5, { width: colW[i] - PAD * 2, align: i === 0 ? 'left' : 'right' });
        });
        return tableY + headerH;
      }
      function ensureSpace(nextBlockHeight) {
        const available = doc.page.height - doc.page.margins.bottom - 24;
        if (doc.y + nextBlockHeight > available) {
          doc.addPage({ size:'LETTER', layout:'portrait', margins: doc.page.margins });
        }
      }

      let y = drawTopHeader(doc.y);
      doc.font('Helvetica').fontSize(10);
      if (!topGlobal.length) {
        doc.text('Sin datos.', left + PAD, y + 6); y += rowH;
      } else {
        for (let i = 0; i < Math.min(limit, topGlobal.length); i++) {
          ensureSpace(rowH);
          const r = topGlobal[i];
          doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();
          const cells = [r.nombre, r.cantidad.toLocaleString('es-GT'), asGTQ(r.ingreso)];
          cells.forEach((txt, idx) => {
            const cx = left + colW.slice(0,idx).reduce((a,b)=>a+b,0) + PAD;
            doc.fillColor('#111827').text(String(txt), cx, y + 5, { width: colW[idx] - PAD * 2, align: idx === 0 ? 'left' : 'right' });
          });
          y += rowH;
        }
      }

      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(`Ganador por ${periodo}`);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      ganadores.forEach(g => {
        const txt = g.ganador ? `${g.periodo}: ${g.ganador.nombre} (${g.ganador.cantidad}) — ${asGTQ(g.ganador.ingreso)}` : `${g.periodo}: —`;
        doc.text(txt);
      });

      doc.end();
    } catch (err) {
      console.error('PDF top error:', err);
      res.status(500).json({ mensaje: 'Error al exportar PDF (top)' });
    }
  });

 // Helpers de tiempos
function durMsToHMS(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function resolveStartEnd(orden, ticket) {
  const start =
    orden?.fecha ||
    (ticket?.fechaPago ? new Date(new Date(ticket.fechaPago).getTime() - 60 * 1000) : null);
  const end =
    orden?.finishedAt ||
    ticket?.fechaPago ||
    null;
  return { start, end };
}
function itemPrepMs(it) {
  const a = it?.preparandoEn;          // 👈 SOLO desde que tocaron Iniciar
  const f = it?.finalizadoEn || null;  // 👈 hasta Listo
  if (!a || !f) return 0;
  return Math.max(0, new Date(f) - new Date(a));
}
// helper rango “fin”
function inRangeByEnd(dt, from, to) {
  if (!from && !to) return true;
  if (!dt) return false;
  const d = new Date(dt);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function buildMetricsFromRows(rows) {
  const durs = (rows || []).map(r => Number(r.duracionMs || 0)).filter(n => n > 0);
  if (!durs.length) return {
    count: rows?.length || 0, avgMs: 0, maxMs: 0,
    avgHMS: '00:00:00',  maxHMS: '00:00:00'
  };
  const sum = durs.reduce((a,b)=>a+b,0);
  const avg = sum / durs.length;
  const max = Math.max(...durs);
  return {
    count: rows.length,
    avgMs: avg, maxMs: max,
    avgHMS: durMsToHMS(avg), maxHMS: durMsToHMS(max)
  };
}

/**
 * getTiemposData: función reutilizable para /tiempos + exports
 * niveles: 'orden' (por orden), 'item' (agregado por nombre), 'staff' (agregado por staff),
 *          'itemDetalle' (UNA FILA POR ÍTEM preparado: iniciada → finalizada)
 *
 * ⬅️ AHORA EL RANGO SE APLICA POR LA FECHA **FIN** QUE SE MUESTRA EN LA TABLA.
 */
async function getTiemposData(prisma, qs) {
  const nivel = ['orden','item','staff','itemDetalle'].includes(String(qs.nivel)) ? String(qs.nivel) : 'orden';
  const tipo  = ['PLATILLO','BEBIDA','TODOS'].includes(String(qs.tipo || '').toUpperCase())
    ? String(qs.tipo).toUpperCase() : 'TODOS';
  const qStaff = String(qs.qStaff || '').trim().toLowerCase();
  const qItem  = String(qs.qItem  || '').trim().toLowerCase();
  const itemExact = String(qs.item || '').trim().toLowerCase();

  const { from, to } = parseRange(qs);
  const dateRange = {};
  if (from) dateRange.gte = from;
  if (to)   dateRange.lte = to;

  // Trae tickets acotando por cualquiera de estas fechas:
  //  - algun item.finalizadoEn en rango
  //  - orden.finishedAt en rango
  //  - ticket.fechaPago en rango (fallback)
  const whereTickets = {};
  if (from || to) {
    whereTickets.OR = [
      { orden: { items: { some: { finalizadoEn: dateRange } } } },
      { orden: { finishedAt: dateRange } },
      { fechaPago: dateRange },
    ];
  }

  const tickets = await prisma.ticketVenta.findMany({
    where: whereTickets,
    select: {
      id: true, fechaPago: true,
      orden: {
        select: {
          id: true, codigo: true, mesa: true,
          fecha: true, finishedAt: true,
          mesero: { select: { id: true, nombre: true, rolId: true } },
          items: {
            select: {
              tipo: true,
              nombre: true,
              qty: true,
              asignadoEn: true,
              preparandoEn: true,
              finalizadoEn: true,
              creadoEn: true,
              chef: { select: { id: true, nombre: true } },
              bartender: { select: { id: true, nombre: true } },
            }
          }
        }
      }
    },
    orderBy: { fechaPago: 'asc' }
  });

  // ===================== NIVEL: ORDEN =====================
  if (nivel === 'orden') {
    const rows = [];
    for (const t of tickets) {
      const o = t.orden || {};
      const { start, end } = resolveStartEnd(o, t);

      // ⬅️ Rango por FIN de la orden
      if (!inRangeByEnd(end, from, to)) continue;

      const staffName = o?.mesero?.nombre || '';
      if (qStaff && !staffName.toLowerCase().includes(qStaff)) continue;

      const itemsArr = Array.isArray(o.items) ? o.items : [];
      const hasItemContains = qItem ? itemsArr.some(it => String(it.nombre||'').toLowerCase().includes(qItem)) : true;
      const hasItemExact    = itemExact ? itemsArr.some(it => String(it.nombre||'').toLowerCase() === itemExact) : true;
      if (!hasItemContains || !hasItemExact) continue;

      const ms = (start && end) ? (new Date(end) - new Date(start)) : 0;
      const itemsCount = itemsArr.reduce((a, it) => a + Number(it.qty || 1), 0);

      rows.push({
        ordenId: o.id || null,
        codigo: o.codigo || '',
        mesa: typeof o.mesa === 'number' ? o.mesa : null,
        inicio: start,
        fin: end,
        duracionMs: ms,
        duracionHMS: durMsToHMS(ms),
        items: itemsCount,
        atendidoPor: staffName || null
      });
    }
    rows.sort((a,b)=> new Date(b.fin || 0) - new Date(a.fin || 0));
    const metrics = buildMetricsFromRows(rows);
    return { ok: true, nivel, rows, metrics };
  }

  // ======================= item/staff agregados =======================
  const buckets = new Map();
  function ensureBucket(key, init) {
    if (!buckets.has(key)) {
      buckets.set(key, {
        orderIds: new Set(),
        countOrders: 0,
        totalMsOrden: 0,
        itemsTotales: 0,
        totalMsItem: 0,
        ...init,
      });
    }
    return buckets.get(key);
  }

  for (const t of tickets) {
    const o = t.orden || {};
    const { start, end } = resolveStartEnd(o, t);
    const msOrden = (start && end) ? (new Date(end) - new Date(start)) : 0;

    const itemsArr = Array.isArray(o.items) ? o.items : [];

    if (nivel === 'item' || nivel === 'staff') {
      for (const it of itemsArr) {
        const itTipo = String(it.tipo || 'OTRO').toUpperCase();
        if (tipo !== 'TODOS' && itTipo !== tipo) continue;

        const finIt = it?.finalizadoEn || null;
        // ⬅️ Solo consideramos ítems cuya fecha FIN cae en el rango
        if (!inRangeByEnd(finIt, from, to)) continue;

        const nameLc = String(it.nombre || '').toLowerCase();
        if (qItem && !nameLc.includes(qItem)) continue;
        if (itemExact && nameLc !== itemExact) continue;

        const qty = Math.max(1, Number(it.qty || 1));
        const msItem = itemPrepMs(it);

        if (nivel === 'item') {
          const key = `${itTipo}::${it.nombre}`;
          const b = ensureBucket(key, { tipo: itTipo, nombre: it.nombre });
          if (!b.orderIds.has(o.id)) {
            b.orderIds.add(o.id);
            b.countOrders += 1;
            b.totalMsOrden += msOrden;
          }
          b.itemsTotales += qty;
          b.totalMsItem += (msItem * qty);
        } else {
          const resp =
            itTipo === 'PLATILLO' ? (it.chef?.nombre || '')
            : itTipo === 'BEBIDA' ? (it.bartender?.nombre || '')
            : '';
          if (!resp) continue;
          if (qStaff && !resp.toLowerCase().includes(qStaff)) continue;

          const tipoKey = (tipo === 'TODOS') ? 'TODOS' : itTipo;
          const key = `${resp}::${tipoKey}`;
          const b = ensureBucket(key, { staff: resp, tipo: tipoKey });
          if (!b.orderIds.has(o.id)) {
            b.orderIds.add(o.id);
            b.countOrders += 1;
            b.totalMsOrden += msOrden;
          }
          b.itemsTotales += qty;
          b.totalMsItem += (msItem * qty);
        }
      }
    }
  }

  if (nivel === 'item') {
    const rows = Array.from(buckets.values()).map(b => ({
      tipo: b.tipo,
      nombre: b.nombre,
      ordenes: b.countOrders,
      itemsTotales: b.itemsTotales,
      avgMsOrden: b.countOrders ? (b.totalMsOrden / b.countOrders) : 0,
      avgHMSOrden: durMsToHMS(b.countOrders ? (b.totalMsOrden / b.countOrders) : 0),
      avgMsItem: b.itemsTotales ? (b.totalMsItem / b.itemsTotales) : 0,
      avgHMSItem: durMsToHMS(b.itemsTotales ? (b.totalMsItem / b.itemsTotales) : 0),
    })).sort((a,b)=> (b.itemsTotales - a.itemsTotales) || a.nombre.localeCompare(b.nombre));

    return { ok: true, nivel, tipo, rows, metrics: { count: rows.length, avgMs:0, maxMs:0, avgHMS:'00:00:00', maxHMS:'00:00:00' } };
  }

  if (nivel === 'staff') {
    const rows = Array.from(buckets.values()).map(b => ({
      staff: b.staff,
      tipo: b.tipo,
      ordenes: b.countOrders,
      itemsTotales: b.itemsTotales,
      avgMsOrden: b.countOrders ? (b.totalMsOrden / b.countOrders) : 0,
      avgHMSOrden: durMsToHMS(b.countOrders ? (b.totalMsOrden / b.countOrders) : 0),
      avgMsItem: b.itemsTotales ? (b.totalMsItem / b.itemsTotales) : 0,
      avgHMSItem: durMsToHMS(b.itemsTotales ? (b.totalMsItem / b.itemsTotales) : 0),
    })).sort((a,b)=> (b.ordenes - a.ordenes) || a.staff.localeCompare(b.staff));

    return { ok: true, nivel, tipo, rows, metrics: { count: rows.length, avgMs:0, maxMs:0, avgHMS:'00:00:00', maxHMS:'00:00:00' } };
  }

  // ======================= itemDetalle (una fila por ítem) =======================
  const rows = [];
  for (const t of tickets) {
    const o = t.orden || {};
    const itemsArr = Array.isArray(o.items) ? o.items : [];
    for (const it of itemsArr) {
      const itTipo = String(it.tipo || 'OTRO').toUpperCase();
      if (tipo !== 'TODOS' && itTipo !== tipo) continue;

      const name = String(it.nombre || '');
      const nameLc = name.toLowerCase();
      if (qItem && !nameLc.includes(qItem)) continue;
      if (itemExact && nameLc !== itemExact) continue;

      const staff =
        itTipo === 'PLATILLO' ? (it.chef?.nombre || '')
        : itTipo === 'BEBIDA' ? (it.bartender?.nombre || '')
        : '';
      const staffRol = itTipo === 'PLATILLO' ? 'COCINERO' : (itTipo === 'BEBIDA' ? 'BARTENDER' : '');

      if (qStaff && staff && !staff.toLowerCase().includes(qStaff)) continue;

      const inicio = it?.preparandoEn || null; // Iniciar
      const fin    = it?.finalizadoEn || null; // Listo

      // ⬅️ Rango por FIN del ítem
      if (!inRangeByEnd(fin, from, to)) continue;

      const ms     = (inicio && fin) ? (new Date(fin) - new Date(inicio)) : 0;
      const qty = Math.max(1, Number(it.qty || 1));
      for (let i = 0; i < qty; i++) {
        rows.push({
          ordenId: o.id || null,
          codigo: o.codigo || '',
          mesa: (typeof o.mesa === 'number') ? o.mesa : null,
          tipo: itTipo,
          item: name,
          staff: staff || '',
          staffRol,
          inicio,
          fin,
          duracionMs: ms,
          duracionHMS: durMsToHMS(ms),
        });
      }
    }
  }
  rows.sort((a,b)=> new Date(b.fin || 0) - new Date(a.fin || 0));
  const metrics = buildMetricsFromRows(rows);
  return { ok: true, nivel, tipo, rows, metrics };
}

// Datos para UI
router.get('/tiempos', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const data = await getTiemposData(prisma, req.query);
    res.json(data);
  } catch (err) {
    console.error('[tiempos][ERROR]', err);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte de tiempos' });
  }
});

// ===== Excel tiempos
router.get('/tiempos/export/excel', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const data = await getTiemposData(prisma, req.query);
    if (!data || !data.ok) throw new Error('No se pudo generar datos');

    const XL_COLORS = { headDark:'111827', headText:'FFFFFF', zebra1:'FFFFFF', zebra2:'FAFAFA', border:'E5E7EB', text:'111827' };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tiempos');

    function excelHeaderBlock(ws, { title, lines = [] }) {
      ws.mergeCells('A1:H1');
      const t = ws.getCell('A1');
      t.value = title;
      t.font = { bold: true, size: 20, color: { argb: XL_COLORS.text } };
      lines.forEach((line, i) => {
        ws.mergeCells(2 + i, 1, 2 + i, 8);
        const c = ws.getCell(2 + i, 1);
        c.value = line;
        c.font = { size: 11, color: { argb: '374151' } };
      });
      return 6;
    }
    function excelStyleHeaderRowDark(row) {
      row.font = { bold: true, color: { argb: XL_COLORS.headText } };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.height = 20;
      row.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLORS.headDark } };
        c.border = { top:{style:'thin',color:{argb:XL_COLORS.border}}, bottom:{style:'thin',color:{argb:XL_COLORS.border}} };
      });
    }
    function excelZebra(ws, fromRow, toRow, cols) {
      for (let r = fromRow; r <= toRow; r++) {
        const fill = (r - fromRow) % 2 === 0 ? XL_COLORS.zebra1 : XL_COLORS.zebra2;
        for (let c = 1; c <= cols; c++) {
          ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
    }

    const nivel = String(req.query.nivel || 'orden');
    excelHeaderBlock(ws, {
      title: `Tiempos de preparación`,
      lines: [
        `${process.env.APP_RESTAURANT_NAME || 'Restaurante Morales'}`,
        `${process.env.APP_RESTAURANT_CITY || 'Morales, Izabal'}`,
        `Nivel: ${nivel.toUpperCase()}   |   Desde: ${req.query.desde || '-'}   Hasta: ${req.query.hasta || '-'}`,
        data?.metrics ? `Promedio: ${data.metrics.avgHMS}   Máximo: ${data.metrics.maxHMS}` : ''
      ]
    });

    const R = 6;
    if (nivel === 'orden') {
      ws.columns = [
        { key:'codigo', width:16 }, { key:'mesa', width:10, style:{ alignment:{ horizontal:'center' } } },
        { key:'inicio', width:22 }, { key:'fin', width:22 },
        { key:'dur', width:12, style:{ alignment:{ horizontal:'right' } } },
        { key:'items', width:10, style:{ alignment:{ horizontal:'right' } } },
        { key:'staff', width:26 },
      ];
      ws.getRow(R).values = ['Código','Mesa','Inicio','Fin','Duración','Ítems','Atendido por'];
      excelStyleHeaderRowDark(ws.getRow(R));
      const first = R+1;
      for (const r of data.rows) {
        ws.addRow([
          r.codigo || '',
          r.mesa ?? '',
          r.inicio ? dayjs(r.inicio).format('YYYY-MM-DD HH:mm:ss') : '',
          r.fin ? dayjs(r.fin).format('YYYY-MM-DD HH:mm:ss') : '',
          r.duracionHMS,
          r.items,
          r.atendidoPor || ''
        ]);
      }
      if (ws.lastRow.number >= first) excelZebra(ws, first, ws.lastRow.number, 7);
    } else if (nivel === 'item') {
      ws.columns = [
        { key:'tipo', width:12 }, { key:'nombre', width:40 },
        { key:'ordenes', width:12, style:{ alignment:{ horizontal:'right' } } },
        { key:'itemsTotales', width:14, style:{ alignment:{ horizontal:'right' } } },
        { key:'avgHMSOrden', width:14, style:{ alignment:{ horizontal:'right' } } },
        { key:'avgHMSItem', width:14, style:{ alignment:{ horizontal:'right' } } },
      ];
      ws.getRow(R).values = ['Tipo','Nombre','# Órdenes','Ítems totales','Prom. por orden','Prom. por ítem'];
      excelStyleHeaderRowDark(ws.getRow(R));
      const first = R+1;
      data.rows.forEach(r => ws.addRow([r.tipo, r.nombre, r.ordenes, r.itemsTotales, r.avgHMSOrden, r.avgHMSItem]));
      if (ws.lastRow.number >= first) excelZebra(ws, first, ws.lastRow.number, 6);
    } else if (nivel === 'staff') {
      ws.columns = [
        { key:'staff', width:28 }, { key:'tipo', width:12 },
        { key:'ordenes', width:12, style:{ alignment:{ horizontal:'right' } } },
        { key:'itemsTotales', width:14, style:{ alignment:{ horizontal:'right' } } },
        { key:'avgHMSOrden', width:14, style:{ alignment:{ horizontal:'right' } } },
        { key:'avgHMSItem', width:14, style:{ alignment:{ horizontal:'right' } } },
      ];
      ws.getRow(R).values = ['Staff','Tipo','# Órdenes','Ítems totales','Prom. por orden','Prom. por ítem'];
      excelStyleHeaderRowDark(ws.getRow(R));
      const first = R+1;
      data.rows.forEach(r => ws.addRow([r.staff, r.tipo, r.ordenes, r.itemsTotales, r.avgHMSOrden, r.avgHMSItem]));
      if (ws.lastRow.number >= first) excelZebra(ws, first, ws.lastRow.number, 6);
    } else {
      ws.columns = [
        { key:'codigo', width:16 },
        { key:'mesa', width:8, style:{ alignment:{ horizontal:'center' } } },
        { key:'tipo', width:12 },
        { key:'item', width:32 },
        { key:'staff', width:24 },
        { key:'inicio', width:20 },
        { key:'fin', width:20 },
        { key:'dur', width:12, style:{ alignment:{ horizontal:'right' } } },
      ];
      ws.getRow(R).values = ['Código','Mesa','Tipo','Ítem','Staff','Inicio','Fin','Duración'];
      excelStyleHeaderRowDark(ws.getRow(R));
      const first = R+1;
      for (const r of data.rows) {
        ws.addRow([
          r.codigo || '',
          r.mesa ?? '',
          r.tipo || '',
          r.item || '',
          r.staff || '',
          r.inicio ? dayjs(r.inicio).format('YYYY-MM-DD HH:mm:ss') : '',
          r.fin ? dayjs(r.fin).format('YYYY-MM-DD HH:mm:ss') : '',
          r.duracionHMS
        ]);
      }
      if (ws.lastRow.number >= first) excelZebra(ws, first, ws.lastRow.number, 8);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=tiempos_${String(req.query.nivel || 'orden')}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[excel tiempos][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al exportar Excel (tiempos)' });
  }
});

// ===== PDF tiempos
router.get('/tiempos/export/pdf', auth, requirePerm('REPORTES_VER'), async (req, res) => {
  try {
    const data = await getTiemposData(prisma, req.query);
    if (!data || !data.ok) throw new Error('No se pudo generar datos');

    const nivel  = String(req.query.nivel || 'orden');
    const LOGO   = resolveLogoPath();
    const R_NAME = process.env.APP_RESTAURANT_NAME || 'Restaurante Morales';
    const R_CITY = process.env.APP_RESTAURANT_CITY || 'Morales, Izabal';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=tiempos_${nivel}.pdf`);

    // Hoja horizontal
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 50, right: 50 }
    });
    doc.pipe(res);

    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    if (LOGO) { try { doc.image(LOGO, right - 44, 34, { width: 44 }); } catch {} }

    // ---- Título
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827')
      .text('Tiempos de preparación', left, 40);

    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`${R_NAME} • ${R_CITY}`);
    doc.font('Helvetica').fontSize(10).fillColor('#6B7280')
       .text(`Desde: ${req.query.desde || '-'}  |  Hasta: ${req.query.hasta || '-'}`);
    if (data?.metrics) {
      doc.font('Helvetica').fontSize(10).fillColor('#374151')
         .text(`Promedio: ${data.metrics.avgHMS}   Máximo: ${data.metrics.maxHMS}`);
    }
    doc.moveDown(0.6);

    const PAD = 10;
    const headerH = 24;
    let rowH = 22;
    const zebra = ['#FFFFFF', '#FAFAFA'];

    function drawHeader(cols, startY) {
      doc.save().rect(left, startY, contentW, headerH).fill('#111827').restore();
      let x = left + PAD;
      cols.forEach((c) => {
        let fs = 10;
        doc.font('Helvetica-Bold');
        while (fs > 7 && doc.widthOfString(c.t, { size: fs }) > (c.w - PAD * 2)) fs -= 0.5;
        doc.fontSize(fs).fillColor('#FFFFFF').text(c.t, x, startY + 6, {
          width: c.w - PAD * 2,
          align: c.align || 'left',
          lineBreak: false
        });
        x += c.w;
      });
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      return { y: startY + headerH };
    }
    function ensure(nextBlockHeight, colsDef) {
      const available = doc.page.height - doc.page.margins.bottom - 24;
      if (doc.y + nextBlockHeight > available) {
        doc.addPage({ size: 'LETTER', layout: 'landscape', margins: doc.page.margins });
        const widths = colsDef.map(c => Math.floor(c.p * (doc.page.width - doc.page.margins.left - doc.page.margins.right)));
        const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));
        return drawHeader(cols, doc.y);
      }
      return null;
    }

    if (nivel === 'orden') {
      const colsDef = [
        { t: 'Código',   p: 0.16 },
        { t: 'Mesa',     p: 0.10, align: 'center' },
        { t: 'Inicio',   p: 0.20 },
        { t: 'Fin',      p: 0.20 },
        { t: 'Duración', p: 0.14, align: 'right' },
        { t: 'Ítems',    p: 0.08, align: 'right' },
        { t: 'Empleado', p: 0.12 },
      ];
      const widths = colsDef.map(c => Math.floor(c.p * contentW));
      const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));

      let hdr = drawHeader(cols, doc.y);
      let y = hdr.y;

      rowH = 20;
      doc.font('Helvetica').fontSize(9).fillColor('#111827');

      for (let i = 0; i < data.rows.length; i++) {
        const r = data.rows[i];
        const maybeHdr = ensure(rowH, colsDef);
        if (maybeHdr) { hdr = maybeHdr; y = hdr.y; }

        doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();
        const values = [
          r.codigo || '',
          r.mesa ?? '',
          r.inicio ? dayjs(r.inicio).format('YYYY-MM-DD HH:mm') : '',
          r.fin ? dayjs(r.fin).format('YYYY-MM-DD HH:mm') : '',
          r.duracionHMS,
          String(r.items),
          r.atendidoPor || ''
        ];
        let x = left + PAD;
        cols.forEach((c, idx) => {
          doc.text(values[idx], x, y + 4, {
            width: c.w - PAD * 2,
            align: c.align || 'left',
            lineBreak: false
          });
          x += c.w;
        });
        y += rowH;
      }
    } else if (nivel === 'item') {
      const colsDef = [
        { t: 'Tipo',          p: 0.12 },
        { t: 'Nombre',        p: 0.38 },
        { t: '# Órdenes',     p: 0.14, align: 'right' },
        { t: 'Ítems totales', p: 0.14, align: 'right' },
        { t: 'Prom. orden',   p: 0.11, align: 'right' },
        { t: 'Prom. ítem',    p: 0.11, align: 'right' },
      ];
      const widths = colsDef.map(c => Math.floor(c.p * contentW));
      const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));

      let hdr = drawHeader(cols, doc.y);
      let y = hdr.y;

      rowH = 20;
      doc.font('Helvetica').fontSize(9).fillColor('#111827');

      for (let i = 0; i < data.rows.length; i++) {
        const r = data.rows[i];
        const maybeHdr = ensure(rowH, colsDef);
        if (maybeHdr) { hdr = maybeHdr; y = hdr.y; }

        doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();
        const values = [r.tipo, r.nombre, String(r.ordenes), String(r.itemsTotales), r.avgHMSOrden, r.avgHMSItem];
        let x = left + PAD;
        cols.forEach((c, idx) => {
          doc.text(values[idx], x, y + 4, {
            width: c.w - PAD * 2,
            align: c.align || 'left',
            lineBreak: false
          });
          x += c.w;
        });
        y += rowH;
      }
    } else if (nivel === 'staff') {
      const colsDef = [
        { t: 'Empleado', p: 0.32 },
        { t: 'Tipo',     p: 0.12 },
        { t: '# Órdenes', p: 0.14, align: 'right' },
        { t: 'Ítems totales', p: 0.14, align: 'right' },
        { t: 'Prom. orden',   p: 0.14, align: 'right' },
        { t: 'Prom. ítem',    p: 0.14, align: 'right' },
      ];
      const widths = colsDef.map(c => Math.floor(c.p * contentW));
      const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));

      let hdr = drawHeader(cols, doc.y);
      let y = hdr.y;

      rowH = 20;
      doc.font('Helvetica').fontSize(9).fillColor('#111827');

      for (let i = 0; i < data.rows.length; i++) {
        const r = data.rows[i];
        const maybeHdr = ensure(rowH, colsDef);
        if (maybeHdr) { hdr = maybeHdr; y = hdr.y; }

        doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();
        const values = [r.staff, r.tipo, String(r.ordenes), String(r.itemsTotales), r.avgHMSOrden, r.avgHMSItem];
        let x = left + PAD;
        cols.forEach((c, idx) => {
          doc.text(values[idx], x, y + 4, {
            width: c.w - PAD * 2,
            align: c.align || 'left',
            lineBreak: false
          });
          x += c.w;
        });
        y += rowH;
      }
    } else {
      const colsDef = [
        { t: 'Código',   p: 0.10 },
        { t: 'Mesa',     p: 0.08,  align: 'center' },
        { t: 'Tipo',     p: 0.10 },
        { t: 'Ítem',     p: 0.19 },
        { t: 'Empleado', p: 0.15 },
        { t: 'Inicio',   p: 0.14 },
        { t: 'Fin',      p: 0.14 },
        { t: 'Duración', p: 0.10,  align: 'right' },
      ];
      const widths = colsDef.map(c => Math.floor(c.p * contentW));
      const cols = colsDef.map((c, i) => ({ ...c, w: widths[i] }));

      let hdr = drawHeader(cols, doc.y);
      let y = hdr.y;

      rowH = 20;
      doc.font('Helvetica').fontSize(9).fillColor('#111827');

      for (let i = 0; i < data.rows.length; i++) {
        const r = data.rows[i];
        const maybeHdr = ensure(rowH, colsDef);
        if (maybeHdr) { hdr = maybeHdr; y = hdr.y; }

        doc.save().rect(left, y, contentW, rowH).fill(zebra[i % 2]).restore();

        const values = [
          r.codigo || '',
          r.mesa ?? '',
          r.tipo || '',
          r.item || '',
          r.staff || '',
          r.inicio ? dayjs(r.inicio).format('YYYY-MM-DD HH:mm') : '',
          r.fin ? dayjs(r.fin).format('YYYY-MM-DD HH:mm') : '',
          r.duracionHMS
        ];

        let x = left + PAD;
        cols.forEach((c, idx) => {
          doc.text(values[idx], x, y + 4, {
            width: c.w - PAD * 2,
            align: c.align || 'left',
            lineBreak: false
          });
          x += c.w;
        });
        y += rowH;
      }
    }

    doc.end();
  } catch (err) {
    console.error('[pdf tiempos][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al exportar PDF (tiempos)' });
  }
});
  /* ====================================================================== */
  return router;
};
