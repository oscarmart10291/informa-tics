// src/pages/Historial.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from '../api';
import { getUser } from "../utils/session";
import { loadPedidoToCart } from "../utils/cart";
import { useNavigate } from "react-router-dom";

const REFRESH_MS = 5000;

/* ============================== Helpers ============================== */
function estadoUI(p) {
  if ((p.tipoEntrega || '').toUpperCase() === 'DOMICILIO') {
    switch ((p.deliveryStatus || '').toUpperCase()) {
      case 'LISTO_PARA_ENTREGA':      return 'EN ESPERA DE REPARTIDOR';
      case 'ASIGNADO_A_REPARTIDOR':   return 'ASIGNADO A REPARTIDOR';
      case 'EN_CAMINO':               return 'EN CAMINO';
      case 'ENTREGADO':               return 'ENTREGADO';
      default: break;
    }
  }
  const estadoBase = (p.estadoDerivado || p.estado || '').toUpperCase();
  if (estadoBase === 'LISTO_PARA_RECOGER' && p.ticketId) return 'ENTREGADO';
  switch (estadoBase) {
    case 'PENDIENTE':            return 'PENDIENTE';
    case 'EN_PREPARACION':       return 'EN PREPARACIÓN';
    case 'LISTO_PARA_RECOGER':   return 'LISTO PARA RECOGER';
    case 'EN_ESPERA_DE_REPARTIDOR': return 'EN ESPERA DE REPARTIDOR';
    case 'CANCELADA':            return 'CANCELADA';
    default: return p.estadoDerivado || p.estado || '';
  }
}
function qtz(n){ const v=Number(n||0); return Number.isNaN(v)?'Q 0.00':`Q ${v.toFixed(2)}`; }
const hasText = (v) => typeof v === 'string' && v.trim() && !['null','undefined','nan'].includes(v.trim().toLowerCase());
function getLastEntregaObs(p = {}) {
  const direct = p?.ultimaObservacion?.texto;
  if (hasText(direct)) return direct.trim();
  const pools = [
    Array.isArray(p?.observaciones) ? p.observaciones : null,
    Array.isArray(p?.observacionesEntrega) ? p.observacionesEntrega : null,
    Array.isArray(p?.obsEntrega) ? p.obsEntrega : null,
  ].filter(Boolean);
  for (const arr of pools) {
    if (!arr.length) continue;
    const o = arr[0] || {};
    const texto = o.texto || o.nota || o.observacion || '';
    if (hasText(texto)) return String(texto).trim();
  }
  return '';
}
function domicilioBloque(p){
  const te=(p.tipoEntrega||'').toUpperCase();
  if(te!=='DOMICILIO') return '';
  const nombre = p.clienteNombre || p.nombreCliente || p.nombre || '';
  const tel    = p.telefonoEntrega || p.telefono || p.celular || '';
  const dir    = p.direccionEntrega || p.direccion || '';
  const lineas=[];
  if(nombre) lineas.push(`<div><b>Cliente:</b> ${nombre}</div>`);
  if(tel)    lineas.push(`<div><b>Tel:</b> ${tel}</div>`);
  ifdir: {
    if(dir) lineas.push(`<div><b>Dirección:</b> ${dir}</div>`);
  }
  if(!lineas.length) return '';
  return `<div style="margin:6px 0" class="muted">${lineas.join('')}</div>`;
}
function buildTicketHTMLFromPedido(p){
  const fecha = new Date(p.pagadoEn || p.actualizadoEn || p.creadoEn || Date.now());
  const orden = {
    id: p.id, codigo: p.codigo, mesa: typeof p.mesa==='number'?p.mesa:null,
    items: (p.items||[]).map(it=>({
      nombre: it.qty && Number(it.qty)>1 ? `${it.nombre} (x${it.qty})` : it.nombre,
      precio: Number(it.precio||0),
      nota: it.nota
    }))
  };
  const mesaStr = 'Pedido en línea';
  const itemsHtml = (orden.items||[]).map(r=>`
    <tr>
      <td>${r.nombre}${r.nota?` <em style="color:#64748b">(nota: ${r.nota})</em>`:''}</td>
      <td style="text-align:right">${qtz(r.precio)}</td>
    </tr>
  `).join('');

  const totalAPagar = Number(p.total||0);
  const metodo = String(p.ticketMetodoPago || p.metodoPago || '').toUpperCase() || 'EFECTIVO';
  const pagado = !!p.ticketId || p.ticketAprobado === true;
  const posCorrelativo = p.ticketPosCorrelativo || '';
  const rec = typeof p.ticketMontoRecibido==='number'? p.ticketMontoRecibido : (pagado? totalAPagar : 0);
  const cam = typeof p.ticketCambio==='number'? p.ticketCambio : 0;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Ticket #${p.ticketId || orden.id || ''}</title>
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
    ${domicilioBloque(p)}
    <hr />
    <table>${itemsHtml}</table>
    <div class="tot">
      <div>Total: <strong>${qtz(totalAPagar)}</strong></div>
      <div>Método: ${metodo}</div>
      ${metodo==='TARJETA' ? `<div>POS: ${posCorrelativo || ''}</div>` : ''}
      ${metodo==='EFECTIVO' ? `<div>Recibido: ${qtz(rec)} – Cambio: ${qtz(cam)}</div>` : ''}
      ${pagado ? '' : `<div class="muted"><em>PENDIENTE DE PAGO</em></div>`}
    </div>
    <p class="muted">No válido como factura</p>
  </div>
</body></html>`;
}
async function imprimirTicketCliente(p){
  const w = window.open('', '_blank');
  if(!w){ setTimeout(()=>imprimirTicketCliente(p),150); return; }
  let html='';
  try{
    if(p.ticketId){
      const { data } = await api.get(`/cliente/pagos/tickets/${p.ticketId}`, { headers:{Accept:'application/json'} });
      const t = data?.ticket || data;
      if(t && t.id){
        const fecha = new Date(t.fechaPago || Date.now());
        const orden = t.orden || {};
        const mesaStr = 'Pedido en línea';
        const rows = (orden.items||[]).map(it=>({ nombre: it.nombre, precio: Number(it.precio||0), nota: it.nota }));
        const itemsHtml = rows.map(r=>`
          <tr>
            <td>${r.nombre}${r.nota?` <em style="color:#64748b">(nota: ${r.nota})</em>`:''}</td>
            <td style="text-align:right">${qtz(r.precio)}</td>
          </tr>
        `).join('');
        html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Ticket #${t.id}</title>
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
    ${domicilioBloque(p)}
    <hr />
    <table>${itemsHtml}</table>
    <div class="tot">
      <div>Total: <strong>${qtz(Number(t.totalAPagar || 0))}</strong></div>
      <div>Método: ${t.metodoPago}</div>
      ${t.metodoPago==='TARJETA' ? `<div>POS: ${t.posCorrelativo || ''}</div>` : ''}
      ${t.metodoPago==='EFECTIVO' ? `<div>Recibido: ${qtz(Number(t.montoRecibido || 0))} – Cambio: ${qtz(Number(t.cambio || 0))}</div>` : ''}
    </div>
    <p class="muted">No válido como factura</p>
  </div>
</body></html>`;
      }
    }
  }catch(_){}
  if(!html) html = buildTicketHTMLFromPedido(p);
  w.document.open(); w.document.write(html); w.document.close();
}

/* ============================== Calificación UI ============================== */
const OPCIONES = {
  comida: [
    'Sabor excelente',
    'Sabor no muy bueno',
    'Presentación atractiva',
    'Presentación descuidada',
    'Excelente relación calidad/precio',
    'Calidad no acorde al precio',
  ],
  repartidor: [
    'Puntual en la entrega',
    'Trato amable',
    'Comunicación clara',
    'Cuidado del pedido',
    'Trato poco amable',
    'Retraso en la entrega',
    'Pedido mal manejado / derramado',
    'No avisó al llegar',
  ],
  atencion: [
    'Amable',
    'Rápida atención',
    'Orden correcta',
    'Atención lenta',
    'Errores en el pedido entregado',
  ]
};

/* ⭐ Estrellas (SVG) */
function Star({ filled, onClick, onHover, onLeave, size=28 }) {
  const color = filled ? '#f59e0b' : '#e5e7eb';
  const stroke = filled ? '#d97706' : '#9ca3af';
  return (
    <svg
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="button"
      aria-label="star"
      style={{ cursor:'pointer', transition:'transform .08s ease', marginRight:6 }}
    >
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill={color}
        stroke={stroke}
        strokeWidth="1"
      />
    </svg>
  );
}
function Stars({ value=0, onChange }) {
  const [hover, setHover] = useState(0);
  const show = hover || value;
  return (
    <div style={{ display:'inline-flex', alignItems:'center' }}>
      {[1,2,3,4,5].map(n => (
        <Star
          key={n}
          filled={n<=show}
          onClick={()=>onChange(n)}
          onHover={()=>setHover(n)}
          onLeave={()=>setHover(0)}
        />
      ))}
    </div>
  );
}
function CheckList({ options=[], value=[], onChange }) {
  const set = new Set(value||[]);
  const toggle = (opt)=>{
    const next = new Set(set);
    next.has(opt) ? next.delete(opt) : next.add(opt);
    onChange(Array.from(next));
  };
  return (
    <div style={{ display:'grid', gap:8 }}>
      {options.map(opt=>(
        <label key={opt} style={{ display:'flex', gap:10, alignItems:'center', cursor:'pointer' }}>
          <input type="checkbox" checked={set.has(opt)} onChange={()=>toggle(opt)} />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function RatingModal({ open, onClose, pedido, onSaved }) {
  const isDom = (pedido?.tipoEntrega || '').toUpperCase() === 'DOMICILIO';
  const [comida, setComida] = useState(0);
  const [sec, setSec] = useState(0);
  const [coment, setComent] = useState('');
  const [saving, setSaving] = useState(false);

  const [opComida, setOpComida] = useState([]);
  const [opRepartidor, setOpRepartidor] = useState([]);
  const [opAtencion, setOpAtencion] = useState([]);

  useEffect(()=>{
    if (!open) return;
    const c = pedido?.calificacion || {};
    setComida(Number(c.comida || 0));
    setSec(Number((isDom ? c.repartidor : c.atencionCliente) || 0));
    setComent(c.comentario || '');
    setOpComida(Array.isArray(c.comidaOpciones)? c.comidaOpciones : []);
    setOpRepartidor(Array.isArray(c.repartidorOpciones)? c.repartidorOpciones : []);
    setOpAtencion(Array.isArray(c.atencionOpciones)? c.atencionOpciones : []);
  },[open, pedido, isDom]);

  if (!open) return null;
  const canSave = comida>=1 && sec>=1;

  const save = async ()=>{
    try{
      setSaving(true);
      await api.post(`/cliente/pedidos/${pedido.id}/calificar`, {
        comida,
        repartidor: isDom ? sec : undefined,
        atencionCliente: !isDom ? sec : undefined,
        comentario: coment,
        comidaOpciones: opComida,
        repartidorOpciones: isDom ? opRepartidor : undefined,
        atencionOpciones: !isDom ? opAtencion : undefined,
      });
      onSaved?.();
      onClose?.();
    }catch(e){
      const msg = e?.response?.data?.error;
      if (e?.response?.status === 409) {
        onSaved?.();
        onClose?.();
        alert(msg || 'Este pedido ya fue calificado.');
      } else {
        alert(msg || 'No se pudo guardar la calificación');
      }
    }finally{
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.35)',
        display:'grid', placeItems:'center', zIndex:1000, padding:12
      }}
      onClick={(e)=>{ if(e.target===e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background:'#fff', borderRadius:18, width:620, maxWidth:'95vw',
        maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 14px 36px rgba(0,0,0,.28)'
      }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #e5e7eb' }}>
          <h3 style={{ margin:0, fontSize:20, fontWeight:900 }}>Calificar pedido #{pedido?.codigo}</h3>
          <p style={{ margin:'6px 0 0', color:'#475569' }}>
            {isDom ? 'Domicilio: califica la comida y al repartidor.' : 'Para recoger: califica la comida y la atención.'}
          </p>
        </div>

        <div style={{ padding:20, overflow:'auto' }}>
          <div style={{ display:'grid', gap:18 }}>
            <div>
              <div style={{ fontWeight:800, marginBottom:8 }}>Comida</div>
              <Stars value={comida} onChange={setComida} />
              <div style={{ marginTop:10 }}>
                <CheckList options={OPCIONES.comida} value={opComida} onChange={setOpComida} />
              </div>
            </div>

            <div>
              <div style={{ fontWeight:800, marginBottom:8 }}>
                {isDom ? 'Repartidor' : 'Atención al cliente'}
              </div>
              <Stars value={sec} onChange={setSec} />
              <div style={{ marginTop:10 }}>
                {isDom
                  ? <CheckList options={OPCIONES.repartidor} value={opRepartidor} onChange={setOpRepartidor} />
                  : <CheckList options={OPCIONES.atencion} value={opAtencion} onChange={setOpAtencion} />
                }
              </div>
            </div>

            <div>
              <div style={{ fontWeight:800, marginBottom:8 }}>Comentario (opcional)</div>
              <textarea
                rows={3}
                value={coment}
                onChange={e=>setComent(e.target.value)}
                style={{ width:'100%', border:'1px solid #e5e7eb', borderRadius:12, padding:12, resize:'vertical' }}
                placeholder="Escribe tu comentario…"
              />
            </div>
          </div>
        </div>

        <div style={{
          padding:14, borderTop:'1px solid #e5e7eb',
          display:'flex', justifyContent:'flex-end', gap:10
        }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding:'10px 16px', border:'none', borderRadius:12, background:'#e5e7eb', color:'#334155', fontWeight:800 }}>
            Cancelar
          </button>
          <button onClick={save} disabled={!canSave || saving}
            style={{ padding:'10px 16px', border:'none', borderRadius:12, background: canSave ? '#0f766e' : '#94a3b8', color:'#fff', fontWeight:900 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Estilos reutilizables ============================== */
const chip = (bg, fg) => ({
  display:'inline-flex', alignItems:'center', gap:6,
  padding:'2px 10px', borderRadius:999, fontSize:12, fontWeight:700,
  background:bg, color:fg, whiteSpace:'nowrap'
});
const btn = (bg, fg, enabled=true) => ({
  padding:"10px 14px",
  border:"none",
  borderRadius:10,
  background: enabled ? bg : "#cbd5e1",
  color: enabled ? fg : "#fff",
  cursor: enabled ? "pointer" : "not-allowed",
  whiteSpace:"nowrap",
  fontWeight:700
});
const ui = {
  filters: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    boxShadow: '0 6px 18px rgba(0,0,0,.05)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: '#475569' },
  control: {
    width: '100%',
    height: 44,
    padding: '0 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    background: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
  },
};

/* ============================== Componente ============================== */
export default function Historial(){
  const nav = useNavigate();
  const u = getUser();
  const email = u?.correo || u?.email || u?.usuario || "";

  const [pedidos,setPedidos] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError]     = useState("");
  const [syncing,setSyncing] = useState(false);
  const timerRef = useRef(null);

  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingPedido, setRatingPedido] = useState(null);

  /* ===== Filtros ===== */
  const todayStr = new Date().toISOString().slice(0,10);
  const thirtyAgoStr = new Date(Date.now() - 30*864e5).toISOString().slice(0,10);

  const [from, setFrom] = useState(thirtyAgoStr);
  const [to, setTo]     = useState(todayStr);
  const [estado, setEstado] = useState('');
  const [tipoEntrega, setTipoEntrega] = useState('');

  const load = async (showSpinner=true)=>{
    if(!email) return;
    try{
      if(showSpinner) setLoading(true);
      setError("");
      const { data } = await api.get(`/cliente/pedidos`, { params:{ email } });

      const sigOf = (p)=>({
        id: p.id,
        e: p.estadoDerivado || p.estado,
        t: p.total,
        n: (p.items||[]).length,
        tk: p.ticketId || null,
        lo: getLastEntregaObs(p) || null,
        cal: p.calificacion ? `${p.calificacion.comida}-${p.calificacion.repartidor||p.calificacion.atencionCliente||0}` : null
      });

      const oldSig = JSON.stringify(pedidos.map(sigOf));
      const newSig = JSON.stringify((data||[]).map(sigOf));
      if(oldSig!==newSig) setPedidos(data||[]);
    }catch(e){
      console.error(e);
      setError("No se pudo cargar el historial.");
    }finally{
      if(showSpinner) setLoading(false);
    }
  };

  useEffect(()=>{
    if(!email) return;
    const start=()=>{
      clearInterval(timerRef.current);
      setSyncing(true); load(false);
      timerRef.current=setInterval(async()=>{
        setSyncing(true); await load(false); setSyncing(false);
      }, REFRESH_MS);
    };
    const stop = ()=>{ clearInterval(timerRef.current); setSyncing(false); };
    load(true); start();
    const onVis=()=> (document.visibilityState==='visible'?start():stop());
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ stop(); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[email]);

  const isTarjetaPaid = (p)=>{
    const m1 = (p.ticketMetodoPago || '').toUpperCase();
    const m2 = (p.metodoPago || '').toUpperCase();
    return !!p.ticketId || m1==='TARJETA' || m2==='TARJETA';
  };

  const editar = (p)=>{
    const estado=(p.estadoDerivado||p.estado||"").toUpperCase();
    const pagoLocalPend = (p.metodoPago||'').toUpperCase()==='PAGO_EN_LOCAL' && !p.ticketId;
    if(isTarjetaPaid(p)){
      alert("Este pedido fue pagado con tarjeta. No se puede editar. Solicita apoyo en caja para reembolso/corrección.");
      return;
    }
    if(estado!=="PENDIENTE" || !pagoLocalPend){
      alert("Solo puedes editar pedidos pendientes y con pago en el local.");
      return;
    }
    loadPedidoToCart(p); nav("/cliente/pedido");
  };

  const cancelar = async (p)=>{
    const estado=(p.estadoDerivado||p.estado||"").toUpperCase();
    const pagoLocalPend = (p.metodoPago||'').toUpperCase()==='PAGO_EN_LOCAL' && !p.ticketId;
    if(isTarjetaPaid(p)){
      alert("Este pedido fue pagado con tarjeta. No se puede cancelar desde aquí. Solicita reembolso con administración.");
      return;
    }
    if(estado!=="PENDIENTE" || !pagoLocalPend){
      alert("Solo puedes cancelar pedidos pendientes y con pago en el local.");
      return;
    }
    if(!window.confirm("¿Cancelar este pedido?")) return;
    try{ await api.patch(`/cliente/pedidos/${p.id}/cancelar`); await load(false); }
    catch(e){ console.error(e); alert(e?.response?.data?.error || "No se pudo cancelar"); }
  };

  const canPrint = (p)=>{
    const estado=(p.estadoDerivado||p.estado||"").toUpperCase();
    const metodo=(p.ticketMetodoPago||p.metodoPago||'').toUpperCase();
    if(p.ticketId) return true;
    if(metodo.includes('TARJETA')) return true;
    if((p.tipoEntrega||'').toUpperCase()==='DOMICILIO') return true;
    if(['LISTO_PARA_RECOGER','EN_PREPARACION'].includes(estado)) return true;
    return false;
  };

  const imprimir = async (p)=>{ await imprimirTicketCliente(p); };
  const pagoLabel = (p)=>{
    if(p.ticketId) return (p.ticketMetodoPago || 'TARJETA').toUpperCase();
    const base = (p.metodoPago || '').toUpperCase();
    return base === 'PAGO_EN_LOCAL' ? 'EN CAJA (PENDIENTE)' : base;
  };
  const abrirRating = (p)=>{
    if (p.calificacion) {
      alert('Este pedido ya fue calificado.');
      return;
    }
    setRatingPedido(p);
    setRatingOpen(true);
  };

  /* ===== Filtros en memoria ===== */
  const filtered = useMemo(()=>{
    const min = (from ? new Date(from+'T00:00:00') : null);
    const max = (to ? new Date(to+'T23:59:59.999') : null);

    return (pedidos || []).filter(p=>{
      const f = new Date(p.creadoEn || p.actualizadoEn || p.pagadoEn || Date.now());
      if (min && f < min) return false;
      if (max && f > max) return false;

      if (estado) {
        const eText = (p.estadoDerivado || p.estado || '').toUpperCase();
        const m = estado.toUpperCase();
        if (estado === 'ENTREGADO') {
          const label = estadoUI(p);
          if ((label || '').toUpperCase() !== 'ENTREGADO') return false;
        } else if (!eText.includes(m)) {
          return false;
        }
      }

      if (tipoEntrega) {
        const te = (p.tipoEntrega || '').toUpperCase();
        if (te !== tipoEntrega.toUpperCase()) return false;
      }

      return true;
    });
  }, [pedidos, from, to, estado, tipoEntrega]);

  const resumen = useMemo(()=>{
    const count = filtered.length;
    const total = filtered.reduce((acc, p)=> acc + Number(p.total || 0), 0);
    return { count, total };
  }, [filtered]);

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Título + resumen */}
      <div style={{ marginBottom:10 }}>
        <h1 className="hist-title" style={{ margin:0 }}>🧾 Historial de pedidos</h1>
        <div style={{ color:'#475569', marginTop:6 }}>
          {resumen.count} pedidos · Total {qtz(resumen.total)} {syncing ? '· sincronizando…' : ''}
          {error ? <span style={{ marginLeft:8, color:'#b91c1c' }}>• Error al cargar</span> : null}
        </div>
      </div>

      {/* Filtros */}
      <div className="orders-filters" style={ui.filters}>
        <div style={ui.field}>
          <label style={ui.label}>Desde</label>
          <input
            type="date"
            value={from || ''}
            onChange={(e) => setFrom(e.target.value)}
            style={ui.control}
          />
        </div>

        <div style={ui.field}>
          <label style={ui.label}>Hasta</label>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => setTo(e.target.value)}
            style={ui.control}
          />
        </div>

        <div style={ui.field}>
          <label style={ui.label}>Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            style={ui.control}
          >
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_PREPARACION">En preparación</option>
            <option value="LISTO_PARA_RECOGER">Listo para recoger</option>
            <option value="ENTREGADO">Entregado</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        <div style={ui.field}>
          <label style={ui.label}>Entrega</label>
          <select
            value={tipoEntrega}
            onChange={(e) => setTipoEntrega(e.target.value)}
            style={ui.control}
          >
            <option value="">Todas</option>
            <option value="LOCAL">Local</option>
            <option value="DOMICILIO">Domicilio</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding:16, color:'#475569' }}>Cargando…</div>
      ) : (
        <div style={{ display:"grid", gap:14 }}>
          {filtered.map(p=>{
            const estadoText = estadoUI(p);
            const estado=(p.estadoDerivado||p.estado||"PENDIENTE");
            const editable = (estado.toUpperCase()==="PENDIENTE")
              && !isTarjetaPaid(p)
              && (String(p.metodoPago||'').toUpperCase()==='PAGO_EN_LOCAL')
              && !p.ticketId;
            const puedeImprimir = canPrint(p);
            const lastObs = getLastEntregaObs(p);
            const isEntregado = estadoText === 'ENTREGADO';
            const yaCalificado = !!p.calificacion;

            return (
              <div
                key={p.id}
                className="order-card"
                style={{
                  background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:16,
                  boxShadow:'0 6px 18px rgba(0,0,0,.05)'
                }}
              >
                {/* Header */}
                <div
                  className="order-head"
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}
                >
                  <div style={{ minWidth:0, flex:"1 1 auto" }}>
                    <div style={{ display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap' }}>
                      <div style={{ fontWeight:900, fontSize:18 }}>#{p.codigo}</div>
                      <div style={{ color:'#64748b' }}>{new Date(p.creadoEn).toLocaleString()}</div>
                      <span style={chip('#ecfeff','#155e75')}>{estadoText}</span>
                    </div>

                    <div className="meta-row" style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:6, color:'#334155' }}>
                      <span style={chip('#f1f5f9','#0f172a')}>Entrega: {(p.tipoEntrega||"").toUpperCase()}</span>
                      <span style={chip('#e0f2fe','#0c4a6e')}>Pago: {pagoLabel(p)}</span>
                      <span style={chip('#dcfce7','#065f46')}>Total: {qtz(Number(p.total))}</span>
                    </div>

                    {p.calificacion && (
                      <div style={{ color:'#475569', marginTop:8 }}>
                        <div className="meta-row" style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                          <span><b>🍽️ Comida:</b> {p.calificacion.comida}/5</span>
                          {(p.tipoEntrega||'').toUpperCase()==='DOMICILIO'
                            ? <span><b>🚚 Repartidor:</b> {p.calificacion.repartidor||0}/5</span>
                            : <span><b>👤 Atención:</b> {p.calificacion.atencionCliente||0}/5</span>}
                        </div>
                        <div className="chip-row" style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                          {(p.calificacion.comidaOpciones||[]).map(o=>(
                            <span key={'c'+o} style={chip('#e2e8f0','#0f172a')}>{o}</span>
                          ))}
                          {((p.tipoEntrega||'').toUpperCase()==='DOMICILIO'
                           ? (p.calificacion.repartidorOpciones||[])
                           : (p.calificacion.atencionOpciones||[])).map(o=>(
                            <span key={'s'+o} style={chip('#f1f5f9','#111827')}>{o}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="order-actions">
  {isEntregado && (
    <button
      onClick={()=>abrirRating(p)}
      disabled={yaCalificado}
      title={yaCalificado ? "Ya calificado" : "Calificar pedido"}
      style={btn('#0ea5e9','#fff', !yaCalificado)}
    >
      {yaCalificado ? "Calificado" : "Calificar"}
    </button>
  )}
  <button
    onClick={()=>editar(p)}
    disabled={!editable}
    title={editable ? "Editar pedido" : "Solo pedidos pendientes con pago en local pueden editarse"}
    style={btn('#0f766e','#fff', editable)}
  >
    Editar
  </button>
  <button
    onClick={()=>cancelar(p)}
    disabled={!editable}
    title={editable ? "Cancelar pedido" : "Solo pedidos pendientes y con pago en local pueden cancelarse"}
    style={btn('#ef4444','#fff', editable)}
  >
    Cancelar
  </button>
  <button
  onClick={()=>imprimir(p)}
  disabled={!puedeImprimir}
  title={puedeImprimir ? "Imprimir ticket" : "Aún no disponible"}
  style={{ ...btn('#111827','#fff', puedeImprimir) }}
  className="btn-print"
>
  Imprimir ticket
</button>
</div>
                </div>

                {/* Observación */}
                {hasText(lastObs) && (
                  <div
                    style={{
                      background:"#fff7ed", border:"1px solid #fed7aa",
                      color:"#7c2d12", borderRadius:10, padding:"8px 10px",
                      marginTop:12
                    }}
                  >
                    📝 <b>Obs. de entrega:</b> {lastObs}
                  </div>
                )}

                {/* Items */}
                <ul style={{ margin:"12px 0 0", paddingLeft:18, color:'#0f172a' }}>
                  {(p.items || []).map(it=>(
                    <li key={it.id}>
                      {Number(it.qty||1)}× {it.nombre} — {qtz(Number(it.precio))}
                      {it.nota ? <em style={{ color:"#475569" }}> (nota: {it.nota})</em> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {filtered.length===0 && (
            <div style={{
              background:'#fff', border:'1px dashed #cbd5e1', borderRadius:12,
              padding:16, color:'#64748b', textAlign:'center'
            }}>
              No hay pedidos que coincidan con los filtros.
            </div>
          )}
        </div>
      )}

      <RatingModal
        open={ratingOpen}
        pedido={ratingPedido}
        onClose={()=>setRatingOpen(false)}
        onSaved={()=>load(false)}
      />
    </div>
  );
}
