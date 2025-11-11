// frontend-cliente/src/pages/Reservacion.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../utils/api';
import { getUser } from '../utils/session';

function qtz(n) { return `Q ${Number(n||0).toFixed(2)}`; }

// NUEVO: opciones de anticipo
const ANTICIPOS = [50, 100, 150, 200, 250, 300];

// Horario del restaurante
const OPEN_HOUR  = 7;   // 07:00
const CLOSE_HOUR = 22;  // 22:00 (hora final máxima)

function toLocalDateStr(d) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function clampToBusinessWindow(dateStr, timeStr, kind) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  let hh = h, mm = m;
  if (kind === 'start' && hh < OPEN_HOUR) hh = OPEN_HOUR;
  if (kind === 'end'   && hh <= OPEN_HOUR) hh = OPEN_HOUR + 1;
  if (hh > CLOSE_HOUR) hh = CLOSE_HOUR;
  if (kind === 'end' && (hh === CLOSE_HOUR && mm > 0)) { hh = CLOSE_HOUR; mm = 0; }
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function withinBusinessHours(dateStr, startStr, endStr) {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  if (sh < OPEN_HOUR) return false;
  if (eh > CLOSE_HOUR) return false;
  if (eh === CLOSE_HOUR && em > 0) return false;
  return true;
}
function isPastRange(dateStr, startStr) {
  const now = new Date();
  const start = new Date(`${dateStr}T${startStr}:00`);
  return start.getTime() < now.getTime();
}
const onlyDigits = (s) => (s || '').replace(/\D+/g, '');
const isTel8 = (s) => /^\d{8}$/.test(s || '');

function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function niceDate(isoDate) {
  if (!isISODate(isoDate)) return '—';
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  const intl = new Intl.DateTimeFormat('es-GT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const s = intl.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ========================= Toast fijo (banner) ========================= */
function ToastBanner({ show, type='success', text='', onClose, autoHideMs=6000 }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onClose?.(), autoHideMs);
    return () => clearTimeout(t);
  }, [show, autoHideMs, onClose]);

  if (!show) return null;

  const isOk = type === 'success';
  const bg   = isOk ? '#047857' : '#991b1b';
  const bdr  = isOk ? '#16a34a' : '#fca5a5';

  return (
    <div style={{
      position:'fixed', top:12, left:'50%', transform:'translateX(-50%)',
      zIndex: 10050, minWidth: 320, maxWidth: 640
    }}>
      <div style={{
        background:bg, border:`1px solid ${bdr}`, color:'#ecfdf5',
        padding:'12px 16px', borderRadius:10, boxShadow:'0 10px 25px rgba(0,0,0,.25)',
        display:'flex', alignItems:'center', gap:12
      }}>
        <span style={{
          display:'inline-grid', placeItems:'center',
          width:28, height:28, borderRadius:8, background:'rgba(255,255,255,.12)',
          fontWeight:800
        }}>{isOk ? '✓' : '!'}</span>
        <div style={{fontWeight:700, lineHeight:1.25, flex:1}}>{text}</div>
        <button
          aria-label="Cerrar"
          onClick={onClose}
          style={{ border:'none', background:'transparent', color:'#ecfdf5', fontSize:22, fontWeight:800, lineHeight:'22px', cursor:'pointer' }}
        >×</button>
      </div>
    </div>
  );
}

/* ========================= Modal de Confirmación ========================= */
function ConfirmModal({ open, onClose, onConfirm, resumen, loading, anticipo }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const stop = (e) => e.stopPropagation();

  return (
    <div style={modalBack} onClick={onClose}>
      <div style={modalCard} onClick={stop}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <h3 style={{margin:0, fontSize:18, color:'#0f172a'}}>Confirmar reservación</h3>
          <button onClick={onClose} style={xbtn} aria-label="Cerrar">×</button>
        </div>

        <div style={modalBody}>
          <div style={row}><span style={cap}>Fecha:</span><span>{resumen.fechaLarga}</span></div>
          <div style={row}><span style={cap}>Horario:</span><span>{resumen.horaIni} – {resumen.horaFin}</span></div>
          <div style={row}><span style={cap}>Mesa:</span><span>{resumen.mesaTexto}</span></div>
          <div style={row}><span style={cap}>Nombre:</span><span>{resumen.nombre}</span></div>
          <div style={row}><span style={cap}>Teléfono:</span><span>{resumen.telefono}</span></div>
          {resumen.nota && <div style={row}><span style={cap}>Nota:</span><span>{resumen.nota}</span></div>}
        </div>

        <div style={modalFoot}>
          <div style={{color:'#334155', fontWeight:800}}>Anticipo a pagar: {qtz(anticipo)}</div>
          <div style={{display:'flex', gap:10}}>
            <button onClick={onClose} style={btnGhost}>Cancelar</button>
            <button onClick={onConfirm} style={{...btnPrimary, opacity: loading ? .7 : 1}} disabled={loading}>
              {loading ? 'Procesando…' : 'Confirmar y pagar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================ Vista ================================ */
export default function Reservacion() {
  const user = getUser();
  const correoUser = user?.correo || user?.usuario || '';

  const today = new Date();
  const [fecha, setFecha] = useState(toLocalDateStr(today));
  const [horaIni, setHoraIni] = useState('19:00');
  const [horaFin, setHoraFin] = useState('21:00');
  const [personas, setPersonas] = useState(2);

  const [mesas, setMesas] = useState([]);
  const [mesaSel, setMesaSel] = useState(null);
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');

  // Anticipo variable
  const [anticipo, setAnticipo] = useState(ANTICIPOS[0]);

  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [valMsg, setValMsg] = useState('');

  const [toast, setToast] = useState({ show:false, type:'success', text:'' });
  const hideToast = () => setToast(t => ({ ...t, show:false }));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const safeFecha = useMemo(() => (isISODate(fecha) ? fecha : null), [fecha]);
  const desde = useMemo(() => (safeFecha ? `${safeFecha}T${horaIni}:00` : null), [safeFecha, horaIni]);
  const hasta = useMemo(() => (safeFecha ? `${safeFecha}T${horaFin}:00` : null), [safeFecha, horaFin]);

  const scheduleValidation = useMemo(() => {
    const out = { ok: true, errors: [], invalid: { fecha:false, horaIni:false, horaFin:false } };
    if (!safeFecha) { out.ok = false; out.invalid.fecha = true; out.errors.push('Selecciona una fecha válida.'); return out; }
    const now = new Date();
    const day = new Date(`${safeFecha}T00:00:00`);
    const todayStr = toLocalDateStr(now);
    if (day.getTime() < new Date(todayStr + 'T00:00:00').getTime()) {
      out.ok = false; out.invalid.fecha = true; out.errors.push('La fecha seleccionada ya pasó.');
    }
    if (!withinBusinessHours(safeFecha, horaIni, horaFin)) {
      out.ok = false;
      if (Number(horaIni.split(':')[0]) < OPEN_HOUR) out.invalid.horaIni = true;
      const [eh, em] = horaFin.split(':').map(Number);
      if (eh > CLOSE_HOUR || (eh === CLOSE_HOUR && em > 0)) out.invalid.horaFin = true;
      out.errors.push('El horario permitido es de 07:00 a 22:00 (fin máximo a las 22:00).');
    }
    if (todayStr === safeFecha && isPastRange(safeFecha, horaIni)) {
      out.ok = false; out.invalid.horaIni = true; out.errors.push('La hora de inicio ya pasó.');
    }
    if (desde && hasta) {
      const ini = new Date(desde), fin = new Date(hasta);
      const diff = fin - ini;
      if (!(fin > ini)) { out.ok = false; out.invalid.horaIni = out.invalid.horaFin = true; out.errors.push('La hora fin debe ser mayor que la hora inicio.'); }
      if (diff > 3 * 60 * 60 * 1000) { out.ok = false; out.invalid.horaFin = true; out.errors.push('La duración máxima es de 3 horas.'); }
    }
    return out;
  }, [safeFecha, horaIni, horaFin, desde, hasta]);

  const validaNegocioParaReservar = () => {
    if (!scheduleValidation.ok) return { ok:false, msg: scheduleValidation.errors[0] || 'Horario inválido.' };
    if (!isTel8(telefono)) return { ok:false, msg:'Ingresa un teléfono válido de 8 dígitos.' };
    if (!ANTICIPOS.includes(Number(anticipo))) return { ok:false, msg:'Selecciona un anticipo válido.' };
    return { ok:true, msg:'' };
  };

  async function cargarDisponibles() {
    setLoading(true);
    setServerErr('');
    setMesaSel(null);
    try {
      const { data } = await http.get('/reservas/disponibles', { params: { desde, hasta, personas: Number(personas) } });
      setMesas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setServerErr(e?.response?.data?.error || 'No se pudo consultar disponibilidad');
      setMesas([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (scheduleValidation.ok && desde && hasta) cargarDisponibles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!scheduleValidation.ok) {
        setValMsg(scheduleValidation.errors[0] || '');
        setMesas([]); setLoading(false);
        return;
      }
      setValMsg('');
      if (desde && hasta) cargarDisponibles();
    }, 500);
    return () => clearTimeout(id);
  }, [scheduleValidation, desde, hasta, personas]); // eslint-disable-line

  const puedeReservar = !!mesaSel && nombre.trim().length >= 2 && validaNegocioParaReservar().ok;
  const abrirConfirm = () => { if (!puedeReservar || loading) return; setConfirmOpen(true); };

  const doReservar = async () => {
    const v = validaNegocioParaReservar();
    if (!v.ok) { setToast({ show:true, type:'error', text:v.msg }); return; }
    setLoading(true); setServerErr('');
    try {
      const payload = {
        mesaId: Number(mesaSel), desde, hasta,
        nombre: nombre.trim(), telefono: telefono.trim(),
        email: correoUser, nota: (nota || '').trim() || undefined,
        anticipo: Number(anticipo) // enviar anticipo elegido
      };
      await http.post('/reservas', payload);
      setConfirmOpen(false);
      setToast({ show:true, type:'success', text:'¡Reserva confirmada! Revisa tu correo con la constancia.' });
    } catch (e) {
      console.error(e);
      const message = e?.response?.data?.error || 'No se pudo crear la reserva';
      setServerErr(message);
      setToast({ show:true, type:'error', text: message });
      if (e?.response?.status === 409) cargarDisponibles();
    } finally {
      setLoading(false);
    }
  };

  const minDate = toLocalDateStr(new Date()); // hoy mínimo
  const timeMin = '07:00';
  const timeMax = '22:00';

  useEffect(() => {
    if (!safeFecha) return;
    setHoraIni((h) => clampToBusinessWindow(safeFecha, h, 'start'));
    setHoraFin((h) => clampToBusinessWindow(safeFecha, h, 'end'));
  }, [safeFecha]);

  const mesaTexto =
    mesas.find(m => Number(m.id) === Number(mesaSel))?.numero != null
      ? `Mesa ${mesas.find(m => Number(m.id) === Number(mesaSel)).numero}`
      : (mesaSel ? `Mesa ${mesaSel}` : '—');

  const resumen = {
    fechaLarga: niceDate(safeFecha || ''),
    horaIni, horaFin, mesaTexto,
    personas, nombre: nombre.trim() || '—',
    telefono: telefono || '—', nota: (nota || '').trim(),
  };

  const errFecha = scheduleValidation.invalid.fecha;
  const errIni   = scheduleValidation.invalid.horaIni;
  const errFin   = scheduleValidation.invalid.horaFin;

  return (
    <div style={wrap}>
      <h1 style={title}>Reservación de mesa</h1>

      {!!serverErr && <div style={{ ...alert, background:'#fef2f2', borderColor:'#fecaca', color:'#991b1b' }}>{serverErr}</div>}

      <form onSubmit={(e)=>e.preventDefault()} style={card}>
        {/* FILTROS: grid responsive sin scroll */}
        <div style={filtersGrid}>
          <div>
            <label style={label}>Fecha</label>
            <input
              type="date"
              value={isISODate(fecha) ? fecha : ''}
              min={minDate}
              onChange={(e)=> setFecha(e.target.value)}
              style={{ ...input, ...(errFecha ? inputErr : null) }}
            />
          </div>
          <div>
            <label style={label}>Hora inicio</label>
            <input
              type="time"
              value={horaIni}
              min={timeMin}
              max={timeMax}
              onChange={(e)=> setHoraIni(e.target.value)}
              style={{ ...input, ...(errIni ? inputErr : null) }}
            />
          </div>
          <div>
            <label style={label}>Hora fin (máx. 3h)</label>
            <input
              type="time"
              value={horaFin}
              min={timeMin}
              max={timeMax}
              onChange={(e)=> setHoraFin(e.target.value)}
              style={{ ...input, ...(errFin ? inputErr : null) }}
            />
          </div>
          <div>
            <label style={label}>Personas</label>
            <input
              type="number"
              min={1}
              value={personas}
              onChange={(e)=> setPersonas(e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label}>Anticipo</label>
            <select
              value={anticipo}
              onChange={(e)=> setAnticipo(Number(e.target.value))}
              style={input}
            >
              {ANTICIPOS.map(v => (
                <option key={v} value={v}>{qtz(v)}</option>
              ))}
            </select>
          </div>
        </div>

        {valMsg && (
          <div style={{ marginTop:8, color:'#b45309', background:'#fff7ed', border:'1px solid #fed7aa', padding:'8px 10px', borderRadius:8 }}>
            {valMsg}
          </div>
        )}

        <p style={{ marginTop:8, color:'#92400e', background:'#fff7ed', border:'1px solid #fed7aa', padding:'8px 10px', borderRadius:8 }}>
          Si cancelas <b>antes de 24 horas</b> de la reservación, se te devolverá el dinero. De lo contrario, <b>no hay devolución</b>.
        </p>
      </form>

      <div style={card}>
        <h2 style={h2}>Mesas disponibles</h2>
        {!scheduleValidation.ok ? (
          <div style={muted}>Ajusta fecha y horario para ver disponibilidad.</div>
        ) : loading ? (
          <div style={muted}>Cargando…</div>
        ) : mesas.length === 0 ? (
          <div style={muted}>No hay mesas para ese rango.</div>
        ) : (
          <div style={mesasGrid}>
            {mesas.map((m) => {
              const disabled = !m.disponible || Number(m.capacidad || 0) < Number(personas || 0);
              const selected = Number(mesaSel) === Number(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMesaSel(m.id)}
                  style={{
                    ...mesaBtn,
                    background: selected ? '#0ea5a4' : (disabled ? '#f1f5f9' : '#e0f2fe'),
                    color: selected ? '#fff' : (disabled ? '#64748b' : '#075985'),
                    borderColor: selected ? '#0ea5a4' : (disabled ? '#e5e7eb' : '#93c5fd'),
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? .7 : 1,
                  }}
                  title={m.conflictoTexto || (disabled ? 'No disponible' : `Capacidad: ${m.capacidad}`)}
                >
                  Mesa {m.numero}
                  <div style={{ fontSize:12, marginTop:4 }}>Cap: {m.capacidad}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={h2}>Datos de contacto</h2>
        <div style={grid2}>
          <div>
            <label style={label}>Nombre</label>
            <input value={nombre} onChange={(e)=> setNombre(e.target.value)} style={input} placeholder="Tu nombre"/>
          </div>
          <div>
            <label style={label}>Teléfono (8 dígitos)</label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="^\\d{8}$"
              maxLength={8}
              minLength={8}
              value={telefono}
              onChange={(e)=> setTelefono(onlyDigits(e.target.value).slice(0,8))}
              style={input}
              placeholder="Ej. 55551234"
              title="Debe contener exactamente 8 dígitos"
              required
            />
          </div>
        </div>
        <div style={{ marginTop:10 }}>
          <label style={label}>Nota (opcional)</label>
          <textarea value={nota} onChange={(e)=> setNota(e.target.value)} style={textarea} placeholder="Cumpleaños, Boda, Graduación etc."/>
        </div>
        <div style={{ color:'#334155' }}>
          En restaurante, el consumo debe ser <b>mayor o igual a {qtz(anticipo)}</b>; en caja se descontará tu anticipo.
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', marginTop:12 }}>
          <button
            type="button"
            onClick={abrirConfirm}
            disabled={!puedeReservar || loading}
            style={{ ...btnPrimary, opacity: puedeReservar && !loading ? 1 : .7, cursor: puedeReservar && !loading ? 'pointer' : 'not-allowed' }}
          >
            Pagar anticipo y reservar {qtz(anticipo)}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doReservar}
        resumen={resumen}
        loading={loading}
        anticipo={anticipo}
      />

      <ToastBanner show={toast.show} type={toast.type} text={toast.text} onClose={hideToast} autoHideMs={6000}/>
    </div>
  );
}

/* ============================== estilos ============================== */
const wrap  = { maxWidth: 1200, margin: '20px auto', padding: '0 16px' }; // 💥 más ancho
const title = { margin: '8px 0 12px', fontSize: 26, fontWeight: 900, color:'#0f172a' };
const h2    = { margin: 0, marginBottom: 12, fontSize: 18, color: '#1f2937' };
const card  = { background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:16 };

/* -------- FILTROS: grid responsive (sin scroll horizontal) -------- */
const filtersGrid = {
  display: 'grid',
  gap: 12,
  alignItems: 'end',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const grid2   = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 };

const label   = { display:'block', fontSize:12, color:'#475569', marginBottom:6 };
const input   = { width:'100%', height:44, padding:'0 12px', border:'1px solid #cbd5e1', borderRadius:12, outline:'none', background:'#fff', boxSizing:'border-box' };
const inputErr= { borderColor:'#ef4444', boxShadow:'0 0 0 2px rgba(239,68,68,.18)' };
const textarea= { ...input, minHeight: 90, height:'auto', padding:'10px 12px' };

const btn = {
  height: 44,
  padding: '0 16px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const btnPrimary = { ...btn, background:'#0f766e', borderColor:'#0f766e', color:'#fff' };

const mesasGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 };
const mesaBtn   = { padding:'10px 12px', border:'1px solid', borderRadius:10, fontWeight:800 };
const alert     = { padding:10, border:'1px solid', borderRadius:8, marginBottom:12 };
const muted     = { color:'#6b7280' };

/* ===== Modal styles ===== */
const modalBack = {
  position:'fixed', inset:0, background:'rgba(15, 23, 42, .55)',
  display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000
};
const modalCard = {
  width:'min(560px, 92vw)', background:'#fff', borderRadius:14,
  boxShadow:'0 20px 60px rgba(0,0,0,.35)', padding:16
};
const modalBody = { padding:'8px 0 12px', display:'grid', gap:8 };
const modalFoot = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginTop:8 };
const row  = { display:'flex', justifyContent:'space-between', gap:16, fontSize:15, color:'#0f172a' };
const cap  = { color:'#64748b', fontWeight:700 };
const xbtn = { border:'none', width:36, height:36, borderRadius:10, background:'#f1f5f9', color:'#0f172a', fontSize:22, fontWeight:800, lineHeight:'36px', cursor:'pointer' };
const btnGhost = { background:'#e5e7eb', color:'#111827', border:'none', padding:'10px 14px', borderRadius:10, fontWeight:700, cursor:'pointer' };
