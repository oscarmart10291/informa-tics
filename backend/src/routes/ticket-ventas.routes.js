const express = require('express');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

module.exports = function ticketVentasRoutes(prisma, { auth, requirePerm }) {
  const router = express.Router();

  function parseRange(qs) {
    let from = null, to = null;
    if (qs.desde) from = dayjs(qs.desde + 'T00:00:00').toDate();
    if (qs.hasta) to   = dayjs(qs.hasta + 'T23:59:59.999').toDate();
    return { from, to };
  }
  function asGTQ(n) {
    const v = Number(n || 0);
    return 'Q ' + v.toFixed(2);
  }

  const SORTABLE = new Set([
    'fechaPago','serie','numero','clienteNombre','metodoPago','totalAPagar',
  ]);

  // Reemplaza tu resolveLogoPath() por esta (se usa en PDF; en Excel ya NO insertamos logo)
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

  // =========================
  // GET /ticket-ventas
  // =========================
  router.get('/', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const { from, to } = parseRange(req.query);
      const q = (req.query.q || '').trim();

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSizeRaw = parseInt(req.query.pageSize || '20', 10);
      const pageSize = Math.min(Math.max(1, pageSizeRaw), 200);
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      const sortBy = SORTABLE.has(String(req.query.sortBy || '')) ? String(req.query.sortBy) : 'fechaPago';
      const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const where = {};
      if (from || to) where.fechaPago = {};
      if (from) where.fechaPago.gte = from;
      if (to)   where.fechaPago.lte = to;

      if (q) {
        const or = [
          { clienteNombre: { contains: q, mode: 'insensitive' } },
          { serie:        { contains: q, mode: 'insensitive' } },
          { clienteNit:   { contains: q, mode: 'insensitive' } },
        ];
        const n = Number(q);
        if (!Number.isNaN(n)) { or.push({ numero: { equals: n } }); }
        where.OR = or;
      }

      const total = await prisma.ticketVenta.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      const rowsRaw = await prisma.ticketVenta.findMany({
        where,
        orderBy: [
          { [sortBy]: sortDir },
          ...(sortBy !== 'fechaPago' ? [{ fechaPago: 'desc' }] : []),
          { id: 'desc' },
        ],
        select: {
          id: true,
          fechaPago: true,
          serie: true,
          numero: true,
          clienteNit: true,
          clienteNombre: true,
          metodoPago: true,
          totalAPagar: true,
          ordenId: true,
          posCorrelativo: true,
          montoRecibido: true,
          cambio: true,
          orden: { select: { codigo: true } },
        },
        skip,
        take,
      });

      const rows = rowsRaw.map(r => ({ ...r, codigo: r.orden?.codigo || null }));
      res.json({ rows, page, pageSize, total, totalPages });
    } catch (err) {
      console.error('ticket-ventas list error:', err);
      res.status(500).json({ mensaje: 'Error al listar comprobantes' });
    }
  });

  // =========================
  // Export Excel — estilo idéntico: encabezado izq, header negro centrado A6:E6,
  // filas blancas, bordes finos, sin logo. Columnas: Fecha, Serie, Mesa, Método, Total
  // =========================
  router.get('/export/excel', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const { from, to } = parseRange(req.query);
      const q = (req.query.q || '').trim();
      const metodoPago = (req.query.metodoPago || req.query.metodo || '')
        .toString().trim().toUpperCase();

      // Branding (solo texto de encabezado)
      const R_NAME = process.env.APP_RESTAURANT_NAME || 'Restaurante Morales';
      const R_CITY = process.env.APP_RESTAURANT_CITY || 'Morales, Izabal';
      const R_NIT  = process.env.APP_RESTAURANT_NIT  || '';
      const R_TEL  = process.env.APP_RESTAURANT_TEL  || '';
      const R_DIR  = process.env.APP_RESTAURANT_ADDR || '';

      // WHERE
      const where = {};
      if (from || to) where.fechaPago = {};
      if (from) where.fechaPago.gte = from;
      if (to)   where.fechaPago.lte = to;

      if (q) {
        const or = [
          { clienteNombre: { contains: q, mode: 'insensitive' } },
          { serie:         { contains: q, mode: 'insensitive' } },
          { clienteNit:    { contains: q, mode: 'insensitive' } },
        ];
        const n = Number(q);
        if (!Number.isNaN(n)) or.push({ numero: { equals: n } });
        where.OR = or;
      }
      if (metodoPago) where.metodoPago = { equals: metodoPago };

      // Datos (mesa desde la orden)
      const rowsRaw = await prisma.ticketVenta.findMany({
        where,
        orderBy: { fechaPago: 'desc' },
        select: {
          fechaPago: true, serie: true, metodoPago: true, totalAPagar: true,
          orden: { select: { codigo: true, mesa: true } },
        }
      });

      const rows = rowsRaw.map(r => ({
        fecha: r.fechaPago || null,
        serie: r.serie || r.orden?.codigo || '',
        mesa:  (typeof r?.orden?.mesa === 'number') ? r.orden.mesa : null, // respeta 0
        metodo: String(r.metodoPago || '').toUpperCase(),
        total: Number(r.totalAPagar || 0),
      }));

      // ===== ExcelJS =====
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Sistema de Reportes';
      wb.created = new Date();

      const ws = wb.addWorksheet('Comprobantes', {
        views: [{ state: 'frozen', ySplit: 6 }]
      });

      // Columnas (5) — sin 'header' para que no “aparezcan” en la fila 1
      ws.columns = [
        { key: 'fecha',  width: 22 },
        { key: 'serie',  width: 14 },
        { key: 'mesa',   width: 18 },
        { key: 'metodo', width: 14 },
        { key: 'total',  width: 16 },
      ];


      // ===== Encabezado superior (todo a la izquierda, sin merges raros) =====
      const topFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      const cA1 = ws.getCell('A1');
      cA1.value = 'Comprobantes';
      cA1.font  = { bold: true, size: 22, color: { argb: 'FF111827' } };
      cA1.alignment = { vertical: 'middle', horizontal: 'left' };
      cA1.fill = topFill;

      ws.getCell('A2').value = R_NAME;
      ws.getCell('A2').font  = { size: 12, color: { argb: 'FF1F2937' } };
      ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };

      ws.getCell('A3').value =
        [R_CITY, R_DIR, R_TEL, (R_NIT && `NIT: ${R_NIT}`)].filter(Boolean).join(' • ');
      ws.getCell('A3').font  = { size: 11, color: { argb: 'FF6B7280' } };
      ws.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' };

      ws.getCell('A4').value =
        `Desde: ${req.query.desde || '-'}   Hasta: ${req.query.hasta || '-'}${metodoPago ? ` • Método: ${metodoPago}` : ''}`;
      ws.getCell('A4').font  = { size: 11, color: { argb: 'FF374151' } };
      ws.getCell('A4').alignment = { vertical: 'middle', horizontal: 'left' };

      // LIMPIAR posibles textos en B..E de las filas 1..4 (p. ej. "Serie", "Método"...)
      for (let r = 1; r <= 4; r++) {
        for (let c = 2; c <= 5; c++) {
          const cell = ws.getCell(r, c);
          cell.value = null;            // sin texto
          cell.fill = undefined;        // sin relleno
          cell.border = undefined;      // sin borde
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }


      // Separador: solo A5:E5 (limpio resto)
      ['A5','B5','C5','D5','E5'].forEach(a => {
        ws.getCell(a).border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      });
      for (let col = 6; col <= 30; col++) ws.getCell(5, col).border = {};

      
      // Formatos de columnas
      ws.getColumn('A').numFmt = 'yyyy-mm-dd hh:mm';
      ws.getColumn('E').numFmt = '"Q" #,##0.00';
      ws.getColumn('E').alignment = { horizontal: 'right' };

      // ===== Encabezado de tabla NEGRO centrado SOLO en A6:E6 =====
      const HEADER_ROW = 6;
      const titles = ['Fecha','Serie','Número de Mesa','Método','Total'];
      for (let col = 1; col <= 5; col++) {
        const cell = ws.getCell(HEADER_ROW, col);
        cell.value = titles[col - 1];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left:   col === 1 ? { style: 'thin', color: { argb: 'FFBFBFBF' } } : undefined,
          right:  col === 5 ? { style: 'thin', color: { argb: 'FFBFBFBF' } } : undefined,
        };
      }
      ws.getRow(HEADER_ROW).height = 18;
      ws.autoFilter = 'A6:E6';

      // ===== Filas de datos (blancas) + bordes finos A..E =====
      let r = HEADER_ROW + 1;
      const rowBorder = { style: 'thin', color: { argb: 'FFBFBFBF' } };

      rows.forEach(x => {
        ws.getRow(r).values = [
          x.fecha ? dayjs(x.fecha).format('YYYY-MM-DD HH:mm') : '',
          x.serie || '',
          (x.mesa ?? ''),             // si quieres "Pedido en línea" cuando 0: (x.mesa===0?'Pedido en línea':(x.mesa??''))
          x.metodo || '',
          x.total
        ];
        for (let col = 1; col <= 5; col++) {
          const cell = ws.getCell(r, col);
          cell.border = {
            left:  col === 1 ? rowBorder : undefined,
            right: col === 5 ? rowBorder : undefined,
            bottom: rowBorder
          };
        }
        r++;
      });

      // ===== Fila TOTAL =====
      ws.getRow(r).values = ['Total','','','',{ formula: `SUM(E${HEADER_ROW+1}:E${r-1})` }];
      ws.getRow(r).font = { bold: true };
      ws.getCell(`E${r}`).alignment = { horizontal: 'right' };
      for (let col = 1; col <= 5; col++) {
        const cell = ws.getCell(r, col);
        cell.border = {
          top: rowBorder,
          left:  col === 1 ? rowBorder : undefined,
          right: col === 5 ? rowBorder : undefined
        };
      }

      // ===== Enviar =====
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=comprobantes.xlsx');
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('ticket-ventas excel error:', err);
      res.status(500).json({ mensaje: 'Error al exportar Excel de comprobantes' });
    }
  });

  // =========================
  // Export PDF (HORIZONTAL + LOGO DERECHA + TABLA ADAPTATIVA)
  // =========================
  router.get('/export/pdf', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    const PDFDocument = require('pdfkit');
    try {
      const { from, to } = parseRange(req.query);
      const metodoPago = (req.query.metodoPago || req.query.metodo || '')
        .toString().trim().toUpperCase();

      // Branding (ENV o defaults)
      const R_NAME = process.env.APP_RESTAURANT_NAME || 'Restaurante Morales';
      const R_CITY = process.env.APP_RESTAURANT_CITY || 'Morales, Izabal';
      const R_NIT  = process.env.APP_RESTAURANT_NIT  || '';
      const R_TEL  = process.env.APP_RESTAURANT_TEL  || '';
      const R_DIR  = process.env.APP_RESTAURANT_ADDR || '';
      const LOGO   = resolveLogoPath();

      // WHERE
      const where = {};
      if (from || to) where.fechaPago = {};
      if (from) where.fechaPago.gte = from;
      if (to)   where.fechaPago.lte = to;
      if (metodoPago) {
        where.metodoPago = { equals: metodoPago };
      }

      // Datos
      const rowsRaw = await prisma.ticketVenta.findMany({
        where,
        orderBy: { fechaPago: 'desc' },
        select: {
          fechaPago: true, serie: true, numero: true, clienteNit: true,
          clienteNombre: true, metodoPago: true, totalAPagar: true,
          orden: { select: { codigo: true, mesa: true } },
        }
      });

      const data = (rowsRaw || []).map(r => ({
        fecha: r?.fechaPago || null,
        serie: r?.serie || r?.orden?.codigo || '-',
        mesa: (typeof r?.orden?.mesa === 'number') ? r.orden.mesa : '-',
        metodo: String(r?.metodoPago || '').toUpperCase() || '-',
        total: Number(r?.totalAPagar || 0),
      }));

      // Cabeceras HTTP
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=comprobantes.pdf');

      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      doc.on('error', (e) => { console.error('[PDFKit error]', e); try { res.end(); } catch {} });
      doc.pipe(res);

      // ===== Encabezado =====
      const top = doc.page.margins.top;
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;

      const LOGO_W = 46;
      if (LOGO && fs.existsSync(LOGO)) {
        try {
          const logoX = right - LOGO_W;
          doc.image(LOGO, logoX, top - 6, { width: LOGO_W });
        } catch (e) {
          console.warn('[logo] no se pudo cargar, continuo sin logo:', e?.message);
        }
      }

      doc
        .fontSize(18).fillColor('#111827').text('Comprobantes', left, top, { align: 'left' })
        .fontSize(11).fillColor('#1F2937').text(`${R_NAME}`, left, doc.y + 2)
        .fontSize(10).fillColor('#6B7280')
        .text([R_CITY, R_DIR, R_TEL, (R_NIT && `NIT: ${R_NIT}`)].filter(Boolean).join(' • '), left, doc.y + 1);

      const rangoTxt = `Desde: ${req.query.desde || '-'}   Hasta: ${req.query.hasta || '-'}`;
      const mpTxt = metodoPago ? ` • Método: ${metodoPago}` : '';
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor('#374151').text(`${rangoTxt}${mpTxt}`, left, doc.y);
      doc.moveDown(0.4);

      // ===== Tabla ADAPTATIVA =====
      function safeText(txt, maxChars) {
        const s = String(txt ?? '');
        return s.length <= maxChars ? s : s.slice(0, Math.max(0, maxChars - 1)) + '…';
      }

      const PAD = 10;
      const x0 = left;
      let y = doc.y + 8;

      const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Fecha | Serie | Mesa | Método | Total
      const ratios = [0.28, 0.22, 0.20, 0.18, 0.12];
      let colW = ratios.map(r => Math.floor(contentW * r));
      const diff = contentW - colW.reduce((a,b)=>a+b,0);
      colW[colW.length - 1] += diff;
      const tableW = colW.reduce((a,b)=>a+b,0);

      const headerH = 26;
      const rowH = 22;
      const zebra = ['#FFFFFF', '#FAFAFA'];

      function drawHeader(headerY) {
        doc.save();
        doc.rect(x0, headerY, tableW, headerH).fill('#F3F4F6');
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11);
        const headers = ['Fecha', 'Serie', 'Número de Mesa', 'Método', 'Total'];
        headers.forEach((h, i) => {
          const cellX = x0 + colW.slice(0, i).reduce((a,b)=>a+b,0) + PAD;
          doc.text(h, cellX, headerY + 6, { width: colW[i] - PAD * 2, align: i === 4 ? 'right' : 'left' });
        });
        doc.restore();
      }

      drawHeader(y);
      y += headerH;
      doc.font('Helvetica').fontSize(10);

      if (!data.length) {
        doc.save().rect(x0, y, tableW, rowH).fill('#FFFFFF').restore();
        doc.fillColor('#6B7280').text('Sin comprobantes para el rango seleccionado.', x0 + PAD, y + 5, { width: tableW - PAD * 2 });
        y += rowH;
      }

      for (let i = 0; i < data.length; i++) {
        const r = data[i];

        if (y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
          addFooter(doc, R_NAME);
          doc.addPage({ size: 'LETTER', layout: 'landscape', margins: doc.page.margins });
          y = doc.page.margins.top;
          drawHeader(y);
          y += headerH;
          doc.font('Helvetica').fontSize(10);
        }

        const bg = zebra[i % 2];
        doc.save().rect(x0, y, tableW, rowH).fill(bg).restore();

        const estChars = colW.map(w => Math.max(3, Math.floor((w - PAD * 2) / 6)));

        const cells = [
          r.fecha ? dayjs(r.fecha).format('YYYY-MM-DD HH:mm') : '-',
          safeText(r.serie || '-', estChars[1]),
          safeText(String(r.mesa ?? '-'), estChars[2]),
          safeText(r.metodo || '-', estChars[3]),
          asGTQ(Number.isFinite(r.total) ? r.total : 0),
        ];

        cells.forEach((txt, idx) => {
          const cellX = x0 + colW.slice(0, idx).reduce((a,b)=>a+b,0) + PAD;
          doc.fillColor('#111827').text(txt, cellX, y + 5, {
            width: colW[idx] - PAD * 2,
            align: idx === 4 ? 'right' : 'left'
          });
        });

        y += rowH;
      }

      // Totales
      const totalGeneral = data.reduce((a,b)=>a + (Number.isFinite(b.total) ? b.total : 0), 0);
      doc.moveTo(x0, y + 6).lineTo(x0 + tableW, y + 6).strokeColor('#E5E7EB').stroke();
      doc.font('Helvetica-Bold').fillColor('#111827')
        .text('TOTAL', x0 + colW.slice(0,3).reduce((a,b)=>a+b,0) + PAD, y + 10,
              { width: colW[3] - PAD * 2, align: 'left' })
        .text(asGTQ(totalGeneral), x0 + colW.slice(0,4).reduce((a,b)=>a+b,0) + PAD, y + 10,
              { width: colW[4] - PAD * 2, align: 'right' });

      addFooter(doc, R_NAME);
      doc.end();

      function addFooter(d, brand) {
        const y0 = d.page.height - d.page.margins.bottom - 14;
        const xL = d.page.margins.left;
        const usableW = d.page.width - d.page.margins.left - d.page.margins.right;
        const half = Math.floor(usableW / 2) - 4;

        d.save();
        d.fontSize(9).fillColor('#6B7280');
        d.text(`Generado por ${brand}`, xL, y0, { width: half, align: 'left', lineBreak: false });
        d.text(dayjs().format('YYYY-MM-DD HH:mm'), xL + half + 8, y0, { width: half, align: 'right', lineBreak: false });
        d.restore();
      }
    } catch (err) {
      console.error('ticket-ventas export/pdf error:', err);
      if (!res.headersSent) {
        res.status(500).json({ mensaje: 'Error al exportar PDF de comprobantes' });
      } else {
        try { res.end(); } catch {}
      }
    }
  });

  // =========================
  // GET /ticket-ventas/:id/print
  // =========================
  router.get('/:id/print', auth, requirePerm('REPORTES_VER'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) return res.status(400).send('id inválido');

      const t = await prisma.ticketVenta.findUnique({
        where: { id },
        select: {
          id: true, fechaPago: true, metodoPago: true, totalAPagar: true,
          posCorrelativo: true, montoRecibido: true, cambio: true,
          clienteNombre: true, clienteNit: true, ordenId: true
        }
      });
      if (!t) return res.status(404).send('Ticket no encontrado');

      const orden = await prisma.orden.findUnique({
        where: { id: t.ordenId },
        select: {
          id: true, codigo: true, mesa: true,
          items: { select: { nombre: true, precio: true, qty: true, nota: true } }
        }
      });

      const qtz = (n)=> 'Q ' + Number(n || 0).toFixed(2);
      const mesaStr = typeof orden?.mesa === 'number'
        ? (orden.mesa === 0 ? 'Pedido en línea' : `Mesa ${orden.mesa}`)
        : 'Pedido en línea';

      const rows = (orden?.items || []).map(it => ({
        nombre: it.qty && Number(it.qty) > 1 ? `${it.nombre} (x${it.qty})` : it.nombre,
        precio: Number(it.precio || 0),
        nota: it.nota
      }));

      const itemsHtml = rows.map(r => `
        <tr>
          <td>${r.nombre}${r.nota ? ` <em style="color:#64748b">(nota: ${r.nota})</em>` : ''}</td>
          <td style="text-align:right">${qtz(r.precio)}</td>
        </tr>
      `).join('') || `<tr><td colspan="2" style="color:#64748b">— sin detalle —</td></tr>`;

      const fecha = dayjs(t.fechaPago || new Date()).format('DD/MM/YYYY HH:mm');

      const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Ticket #${t.id}</title>
<style>
  body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;margin:0;padding:10px}
  .ticket{width:260px;margin:0 auto}
  h1{font-size:14px;text-align:center;margin:8px 0}
  table{width:100%;font-size:12px;border-collapse:collapse}
  .tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}
  .muted{color:#666;font-size:11px}
  @media print { @page { size: auto; margin: 6mm; } }
</style></head>
<body>
  <div class="ticket">
    <h1>Ticket de Venta</h1>
    <div class="muted">${fecha}</div>
    <div>Orden #${orden?.id || ''} • ${orden?.codigo || ''} – ${mesaStr}</div>
    ${t.clienteNombre ? `<div class="muted">Cliente: ${t.clienteNombre}</div>` : ''}
    <hr />
    <table>${itemsHtml}</table>
    <div class="tot">
      <div>Total: <strong>${qtz(t.totalAPagar)}</strong></div>
      <div>Método: ${t.metodoPago || '-'}</div>
      ${String(t.metodoPago || '').toUpperCase()==='TARJETA' ? `<div>POS: ${t.posCorrelativo || ''}</div>` : ''}
      ${String(t.metodoPago || '').toUpperCase()==='EFECTIVO' ? `<div>Recibido: ${qtz(t.montoRecibido || 0)} – Cambio: ${qtz(t.cambio || 0)}</div>` : ''}
    </div>
    <p class="muted">No válido como factura</p>
    <div style="margin-top:8px;text-align:center" class="no-print">
      <button onclick="window.print()" style="padding:6px 10px">Imprimir</button>
    </div>
  </div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.send(html);
    } catch (err) {
      console.error('ticket-ventas print error:', err);
      res.status(500).send('Error al generar ticket');
    }
  });

  return router;
};
