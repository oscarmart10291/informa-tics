// src/components/MeseroBell.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { http, openSSE } from "../config/client";

// Clave de "último visto" en localStorage
const lastSeenKey = (meseroId) => `mesero:lastSeen:${meseroId}`;

// Intenta leer una fecha de distintos campos
function parseCreatedAt(n) {
  const v = n?.creadoEn || n?.createdAt || n?.fecha || n?.ts || n?.timestamp;
  if (!v) return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function MeseroBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [sseOK, setSseOK] = useState(false);
  const pollRef = useRef(null);
  const esRef = useRef(null);

  // Usuario/rol
  const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
  const rolNombre = usuario?.rol?.nombre || "";
  const esMesero = String(rolNombre).toUpperCase() === "MESERO";
  const meseroId = usuario?.id || usuario?.userId || null;

  // Derivados
  const unseen = useMemo(() => list.filter((n) => !n.visto).length, [list]);

  // Normaliza push SSE -> item
  const pushFromEvt = (evt) => {
    const now = new Date().toISOString();
    return {
      id: `${evt.type || "evt"}-${evt.itemId || evt.ordenId || "-"}-${now}`,
      visto: false,
      tipo: String(evt.subtipo || evt.tipo || "").toUpperCase() === "BEBIDA" ? "BEBIDA" : "PLATILLO",
      orden: { codigo: evt.codigo || evt.ordenId },
      ordenId: evt.ordenId,
      itemNombre: evt.itemNombre || "(ítem)",
      creadoEn: evt.creadoEn || now,
    };
  };

  // Aplica "visto" local
  function applyLocalSeen(items) {
    const raw = Array.isArray(items) ? items : [];
    const lastSeen = Number(localStorage.getItem(lastSeenKey(meseroId)) || 0);
    if (!lastSeen) return raw;
    const cutoff = new Date(lastSeen);
    return raw.map((n) => {
      if (n.visto) return n;
      const d = parseCreatedAt(n);
      return d && d <= cutoff ? { ...n, visto: true } : n;
    });
  }

  // REST inicial
  async function fetchNotifs() {
    if (!meseroId) return;
    try {
      const { data } = await http.get(`/mesero/notifs`, {
        params: { meseroId, limit: 30 },
      });
      const arr = Array.isArray(data) ? data : [];
      setList(applyLocalSeen(arr));
    } catch {
      // ignora
    }
  }

  // Marcar todas como vistas
  async function markAllSeen() {
    if (!meseroId) return;
    try {
      await http.patch(`/mesero/notifs/visto-todas`, null, { params: { meseroId } });
    } catch {}
    const now = Date.now();
    localStorage.setItem(lastSeenKey(meseroId), String(now));
    setList((prev) => prev.map((n) => ({ ...n, visto: true })));
  }

  // Montaje: carga inicial
  useEffect(() => {
    if (!meseroId || !esMesero) return;
    fetchNotifs();
    return () => clearInterval(pollRef.current);
  }, [meseroId, esMesero]);

  // Suscripción SSE con fallback
  useEffect(() => {
    if (!meseroId || !esMesero) return;

    esRef.current?.close?.();
    clearInterval(pollRef.current);

    const es = openSSE(
      "MESERO",
      {
        open: () => setSseOK(true),
        error: () => {
          setSseOK(false);
          clearInterval(pollRef.current);
          pollRef.current = setInterval(fetchNotifs, 12000);
        },
        message: (data) => {
          if (data?.type === "ITEM_LISTO") {
            const nuevo = pushFromEvt(data);
            setList((prev) => applyLocalSeen([nuevo, ...prev]).slice(0, 30));
          }
        },
      },
      { scopedUserId: meseroId } // 👈 suscribe a MESERO:<id>
    );

    esRef.current = es;
    return () => {
      es.close?.();
      esRef.current = null;
      clearInterval(pollRef.current);
    };
  }, [meseroId, esMesero]);

  // Cerrar popup al hacer click fuera
  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.(".bell-wrap")) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (!esMesero || !meseroId) return null;
  const dot = unseen > 0;

  return (
    <div className="bell-wrap" style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          border: "none",
          background: "transparent",
          position: "relative",
          cursor: "pointer",
          fontSize: 22,
          color: "white",
        }}
        title={sseOK ? "Notificaciones (tiempo real)" : "Notificaciones"}
      >
        🔔
        {dot && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: "#2563eb",
              color: "#fff",
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              fontWeight: 700,
              boxShadow: "0 0 0 2px #13354B",
            }}
          >
            {unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 360,
            maxHeight: 420,
            overflow: "auto",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.12)",
            zIndex: 60,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>
              Notificaciones {sseOK ? "· en vivo" : "· actualizando..."}
            </span>
            <button
              type="button"
              onClick={markAllSeen}
              disabled={unseen === 0}
              title="Marcar todas como vistas"
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e2e8f0",
                background: unseen > 0 ? "#0ea5e9" : "#e2e8f0",
                color: unseen > 0 ? "#fff" : "#64748b",
                cursor: unseen > 0 ? "pointer" : "default",
                fontWeight: 700,
              }}
            >
              {`Limpiar${unseen ? ` (${unseen})` : ""}`}
            </button>
          </div>

          {list.length === 0 ? (
            <div style={{ padding: 12, color: "#64748b" }}>
              Sin notificaciones.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    background: n.visto ? "#fff" : "#e0ecff",
                    color: "#0f172a",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {n.tipo === "BEBIDA" ? "Bebida" : "Platillo"} listo ·{" "}
                    <span style={{ color: "#334155" }}>
                      Orden {n.orden?.codigo || n.ordenId}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#334155" }}>
                    {n.itemNombre}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                      marginTop: 2,
                    }}
                  >
                    {new Date(parseCreatedAt(n) || Date.now()).toLocaleTimeString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
