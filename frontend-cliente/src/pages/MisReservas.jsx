// frontend-cliente/src/pages/MisReservas.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { http, ReservasApi } from '../utils/api';
import { getUser } from '../utils/session';

function chip(color, bg) {
  return { display:'inline-block', padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:800, color, background:bg };
}
const estadoBadge = (s) => {
  const v = String(s||'').toUpperCase();
  if (v === 'CONFIRMADA') return <span style={chip('#065f46','#d1fae5')}>CONFIRMADA</span>;
  if (v === 'PENDIENTE')   return <span style={chip('#92400e','#ffedd5')}>PENDIENTE</span>;
  if (v === 'CANCELADA')   return <span style={chip('#991b1b','#fee2e2')}>CANCELADA</span>;
  if (v === 'CUMPLIDA')    return <span style={chip('#1e40af','#dbeafe')}>CUMPLIDA</span>;
  return <span>{v}</span>;
};
const listSig = (arr) => (arr || [])
  .map(r => [
    r.id,
    r.estado,
    r.pagoEstado,
    r.mesa?.numero ?? '',
    new Date(r.fechaHora).getTime(),
    r.hastaHora ? new Date(r.hastaHora).getTime() : 0,
    r.monto ?? 0
  ].join(':'))
  .sort()
  .join('|');

function within24h(now, startISO) {
  const diff = new Date(startISO).getTime() - now.getTime();
  return diff < 24*60*60*1000;
}
function isPastOrStarted(now, startISO) {
  return now >= new Date(startISO);
}

export default function MisReservas() {
  const user = getUser();
  const email = (user?.correo || '').trim();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState({ show:false, type:'success', message:'' });
  const [confirm, setConfirm] = useState({ open:false, target:null, policyText:'' });
  const [cancelling, setCancelling] = useState(false);

  // 👇 Nuevo: filtro por estado
  const [fEstado, setFEstado] = useState('TODOS'); // TODOS | CONFIRMADA | CANCELADA | CUMPLIDA | PENDIENTE

  const intervalRef = useRef(null);
  const firstLoadRef = useRef(true);
  const lastSigRef = useRef('');

  const showToast = (message, type='success') => {
    setToast({ show:true, type, message });
    setTimeout(() => setToast((t) => ({ ...t, show:false })), 2500);
  };

  async function cargar({ background = false } = {}) {
    if (!email) return;
    if (!background && firstLoadRef.current) {
      setLoading(true);
      setErr('');
    }
    try {
      const { data } = await http.get(`/reservas/mis?email=${encodeURIComponent(email)}`);
      const next = Array.isArray(data) ? data : [];
      const nextSig = listSig(next);
      if (nextSig !== lastSigRef.current) {
        lastSigRef.current = nextSig;
        setItems(next);
      }
    } catch (e) {
      setErr(e?.response?.data?.error || 'No se pudieron cargar tus reservas');
      setItems([]);
    } finally {
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line
  }, [email]);

  useEffect(() => {
    if (!email) return;
    intervalRef.current = setInterval(() => cargar({ background: true }), 8000);
    const onFocus = () => cargar({ background: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') cargar({ background: true });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [email]);

  // ======= Cancelación del cliente =======
  const canClientCancel = (r) => {
    const now = new Date();
    if (String(r.estado).toUpperCase() !== 'CONFIRMADA') return false;
    // Solo permitir si aún no inició
    if (isPastOrStarted(now, r.fechaHora)) return false;
    return true;
  };

  const askCancel = (r) => {
    if (!canClientCancel(r)) return;

    const now = new Date();
    const w24 = within24h(now, r.fechaHora);
    const policyText = w24
      ? 'Si cancelas con menos de 24 horas de anticipación, NO hay reembolso.'
      : 'Cancelar con al menos 24 horas de anticipación SÍ genera reembolso del anticipo.';
    setConfirm({ open:true, target:r, policyText });
  };

  const doCancel = async () => {
    const target = confirm.target;
    if (!target || cancelling) return;
    setCancelling(true);
    try {
      await ReservasApi.cancelarCliente(target.id, email);
      setConfirm({ open:false, target:null, policyText:'' });
      showToast('Reserva cancelada correctamente', 'success');
      cargar();
    } catch (e) {
      const status = e?.response?.status;
      const apiMsg = e?.response?.data?.error;
      const msg = apiMsg || (status === 429
        ? 'El día de hoy ya cancelaste una reservación. Intenta mañana.'
        : 'No se pudo cancelar la reserva');
      setConfirm({ open:false, target:null, policyText:'' });
      showToast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  };

  // 👇 Nuevo: aplicar filtro por estado
  const itemsFiltrados = useMemo(() => {
    const wanted = String(fEstado || 'TODOS').toUpperCase();
    if (wanted === 'TODOS') return items;
    return (items || []).filter(r => String(r.estado || '').toUpperCase() === wanted);
  }, [items, fEstado]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginTop:0 }}>📜 Mis reservaciones</h1>

      {/* Filtros */}
      <div style={{ display:'flex', gap:12, alignItems:'end', margin:'10px 0 16px' }}>
        <div>
          <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Estado</label>
          <select
            value={fEstado}
            onChange={(e)=>setFEstado(e.target.value)}
            style={{ padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
          >
            <option value="TODOS">Todos</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="CUMPLIDA">Cumplida</option>
          </select>
        </div>
      </div>

      {!email && (
        <p style={{ color:'#b91c1c' }}>
          Tu sesión no tiene un correo asociado. Inicia sesión con correo para ver y cancelar tus reservas.
        </p>
      )}

      {loading && <p>Cargando…</p>}
      {err && <p style={{ color:'#b91c1c' }}>{err}</p>}
      {!loading && email && itemsFiltrados.length === 0 && <p>No se encontraron reservaciones con ese estado.</p>}

      <div style={{ display:'grid', gap:12 }}>
        {itemsFiltrados.map(r => {
          const f1 = new Date(r.fechaHora);
          const f2 = new Date(r.hastaHora || r.fechaHora);
          const now = new Date();
          const w24 = within24h(now, r.fechaHora);
          const elegible = canClientCancel(r);
          return (
            <div key={r.id} style={{ background:'#fff', border:'1px solid #eee', borderRadius:12, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontWeight:800 }}>Mesa #{r.mesa?.numero} · {estadoBadge(r.estado)}</div>
                  <div style={{ color:'#475569' }}>
                    {f1.toLocaleString('es-GT', { hour12:false })} — {f2.toLocaleString('es-GT', { hour12:false })}
                  </div>
                  {r.nota && <div style={{ color:'#64748b', fontStyle:'italic' }}>Nota: {r.nota}</div>}
                  {String(r.estado).toUpperCase() === 'CONFIRMADA' && (
                    <div style={{ marginTop:6, fontSize:12, color: w24 ? '#991b1b' : '#065f46' }}>
                      {w24
                        ? 'Si cancelas ahora: NO hay reembolso (menos de 24h).'
                        : 'Si cancelas ahora: Sí se reembolsará tu anticipo (≥24h).'}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right', fontWeight:700 }}>
                  Anticipo: Q{Number(r.monto || 50).toFixed(2)} <br/> Pago: {r.pagoEstado}
                  <div style={{ marginTop:8, display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => askCancel(r)}
                      disabled={!elegible}
                      style={{
                        padding:'8px 12px',
                        borderRadius:8,
                        border:'1px solid',
                        borderColor: elegible ? '#ef4444' : '#e5e7eb',
                        background: elegible ? '#ef4444' : '#f3f4f6',
                        color: '#fff',
                        cursor: elegible ? 'pointer' : 'not-allowed',
                        fontWeight:800
                      }}
                      title={elegible ? 'Cancelar esta reserva' : 'No se puede cancelar (ya inició o no está confirmada)'}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm modal */}
      {confirm.open && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.4)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
        }}>
          <div style={{ width:'min(520px, 92vw)', background:'#fff', borderRadius:12, padding:16, boxShadow:'0 20px 60px rgba(0,0,0,.35)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <h3 style={{ margin:0, fontSize:18 }}>Cancelar reserva</h3>
              <button
                onClick={() => setConfirm({ open:false, target:null, policyText:'' })}
                style={{ border:'none', width:36, height:36, borderRadius:10, background:'#f1f5f9', color:'#0f172a', fontSize:22, fontWeight:800, lineHeight:'36px', cursor:'pointer' }}
                aria-label="Cerrar"
              >×</button>
            </div>
            <div style={{ color:'#111827', marginBottom:10 }}>
              ¿Seguro que quieres cancelar tu reserva de la mesa #{confirm.target?.mesa?.numero}?
              <div style={{ marginTop:8, padding:'8px 10px', border:'1px solid #fde68a', background:'#fff7ed', color:'#92400e', borderRadius:8 }}>
                {confirm.policyText}
              </div>
              <div style={{ marginTop:8, fontSize:12, color:'#64748b' }}>
                Recibirás un correo con la confirmación de la cancelación.
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button
                onClick={() => setConfirm({ open:false, target:null, policyText:'' })}
                style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #cbd5e1', background:'#e5e7eb', fontWeight:700 }}
              >
                No, volver
              </button>
              <button
                onClick={doCancel}
                disabled={cancelling}
                style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ef4444', background:'#ef4444', color:'#fff', fontWeight:800, opacity: cancelling ? .8 : 1 }}
                title={cancelling ? 'Cancelando…' : 'Sí, cancelar'}
              >
                {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast simple */}
      {toast.show && (
        <div style={{
          position:'fixed', right:16, bottom:16, background: toast.type==='success' ? '#16a34a' : '#dc2626',
          color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 20px rgba(0,0,0,.2)', fontWeight:700
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
