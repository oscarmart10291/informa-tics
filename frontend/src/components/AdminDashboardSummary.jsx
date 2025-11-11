// frontend/src/pages/AdminDashboardSummary.jsx
import React, { useEffect, useState } from "react";
import { http } from "../config/client";

const REFRESH_MS = Number(import.meta?.env?.VITE_DASHBOARD_REFRESH_MS ?? 10000);

/* ============================== UI Shell ============================== */
const Shell = ({ right, children }) => (
  <div
    style={{
      maxWidth: 1100,
      margin: "20px auto 0",
      background: "linear-gradient(180deg,#ffffff,#f7fafc)",
      borderRadius: 16,
      boxShadow: "0 10px 24px rgba(2,6,23,.06)",
      padding: "16px 18px",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <h2
        style={{
          margin: 0,
          color: "#0f172a",
          fontSize: "1.4rem",
          fontWeight: 900,
          letterSpacing: ".2px",
        }}
      >
        Resumen de hoy
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: ".9rem", color: "#64748b" }}>
          {right || "Se actualiza automáticamente"}
        </span>
        <button
          onClick={() =>
            window.dispatchEvent(new CustomEvent("dashboard-reload"))
          }
          style={{
            border: 0,
            padding: "7px 12px",
            borderRadius: 999,
            background: "linear-gradient(90deg,#60a5fa,#34d399)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: ".9rem",
            boxShadow: "0 8px 18px rgba(59,130,246,.22)",
          }}
        >
          Recargar
        </button>
      </div>
    </div>
    {children}
  </div>
);

const StatCard = ({ icon, label, value, footer }) => (
  <div
    style={{
      background: "#0f172a",
      color: "#e2e8f0",
      borderRadius: 14,
      padding: 14,
      boxShadow: "0 10px 22px rgba(2,6,23,.22)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: "#0ea5e9",
          color: "#fff",
          fontSize: "1.05rem",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: ".98rem", opacity: 0.9 }}>{label}</div>
    </div>
    <div
      style={{
        fontSize: "1.9rem",
        fontWeight: 900,
        marginTop: 6,
        color: "#fff",
        lineHeight: 1.15,
      }}
    >
      {value}
    </div>
    {footer && (
      <div style={{ marginTop: 6, fontSize: ".9rem", color: "#cbd5e1" }}>
        {footer}
      </div>
    )}
  </div>
);

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const mesasGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 12,
};

const pill = (bg, fg) => ({
  position: "relative",
  background: bg,
  color: fg,
  fontWeight: 800,
  fontSize: "1.05rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 14,
  height: 60,
  boxShadow: "0 8px 18px rgba(2,6,23,.08)",
  border: "1px solid rgba(0,0,0,.05)",
});

const colorByVisual = (visual) => {
  switch (visual) {
    case "OCUPADA":
      return pill("#FEE2E2", "#991B1B");
    case "RESERVADA":
      return pill("#FEF3C7", "#92400E");
    default:
      return pill("#DCFCE7", "#065F46");
  }
};

const badge = {
  position: "absolute",
  top: -6,
  right: -6,
  background: "#1d4ed8",
  color: "#fff",
  fontSize: ".75rem",
  fontWeight: 800,
  padding: "1px 6px",
  borderRadius: 999,
  boxShadow: "0 2px 6px rgba(2,6,23,.2)",
};

/* ============================== Helpers de conteo ============================== */
/**
 * PLATILLOS: obtiene total por estado desde varias estructuras de respuesta.
 * Busca en este orden:
 * 1) data.kpisCocina { pendientes, asignados, preparando }
 * 2) campos directos platillosPendientesHoy / Asignados / Preparandose
 * 3) objeto platillosPorEstado { PENDIENTE, ASIGNADO, PREPARANDO }
 * 4) lista detalleCocina [{ estado }]
 */
function getPlatilloTotals(data) {
  const zero = { pendientes: 0, asignados: 0, preparando: 0 };
  if (!data || typeof data !== "object") return zero;

  if (data.kpisCocina && typeof data.kpisCocina === "object") {
    return {
      pendientes: Number(data.kpisCocina.pendientes || 0),
      asignados: Number(data.kpisCocina.asignados || 0),
      preparando: Number(data.kpisCocina.preparando || 0),
    };
  }

  const direct = {
    pendientes: Number(data.platillosPendientesHoy || 0),
    asignados: Number(data.platillosAsignadosHoy || 0),
    preparando: Number(data.platillosPreparandoseHoy || 0),
  };
  if (direct.pendientes || direct.asignados || direct.preparando) return direct;

  if (data.platillosPorEstado && typeof data.platillosPorEstado === "object") {
    const m = data.platillosPorEstado;
    return {
      pendientes: Number(m.PENDIENTE || m.pendiente || 0),
      asignados: Number(m.ASIGNADO || m.asignado || 0),
      preparando: Number(m.PREPARANDO || m.preparando || 0),
    };
  }

  if (Array.isArray(data.detalleCocina)) {
    return data.detalleCocina.reduce(
      (acc, it) => {
        const s = String(it?.estado || "").toUpperCase();
        if (s === "PENDIENTE") acc.pendientes += 1;
        else if (s === "ASIGNADO") acc.asignados += 1;
        else if (s === "PREPARANDO") acc.preparando += 1;
        return acc;
      },
      { ...zero }
    );
  }

  return zero;
}

/**
 * BEBIDAS: mismo patrón que platillos.
 * Busca en este orden:
 * 1) data.kpisBarra { pendientes, asignados, preparando }
 * 2) campos directos bebidasPendientesHoy / Asignadas / Preparandose
 * 3) objeto bebidasPorEstado { PENDIENTE, ASIGNADO, PREPARANDO }
 * 4) lista detalleBarra [{ estado }]
 */
function getBebidaTotals(data) {
  const zero = { pendientes: 0, asignados: 0, preparando: 0 };
  if (!data || typeof data !== "object") return zero;

  if (data.kpisBarra && typeof data.kpisBarra === "object") {
    return {
      pendientes: Number(data.kpisBarra.pendientes || 0),
      asignados: Number(data.kpisBarra.asignados || 0),
      preparando: Number(data.kpisBarra.preparando || 0),
    };
  }

  const direct = {
    pendientes: Number(data.bebidasPendientesHoy || 0),
    asignados: Number(data.bebidasAsignadasHoy || 0),
    preparando: Number(data.bebidasPreparandoseHoy || 0),
  };
  if (direct.pendientes || direct.asignados || direct.preparando) return direct;

  if (data.bebidasPorEstado && typeof data.bebidasPorEstado === "object") {
    const m = data.bebidasPorEstado;
    return {
      pendientes: Number(m.PENDIENTE || m.pendiente || 0),
      asignados: Number(m.ASIGNADO || m.asignado || 0),
      preparando: Number(m.PREPARANDO || m.preparando || 0),
    };
  }

  if (Array.isArray(data.detalleBarra)) {
    return data.detalleBarra.reduce(
      (acc, it) => {
        const s = String(it?.estado || "").toUpperCase();
        if (s === "PENDIENTE") acc.pendientes += 1;
        else if (s === "ASIGNADO") acc.asignados += 1;
        else if (s === "PREPARANDO") acc.preparando += 1;
        return acc;
      },
      { ...zero }
    );
  }

  return zero;
}

export default function AdminDashboardSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const money = (n) => `Q ${Number(n || 0).toFixed(2)}`;

  async function fetchData() {
    try {
      const { data } = await http.get("/reportes/dashboard-hoy");
      setData(data);
    } catch (e) {
      console.error("dashboard-hoy error:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    const onManual = () => fetchData();
    window.addEventListener("dashboard-reload", onManual);
    return () => {
      clearInterval(id);
      window.removeEventListener("dashboard-reload", onManual);
    };
  }, []);

  if (loading || !data) return null;

  const topPlat = data.masVendidoPlatillo
    ? `${data.masVendidoPlatillo.nombre} (${data.masVendidoPlatillo.qty})`
    : "—";
  const topBeb = data.masVendidoBebida
    ? `${data.masVendidoBebida.nombre} (${data.masVendidoBebida.qty})`
    : "—";

  const actLocal = Number(data.ordenesActivasLocal || 0);
  const actOnline = Number(data.ordenesActivasOnline || 0);
  const terLocal = Number(data.ordenesTerminadasHoyLocal ?? 0);
  const terOnline = Number(data.ordenesTerminadasHoyOnline ?? 0);

  // KPIs de cocina (platillos)
  const {
    pendientes: pPend,
    asignados: pAsig,
    preparando: pPrep,
  } = getPlatilloTotals(data);
  const platPrep = Number(pPrep || 0);
  const platPendOAsign = Number(pPend || 0) + Number(pAsig || 0);

  // KPIs de barra (bebidas)
  const {
    pendientes: bPend,
    asignados: bAsig,
    preparando: bPrep,
  } = getBebidaTotals(data);
  const bebPrep = Number(bPrep || 0);
  const bebPendOAsign = Number(bPend || 0) + Number(bAsig || 0);

  const ordenesMesero = (data.ordenesMesero ?? [])
    .map((m) => ({
      id: m.meseroId ?? m.id ?? null,
      nombre: m.nombre ?? "Sin mesero",
      activos: m.activas ?? 0,
    }))
    .filter((m) => m.id !== null && m.nombre !== "Sin mesero");

  const mesas = data.mesas || [];
  const totalMesas = mesas.length;
  const disp = mesas.filter(
    (m) => (m.visualEstado || m.estado) === "DISPONIBLE"
  ).length;
  const ocu = mesas.filter(
    (m) => (m.visualEstado || m.estado) === "OCUPADA"
  ).length;
  const res = mesas.filter(
    (m) => (m.visualEstado || m.estado) === "RESERVADA"
  ).length;

  return (
    <Shell right={`Se actualiza cada ${Math.round(REFRESH_MS / 1000)} s`}>
      {/* KPIs */}
      <div style={statsGrid}>
        <StatCard icon="💰" label="Ingresos de hoy" value={money(data.ventasDia)} />
        <StatCard
          icon="🍽️"
          label="Platillos vendidos"
          value={data.platillosVendidos}
          footer={`Más vendido: ${topPlat}`}
        />
        <StatCard
          icon="🥤"
          label="Bebidas vendidas"
          value={data.bebidasVendidas}
          footer={`Más vendido: ${topBeb}`}
        />
        <StatCard icon="👥" label="Usuarios activos" value={data.usuariosActivos} />

        <StatCard
          icon="⏳"
          label="Órdenes activas (en proceso)"
          value={data.ordenesActivas}
          footer={`Local: ${actLocal} · En línea: ${actOnline}`}
        />
        <StatCard
          icon="✅"
          label="Órdenes terminadas (hoy)"
          value={data.ordenesTerminadasHoy}
          footer={`Local: ${terLocal} · En línea: ${terOnline}`}
        />

        {/* KPIs de cocina (platillos) */}
        <StatCard
          icon="🧑‍🍳"
          label="Platillos en Preparación"
          value={platPrep}
          footer="Estado: EN PREPARACIÓN"
        />
        <StatCard
          icon="⌚"
          label="Platillos en Espera"
          value={platPendOAsign}
          footer="Estado: EN ESPERA O ASIGNADOS"
        />

        {/* KPIs de barra (bebidas) */}
        <StatCard
          icon="🍹"
          label="Bebidas en Preparación"
          value={bebPrep}
          footer="Estado: EN PREPARACIÓN"
        />
        <StatCard
          icon="🧃"
          label="Bebidas en Espera"
          value={bebPendOAsign}
          footer="Estado: EN ESPERA O ASIGNADOS"
        />
      </div>

      {/* Órdenes por mesero */}
      <div
        style={{
          marginTop: 20,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#0f172a" }}>
          Órdenes por mesero (activas)
        </div>
      </div>

      {ordenesMesero.length === 0 ? (
        <div
          style={{
            border: "1px dashed #e2e8f0",
            borderRadius: 12,
            padding: "12px 14px",
            color: "#64748b",
            fontSize: ".95rem",
          }}
        >
          No hay órdenes activas asignadas a meseros.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          {ordenesMesero.map((m) => (
            <div
              key={String(m.id)}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 7px 14px rgba(2,6,23,.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: "#e0e7ff",
                    color: "#3730a3",
                    fontWeight: 800,
                    fontSize: "1rem",
                  }}
                >
                  🧑‍🍳
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    color: "#0f172a",
                    fontSize: ".98rem",
                  }}
                >
                  {m.nombre}
                </div>
              </div>
              <div
                style={{
                  minWidth: 30,
                  height: 26,
                  borderRadius: 999,
                  padding: "0 10px",
                  display: "grid",
                  placeItems: "center",
                  background: "#dcfce7",
                  color: "#065f46",
                  fontWeight: 800,
                  fontSize: ".95rem",
                }}
              >
                {m.activos}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado de las Mesas */}
      <div
        style={{
          marginTop: 10,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#0f172a" }}>
          Estado de las Mesas
        </div>
        <div style={{ fontSize: ".95rem", color: "#0f172a" }}>
          <span style={{ opacity: 0.7 }}>Total:</span> <b>{totalMesas}</b> ·{" "}
          <span style={{ color: "#065F46" }}>
            Disponibles: <b>{disp}</b>
          </span>{" "}
          ·{" "}
          <span style={{ color: "#991B1B" }}>
            Ocupadas: <b>{ocu}</b>
          </span>{" "}
          ·{" "}
          <span style={{ color: "#92400E" }}>
            Reservadas: <b>{res}</b>
          </span>
        </div>
      </div>

      <div style={mesasGrid}>
        {mesas.map((m) => {
          const visual = m.visualEstado || m.estado;
          const boxStyle = colorByVisual(visual);
          const badgeText =
            (m.reservaEnMin ?? null) !== null
              ? m.reservaEnMin <= 0
                ? "Res. ahora"
                : `Res. ${m.reservaEnMin}`
              : null;

          return (
            <div
              key={m.id}
              style={boxStyle}
              title={`Mesa ${m.numero} — ${visual}${
                badgeText ? ` · ${badgeText}` : ""
              }`}
            >
              {badgeText && <span style={badge}>{badgeText}</span>}
              {m.numero}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
