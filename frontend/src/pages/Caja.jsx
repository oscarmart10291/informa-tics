// src/pages/Caja.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageTopBar from '../components/PageTopBar';
import { API, http, openSSE } from '../config/client';
import TurnoCajaPanel from '../components/caja/TurnoCajaPanel';

// === Toast + Modal (mismo que Platillos) ===
import ToastMessage from '../components/ToastMessage';
import { Modal } from 'bootstrap';

/* ============================== Helpers ============================== */
function qtz(n) {
  const v = Number(n || 0);
  if (Number.isNaN(v)) return 'Q 0.00';
  return `Q ${v.toFixed(2)}`;
}
function round2(n) {
  const v = Number(n || 0);
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
const isTarjeta  = (m) => String(m || '').toUpperCase() === 'TARJETA';
const isEfectivo = (m) => String(m || '').toUpperCase() === 'EFECTIVO';

/** Texto amigable para mesa / online */
const mesaTextoDe = (mesaTexto, mesa) =>
  mesaTexto || (typeof mesa === 'number'
    ? (mesa === 0 ? 'Pedido en línea' : `Mesa ${mesa}`)
    : 'Pedido en línea');

/* ============================== Vista Caja ============================== */
export default function Caja() {
  const [pendientes, setPendientes] = useState([]);
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);

  // Turno de caja (bloqueo UI si no hay turno abierto/autorizado)
  const [turno, setTurno] = useState(null);
  const tieneTurno = !!(turno && String(turno.estado).toUpperCase() === 'ABIERTA');

  // Pago (total/parcial)
  const [pagoParcial, setPagoParcial] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());

  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [recibidoTouched, setRecibidoTouched] = useState(false);
  const [posCorrelativo, setPosCorrelativo] = useState('');

  // Anticipo restante (del backend, por orden)
  const [anticipoRestante, setAnticipoRestante] = useState(0);

  // Propina (solo lectura, viene de admin)
  const [propinaActiva, setPropinaActiva] = useState(false);
  const [propinaPct, setPropinaPct] = useState(10); // fallback si el backend no responde

  // === Toast local (igual que Platillos) ===
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  // === Modal confirmación (igual que Platillos) ===
  const [confirmData, setConfirmData] = useState(null);
  const modalRef = useRef(null);
  const modalInstanceRef = useRef(null);
  useEffect(() => {
    if (!confirmData) return;
    modalInstanceRef.current = new Modal(modalRef.current, { backdrop: true, keyboard: true });

    const node = modalRef.current;
    const onHidden = () => {
      setConfirmData(null);
      modalInstanceRef.current?.dispose();
      modalInstanceRef.current = null;
    };
    node.addEventListener('hidden.bs.modal', onHidden);
    modalInstanceRef.current.show();
    return () => node.removeEventListener('hidden.bs.modal', onHidden);
  }, [confirmData]);
  const closeModal = () => modalInstanceRef.current?.hide();

  async function loadPendientes() {
    setLoading(true);
    try {
      const { data } = await http.get('/caja/pendientes');
      const lista = Array.isArray(data) ? data : (data?.ordenes || []);
      setPendientes(lista);
      if (sel) {
        const still = lista.find(x => x.id === sel.id);
        setSel(still || null);
      }
    } catch (e) {
      console.error(e);
      showToast('No se pudieron obtener las órdenes pendientes.', 'danger');
    } finally {
      setLoading(false);
    }
  }

  async function loadTurno() {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || 'null');
      const { data } = await http.get('/caja/mi-estado', {
        params: { cajeroId: u?.id }
      });
      setTurno(data?.turno || null);
    } catch (e) {
      console.error(e);
      setTurno(null);
      showToast('No se pudo obtener el estado de caja.', 'danger');
    }
  }

  async function loadAnticipoRestante(ordenId) {
    if (!ordenId) { setAnticipoRestante(0); return; }
    try {
      const { data } = await http.get(`/caja/orden/${ordenId}/anticipo-restante`);
      const v = Number(data?.restante || 0);
      setAnticipoRestante(Number.isFinite(v) ? v : 0);
    } catch {
      setAnticipoRestante(0);
    }
  }

  // Cargar propina configurada por admin
  async function loadPropinaConfig() {
    try {
      const { data } = await http.get('/propina/reglas/activas', { params: { scope: 'CAJA' } });
      const r = data?.regla || data || {};
      setPropinaActiva(Boolean(r.activa));
      if (typeof r.porcentaje === 'number') setPropinaPct(r.porcentaje);
    } catch (e) {
      console.warn('Propina: no se pudo cargar, se mantiene desactivada o default.', e);
      // Puedes elegir: desactivar si falla, o dejar un default.
      setPropinaActiva(false);
      // setPropinaPct(10); // si prefieres fallback visible
    }
  }

  useEffect(() => {
    loadPendientes();
    loadTurno();
    loadPropinaConfig();

    const es = openSSE('/caja/stream');
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt && typeof evt.type === 'string') {
          loadPendientes();
          loadTurno();
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Al seleccionar una orden, reset y consulta anticipo restante
    if (sel?.id) {
      setPagoParcial(false);
      setSeleccionados(new Set());
      setMetodoPago('EFECTIVO');
      setMontoRecibido('');
      setRecibidoTouched(false);
      setPosCorrelativo('');
      loadAnticipoRestante(sel.id);
    } else {
      setAnticipoRestante(0);
    }
  }, [sel]);

  // Totales
  const totalOriginalSel = useMemo(() => {
    if (!sel) return 0;
    return (sel.items || []).reduce((acc, it) => acc + Number(it.precio || 0), 0);
  }, [sel]);

  const totalPendienteSel = useMemo(() => {
    if (!sel) return 0;
    return (sel.items || []).filter(it => !it.pagado)
      .reduce((acc, it) => acc + Number(it.precio || 0), 0);
  }, [sel]);

  const recibidoNum = Number.isFinite(Number(montoRecibido)) ? Number(montoRecibido) : 0;

  // Subtotal parcial
  const subtotalParcial = useMemo(() => {
    if (!sel || !pagoParcial) return 0;
    const map = new Map((sel.items || []).map(it => [it.id, it]));
    return [...seleccionados]
      .map(id => map.get(id))
      .filter(Boolean)
      .filter(it => !it.pagado)
      .reduce((a, it) => a + Number(it.precio || 0), 0);
  }, [sel, pagoParcial, seleccionados]);

  // Neto a pagar (lo que realmente cobra el cajero)
  const netoTotal = Math.max(0, totalPendienteSel - anticipoRestante);
  const netoParcial = Math.max(0, subtotalParcial - anticipoRestante);
  const netoAUsar = pagoParcial ? netoParcial : netoTotal;

  // Propina referencial (no se agrega al cargo; solo se muestra)
  const basePropina = netoAUsar;
  const propinaMonto = useMemo(() => {
    if (!propinaActiva) return 0;
    const pct = Number(propinaPct) || 0;
    return round2((pct * basePropina) / 100);
  }, [propinaActiva, propinaPct, basePropina]);
  const totalConPropina = useMemo(() => round2(basePropina + propinaMonto), [basePropina, propinaMonto]);

  const falta  = isEfectivo(metodoPago) ? Math.max(0, netoAUsar - recibidoNum) : 0;
  const cambio = isEfectivo(metodoPago) ? Math.max(0, recibidoNum - netoAUsar) : 0;

  const puedeCobrar = useMemo(() => {
    if (!sel || !tieneTurno) return false;
    if (pagoParcial && seleccionados.size === 0) return false;
    if (isEfectivo(metodoPago)) return falta === 0;
    if (isTarjeta(metodoPago))  return String(posCorrelativo || '').trim().length > 0;
    return false;
  }, [sel, tieneTurno, pagoParcial, seleccionados, metodoPago, falta, posCorrelativo]);

  function toggleItem(id, checked) {
    const s = new Set(seleccionados);
    if (checked) s.add(id); else s.delete(id);
    setSeleccionados(s);
  }

  // Cobro (usa el mismo modal de confirmación que Platillos)
  async function cobrar() {
    if (!sel) return;
    if (!tieneTurno) { showToast('Este cajero no tiene una apertura de caja autorizada.', 'warning'); return; }
    if (!puedeCobrar) { showToast('Completa los datos del cobro antes de continuar.', 'warning'); return; }

    setConfirmData({
      title: 'Confirmar cobro',
      message:
        `Vas a cobrar ${qtz(netoAUsar)} con método ${metodoPago}` +
        (isEfectivo(metodoPago) ? ` (recibido: ${qtz(recibidoNum)}, cambio: ${qtz(cambio)})`
          : isTarjeta(metodoPago) ? ` (POS: ${String(posCorrelativo).trim()})` : '') +
        (propinaActiva
          ? `\n\nPropina configurada por admin: ${Number(propinaPct)||0}% = ${qtz(propinaMonto)} (total ref: ${qtz(totalConPropina)})\n* La propina no se suma automáticamente al ticket.`
          : `\n\nPropina: desactivada.`),
      confirmText: 'Cobrar',
      confirmVariant: 'primary',
      onConfirm: async () => {
        try {
          const u = JSON.parse(localStorage.getItem('usuario') || 'null');
          const cajeroId = u?.id;

          const payloadBase = {
            cajeroId,
            metodoPago,
            montoRecibido: isEfectivo(metodoPago) ? Number(recibidoNum) : undefined,
            posCorrelativo: isTarjeta(metodoPago) ? String(posCorrelativo).trim() : undefined,
          };

          let resp;
          if (pagoParcial) {
            if (seleccionados.size === 0) { showToast('Selecciona al menos un ítem para el pago parcial.', 'warning'); return; }
            resp = await http.post('/caja/pagar-parcial', {
              ordenId: sel.id,
              itemIds: [...seleccionados],
              ...payloadBase,
            });
          } else {
            resp = await http.post('/caja/pagar', { ordenId: sel.id, ...payloadBase });
          }

          const t = resp.data?.ticket || {};
          const lineaCambio =
            isEfectivo(metodoPago) && typeof t.cambio === 'number'
              ? ` • Cambio ${qtz(Number(t.cambio))}`
              : '';
          showToast(`Pago registrado por ${qtz(t.totalAPagar || netoAUsar)}${lineaCambio}.`, 'success');

          if (t && t.id) imprimirTicket(t);

          await loadPendientes();
          await loadAnticipoRestante(sel.id);
          setSeleccionados(new Set());
          setMontoRecibido('');
          setPosCorrelativo('');
          setRecibidoTouched(false);
          setMetodoPago('EFECTIVO');
        } catch (e) {
          console.error(e);
          const txt = e?.response?.data?.error || e?.response?.data?.msg || 'Error al cobrar';
          showToast(txt, 'danger');
        } finally {
          closeModal(); // ✅ asegura que el modal se cierre
        }
      }
    });
  }

  function imprimirTicket(ticket) {
    const w = window.open('', '_blank');
    if (!w) {
      window.open(`${API}/caja/tickets/${ticket.id}/impresion`, '_blank');
      return;
    }

    const fecha = new Date(ticket.fechaPago || Date.now());
    const orden = ticket.orden || {};
    const mesaStrFromTicket = typeof orden.mesa === 'number' ? `Mesa ${orden.mesa}` : 'Sin mesa';

    const mesaStr = mesaTextoDe(sel?.mesaTexto, sel?.mesa) || mesaStrFromTicket;

    const totalOriginal = Array.isArray(orden.items)
      ? orden.items.reduce((a, it) => a + Number(it.precio || 0), 0)
      : Number(ticket.totalAPagar || 0);

    const anticipoTicket = Number(ticket.anticipo || ticket.anticipoAplicado || 0);
    const totalAPagar = Number(ticket.totalAPagar || Math.max(0, totalOriginal - anticipoTicket));

    const rows = (orden.items || []).map(it => ({
      nombre: it.nombre,
      precio: Number(it.precio || 0),
    }));

    const itemsHtml = rows.map((r) => `
      <tr>
        <td>${r.nombre}</td>
        <td style="text-align:right">Q ${r.precio.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `<!doctype html>
  <html><head><meta charset="utf-8" />
  <title>Ticket #${ticket.id}</title>
  <style>
    body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;margin:0;padding:10px}
    .ticket{width:260px;margin:0 auto}
    h1{font-size:14px;text-align:center;margin:8px 0}
    table{width:100%;font-size:12px;border-collapse:collapse}
    .tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}
    .muted{color:#666;font-size:11px}
    @media print { @page { size: auto; margin: 6mm; } }
  </style></head>
  <body onload="window.focus();window.print();">
    <div class="ticket">
      <h1>Ticket de Venta</h1>
      <div class="muted">${fecha.toLocaleString('es-GT')}</div>
      <div>Orden #${orden.id || ''} • ${orden.codigo || ''} – ${mesaStr}</div>
      <hr />
      <table>${itemsHtml}</table>
      <div class="tot">
        <div>Total ítems del ticket: <strong>${qtz(totalOriginal)}</strong></div>
        ${anticipoTicket > 0 ? `<div>Anticipo aplicado: -${qtz(anticipoTicket)}</div>` : ''}
        <div>Total cobrado: <strong>${qtz(totalAPagar)}</strong></div>
        <div>Método: ${ticket.metodoPago}</div>
        ${ticket.metodoPago === 'TARJETA' ? `<div>POS: ${ticket.posCorrelativo || ''}</div>` : ''}
        ${ticket.metodoPago === 'EFECTIVO' ? `<div>Recibido: ${qtz(ticket.montoRecibido || 0)} – Cambio: ${qtz(ticket.cambio || 0)}</div>` : ''}
      </div>
      <p class="muted">No válido como factura</p>
    </div>
  </body></html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Línea de cambio
  let cambioLine = null;
  if (isEfectivo(metodoPago)) {
    if (!recibidoTouched || montoRecibido === '') {
      cambioLine = <span style={{ color:'#065f46' }}>Cambio: Q 0.00</span>;
    } else if (falta > 0) {
      cambioLine = <span style={{ color:'#b91c1c' }}>Cambio: Falta {qtz(falta)}</span>;
    } else {
      cambioLine = <span style={{ color:'#065f46' }}>Cambio: {qtz(cambio)}</span>;
    }
  }

  return (
    <div style={pageWrap}>
      <PageTopBar title="Registrar venta" backTo="/panel" />

      {/* Panel estado/acciones del turno */}
      <div style={mainWrap}>
        <TurnoCajaPanel
          turno={turno}
          onRefresh={() => { loadTurno(); loadPendientes(); loadPropinaConfig(); }}
          onToast={showToast}
          openConfirm={(cfg) => {
            setConfirmData({
              ...cfg,
              onConfirm: async () => {
                try { await cfg.onConfirm?.(); }
                finally { modalInstanceRef.current?.hide(); }
              }
            });
          }}
        />
      </div>

      <main style={mainWrap}>
        <div style={mainCard}>
          {/* Banner si no hay turno */}
          {!tieneTurno && (
            <div style={warnBox}>
              Este cajero <b>no</b> tiene una apertura de caja autorizada. Solicítala para poder cobrar.
            </div>
          )}

          <div style={grid2}>
            {/* Columna izquierda: pendientes */}
            <section>
              <h2 style={sectionTitle}>Órdenes pendientes</h2>
              <div style={cardBox}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <button
                    onClick={() => { loadPendientes(); loadTurno(); loadPropinaConfig(); showToast('Datos actualizados.', 'info'); }}
                    style={btnGhost}
                  >
                    Refrescar
                  </button>
                </div>

                {loading ? (
                  <p style={muted}>Cargando…</p>
                ) : (pendientes || []).length === 0 ? (
                  <p style={muted}>No hay órdenes listas.</p>
                ) : (
                  <ul style={{ listStyle:'none', margin:0, padding:0 }}>
                    {pendientes.map((o) => {
                      const totalPreview = (o.items || []).reduce((a, it) => a + Number(it.precio || 0), 0);
                      const active = sel?.id === o.id;
                      return (
                        <li
                          key={o.id}
                          onClick={() => {
                            setSel(o);
                            setRecibidoTouched(false);
                            setMontoRecibido('');
                            setPosCorrelativo('');
                            setMetodoPago('EFECTIVO');
                          }}
                          style={{ ...pendingItem, ...(active ? pendingItemActive : null) }}
                        >
                          <div style={{ fontWeight:700 }}>
                            Orden {o.codigo} · {mesaTextoDe(o.mesaTexto, o.mesa)}
                          </div>
                          <div style={mutedSmall}>
                            {o.mesero?.nombre ? `Mesero: ${o.mesero.nombre} · ` : ''}
                            Total (previo): {qtz(totalPreview)}
                            {Number(o.anticipo || 0) > 0 && <> · Anticipo: -{qtz(o.anticipo)}</>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Columna derecha: detalle/cobro */}
            <section>
              <h2 style={sectionTitle}>Detalle</h2>
              <div style={cardBox}>
                {!sel ? (
                  <p style={muted}>Selecciona una orden.</p>
                ) : (
                  <>
                    <div style={rowBetween}>
                      <div>
                        <b>Orden:</b> {sel.codigo} · <b>{mesaTextoDe(sel.mesaTexto, sel.mesa)}</b>
                      </div>
                      <div style={{ fontWeight:700 }}>Pendiente: {qtz(totalPendienteSel)}</div>
                    </div>

                    {Number(sel.anticipo || 0) > 0 && (
                      <div style={{ marginTop:6, color:'#065f46' }}>
                        Anticipo de orden: {qtz(sel.anticipo)} · <b>Restante por aplicar:</b> {qtz(anticipoRestante)}
                      </div>
                    )}

                    <div style={{ marginTop:12, maxHeight:280, overflowY:'auto' }}>
                      <table style={table}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign:'left' }}>Ítem</th>
                            <th style={{ ...th, textAlign:'center', width: 90 }}>Pagado</th>
                            <th style={{ ...th, textAlign:'right' }}>Precio</th>
                            <th style={{ ...th, textAlign:'center', width: 90 }}>
                              {pagoParcial ? 'Seleccionar' : ''}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sel.items || []).map((it) => {
                            const disabled = !!it.pagado;
                            const checked = seleccionados.has(it.id);
                            return (
                              <tr key={it.id} style={{ opacity: disabled ? 0.55 : 1 }}>
                                <td style={td}>{it.nombre}</td>
                                <td style={{ ...td, textAlign:'center' }}>{it.pagado ? 'Sí' : 'No'}</td>
                                <td style={{ ...td, textAlign:'right' }}>{qtz(it.precio)}</td>
                                <td style={{ ...td, textAlign:'center' }}>
                                  {pagoParcial && !it.pagado ? (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => toggleItem(it.id, e.target.checked)}
                                    />
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, userSelect:'none' }}>
                        <input
                          type="checkbox"
                          checked={pagoParcial}
                          onChange={(e) => { setPagoParcial(e.target.checked); setSeleccionados(new Set()); }}
                        />
                        Pago parcial
                      </label>
                    </div>

                    <div style={grid2gap}>
                      <div>
                        <label style={label}>Método de pago</label>
                        <select
                          value={metodoPago}
                          onChange={(e)=> setMetodoPago(e.target.value)}
                          style={input}
                        >
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TARJETA">Tarjeta</option>
                        </select>
                      </div>

                      {isEfectivo(metodoPago) && (
                        <div>
                          <label style={label}>Monto recibido (efectivo)</label>
                          <div style={{ position:'relative' }}>
                            <span style={{ position:'absolute', left:10, top:9, color:'#6b7280', fontWeight:700 }}>Q</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={montoRecibido}
                              onFocus={() => setRecibidoTouched(true)}
                              onChange={(e)=>{ setMontoRecibido(e.target.value); setRecibidoTouched(true); }}
                              style={{ ...input, paddingLeft:28 }}
                              placeholder="0.00"
                            />
                          </div>
                          <div style={{ fontSize:12, marginTop:6 }}>{cambioLine}</div>
                        </div>
                      )}

                      {isTarjeta(metodoPago) && (
                        <div className="md:col-span-2">
                          <label style={label}>Correlativo POS</label>
                          <input
                            value={posCorrelativo}
                            onChange={(e)=> setPosCorrelativo(e.target.value)}
                            style={input}
                            placeholder="Ej. 00012345"
                          />
                        </div>
                      )}

                      {/* Propina (solo lectura, configurada por admin) */}
                      <div className="md:col-span-2">
                        <div style={{ padding:'10px 12px', border:'1px dashed #cbd5e1', borderRadius:10, background:'#fafcff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ color:'#334155', fontWeight:600 }}>
                            Propina {propinaActiva ? `(${Number(propinaPct)||0}%)` : '(desactivada)'}
                          </span>
                          <b>{qtz(propinaMonto)}</b>
                        </div>
                        <div style={{ fontSize:12, color:'#6b7280', marginTop:6 }}>
                          {propinaActiva
                            ? 'La propina es informativa para el cliente y debe estar soportada por backend si se desea cobrar automáticamente.'
                            : 'La propina está desactivada por el administrador.'}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop:8, display:'flex', gap:16, justifyContent:'flex-end', color:'#334155', fontWeight:700, flexWrap:'wrap' }}>
                      <div>Total original: {qtz(totalOriginalSel)}</div>
                      <div>Pendiente sin anticipo: {qtz(totalPendienteSel)}</div>
                      {Number(sel.anticipo || 0) > 0 && <div>Anticipo restante: -{qtz(anticipoRestante)}</div>}
                      {pagoParcial ? (
                        <>
                          <div>Subtotal parcial: {qtz(subtotalParcial)}</div>
                          <div>Base a cobrar: {qtz(netoParcial)}</div>
                        </>
                      ) : (
                        <div>Base a cobrar: {qtz(netoTotal)}</div>
                      )}

                      {/* Líneas de propina y total con propina (referencia) */}
                      <div>Propina: {qtz(propinaMonto)}</div>
                      <div>Total + propina (referencia): {qtz(totalConPropina)}</div>
                    </div>

                    <div style={{ fontSize:12, color:'#6b7280', textAlign:'right', marginTop:4 }}>
                      * La propina mostrada es referencial y <b>no</b> se agrega al ticket automáticamente (requiere soporte en backend).
                    </div>

                    <div style={{ marginTop:12, textAlign:'right' }}>
                      <button
                        onClick={cobrar}
                        style={{ ...btnPrimary, opacity: puedeCobrar ? 1 : .7, cursor: puedeCobrar ? 'pointer' : 'not-allowed' }}
                        disabled={!puedeCobrar}
                        title={!tieneTurno ? 'Requiere apertura de caja autorizada' : undefined}
                      >
                        Cobrar e imprimir
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Toast centrado arriba (igual que Platillos) */}
      <ToastMessage
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />

      {/* Modal de confirmación (igual que Platillos) */}
      {confirmData && (
        <div className="modal fade" tabIndex="-1" ref={modalRef}>
          <div className="modal-dialog mt-5">
            <div className={`modal-content border-${confirmData.confirmVariant === 'primary' ? 'primary' : 'danger'}`}>
              <div className={`modal-header text-white ${confirmData.confirmVariant === 'primary' ? 'bg-primary' : 'bg-danger'}`}>
                <h5 className="modal-title">{confirmData.title}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeModal}></button>
              </div>
              <div className="modal-body"><p style={{ whiteSpace:'pre-wrap' }}>{confirmData.message}</p></div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                <button
                  type="button"
                  className={`btn btn-${confirmData.confirmVariant || 'danger'}`}
                  onClick={confirmData.onConfirm}
                >
                  {confirmData.confirmText || 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== Styles ============================== */
const pageWrap = { minHeight:'100vh', background:'#f6f7fb', fontFamily:'Segoe UI, sans-serif' };
const mainWrap = { maxWidth:1100, margin:'20px auto', padding:'0 16px' };
const mainCard = { background:'#fff', borderRadius:12, boxShadow:'0 4px 12px rgba(0,0,0,0.05)', padding:20 };

const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 };
const grid2gap = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 };

const sectionTitle = { margin:0, marginBottom:12, color:'#1f2937', fontSize:18 };
const cardBox = { background:'#fff', border:'1px solid #eef2f7', borderRadius:10, padding:12 };

const pendingItem = { padding:10, borderRadius:8, border:'1px solid #eef2f7', background:'#fff', cursor:'pointer', marginBottom:10, transition:'all .15s' };
const pendingItemActive = { background:'#f0f7ff', borderColor:'#bfdbfe' };

const table = { width:'100%', borderCollapse:'collapse', fontSize:14 };
const th = { borderBottom:'1px solid #e5e7eb', padding:'8px 6px', color:'#6b7280' };
const td = { borderBottom:'1px solid #f3f4f6', padding:'8px 6px', color:'#111827' };

const rowBetween = { display:'flex', alignItems:'center', justifyContent:'space-between' };

const label = { display:'block', fontSize:12, color:'#6b7280', marginBottom:6 };
const input = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #d1d5db', outline:'none' };

const btnPrimary = { background:'#0f766e', color:'#fff', border:'none', padding:'10px 14px', borderRadius:10, fontWeight:700, boxShadow:'0 2px 8px rgba(0,0,0,0.08)' };
const btnGhost = { background:'transparent', color:'#1e3d59', border:'1px solid #cbd5e1', padding:'6px 10px', borderRadius:8, fontWeight:600 };

const warnBox = { marginBottom:12, padding:10, borderRadius:8, background:'#fff8e1', border:'1px solid #ffe0a3', color:'#7a5b00', fontSize:14 };
const muted = { color:'#6b7280' };
const mutedSmall = { color:'#6b7280', fontSize:12 };
