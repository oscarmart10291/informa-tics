// src/pages/Reporteria.jsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { http } from '../config/client';
import AdminHeader from '../components/AdminHeader';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';


/* ⬇️ Recharts para las gráficas */
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  /*  nuevos */
  AreaChart, Area, LineChart, Line
} from 'recharts';

/* ==================== Constantes ==================== */
const PERIODOS = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

// Colores de categorías (consistentes en todo)
// BEBIDA = verde, PLATILLO = azul
const COLOR_BEBIDA   = '#10b981';  // verde
const COLOR_PLATILLO = '#2563eb';  // azul

const CRITERIOS = [
  { value: 'cantidad', label: 'Cantidad vendida' },
  { value: 'ingreso', label: 'Ingreso generado' },
];

const MESES = [
  { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' },
];

const TIPOS_TIEMPO = [
  { value: 'TODOS', label: 'Todas' },
  { value: 'PLATILLO', label: 'Platillos' },
  { value: 'BEBIDA', label: 'Bebidas' },
];

/* ==================== Utils ==================== */
function fmtCurrency(n) {
  const num = Number(n || 0);
  return num.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function currentYear() { return new Date().getFullYear(); }
function currentMonth() { return new Date().getMonth() + 1; }
function currentISOWeek() {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

/* ====== Helpers de ordenamiento DESC por fecha ====== */
function getFirstDate(obj, keys = []) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v) {
      const d = new Date(v);
      if (!isNaN(d)) return d;
    }
  }
  return new Date(0); // epoch si no hay fecha
}
function sortByDateDesc(arr = [], keys = []) {
  return [...arr].sort((a, b) => getFirstDate(b, keys) - getFirstDate(a, keys));
}

/* ===================== Helpers de ticket ===================== */
const qtz = (n)=>`Q ${Number(n||0).toFixed(2)}`;

function domicilioBloqueT(t){
  const te = String(t?.orden?.tipoEntrega || t?.tipoEntrega || '').toUpperCase();
  if (te !== 'DOMICILIO') return '';
  const nombre = t?.clienteNombre || t?.cliente?.nombre || t?.nombreCliente || '';
  const tel    = t?.telefonoEntrega || t?.cliente?.telefono || t?.telefono || '';
  const dir    = t?.direccionEntrega || t?.cliente?.direccion || t?.direccion || '';
  const parts = [];
  if (nombre) parts.push(`<div><b>Cliente:</b> ${nombre}</div>`);
  if (tel)    parts.push(`<div><b>Tel:</b> ${tel}</div>`);
  if (dir)    parts.push(`<div><b>Dirección:</b> ${dir}</div>`);
  return parts.length ? `<div style="margin:6px 0" class="muted">${parts.join('')}</div>` : '';
}

function buildTicketHTMLFromTicket(t = {}) {
  const fecha = new Date(t.fechaPago || Date.now());
  const orden = t.orden || {};
  const mesaStr = (typeof orden.mesa === 'number')
    ? (orden.mesa === 0 ? 'Pedido en línea' : `Mesa ${orden.mesa}`)
    : 'Pedido en línea';

  const rows = (orden.items || []).map(it => ({
    nombre: it.qty && Number(it.qty) > 1 ? `${it.nombre} (x${it.qty})` : it.nombre,
    precio: Number(it.precio || 0),
    nota: it.nota
  }));

  const itemsHtml = rows.map(r => `
    <tr>
      <td>${r.nombre}${r.nota ? ` <em style="color:#64748b">(nota: ${r.nota})</em>` : ''}</td>
      <td style="text-align:right">${qtz(r.precio)}</td>
    </tr>
  `).join('');

  const metodo = String(t.metodoPago || t.pago || '').toUpperCase() || 'EFECTIVO';
  const rec = Number(t.montoRecibido || 0);
  const cam = Number(t.cambio || 0);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Ticket #${t.id || ''}</title>
<style>
  body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;margin:0;padding:10px}
  .ticket{width:260px;margin:28px auto}
  h1{font-size:14px;text-align:center;margin:10px 0}
  table{width:100%;font-size:12px;border-collapse:collapse}
  .tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}
  .muted{color:#666;font-size:11px}
  @media print { @page { size: auto; margin: 6mm; } }
</style></head>
<body>
  <div class="ticket">
    <h1>Ticket de Venta</h1>
    <div class="muted">${fecha.toLocaleString('es-GT')}</div>
    <div>Orden #${orden.id || ''} • ${orden.codigo || ''} – ${mesaStr}</div>
    ${domicilioBloqueT(t)}
    <hr />
    <table>${itemsHtml}</table>
    <div class="tot">
      <div>Total: <strong>${qtz(Number(t.totalAPagar || 0))}</strong></div>
      <div>Método: ${metodo}</div>
      ${metodo==='TARJETA' ? `<div>POS: ${t.posCorrelativo || ''}</div>` : ''}
      ${metodo==='EFECTIVO' ? `<div>Recibido: ${qtz(rec)} – Cambio: ${qtz(cam)}</div>` : ''}
    </div>
    <p class="muted">No válido como factura</p>
  </div>
</body></html>`;
}

function injectTicketPreviewCSS(html = '') {
  const injectedCss = `
<style>
  .no-print, button[onclick*="print"]{ display:none !important; }
  body{ background:#f8fafc !important; }
  .ticket{ width:300px !important; margin:28px auto !important; }
  h1{ font-size:16px !important; margin:6px 0 10px !important; text-align:center !important; }
  @media print { body{ background:white !important; } }
</style>`;
  if (html.includes('</head>')) return html.replace('</head>', `${injectedCss}\n</head>`);
  return injectedCss + html;
}

/* ---------- helpers de rangos ---------- */
function ymd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function getISOWeekStart(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  let dow = simple.getDay(); if (dow === 0) dow = 7;
  simple.setDate(simple.getDate() + 1 - dow);
  return simple;
}
function getISOWeekRange(year, week) {
  const start = getISOWeekStart(year, week);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { desde: ymd(start), hasta: ymd(end) };
}
function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { desde: ymd(start), hasta: ymd(end) };
}

// Construye params normalizados
function buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta }) {
  const d = (desde || '').trim();
  const h = (hasta || '').trim();

  if (d || h) {
    const out = { periodo };
    if (d) out.desde = d;
    if (h) out.hasta = h;
    if (periodo === 'dia' && dia) out.dia = dia;
    if (periodo === 'semana') { out.anio = anio; out.semana = semana; }
    if (periodo === 'mes')    { out.anio = anio; out.mes = mes; }
    return out;
  }

  if (periodo === 'dia') {
    const only = dia || todayISO();
    return { periodo: 'dia', dia: only, desde: only, hasta: only };
  }
  if (periodo === 'semana') {
    const y = Number(anio) || currentYear();
    const w = Number(semana) || currentISOWeek();
    const r = getISOWeekRange(y, w);
    return { periodo: 'semana', anio: y, semana: w, ...r };
  }
  if (periodo === 'mes') {
    const y = Number(anio) || currentYear();
    const m = Number(mes) || currentMonth();
    const r = getMonthRange(y, m);
    return { periodo: 'mes', anio: y, mes: m, ...r };
  }
  return {};
}

async function downloadGet(path, params = {}, fallbackName = 'archivo') {
  const res = await http.get(path, { params, responseType: 'blob' });
  const ctype = res.headers['content-type'] || 'application/octet-stream';
  const dispo = res.headers['content-disposition'] || '';
  const m =
    /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(dispo) ||
    /filename="?([^"]+)"?/i.exec(dispo);
  const filename = m ? decodeURIComponent(m[1]) : fallbackName;

  const blob = new Blob([res.data], { type: ctype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ===== Helpers HTTP con fallback de rutas ===== */
async function tryOnePath(path, params) {
  try {
    const r = await http.get(path, { params });
    return { data: r.data, usedPath: path };
  } catch (e) {
    const status = e?.response?.status;
    const code   = e?.code || '';
    const shouldFallback =
      status === 404 ||
      status === 405 ||
      (typeof status === 'number' && status >= 500) ||
      code === 'ERR_BAD_RESPONSE';

    if (shouldFallback) {
      const withApi = path.startsWith('/api/') ? path : `/api${path}`;
      const withoutApi = path.startsWith('/api/') ? path.replace(/^\/api/, '') : path;
      const alt = path.startsWith('/api/') ? withoutApi : withApi;
      try {
        const r2 = await http.get(alt, { params });
        console.info('[fallback OK]', alt);
        return { data: r2.data, usedPath: alt };
      } catch (e2) {
        throw e2;
      }
    }
    throw e;
  }
}

async function getFirstAvailable(paths, params) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const r = await tryOnePath(p, params);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function downloadFirstAvailable(paths, params = {}, filename) {
  let lastErr = null;
  for (const p of paths) {
    try {
      await downloadGet(p, params, filename);
      return;
    } catch (e) {
      try {
        const withApi = p.startsWith('/api/') ? p : `/api${p}`;
        const withoutApi = p.startsWith('/api/') ? p.replace(/^\/api/, '') : p;
        const alt = p.startsWith('/api/') ? withoutApi : withApi;
        await downloadGet(alt, params, filename);
        return;
      } catch (e2) {
        lastErr = e2;
      }
    }
  }
  throw lastErr;
}

/* === Fechas “bonitas” en español === */
const WEEKDAYS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS_ES   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmtDiaLargoES(ymdStr) { // 'YYYY-MM-DD' -> 'martes 10 de octubre de 2025'
  if (!ymdStr) return '';
  const [Y,M,D] = ymdStr.split('-').map(Number);
  const d = new Date(Y, (M||1)-1, D||1);
  if (isNaN(d)) return ymdStr;
  const wd = WEEKDAYS_ES[d.getDay()];
  return `${wd} ${String(D).padStart(2,'0')} de ${MONTHS_ES[(M||1)-1]} de ${Y}`;
}

function fmtFechaCortaES(ymdStr) { // 'YYYY-MM-DD' -> '10 de octubre de 2025'
  if (!ymdStr) return '';
  const [Y,M,D] = ymdStr.split('-').map(Number);
  const d = new Date(Y, (M||1)-1, D||1);
  if (isNaN(d)) return ymdStr;
  return `${String(D).padStart(2,'0')} de ${MONTHS_ES[(M||1)-1]} de ${Y}`;
}

function rangoSeleccionadoLabel({ periodo, dia, anio, mes, semana, desde, hasta }) {
  const d = (desde || '').trim();
  const h = (hasta || '').trim();

  // Si el usuario metió fechas manuales, priorízalas
  if (d || h) {
    if (d && h) return `Rango seleccionado: del ${fmtFechaCortaES(d)} al ${fmtFechaCortaES(h)}`;
    if (d)      return `Rango seleccionado: desde el ${fmtFechaCortaES(d)}`;
    if (h)      return `Rango seleccionado: hasta el ${fmtFechaCortaES(h)}`;
  }

  if (periodo === 'dia') {
    const only = dia || todayISO();
    return `Rango seleccionado: ${fmtDiaLargoES(only)}`;
  }
  if (periodo === 'semana') {
    const y = Number(anio) || currentYear();
    const w = Number(semana) || currentISOWeek();
    const { desde: d1, hasta: d2 } = getISOWeekRange(y, w);
    return `Rango seleccionado: Semana ${w}, ${y} (del ${fmtFechaCortaES(d1)} al ${fmtFechaCortaES(d2)})`;
  }
  if (periodo === 'mes') {
    const y = Number(anio) || currentYear();
    const m = Number(mes) || currentMonth();
    return `Rango seleccionado: ${MONTHS_ES[m-1]} de ${y}`;
  }
  return 'Rango seleccionado: (sin especificar)';
}

function fmtMesLargoES(yyyyMm) { // 'YYYY-MM' -> 'octubre de 2025'
  if (!yyyyMm) return '';
  const [Y, M] = yyyyMm.split('-').map(Number);
  if (!Y || !M) return yyyyMm;
  return `${MONTHS_ES[(M||1)-1]} de ${Y}`;
}

function fmtAnioES(yyyy) { // '2025' -> '2025'
  return String(yyyy || '');
}


/* =============== Utils tiempos =============== */
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function durationFromDates(start, end) {
  if (!start || !end) return '00:00:00';
  const ms = Math.max(0, new Date(end) - new Date(start));
  const totalSec = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Punto de verdad para INICIO de item: */
function getItemStart(row) {
   return row?.preparandoEn || row?.inicio || row?.asignadoEn || row?.creadoEn || null;
}
function getItemEnd(row) {
  return row?.fin || row?.finalizadoEn || null;
}
function computeMs(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, new Date(end) - new Date(start));
}
async function renderNodeToPDF(rootId, filename = 'reporte.pdf') {
  const root = document.getElementById(rootId);
  if (!root) return;

  const unfreeze = freezeRechartsSizes(root); // ya lo tienes

  await new Promise(r => setTimeout(r, 60));
  window.dispatchEvent(new Event('resize'));

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgW = pageW - margin * 2;

  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 0,
      onclone: (doc) => {
        const r = doc.getElementById(rootId);
        if (r) {
          r.style.maxWidth = '900px';
          r.style.margin = '0 auto';
          r.style.padding = '8px';
        }

        // 1) columna única para evitar wraps raros
        doc.querySelectorAll('.pdf-two').forEach(el => {
          el.style.gridTemplateColumns = '1fr';
          el.style.gap = '12px';
        });

        // 2) ocultar overlays
        doc.querySelectorAll('.recharts-tooltip-wrapper, .recharts-default-tooltip, .recharts-crosshair')
          .forEach(n => { n.style.display = 'none'; n.style.opacity = '0'; n.style.visibility = 'hidden'; });

        // 3) congelar ResponsiveContainer
        doc.querySelectorAll('.recharts-responsive-container').forEach(rc => {
          const rect = rc.getBoundingClientRect();
          const w = Math.max(1, Math.round(rect.width || 860));
          const h = Math.max(1, Math.round(rect.height || 300));
          rc.style.width = `${w}px`;
          rc.style.height = `${h}px`;
          const wrap = rc.querySelector('.recharts-wrapper');
          if (wrap) {
            wrap.style.width = `${w}px`;
            wrap.style.height = `${h}px`;
          }
        });

        // 4) forzar opacidad en la dona
        doc.querySelectorAll('.recharts-pie .recharts-sector').forEach(p => {
          p.style.fillOpacity = '1';
          p.style.opacity = '1';
        });

        // 5) rasterizar todos los SVG a <img>
        const serializer = new XMLSerializer();
        doc.querySelectorAll('.recharts-wrapper svg').forEach(svg => {
          try {
            svg.querySelectorAll('[clip-path],[mask]').forEach(n => {
              n.removeAttribute('clip-path'); n.removeAttribute('mask');
            });
            svg.querySelectorAll('defs,linearGradient,radialGradient,filter,pattern')
              .forEach(n => n.parentNode.removeChild(n));

            const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
            let w = Number(svg.getAttribute('width'));
            let h = Number(svg.getAttribute('height'));
            if (!w || !h) {
              if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
              else {
                const r2 = svg.getBoundingClientRect();
                w = Math.max(1, Math.round(r2.width || 860));
                h = Math.max(1, Math.round(r2.height || 300));
              }
            }
            svg.setAttribute('width', `${Math.round(w)}`);
            svg.setAttribute('height', `${Math.round(h)}`);
            svg.style.width = `${Math.round(w)}px`;
            svg.style.height = `${Math.round(h)}px`;

            const svgStr = serializer.serializeToString(svg);
            const img = doc.createElement('img');
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
            img.width = Math.round(w);
            img.height = Math.round(h);
            img.style.display = 'block';
            img.style.width = `${Math.round(w)}px`;
            img.style.height = `${Math.round(h)}px`;

            svg.parentNode.replaceChild(img, svg);
          } catch {}
        });
      },
    });

    // multipágina
    const slicePxH = ((pageH - margin * 2) * canvas.width) / imgW;
    const addSlice = (yPx) => {
      const h = Math.min(slicePxH, canvas.height - yPx);
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
      const img = c.toDataURL('image/jpeg', 0.98);
      const partH = (h * imgW) / canvas.width;
      pdf.addImage(img, 'JPEG', margin, margin, imgW, partH, undefined, 'FAST');
      return yPx + h;
    };

    let y = 0;
    while (y < canvas.height) {
      if (y > 0) pdf.addPage();
      y = addSlice(y);
    }
    pdf.save(filename);
  } finally {
    unfreeze();
  }
}

/* ====== Helpers ventas para Estadísticas (Ventas) ====== */
function detectCanal(row){
  const mesa = row?.mesaNumero ?? row?.mesa;
  const te   = String(row?.tipoEntrega || row?.orden?.tipoEntrega || '').toUpperCase();
  const origen = String(row?.origen || row?.canal || '').toUpperCase();
  if (mesa === 0 || te === 'DOMICILIO' || origen === 'ONLINE') return 'EN_LINEA';
  return 'EN_LOCAL';
}
function groupSum(arr, keyFn){
  const m = new Map();
  for (const r of arr || []) {
    const k = keyFn(r);
    const ingreso = Number(r?.ingreso ?? r?.total ?? r?.monto ?? 0);
    const qty = Number(r?.cantidad ?? 1);
    const x = m.get(k) || { key:k, ingreso:0, items:0 };
    x.ingreso += ingreso;
    x.items   += qty;
    m.set(k, x);
  }
  return Array.from(m.values());
}
function bestWorstByDay(rowsAllTime){
  // Agrupa por YYYY-MM-DD (sum ingreso y items):
  const dmap = new Map();
  for (const r of rowsAllTime || []) {
    const d = r?.fecha || r?.fechaPago || r?.createdAt;
    if (!d) continue;
    const ymd = new Date(d); if (isNaN(ymd)) continue;
    const k = `${ymd.getFullYear()}-${String(ymd.getMonth()+1).padStart(2,'0')}-${String(ymd.getDate()).padStart(2,'0')}`;
    const ingreso = Number(r?.ingreso ?? r?.total ?? 0);
    const items = Number(r?.cantidad ?? 1);
    const acc = dmap.get(k) || { fecha:k, ingreso:0, items:0 };
    acc.ingreso += ingreso; acc.items += items;
    dmap.set(k, acc);
  }
  const arr = Array.from(dmap.values());
  if (arr.length === 0) return { mejorDia:null, peorDia:null };
  arr.sort((a,b)=> b.ingreso - a.ingreso);
  return { mejorDia: arr[0], peorDia: arr[arr.length-1] };
}

/* ───────── Mejor/Peor por MES y AÑO (HISTÓRICO) ───────── */
function bestWorstByMonth(rowsAllTime){
  const map = new Map(); // key = YYYY-MM
  for (const r of rowsAllTime || []) {
    const d = r?.fecha || r?.fechaPago || r?.createdAt;
    if (!d) continue;
    const dd = new Date(d); if (isNaN(dd)) continue;
    const key = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}`;
    const ingreso = Number(r?.ingreso ?? r?.total ?? 0);
    const items = Number(r?.cantidad ?? 1);
    const acc = map.get(key) || { periodo:key, ingreso:0, items:0 };
    acc.ingreso += ingreso; acc.items += items;
    map.set(key, acc);
  }
  const arr = Array.from(map.values());
  if (!arr.length) return { mejorMes:null, peorMes:null };
  arr.sort((a,b)=> b.ingreso - a.ingreso);
  return { mejorMes: arr[0], peorMes: arr[arr.length-1] };
}

function bestWorstByYear(rowsAllTime){
  const map = new Map(); // key = YYYY
  for (const r of rowsAllTime || []) {
    const d = r?.fecha || r?.fechaPago || r?.createdAt;
    if (!d) continue;
    const dd = new Date(d); if (isNaN(dd)) continue;
    const key = `${dd.getFullYear()}`;
    const ingreso = Number(r?.ingreso ?? r?.total ?? 0);
    const items = Number(r?.cantidad ?? 1);
    const acc = map.get(key) || { periodo:key, ingreso:0, items:0 };
    acc.ingreso += ingreso; acc.items += items;
    map.set(key, acc);
  }
  const arr = Array.from(map.values());
  if (!arr.length) return { mejorAnio:null, peorAnio:null };
  arr.sort((a,b)=> b.ingreso - a.ingreso);
  return { mejorAnio: arr[0], peorAnio: arr[arr.length-1] };
}

/* ========== Series para gráficas históricas (día/mes/año) ========== */
function parseFechaAny(row) {
  const f = row?.fecha || row?.fechaPago || row?.createdAt;
  const d = new Date(f);
  return isNaN(d) ? null : d;
}
function ingresoNum(row) {
  return Number(row?.ingreso ?? row?.total ?? row?.monto ?? 0);
}

/* Últimos 365 días (rellena días sin ventas con 0) */
function buildDailySeries(rows = []) {
  const map = new Map(); // key = YYYY-MM-DD
  for (const r of rows) {
    const d = parseFechaAny(r); if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    map.set(k, (map.get(k) || 0) + ingresoNum(r));
  }

  // rango: hoy - 364 … hoy
  const out = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    out.push({ fecha: k, ingreso: map.get(k) || 0 });
  }
  return out;
}

/* Por mes desde el primer registro */
function buildMonthlySeries(rows = []) {
  const map = new Map(); // key = YYYY-MM
  for (const r of rows) {
    const d = parseFechaAny(r); if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    map.set(k, (map.get(k) || 0) + ingresoNum(r));
  }
  return Array.from(map.entries())
    .map(([periodo, ingreso]) => ({ periodo, ingreso }))
    .sort((a,b) => a.periodo.localeCompare(b.periodo));
}

/* Por año desde el primer registro */
function buildYearlySeries(rows = []) {
  const map = new Map(); // key = YYYY
  for (const r of rows) {
    const d = parseFechaAny(r); if (!d) continue;
    const k = `${d.getFullYear()}`;
    map.set(k, (map.get(k) || 0) + ingresoNum(r));
  }
  return Array.from(map.entries())
    .map(([anio, ingreso]) => ({ anio, ingreso }))
    .sort((a,b) => Number(a.anio) - Number(b.anio));
}

/* Formateos rápidos para ejes/tooltip */
const fmtGTQ = (n)=> `Q ${Number(n||0).toLocaleString('es-GT', { maximumFractionDigits: 2 })}`;
function shortDateLabel(ymd) { // 2025-10-10 -> 10 Oct
  const [Y,M,D] = ymd.split('-').map(Number);
  const d = new Date(Y, M-1, D);
  return d.toLocaleDateString('es-GT', { day:'2-digit', month:'short' });
}

/* ==================== Página principal ==================== */
export default function Reporteria() {
  const [tab, setTab] = useState('ventas'); // ventas | top | comprobantes | tiempos
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif', background: '#f5f6fa' }}>
      <AdminHeader titulo="Reportería" />
      <div style={{ height: 16 }} />

      <div style={{
        maxWidth: 1200, margin: '0 auto 24px', padding: '16px',
        background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <TabButton active={tab === 'ventas'} onClick={() => setTab('ventas')}>Ventas</TabButton>
          <TabButton active={tab === 'top'} onClick={() => setTab('top')}>Top (Platillos/Bebidas)</TabButton>
          <TabButton active={tab === 'tiempos'} onClick={() => setTab('tiempos')}>Tiempos</TabButton>
          <TabButton active={tab === 'comprobantes'} onClick={() => setTab('comprobantes')}>Comprobantes</TabButton>
        </div>

        {tab === 'ventas' && <VentasTab />}
        {tab === 'top' && <TopTab />}
        {tab === 'tiempos' && <TiemposTab />}
        {tab === 'comprobantes' && <ComprobantesTab />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.6rem 1rem',
        borderRadius: 8,
        border: '1px solid',
        borderColor: active ? '#1e3d59' : '#e2e8f0',
        background: active ? '#1e3d59' : '#fff',
        color: active ? '#fff' : '#1e3d59',
        cursor: 'pointer',
        fontWeight: 600
      }}
    >
      {children}
    </button>
  );
}

/* ========================= Ventas ========================= */
function VentasTab() {
  const [periodo, setPeriodo] = useState('dia');

  const [dia, setDia] = useState(todayISO());
  const [anio, setAnio] = useState(currentYear());
  const [mes, setMes] = useState(currentMonth());
  const [semana, setSemana] = useState(currentISOWeek());

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [metodoPago, setMetodoPago] = useState('');

  const [loading, setLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [totalVentas, setTotalVentas] = useState(0);
  const [items, setItems] = useState([]);

  // Modal de estadísticas (Ventas) + dataset histórico
  const [openStatsVentas, setOpenStatsVentas] = useState(false);
  const [historicoRows, setHistoricoRows] = useState([]);

  const fetchHistorico = useCallback(async () => {
    // objetivo: traer TODAS las ventas (sin rango) para calcular mejores/peores históricos
    try {
      const { data } = await getFirstAvailable(
        ['/reportes/ventas/historico', '/reportes/ventas/itemizadas'],
        { periodo: 'todo' }
      );
      // backend puede devolver {rows:[]} o [] según ruta
      const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
      setHistoricoRows(rows);
    } catch (e) {
      console.warn('[historico] usando items actuales por fallback', e?.message || e);
      setHistoricoRows(items); // fallback: al menos calcula con lo actual
    }
  }, [items]);

  useEffect(() => { setDesde(''); setHasta(''); }, [periodo, dia, anio, mes, semana]);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    try {
      const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
      const params = { ...periodoParams };
      if (metodoPago) params.metodoPago = metodoPago;

      const { data } = await http.get('/reportes/ventas/itemizadas', { params });

      setTotalItems(Number(data?.count || 0));
      setTotalVentas(Number(data?.total || 0));
      setItems(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      if (e?.response?.status !== 404) console.error('[ventas itemizadas] error', e);
      setTotalItems(0);
      setTotalVentas(0);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, dia, anio, mes, semana, desde, hasta, metodoPago]);

  function exportarPDF() {
    const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
    const params = { ...periodoParams };
    if (metodoPago) params.metodoPago = metodoPago;

    downloadFirstAvailable(['/reportes/ventas/export/pdf'], params, `ventas_${periodo}.pdf`)
      .catch(e => console.error('[export ventas pdf] error', e));
  }

  function exportarExcel() {
    const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
    const params = { ...periodoParams };
    if (metodoPago) params.metodoPago = metodoPago;

    downloadFirstAvailable(['/reportes/ventas/export/excel'], params, `ventas_${periodo}.xlsx`)
      .catch(e => console.error('[export ventas excel] error', e));
  }

  useEffect(() => { fetchVentas(); }, [fetchVentas]);
  useEffect(() => { fetchHistorico(); }, [fetchHistorico]);

  // ORDEN DESC por fecha para la vista
  const itemsView = useMemo(
    () => sortByDateDesc(items, ['fecha', 'createdAt', 'creadoEn']),
    [items]
  );

  // -------- Etiqueta visible del rango seleccionado --------
  const rangoLabel = useMemo(() => {
    const d = (desde || '').trim();
    const h = (hasta || '').trim();

    const fmtFechaCortaES = (ymdStr) => {
      if (!ymdStr) return '';
      const [Y, M, D] = ymdStr.split('-').map(Number);
      const dd = new Date(Y, (M || 1) - 1, D || 1);
      if (isNaN(dd)) return ymdStr;
      return `${String(D).padStart(2, '0')} de ${MONTHS_ES[(M || 1) - 1]} de ${Y}`;
    };

    if (d || h) {
      if (d && h) return `Rango seleccionado: del ${fmtFechaCortaES(d)} al ${fmtFechaCortaES(h)}`;
      if (d)      return `Rango seleccionado: desde el ${fmtFechaCortaES(d)}`;
      if (h)      return `Rango seleccionado: hasta el ${fmtFechaCortaES(h)}`;
    }

    if (periodo === 'dia') {
      const only = dia || todayISO();
      return `Rango seleccionado: ${fmtDiaLargoES(only)}`;
    }
    if (periodo === 'semana') {
      const y = Number(anio) || currentYear();
      const w = Number(semana) || currentISOWeek();
      const { desde: d1, hasta: d2 } = getISOWeekRange(y, w);
      return `Rango seleccionado: Semana ${w}, ${y} (del ${fmtFechaCortaES(d1)} al ${fmtFechaCortaES(d2)})`;
    }
    if (periodo === 'mes') {
      const y = Number(anio) || currentYear();
      const m = Number(mes) || currentMonth();
      return `Rango seleccionado: ${MONTHS_ES[m - 1]} de ${y}`;
    }
    return '';
  }, [periodo, dia, anio, mes, semana, desde, hasta]);

  return (
    <>
      <FiltrosBar>
        <Select label="Periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} options={PERIODOS} />

        {periodo === 'dia' && (
          <DateInput label="Día" value={dia} onChange={e => setDia(e.target.value)} />
        )}
        {periodo === 'semana' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <NumberInput label="Semana" value={semana} onChange={e => setSemana(Number(e.target.value || 0))} min={1} max={53} />
          </>
        )}
        {periodo === 'mes' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <Select label="Mes" value={mes} onChange={e => setMes(Number(e.target.value))} options={MESES} />
          </>
        )}

        <DateInput label="Desde (manual)" value={desde} onChange={e => setDesde(e.target.value)} />
        <DateInput label="Hasta (manual)" value={hasta} onChange={e => setHasta(e.target.value)} />

        <Select
          label="Método de pago"
          value={metodoPago}
          onChange={e => setMetodoPago(e.target.value)}
          options={[
            { value: '', label: 'Todos' },
            { value: 'EFECTIVO', label: 'Efectivo' },
            { value: 'TARJETA', label: 'Tarjeta' },
          ]}
        />
        <button onClick={fetchVentas} disabled={loading} style={btnPrimary}>
          {loading ? 'Cargando...' : 'Aplicar'}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setOpenStatsVentas(true)}
          style={{ ...btnPrimary, background:'#0ea5e9', borderColor:'#0ea5e9' }}
        >
          Estadísticas
        </button>
      </FiltrosBar>

      {/* 👇 Etiqueta del rango seleccionando visible */}
      {rangoLabel && (
        <div style={{ marginTop: 6, color:'#64748b', fontWeight: 600 }}>
          {rangoLabel}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KPI label="Total items" value={totalItems.toLocaleString('es-GT')} />
        <KPI label="Total ventas" value={fmtCurrency(totalVentas)} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={exportarPDF} style={btnGhost}>Exportar PDF</button>
        <button onClick={exportarExcel} style={btnGhost}>Exportar Excel</button>
      </div>

      <Table
        columns={[
          { key: 'fecha', title: 'Fecha', render: v => (v ? new Date(v).toLocaleString('es-GT') : '—') },
          { key: 'nombre', title: 'Nombre' },
          { key: 'metodoPago', title: 'Método', render: v => v || '—' },
          { key: 'ingreso', title: 'Ingreso', align: 'right', render: v => fmtCurrency(v) },
        ]}
        data={itemsView}
        emptyText={loading ? 'Cargando…' : 'No hay datos para el rango seleccionado.'}
      />

      <VentasStatsModal
        open={openStatsVentas}
        onClose={() => setOpenStatsVentas(false)}
        itemsPeriodo={itemsView}
        totalPeriodo={{ items: totalItems, ingreso: totalVentas }}
        historico={historicoRows}
        rangoLabel={rangoLabel}   
      />
    </>
  );
}



function MiniStat({ icon, title, primary, secondary }) {
  return (
    <div style={{
      background:'#ffffff',
      border:'1px solid #e2e8f0',
      borderRadius:14,
      padding:14,
      display:'grid',
      gridTemplateColumns:'36px 1fr',
      gap:10,
      alignItems:'center',
      boxShadow:'0 1px 2px rgba(0,0,0,0.03)'
    }}>
      <div style={{
        width:36, height:36, borderRadius:10,
        display:'grid', placeItems:'center',
        background:'#f1f5f9', color:'#0f172a', fontSize:18
      }}>{icon}</div>
      <div>
        <div style={{ fontSize:12, color:'#64748b', fontWeight:700, marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>{primary}</div>
        {secondary && <div style={{ fontSize:12, color:'#475569', marginTop:2 }}>{secondary}</div>}
      </div>
    </div>
  );
}  

/* ========================= Top ========================= */
function TopTab() {
  const [criterio, setCriterio] = useState('cantidad');
  const [periodo, setPeriodo] = useState('dia');

  const [dia, setDia] = useState(todayISO());
  const [anio, setAnio] = useState(currentYear());
  const [mes, setMes] = useState(currentMonth());
  const [semana, setSemana] = useState(currentISOWeek());

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [topPlatillos, setTopPlatillos] = useState([]);
  const [topBebidas, setTopBebidas] = useState([]);
  const [ganadoresPlatillos, setGanadoresPlatillos] = useState([]);
  const [ganadoresBebidas, setGanadoresBebidas] = useState([]);

  /* ⬇️ abrir/cerrar modal de estadísticas */
  const [openStats, setOpenStats] = useState(false);

  useEffect(() => { setDesde(''); setHasta(''); }, [periodo, dia, anio, mes, semana]);

  const fetchTop = useCallback(async () => {
    setLoading(true);
    try {
      const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
      const paramsBase = { periodo, criterio, limit, ...periodoParams };
      const [plat, beb] = await Promise.all([
        http.get('/reportes/top', { params: { ...paramsBase, tipo: 'PLATILLO' } }),
        http.get('/reportes/top', { params: { ...paramsBase, tipo: 'BEBIDA' } }),
      ]);

      setTopPlatillos(plat?.data?.topGlobal || []);
      setTopBebidas(beb?.data?.topGlobal || []);
      setGanadoresPlatillos(plat?.data?.ganadoresPorPeriodo || []);
      setGanadoresBebidas(beb?.data?.ganadoresPorPeriodo || []);
    } catch (e) {
      console.error(e);
      setTopPlatillos([]); setTopBebidas([]);
      setGanadoresPlatillos([]); setGanadoresBebidas([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, dia, anio, mes, semana, desde, hasta, criterio, limit]);

  function exportar(tipoArchivo, categoria) {
    const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
    const params = { periodo, criterio, limit, ...periodoParams, tipo: categoria };
    const ext = tipoArchivo === 'excel' ? 'xlsx' : 'pdf';
    downloadFirstAvailable([`/reportes/top/export/${tipoArchivo}`], params, `top_${categoria.toLowerCase()}_${periodo}.${ext}`)
      .catch(e => console.error('[export top] error', e));
  }

  useEffect(() => { fetchTop(); }, [fetchTop]);

  // -------- Etiqueta visible del rango seleccionado --------
  const rangoLabel = useMemo(() => {
    const d = (desde || '').trim();
    const h = (hasta || '').trim();

    const fmtFechaCortaES = (ymdStr) => {
      if (!ymdStr) return '';
      const [Y, M, D] = ymdStr.split('-').map(Number);
      const dd = new Date(Y, (M || 1) - 1, D || 1);
      if (isNaN(dd)) return ymdStr;
      return `${String(D).padStart(2, '0')} de ${MONTHS_ES[(M || 1) - 1]} de ${Y}`;
    };

    if (d || h) {
      if (d && h) return `Rango seleccionado: del ${fmtFechaCortaES(d)} al ${fmtFechaCortaES(h)}`;
      if (d)      return `Rango seleccionado: desde el ${fmtFechaCortaES(d)}`;
      if (h)      return `Rango seleccionado: hasta el ${fmtFechaCortaES(h)}`;
    }

    if (periodo === 'dia') {
      const only = dia || todayISO();
      return `Rango seleccionado: ${fmtDiaLargoES(only)}`;
    }
    if (periodo === 'semana') {
      const y = Number(anio) || currentYear();
      const w = Number(semana) || currentISOWeek();
      const { desde: d1, hasta: d2 } = getISOWeekRange(y, w);
      return `Rango seleccionado: Semana ${w}, ${y} (del ${fmtFechaCortaES(d1)} al ${fmtFechaCortaES(d2)})`;
    }
    if (periodo === 'mes') {
      const y = Number(anio) || currentYear();
      const m = Number(mes) || currentMonth();
      return `Rango seleccionado: ${MONTHS_ES[m - 1]} de ${y}`;
    }
    return '';
  }, [periodo, dia, anio, mes, semana, desde, hasta]);

  return (
    <>
      <FiltrosBar>
        <Select label="Periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} options={PERIODOS} />
        {periodo === 'dia' && <DateInput label="Día" value={dia} onChange={e => setDia(e.target.value)} />}
        {periodo === 'semana' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <NumberInput label="Semana" value={semana} onChange={e => setSemana(Number(e.target.value || 0))} min={1} max={53} />
          </>
        )}
        {periodo === 'mes' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <Select label="Mes" value={mes} onChange={e => setMes(Number(e.target.value))} options={MESES} />
          </>
        )}

        <DateInput label="Desde (manual)" value={desde} onChange={e => setDesde(e.target.value)} />
        <DateInput label="Hasta (manual)" value={hasta} onChange={e => setHasta(e.target.value)} />

        <Select label="Criterio" value={criterio} onChange={e => setCriterio(e.target.value)} options={CRITERIOS} />
        <NumberInput label="Top" value={limit} onChange={e => setLimit(Number(e.target.value || 0))} min={1} max={50} />
        <button onClick={fetchTop} disabled={loading} style={btnPrimary}>
          {loading ? 'Cargando...' : 'Aplicar'}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => exportar('pdf', 'PLATILLO')} style={btnGhost}>PDF (Platillos)</button>
          <button onClick={() => exportar('excel', 'PLATILLO')} style={btnGhost}>Excel (Platillos)</button>
          <button onClick={() => exportar('pdf', 'BEBIDA')} style={btnGhost}>PDF (Bebidas)</button>
          <button onClick={() => exportar('excel', 'BEBIDA')} style={btnGhost}>Excel (Bebidas)</button>

          {/* ⬇️ Botón de estadísticas */}
          <button
            onClick={() => setOpenStats(true)}
            style={{ ...btnPrimary, background:'#0ea5e9', borderColor:'#0ea5e9' }}
          >
            Estadísticas
          </button>
        </div>
      </FiltrosBar>

      {/* 👇 Etiqueta del rango seleccionado visible */}
      {rangoLabel && (
        <div style={{ marginTop: 6, color:'#64748b', fontWeight: 600 }}>
          {rangoLabel}
        </div>
      )}

      <h3 style={{ marginTop: 6 }}>🍽️ Top platillos</h3>
      <Table
        columns={[
          { key: 'nombre', title: 'Nombre' },
          { key: 'cantidad', title: 'Cantidad', align: 'right' },
          { key: 'ingreso', title: 'Ingreso', render: v => fmtCurrency(v), align: 'right' },
        ]}
        data={topPlatillos}
        emptyText="No hay datos."
      />

      <h3 style={{ marginTop: 24 }}>🥇 Ganador por {periodo} (Platillos)</h3>
      <Table
        columns={[
          { key: 'periodo', title: 'Periodo' },
          { key: 'ganador', title: 'Ganador', render: (g) => g ? `${g.nombre} (${g.cantidad}) — ${fmtCurrency(g.ingreso)}` : '—' },
        ]}
        data={ganadoresPlatillos.map(x => ({ periodo: x.periodo, ganador: x.ganador }))}
        emptyText="Sin ganadores para el rango."
      />

      <h3 style={{ marginTop: 32 }}>🥤 Top bebidas</h3>
      <Table
        columns={[
          { key: 'nombre', title: 'Nombre' },
          { key: 'cantidad', title: 'Cantidad', align: 'right' },
          { key: 'ingreso', title: 'Ingreso', render: v => fmtCurrency(v), align: 'right' },
        ]}
        data={topBebidas}
        emptyText="No hay datos."
      />

      <h3 style={{ marginTop: 24 }}>🥇 Ganador por {periodo} (Bebidas)</h3>
      <Table
        columns={[
          { key: 'periodo', title: 'Periodo' },
          { key: 'ganador', title: 'Ganador', render: (g) => g ? `${g.nombre} (${g.cantidad}) — ${fmtCurrency(g.ingreso)}` : '—' },
        ]}
        data={ganadoresBebidas.map(x => ({ periodo: x.periodo, ganador: x.ganador }))}
        emptyText="Sin ganadores para el rango."
      />

      {/* ⬇️ Modal con gráficas */}
      <EstadisticasModal
        open={openStats}
        onClose={() => setOpenStats(false)}
        platillos={topPlatillos}
        bebidas={topBebidas}
        criterio={criterio}
        titulo={`Top ventas (${periodo})`}
        rangoLabel={rangoLabel}   /* <- pasa el texto del rango */
      />
    </>
  );
}

/* ========================= Tiempos (ACTUALIZADO) ========================= */
function TiemposTab() {
  // periodo
  const [periodo, setPeriodo] = useState('dia');
  const [dia, setDia] = useState(todayISO());
  const [anio, setAnio] = useState(currentYear());
  const [mes, setMes] = useState(currentMonth());
  const [semana, setSemana] = useState(currentISOWeek());
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // filtros backend
  const nivel = 'itemDetalle'; // fijo; si luego abres selector, cambia a useState
  const [tipo, setTipo] = useState('TODOS');             // TODOS | PLATILLO | BEBIDA
  const [empleadoSel, setEmpleadoSel] = useState('');    // qStaff (nombre contiene)
  const [qItem, setQItem] = useState('');                // qItem (contiene)

  // catálogos
  const [empleados, setEmpleados] = useState([]);        // [{id|null, nombre, rol}]

  // datos
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => { setDesde(''); setHasta(''); }, [periodo, dia, anio, mes, semana]);

  const periodoParams = useMemo(() => buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta }),
    [periodo, dia, anio, mes, semana, desde, hasta]);

  // cargar EMPLEADOS cada que cambia el rango o la categoría (tipo)
  useEffect(() => {
    async function loadEmps() {
      try {
        const { data } = await http.get('/reportes/catalogos/empleados', {
          params: { desde: periodoParams.desde, hasta: periodoParams.hasta, tipo }
        });
        setEmpleados(Array.isArray(data?.empleados) ? data.empleados : []);
        if (empleadoSel) {
          const nombres = new Set((data?.empleados || []).map(e => e.nombre));
          if (!nombres.has(empleadoSel)) setEmpleadoSel('');
        }
      } catch (e) {
        console.error('[cat empleados]', e?.response?.data || e?.message);
      }
    }
    loadEmps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoParams.desde, periodoParams.hasta, tipo]);

  /** Normaliza tiempos (para cualquier nivel) usando preparandoEn como inicio real */
  function normalizeRows(rawRows) {
    if (!Array.isArray(rawRows)) return [];
    return rawRows.map(r => {
      const inicio = getItemStart(r);
      const fin = getItemEnd(r);
      const duracionMs = Number(r?.duracionMs ?? computeMs(inicio, fin));
      const duracionHMS = r?.duracionHMS || durationFromDates(inicio, fin);

      const row = { ...r };

      if (nivel === 'itemDetalle') {
        row.inicio = inicio;
        row.fin = fin;
        row.duracionMs = duracionMs;
        row.duracionHMS = duracionHMS;
      } else if (nivel === 'orden') {
        row.inicio = r.inicio || inicio;
        row.fin = r.fin || fin;
        row.duracionMs = Number(r.duracionMs ?? computeMs(row.inicio, row.fin));
        row._dur = durationFromDates(row.inicio, row.fin);
      } else {
        row.avgHMSOrden = r.avgHMSOrden || (r.avgMsOrden ? fmtDuration(r.avgMsOrden) : '');
        row.avgHMSItem  = r.avgHMSItem  || (r.avgMsItem  ? fmtDuration(r.avgMsItem)  : '');
      }

      if (typeof row.mesa === 'number') {
        row.mesa = row.mesa === 0 ? 'Pedido en línea' : `Mesa ${row.mesa}`;
      }
      return row;
    });
  }

  const fetchTiempos = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        nivel,
        tipo,
        qStaff: empleadoSel || undefined,
        qItem: qItem || undefined,
        desde: periodoParams.desde || undefined,
        hasta: periodoParams.hasta || undefined,
      };
      const { data } = await getFirstAvailable(['/reportes/tiempos'], params);
      const raw = Array.isArray(data?.rows) ? data.rows : [];
      const rowsNorm = normalizeRows(raw);
      setRows(rowsNorm);
      setMetrics(data?.metrics || null);
    } catch (e) {
      console.error('[tiempos] error', e);
      setRows([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [nivel, tipo, empleadoSel, qItem, periodoParams.desde, periodoParams.hasta]);

  function exportar(tipoArchivo) {
    const params = {
      nivel,
      tipo,
      qStaff: empleadoSel || undefined,
      qItem: qItem || undefined,
      desde: periodoParams.desde || undefined,
      hasta: periodoParams.hasta || undefined,
    };
    const ext = tipoArchivo === 'excel' ? 'xlsx' : 'pdf';
    downloadFirstAvailable([`/reportes/tiempos/export/${tipoArchivo}`], params, `tiempos_${nivel}.${ext}`)
      .catch(e => console.error('[export tiempos] error', e));
  }

  useEffect(() => { fetchTiempos(); }, [fetchTiempos]);

  const kpis = useMemo(() => {
    if (metrics) {
      return {
        count: Number(metrics.count || (rows?.length || 0)),
        avg: Number(metrics.avgMs || 0),
        max: Number(metrics.maxMs || 0),
      };
    }
    if (!rows?.length) return { count: 0, avg: 0, max: 0 };

    let arr = [];
    if (nivel === 'orden') {
      arr = rows.map(r => Number(r.duracionMs || computeMs(r.inicio, r.fin) || 0));
    } else if (nivel === 'itemDetalle') {
      arr = rows.map(r => Number(r.duracionMs || computeMs(getItemStart(r), getItemEnd(r)) || 0));
    } else {
      arr = rows.map(r => Number(r.avgMsOrden || 0));
    }

    const count = (nivel === 'orden' || nivel === 'itemDetalle')
      ? rows.length
      : rows.reduce((a, r) => a + Number(r.ordenes || 0), 0);

    const avg = arr.reduce((a,b)=>a+b,0) / Math.max(1, arr.length);
    const max = arr.length ? Math.max(...arr) : 0;
    return { count, avg, max };
  }, [metrics, rows, nivel]);

  const columnsOrden = [
    { key: 'codigo', title: 'Código' },
    { key: 'mesa', title: 'Mesa' },
    { key: 'inicio', title: 'Inicio', render: v => v ? new Date(v).toLocaleString('es-GT') : '' },
    { key: 'fin', title: 'Fin', render: v => v ? new Date(v).toLocaleString('es-GT') : '' },
    { key: '_dur', title: 'Duración', align: 'right', render: (_, row) => row._dur || durationFromDates(row.inicio, row.fin) },
    { key: 'items', title: 'Ítems', align: 'right' },
    { key: 'atendidoPor', title: 'Atendido por' },
  ];

  const columnsItem = [
    { key: 'tipo', title: 'Tipo' },
    { key: 'nombre', title: 'Nombre' },
    { key: 'ordenes', title: '# Órdenes', align: 'right' },
    { key: 'itemsTotales', title: 'Ítems totales', align: 'right' },
    { key: 'avgHMSOrden', title: 'Prom. por orden', align: 'right' },
    { key: 'avgHMSItem', title: 'Prom. por ítem', align: 'right' },
  ];

  const columnsStaff = [
    { key: 'staff', title: 'Empleado' },
    { key: 'tipo', title: 'Tipo' },
    { key: 'ordenes', title: '# Órdenes', align: 'right' },
    { key: 'itemsTotales', title: 'Ítems totales', align: 'right' },
    { key: 'avgHMSOrden', title: 'Prom. por orden', align: 'right' },
    { key: 'avgHMSItem', title: 'Prom. por ítem', align: 'right' },
  ];

  const columnsItemDetalle = [
    { key: 'codigo', title: 'Código' },
    { key: 'mesa', title: 'Mesa', render: v => (v ?? '') },
    { key: 'tipo', title: 'Tipo' },
    { key: 'item', title: 'Ítem' },
    { key: 'staff', title: 'Staff' },
    { key: 'inicio', title: 'Inicio', render: v => v ? new Date(v).toLocaleString('es-GT') : '' },
    { key: 'fin', title: 'Fin', render: v => v ? new Date(v).toLocaleString('es-GT') : '' },
    { key: 'duracionHMS', title: 'Duración', align: 'right', render: (v, row) => v || durationFromDates(row.inicio, row.fin) },
  ];

  // Vista DESC según nivel (ordenamos por 'inicio' cuando aplica)
  const rowsViewTiempos = useMemo(() => {
    if (nivel === 'orden') return sortByDateDesc(rows, ['inicio', 'creadoEn', 'createdAt']);
    if (nivel === 'itemDetalle') return sortByDateDesc(rows, ['inicio', 'creadoEn', 'createdAt']);
    return rows; // agregados: respetamos orden del backend
  }, [rows, nivel]);

  return (
    <>
      <FiltrosBar>
        <Select label="Periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} options={PERIODOS} />
        {periodo === 'dia' && <DateInput label="Día" value={dia} onChange={e => setDia(e.target.value)} />}
        {periodo === 'semana' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <NumberInput label="Semana" value={semana} onChange={e => setSemana(Number(e.target.value || 0))} min={1} max={53} />
          </>
        )}
        {periodo === 'mes' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <Select label="Mes" value={mes} onChange={e => setMes(Number(e.target.value))} options={MESES} />
          </>
        )}

        <DateInput label="Desde (manual)" value={desde} onChange={e => setDesde(e.target.value)} />
        <DateInput label="Hasta (manual)" value={hasta} onChange={e => setHasta(e.target.value)} />

        {/* Quitamos "Agrupar por" y "Producto específico" como pediste */}
        <Select label="Categoría" value={tipo} onChange={e => setTipo(e.target.value)} options={TIPOS_TIEMPO} />

        {/* Empleado (preparador) */}
        <Labeled label="Empleado">
          <select value={empleadoSel} onChange={e => setEmpleadoSel(e.target.value)} style={inputBase}>
            <option value="">Todos</option>
            {empleados.map(emp => (
              <option key={(emp.id ?? emp.nombre) + ''} value={emp.nombre}>
                {emp.nombre} {emp.rol ? `(${emp.rol === 'COCINERO' ? 'Cocinero' : 'Bartender'})` : ''}
              </option>
            ))}
          </select>
        </Labeled>

        <TextInput label="Buscar ítem (contiene)" value={qItem} onChange={e => setQItem(e.target.value)} placeholder="Ej. licuado" />

        <button onClick={fetchTiempos} disabled={loading} style={btnPrimary}>
          {loading ? 'Cargando...' : 'Aplicar'}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => exportar('pdf')} style={btnGhost}>Exportar PDF</button>
        <button onClick={() => exportar('excel')} style={btnGhost}>Exportar Excel</button>
      </FiltrosBar>

      <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KPI label={nivel === 'itemDetalle' ? 'Ítems' : 'Órdenes'} value={Number(kpis.count || 0).toLocaleString('es-GT')} />
        <KPI label="Promedio" value={fmtDuration(kpis.avg)} />
        <KPI label="Máximo" value={fmtDuration(kpis.max)} />
      </div>

      {nivel === 'orden' && (
        <Table
          columns={columnsOrden}
          data={rowsViewTiempos}
          emptyText={loading ? 'Cargando…' : 'No hay datos para el rango seleccionado.'}
        />
      )}
      {nivel === 'item' && (
        <Table
          columns={columnsItem}
          data={rowsViewTiempos}
          emptyText={loading ? 'Cargando…' : 'No hay datos para el rango seleccionado.'}
        />
      )}
      {nivel === 'staff' && (
        <Table
          columns={columnsStaff}
          data={rowsViewTiempos}
          emptyText={loading ? 'Cargando…' : 'No hay datos para el rango seleccionado.'}
        />
      )}
      {nivel === 'itemDetalle' && (
        <Table
          columns={columnsItemDetalle}
          data={rowsViewTiempos}
          emptyText={loading ? 'Cargando…' : 'No hay ítems en el rango seleccionado.'}
        />
      )}
    </>
  );
}

/* ========================= Comprobantes ========================= */
function ComprobantesTab() {
  const [periodo, setPeriodo] = useState('dia');

  const [dia, setDia] = useState(todayISO());
  const [anio, setAnio] = useState(currentYear());
  const [mes, setMes] = useState(currentMonth());
  const [semana, setSemana] = useState(currentISOWeek());

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [buscar, setBuscar] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const iframeRef = useRef(null);

  useEffect(() => { setDesde(''); setHasta(''); }, [periodo, dia, anio, mes, semana]);

  const fetchComprobantes = useCallback(async () => {
    setLoading(true);
    try {
      const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
      const params = { ...periodoParams, buscar, modo: 'auto' };
      if (metodoPago) {
        params.metodoPago = metodoPago;
        params.metodo     = metodoPago;
      }
      const { data } = await getFirstAvailable(['/reportes/comprobantes'], params);
      const listRaw = Array.isArray(data?.data) ? data.data : [];

      const list = listRaw.map(r => {
        const mp = String(r.metodoPago ?? r.pago ?? '').toUpperCase();
        return {
          ...r,
          metodoPago: mp || '',
          mesaNumero: r.mesaNumero ?? r.mesa,
        };
      });

      setRows(list);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, dia, anio, mes, semana, desde, hasta, buscar, metodoPago]);

  // Filtrar por método (si aplica) y ORDEN DESC por fecha
  const rowsView = useMemo(() => {
    const base = (!metodoPago)
      ? rows
      : rows.filter(r => (r.metodoPago || '').toUpperCase() === metodoPago);
    return sortByDateDesc(base, ['fecha', 'fechaPago', 'createdAt']);
  }, [rows, metodoPago]);

  function exportar(tipo) {
    const periodoParams = buildPeriodoParams({ periodo, dia, anio, mes, semana, desde, hasta });
    const params = { ...periodoParams, q: buscar };
    if (metodoPago) {
      params.metodoPago = metodoPago;
      params.metodo     = metodoPago;
    }
    const ext = tipo === 'excel' ? 'xlsx' : 'pdf';
    downloadFirstAvailable([`/ticket-ventas/export/${tipo}`], params, `comprobantes.${ext}`)
      .catch(e => console.error('[export comprobantes] error', e));
  }

  async function verTicket(row) {
    const id = row?.id || row?.ticketId;
    if (!id) { alert('No se encontró el ID del ticket.'); return; }
    const base = (http.defaults?.baseURL || '').replace(/\/+$/,'');
    const baseSinApi = base.replace(/\/api$/,'');
    const candidatos = [
      `${base}/ticket-ventas/${id}/print`,
      `${base}/api/ticket-ventas/${id}/print`,
      `${baseSinApi}/ticket-ventas/${id}/print`,
    ];
    let html = '';
    for (const url of candidatos) {
      try {
        const res = await http.get(url, {
          responseType: 'text',
          transformResponse: v => v,
          headers: { Accept: 'text/html' },
        });
        if (typeof res.data === 'string' && res.data.includes('<html')) {
          html = res.data; break;
        }
      } catch (_) {}
    }
    if (!html) {
      html = buildTicketHTMLFromTicket({
        id,
        fechaPago: row.fecha || row.fechaPago || Date.now(),
        metodoPago: row.metodoPago || row.pago,
        totalAPagar: row.total,
        posCorrelativo: row.posCorrelativo,
        orden: {
          id: row.ordenId || null,
          codigo: row.serie || row.codigo || row?.orden?.codigo || '',
          mesa: typeof row.mesaNumero === 'number' ? row.mesaNumero : (typeof row.mesa === 'number' ? row.mesa : 0),
          items: (row.items || []).map(it => ({ nombre: it.nombre, precio: Number(it.precio || 0), nota: it.nota }))
        }
      });
    }
    setPreviewHtml(injectTicketPreviewCSS(html));
    setPreviewOpen(true);
  }

  function imprimirPreview() {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  }

  useEffect(() => { fetchComprobantes(); }, [fetchComprobantes]);

  return (
    <>
      <FiltrosBar>
        <Select label="Periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} options={PERIODOS} />

        {periodo === 'dia' && <DateInput label="Día" value={dia} onChange={e => setDia(e.target.value)} />}
        {periodo === 'semana' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <NumberInput label="Semana" value={semana} onChange={e => setSemana(Number(e.target.value || 0))} min={1} max={53} />
          </>
        )}
        {periodo === 'mes' && (
          <>
            <NumberInput label="Año" value={anio} onChange={e => setAnio(Number(e.target.value || 0))} min={2000} max={2100} />
            <Select label="Mes" value={mes} onChange={e => setMes(Number(e.target.value))} options={MESES} />
          </>
        )}

        <DateInput label="Desde (manual)" value={desde} onChange={e => setDesde(e.target.value)} />
        <DateInput label="Hasta (manual)" value={hasta} onChange={e => setHasta(e.target.value)} />

        <TextInput label="Buscar" placeholder="Serie o número..." value={buscar} onChange={e => setBuscar(e.target.value)} />
        <Select
          label="Método de pago"
          value={metodoPago}
          onChange={e => setMetodoPago(e.target.value)}
          options={[
            { value: '', label: 'Todos' },
            { value: 'EFECTIVO', label: 'Efectivo' },
            { value: 'TARJETA', label: 'Tarjeta' },
          ]}
        />
        <button onClick={fetchComprobantes} disabled={loading} style={btnPrimary}>{loading ? 'Cargando...' : 'Aplicar'}</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => exportar('pdf')} style={btnGhost}>Exportar PDF</button>
        <button onClick={() => exportar('excel')} style={btnGhost}>Exportar Excel</button>
      </FiltrosBar>

      <Table
        columns={[
          { key: 'fecha', title: 'Fecha', render: v => (v ? new Date(v).toLocaleString('es-GT') : '—') },
          { key: 'serie', title: 'Serie', render: v => v || '—' },
          { key: 'mesaNumero', title: 'Número de Mesa', render: v => (v ?? '—') },
          { key: 'metodoPago', title: 'Pago', render: v => v || '—' },
          { key: 'total', title: 'Total', render: v => fmtCurrency(v), align: 'right' },
          {
            key: '_acciones',
            title: '',
            align: 'right',
            render: (_, row) => (
              <button onClick={() => verTicket(row)} style={{ ...btnGhost, padding: '6px 10px' }}>
                Ver
              </button>
            )
          },
        ]}
        data={rowsView}
        emptyText="No hay comprobantes en el rango."
      />

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Ticket de venta">
        {previewHtml ? (
          <>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-start' }}>
              <button onClick={imprimirPreview} style={btnPrimary}>Imprimir</button>
            </div>
            <div style={{ marginTop: 14, border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', padding:8 }}>
              <iframe ref={iframeRef} title="preview-ticket" srcDoc={previewHtml} style={{ width: '100%', height: '70vh', border: 'none' }} />
            </div>
          </>
        ) : (
          <div>No se pudo cargar el ticket.</div>
        )}
      </Modal>
    </>
  );
}

/* ========================= UI Utils ========================= */
function FiltrosBar({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap',
      padding: '12px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0'
    }}>
      {children}
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '12px 14px',
      minWidth: 220
    }}>
      <div style={{ fontSize: 12, color: '#475569' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>{value}</div>
    </div>
  );
}
function Table({ columns, data, emptyText }) {
  return (
    <div style={{ marginTop: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align || 'left',
                  padding: '10px 12px',
                  background: '#f1f5f9',
                  color: '#334155',
                  fontWeight: 700,
                  borderBottom: '1px solid #e2e8f0'
                }}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(!data || data.length === 0) ? (
            <tr><td colSpan={columns.length} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>{emptyText || 'Sin datos.'}</td></tr>
          ) : data.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              {columns.map(col => (
                <td key={col.key} style={{ padding: '10px 12px', textAlign: col.align || 'left', whiteSpace: 'nowrap' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Labeled({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160, ...style }}>
      <span style={{ fontSize: 12, color: '#475569' }}>{label}</span>
      {children}
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <Labeled label={label}>
      <select value={value} onChange={onChange} style={inputBase}>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </Labeled>
  );
}
function DateInput({ label, value, onChange }) {
  return (
    <Labeled label={label}>
      <input type="date" value={value} onChange={onChange} style={inputBase} />
    </Labeled>
  );
}
function NumberInput({ label, value, onChange, min = 1, max = 50 }) {
  return (
    <Labeled label={label} style={{ minWidth: 100 }}>
      <input type="number" value={value} onChange={onChange} min={min} max={max} style={inputBase} />
    </Labeled>
  );
}
function TextInput({ label, value, onChange, placeholder }) {
  return (
    <Labeled label={label} style={{ minWidth: 160 }}>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} style={inputBase} />
    </Labeled>
  );
}

// ⬇️ Reemplaza la firma y el header del Modal
function Modal({ open, onClose, title, children, scrollable = false, actions = null }) {
  if (!open) return null;
  const TOP_GAP = 28;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: TOP_GAP, paddingBottom: 24, paddingLeft: 12, paddingRight: 12,
      background: 'rgba(0,0,0,0.40)', overflowY: scrollable ? 'auto' : 'hidden'
    }}>
      <div style={{
        background: 'white', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        width: '95vw', maxWidth: 1100, margin: 'auto', padding: '20px', overflow: 'hidden', 
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #e2e8f0', marginBottom: 16, gap: 8
        }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* ⬇️ aquí renderizamos acciones adicionales (ej. Exportar) */}
            {actions}
            {/* ⬇️ botón cerrar fijo del modal */}
            <button onClick={onClose} style={{ ...btnGhost, padding: '8px 12px' }}>Cerrar</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function EstadisticasModal({
  open,
  onClose,
  platillos = [],
  bebidas = [],
  criterio = 'cantidad',
  titulo = 'Resumen gráfico',
  rangoLabel = ''   // 👈 nuevo
}) {
  if (!open) return null;

  const rowsP = (Array.isArray(platillos) ? platillos : []).map(x => ({ ...x, tipo: 'PLATILLO' }));
  const rowsB = (Array.isArray(bebidas)   ? bebidas   : []).map(x => ({ ...x, tipo: 'BEBIDA' }));

  const key = criterio === 'ingreso' ? 'ingreso' : 'cantidad';

  const topComb = [...rowsP, ...rowsB]
    .map(x => ({
      nombre: x.nombre,
      cantidad: Number(x.cantidad || 0),
      ingreso:  Number(x.ingreso  || 0),
      tipo: x.tipo,
    }))
    .sort((a, b) => b[key] - a[key])
    .slice(0, 10);

  const totPlatillos = rowsP.reduce((s, x) => s + Number(x.ingreso || 0), 0);
  const totBebidas  = rowsB.reduce((s, x) => s + Number(x.ingreso || 0), 0);

  const pieData = [
    { name: 'Platillos', value: totPlatillos },
    { name: 'Bebidas',  value: totBebidas  },
  ];

  const totalItems = [...rowsP, ...rowsB].reduce((s, x) => s + Number(x.cantidad || 0), 0);
  const totalIngreso = totPlatillos + totBebidas;

  // ---------- EXPORTAR A PDF ----------
  async function exportToPDF() {
    const elem = document.getElementById('statsContent');
    if (!elem) return;

    const unfreeze = freezeRechartsSizes(elem);
    await new Promise(r => setTimeout(r, 60));
    window.dispatchEvent(new Event('resize'));

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;

    try {
      const canvas = await html2canvas(elem, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        onclone: (doc) => {
          const root = doc.getElementById('statsContent');
          if (root) {
            root.style.maxWidth = '900px';
            root.style.margin = '0 auto';
            root.style.padding = '8px';
          }
          doc.querySelectorAll('.pdf-two').forEach(el => {
            el.style.gridTemplateColumns = '1fr';
            el.style.gap = '12px';
          });
          doc.querySelectorAll('.recharts-tooltip-wrapper, .recharts-default-tooltip, .recharts-crosshair')
            .forEach(n => { n.style.display = 'none'; n.style.opacity = '0'; n.style.visibility = 'hidden'; });
          doc.querySelectorAll('.recharts-responsive-container').forEach(rc => {
            const rect = rc.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width || 860));
            const h = Math.max(1, Math.round(rect.height || 300));
            rc.style.width = `${w}px`;
            rc.style.height = `${h}px`;
            const wrap = rc.querySelector('.recharts-wrapper');
            if (wrap) {
              wrap.style.width = `${w}px`;
              wrap.style.height = `${h}px`;
            }
          });
          doc.querySelectorAll('.pie-fixed').forEach(box => {
            const W = 360, H = 300;
            box.style.width = `${W}px`;
            box.style.height = `${H}px`;
            const rc = box.querySelector('.recharts-responsive-container');
            if (rc) {
              rc.style.width = `${W}px`;
              rc.style.height = `${H}px`;
              const wrap = rc.querySelector('.recharts-wrapper');
              if (wrap) {
                wrap.style.width = `${W}px`;
                wrap.style.height = `${H}px`;
              }
              const svg = rc.querySelector('svg');
              if (svg) {
                svg.setAttribute('width', String(W));
                svg.setAttribute('height', String(H));
                svg.style.width = `${W}px`;
                svg.style.height = `${H}px`;
                if (!svg.getAttribute('viewBox')) {
                  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
                }
                svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
              }
            }
          });
          doc.querySelectorAll('.recharts-pie .recharts-sector').forEach(p => {
            p.style.fillOpacity = '1';
            p.style.opacity = '1';
          });
        },
      });

      const slicePxH = ((pageH - margin * 2) * canvas.width) / imgW;
      const addSlice = (yPx) => {
        const h = Math.min(slicePxH, canvas.height - yPx);
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
        const img = c.toDataURL('image/jpeg', 0.98);
        const partH = (h * imgW) / canvas.width;
        pdf.addImage(img, 'JPEG', margin, margin, imgW, partH, undefined, 'FAST');
        return yPx + h;
      };

      let y = 0;
      while (y < canvas.height) {
        if (y > 0) pdf.addPage();
        y = addSlice(y);
      }
      pdf.save('Estadisticas_Ventas.pdf');
    } finally {
      unfreeze();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Estadísticas"
      scrollable
      actions={
        <button
          onClick={exportToPDF}
          style={{ ...btnPrimary, padding: '8px 12px', background: '#16a34a', borderColor: '#16a34a' }}
        >
          📄 Exportar a PDF
        </button>
      }
    >
      {/* Contenedor exportable */}
      <div
        id="statsContent"
        style={{
          width: '100%',
          margin: 0,
          padding: 16,
          boxSizing: 'border-box',
          background: 'transparent',
          borderRadius: 0,
          maxWidth: 900,
          marginInline: 'auto'
        }}
      >
        <style>{`
          #statsContent .recharts-legend-wrapper svg { width: 14px !important; height: 14px !important; }
          #statsContent .recharts-legend-icon { transform: none !important; }
          #statsContent .recharts-wrapper { overflow: hidden !important; }
        `}</style>

        {/* Header */}
        <div style={{ marginTop: -8, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📊 {titulo}</h2>
          <div style={{ color:'#64748b', fontSize:13 }}>
            {rangoLabel ? rangoLabel : 'Vista resumida para gerencia'}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, margin:'12px 0' }}>
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:13, color:'#64748b' }}>Ingreso total</div>
            <div style={{ fontSize:28, fontWeight:800 }}>
              Q {totalIngreso.toLocaleString('es-GT', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:13, color:'#64748b' }}>Unidades vendidas</div>
            <div style={{ fontSize:28, fontWeight:800 }}>{totalItems.toLocaleString('es-GT')}</div>
          </div>
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:13, color:'#64748b' }}>Top mostrado</div>
            <div style={{ fontSize:28, fontWeight:800 }}>{topComb.length} ítems</div>
          </div>
        </div>

        {/* Gráficas */}
        <div className="pdf-two" style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16 }}>
          <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:14, padding:16 }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>
              {key === 'cantidad' ? 'Top por cantidad vendida' : 'Top por ingreso generado'}
            </div>
            <div style={{ width:'100%', height:280 }}>
              <ResponsiveContainer>
                <BarChart data={topComb} margin={{ top: 8, right: 28, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tickMargin={8}
                    padding={{ left: 18, right: 18 }}
                  />
                  <YAxis />
                  <Tooltip formatter={(v, n) => n === 'cantidad' ? [v, 'Cantidad'] : [fmtCurrency(v), 'Ingreso']} />
                  <Bar dataKey={key} radius={[6,6,0,0]}>
                    {topComb.map((d, i) => (
                      <Cell key={i} fill={d.tipo === 'BEBIDA' ? COLOR_BEBIDA : COLOR_PLATILLO} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:14, padding:16 }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Distribución de ingreso</div>
            <div className="pie-fixed" style={{ width: 360, height: 300, maxWidth: '100%' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.name === 'Bebidas' ? COLOR_BEBIDA : COLOR_PLATILLO} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v)=> fmtCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bebidas */}
        <div style={{ marginTop: 40 }}>
          <h3 style={{ marginBottom: 6 }}>🥤 Bebidas más vendidas</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={bebidas} margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="nombre"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tickMargin={8}
                  padding={{ left: 18, right: 18 }}
                />
                <YAxis />
                <Tooltip formatter={(v, n) => (n === 'cantidad' ? [v, 'Cantidad'] : [fmtCurrency(v), 'Ingreso'])} />
                <Bar dataKey={key} radius={[6,6,0,0]}>
                  {bebidas.map((_, i) => <Cell key={i} fill={COLOR_BEBIDA} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {bebidas.length > 0 && (
            <p style={{ color: '#475569', marginTop: 8 }}>
              🏆 La bebida más vendida fue <b>{bebidas[0].nombre}</b> con {bebidas[0].cantidad} unidades.
            </p>
          )}
        </div>

        {/* Platillos */}
        <div style={{ marginTop: 30 }}>
          <h3 style={{ marginBottom: 6 }}>🍽️ Comidas más vendidas</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={platillos} margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="nombre"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tickMargin={8}
                  padding={{ left: 18, right: 18 }}
                />
                <YAxis />
                <Tooltip formatter={(v, n) => (n === 'cantidad' ? [v, 'Cantidad'] : [fmtCurrency(v), 'Ingreso'])} />
                <Bar dataKey={key} radius={[6,6,0,0]}>
                  {platillos.map((_, i) => <Cell key={i} fill={COLOR_PLATILLO} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {platillos.length > 0 && (
            <p style={{ color: '#475569', marginTop: 8 }}>
              🏆 El platillo más vendido fue <b>{platillos[0].nombre}</b> con {platillos[0].cantidad} unidades.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}


// Congela tamaños reales de contenedores Recharts para html2canvas
function freezeRechartsSizes(root) {
  const els = Array.from(root.querySelectorAll('.recharts-responsive-container'));
  const applied = [];
  els.forEach((el) => {
    const wrap = el.querySelector('.recharts-wrapper');
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    // Guardar estilos previos para revertir
    applied.push({ el, prev: { width: el.style.width, height: el.style.height } });
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    if (wrap) {
      const prevW = wrap.style.width, prevH = wrap.style.height;
      applied.push({ el: wrap, prev: { width: prevW, height: prevH } });
      wrap.style.width = `${w}px`;
      wrap.style.height = `${h}px`;
      // Forzar atributos del SVG si existen
      const svg = wrap.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', `${w}`);
        svg.setAttribute('height', `${h}`);
        svg.style.width = `${w}px`;
        svg.style.height = `${h}px`;
      }
    }
  });
  return () => { // cleanup
    applied.forEach(({ el, prev }) => {
      el.style.width = prev.width || '';
      el.style.height = prev.height || '';
    });
  };
}


function VentasStatsModal({
  open,
  onClose,
  itemsPeriodo = [],
  totalPeriodo = { items: 0, ingreso: 0 },
  historico = [],
  rangoLabel = ''   // 👈 nuevo (lo mandas desde VentasTab)
}) {
  const [loadingMesas, setLoadingMesas] = React.useState(false);
  const [errMesas, setErrMesas] = React.useState('');

  const periodoItems = Number(totalPeriodo.items || itemsPeriodo.length || 0);
  const periodoIngreso = Number(
    totalPeriodo.ingreso ||
    itemsPeriodo.reduce((s, r) => s + Number(r.ingreso ?? r.total ?? 0), 0)
  );

  const topPeriodo = groupSum(itemsPeriodo, (r) => r.nombre || r.item || 'Sin nombre')
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, 10);

  const canalAgg = groupSum(itemsPeriodo, (r) => detectCanal(r)); // EN_LOCAL, EN_LINEA
  const loc = canalAgg.find((x) => x.key === 'EN_LOCAL') || { ingreso: 0, items: 0 };
  const onl = canalAgg.find((x) => x.key === 'EN_LINEA') || { ingreso: 0, items: 0 };
  const pct = (num, den) => (den > 0 ? ((num / den) * 100).toFixed(1) : '0.0');

  const { mejorDia, peorDia } = bestWorstByDay(historico);
  const { mejorMes, peorMes } = bestWorstByMonth(historico);
  const { mejorAnio, peorAnio } = bestWorstByYear(historico);

  const COLORS = ['#16a34a','#2563eb','#f59e0b','#ef4444','#14b8a6','#8b5cf6','#f97316','#22c55e','#3b82f6','#a855f7'];

  const pieData = [
    { name: 'En local', value: Number(loc.ingreso || 0) },
    { name: 'En línea', value: Number(onl.ingreso || 0) },
  ];

  // ---------- EXPORTAR A PDF ----------
  async function exportToPDF() {
    const elem = document.getElementById('ventasStatsContent');
    if (!elem) return;
    const unfreeze = freezeRechartsSizes(elem);
    await new Promise(r => setTimeout(r, 60));
    window.dispatchEvent(new Event('resize'));

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;

    try {
      const canvas = await html2canvas(elem, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        onclone: (doc) => {
          const root = doc.getElementById('ventasStatsContent');
          if (root) {
            root.style.maxWidth = '900px';
            root.style.margin = '0 auto';
            root.style.padding = '8px';
          }
          doc.querySelectorAll('.pdf-two').forEach(el => {
            el.style.gridTemplateColumns = '1fr';
            el.style.gap = '12px';
          });
          doc.querySelectorAll('.recharts-tooltip-wrapper, .recharts-default-tooltip, .recharts-crosshair')
            .forEach(n => { n.style.display = 'none'; n.style.opacity = '0'; n.style.visibility = 'hidden'; });
          doc.querySelectorAll('.recharts-responsive-container').forEach(rc => {
            const rect = rc.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width || 860));
            const h = Math.max(1, Math.round(rect.height || 300));
            rc.style.width = `${w}px`;
            rc.style.height = `${h}px`;
            const wrap = rc.querySelector('.recharts-wrapper');
            if (wrap) {
              wrap.style.width = `${w}px`;
              wrap.style.height = `${h}px`;
            }
          });
          doc.querySelectorAll('.pie-fixed').forEach(box => {
            const W = 360, H = 300;
            box.style.width = `${W}px`;
            box.style.height = `${H}px`;
            const rc = box.querySelector('.recharts-responsive-container');
            if (rc) {
              rc.style.width = `${W}px`;
              rc.style.height = `${H}px`;
              const wrap = rc.querySelector('.recharts-wrapper');
              if (wrap) {
                wrap.style.width = `${W}px`;
                wrap.style.height = `${H}px`;
              }
              const svg = rc.querySelector('svg');
              if (svg) {
                svg.setAttribute('width', String(W));
                svg.setAttribute('height', String(H));
                svg.style.width = `${W}px`;
                svg.style.height = `${H}px`;
                if (!svg.getAttribute('viewBox')) {
                  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
                }
                svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
              }
            }
          });
          doc.querySelectorAll('.recharts-pie .recharts-sector').forEach(p => {
            p.style.fillOpacity = '1';
            p.style.opacity = '1';
          });
        },
      });

      const slicePxH = ((pageH - margin * 2) * canvas.width) / imgW;
      const addSlice = (yPx) => {
        const h = Math.min(slicePxH, canvas.height - yPx);
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
        const img = c.toDataURL('image/jpeg', 0.98);
        const partH = (h * imgW) / canvas.width;
        pdf.addImage(img, 'JPEG', margin, margin, imgW, partH, undefined, 'FAST');
        return yPx + h;
      };

      let y = 0;
      while (y < canvas.height) { if (y > 0) pdf.addPage(); y = addSlice(y); }
      pdf.save('Estadisticas_Ventas.pdf');
    } finally {
      unfreeze();
    }
  }
  // ------------------------------------

  // === Mesas (REAL desde backend) ===
  const [mesasUso, setMesasUso] = React.useState([]);
  const fallbackMesas = React.useCallback(() => {
    const m = new Map();
    for (const r of itemsPeriodo || []) {
      const n = Number(r?.mesaNumero ?? r?.mesa ?? r?.orden?.mesa ?? 0);
      if (!Number.isFinite(n) || n <= 0) continue;
      m.set(n, (m.get(n) || 0) + 1);
    }
    return Array.from(m.entries()).map(([mesa, usos]) => ({ mesa, usos }))
      .sort((a, b) => b.usos - a.usos).slice(0, 5);
  }, [itemsPeriodo]);

  const fetchMesasUso = React.useCallback(async () => {
    if (!open) { setMesasUso(fallbackMesas()); return; }
    setLoadingMesas(true); setErrMesas('');
    try {
      const { data } = await http.get('/reportes/mesas/uso', { params: { take: 5 } });
      const arr = Array.isArray(data) ? data : [];
      setMesasUso(arr.length ? arr : fallbackMesas());
    } catch (e) {
      setErrMesas(e?.response?.data?.mensaje || e.message || 'Error cargando uso de mesas');
      setMesasUso(fallbackMesas());
    } finally { setLoadingMesas(false); }
  }, [open, fallbackMesas]);
  React.useEffect(() => { fetchMesasUso(); }, [fetchMesasUso]);

  function HistoricosSwitcher({ historico = [] }) {
    const [tab, setTab] = React.useState('dias'); // 'dias' | 'meses' | 'anios'
    const daily   = React.useMemo(() => buildDailySeries(historico),   [historico]);
    const monthly = React.useMemo(() => buildMonthlySeries(historico), [historico]);
    const yearly  = React.useMemo(() => buildYearlySeries(historico),  [historico]);

    const totalHist = React.useMemo(() => {
      const sum = (arr, key) => arr.reduce((s, r) => s + Number(r[key] || 0), 0);
      return sum(daily, 'ingreso') || sum(monthly, 'ingreso') || sum(yearly, 'ingreso') || 0;
    }, [daily, monthly, yearly]);

    const box = { background: '#fff', border: '1px solid #eef2f7', borderRadius: 12, padding: 12 };

    return (
      <div className="pdf-fit" style={{ ...box }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('dias')}
            style={{ ...btnGhost, padding: '6px 10px', ...(tab === 'dias' ? { background:'#1e3d59', color:'#fff', borderColor:'#1e3d59' } : {}) }}>
            Días (últimos 365)
          </button>
          <button onClick={() => setTab('meses')}
            style={{ ...btnGhost, padding: '6px 10px', ...(tab === 'meses' ? { background:'#1e3d59', color:'#fff', borderColor:'#1e3d59' } : {}) }}>
            Meses
          </button>
          <button onClick={() => setTab('anios')}
            style={{ ...btnGhost, padding: '6px 10px', ...(tab === 'anios' ? { background:'#1e3d59', color:'#fff', borderColor:'#1e3d59' } : {}) }}>
            Años
          </button>
        </div>

        <div style={{ margin: '8px 0 12px', color: '#475569', fontWeight: 700 }}>
          Total histórico: {fmtCurrency(totalHist)}
        </div>

        {tab === 'dias' && (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={shortDateLabel} minTickGap={24} />
                <YAxis tickFormatter={(v) => fmtGTQ(v)} />
                <Tooltip labelFormatter={shortDateLabel} formatter={(v) => [fmtGTQ(v), 'Ingreso']} />
                <Area type="monotone" dataKey="ingreso" stroke="#2563eb" fill="#93c5fd80" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {tab === 'meses' && (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => fmtGTQ(v)} />
                <Tooltip formatter={(v) => [fmtGTQ(v), 'Ingreso']} />
                <Bar dataKey="ingreso" radius={[6,6,0,0]} isAnimationActive={false}>
                  {topPeriodo.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {tab === 'anios' && (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={yearly} margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="anio" />
                <YAxis tickFormatter={(v) => fmtGTQ(v)} />
                <Tooltip formatter={(v) => [fmtGTQ(v), 'Ingreso']} />
                <Line type="monotone" dataKey="ingreso" stroke="#f59e0b" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  const kpiCard = (bg, border) => ({
    background: bg,
    border: `1px solid ${border}33`,
    borderRadius: 12,
    padding: 12,
  });
  const kpiLabel = { fontSize: 12, color: '#64748b' };
  const kpiValue = { fontSize: 24, fontWeight: 800, lineHeight: 1.1 };
  const kpiSub = { fontWeight: 600, color: '#64748b', fontSize: 12 };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Estadísticas de Ventas"
      scrollable
      actions={
        <button
          onClick={exportToPDF}
          style={{ ...btnPrimary, padding: '8px 12px', background: '#16a34a', borderColor: '#16a34a' }}
        >
          📄 Exportar a PDF
        </button>
      }
    >
      {/* Contenedor capturable para PDF */}
      <div
        id="ventasStatsContent"
        style={{
          width: '100%',
          padding: 8,
          maxWidth: 900,
          margin: '0 auto',
          boxSizing: 'border-box',
          background: 'transparent',
          borderRadius: 0,
        }}
      >
        <style>{`
          #ventasStatsContent .recharts-legend-wrapper svg { width: 14px !important; height: 14px !important; }
          #ventasStatsContent .recharts-legend-icon { transform: none !important; }
          #ventasStatsContent .recharts-wrapper { overflow: hidden !important; }
        `}</style>

        {/* Rango seleccionado (subtítulo) */}
        {rangoLabel && (
          <div style={{ color:'#64748b', fontWeight:600, marginBottom:8 }}>
            {rangoLabel}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <div style={kpiCard('#f0fdf4', '#16a34a')}>
            <div style={kpiLabel}>Ingreso del periodo</div>
            <div style={kpiValue}>{fmtCurrency(periodoIngreso)}</div>
          </div>
          <div style={kpiCard('#eff6ff', '#2563eb')}>
            <div style={kpiLabel}>Ítems del periodo</div>
            <div style={kpiValue}>{periodoItems.toLocaleString('es-GT')}</div>
          </div>
          <div style={kpiCard('#fff7ed', '#f97316')}>
            <div style={kpiLabel}>Ingreso en local</div>
            <div style={kpiValue}>
              {fmtCurrency(loc.ingreso)} <span style={kpiSub}>({pct(loc.ingreso, periodoIngreso)}%)</span>
            </div>
          </div>
          <div style={kpiCard('#ecfeff', '#06b6d4')}>
            <div style={kpiLabel}>Ingreso en línea</div>
            <div style={kpiValue}>
              {fmtCurrency(onl.ingreso)} <span style={kpiSub}>({pct(onl.ingreso, periodoIngreso)}%)</span>
            </div>
          </div>
        </div>

        {/* Gráficas: Barras + Dona */}
        <div className="pdf-two" style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap: 12, marginTop: 14 }}>
          <div style={{ width: '100%', height: 300, minWidth: 0 }}>
            <ResponsiveContainer>
              <BarChart data={topPeriodo} margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="key"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tickMargin={8}
                  padding={{ left: 18, right: 18 }}
                />
                <YAxis />
                <Tooltip formatter={(v) => [fmtCurrency(v), 'Ingreso']} />
                <Bar dataKey="ingreso" radius={[6, 6, 0, 0]}>
                  {topPeriodo.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius: 12, padding: 12, minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, wordBreak: 'break-word' }}>📍 Distribución por canal</div>
            <div className="pie-fixed" style={{ width: 360, height: 300, maxWidth: '100%' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {pieData.map((_, i) => (<Cell key={i} fill={i === 0 ? '#2563eb' : '#10b981'} />))}
                  </Pie>
                  <Legend iconType="circle" iconSize={14} />
                  <Tooltip formatter={(v) => fmtCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
              En local: <b>{fmtCurrency(loc.ingreso)}</b> ({pct(loc.ingreso, periodoIngreso)}%) · En línea:{' '}
              <b>{fmtCurrency(onl.ingreso)}</b> ({pct(onl.ingreso, periodoIngreso)}%)
            </div>
          </div>
        </div>

        {/* Históricos */}
        <h3 style={{ marginTop: 18, marginBottom: 8 }}>⏳ Históricos (desde que inició)</h3>
        <HistoricosSwitcher historico={historico} />

        {/* Tarjetas Mejor/Peor */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 12 }}>
          <MiniStat
            icon="📅"
            title="Por día"
            primary={mejorDia ? `${fmtDiaLargoES(mejorDia.fecha)} — ${fmtCurrency(mejorDia.ingreso)}` : '—'}
            secondary={peorDia ? `Peor: ${fmtDiaLargoES(peorDia.fecha)} — ${fmtCurrency(peorDia.ingreso)}` : ''}
          />
          <MiniStat
            icon="🗓️"
            title="Por mes"
            primary={mejorMes ? `${fmtMesLargoES(mejorMes.periodo)} — ${fmtCurrency(mejorMes.ingreso)}` : '—'}
            secondary={peorMes ? `Peor: ${fmtMesLargoES(peorMes.periodo)} — ${fmtCurrency(peorMes.ingreso)}` : ''}
          />
          <MiniStat
            icon="📈"
            title="Por año"
            primary={mejorAnio ? `${fmtAnioES(mejorAnio.periodo)} — ${fmtCurrency(mejorAnio.ingreso)}` : '—'}
            secondary={peorAnio ? `Peor: ${fmtAnioES(peorAnio.periodo)} — ${fmtCurrency(peorAnio.ingreso)}` : ''}
          />
        </div>

        {/* Mesas histórico */}
        <MesasHistoricoDedupe />
      </div>
    </Modal>
  );
}


function MesasHistoricoDedupe() {
  // Colores para las barras
  const BAR_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [usageFull, setUsageFull] = React.useState([]); // [{ mesa, count }] (incluye mesas con 0)
  const [avgByMesa, setAvgByMesa] = React.useState([]); // [{ mesa, avgMs, count }]

  const TOP_K = 5;
  const MIN_ORDERS_THRESHOLD = 0; // ⇐ más de 0 (>=1) contará para promedios

  /* ---------- helpers ---------- */
  const msToHM = (ms = 0) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  // Trae catálogo de mesas
  const fetchAllMesasNumeros = React.useCallback(async () => {
    const paths = [
      '/reportes/mesas/catalogo',
      '/mesas',
      '/api/mesas',
      '/catalogos/mesas',
      '/reportes/catalogos/mesas',
    ];
    const { data } = await getFirstAvailable(paths, {});
    const arr = Array.isArray(data?.mesas) ? data.mesas : (Array.isArray(data) ? data : []);
    const nums = new Set();
    for (const m of arr) {
      const n = Number(
        (typeof m === 'number' || typeof m === 'string')
          ? m
          : (m?.numero ?? m?.mesa ?? m?.id ?? m?.codigo)
      );
      if (Number.isFinite(n) && n > 0) nums.add(n);
    }
    return Array.from(nums).sort((a, b) => a - b);
  }, []);

  // Comprobantes normalizados (para usos)
  const fetchAllTicketsRaw = React.useCallback(async () => {
    const paths = [
      '/reportes/comprobantes',
      '/api/reportes/comprobantes',
      '/ticket-ventas',
      '/api/ticket-ventas',
    ];
    const today = todayISO();
    const paramVariants = [
      {},
      { modo: 'auto' },
      { desde: '2000-01-01', hasta: today },
      { desde: '2000-01-01', hasta: today, modo: 'auto' },
    ];

    let rows = [];
    let lastErr = null;
    for (const pv of paramVariants) {
      try {
        const { data } = await getFirstAvailable(paths, pv);
        rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        if (rows.length || (Array.isArray(data?.data) || Array.isArray(data))) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!rows.length && lastErr) throw lastErr;

    return rows.map(r => ({
      serie: r?.serie || r?.codigo || r?.orden?.codigo || '',
      mesaNumero: (r?.mesaNumero ?? r?.mesa ?? r?.orden?.mesa),
    }));
  }, []);

  // Conteo de usos por mesa (sin dedupe)
  function countByMesaRaw(tickets = []) {
    const m = new Map();
    for (const t of tickets || []) {
      const mesa = Number(t?.mesaNumero);
      if (!Number.isFinite(mesa) || mesa <= 0) continue;
      m.set(mesa, (m.get(mesa) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([mesa, count]) => ({ mesa, count }))
      .sort((a, b) => b.count - a.count || a.mesa - b.mesa);
  }

  // Órdenes con inicio/fin (para promedios por mesa)
  const fetchOrdenesDuraciones = React.useCallback(async () => {
    const params = { nivel: 'orden', desde: '2000-01-01', hasta: todayISO() };
    const { data } = await getFirstAvailable(['/reportes/tiempos'], params);
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    const acc = new Map(); // mesa -> { sumMs, count }
    for (const r of rows) {
      const mesa = Number(r?.mesa ?? r?.mesaNumero ?? r?.orden?.mesa);
      if (!Number.isFinite(mesa) || mesa <= 0) continue;

      let durMs = Number(r?.duracionMs || 0);
      if (!durMs) {
        const ini = r?.inicio || r?.preparandoEn || r?.asignadoEn || r?.creadoEn || r?.createdAt;
        const fin = r?.fin || r?.finalizadoEn || r?.fechaPago;
        if (ini && fin) durMs = Math.max(0, new Date(fin) - new Date(ini));
      }
      if (!durMs) continue;

      const cur = acc.get(mesa) || { sumMs: 0, count: 0 };
      cur.sumMs += durMs;
      cur.count += 1;
      acc.set(mesa, cur);
    }

    return Array.from(acc.entries())
      .map(([mesa, v]) => ({ mesa, avgMs: v.sumMs / Math.max(1, v.count), count: v.count }))
      .sort((a, b) => b.avgMs - a.avgMs || a.mesa - b.mesa);
  }, []);

  // Orquestador
  const fetchAll = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [allMesas, tickets, avgDurList] = await Promise.all([
        fetchAllMesasNumeros().catch(() => []),
        fetchAllTicketsRaw(),
        fetchOrdenesDuraciones().catch(() => []),
      ]);

      // Usos + incluir mesas con 0
      const usageArrRaw = countByMesaRaw(tickets);
      const counts = new Map(usageArrRaw.map(x => [Number(x.mesa), Number(x.count)]));
      const allNums = (allMesas.length ? allMesas : usageArrRaw.map(x => x.mesa));
      const mergedUsage = Array.from(new Set(allNums))
        .filter(n => Number.isFinite(n) && n > 0)
        .map(n => ({ mesa: n, count: counts.get(n) || 0 }))
        .sort((a, b) => b.count - a.count || a.mesa - b.mesa);
      setUsageFull(mergedUsage);

      // Promedios por mesa — **todas** con al menos 1 orden
      const byMesa = (avgDurList || [])
        .filter(x => Number.isFinite(x.mesa) && x.mesa > 0)
        .map(x => ({ mesa: x.mesa, avgMs: Number(x.avgMs || 0), count: Number(x.count || 0) }))
        .filter(x => x.count > MIN_ORDERS_THRESHOLD) // > 0  ⇒ >= 1 orden
        .sort((a, b) => b.avgMs - a.avgMs || a.mesa - b.mesa);
      setAvgByMesa(byMesa);
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.message || 'No se pudo cargar el histórico';
      setError(msg);
      setUsageFull([]);
      setAvgByMesa([]);
    } finally {
      setLoading(false);
    }
  }, [fetchAllMesasNumeros, fetchAllTicketsRaw, fetchOrdenesDuraciones]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ---------- datasets para gráficas ---------- */
  const top = React.useMemo(() => {
    const sorted = [...usageFull].sort((a, b) => b.count - a.count || a.mesa - b.mesa);
    return sorted.slice(0, TOP_K);
  }, [usageFull]);

  const least = React.useMemo(() => {
    const sorted = [...usageFull].sort((a, b) => a.count - b.count || a.mesa - b.mesa);
    return sorted.slice(0, TOP_K);
  }, [usageFull]);

  const topData   = top.map((x, i)   => ({ name: `Mesa ${x.mesa}`,  usos: x.count, color: BAR_COLORS[i % BAR_COLORS.length] }));
  const leastData = least.map((x, i) => ({ name: `Mesa ${x.mesa}`,  usos: x.count, color: BAR_COLORS[i % BAR_COLORS.length] }));

  // tiempo promedio por mesa (Top y Bottom por duración)
  const avgTop = React.useMemo(() => (avgByMesa || []).slice(0, TOP_K), [avgByMesa]);
  const avgBottom = React.useMemo(() => {
    const arr = [...(avgByMesa || [])].reverse();
    return arr.slice(0, TOP_K);
  }, [avgByMesa]);

  const avgTopData = avgTop.map((x, i) => ({
    name: `Mesa ${x.mesa}`,
    minutos: Math.round((x.avgMs || 0) / 60000),
    _fmt: msToHM(x.avgMs || 0),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const avgBottomData = avgBottom.map((x, i) => ({
    name: `Mesa ${x.mesa}`,
    minutos: Math.round((x.avgMs || 0) / 60000),
    _fmt: msToHM(x.avgMs || 0),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const ganadora = top[0] || null;
  const menosUsada = least[0] || null;

  return (
    <div className="pdf-fit" style={{ ...boxCard, background:'#fff', marginTop:16 }}>
      <div style={boxTitle}>🪑 Mesas (histórico)</div>
      {error && <div style={{ color:'#b91c1c', marginBottom:8 }}>{error}</div>}

      <div className="pdf-two" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:12 }}>
        <MiniStat
          icon="🏆"
          title="Mesa ganadora (más usada)"
          primary={ganadora ? `Mesa ${ganadora.mesa} — ${ganadora.count} usos` : 'Sin datos'}
        />
        <MiniStat
          icon="🫥"
          title="Mesa menos usada"
          primary={menosUsada ? `Mesa ${menosUsada.mesa} — ${menosUsada.count} usos` : 'Sin datos'}
          secondary={usageFull.some(x => x.count === 0) ? 'Incluye mesas con 0 usos' : ''}
        />
      </div>

      {loading ? (
        <div>Cargando…</div>
      ) : usageFull.length === 0 ? (
        <div style={{ color:'#64748b' }}>No hay datos históricos de mesas.</div>
      ) : (
        <>
          {/* --- Usos: Top / Bottom --- */}
          <div className="pdf-two" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:12, padding:12 }}>
              <div style={{ fontWeight:800, marginBottom:8 }}>Más usadas (Top {TOP_K})</div>
              <div style={{ width:'100%', height:260 }}>
                <ResponsiveContainer>
                  <BarChart data={topData} margin={{ top:8, right:16, left:0, bottom:8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v)=> [v, 'Usos']} />
                    <Bar dataKey="usos" radius={[6,6,0,0]}>
                      {topData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:12, padding:12 }}>
              <div style={{ fontWeight:800, marginBottom:8 }}>Menos usadas (Top {TOP_K})</div>
              <div style={{ width:'100%', height:260 }}>
                <ResponsiveContainer>
                  <BarChart data={leastData} margin={{ top:8, right:16, left:0, bottom:8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v)=> [v, 'Usos']} />
                    <Bar dataKey="usos" radius={[6,6,0,0]}>
                      {leastData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* --- Promedio de ocupación por mesa --- */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>⏱️ Tiempo promedio de ocupación por mesa</div>
            <div className="pdf-two" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:12, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:6 }}>
                  Promedios más altos (Top {TOP_K}) {avgTop.length === 0 ? '— sin suficientes órdenes' : ''}
                </div>
                <div style={{ width:'100%', height:260 }}>
                  <ResponsiveContainer>
                    <BarChart data={avgTopData} margin={{ top:8, right:16, left:0, bottom:8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} tickFormatter={(v)=> `${v} min`} />
                      <Tooltip formatter={(v, n, p)=> [`${v} min (${p.payload._fmt})`, 'Promedio']} />
                      <Bar dataKey="minutos" radius={[6,6,0,0]}>
                        {avgTopData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize:12, color:'#475569', marginTop:6 }}>
                  * Se consideran mesas con ≥ 1 orden histórica.
                </div>
              </div>

              <div style={{ background:'#fff', border:'1px solid #eef2f7', borderRadius:12, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:6 }}>
                  Promedios más bajos (Top {TOP_K}) {avgBottom.length === 0 ? '— sin suficientes órdenes' : ''}
                </div>
                <div style={{ width:'100%', height:260 }}>
                  <ResponsiveContainer>
                    <BarChart data={avgBottomData} margin={{ top:8, right:16, left:0, bottom:8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} tickFormatter={(v)=> `${v} min`} />
                      <Tooltip formatter={(v, n, p)=> [`${v} min (${p.payload._fmt})`, 'Promedio']} />
                      <Bar dataKey="minutos" radius={[6,6,0,0]}>
                        {avgBottomData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize:12, color:'#475569', marginTop:6 }}>
                  * Se consideran mesas con ≥ 1 orden histórica.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// Helpers de estilos visuales para KPIs/boxes
const kpiCard = (bg, accent) => ({
  background: bg,
  border: `1px solid ${accent}20`,
  borderRadius: 12,
  padding: 14,
});

const kpiLabel = { fontSize: 12, color: "#475569", marginBottom: 6, fontWeight: 600 };
const kpiValue = { fontSize: 24, fontWeight: 800, color: "#0f172a" };
const kpiSub = { fontSize: 12, fontWeight: 600, color: "#475569", marginLeft: 6 };

const boxCard = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 };
const boxTitle = { fontWeight: 800, marginBottom: 6 };

/* ╰──────────────────────────────────────────────────────────────╯ */
/* estilos pequeños */
const inputBase = {
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
};
const btnPrimary = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #1e3d59',
  background: '#1e3d59',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer'
};
const btnGhost = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1e293b',
  fontWeight: 600,
  cursor: 'pointer'
};