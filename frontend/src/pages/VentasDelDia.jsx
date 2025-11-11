import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTopBar from "../components/PageTopBar";
import { API, http, openSSE } from "../config/client";

const toKey = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "_");
const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;
const pad2 = (n) => String(n).padStart(2, "0");
const timeToMinutes = (t) => {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
};

function hasCajaPermission(usuario) {
  const role = toKey(typeof usuario?.rol === "string" ? usuario.rol : usuario?.rol?.nombre);
  if (role === "ADMIN" || role === "ADMINISTRADOR") return true;
  const set = new Set(
    (usuario?.permisos || []).map((p) =>
      toKey(typeof p === "string" ? p : p?.nombre || p?.clave || p?.key || "")
    )
  );
  return set.has("CAJA");
}

const mesaTextoDe = (mesaTexto, mesaA, mesaB) => {
  if (mesaTexto) return mesaTexto;
  const n = mesaA ?? mesaB;
  if (typeof n === "number") return n === 0 ? "Pedido en línea" : `Mesa ${n}`;
  return "Pedido en línea";
};
const esAnticipoDeReserva = (v) => {
  const idStr = String(v?.id ?? "");
  const folio = String(v?.folio ?? "");
  return !v.orden && (idStr.startsWith("R") || folio.startsWith("RES-"));
};
const mesaTextoUI = (v) => {
  const base = mesaTextoDe(v.mesaTexto, v.orden?.mesa, v.mesa);
  return esAnticipoDeReserva(v) ? `${base} — RESERVACIÓN` : base;
};

// fallback GET helper
async function tryGET(endpoints = []) {
  let lastErr;
  for (const ep of endpoints) {
    try { return (await http.get(ep))?.data; }
    catch (e) { if (e?.response?.status !== 404) lastErr = e; }
  }
  if (lastErr) throw lastErr;
  throw new Error('No endpoints responded');
}

export default function VentasDelDia() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem("usuario") || "null");

  useEffect(() => {
    if (!usuario) navigate("/login", { replace: true });
  }, [usuario, navigate]);

  const puedeVer = hasCajaPermission(usuario);

  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState({
    tickets: 0, total: 0, promedio: 0, porMetodo: {}, egresosAprobados: 0, netoEfectivo: 0,
  });

  // ===== Filtros =====
  const [fMetodo, setFMetodo] = useState("TODOS");
  const [fHoraIni, setFHoraIni] = useState("");
  const [fHoraFin, setFHoraFin] = useState("");
  const [fMontoOp, setFMontoOp] = useState("LE");
  const [fMontoVal, setFMontoVal] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await tryGET([
        '/caja/ventas/hoy',        // original
        '/ticket-ventas/hoy',      // nueva
        '/reportes/ventas/hoy',    // fallback
      ]);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.ventas) ? data.ventas : [];
      const res = Array.isArray(data) ? {} : data?.resumen || {};
      setVentas(arr);
      setResumen({
        tickets: Number(res.tickets || arr.length || 0),
        total: Number(res.total || arr.reduce((a, v) => a + Number(v.total || v.totalAPagar || 0), 0)),
        promedio: Number(res.promedio || 0),
        porMetodo: res.porMetodo || {},
        egresosAprobados: Number(res.egresosAprobados || 0),
        netoEfectivo: Number(res.netoEfectivo || 0),
      });
    } catch (e) {
      console.error(e);
      setVentas([]);
      setResumen({ tickets: 0, total: 0, promedio: 0, porMetodo: {}, egresosAprobados: 0, netoEfectivo: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!puedeVer) { setLoading(false); return; }
    load();
    const es = openSSE("/caja/stream");
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === "orden_pagada" || evt.type === "ticket_anulado") load();
      } catch {}
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const limpiarFiltros = () => {
    setFMetodo("TODOS"); setFHoraIni(""); setFHoraFin(""); setFMontoOp("LE"); setFMontoVal("");
  };

  const ventasFiltradas = useMemo(() => {
    const minMin = timeToMinutes(fHoraIni);
    const maxMin = timeToMinutes(fHoraFin);
    const monto = fMontoVal !== "" ? Number(fMontoVal) : null;

    return ventas.filter((v) => {
      if (fMetodo !== "TODOS" && String(v.metodoPago || "").toUpperCase() !== fMetodo) return false;
      if (minMin != null || maxMin != null) {
        const d = new Date(v.fechaVenta || v.fechaPago || v.fecha || Date.now());
        const mins = d.getHours() * 60 + d.getMinutes();
        if (minMin != null && mins < minMin) return false;
        if (maxMin != null && mins > maxMin) return false;
      }
      if (monto != null && !Number.isNaN(monto)) {
        const total = Number(v.total || v.totalAPagar || 0);
        if (fMontoOp === "LE" && !(total <= monto)) return false;
        if (fMontoOp === "GE" && !(total >= monto)) return false;
      }
      return true;
    });
  }, [ventas, fMetodo, fHoraIni, fHoraFin, fMontoOp, fMontoVal]);

  const porMetodo = useMemo(() => {
    if (resumen?.porMetodo && typeof resumen.porMetodo === "object") return resumen.porMetodo;
    const agg = {};
    for (const v of ventas) {
      const k = String(v.metodoPago || "").toUpperCase();
      agg[k] = (agg[k] || 0) + Number(v.total || v.totalAPagar || 0);
    }
    return agg;
  }, [resumen, ventas]);

  function imprimir(v) {
    const w = window.open("", "_blank");
    if (!w) {
      window.open(`${API}/caja/tickets/${v.id}/impresion`, "_blank");
      return;
    }
    const fecha = new Date(v.fechaVenta || v.fechaPago || v.fecha || Date.now());
    const mesaStr = mesaTextoUI(v);
    const items = Array.isArray(v.orden?.items) ? v.orden.items : [];
    const totalOriginal = items.length
      ? items.reduce((a, it) => a + Number(it.precio || 0), 0)
      : Number(v.total || v.totalAPagar || 0);
    const anticipoTicket = Number((v.anticipo != null ? v.anticipo : v.orden?.anticipo ?? 0) || 0);
    const totalAPagar =
      v.totalAPagar != null ? Number(v.totalAPagar) : Math.max(0, totalOriginal - anticipoTicket);
    const metodo = String(v.metodoPago || "-").toUpperCase();
    const pos = v.posCorrelativo || "";
    const montoRecibido = Number(v.montoRecibido || 0);
    const cambio = metodo === "EFECTIVO" ? Math.max(0, montoRecibido - totalAPagar) : 0;
    const itemsHtml = items.length
      ? items.map((it, idx) => `
        <tr><td>${it?.nombre || `Ítem ${idx + 1}`}</td>
        <td style="text-align:right">Q ${Number(it?.precio || 0).toFixed(2)}</td></tr>`).join("")
      : `<tr><td>Total del ticket</td><td style="text-align:right">Q ${totalOriginal.toFixed(2)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
body{font-family:ui-monospace,Consolas,monospace;margin:0;padding:10px}
.ticket{width:260px;margin:0 auto}h1{font-size:14px;text-align:center;margin:8px 0}
table{width:100%;font-size:12px;border-collapse:collapse}
.tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}.muted{color:#666;font-size:11px}
@media print { @page { size:auto;margin:6mm } }
</style></head><body onload="window.focus();window.print();">
<div class="ticket">
<h1>Ticket de Venta</h1>
<div class="muted">${fecha.toLocaleString("es-GT")}</div>
<div>Orden ${v.orden?.codigo || v.ordenCodigo || ""} – ${mesaStr}</div>
<hr/><table>${itemsHtml}</table>
<div class="tot">
  <div>Total original: <strong>Q ${totalOriginal.toFixed(2)}</strong></div>
  ${anticipoTicket > 0 ? `<div>Anticipo aplicado: -Q ${anticipoTicket.toFixed(2)}</div>` : ""}
  <div>Total a pagar: <strong>Q ${totalAPagar.toFixed(2)}</strong></div>
  <div>Método: ${metodo}</div>
  ${metodo === "TARJETA" && pos ? `<div>POS: ${pos}</div>` : ""}
  ${metodo === "EFECTIVO" ? `<div>Recibido: Q ${montoRecibido.toFixed(2)} – Cambio: Q ${cambio.toFixed(2)}</div>` : ""}
</div><p class="muted">No válido como factura</p></div></body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
  }

  if (!puedeVer) {
    return (
      <div style={pageWrap}>
        <PageTopBar title="Ventas del día" backTo="/panel" />
        <main style={mainWrap}>
          <div style={mainCard}>
            <div style={{background:"#FFF7E6",border:"1px solid #FBBF24",color:"#92400E",borderRadius:10,padding:14,fontWeight:700}}>
              No tienes permiso para ver Ventas del día.
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <PageTopBar title="Ventas del día" backTo="/panel" />
      <main style={mainWrap}>
        <div style={mainCard}>
          {/* Filtros */}
          <div style={filtersGrid}>
            <div style={searchLabel}>Buscar por:</div>
            <div>
              <label style={label}>Método de pago</label>
              <select value={fMetodo} onChange={(e) => setFMetodo(e.target.value)} style={input}>
                <option value="TODOS">Todos</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
            <div><label style={label}>Hora desde</label><input type="time" value={fHoraIni} onChange={(e)=>setFHoraIni(e.target.value)} style={input} /></div>
            <div><label style={label}>Hora hasta</label><input type="time" value={fHoraFin} onChange={(e)=>setFHoraFin(e.target.value)} style={input} /></div>
            <div>
              <label style={label}>Monto</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={fMontoOp} onChange={(e)=>setFMontoOp(e.target.value)} style={{ ...input, width: 90 }}>
                  <option value="LE">≤</option><option value="GE">≥</option>
                </select>
                <input type="number" value={fMontoVal} onChange={(e)=>setFMontoVal(e.target.value)} placeholder="Ej. 100" style={input} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <button onClick={() => { setFMetodo("TODOS"); setFHoraIni(""); setFHoraFin(""); setFMontoOp("LE"); setFMontoVal(""); }} style={btnGhost}>Limpiar</button>
              <button onClick={load} style={btnPrimary}>Refrescar</button>
            </div>
          </div>

          {/* KPIs */}
          <div style={kpiGrid}>
            <div style={kpiCard}><div style={kpiLabel}>Tickets</div><div style={kpiValue}>{resumen?.tickets || 0}</div></div>
            <div style={kpiCard}><div style={kpiLabel}>Total del día (bruto)</div><div style={kpiValue}>{fmtQ(resumen?.total)}</div></div>
            <div style={kpiCard}>
              <div style={kpiLabel}>Neto caja (efectivo - egresos aprobados)</div>
              <div style={kpiValue}>{fmtQ(resumen?.netoEfectivo || 0)}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Egresos aprobados hoy: {fmtQ(resumen?.egresosAprobados || 0)}
              </div>
            </div>
            <div style={kpiCard}><div style={kpiLabel}>Promedio por ticket</div><div style={kpiValue}>{fmtQ(resumen?.promedio)}</div></div>
          </div>

          <div style={{ marginBottom: 12 }}>
            {Object.entries((resumen?.porMetodo || {})).map(([k, val]) => (
              <span key={k} style={pill}>{k}: {fmtQ(val || 0)}</span>
            ))}
          </div>

          {/* Tabla */}
          <div style={{ border: "1px solid #eef2f7", borderRadius: 10, overflow: "hidden" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Hora</th>
                  <th style={th}>Orden</th>
                  <th style={th}>Mesa</th>
                  <th style={th}>Cajero</th>
                  <th style={th}>Método</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={th}>Anticipo</th>
                  <th style={th}>Imprimir</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={td}>Cargando…</td></tr>
                ) : ventasFiltradas.length === 0 ? (
                  <tr><td colSpan={8} style={td}>Sin resultados</td></tr>
                ) : (
                  ventasFiltradas.map((v) => {
                    const d = new Date(v.fechaVenta || v.fechaPago || v.fecha || Date.now());
                    const hora = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
                    return (
                      <tr key={v.id}>
                        <td style={td}>{hora}</td>
                        <td style={td}>{v.orden?.codigo || v.ordenCodigo || "-"}</td>
                        <td style={td}>{mesaTextoUI(v)}</td>
                        <td style={td}>{v.cajero?.nombre || v.cajeroNombre || "-"}</td>
                        <td style={td}>{v.metodoPago || "-"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{fmtQ(v.total || v.totalAPagar)}</td>
                        <td style={td}>{v?.anticipo ? fmtQ(v.anticipo) : "—"}</td>
                        <td style={td}><button onClick={() => imprimir(v)} style={linkBtn}>Imprimir</button></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ===== Styles (igual que antes) ===== */
const pageWrap = { minHeight: "100vh", background: "#f6f7fb", fontFamily: "Segoe UI, sans-serif" };
const mainWrap = { maxWidth: 1200, margin: "20px auto", padding: "0 16px" };
const mainCard = { background: "#fff", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", padding: 20 };

const filtersGrid = { display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1.2fr auto", gap: 12, marginBottom: 14, alignItems: "end" };
const searchLabel = { fontWeight: 900, color: "#0f172a", background: "#ecfeff", border: "1px solid #a5f3fc", padding: "10px 12px", borderRadius: 10 };
const label = { display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", outline: "none" };
const btnPrimary = { background: "#0f766e", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 700, cursor: "pointer" };
const btnGhost = { background: "#e5e7eb", color: "#111827", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: 700, cursor: "pointer" };

const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 };
const kpiCard = { background: "#fff", border: "1px solid #eef2f7", borderRadius: 10, padding: 12 };
const kpiLabel = { color: "#6b7280", fontSize: 12, marginBottom: 4 };
const kpiValue = { fontWeight: 900, fontSize: 22, color: "#111827" };
const pill = { display: "inline-block", background: "#eef2ff", border: "1px solid #c7d2fe", color: "#1d4ed8", borderRadius: 999, padding: "4px 10px", marginRight: 8, fontSize: 12, fontWeight: 700 };

const table = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { borderBottom: "1px solid #e5e7eb", padding: "8px 6px", color: "#6b7280", textAlign: "left" };
const td = { borderBottom: "1px solid #f3f4f6", padding: "8px 6px", color: "#111827" };
const linkBtn = { color: "#0ea5a4", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, textDecoration: "none" };
