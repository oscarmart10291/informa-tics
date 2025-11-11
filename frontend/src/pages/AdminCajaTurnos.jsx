// src/pages/AdminCajaTurnos.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import PageTopBar from '../components/PageTopBar';
import { http, openSSE } from '../config/client';

/* ===================== Denominaciones ===================== */
const DENOMS = [
  { key: 'Q200', label: 'Q200', v: 200 },
  { key: 'Q100', label: 'Q100', v: 100 },
  { key: 'Q50',  label: 'Q50',  v: 50  },
  { key: 'Q20',  label: 'Q20',  v: 20  },
  { key: 'Q10',  label: 'Q10',  v: 10  },
  { key: 'Q5',   label: 'Q5',   v: 5   },
  { key: 'Q1',   label: 'Q1',   v: 1   },
  { key: 'Q0_50',label: 'Q0.50',v: 0.5 },
  { key: 'Q0_25',label: 'Q0.25',v: 0.25},
];
const VAL = Object.fromEntries(DENOMS.map(d => [d.key, d.v]));
const qtz = (n) => `Q ${Number(n || 0).toFixed(2)}`;
const toNum = (v)=> Number.isFinite(Number(v)) ? Number(v) : 0;
const denomsTotal = (map) => DENOMS.reduce((a,d)=> a + toNum(map?.[d.key])*d.v, 0);

/* ========================================================== */

export default function AdminCajaTurnos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('Todos');
  const [msg, setMsg] = useState('');
  const [cierreAyer, setCierreAyer] = useState(null);

  // Modal
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);

  // Preview cierre
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const sseRef = useRef(null);

  async function load() {
    setMsg('');
    setLoading(true);
    try {
      const estadoParam = filtro && filtro.toUpperCase() !== 'TODOS' ? filtro : undefined;
      const { data } = await http.get('/caja/turnos/admin/list', { params: { estado: estadoParam } });
      const list = Array.isArray(data?.turnos) ? data.turnos : (Array.isArray(data) ? data : []);
      setRows(list);
      if (sel) {
        const updated = list.find(x => x.id === sel.id) || null;
        setSel(prev => (prev ? { ...prev, ...(updated || {}) } : prev));
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }
  async function loadCierreAyer() {
    try {
      const { data } = await http.get('/caja/turnos/cierre/ayer');
      setCierreAyer(data);
    } catch {}
  }

  useEffect(() => { load(); }, [filtro]);
  useEffect(() => { loadCierreAyer(); }, []);

  // SSE + focus
  useEffect(() => {
    try { sseRef.current?.close?.(); } catch {}
    const es = openSSE('/caja/stream');
    sseRef.current = es;

    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        const tipos = [
          'apertura_solicitada',
          'apertura_autorizada',
          'apertura_rechazada',
          'apertura_cerrada',
          'cierre_solicitado',
          'cierre_autorizado',
          'cierre_rechazado',
          'turno_actualizado',
        ];
        if (tipos.includes(evt.type)) {
          load();
          loadCierreAyer();
        }
      } catch {}
    };

    const onFocus = () => { load(); loadCierreAyer(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);

    return () => {
      try { es.close(); } catch {}
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  // Acciones admin
  async function autorizarApertura(id) {
    try {
      await http.post('/caja/turnos/admin/autorizar', { turnoId: id });
      setOpen(false); await load();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }
  async function rechazarApertura(id) {
    try {
      await http.post('/caja/turnos/admin/rechazar', { turnoId: id });
      setOpen(false); await load();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }
  async function autorizarCierre(id) {
    try {
      await http.post('/caja/turnos/admin/autorizar-cierre', { turnoId: id });
      setOpen(false); await load();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }
  async function rechazarCierre(id) {
    try {
      await http.post('/caja/turnos/admin/rechazar-cierre', { turnoId: id });
      setOpen(false); await load();
    } catch (e) { alert(e?.response?.data?.error || e.message); }
  }

  function openView(t) { setSel(t); setOpen(true); setPreview(null); }

  const estadoSel = String(sel?.estado || '').trim().toUpperCase();
  const esAperturaPend = estadoSel === 'PENDIENTE';
  const esCierre = estadoSel === 'CIERRE_PENDIENTE' || estadoSel === 'CERRADA' || !!sel?.cierreSolicitadoEn;

  // Conteo a mostrar
  const conteo = useMemo(() => {
    if (!sel) return {};
    return esCierre ? (sel.conteoFinal || sel.conteoCierre || {}) : (sel.conteoInicial || {});
  }, [sel, esCierre]);

  // Totales
  const totalConteoCalc = useMemo(() => denomsTotal(conteo), [conteo]);
  const totalDeclarado = useMemo(() => {
    if (!sel) return 0;
    return esCierre
      ? (Number(sel.montoCierre || 0) || totalConteoCalc)
      : (Number(sel.montoApertura || 0) || totalConteoCalc);
  }, [sel, esCierre, totalConteoCalc]);

  const aperturaDia = Number(sel?.montoApertura || 0);
  const diffVsApertura = Number((totalDeclarado - aperturaDia).toFixed(2));

  // Preview avanzado
  async function calcularPreviewCierre() {
    if (!sel?.id) return;
    setLoadingPreview(true);
    try {
      const { data } = await http.get('/caja/turnos/admin/preview-cierre', { params: { turnoId: sel.id } });
      setPreview(data);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || 'No se pudo calcular la comparación');
    } finally {
      setLoadingPreview(false);
    }
  }

  const netoAyer = Number(cierreAyer?.neto || 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb' }}>
      <PageTopBar title="Turnos de caja" backTo="/admin" />

      <main style={{ maxWidth: 1100, margin: '20px auto', padding: '0 16px' }}>
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 4px 12px rgba(0,0,0,0.05)', padding:20 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
            <label>Estado:</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option>Todos</option>
              <option>Pendiente</option>
              <option>Abierta</option>
              <option>Rechazada</option>
              <option>Cerrada</option>
              <option>Cierre_Pendiente</option>
            </select>
            <button onClick={load} style={btnGhost}>Refrescar</button>
          </div>

          {cierreAyer && (
            <div style={{ marginBottom:12, padding:10, borderRadius:8, background:'#eef6ff', border:'1px solid #cfe3ff', color:'#1e3a8a' }}>
              <b>Cierre de ayer:</b> Efectivo {qtz(cierreAyer.efectivo)} ·
              Egresos aprobados {qtz(cierreAyer.egresosAprobados)} ·
              Neto {qtz(cierreAyer.neto)}
            </div>
          )}

          {msg && (
            <div
              style={{
                marginBottom:12,
                padding:10,
                borderRadius:8,
                background:'#fff8e1',
                border:'1px solid #ffe0a3', // 👈 aquí estaba el error
                color:'#7a5b00'
              }}
            >
              {msg}
            </div>
          )}

          {loading ? (
            <p>Cargando…</p>
          ) : rows.length === 0 ? (
            <p>No hay turnos.</p>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
                <thead>
                  <tr>
                    <th style={th}>ID</th>
                    <th style={th}>Cajero</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Monto</th>
                    <th style={th}>Solicitado</th>
                    <th style={th}>Contestado</th>
                    <th style={th}>Cerrado</th>
                    <th style={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id}>
                      <td style={td}>{t.id}</td>
                      <td style={td}>{t.cajero?.nombre || t.cajeroId}</td>
                      <td style={td}>{t.estado}</td>
                      <td style={td}>{qtz(t.montoApertura)}</td>
                      <td style={td}>{t.solicitadoEn ? new Date(t.solicitadoEn).toLocaleString() : ''}</td>
                      <td style={td}>{t.autorizadoEn ? new Date(t.autorizadoEn).toLocaleString() : ''}</td>
                      <td style={td}>{t.cerradoEn ? new Date(t.cerradoEn).toLocaleString() : ''}</td>
                      <td style={td}>
                        <button onClick={() => openView(t)} style={btnView}>Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {open && sel && (
        <div style={modalWrap} onClick={()=>setOpen(false)}>
          <div style={modalCard} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0 }}>
                {esCierre   ? `Cierre · Turno #${sel.id}` :
                 esAperturaPend ? `Apertura · Turno #${sel.id}` :
                                  `Turno #${sel.id}`}
              </h3>
              <button onClick={()=>setOpen(false)} style={btnClose}>×</button>
            </div>

            <div style={{ color:'#6b7280', marginBottom:10 }}>
              Cajero: <b>{sel.cajero?.nombre || sel.cajeroId}</b> · Solicitado: {sel.solicitadoEn ? new Date(sel.solicitadoEn).toLocaleString() : '—'}
              {sel.cierreSolicitadoEn && <> · Cierre solicitado: {new Date(sel.cierreSolicitadoEn).toLocaleString()}</>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              {/* Izquierda: Conteo */}
              <div style={{ border:'1px solid #eef2f7', borderRadius:10, padding:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontWeight:700 }}>Total declarado</div>
                  <div style={{ fontWeight:800, fontSize:20 }}>{qtz(totalDeclarado)}</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
                  {DENOMS.map(d => {
                    const qty = Number(conteo[d.key] || 0);
                    const subtotal = qty * d.v;
                    return (
                      <div key={d.key} style={conteoBox}>
                        <div style={{ fontWeight:700 }}>{d.label}</div>
                        <div style={{ fontSize:12, color:'#64748b' }}>{qty} × {qtz(d.v)}</div>
                        <div style={{ fontWeight:700 }}>{qtz(subtotal)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Derecha */}
              <div style={{ border:'1px solid #eef2f7', borderRadius:10, padding:12 }}>
                {esCierre ? (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ fontWeight:700 }}>Comparación con apertura de hoy</div>
                      <button
                        disabled={loadingPreview}
                        onClick={calcularPreviewCierre}
                        style={{ ...btnGhost, borderColor:'#0ea5e9', color:'#0369a1', background:'#f0f9ff' }}
                      >
                        {loadingPreview ? 'Calculando…' : 'Calcular'}
                      </button>
                    </div>

                    {preview ? (
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
                        <tbody>
                          <tr><td style={tdL}>Apertura declarada</td><td style={tdR}>{qtz(preview.apertura)}</td></tr>
                          <tr><td style={tdL}>Efectivo ingresado (recibido - cambio)</td><td style={tdR}>{qtz(preview.efectivoIngresado)}</td></tr>
                          <tr><td style={tdL}>Egresos aprobados</td><td style={tdR}>{qtz(preview.egresosAprobados)}</td></tr>
                          <tr><td style={tdL}>Esperado (apertura + neto)</td><td style={tdR}>{qtz(preview.esperado)}</td></tr>
                          <tr><td style={tdL}>Total declarado en cierre</td><td style={tdR}>{qtz(preview.declarado)}</td></tr>
                          {(() => {
                            const dif = Number(preview.declarado||0) - Number(preview.esperado||0);
                            const color = dif === 0 ? '#065f46' : (dif > 0 ? '#166534' : '#b91c1c');
                            return (
                              <tr>
                                <td style={{...tdL, fontWeight:800}}>Diferencia (declarado - esperado)</td>
                                <td style={{...tdR, fontWeight:800, color}}>{qtz(dif)}</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    ) : (
                      <>
                        <div style={rowBetween}><span>Apertura declarada</span><b>{qtz(aperturaDia)}</b></div>
                        <div style={rowBetween}><span>Total declarado en cierre</span><b>{qtz(totalDeclarado)}</b></div>
                        <div style={{ ...rowBetween, marginTop:6 }}>
                          <span>Diferencia (cierre - apertura)</span>
                          <b style={{ color: diffVsApertura < 0 ? '#b91c1c' : '#065f46' }}>{qtz(diffVsApertura)}</b>
                        </div>
                        <div style={{ fontSize:12, color:'#64748b', marginTop:8 }}>
                          Tip: pulsa <b>Calcular</b> para ver el esperado real (apertura + efectivo neto del día − egresos aprobados).
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight:700, marginBottom:10 }}>Cierre anterior</div>
                    <div style={rowBetween}><span>Neto de ayer</span><b>{qtz(netoAyer)}</b></div>
                    <div style={rowBetween}><span>Total declarado hoy</span><b>{qtz(totalDeclarado)}</b></div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:8 }}>
                      * El neto de ayer = Efectivo – Egresos aprobados del día anterior.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Botonera */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              {esAperturaPend && (
                <>
                  <button onClick={()=>autorizarApertura(sel.id)} style={btnGreen}>Autorizar</button>
                  <button onClick={()=>rechazarApertura(sel.id)} style={btnRed}>Rechazar</button>
                </>
              )}
              {estadoSel === 'CIERRE_PENDIENTE' && (
                <>
                  <button onClick={()=>autorizarCierre(sel.id)} style={btnGreen}>Autorizar cierre</button>
                  <button onClick={()=>rechazarCierre(sel.id)} style={btnRed}>Rechazar</button>
                </>
              )}
              <button onClick={()=>setOpen(false)} style={btnGhost}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== Styles ===================== */
const th = { borderBottom:'1px solid #e5e7eb', padding:'8px 6px', color:'#6b7280', textAlign:'left' };
const td = { borderBottom:'1px solid #f3f4f6', padding:'8px 6px', color:'#111827' };

const btnGhost = { background:'transparent', color:'#1e3d59', border:'1px solid #cbd5e1', padding:'6px 10px', borderRadius:8, fontWeight:600 };
const btnView  = { background:'#1e40af', color:'#fff', border:'none', padding:'6px 10px', borderRadius:8, fontWeight:700 };
const btnGreen = { background:'#059669', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnRed   = { background:'#dc2626', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnClose = { background:'transparent', border:'none', fontSize:22, lineHeight:1, cursor:'pointer', color:'#475569' };

const modalWrap = {
  position:'fixed', inset:0, background:'rgba(15,23,42,.35)',
  display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:50
};
const modalCard = {
  width:'min(950px, 100%)', background:'#fff', borderRadius:12,
  boxShadow:'0 20px 60px rgba(0,0,0,.25)', padding:18
};

const conteoBox = {
  border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 12px',
  display:'grid', gridTemplateColumns:'1fr auto', gridTemplateRows:'auto auto',
  rowGap:4, columnGap:8
};
const rowBetween = { display:'flex', alignItems:'center', justifyContent:'space-between' };

const tdL = { padding:'6px 4px', borderBottom:'1px solid #e5e7eb' };
const tdR = { padding:'6px 4px', borderBottom:'1px solid #e5e7eb', textAlign:'right' };
