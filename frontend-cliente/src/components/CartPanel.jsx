import React, { useEffect, useState, useCallback } from "react";
import api from '../api';
import {
  getCart, setQty, removeItem, clearCart, updateNote,
  setEntrega, setPago, setDireccion, setTelefono, setReceptorNombre,
  subtotal
} from "../utils/cart";
import { getUser } from "../utils/session";

import { pedidoDesdeCartParaTicket } from "../utils/cart";
import { imprimirTicketCliente } from "../utils/ticketClientePDF"; // 👈 util PDF

export default function CartPanel() {
  const [cart, setCartState] = useState(getCart());
  const [loading, setLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const sync = () => setCartState(getCart());
  useEffect(() => {
    sync();
    const onUpdate = () => sync();
    window.addEventListener("cart:update", onUpdate);
    window.addEventListener("cart:updated", onUpdate);
    return () => {
      window.removeEventListener("cart:update", onUpdate);
      window.removeEventListener("cart:updated", onUpdate);
    };
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const uiConfirm = useCallback(() => {
    return new Promise((resolve) => {
      setConfirmOpen(true);
      const ok = () => { setConfirmOpen(false); resolve(true); };
      const no = () => { setConfirmOpen(false); resolve(false); };
      window.__confirmHandlers = { ok, no };
    });
  }, []);

  const total = subtotal();
  const baseURL = api?.defaults?.baseURL || "";

  const salirDeEdicion = () => {
    if (!cart.pedidoId) return;
    setConfirmOpen(true);
    window.__confirmHandlers = {
      ok: () => {
        setConfirmOpen(false);
        clearCart(); sync();
        window.location.href = "/cliente/historial";
      },
      no: () => setConfirmOpen(false)
    };
  };

  const confirmar = async () => {
    if (!cart.items.length) return showToast("Tu carrito está vacío.");

    if (cart.entrega === "domicilio") {
  const nombreOK = String(cart.receptorNombre || "").trim().length > 0;
  const dirOK    = String(cart.direccion || "").trim().length > 0;
  const telOK    = /^\d{8}$/.test(String(cart.telefono || ""));

  if (!nombreOK) return showToast("Ingresa el nombre de quien recibe.");
  if (!dirOK)    return showToast("Ingresa la dirección para envío a domicilio.");
  if (!telOK)    return showToast("Ingresa un teléfono de 8 dígitos (solo números).");
  if (cart.pago !== "tarjeta") return showToast("Para domicilio el pago debe ser con tarjeta en línea.");
}

    // ⛔ Si estoy EDITANDO y el pedido es/era con tarjeta, no permitir edición
    if (cart.pedidoId && cart.pago === "tarjeta") {
      showToast("Este pedido fue pagado con tarjeta. No se puede editar desde aquí. Solicita apoyo en caja.");
      return;
    }

    if (!cart.pedidoId) {
      const ok = await uiConfirm();
      if (!ok) return;
    }

    const u = getUser();

    try {
      setLoading(true);

      if (cart.pedidoId) {
        const itemsPayload = cart.items.map(i => ({
          id: i.id, nombre: i.nombre, precio: i.precio, qty: i.qty, nota: i.nota || ""
        }));

        await api.patch(`/cliente/pedidos/${cart.pedidoId}`, {
          entrega: cart.entrega,
          pago: cart.pago,
          direccion: cart.entrega === "domicilio" ? cart.direccion : "",
          telefono:  cart.entrega === "domicilio" ? cart.telefono  : "",
          receptorNombre: cart.entrega === "domicilio" ? cart.receptorNombre : "",
          items: itemsPayload
        });

        clearCart(); sync();
        showToast("Cambios guardados.");
        window.location.href = "/cliente/historial";
      } else {
        const itemsHistorial = cart.items.map(i => ({
          id: i.id, nombre: i.nombre, precio: i.precio, qty: i.qty, nota: i.nota || ""
        }));

        const { data: pedido } = await api.post(`/cliente/pedidos`, {
          clienteEmail: u?.correo || u?.email || u?.usuario,
          entrega: cart.entrega,
          pago: cart.pago,
          direccion: cart.entrega === "domicilio" ? cart.direccion : "",
          telefono:  cart.entrega === "domicilio" ? cart.telefono  : "",
          receptorNombre: cart.entrega === "domicilio" ? cart.receptorNombre : "",
          items: itemsHistorial,
          total
        });

        const tiposMap = JSON.parse(localStorage.getItem("platilloTipos") || "{}");
        const mapToOrdenTipo = (raw) => {
          const t = String(raw || "").toUpperCase();
          return t.includes("BEB") ? "BEBIDA" : "PLATILLO";
        };
        const itemsCocina = cart.items.map(i => ({
          nombre: i.nombre,
          precio: Number(i.precio),
          qty: Number(i.qty || 1),
          nota: i.nota || "",
          tipo: mapToOrdenTipo(i.tipo || tiposMap[i.id]),
        }));
        await api.post(`/cliente/pedidos/a-cocina`, {
          pedidoClienteId: pedido.id,
          entrega: cart.entrega,
          pago: cart.pago,
          direccion: cart.entrega === "domicilio" ? cart.direccion : "",
          telefono:  cart.entrega === "domicilio" ? cart.telefono  : "",
          receptorNombre: cart.entrega === "domicilio" ? cart.receptorNombre : "",
          items: itemsCocina
        });

        // === Pago ===
        if (cart.pago === "tarjeta") {
          const { data: cap } = await api.post(`/cliente/pagos/tarjeta/capturar`, { pedidoClienteId: pedido.id });

          const p = pedidoDesdeCartParaTicket({
            ticketId: cap.ticketId,
            ticketAprobado: true,
            id: cap.ordenId,
            codigo: cap.codigo
          });
          imprimirTicketCliente(p);

          clearCart(); sync();
          showToast("Pago exitoso. Ticket abierto para imprimir.");
          return;
        } else {
          if (pedido?.ticketId) {
            const p = pedidoDesdeCartParaTicket({ ticketId: pedido.ticketId });
            imprimirTicketCliente(p);
            clearCart(); sync();
            showToast("Pedido enviado. Ticket abierto.");
            return;
          }
          clearCart(); sync();
          showToast("Pedido enviado. Paga en caja cuando lo recojas.");
          window.location.href = "/cliente/historial";
        }
      }
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || "No se pudo procesar el pedido.";
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  // UI helpers
  const ghost = { background:"#eef2f7", border:"none", padding:"6px 10px", borderRadius:8, cursor:"pointer" };
  const chip = { background:"#eee", border:"none", width:28, height:28, borderRadius:8, cursor:"pointer" };
  const smallDanger = { background:"#ffe6e6", color:"#b30000", border:"none", padding:"6px 8px", borderRadius:8, cursor:"pointer" };
  const toggle = (on, disabled=false) => ({
    background: disabled ? "#e5e7eb" : (on?"#0f766e":"#e2e8f0"),
    color: disabled ? "#94a3b8" : (on?"white":"#0f172a"),
    border:"none", padding:"8px 12px", borderRadius:8, cursor: disabled ? "not-allowed" : "pointer"
  });
  const primary = { width:"100%", background:"#111827", color:"#fff", border:"none", padding:"10px 12px", borderRadius:10, cursor:"pointer" };
  const secondary = { width:"100%", background:"#e2e8f0", color:"#111827", border:"none", padding:"10px 12px", borderRadius:10, cursor:"pointer" };

  const setEntregaYForzarPago = (v) => {
    setEntrega(v);
    if (v === "domicilio") setPago("tarjeta");
    sync();
  };

  return (
    <aside style={{ background:"#fff", border:"1px solid #eee", borderRadius:14, padding:16, height:"fit-content" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h3 style={{ margin:0 }}>🛒 Tu pedido {cart.pedidoId ? "(editando)" : ""}</h3>
        <button onClick={() => { clearCart(); sync(); }} disabled={!cart.items.length && !cart.pedidoId} style={ghost}>Vaciar</button>
      </div>

      {!cart.items.length ? (
        <p style={{ color:"#666" }}>Aún no has agregado platillos.</p>
      ) : (
        <ul style={{ listStyle:"none", padding:0, margin:"12px 0", display:"grid", gap:10 }}>
          {cart.items.map(i => (
            <li key={`${i.id}-${i.nota || "nonote"}`} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:600 }}>{i.nombre}</div>
                <div style={{ color:"#666", fontSize:13 }}>Q{i.precio.toFixed(2)}</div>

                {i.nota ? (
                  <div style={{ marginTop:6, fontSize:13, color:"#334155" }}>
                    <b>Nota:</b> {i.nota}{" "}
                    <button
                      onClick={()=>{ const nueva = prompt("Editar nota:", i.nota) ?? i.nota; updateNote(i.id, i.nota, nueva); sync(); }}
                      style={{ ...ghost, padding:"4px 8px", marginLeft:6 }}
                    >Editar</button>
                  </div>
                ) : (
                  <button
                    onClick={()=>{ const n = prompt("Agregar nota (opcional):", ""); updateNote(i.id, "", n || ""); sync(); }}
                    style={{ ...ghost, padding:"4px 8px", marginTop:6 }}
                  >Añadir nota</button>
                )}

                <div style={{ marginTop:6, display:"flex", gap:8, alignItems:"center" }}>
                  <button onClick={()=>setQty(i.id, i.qty-1, i.nota)} style={chip}>−</button>
                  <span>{i.qty}</span>
                  <button onClick={()=>setQty(i.id, i.qty+1, i.nota)} style={chip}>+</button>
                  <button onClick={()=>removeItem(i.id, i.nota)} style={smallDanger}>Quitar</button>
                </div>
              </div>
              <div style={{ fontWeight:700 }}>Q{(i.precio*i.qty).toFixed(2)}</div>
            </li>
          ))}
        </ul>
      )}

      <hr />

      {/* Preferencias */}
      <div style={{ display:"grid", gap:10 }}>
        <label>Tipo de entrega</label>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setEntregaYForzarPago("local")}     style={toggle(cart.entrega==="local")}>En el local</button>
          <button onClick={()=>setEntregaYForzarPago("domicilio")} style={toggle(cart.entrega==="domicilio")}>A domicilio</button>
        </div>

        {cart.entrega === "domicilio" && (
          <>
            <label>Nombre de quien recibe</label>
            <input
  value={cart.receptorNombre}
  onChange={e=>{ setReceptorNombre(e.target.value); sync(); }}
  placeholder="Ej. Juan Pérez"
  required
  style={{ width:"100%", border:"1px solid #ddd", borderRadius:8, padding:8 }}
/>
            <label>Dirección</label>
            <input
  value={cart.direccion}
  onChange={e=>{ setDireccion(e.target.value); sync(); }}
  placeholder="Calle, número, referencias"
  required
  style={{ width:"100%", border:"1px solid #ddd", borderRadius:8, padding:8 }}
/>
            <label>Teléfono</label>
            <input
  value={cart.telefono}
  onChange={e=>{
    const v = e.target.value.replace(/\D/g, "").slice(0, 8); // solo dígitos, máx 8
    setTelefono(v); sync();
  }}
  inputMode="numeric"       // teclado numérico en móviles
  pattern="\d{8}"           // 8 dígitos exactos (para validadores HTML)
  maxLength={8}
  placeholder="Ej. 55512345"
  required
  style={{ width:"100%", border:"1px solid #ddd", borderRadius:8, padding:8 }}
/>
          </>
        )}

        <label>Método de pago</label>
        <div style={{ display:"flex", gap:10 }}>
          <button
            onClick={()=>{ if (cart.entrega==='domicilio') return; setPago("efectivo"); sync(); }}
            disabled={cart.entrega === "domicilio"}
            title={cart.entrega === "domicilio" ? "Para domicilio no se permite pagar en el local" : ""}
            style={toggle(cart.pago==="efectivo", cart.entrega==="domicilio")}
          >
            Pagar en el local
          </button>

          <button
            onClick={()=>{ setPago("tarjeta");  sync(); }}
            style={toggle(cart.pago==="tarjeta")}
          >
            Tarjeta
          </button>
        </div>
      </div>

      <hr />

      <div style={{ display:"grid", gap:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700 }}>
          <span>Total</span><span>Q{total.toFixed(2)}</span>
        </div>

        {cart.pedidoId && (
          <button onClick={salirDeEdicion} style={secondary}>Cancelar edición</button>
        )}

        <button onClick={confirmar} disabled={(!cart.items.length && !cart.pedidoId) || loading} style={primary}>
          {loading ? "Procesando..." : (cart.pedidoId ? "Guardar cambios" : "Confirmar y enviar pedido")}
        </button>
      </div>

      {confirmOpen && (
        <ConfirmModal
          total={total}
          entrega={cart.entrega}
          pago={cart.pago}
          items={cart.items.length}
          onCancel={() => window.__confirmHandlers?.no?.()}
          onOk={() => window.__confirmHandlers?.ok?.()}
        />
      )}

      {toast && <Toast>{toast}</Toast>}
    </aside>
  );
}

/* =============== UI Components =============== */
function ConfirmModal({ total, entrega, pago, items, onCancel, onOk }) {
  useEffect(() => {
    const onKey = (e)=>{ if(e.key==='Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const stop = (e)=>e.stopPropagation();
  return (
    <div style={backdrop2} onClick={onCancel}>
      <div style={modal2} onClick={stop}>
        <h3 style={{marginTop:0, marginBottom:6}}>Confirmar pedido</h3>
        <p style={{margin:'6px 0', color:'#334155'}}>Vas a enviar tu pedido.</p>
        <div style={resumenGrid}>
          <span>Entrega:</span><b>{entrega === 'domicilio' ? 'A domicilio' : 'En el local'}</b>
          <span>Pago:</span><b>{pago === 'tarjeta' ? 'Tarjeta' : 'Pagar en el local'}</b>
          <span>Total:</span><b>Q{Number(total).toFixed(2)}</b>
        </div>
        <p style={{margin:'10px 0'}}>¿Confirmar y enviarlo ahora?</p>
        <div style={{display:'flex', justifyContent:'flex-end', gap:10}}>
          <button onClick={onCancel} style={btnGhost}>Cancelar</button>
          <button onClick={onOk} style={btnPrimary}>Aceptar</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ children }) {
  return (
    <div style={toastWrap}>
      <div style={toastBox}>{children}</div>
    </div>
  );
}

/* ===== Estilos del modal / toast ===== */
const backdrop2 = { position:"fixed", inset:0, background:"rgba(15,23,42,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
const modal2 = { background:"#fff", borderRadius:14, padding:16, width:"min(480px, 96vw)", boxShadow:"0 20px 60px rgba(0,0,0,.35)" };
const resumenGrid = { display:"grid", gridTemplateColumns:"auto 1fr", gap:"6px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", marginTop:6 };
const btnGhost = { background:"#e5e7eb", color:"#111827", border:"none", padding:"10px 14px", borderRadius:10, fontWeight:700, cursor:"pointer" };
const btnPrimary = { background:"#111827", color:"#fff", border:"none", padding:"10px 14px", borderRadius:10, fontWeight:700, cursor:"pointer" };

const toastWrap = { position:"fixed", right:14, bottom:14, zIndex:9999 };
const toastBox = { background:"#0f172a", color:"#fff", borderRadius:12, padding:"10px 12px", boxShadow:"0 8px 24px rgba(0,0,0,.25)", maxWidth:420, fontFamily:"Segoe UI, sans-serif", fontSize:15 };
