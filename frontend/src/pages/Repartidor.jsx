import React, { useEffect, useMemo, useState } from 'react';
import { http } from '../config/client';
import PageTopBarRepartidor from '../components/PageTopBarRepartidor';
import ToastMessage from '../components/ToastMessage';

/* ===== Paleta unificada ===== */
const THEME = {
  primary: '#0f766e', // tabs activas, "Volver al Panel", En camino
  info: '#0ea5e9',
  success: '#16a34a', // VERDE (Tomar, Tomar varios, Tomar seleccionados, Entregado)
  danger: '#dc2626',  // rojo (Cancelar / Domicilio)
  dark: '#0f172a',
};

const REPARTO = '/reparto';
const REFRESH_MS = 6000;

/* ================= Helpers de datos ================= */

const hasText = (v) => {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  const low = s.toLowerCase();
  return low !== 'null' && low !== 'undefined' && low !== 'nan';
};
const cleanText = (v) => (hasText(v) ? v.trim() : '');

function findNoteDeep(value) {
  const KEY_RX = /(nota|observa|comenta|instruc|special|pedido|detalle|note)s?/i;
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findNoteDeep(v);
      if (hasText(found)) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const [k, v] of Object.entries(value)) {
    if (KEY_RX.test(k)) {
      if (typeof v === 'string') {
        const s = cleanText(v);
        if (s) return s;
      } else {
        const inner = findNoteDeep(v);
        if (hasText(inner)) return inner;
      }
    } else if (v && typeof v === 'object') {
      const inner = findNoteDeep(v);
      if (hasText(inner)) return inner;
    }
  }
  return '';
}

function getItemNote(i = {}) {
  const aliases = [
    i.nota, i.observacion, i.observaciones,
    i.notaItem, i.detalle, i.detalles,
    i.note, i.notas, i.comentario, i.comentarios,
    i.instrucciones, i.instruccion, i.notaEspecial, i.notaDetalle
  ];
  for (const a of aliases) {
    const s = cleanText(String(a ?? ''));
    if (s) return s;
  }
  const deepCandidates = [ i.extra, i.extras, i.opciones, i.options, i.custom, i.customs, i.customizations, i.meta, i.modificadores, i.modificadoresDetalle ];
  for (const dc of deepCandidates) {
    const s = findNoteDeep(dc);
    if (hasText(s)) return s;
  }
  return '';
}
function getOrderNote(p = {}) {
  const aliases = [ p.nota, p.observacion, p.observaciones, p.notas, p.comentario, p.comentarios, p.instrucciones, p.notaOrden ];
  for (const a of aliases) {
    const s = cleanText(String(a ?? ''));
    if (s) return s;
  }
  const deepCandidates = [ p.meta, p.customizations, p.detalles, p.detalle, p.extras ];
  for (const dc of deepCandidates) {
    const s = findNoteDeep(dc);
    if (hasText(s)) return s;
  }
  return '';
}
function resolveItems(p = {}) {
  const candidates = p.items ?? p.pedidoItems ?? p.ordenItems ?? p.detalles ?? p.detalle ?? p.productos ?? [];
  return Array.isArray(candidates) ? candidates : [];
}
const getItemQty  = (i = {}) => i?.qty ?? i?.cantidad ?? i?.quantity ?? 1;
const getItemName = (i = {}) => i?.nombre ?? i?.name ?? i?.platilloNombre ?? i?.productoNombre ?? 'Producto';

export default function Repartidor() {
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  const repartidorId = usuario?.id;

  const H = useMemo(
    () => ({ headers: { 'x-repartidor-id': String(repartidorId || ''), 'x-role': 'Repartidor' } }),
    [repartidorId]
  );

  const [tab, setTab] = useState('pool');
  const [pool, setPool] = useState([]);
  const [mine, setMine] = useState([]);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(false);

  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState(new Set());
  const hasSelection = sel.size > 0;

  const [confirm, setConfirm] = useState({ show: false, title: '', body: '', action: null });
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [obsModal, setObsModal] = useState({ show: false, id: null, text: '' });
  const [busyDeliver, setBusyDeliver] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600);
  };

  /* ================= Loaders ================= */
  async function loadPool() { const { data } = await http.get(`${REPARTO}/listos`, H); setPool(Array.isArray(data) ? data : []); }
  async function loadMine() { const { data } = await http.get(`${REPARTO}/mios`, { ...H, params: { soloActivos: 1 } }); setMine(Array.isArray(data) ? data : []); }
  async function loadHist() { const { data } = await http.get(`${REPARTO}/historial`, H); setHist(Array.isArray(data) ? data : []); }
  async function loadAll(showSpinner = true) {
    try { if (showSpinner) setLoading(true); await Promise.all([loadPool(), loadMine(), loadHist()]); }
    catch (e) { console.error(e); showToast('No se pudo cargar reparto', 'danger'); }
    finally { if (showSpinner) setLoading(false); }
  }

  useEffect(() => {
    if (!repartidorId) return;
    loadAll(true);
    const id = setInterval(() => loadAll(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [repartidorId]); // eslint-disable-line

  /* ================= Selección múltiple ==================== */
  function toggleMulti(){ if (multi) setSel(new Set()); setMulti(!multi); }
  function toggleSel(id){ const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); setSel(next); }
  function clearSel(){ setSel(new Set()); }

  /* ================= Acciones ==================== */
  async function claimSelected() {
    const ids = Array.from(sel);
    if (!ids.length) return;
    setConfirm({
      show: true,
      title: 'Confirmar selección',
      body: `¿Tomar ${ids.length} pedido(s) seleccionados?`,
      action: async () => {
        try {
          for (const id of ids) { await http.patch(`${REPARTO}/${id}/tomar`, { repartidorId }, H); }
          clearSel(); setMulti(false); await loadAll(false); setTab('mias'); showToast('Pedidos tomados ✔');
        } catch (e) {
          showToast(e?.response?.data?.error || 'No se pudo reclamar', 'danger');
          await loadAll(false);
        }
      },
    });
  }
  function confirmClaimOne(id){
    setConfirm({ show:true, title:'Confirmar', body:`¿Estás seguro de tomar el Pedido ${id}?`, action: () => claimOne(id) });
  }
  async function claimOne(id){
    try { await http.patch(`${REPARTO}/${id}/tomar`, { repartidorId }, H); await loadAll(false); setTab('mias'); showToast('Pedido tomado ✔'); }
    catch (e){ showToast(e?.response?.data?.error || 'No se pudo reclamar', 'danger'); await loadAll(false); }
  }
  async function enCamino(id){
    try { await http.patch(`${REPARTO}/${id}/iniciar`, { repartidorId }, H); await loadAll(false); showToast('Pedido en camino 🚚'); }
    catch (e){ showToast(e?.response?.data?.error || 'No se pudo pasar a EN_CAMINO', 'danger'); }
  }
  function openObs(id){ setObsModal({ show:true, id, text:'' }); }
  function closeObs(){ setObsModal({ show:false, id:null, text:'' }); }
  async function submitObs(){
    try {
      setBusyDeliver(true);
      const texto = (obsModal.text || '').trim();
      const payload = { repartidorId, ...(texto ? { observacion: texto } : {}) };
      await http.patch(`${REPARTO}/${obsModal.id}/entregar`, payload, H);
      await loadAll(false); setTab('hist'); showToast('Pedido entregado ✅'); closeObs();
    } catch (e) {
      showToast(e?.response?.data?.error || 'No se pudo marcar ENTREGADO', 'danger');
    } finally { setBusyDeliver(false); }
  }

  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(e); };

  const Badge = ({ text, tone = 'secondary' }) => (
    <span className={`badge bg-${tone} fw-semibold`} style={{ fontSize: 12, padding: '6px 10px' }}>{text}</span>
  );

  const Card = ({ p, actions, selectable }) => {
    const selected = sel.has(p.id);
    const esDomicilio = !!p.direccion;
    const tipo = esDomicilio ? 'Domicilio' : (p.orden?.mesa ? `Mesa ${p.orden.mesa}` : 'Múltiple');

    const items = resolveItems(p);
    const orderNote = getOrderNote(p);
    const lastObs = (p?.ultimaObservacion?.texto || '').trim();
    const hasNotes = !!orderNote || !!lastObs || items.some((i) => getItemNote(i).length > 0);

    return (
      <div
        className={`card h-100 shadow-sm card-clickable ${selectable ? 'selectable' : ''}`}
        onClick={() => selectable && toggleSel(p.id)}
        style={{
          borderRadius: 16,
          borderColor: selected ? THEME.primary : '#e2e8f0',
          boxShadow: selected
            ? '0 0 0 .25rem rgba(15,118,110,.25), 0 .5rem 1rem rgba(15, 23, 42, .08)'
            : '0 .5rem 1rem rgba(15, 23, 42, .06)',
          background: 'linear-gradient(180deg,#ffffff 0%, #fbfdff 100%)',
          cursor: selectable ? 'pointer' : 'default',
        }}
      >
        <div className="card-body d-flex flex-column">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="fw-bolder" style={{ fontSize: 18 }}>
                #{p.codigo} — Pedido {p.id}
              </div>
              <div className="text-secondary small mt-1">
                {p.receptorNombre || 'Cliente'} · {p.telefono || '—'}
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <Badge text={tipo} tone={esDomicilio ? 'danger' : 'primary'} />
              {hasNotes && <span className="pill-notas">📝 Notas</span>}
              {selectable && (
                <input
                  type="checkbox"
                  className="form-check-input ms-1 select-box"
                  checked={sel.has(p.id)}
                  onChange={stop(() => toggleSel(p.id))}
                  title={sel.has(p.id) ? 'Quitar de la selección' : 'Seleccionar'}
                />
              )}
            </div>
          </div>

          <div className="mt-3 small" style={{ color: '#1f2937' }}>
            {esDomicilio && <div className="mb-1">📍 {p.direccion}</div>}

            {orderNote && (
              <div className="order-note mb-2">📝 <b>Nota del pedido:</b> {orderNote}</div>
            )}
            {lastObs && (
              <div className="order-note mb-2">📝 <b>Obs. de entrega:</b> {lastObs}</div>
            )}

            {items.length ? (
              <ul className="list-unstyled m-0">
                {items.map((i, idx) => {
                  const nota = getItemNote(i);
                  return (
                    <li key={idx} className="item-line">
                      <span className="item-name">{`${getItemQty(i)}× ${getItemName(i)}`}</span>
                      {nota && <span className="item-note" title="Nota del ítem">📝 {nota}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-secondary">—</div>
            )}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-muted small">
              {p.creadoEn ? `Creado: ${new Date(p.creadoEn).toLocaleString()}` : ''}
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {actions}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', background: '#fff', minHeight: '100vh' }}>
      <PageTopBarRepartidor title="Reparto" backTo="/panel" />

      {/* ===== CSS de tema unificado (con mejoras mobile) ===== */}
      <style>{`
        .btn-primary{ background:${THEME.primary}; border-color:${THEME.primary}; }
        .btn-primary:hover{ filter:brightness(.95); }
        .btn-info{ background:${THEME.info}; border-color:${THEME.info}; }
        .btn-info:hover{ filter:brightness(.96); }
        .btn-success{ background:${THEME.success}; border-color:${THEME.success}; }
        .btn-success:hover{ filter:brightness(.95); }
        .btn-danger{ background:${THEME.danger}; border-color:${THEME.danger}; }
        .btn-danger:hover{ filter:brightness(.95); }
        .btn-dark{ background:${THEME.dark}; border-color:${THEME.dark}; }
        .btn-dark:hover{ filter:brightness(1.05); }

        .action-btn { padding: .6rem 1rem; line-height: 1; }

        .select-box {
          width: 28px; height: 28px; border-radius: 6px;
          border: 2px solid ${THEME.primary};
          accent-color: ${THEME.primary};
          box-shadow: 0 0 0 3px rgba(15,118,110,.12);
          cursor: pointer;
        }
        .card-clickable.selectable:hover { box-shadow: 0 0 0 .25rem rgba(15,118,110,.18), 0 .5rem 1rem rgba(15,23,42,.08); }

        .pill-notas{ background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:4px 8px; border-radius:9999px; font-weight:600; font-size:12px; }
        .order-note{ background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:6px 8px; color:#7c2d12; }
        .item-line{ display:flex; align-items:flex-start; gap:6px; margin-bottom:4px; }
        .item-note{ background:#f3f4f6; border:1px solid #e5e7eb; border-radius:6px; padding:2px 6px; color:#374151; font-style:italic; line-height:1.2; }

        /* Contenedor principal con gutters adecuados en móvil */
        .rp-container{ padding: 12px max(12px, env(safe-area-inset-left)) 18px max(12px, env(safe-area-inset-right)); }

        /* Tabs en una sola línea que hacen wrap si no caben */
        .rp-tabs{ display:flex; gap:8px; padding: 10px 12px; flex-wrap: wrap; }
        .rp-tabs .btn{ border-radius: 999px; padding: 8px 12px; font-weight:700; }

        @media (max-width: 576px) {
          .action-btn { width: 100%; }
        }
      `}</style>

      {!repartidorId && (
        <div className="px-3 text-danger py-2">No se encontró tu sesión de repartidor.</div>
      )}

      {/* Tabs */}
      <div className="rp-tabs">
        <button onClick={() => setTab('pool')} className={`btn ${tab === 'pool' ? 'btn-primary text-white' : 'btn-light'}`}>Disponibles</button>
        <button onClick={() => setTab('mias')} className={`btn ${tab === 'mias' ? 'btn-primary text-white' : 'btn-light'}`}>Mis entregas</button>
        <button onClick={() => setTab('hist')} className={`btn ${tab === 'hist' ? 'btn-primary text-white' : 'btn-light'}`}>Historial</button>
      </div>

      <div className="rp-container">
        <section className="container-fluid p-3 border rounded-4 shadow-sm" style={{ borderColor: '#e5e7eb' }}>
          {tab === 'pool' && (
            <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <h2 className="m-0" style={{ color: '#0f172a', fontSize: 22, flex: '1 1 auto' }}>
                Pedidos listos para entrega
              </h2>

              <div className="d-flex align-items-center" style={{ gap: 12 }}>
                {!multi ? (
                  <button onClick={toggleMulti} className="btn btn-success text-white fw-bold action-btn">
                    Tomar varios
                  </button>
                ) : (
                  <>
                    <button onClick={toggleMulti} className="btn btn-danger text-white fw-bold action-btn">
                      Cancelar
                    </button>
                    <button
                      onClick={claimSelected}
                      disabled={!hasSelection}
                      className="btn btn-success text-white fw-bold action-btn"
                      style={{ opacity: hasSelection ? 1 : 0.65, cursor: hasSelection ? 'pointer' : 'not-allowed' }}
                      title={hasSelection ? 'Tomar seleccionados' : 'Selecciona al menos uno'}
                    >
                      Tomar seleccionados{hasSelection ? ` (${sel.size})` : ''}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {tab === 'mias' && <h2 className="m-0" style={{ color: '#0f172a', fontSize: 22 }}>Mis entregas</h2>}
          {tab === 'hist' && <h2 className="m-0" style={{ color: '#0f172a', fontSize: 22 }}>Historial</h2>}

          {loading ? (
            <div className="border rounded-3 p-3 text-center text-secondary mt-3" style={{ borderStyle: 'dashed' }}>Cargando…</div>
          ) : tab === 'pool' ? (
            pool.length === 0 ? (
              <div className="border rounded-3 p-3 text-center text-secondary mt-3" style={{ borderStyle: 'dashed' }}>Sin pendientes</div>
            ) : (
              <div className="row g-3 mt-2">
                {pool.map((p) => (
                  <div key={p.id} className="col-12 col-md-6 col-xl-4">
                    <Card
                      p={p}
                      selectable={multi}
                      actions={
                        <>
                          <button
                            onClick={stop(() => confirmClaimOne(p.id))}
                            className={`btn btn-success text-white fw-bold ${multi ? 'disabled' : ''}`}
                            disabled={multi}
                            title={multi ? 'Desactiva “Tomar varios” para tomar uno' : 'Tomar este pedido'}
                          >
                            Tomar
                          </button>
                        </>
                      }
                    />
                  </div>
                ))}
              </div>
            )
          ) : tab === 'mias' ? (
            mine.length === 0 ? (
              <div className="border rounded-3 p-3 text-center text-secondary mt-3" style={{ borderStyle: 'dashed' }}>No tienes pedidos activos</div>
            ) : (
              <div className="row g-3 mt-2">
                {mine.map((p) => (
                  <div key={p.id} className="col-12 col-md-6 col-xl-4">
                    <Card
                      p={p}
                      actions={
                        <>
                          {p.deliveryStatus === 'ASIGNADO_A_REPARTIDOR' && (
                            <button onClick={stop(() => enCamino(p.id))} className="btn btn-primary fw-bold text-white">En camino</button>
                          )}
                          {p.deliveryStatus === 'EN_CAMINO' && (
                            <button onClick={stop(() => openObs(p.id))} className="btn btn-success fw-bold text-white">Entregado</button>
                          )}
                        </>
                      }
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            hist.length === 0 ? (
              <div className="border rounded-3 p-3 text-center text-secondary mt-3" style={{ borderStyle: 'dashed' }}>Sin entregas todavía</div>
            ) : (
              <div className="row g-3 mt-2">
                {hist.map((p) => (
                  <div key={p.id} className="col-12 col-md-6 col-xl-4">
                    <Card p={p} actions={<span className="fw-bold" style={{ color: THEME.success }}>ENTREGADO</span>} />
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>

      {/* Modal confirmación */}
      {confirm.show && (
        <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 shadow">
              <div className="modal-header">
                <h5 className="modal-title">{confirm.title}</h5>
                <button type="button" className="btn-close" onClick={() => setConfirm({ show: false })} />
              </div>
              <div className="modal-body"><p className="m-0">{confirm.body}</p></div>
              <div className="modal-footer d-flex justify-content-end align-items-center gap-2">
                <button className="btn btn-danger fw-bold" onClick={() => setConfirm({ show: false })}>Cancelar</button>
                <button className="btn btn-success fw-bold"
                  onClick={async () => { try { await confirm.action?.(); } finally { setConfirm({ show: false }); } }}>
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Observación (mobile full-screen sm-down) */}
      {obsModal.show && (
        <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog modal-dialog-centered modal-fullscreen-sm-down">
            <div className="modal-content rounded-4 shadow">
              <div className="modal-header">
                <h5 className="modal-title">Observación (opcional)</h5>
                <button type="button" className="btn-close" onClick={closeObs} disabled={busyDeliver} />
              </div>
              <div className="modal-body">
                <label htmlFor="obsText" className="form-label small text-muted">Puedes dejarlo vacío si no hay observación.</label>
                <textarea
                  id="obsText" className="form-control obs-textarea"
                  placeholder='Ej.: "Cliente no estaba, entregué al guardia"'
                  value={obsModal.text}
                  onChange={(e) => setObsModal((o) => ({ ...o, text: e.target.value }))}
                  maxLength={280} autoFocus disabled={busyDeliver}
                />
                <div className="d-flex justify-content-between align-items-center mt-2">
                  <small className="text-muted">Máx. 280 caracteres</small>
                  <small className="text-muted">{(obsModal.text || '').length}/280</small>
                </div>
              </div>
              <div className="modal-footer d-flex flex-wrap gap-2">
                <button className="btn btn-danger fw-bold" onClick={closeObs} disabled={busyDeliver}>Cancelar</button>
                <button className="btn btn-success fw-bold" onClick={submitObs} disabled={busyDeliver}>
                  {busyDeliver ? 'Entregando…' : 'Entregar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastMessage message={toast.message} type={toast.type} show={toast.show}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))} />
    </div>
  );
}
