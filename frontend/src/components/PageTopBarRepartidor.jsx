import React from "react";
import { useNavigate } from "react-router-dom";
import NotificationBellRepartidor from "./NotificationBellRepartidor";

const THEME = {
  dark: "#13354B",
  primary: "#0f766e",
  danger: "#e63946",
};

function safeUser() {
  try { return JSON.parse(localStorage.getItem("usuario") || "null"); }
  catch { return null; }
}

/**
 * TopBar exclusivo Repartidor:
 * - IZQ: título
 * - DER: campana, chip de rol y "volver"
 * - En desktop: "Volver al panel"; en móvil: solo ícono ←
 * - Menú de campana fijo y alineado a la derecha (no se corta en móvil)
 */
export default function PageTopBarRepartidor({
  title = "Reparto",
  backTo = "/panel",
  showLogout = false, // (oculto por defecto)
}) {
  const navigate = useNavigate();
  const usuario = safeUser();
  const rolNombre = (usuario?.rol?.nombre || "REPARTIDOR").toString();

  const handleBack = () => navigate(backTo, { state: { refresh: Date.now() } });
  const handleLogout = () => {
    try { localStorage.removeItem("usuario"); sessionStorage.clear(); }
    finally { window.location.replace("/login"); }
  };

  return (
    <header className="rp-topbar" aria-label="Barra superior repartidor">
      {/* IZQUIERDA: Título */}
      <div className="rp-left">
        <div className="rp-title" title={title}>
          <span className="emoji" role="img" aria-label="pin">📍</span>
          <span className="text">{title}</span>
        </div>
      </div>

      {/* DERECHA: campana, rol, volver, (salir opcional) */}
      <div className="rp-right">
        <div className="rp-bell">
          <NotificationBellRepartidor />
        </div>

        <span className="rp-role" title={rolNombre}>
          <span className="emoji" role="img" aria-label="user">👤</span>
          <span className="txt">{rolNombre}</span>
        </span>

        <button
          type="button"
          className="rp-back"
          onClick={handleBack}
          aria-label="Volver al panel"
          title="Volver al panel"
        >
          <span className="icon">←</span>
          <span className="label">Volver al panel</span>
        </button>

        {showLogout && (
          <button
            type="button"
            className="rp-logout"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            ⎋ <span className="label">Salir</span>
          </button>
        )}
      </div>

      <style>{`
        :root{ --rp-topbar-h:56px; }
        @media (min-width: 992px){ :root{ --rp-topbar-h:64px; } }

        .rp-topbar{
          position: sticky; top: 0; left: 0; z-index: 50;
          width: 100%;
          background: ${THEME.dark}; color: #fff;
          padding: max(10px, env(safe-area-inset-top)) 12px 10px;
          display:flex; align-items:center; justify-content:space-between;
          box-shadow: 0 2px 8px rgba(0,0,0,.15);
          min-height: var(--rp-topbar-h);
        }

        .rp-left{ min-width:0; flex: 1 1 auto; }
        .rp-right{ display:flex; align-items:center; gap:8px; flex: 0 0 auto; }

        /* Título: calcula ancho para no chocar con la derecha */
        .rp-title{
          display:flex; align-items:center; gap:8px; min-width:0;
          max-width: calc(100vw - 12px - 12px - 260px); /* paddings + aprox ancho derecha */
        }
        .rp-title .text{
          font-weight:700; font-size:18px; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis;
        }

        /* Chip de rol */
        .rp-role{
          display:inline-flex; align-items:center; gap:6px;
          background: rgba(255,255,255,.16);
          padding: 5px 10px; border-radius: 999px; font-weight:800;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          max-width: 42vw; font-size: 14px;
        }

        /* Botones */
        .rp-back, .rp-logout{
          border:none; border-radius:999px; color:#fff;
          font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:8px;
          padding:8px 12px; transition:transform .06s ease, opacity .2s;
          line-height:1;
        }
        .rp-back{ background:${THEME.primary}; }
        .rp-logout{ background:${THEME.danger}; }
        .rp-back:active, .rp-logout:active{ transform:scale(.98); }
        .rp-back .icon{ font-size:16px; line-height:1; }

        /* CAMPANA */
        .rp-bell{ position:relative; z-index: 60; display:inline-flex; }
        /* Menú de la campana: fijo, ancho controlado y pegado a la derecha */
        .rp-topbar .dropdown-menu.show{
          position: fixed !important;
          right: 10px !important;
          left: auto !important;
          top: calc(var(--rp-topbar-h) + 6px) !important;
          width: min(92vw, 360px) !important;
          max-height: min(70vh, 520px);
          overflow: auto;
          transform: none !important;
          z-index: 70 !important;
        }

        /* RESPONSIVE */
        @media (max-width: 480px){
          .rp-title{ max-width: calc(100vw - 12px - 12px - 200px); }
          .rp-title .text{ font-size:16px; }
          .rp-role{ max-width: 36vw; font-size: 13px; padding: 5px 8px; }
          .rp-back .label{ display:none; } /* móvil: solo ícono */
          .rp-back .icon{ display:inline; }
        }

        @media (min-width: 992px){
          .rp-title{ max-width:none; }
          .rp-role{ max-width:none; }
        }
      `}</style>
    </header>
  );
}
