// src/routes/reportes.ventas.routes.js
module.exports = function reportesVentasRoutes(prisma, { auth, requirePerm }) {
  const router = require('express').Router();

  // ===== Utilidades de fechas (UTC, día limpio) =====
  function toDateOnly(d) {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    // normaliza a "YYYY-MM-DD" en UTC (00:00:00)
    return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  }
  function addDays(d, n) {
    const dt = new Date(d.getTime());
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt;
  }
  function todayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // ===== Helper: parseo de periodo =====
  function parsePeriodo(p) {
    const s = String(p || '').toLowerCase().trim();
    if (s === 'semana') return 'week';
    if (s === 'mes') return 'month';
    return 'day'; // por defecto 'dia'
  }

  // ===== Helpers: parseo de filtros =====
  function normalizeEmpty(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (['*', 'all', 'todos', 'todo', 'undefined', 'null'].includes(s.toLowerCase())) return null;
    return s;
  }
  function parseMetodoPago(v) {
    const s = normalizeEmpty(v);
    if (!s) return null;
    const U = s.toUpperCase();
    return U === 'EFECTIVO' || U === 'TARJETA' ? U : null; // enum MetodoPago
  }
  function parseEstado(v) {
    const s = normalizeEmpty(v);
    if (!s) return null;
    const U = s.toUpperCase();
    return U === 'VALIDO' || U === 'ANULADO' ? U : null; // enum ComprobanteEstado
  }
  function parseIntOrNull(v) {
    const raw = normalizeEmpty(v);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  }

  /**
   * GET /reportes/ventas
   * Query:
   *  - periodo: dia|semana|mes
   *  - desde, hasta: YYYY-MM-DD (UTC)
   *  - metodoPago/metodo: EFECTIVO|TARJETA
   *  - estado: VALIDO|ANULADO
   *  - cajeroId: number
   */
  router.get(
    '/ventas',
    auth,
    requirePerm ? requirePerm('REPORTES_VENTAS') : (req, _res, next) => next(),
    async (req, res) => {
      try {
        const gran = parsePeriodo(req.query.periodo);

        // Rango de fechas (UTC) – por defecto hoy
        const dDesde = toDateOnly(req.query.desde) || todayUTC();
        const dHasta = toDateOnly(req.query.hasta) || todayUTC();
        if (!dDesde || !dHasta) {
          return res
            .status(400)
            .json({ mensaje: 'Parámetros de fecha inválidos. Usa YYYY-MM-DD.' });
        }
        // Límite superior exclusivo (hasta + 1 día)
        const dHastaExcl = addDays(dHasta, 1);

        // Filtros opcionales
        // ✅ acepta metodoPago o metodo
        const metodoPago = parseMetodoPago(req.query.metodoPago ?? req.query.metodo);
        const estado = parseEstado(req.query.estado);
        const cajeroId = parseIntOrNull(req.query.cajeroId);

        // ===== Serie por período (tabla/gráfico) =====
        const series = await prisma.$queryRaw`
          SELECT
            date_trunc(${gran}, "fechaPago")::date AS periodo,
            COUNT(*)::int                            AS comprobantes,
            SUM("subtotal")::float                   AS subtotal,
            SUM("impuestos")::float                  AS impuestos,
            SUM("descuentos")::float                 AS descuentos,
            SUM("totalAPagar")::float                AS total,
            SUM(CASE WHEN "estado" = 'ANULADO' THEN "totalAPagar" ELSE 0 END)::float AS anulados_monto,
            SUM(CASE WHEN "estado" = 'ANULADO' THEN 1 ELSE 0 END)::int               AS anulados_count
          FROM "TicketVenta"
          WHERE "fechaPago" >= ${dDesde} AND "fechaPago" < ${dHastaExcl}
            AND (${metodoPago}::"MetodoPago"        IS NULL OR "metodoPago" = ${metodoPago}::"MetodoPago")
            AND (${estado}::"ComprobanteEstado"     IS NULL OR "estado"     = ${estado}::"ComprobanteEstado")
            AND (${cajeroId}::int                   IS NULL OR "cajeroId"   = ${cajeroId}::int)
          GROUP BY 1
          ORDER BY 1 ASC;
        `;

        // ===== KPIs (globales del rango/filters) =====
        const [k] = await prisma.$queryRaw`
          SELECT
            COUNT(*)::int                                   AS total_comprobantes,
            SUM("subtotal")::float                          AS total_subtotal,
            SUM("impuestos")::float                         AS total_impuestos,
            SUM("descuentos")::float                        AS total_descuentos,
            SUM("totalAPagar")::float                       AS total_bruto,
            SUM(CASE WHEN "estado" = 'ANULADO' THEN "totalAPagar" ELSE 0 END)::float AS anulados_monto,
            SUM(CASE WHEN "estado" = 'ANULADO' THEN 1 ELSE 0 END)::int               AS anulados_count,
            SUM(CASE WHEN "estado" = 'VALIDO'  THEN "totalAPagar" ELSE 0 END)::float AS total_valido_monto,
            SUM(CASE WHEN "estado" = 'VALIDO'  THEN 1             ELSE 0 END)::int   AS total_valido_count
          FROM "TicketVenta"
          WHERE "fechaPago" >= ${dDesde} AND "fechaPago" < ${dHastaExcl}
            AND (${metodoPago}::"MetodoPago"        IS NULL OR "metodoPago" = ${metodoPago}::"MetodoPago")
            AND (${estado}::"ComprobanteEstado"     IS NULL OR "estado"     = ${estado}::"ComprobanteEstado")
            AND (${cajeroId}::int                   IS NULL OR "cajeroId"   = ${cajeroId}::int);
        `;

        // Calculados
        const totalBruto   = Number(k?.total_bruto || 0);
        const subtotal     = Number(k?.total_subtotal || 0);
        const impuestos    = Number(k?.total_impuestos || 0);
        const descuentos   = Number(k?.total_descuentos || 0);
        const anuladosMon  = Number(k?.anulados_monto || 0);
        const anuladosCnt  = Number(k?.anulados_count || 0);
        const valMonto     = Number(k?.total_valido_monto || 0);
        const valCount     = Number(k?.total_valido_count || 0);
        const totalComp    = Number(k?.total_comprobantes || 0);

        const neto = Math.max(0, subtotal - descuentos + impuestos);
        const ticketPromedioGlobal = totalComp > 0 ? totalBruto / totalComp : 0;
        const ticketPromedioValido = valCount  > 0 ? valMonto   / valCount  : 0;

        // Formato de serie
        const seriesFmt = (series || []).map(r => {
          const sub = Number(r.subtotal || 0);
          const imp = Number(r.impuestos || 0);
          const des = Number(r.descuentos || 0);
          const tot = Number(r.total || 0);
          const comp = Number(r.comprobantes || 0);
          return {
            periodo: r.periodo,                               // YYYY-MM-DD (inicio de día/semana/mes)
            comprobantes: comp,
            subtotal: sub,
            impuestos: imp,
            descuentos: des,
            total: tot,
            neto: Math.max(0, sub - des + imp),
            ticketPromedio: comp > 0 ? tot / comp : 0,
            anuladosMonto: Number(r.anulados_monto || 0),
            anuladosCount: Number(r.anulados_count || 0),
          };
        });

        return res.json({
          aplicados: {
            periodo: gran, // 'day'|'week'|'month'
            desde: dDesde.toISOString().slice(0,10),
            hasta: dHasta.toISOString().slice(0,10),
            metodoPago,
            estado,
            cajeroId,
          },
          kpis: {
            totalComprobantes: totalComp,
            subtotal,
            impuestos,
            descuentos,
            totalBruto,
            neto,
            anuladosMonto: anuladosMon,
            anuladosCount: anuladosCnt,
            ticketPromedioGlobal,
            ticketPromedioValido,
          },
          series: seriesFmt,
        });
      } catch (err) {
        console.error('[REPORTES/VENTAS]', err);
        return res
          .status(500)
          .json({ mensaje: 'Error generando reporte de ventas', detalle: String(err?.message || err) });
      }
    }
  );

  /**
   * GET /reportes/ventas/detalle
   * Query:
   *  - periodo: dia|semana|mes
   *  - desde, hasta: YYYY-MM-DD
   *  - periodoValor: "YYYY-MM-DD" (valor exacto devuelto por series[x].periodo)
   *  - metodoPago/metodo: EFECTIVO|TARJETA
   *  - estado: VALIDO|ANULADO
   *  - cajeroId: number
   *  - buscar: (opcional) serie/código o número (id de ticket u orden)
   */
  router.get(
    '/ventas/detalle',
    auth,
    requirePerm ? requirePerm('REPORTES_VENTAS') : (req, _res, next) => next(),
    async (req, res) => {
      try {
        const gran = parsePeriodo(req.query.periodo);

        const dDesde = toDateOnly(req.query.desde);
        const dHasta = toDateOnly(req.query.hasta);
        if (!dDesde || !dHasta) {
          return res
            .status(400)
            .json({ mensaje: 'Parámetros desde/hasta requeridos (YYYY-MM-DD)' });
        }
        const dHastaExcl = addDays(dHasta, 1);

        const periodoValor = toDateOnly(req.query.periodoValor);
        if (!periodoValor) {
          return res
            .status(400)
            .json({ mensaje: 'Falta periodoValor (usa la fecha exacta devuelta por la serie, YYYY-MM-DD)' });
        }

        // Filtros opcionales
        // ✅ acepta metodoPago o metodo
        const metodoPago = parseMetodoPago(req.query.metodoPago ?? req.query.metodo);
        const estado = parseEstado(req.query.estado);
        const cajeroId = parseIntOrNull(req.query.cajeroId);

        // 🔎 Buscar SOLO por serie/código o número
        const buscar = String(req.query.buscar || '').trim();
        const buscarNum = Number.isInteger(Number(buscar)) ? Number(buscar) : null;

        // ================= Query detalle =================
        const tickets = await prisma.$queryRaw`
          SELECT
            t.id,
            t."fechaPago",
            -- Serie preferida: TicketVenta.serie; si está vacía, usamos Orden.codigo
            COALESCE(NULLIF(t."serie", ''), o."codigo") AS "serie",
            t."numero",
            t."clienteNombre",
            t."clienteNit",
            t."metodoPago",
            t."estado",
            t."subtotal",
            t."descuentos",
            t."impuestos",
            t."totalAPagar",
            t."cajeroId",
            u.nombre as "cajeroNombre",
            -- Para la tabla: número de mesa
            o."mesa" AS "mesaNumero"
          FROM "TicketVenta" t
          LEFT JOIN "Usuario" u ON u.id = t."cajeroId"
          LEFT JOIN "Orden"   o ON o.id = t."ordenId"
          WHERE date_trunc(${gran}, t."fechaPago")::date = ${periodoValor}::date
            AND t."fechaPago" >= ${dDesde} AND t."fechaPago" < ${dHastaExcl}
            AND (${metodoPago}::"MetodoPago"        IS NULL OR t."metodoPago" = ${metodoPago}::"MetodoPago")
            AND (${estado}::"ComprobanteEstado"     IS NULL OR t."estado"     = ${estado}::"ComprobanteEstado")
            AND (${cajeroId}::int                   IS NULL OR t."cajeroId"   = ${cajeroId}::int)
            AND (
              ${buscar} = '' OR
              -- por serie de ticket
              t."serie" ILIKE '%' || ${buscar} || '%' OR
              -- por código de la orden (DE0F2)
              o."codigo" ILIKE '%' || ${buscar} || '%' OR
              -- por número (id de ticket u orden)
              (${buscarNum}::int IS NOT NULL AND t.id = ${buscarNum}::int) OR
              (${buscarNum}::int IS NOT NULL AND o.id = ${buscarNum}::int)
            )
          ORDER BY t."fechaPago" ASC;
        `;

        return res.json({ tickets });
      } catch (err) {
        console.error('[REPORTES/VENTAS/DETALLE]', err);
        return res
          .status(500)
          .json({ mensaje: 'Error generando detalle', detalle: String(err?.message || err) });
      }
    }
  );

  return router;
};
