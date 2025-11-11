// src/views/Egresos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTopBar from '../components/PageTopBar';
import { http, openSSE } from '../config/client';

/* ============================== Helpers ============================== */
const toKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '_');
const money = (n) => `Q ${Number(n || 0).toFixed(2)}`;

function hasCajaPermission(usuario) {
  const role = toKey(typeof usuario?.rol === 'string' ? usuario.rol : usuario?.rol?.nombre);
  if (role === 'ADMIN' || role === 'ADMINISTRADOR') return true;

  const set = new Set((usuario?.permisos || []).map((p) =>
    toKey(typeof p === 'string' ? p : (p?.nombre || p?.clave || p?.key || ''))
  ));
  return set.has('CAJA');
}

// intenta una lista de endpoints hasta que alguno responda
async function tryGET(endpoints = []) {
  let lastErr;
  for (const ep of endpoints) {
    try {
      const res = await http.get(ep);
      return res?.data;
    } catch (e) {
      if (e?.response?.status !== 404) lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('No endpoints responded');
}
async function tryPOST(endpoints = [], payload) {
  let lastErr;
  for (const ep of endpoints) {
    try {
      const res = await http.post(ep, payload);
      return res?.data;
    } catch (e) {
      if (e?.response?.status !== 404) lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('No endpoints responded');
}

/* ============================== Vista Egresos (Cajero) ============================== */
export default function Egresos() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

  useEffect(() => { if (!usuario) navigate('/login', { replace: true }); }, [usuario, navigate]);

  const puede = hasCajaPermission(usuario);

  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState('');

  const [ventasHoy, setVentasHoy] = useState([]);
  const [egresosHoy, setEgresosHoy] = useState([]);
  const [loading, setLoading] = useState(true);

  // KPIs
  const efectivo = useMemo(() =>
    ventasHoy
      .filter(v => (v.metodoPago || '').toUpperCase() === 'EFECTIVO')
      .reduce((a, v) => a + Number(v.total || v.totalAPagar || 0), 0)
  , [ventasHoy]);

  const comprometido = useMemo(() =>
    egresosHoy
      .filter(r => ['PENDIENTE','APROBADO'].includes((r.estado || '').toUpperCase()))
      .reduce((a, r) => a + Number(r.monto || 0), 0)
  , [egresosHoy]);

  const disponible = useMemo(() =>
    Math.max(0, Number((efectivo - comprometido).toFixed(2)))
  , [efectivo, comprometido]);

  async function load() {
    setLoading(true);
    try {
      // ventas del día: intenta rutas viejas y nuevas
      const ventasRaw = await tryGET([
        '/caja/ventas/hoy',         // ruta principal
        '/ticket-ventas/hoy',       // posible nueva
        '/reportes/ventas/hoy',     // fallback en reportería
      ]);
      const ventasArr = Array.isArray(ventasRaw) ? ventasRaw : (ventasRaw?.ventas || []);
      setVentasHoy(ventasArr);

      // egresos de hoy (acepta ambos formatos)
      const egRaw = await tryGET([
        '/caja/egresos/hoy',
        '/egresos/hoy',
      ]);
      const egArr = Array.isArray(egRaw)
        ? egRaw
        : (egRaw?.egresos || egRaw?.solicitudes || []);
      setEgresosHoy(egArr);
    } catch (e) {
      console.error(e);
      setVentasHoy([]);
      setEgresosHoy([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const es = openSSE('/caja/stream');
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === 'orden_pagada') load();
        if (evt.type && String(evt.type).startsWith('egreso_')) load();
      } catch {}
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function solicitar(e) {
    e.preventDefault();
    setMsg('');

    const m = Number(monto);
    const mo = String(motivo || '').trim();

    if (!Number.isFinite(m) || m <= 0) {
      setMsg('Ingresa un monto válido.'); return;
    }
    if (!mo || mo.length < 3) {
      setMsg('El motivo es obligatorio (mín. 3 caracteres).'); return;
    }
    if (m > disponible) {
      setMsg(`El monto excede el disponible de hoy (${money(disponible)}).`); return;
    }

    try {
      const payload = {
        cajeroId: Number(usuario?.id),
        monto: m,
        motivo: mo,
      };
      const data = await tryPOST([
        '/caja/egresos',   // ✅ endpoint real en caja.routes.js
        '/egresos',        // ✅ endpoint real en caja.misc.routes.js
      ], payload);

      setMsg(`✅ Solicitud enviada (#${data?.egreso?.id || data?.id || '—'}) por ${money(m)}.`);
      setMonto(''); setMotivo('');
      load();
    } catch (err) {
      const txt = err?.response?.data?.msg || err?.response?.data?.error || 'Error al solicitar egreso';
      setMsg(txt);
    }
  }

  return (
    <div style={pageWrap}>
      <PageTopBar title="Solicitar egreso" backTo="/panel" />

      <main style={mainWrap}>
        <div style={mainCard}>
          {!puede ? (
            <div style={warnBox}>No tienes permiso para solicitar egresos.</div>
          ) : (
            <>
              {msg && <div style={infoBar}>{msg}</div>}

              <div style={kpiGrid4}>
                <KPI label="Efectivo del día" value={money(efectivo)} />
                <KPI label="Comprometido (pend./aprob.)" value={money(comprometido)} />
                <KPI label="Disponible para egreso" value={money(disponible)} />
                <KPI label="Solicitudes (hoy)" value={egresosHoy.length} />
              </div>

              <form onSubmit={solicitar} style={{ ...grid2gap, marginTop: 12 }}>
                <div>
                  <label style={label}>Monto</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={monto}
                    onChange={e=>setMonto(e.target.value)}
                    required
                    style={input}
                  />
                  {Number(monto || 0) > disponible && (
                    <div style={{ fontSize: 12, color:'#b91c1c', marginTop: 4 }}>
                      El monto excede el disponible de hoy.
                    </div>
                  )}
                </div>
                <div>
                  <label style={label}>Motivo</label>
                  <textarea
                    value={motivo}
                    onChange={e=>setMotivo(e.target.value)}
                    required
                    rows={3}
                    style={{ ...input, resize: 'vertical' }}
                    placeholder="Ej. Depositar efectivo en banco"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                  <button
                    type="submit"
                    style={{ ...btnPrimary, opacity: (Number(monto || 0) > 0 && Number(monto || 0) <= disponible && !loading) ? 1 : .7, cursor: (Number(monto || 0) > 0 && Number(monto || 0) <= disponible && !loading) ? 'pointer' : 'not-allowed' }}
                    disabled={!(Number(monto || 0) > 0 && Number(monto || 0) <= disponible) || loading}
                  >
                    Enviar solicitud
                  </button>
                </div>
              </form>

              <div style={{ marginTop: 16 }}>
                <h3 style={subTitle}>Solicitudes del día</h3>
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={{...th, textAlign:'left'}}>Hora</th>
                        <th style={{...th, textAlign:'left'}}>Motivo</th>
                        <th style={{...th, textAlign:'right'}}>Monto</th>
                        <th style={{...th, textAlign:'center'}}>Estado</th>
                        <th style={{...th, textAlign:'left'}}>Observación/Autorización</th>
                      </tr>
                    </thead>
                    <tbody>
                      {egresosHoy.map(e => (
                        <tr key={e.id}>
                          <td style={td}>{new Date(e.creadoEn || e.fecha || Date.now()).toLocaleTimeString('es-GT')}</td>
                          <td style={td}>{e.motivo}</td>
                          <td style={{...td, textAlign:'right', fontWeight:700}}>{money(e.monto)}</td>
                          <td style={{...td, textAlign:'center'}}><span style={badge(e.estado)}>{e.estado || 'PENDIENTE'}</span></td>
                          <td style={td}>
                            {e.autorizadoEn
                              ? `Autor: ${e.autorizadoPorId || '-'} · ${new Date(e.autorizadoEn).toLocaleString('es-GT')} · ${e.observacion || ''}`
                              : (e.observacion || '')
                            }
                          </td>
                        </tr>
                      ))}
                      {egresosHoy.length === 0 && (
                        <tr><td style={{...td, textAlign:'center'}} colSpan={5}>No hay solicitudes hoy</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ===================== Presentational bits ===================== */
function KPI({ label, value }) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
    </div>
  );
}

/* ============================== Styles ============================== */
const pageWrap = { minHeight:'100vh', background:'#f6f7fb', fontFamily:'Segoe UI, sans-serif' };
const mainWrap = { maxWidth:1100, margin:'20px auto', padding:'0 16px' };
const mainCard = { background:'#fff', borderRadius:12, boxShadow:'0 4px 12px rgba(0, 0, 0, 0.05)', padding:20 };

const grid2gap = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 };
const kpiGrid4 = { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 };

const subTitle = { margin:0, marginTop:8, marginBottom:6, color:'#1f2937', fontSize:14, fontWeight:700 };

const label = { display:'block', fontSize:12, color:'#6b7280', marginBottom:6 };
const input = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #d1d5db', outline:'none' };

const table = { width:'100%', borderCollapse:'collapse', fontSize:14 };
const th = { borderBottom:'1px solid #e5e7eb', padding:'8px 6px', color:'#6b7280' };
const td = { borderBottom:'1px solid #f3f4f6', padding:'8px 6px', color:'#111827' };

const btnPrimary = { background:'#0f766e', color:'#fff', border:'none', padding:'10px 14px', borderRadius:10, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' };

const infoBar = { marginBottom:12, padding:10, borderRadius:8, background:'#ecfdf5', border:'1px solid #a7f3d0', color:'#065f46', fontSize:14 };
const warnBox = { background:'#fff8e1', border:'1px solid #ffe0a3', color:'#7a5b00', padding:'1rem', borderRadius:8, textAlign:'center' };

const kpiCard  = { background:'#f8fafc', border:'1px solid #eef2f7', borderRadius:10, padding:12 };
const kpiLabel = { fontSize:12, color:'#6b7280' };
const kpiValue = { fontSize:20, fontWeight:800, color:'#0f172a' };

const badge = (estado) => {
  const base = { padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:700 };
  if ((estado || '').toUpperCase() === 'APROBADO')  return { ...base, background:'#ecfdf5', border:'1px solid #a7f3d0', color:'#065f46' };
  if ((estado || '').toUpperCase() === 'RECHAZADO') return { ...base, background:'#fef2f2', border:'1px solid #fecaca', color:'#991b1b' };
  return { ...base, background:'#fff7ed', border:'1px solid #fed7aa', color:'#9a3412' }; // PENDIENTE
};
