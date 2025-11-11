// src/components/PageTopBar.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import MeseroBell from './MeseroBell';
import NotificationBellRepartidor from './NotificationBellRepartidor';
import TipoCambioBadge from './TipoCambioBadge';

const wrap = {
  position: 'sticky',
  top: 0,
  left: 0,
  zIndex: 10,
  width: '100%',
  background: '#13354B',
  color: 'white',
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  borderRadius: 0,
  boxSizing: 'border-box',
};

// contenedor centrado para el badge (no bloquea los clics laterales)
const centerWrap = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
};
const centerInner = { pointerEvents: 'auto' };

const btn = {
  border: 'none',
  color: 'white',
  padding: '10px 16px',
  borderRadius: '999px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'transform .06s ease',
};
const backBtn = { ...btn, background: '#0F7A65' };
const logoutBtn = { ...btn, background: '#e63946' };

function safeUser() {
  try { return JSON.parse(localStorage.getItem('usuario') || 'null'); }
  catch { return null; }
}

export default function PageTopBar({
  title = 'Vista',
  backTo = '/panel',
  showRole = true,
  showBack = true,
  onLogout = null,
  logoutLabel = 'Cerrar sesión',
  backWithRefresh = true,
  backState = {},
  backReplace = false,
}) {
  const navigate = useNavigate();
  const usuario = safeUser();
  const rolNombre = usuario?.rol?.nombre || 'Usuario';
  const rolUpper = String(rolNombre || '').toUpperCase();
  const esMesero = rolUpper === 'MESERO';
  const esRepartidor = rolUpper === 'REPARTIDOR';
  const esCajero = rolUpper === 'CAJERO';

  const handleBack = () => {
    const state = backWithRefresh
      ? { ...backState, refresh: Date.now() }
      : { ...backState };
    navigate(backTo, { state, replace: backReplace });
  };

  return (
    <div style={{ ...wrap, position: 'sticky' }}>
      {/* Izquierda: título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '20px' }}>
        <span role="img" aria-label="ubicacion">📍</span>
        <span>{title}</span>
      </div>

      {/* Centro absoluto: Tipo de cambio SOLO CAJERO */}
      {esCajero && (
        <div style={centerWrap}>
          <div style={centerInner}>
            {/* 5 decimales ya vienen en el componente */}
            <TipoCambioBadge variant="inline" />
          </div>
        </div>
      )}

      {/* Derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {esMesero && <MeseroBell />}
        {esRepartidor && <NotificationBellRepartidor />}

        {showRole && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255,255,255,0.12)', padding: '8px 12px',
              borderRadius: '999px', fontWeight: 600
            }}
          >
            <span role="img" aria-label="user">👤</span>
            {rolNombre}
          </span>
        )}

        {showBack && (
          <button
            type="button"
            style={backBtn}
            onClick={handleBack}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            ← Volver al Panel
          </button>
        )}

        {typeof onLogout === 'function' && (
          <button
            type="button"
            style={logoutBtn}
            onClick={onLogout}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {logoutLabel}
          </button>
        )}
      </div>
    </div>
  );
}
