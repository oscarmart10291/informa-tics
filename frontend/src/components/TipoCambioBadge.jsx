// src/components/TipoCambioBadge.jsx
import React, { useEffect, useState } from 'react';
import { http } from '../config/client';

/**
 * Props:
 * - variant: "floating" | "inline"  (default: "floating")
 * - fixed: boolean (solo aplica si variant === "floating")
 * - corner: "top-right" | "top-left" | "bottom-right" | "bottom-left"
 */
export default function TipoCambioBadge({
  variant = 'floating',
  fixed = true,
  corner = 'bottom-right',
}) {
  const [tc, setTc] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    try {
      setErr('');
      const { data } = await http.get('/moneda/tipo-cambio');
      setTc(data);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        'Error';
      setErr(msg);
      setTc(null);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60 * 60 * 1000); // 1h
    return () => clearInterval(id);
  }, []);

  // ===== estilos
  const chip = {
    background: '#0ea5e9',
    color: '#fff',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  };
  const small = { fontSize: 11, opacity: 0.9, whiteSpace: 'nowrap' };
  const num = { fontVariantNumeric: 'tabular-nums' };

  if (variant === 'inline') {
    // Para colocarlo dentro de barras/headers
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          color: 'white',
          lineHeight: 1.2,
        }}
        title={err ? `Error: ${err}` : (tc?.stale ? 'Dato en caché' : '')}
      >
        <span style={chip}>USD → GTQ</span>
        {tc ? (
          <div style={{ display: 'grid' }}>
            <strong style={{ fontSize: 13, ...num }}>
              Q {Number(tc.gtqPorUsd || 0).toFixed(5)}
            </strong>
            <span style={small}>
              {tc.fuente}
              {tc.cached ? ' · cache' : ''}
              {tc.stale ? ' · stale' : ''} · {tc.fechaGT || ''}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: '#ffd7d7' }}>
            Sin conexión a tipo de cambio
          </span>
        )}
        <button
          onClick={load}
          title="Actualizar"
          style={{
            marginLeft: 6,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.35)',
            color: 'white',
            borderRadius: 8,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          ↻
        </button>
      </div>
    );
  }

  // variant === 'floating'
  const pos = (() => {
    const base = { position: fixed ? 'fixed' : 'absolute', zIndex: 50 };
    if (corner === 'top-right') return { ...base, top: 12, right: 12 };
    if (corner === 'top-left') return { ...base, top: 12, left: 12 };
    if (corner === 'bottom-left') return { ...base, bottom: 12, left: 12 };
    return { ...base, bottom: 12, right: 12 };
  })();

  return (
    <div
      style={{
        ...pos,
        background: '#062d3e',
        color: '#e5f3ff',
        padding: '8px 12px',
        borderRadius: 12,
        boxShadow: '0 6px 22px rgba(0,0,0,.18)',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      title={err ? `Error: ${err}` : (tc?.stale ? 'Dato en caché' : '')}
    >
      <span style={chip}>USD → GTQ</span>
      {tc ? (
        <div>
          <div style={{ fontWeight: 800, ...num }}>
            Q {Number(tc.gtqPorUsd || 0).toFixed(5)}
          </div>
          <div style={{ fontSize: 11, color: '#b6dcff' }}>
            {tc.fuente}
            {tc.cached ? ' · cache' : ''}
            {tc.stale ? ' · stale' : ''} · {tc.fechaGT || ''}
          </div>
        </div>
      ) : (
        <div style={{ color: '#ffd7d7' }}>Sin conexión a tipo de cambio</div>
      )}
      <button
        onClick={load}
        title="Actualizar"
        style={{
          marginLeft: 8,
          background: 'transparent',
          border: '1px solid #0ea5e9',
          color: '#e5f3ff',
          borderRadius: 8,
          padding: '4px 8px',
          cursor: 'pointer',
        }}
      >
        ↻
      </button>
    </div>
  );
}
