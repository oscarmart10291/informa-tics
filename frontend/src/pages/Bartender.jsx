// frontend/src/pages/Bartender.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { http, openSSE } from '../config/client';
import PageTopBar from '../components/PageTopBar';
import ToastMessage from '../components/ToastMessage';
import ToasterBarra from '../components/ToasterBarra';
import SoundUnlockButton from '../components/SoundUnlockButton';

const BARRA = '/barra';
const REFRESH_MS = 7000;

/* ========= helpers ========= */

// Duración legible (historial)
const fmtDuration = (sec) => {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
};

// Texto de mesa
const mesaLabelFrom = (obj) =>
  obj?.mesaText ?? (Number(obj?.mesa) > 0 ? `Mesa ${obj.mesa}` : 'Pedido en línea');

// pill style
const pill = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 9999,
  background: '#e2e8f0',
  color: '#334155',
  fontSize: 12,
  fontWeight: 700,
  padding: '2px 8px'
};

function EntregaPill({ tipo }) {
  const t = (tipo || '').toString().toUpperCase();
  if (!t) return null;
  const label = t === 'DOMICILIO' ? 'A domicilio' : 'En local';
  return <span style={pill}>{label}</span>;
}

/* ===== Timer Chip ===== */
function useTickingElapsed(startIso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startIso]);
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  return Math.max(0, now - start);
}
function fmtHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
const TimerChip = ({ startAt }) => {
  const elapsed = useTickingElapsed(startAt);
  if (!startAt) return null;
  return (
    <div style={timerChip}>
      ⏱ {fmtHMS(elapsed)}
    </div>
  );
};
/* ====================== */

// ✅ mostrar el chip visual del reloj
const SHOW_TIMER = true;

export default function Bartender() {
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  const bartenderId = usuario?.id;

  const [view, setView] = useState('activos'); // 'activos' | 'historial'
  const [actual, setActual] = useState(null);
  const [cola, setCola] = useState([]);
  const [historialGrp, setHistorialGrp] = useState([]);
  const [cargando, setCargando] = useState(true);

  const loadedOnceRef = useRef(false);
  const timerRef = useRef(null);
  const hbRef = useRef(null);
  const sseRef = useRef(null);
  const lastNetToastRef = useRef(0);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2800);
  };

  // Modal rechazo (existente)
  const [confirm, setConfirm] = useState({ open: false, id: null, nombre: '' });
  const abrirConfirmRechazo = (item) => setConfirm({ open: true, id: item.id, nombre: item.nombre });
  const cerrarConfirm = () => setConfirm({ open: false, id: null, nombre: '' });

  // ⬇️ Nuevo: modal confirmación para "✅ Listo"
  const [confirmListo, setConfirmListo] = useState({ open: false, id: null, nombre: '', codigo: '' });
  const abrirConfirmListo = (item) =>
    setConfirmListo({
      open: true,
      id: item?.id,
      nombre: item?.nombre || '',
      codigo: item?.orden?.codigo || (item?.ordenId ? `#${item.ordenId}` : ''),
    });
  const cerrarConfirmListo = () => setConfirmListo({ open: false, id: null, nombre: '', codigo: '' });
  const confirmarListo = async () => {
    if (!confirmListo.id) return;
    cerrarConfirmListo();
    await listo(confirmListo.id);
  };

  const puedeAceptar = useMemo(() => !actual && cola.length > 0, [actual, cola]);

  async function heartbeat() {
    if (!bartenderId) return;
    try { await http.post(`${BARRA}/heartbeat`, { bartenderId }); } catch {}
  }

  function groupHistorialByOrder(items) {
    const map = new Map();
    (items || []).forEach((it) => {
      const ord = it.orden || {};
      const key = ord.id ?? ord.codigo ?? `o-${it.ordenId}`;
      const g = map.get(key) || {
        orderId: ord.id,
        codigo: ord.codigo,
        mesa: ord.mesa,
        mesaText: ord.mesaText,
        finishedAt: ord.finishedAt || null,
        durationSec: ord.durationSec ?? null,
        items: [],
      };
      g.items.push({ id: it.id, nombre: it.nombre, finalizadoEn: it.finalizadoEn || it.creadoEn });
      const cand = it.finalizadoEn || it.creadoEn;
      if (!g.finishedAt || (cand && new Date(cand) > new Date(g.finishedAt))) g.finishedAt = cand;
      if (ord.durationSec != null) g.durationSec = ord.durationSec;
      map.set(key, g);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  }

  async function cargarActivos() {
    if (!bartenderId) return;
    try {
      if (!loadedOnceRef.current) setCargando(true);
      const { data } = await http.get(`${BARRA}/mis`, {
        params: { bartenderId },
        headers: { 'x-bartender-id': String(bartenderId) },
      });
      setActual(data.actual || null);
      setCola(Array.isArray(data.cola) ? data.cola : []);
      // ❌ sin auto-iniciar: el bartender debe presionar “Iniciar”
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      const respMsg = (e?.response?.data?.error || '').toString();
      const isNet = msg.includes('network') || msg.includes('err_connection_refused');
      if (!isNet) {
        showToast(respMsg || 'No se pudo cargar la cola de barra', 'danger');
      } else {
        const now = Date.now();
        if (now - lastNetToastRef.current > 30000) {
          lastNetToastRef.current = now;
        }
      }
      console.error('[BARRA/mis] error', e?.response?.data || e?.message);
    } finally {
      loadedOnceRef.current = true;
      setCargando(false);
    }
  }

  async function cargarHistorial() {
    if (!bartenderId) return;
    try {
      if (!loadedOnceRef.current) setCargando(true);
      const { data } = await http.get(`${BARRA}/historial`, { params: { bartenderId } });
      const items = Array.isArray(data) ? data : [];
      setHistorialGrp(groupHistorialByOrder(items));
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      const isNet = msg.includes('network') || msg.includes('err_connection_refused');
      if (!isNet) showToast('No se pudo cargar el historial', 'danger');
      console.error('[BARRA/historial] error', e?.response?.data || e?.message);
    } finally {
      loadedOnceRef.current = true;
      setCargando(false);
    }
  }

  // Auto-refresh + heartbeat
  useEffect(() => {
    if (!bartenderId) return;

    heartbeat();
    clearInterval(timerRef.current);
    clearInterval(hbRef.current);

    if (view === 'activos') {
      cargarActivos();
      timerRef.current = setInterval(cargarActivos, REFRESH_MS);
    } else {
      cargarHistorial();
      timerRef.current = setInterval(cargarHistorial, REFRESH_MS);
    }

    hbRef.current = setInterval(heartbeat, 30000);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (view === 'activos') cargarActivos();
        else cargarHistorial();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(hbRef.current);
      document.removeEventListener('visibilitychange', onVis);
      http.post(`${BARRA}/desactivar`, { bartenderId }).catch(() => {});
    };
  }, [bartenderId, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE (opcional)
  useEffect(() => {
    if (!bartenderId) return;
    try {
      const es = openSSE(`${BARRA}/stream`);
      sseRef.current = es;

      es.onmessage = () => {
        if (document.visibilityState !== 'visible') return;
        if (view === 'activos') cargarActivos();
        else cargarHistorial();
      };
      es.onerror = () => {
        try { es.close(); } catch {}
      };

      return () => es.close();
    } catch {
      // si no hay SSE seguimos con polling
    }
  }, [bartenderId, view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aceptar(itemId) {
    try {
      await http.post(`${BARRA}/items/${itemId}/aceptar`, { bartenderId });
      await cargarActivos();
      showToast('Bebida aceptada 🍹', 'success');
    } catch (e) {
      console.error(e);
      showToast(e?.response?.data?.error || 'No se pudo aceptar esta bebida', 'danger');
    }
  }

  async function confirmarRechazo() {
    if (!confirm.id) return;
    try {
      await http.post(`${BARRA}/items/${confirm.id}/rechazar`, { bartenderId });
      await cargarActivos();
      showToast('Bebida rechazada y reasignada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e?.response?.data?.error || 'No se pudo rechazar', 'danger');
    } finally {
      cerrarConfirm();
    }
  }

  // ▶ Iniciar preparación
  async function iniciar(itemId) {
    try {
      await http.post(`${BARRA}/items/${itemId}/preparar`, { bartenderId });
      await cargarActivos();
      showToast('Preparación iniciada ▶', 'success');
    } catch {
      showToast('No se pudo iniciar preparación', 'danger');
    }
  }

  // ✅ Listo (acción real)
  async function listo(itemId) {
    try {
      await http.patch(`${BARRA}/items/${itemId}/listo`);
      // evaluar DOMICILIO
      let orderId = actual?.orden?.id;
      if (!orderId) {
        const it = cola.find(x => x.id === itemId);
        orderId = it?.orden?.id || it?.ordenId;
      }
      if (orderId) {
        await http.post(`/reparto/orden/${orderId}/evaluar`).catch(() => {});
      }

      await cargarActivos(); // reset del chip al cambiar el “actual”
      showToast('Bebida lista ✅', 'success');
    } catch {
      showToast('No se pudo marcar como lista', 'danger');
    }
  }

  const Tabs = () => (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
      <button onClick={() => setView('activos')} style={view === 'activos' ? tabActive : tab}>
        Activos / Cola
      </button>
      <button onClick={() => setView('historial')} style={view === 'historial' ? tabActive : tab}>
        Historial preparados
      </button>
    </div>
  );

  const Card = ({ item, acciones }) => (
    <div style={{ ...card, position: 'relative' }}>
      {/* Chip de tiempo si está en preparación */}
      {SHOW_TIMER && item?.preparandoEn && <TimerChip startAt={item.preparandoEn} />}

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 20 }}>{item?.nombre}</strong>
      </div>
      <div style={{ color: '#334155', fontSize: 16, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Orden <b>{item?.orden?.codigo}</b> • {mesaLabelFrom(item?.orden)}
        </span>
        <EntregaPill tipo={item?.tipoEntrega} />
      </div>
      {item?.nota && <div style={notaBox}>Nota: {item.nota}</div>}
      {acciones}
    </div>
  );

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', background: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PageTopBar title="Barra" backTo="/panel" />
      {!bartenderId && <div style={{ padding: 16, color: '#b91c1c' }}>No se encontró tu sesión de bartender. Vuelve a iniciar sesión.</div>}

      <Tabs />

      {view === 'activos' ? (
        <div style={{ padding: '0 1rem 1rem', display: 'grid', gap: 16 }}>
          {/* En preparación (sticky) */}
          <div style={{ position: 'sticky', top: 96, zIndex: 3, background: '#fff' }}>
            <section style={section}>
              <h2 style={h2}>En preparación</h2>
              {actual ? (
                <Card
                  item={actual}
                  acciones={
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {/* Si aún no inició: Iniciar + Rechazar. Si ya inició: solo Listo */}
                      {!actual.preparandoEn ? (
                        <>
                          <button
                            style={btnPrimary}
                            onClick={() => iniciar(actual.id)}
                            title="Iniciar preparación"
                          >
                            ▶ Iniciar
                          </button>
                          <button style={btnDanger} onClick={() => abrirConfirmRechazo(actual)}>↩ Rechazar</button>
                        </>
                      ) : (
                        // ⬇️ ahora pide confirmación
                        <button style={btnListo} onClick={() => abrirConfirmListo(actual)}>✅ Listo</button>
                      )}
                    </div>
                  }
                />
              ) : (
                <div style={emptyBox}>No estás preparando nada ahora.</div>
              )}
            </section>
          </div>

          {/* Cola personal */}
          <section style={section}>
            <h2 style={h2}>Siguientes bebidas</h2>
            {cargando && !loadedOnceRef.current ? (
              <div style={emptyBox}>Cargando…</div>
            ) : cola.length === 0 ? (
              <div style={emptyBox}>Sin pendientes asignados.</div>
            ) : (
              <div style={grid}>
                {cola.map((it) => (
                  <Card
                    key={it.id}
                    item={it}
                    acciones={
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {/* En cola: solo Rechazar, NO iniciar aquí */}
                        <button style={btnDanger} onClick={() => abrirConfirmRechazo(it)}>
                          Rechazar
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div style={{ padding: '0 1rem 1rem' }}>
          <section style={section}>
            <h2 style={h2}>Historial de bebidas</h2>
            {cargando && !loadedOnceRef.current ? (
              <div style={emptyBox}>Cargando…</div>
            ) : historialGrp.length === 0 ? (
              <div style={emptyBox}>Aún no tienes bebidas preparadas.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {historialGrp.map((grp) => (
                  <div key={grp.orderId ?? grp.codigo} style={row}>
                    <div>
                      <b>{grp.items.map((i) => i.nombre).join(', ')}</b>
                      {' '}• Orden <b>{grp.codigo}</b> • {mesaLabelFrom(grp)}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Finalizado: {grp.finishedAt ? new Date(grp.finishedAt).toLocaleString() : '—'}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Duración total: {fmtDuration(grp.durationSec)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ToastMessage
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
      <ToasterBarra />
      <SoundUnlockButton />

      {/* Modal Rechazar */}
      {confirm.open && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Rechazar bebida</h3>
            <p style={{ marginBottom: 16 }}>
              ¿Rechazar <b>{confirm.nombre}</b> y reasignarla a otro bartender?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={cerrarConfirm} style={btnGhost}>Cancelar</button>
              <button onClick={confirmarRechazo} style={btnDanger}>Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Listo */}
      {confirmListo.open && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Marcar como LISTO</h3>
            <p style={{ marginBottom: 16 }}>
              ¿Confirmas marcar <b>{confirmListo.nombre}</b> de la orden <b>{confirmListo.codigo}</b> como <b>LISTO</b>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={cerrarConfirmListo} style={btnGhost}>Cancelar</button>
              <button onClick={confirmarListo} style={btnPrimary}>Sí, marcar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== estilos ===== */
const section  = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' };
const h2       = { margin: '0 0 12px', color: '#0f172a', fontSize: 22 };
const emptyBox = { background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '16px 14px', color: '#64748b', fontSize: 16 };
const grid     = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 };

const card      = { background: '#fdfdfd', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, boxShadow: '0 6px 16px rgba(0,0,0,0.05)' };
const btnPrimary= { background: '#0f766e', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: 'pointer' };
const btnDanger = { background: '#dc2626', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: 'pointer' };
const btnListo  = { background: '#16a34a', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: 'pointer' };
const tab       = { background: '#e5e7eb', color: '#0f172a', border: 'none', padding: '8px 14px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' };
const tabActive = { ...tab, background: '#0ea5e9', color: '#fff' };
const row       = { padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' };
const notaBox   = { background: '#fff7ed', border: '1px dashed #f59e0b', color: '#92400e', padding: '8px 10px', borderRadius: 8, fontSize: 16, marginBottom: 10 };

const timerChip  = {
  position: 'absolute',
  top: 10,
  right: 10,
  background: '#0ea5e9',
  color: '#fff',
  padding: '4px 10px',
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 13,
  boxShadow: '0 2px 8px rgba(14,165,233,.35)'
};

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999,
};
const modalBox = {
  background: '#fff',
  width: 520,
  maxWidth: '92vw',
  padding: 20,
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(0,0,0,.2)',
  fontFamily: 'Segoe UI, sans-serif',
};
const btnGhost = {
  padding: '.55rem 1rem',
  background: '#e2e8f0',
  color: '#111827',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
};
