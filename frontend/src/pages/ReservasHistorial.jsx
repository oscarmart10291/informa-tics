// frontend/src/pages/ReservasHistorial.jsx
import React, { useEffect, useMemo, useState } from 'react';
import AdminHeader from '../components/AdminHeader';
import ToastMessage from '../components/ToastMessage';
import { getHistorialReservas, cancelarReserva } from '../api/reservas';
import CancelReservaModal from '../components/CancelReservaModal';

const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;
const toLocal = (iso) => new Date(iso).toLocaleString('es-GT', { hour12: false });

// ⬇️ NUEVO: formatea "DD/MM/AAAA, HH:mm:ss — HH:mm:ss"
const fmtRango = (iniISO, finISO) => {
  try {
    const ini = new Date(iniISO);
    const fin = new Date(finISO);
    const sameDay = ini.toDateString() === fin.toDateString();
    const fecha = ini.toLocaleDateString('es-GT');
    const hIni  = ini.toLocaleTimeString('es-GT', { hour12: false });
    const hFin  = fin.toLocaleTimeString('es-GT', { hour12: false });
    return sameDay
      ? `${fecha}, ${hIni} — ${hFin}`
      : `${toLocal(iniISO)} — ${toLocal(finISO)}`;
  } catch {
    return toLocal(iniISO);
  }
};

function useDefaultRange() {
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - 30);
  const pad = (v) => String(v).padStart(2, '0');
  const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return { desde: toInput(start), hasta: toInput(end) };
}

export default function ReservasHistorial() {
  const def = useDefaultRange();
  const [desde, setDesde] = useState(def.desde);
  const [hasta, setHasta] = useState(def.hasta);
  const [estado, setEstado] = useState('TODAS');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show:false, type:'success', message:'' });

  // Cancelar modal
  const [showCancel, setShowCancel] = useState(false);
  const [target, setTarget] = useState(null);

  // Nota modal
  const [noteModal, setNoteModal] = useState({ open:false, text:'' });
  const openNote  = (r) => setNoteModal({ open:true, text: String(r?.nota || '').trim() });
  const closeNote = () => setNoteModal({ open:false, text:'' });

  const showToast = (message, type='success') => {
    setToast({ show:true, type, message });
    setTimeout(() => setToast((t) => ({ ...t, show:false })), 2500);
  };

  // ========= params seguros =========
  const params = useMemo(() => {
    const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const toISOStart = (s) => (isYMD(s) ? new Date(`${s}T00:00:00`).toISOString() : undefined);
    const toISOEnd   = (s) => (isYMD(s) ? new Date(`${s}T23:59:59`).toISOString() : undefined);

    return {
      desde: toISOStart(desde),
      hasta: toISOEnd(hasta),
      estado: estado === 'TODAS' ? undefined : estado,
      q: q?.trim() || undefined
    };
  }, [desde, hasta, estado, q]);

  async function load() {
    setLoading(true);
    try {
      const data = await getHistorialReservas(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      showToast('No se pudo cargar el historial', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */}, [params]);

  // Cancelar
  const openCancelFor = (r) => { setTarget(r); setShowCancel(true); };
  const handleCancelSubmit = async ({ reembolsar, motivo }) => {
    try {
      await cancelarReserva(target.id, { reembolsar, motivo });
      setShowCancel(false);
      setTarget(null);
      showToast('Reserva cancelada');
      load();
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'No se pudo cancelar';
      showToast(msg, 'error');
    }
  };

  return (
    <>
      <AdminHeader />
      <div style={{ maxWidth:1100, margin:'0 auto', padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h1 style={{ margin:0 }}>Historial de Reservas</h1>
          <button onClick={load} style={btn}>Actualizar</button>
        </div>

        {/* Filtros */}
        <div style={card}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10 }}>
            <div>
              <label style={lbl}>Desde</label>
              <input type="date" value={desde} onChange={(e)=>setDesde(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Hasta</label>
              <input type="date" value={hasta} onChange={(e)=>setHasta(e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Estado</label>
              <select value={estado} onChange={(e)=>setEstado(e.target.value)} style={inp}>
                <option value="TODAS">Todas</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CANCELADA">Cancelada</option>
                <option value="CUMPLIDA">Cumplida</option>
              </select>
            </div>
            <div style={{ gridColumn:'span 2' }}>
              <label style={lbl}>Buscar</label>
              <input
                placeholder="cliente, teléfono, mesa, código…"
                value={q} onChange={(e)=>setQ(e.target.value)}
                style={inp}
              />
            </div>
          </div>

          <div style={{ marginTop:10, textAlign:'right' }}>
            <button onClick={load} style={btnPrimary}>Filtrar</button>
          </div>
        </div>

        {/* Tabla */}
        <div style={card}>
          {loading ? (
            <div style={{ color:'#64748b' }}>Cargando…</div>
          ) : rows.length === 0 ? (
            <div style={{ color:'#64748b' }}>Sin resultados</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={th}>Fecha/Hora</th>
                    <th style={th}>Mesa</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Contacto</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Pago</th>
                    <th style={th}>Anticipo</th>
                    <th style={th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      {/* ⬇️ AQUÍ el rango inicio—fin */}
                      <td style={td}>{fmtRango(r.fechaHora, r.hastaHora)}</td>
                      <td style={td}>#{r.mesaNumero}</td>
                      <td style={td}>
                        {r.nombre}
                        {String(r.nota||'').trim() && (
                          <span style={pillNota} title="Tiene nota">Nota</span>
                        )}
                      </td>
                      <td style={td}>{r.telefono || r.email || '-'}</td>
                      <td style={td}>
                        <b>{r.estado}</b>
                        {r.estado === 'CANCELADA' && r.pagoEstado === 'PAGADO' && (
                          <div style={{ fontSize:12, color:'#dc2626' }}>
                            {r.refundMonto > 0
                              ? `Reembolso automático Q${Number(r.refundMonto).toFixed(2)}`
                              : 'Sin reembolso'}
                          </div>
                        )}
                      </td>
                      <td style={td}>{r.pagoEstado || '—'}</td>
                      <td style={td}>{fmtQ(r.anticipo ?? r.monto ?? 0)}</td>
                      <td style={td}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <button onClick={() => openNote(r)} style={btn}>Ver nota</button>
                          {['CONFIRMADA', 'PENDIENTE'].includes(String(r.estado).toUpperCase()) ? (
                            <button onClick={() => openCancelFor(r)} style={btnDanger}>Cancelar</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Cancelación */}
      <CancelReservaModal
        open={showCancel}
        onClose={() => { setShowCancel(false); setTarget(null); }}
        onSubmit={handleCancelSubmit}
        reserva={target ? {
          id: target.id,
          mesaNumero: target.mesaNumero,
          fechaHora: target.fechaHora,
          hastaHora: target.hastaHora
        } : null}
      />

      {/* Modal: Ver nota */}
      {noteModal.open && (
        <div style={backdrop}>
          <div style={modalCard}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <h3 style={{ margin:0, fontSize:18 }}>Nota de la reserva</h3>
              <button onClick={closeNote} style={btn}>Cerrar</button>
            </div>
            <div style={{ padding:'8px 0', color:'#111827' }}>
              {noteModal.text
                ? <div style={noteBox}>{noteModal.text}</div>
                : <div style={{ color:'#64748b' }}><em>No hay nota</em></div>}
            </div>
          </div>
        </div>
      )}

      <ToastMessage
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast((t) => ({ ...t, show:false }))}
      />

      <style>{`
        h1{font-size:22px;font-weight:800;color:#0f172a}
      `}</style>
    </>
  );
}

/* estilos inline */
const card = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, marginTop:12 };
const lbl  = { display:'block', fontSize:12, color:'#475569', marginBottom:4 };
const inp  = { width:'100%', padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8, outline:'none' };
const btn  = { padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', background:'#f8fafc', cursor:'pointer' };
const btnPrimary = { ...btn, background:'#2563eb', borderColor:'#2563eb', color:'#fff' };
const btnDanger  = { ...btn, background:'#ef4444', borderColor:'#ef4444', color:'#fff' };
const tbl  = { width:'100%', borderCollapse:'collapse', fontSize:14 };
const th   = { textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'8px 6px', color:'#6b7280' };
const td   = { borderBottom:'1px solid #f3f4f6', padding:'8px 6px', color:'#111827' };

const pillNota = {
  marginLeft:6, fontSize:12, color:'#92400e', background:'#fef3c7',
  border:'1px solid #fde68a', display:'inline-block', padding:'2px 6px',
  borderRadius:9999, fontWeight:600
};

// Modal estilos simples
const backdrop = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.35)',
  display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
};
const modalCard = {
  width:'min(560px, 92vw)', background:'#fff', border:'1px solid #e5e7eb',
  borderRadius:12, padding:16, boxShadow:'0 .5rem 1rem rgba(0,0,0,.15)'
};
const noteBox = {
  whiteSpace:'pre-wrap',
  background:'#f8fafc',
  border:'1px solid #e5e7eb',
  borderRadius:8,
  padding:'10px 12px',
  lineHeight:1.4
};
