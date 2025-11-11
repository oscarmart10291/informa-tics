// frontend/src/pages/EgresosAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageTopBar from "../components/PageTopBar";
import { http, openSSE } from "../config/client";

/* ============================== Helpers ============================== */
const toKey = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "_");
const money = (n) => `Q ${Number(n || 0).toFixed(2)}`;

function canModerate(usuario) {
  const role = toKey(typeof usuario?.rol === "string" ? usuario.rol : usuario?.rol?.nombre);
  if (role === "ADMIN" || role === "ADMINISTRADOR") return true;
  const raw = []
    .concat(Array.isArray(usuario?.permisos) ? usuario.permisos : [])
    .concat(Array.isArray(usuario?.rol?.permisos) ? usuario.rol.permisos : []);
  const set = new Set(
    raw.map((p) =>
      toKey(typeof p === "string" ? p : (p?.nombre || p?.clave || p?.key || p?.permiso?.nombre || ""))
    )
  );
  return set.has("AUTORIZAR_EGRESO") || set.has("CAJA");
}

/* ============================== Vista: Autorizar egresos (Admin) ============================== */
export default function EgresosAdmin() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem("usuario") || "null");

  const [lista, setLista] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);

  const [sel, setSel] = useState(null);
  const [observacion, setObservacion] = useState("");

  const [resumen, setResumen] = useState({
    total: 0,
    egresosAprobados: 0,
    netoEfectivo: 0,
  });

  const puede = canModerate(usuario);

  useEffect(() => {
    if (!usuario) navigate("/login", { replace: true });
  }, [usuario, navigate]);

  async function loadPendientes() {
    try {
      const { data } = await http.get("/caja/egresos/pendientes");
      const arr = Array.isArray(data) ? data : data.egresos || [];
      setLista(arr);
      setLastUpdate(new Date());
      if (sel && !arr.find((x) => x.id === sel.id)) setSel(null);
    } catch (e) {
      console.error("GET /caja/egresos/pendientes", e);
      setLista([]);
    }
  }

  async function loadHistorial() {
    try {
      const { data } = await http.get("/caja/egresos/hoy");
      setHistorial(Array.isArray(data) ? data : data.egresos || []);
    } catch {
      setHistorial([]);
    }
  }

  async function loadResumen() {
    try {
      const { data } = await http.get("/caja/ventas/hoy");
      const r = data?.resumen || {};
      setResumen({
        total: Number(r.total || 0),
        egresosAprobados: Number(r.egresosAprobados || 0),
        netoEfectivo: Number(r.netoEfectivo || 0),
      });
    } catch {
      setResumen({ total: 0, egresosAprobados: 0, netoEfectivo: 0 });
    }
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadPendientes(), loadHistorial(), loadResumen()]);
    setLoading(false);
  }

  useEffect(() => {
    if (!puede) {
      setLoading(false);
      return;
    }
    loadAll();

    const es = openSSE("/caja/stream");
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === "egreso_nuevo" || evt.type === "egreso_actualizado") {
          loadAll();
        }
      } catch {}
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((e) => {
      const s = `${e.id} ${e.motivo} ${e.cajero?.nombre || e.cajeroNombre || ""}`.toLowerCase();
      return s.includes(t);
    });
  }, [q, lista]);

  async function autorizar(accion) {
    if (!sel) return;
    setMsg("");
    if (accion === "RECHAZAR" && String(observacion || "").trim().length < 3) {
      setMsg("Para rechazar, agrega una observación (mínimo 3 caracteres).");
      return;
    }
    try {
      const payload = {
        accion, // "APROBAR" | "RECHAZAR"
        observacion: String(observacion || "").trim() || null,
        adminId: usuario?.id,
      };
      const { data } = await http.patch(`/caja/egresos/${sel.id}/autorizar`, payload);
      setMsg(data?.msg || (accion === "APROBAR" ? "Egreso aprobado" : "Egreso rechazado"));
      setObservacion("");
      setSel(null);
      await loadAll();
    } catch (e) {
      setMsg(e?.response?.data?.msg || "No se pudo actualizar el egreso");
    }
  }

  const totalPend = useMemo(
    () => filtrados.reduce((a, e) => a + Number(e.monto || 0), 0),
    [filtrados]
  );

  if (!puede) {
    return (
      <div style={pageWrap}>
        <PageTopBar title="Autorizar egresos" backTo="/panel" />
        <main style={mainWrap}>
          <div style={mainCard}>
            <div style={warnBox}>No tienes permiso para autorizar egresos.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <PageTopBar title="Autorizar egresos" backTo="/panel" />

      <main style={mainWrap}>
        <div style={mainCard}>
          {msg && <div style={infoBar}>{msg}</div>}

          {/* KPIs arriba */}
          <div style={kpiGrid3}>
            <KPI label="Pendientes" value={money(totalPend)} />
            <KPI label="Bruto del día" value={money(resumen.total)} />
            <KPI
              label="Neto caja"
              value={money(resumen.netoEfectivo)}
              sub={`Egresos aprobados hoy: ${money(resumen.egresosAprobados)}`}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Lista de pendientes */}
            <section>
              <h2 style={sectionTitle}>Solicitudes pendientes</h2>
              <div style={cardBox}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input
                    placeholder="Buscar por #id / motivo / cajero"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={input}
                  />
                  <span style={mutedSmall}>{filtrados.length} pendientes</span>
                  <button onClick={loadAll} style={{ ...btnGhost, marginLeft: "auto" }}>
                    Refrescar
                  </button>
                </div>
                {lastUpdate && (
                  <div style={{ ...mutedSmall, marginBottom: 8 }}>
                    Última actualización: {lastUpdate.toLocaleTimeString()}
                  </div>
                )}

                {loading ? (
                  <p style={muted}>Cargando…</p>
                ) : filtrados.length === 0 ? (
                  <p style={muted}>Sin pendientes</p>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {filtrados.map((e) => {
                      const active = sel?.id === e.id;
                      return (
                        <li
                          key={e.id}
                          onClick={() => {
                            setSel(e);
                            setObservacion(e.observacion || "");
                          }}
                          style={{ ...pendingItem, ...(active ? pendingItemActive : null) }}
                        >
                          <div style={{ fontWeight: 800 }}>
                            #{e.id} · {money(e.monto)}
                          </div>
                          <div style={mutedSmall}>
                            {e.motivo || "-"} — Cajero: {e.cajero?.nombre || e.cajeroNombre || "-"} —{" "}
                            {new Date(e.creadoEn).toLocaleString()}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Detalle/Acción */}
            <section>
              <h2 style={sectionTitle}>Detalle / Autorización</h2>
              <div style={cardBox}>
                {!sel ? (
                  <p style={muted}>Selecciona una solicitud para aprobar o rechazar.</p>
                ) : (
                  <>
                    <div style={rowBetween}>
                      <div style={{ fontWeight: 800 }}>
                        Solicitud #{sel.id} · {money(sel.monto)}
                      </div>
                      <div>
                        <span style={badge("PENDIENTE")}>PENDIENTE</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={label}>Cajero</div>
                        <div style={readonlyBox}>{sel.cajero?.nombre || sel.cajeroNombre || "-"}</div>
                      </div>
                      <div>
                        <div style={label}>Fecha</div>
                        <div style={readonlyBox}>{new Date(sel.creadoEn).toLocaleString()}</div>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={label}>Motivo</div>
                        <div style={readonlyBox}>{sel.motivo || "-"}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={label}>Observación (opcional para aprobar, obligatoria para rechazar)</label>
                      <textarea
                        value={observacion}
                        onChange={(e) => setObservacion(e.target.value)}
                        rows={3}
                        style={{ ...input, resize: "vertical" }}
                        placeholder="Ej. Autorizado por corte / Falta comprobante, etc."
                      />
                    </div>

                    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button onClick={() => autorizar("RECHAZAR")} style={btnDanger}>
                        Rechazar
                      </button>
                      <button onClick={() => autorizar("APROBAR")} style={btnPrimary}>
                        Aprobar egreso
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Historial del día */}
          <div style={{ marginTop: 16 }}>
            <h3 style={subTitle}>Historial del día</h3>
            <div style={{ border: "1px solid #eef2f7", borderRadius: 10, overflow: "hidden" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Fecha</th>
                    <th style={{ ...th, textAlign: "left" }}>Cajero</th>
                    <th style={{ ...th, textAlign: "left" }}>Motivo</th>
                    <th style={{ ...th, textAlign: "right" }}>Monto</th>
                    <th style={{ ...th, textAlign: "center" }}>Estado</th>
                    <th style={{ ...th, textAlign: "left" }}>Observación / Autorización</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.length === 0 ? (
                    <tr>
                      <td style={{ ...td, textAlign: "center" }} colSpan={6}>
                        Sin historial hoy o endpoint no disponible
                      </td>
                    </tr>
                  ) : (
                    historial.map((e) => (
                      <tr key={e.id}>
                        <td style={td}>{new Date(e.creadoEn).toLocaleString()}</td>
                        <td style={td}>{e.cajero?.nombre || e.cajeroNombre || "-"}</td>
                        <td style={td}>{e.motivo}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(e.monto)}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={badge(e.estado)}>{e.estado}</span>
                        </td>
                        <td style={td}>
                          {e.autorizadoEn
                            ? `Autor: #${e.autorizadoPorId || "-"} · ${new Date(e.autorizadoEn).toLocaleString()} · ${
                                e.observacion || ""
                              }`
                            : e.observacion || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ===================== Presentational bits ===================== */
function KPI({ label, value, sub }) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ============================== Styles ============================== */
const pageWrap = { minHeight: "100vh", background: "#f6f7fb", fontFamily: "Segoe UI, sans-serif" };

const mainWrap = { maxWidth: 1150, margin: "20px auto", padding: "0 16px" };
const mainCard = { background: "#fff", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", padding: 20 };

const sectionTitle = { margin: 0, marginBottom: 12, color: "#1f2937", fontSize: 18 };
const subTitle = { margin: 0, marginTop: 8, marginBottom: 6, color: "#1f2937", fontSize: 14, fontWeight: 700 };
const cardBox = { background: "#fff", border: "1px solid #eef2f7", borderRadius: 10, padding: 12 };

const pendingItem = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #eef2f7",
  background: "#fff",
  cursor: "pointer",
  marginBottom: 10,
  transition: "all .15s",
};
const pendingItemActive = { background: "#f0f7ff", borderColor: "#bfdbfe" };

const rowBetween = { display: "flex", alignItems: "center", justifyContent: "space-between" };

const label = { display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", outline: "none" };
const readonlyBox = { padding: "8px 10px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#f9fafb" };

const btnPrimary = {
  background: "#0f766e",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};
const btnDanger = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost = {
  background: "#e5e7eb",
  color: "#111827",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const infoBar = { marginBottom: 12, padding: 10, borderRadius: 8, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontSize: 14 };
const warnBox = { background: "#fff8e1", border: "1px solid #ffe0a3", color: "#7a5b00", padding: "1rem", borderRadius: 8, textAlign: "center" };

const table = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { borderBottom: "1px solid #e5e7eb", padding: "8px 6px", color: "#6b7280", textAlign: "left" };
const td = { borderBottom: "1px solid #f3f4f6", padding: "8px 6px", color: "#111827" };

const kpiGrid3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const kpiCard = { background: "#fff", border: "1px solid #eef2f7", borderRadius: 10, padding: 12 };
const kpiLabel = { color: "#6b7280", fontSize: 12, marginBottom: 4 };
const kpiValue = { fontWeight: 900, fontSize: 20, color: "#111827" };
const muted = { color: "#6b7280" };
const mutedSmall = { color: "#6b7280", fontSize: 12 };

const badge = (estado) => {
  const base = { padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 };
  if (estado === "APROBADO") return { ...base, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46" };
  if (estado === "RECHAZADO") return { ...base, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" };
  return { ...base, background: "#fff7ed", border: "1px solid #fed7aa" ,color: "#9a3412" }; 
};
