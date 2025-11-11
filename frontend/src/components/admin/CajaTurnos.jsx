// frontend/src/pages/admin/CajaTurnos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../../config/client';

const DENOM_VALUES = { Q200:200, Q100:100, Q50:50, Q20:20, Q10:10, Q5:5, Q1:1, Q0_50:0.5, Q0_25:0.25 };
function denomsTotalClient(raw = {}) {
  let sum = 0;
  for (const [k,v] of Object.entries(raw)) {
    const key = String(k).replace('.', '_');
    const qty = Number(v) || 0;
    const val = DENOM_VALUES[key] || 0;
    sum += qty * val;
  }
  return Number(sum.toFixed(2));
}

/* === Helper: obtener id del usuario (admin) desde el localStorage === */
function getAdminId() {
  try {
    const u = JSON.parse(localStorage.getItem('usuario') || 'null');
    return u?.id || null;
  } catch { return null; }
}

export default function CajaTurnos() {
  const [estado, setEstado] = useState('TODOS');
  const [turnos, setTurnos] = useState([]);
  const [sel, setSel] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPrev, setLoadingPrev] = useState(false);

  async function load() {
    const { data } = await http.get('/caja/turnos/admin/list', { params: { estado } });
    setTurnos(data.turnos || []);
  }
  useEffect(()=>{ load(); }, [estado]);

  useEffect(() => {
    if (!sel || sel.modo !== 'CIERRE') { setPreview(null); return; }
    (async () => {
      try {
        setLoadingPrev(true);
        const { data } = await http.get('/caja/turnos/admin/preview-cierre', { params: { turnoId: sel.id } });
        setPreview(data);
      } finally {
        setLoadingPrev(false);
      }
    })();
  }, [sel]);

  function openModal(t) {
    const modo = t.cierreSolicitadoEn ? 'CIERRE' : 'APERTURA';
    setSel({ ...t, modo });
  }
  function closeModal(){ setSel(null); setPreview(null); }

  /* ======================== ACCIONES ADMIN ======================== */
  async function autorizarApertura() {
    const adminId = getAdminId();
    if (!adminId) return alert('Sesión inválida (admin no identificado). Vuelve a iniciar sesión.');
    await http.post('/caja/turnos/admin/autorizar', { turnoId: sel.id, aprobar: true, cajeroId: adminId });
    await load(); closeModal();
  }
  async function rechazarApertura() {
    const adminId = getAdminId();
    if (!adminId) return alert('Sesión inválida (admin no identificado). Vuelve a iniciar sesión.');
    await http.post('/caja/turnos/admin/rechazar', { turnoId: sel.id, aprobar: false, cajeroId: adminId });
    await load(); closeModal();
  }
  async function autorizarCierre() {
    const adminId = getAdminId();
    if (!adminId) return alert('Sesión inválida (admin no identificado). Vuelve a iniciar sesión.');
    await http.post('/caja/turnos/admin/autorizar-cierre', { turnoId: sel.id, aprobar: true, cajeroId: adminId });
    await load(); closeModal();
  }
  async function rechazarCierre() {
    const adminId = getAdminId();
    if (!adminId) return alert('Sesión inválida (admin no identificado). Vuelve a iniciar sesión.');
    await http.post('/caja/turnos/admin/rechazar-cierre', { turnoId: sel.id, aprobar: false, cajeroId: adminId });
    await load(); closeModal();
  }

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:'8px 0'}}>Turnos de caja</h2>

      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
        <label>Estado:</label>
        <select value={estado} onChange={e=>setEstado(e.target.value)}>
          <option>TODOS</option>
          <option>PENDIENTE</option>
          <option>ABIERTA</option>
          <option>CIERRE_PENDIENTE</option>
          <option>RECHAZADA</option>
          <option>CERRADA</option>
        </select>
        <button onClick={load}>Refrescar</button>
      </div>

      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Cajero</th>
            <th style={th}>Estado</th>
            <th style={th}>Apertura</th>
            <th style={th}>Cierre</th>
            <th style={th}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {turnos.map(t=>(
            <tr key={t.id}>
              <td style={td}>{t.id}</td>
              <td style={td}>{t.cajero?.nombre || '-'}</td>
              <td style={td}>{t.estado}</td>
              <td style={td}>Q {Number(t.montoApertura||0).toFixed(2)}</td>
              <td style={td}>{t.cierreSolicitadoEn ? `Solicitado` : t.montoCierre ? `Q ${Number(t.montoCierre).toFixed(2)}`:'—'}</td>
              <td style={td}>
                <button onClick={()=>openModal(t)} style={btnVer}>Ver</button>
              </td>
            </tr>
          ))}
          {!turnos.length && (
            <tr><td style={td} colSpan={6}>Sin registros.</td></tr>
          )}
        </tbody>
      </table>

      {sel && (
        <Modal onClose={closeModal}>
          {sel.modo === 'APERTURA' ? (
            <AperturaPanel turno={sel} onAutorizar={autorizarApertura} onRechazar={rechazarApertura} />
          ) : (
            <CierrePanel
              turno={sel}
              preview={preview}
              loading={loadingPrev}
              onAutorizar={autorizarCierre}
              onRechazar={rechazarCierre}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function AperturaPanel({ turno, onAutorizar, onRechazar }) {
  const total = useMemo(()=> Number(
    (turno?.montoApertura ??
     (turno?.conteoInicial?.total) ??
     denomsTotalClient(turno?.conteoInicial || {})).toFixed(2)
  ), [turno]);

  return (
    <div style={{width:860}}>
      <Header title={`Apertura · Turno #${turno.id}`} sub={
        <>Cajero: <b>{turno.cajero?.nombre||'-'}</b> · Solicitado: {fmt(turno.solicitadoEn)}</>
      }/>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <DenomsBox title="Total declarado" conteo={turno.conteoInicial} total={total}/>
        <ResumenApertura total={total}/>
      </div>
      <FooterButtons
        primaryText="Autorizar apertura"
        onPrimary={onAutorizar}
        secondaryText="Rechazar"
        onSecondary={onRechazar}
        onClose={null}
      />
    </div>
  );
}

function CierrePanel({ turno, preview, loading, onAutorizar, onRechazar }) {
  const totalCierre = useMemo(()=> Number(
    (turno?.montoCierre ??
     turno?.totalCierre ??
     turno?.conteoFinal?.total ??
     denomsTotalClient(turno?.conteoFinal || {})).toFixed(2)
  ), [turno]);

  return (
    <div style={{width:860}}>
      <Header title={`Cierre · Turno #${turno.id}`} sub={
        <>Cajero: <b>{turno.cajero?.nombre||'-'}</b> · Solicitado: {fmt(turno.solicitadoEn)} · Cierre solicitado: {fmt(turno.cierreSolicitadoEn)}</>
      }/>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <DenomsBox title="Total declarado" conteo={turno.conteoFinal} total={totalCierre}/>
        <div style={card}>
          <div style={boxTitle}>Comparación con apertura de hoy</div>
          {loading ? (
            <div>Cargando…</div>
          ) : preview ? (
            <div>
              <Row label="Apertura declarada" value={`Q ${Number(preview.apertura||0).toFixed(2)}`}/>
              <Row label="Total declarado en cierre" value={`Q ${Number(preview.declarado||totalCierre).toFixed(2)}`}/>
              <Row label="Diferencia (cierre - apertura)" value={`Q ${Number((preview.declarado ?? totalCierre) - (preview.apertura||0)).toFixed(2)}`} bold danger={Number((preview.declarado ?? totalCierre) - (preview.apertura||0))<0}/>
            </div>
          ) : (
            <div>
              <Row label="Apertura declarada" value={`Q ${Number(turno.montoApertura||0).toFixed(2)}`}/>
              <Row label="Total declarado en cierre" value={`Q ${totalCierre.toFixed(2)}`}/>
              <Row label="Diferencia (cierre - apertura)" value={`Q ${(totalCierre - Number(turno.montoApertura||0)).toFixed(2)}`} bold danger={(totalCierre - Number(turno.montoApertura||0))<0}/>
            </div>
          )}
        </div>
      </div>
      <FooterButtons
        primaryText="Autorizar cierre"
        onPrimary={onAutorizar}
        secondaryText="Rechazar"
        onSecondary={onRechazar}
        onClose={null}
      />
    </div>
  );
}

/* ============ UI helpers ============ */
function Modal({ children, onClose }) {
  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <button onClick={onClose} style={modalClose}>×</button>
        {children}
      </div>
    </div>
  );
}
function Header({ title, sub }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:22, fontWeight:800}}>{title}</div>
      <div style={{color:'#475569'}}>{sub}</div>
    </div>
  );
}
function DenomsBox({ title, conteo, total }) {
  const pairs = [
    ['Q200','Q100'],['Q50','Q20'],['Q10','Q5'],['Q1','Q0.50'],['Q0.25',null]
  ];
  const safe = conteo || {};
  return (
    <div style={card}>
      <div style={boxTitle}>{title} <span style={{float:'right', fontWeight:800}}>Q {total.toFixed(2)}</span></div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        {pairs.map(([a,b])=>(
          <div key={a+b} style={{display:'flex', gap:8}}>
            <DenomLine label={a} qty={safe[a] ?? safe[a?.replace('.','_')] ?? 0}/>
            {b && <DenomLine label={b} qty={safe[b] ?? safe[b?.replace('.','_')] ?? 0}/>}
          </div>
        ))}
      </div>
    </div>
  );
}
function DenomLine({ label, qty }) {
  const value = DENOM_VALUES[String(label).replace('.','_')] || 0;
  const total = Number(value * (Number(qty)||0)).toFixed(2);
  return (
    <div style={denomBadge}>
      <div style={{fontWeight:700}}>{label}</div>
      <div style={{fontSize:12, color:'#64748b'}}>{Number(qty||0)} × Q {value.toFixed(2)}</div>
      <div style={{fontWeight:700}}>Q {total}</div>
    </div>
  );
}
function ResumenApertura({ total }) {
  return (
    <div style={card}>
      <div style={boxTitle}>Cierre anterior</div>
      <Row label="Total declarado hoy" value={`Q ${Number(total||0).toFixed(2)}`}/>
      <div style={{fontSize:12, color:'#64748b', marginTop:8}}>* Comparativa mostrada al autorizar apertura.</div>
    </div>
  );
}
function Row({ label, value, bold, danger }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', margin:'6px 0', fontWeight:bold?700:500, color: danger ? '#b91c1c' : undefined}}>
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}
function FooterButtons({ primaryText, onPrimary, secondaryText, onSecondary }) {
  return (
    <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:14}}>
      <button onClick={onPrimary} style={btnPrimary}>{primaryText}</button>
      <button onClick={onSecondary} style={btnDanger}>{secondaryText}</button>
      <button onClick={()=>window.dispatchEvent(new Event('close-admin-modal'))} style={btnGhost}>Cerrar</button>
    </div>
  );
}

/* ============ styles ============ */
const th = { textAlign:'left', padding:8, borderBottom:'1px solid #e5e7eb', background:'#f8fafc' };
const td = { padding:8, borderBottom:'1px solid #e5e7eb' };
const btnVer = { background:'#0f172a', color:'#fff', border:'none', padding:'6px 10px', borderRadius:8 };
const btnPrimary = { background:'#16a34a', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnDanger  = { background:'#b91c1c', color:'#fff', border:'none', padding:'8px 12px', borderRadius:8, fontWeight:700 };
const btnGhost   = { background:'#fff', color:'#1e293b', border:'1px solid #cbd5e1', padding:'8px 12px', borderRadius:8, fontWeight:600 };
const card = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, minHeight:180 };
const boxTitle = { fontWeight:800, marginBottom:8 };
const denomBadge = { flex:1, border:'1px solid #e5e7eb', borderRadius:10, padding:8, background:'#f8fafc' };
const modalBackdrop = { position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 };
const modalCard = { background:'#fff', borderRadius:12, padding:16, minWidth:820, maxWidth:980, position:'relative' };
const modalClose = { position:'absolute', top:8, right:10, border:'none', background:'transparent', fontSize:22, cursor:'pointer' };

function fmt(dt) { if(!dt) return '—'; const d = new Date(dt); return d.toLocaleString(); }
