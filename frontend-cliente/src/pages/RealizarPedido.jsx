// src/pages/RealizarPedido.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../api";
import CartPanel from "../components/CartPanel";
import { addItem } from "../utils/cart";

export default function RealizarPedido() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState(null);

  // Drawer carrito (solo móvil)
  const [openCart, setOpenCart] = useState(false);

  // Toast / feedback
  const [toast, setToast] = useState({ open:false, text:"" });

  // Contador para badge del FAB
  const [cartCount, setCartCount] = useState(0);

  // Modal “Agregar con nota”
  const [noteModal, setNoteModal] = useState({
    open: false,
    platillo: null,
    nota: "",
    tipo: null, // 'COMESTIBLE'|'BEBIBLE'
  });

  useEffect(() => { load(); syncCartCount(); }, []);
  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/categorias/visibles`);
      const list = Array.isArray(data) ? data : [];
      setCategorias(list);

      const first = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre))[0];
      setSelectedCatId(first?.id ?? null);

      const map = {};
      list.forEach((cat) => {
        (cat.platillos || []).forEach((p) => { map[p.id] = cat.tipo; });
      });
      localStorage.setItem("platilloTipos", JSON.stringify(map));
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el menú.");
    } finally {
      setLoading(false);
    }
  };

  // === Helpers: contador del carrito (ajusta la clave si tu utils/cart usa otra) ===
  const CART_KEY = "cart"; // <-- si tu util usa otro nombre, cámbialo aquí
  const syncCartCount = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      const qty = Array.isArray(arr)
        ? arr.reduce((s, it) => s + Number(it.qty || 1), 0)
        : 0;
      setCartCount(qty);
    } catch { setCartCount(0); }
  };
  useEffect(() => {
    const onStorage = (e) => { if (e.key === CART_KEY) syncCartCount(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [categorias]
  );

  const selectedCat = useMemo(
    () => categoriasOrdenadas.find((c) => c.id === selectedCatId) || null,
    [categoriasOrdenadas, selectedCatId]
  );

  const money = (v) => `Q${Number(v ?? 0).toFixed(2)}`;

  // --- Toast helpers ---
  const showToast = (text) => {
    setToast({ open:true, text });
    try { navigator.vibrate && navigator.vibrate(15); } catch {}
    setTimeout(() => setToast({ open:false, text:"" }), 1600);
  };

  // Acciones modal
  const abrirModalNota = (p, tipoCat) =>
    setNoteModal({ open: true, platillo: p, nota: "", tipo: tipoCat });
  const cerrarModalNota = () =>
    setNoteModal({ open: false, platillo: null, nota: "", tipo: null });
  const confirmarNota = () => {
    if (!noteModal.platillo) return;
    addItem({
      id: noteModal.platillo.id,
      nombre: noteModal.platillo.nombre,
      precio: noteModal.platillo.precio,
      nota: (noteModal.nota || "").trim(),
      tipo: noteModal.tipo,
    });
    cerrarModalNota();
    syncCartCount();
    showToast(`✅ ${noteModal.platillo.nombre} agregado al carrito`);
    // animación ping del FAB
    pingFab();
  };

  // Agregar directo
  const onAdd = (p, tipo) => {
    addItem({ id: p.id, nombre: p.nombre, precio: p.precio, tipo });
    syncCartCount();
    showToast(`✅ ${p.nombre} agregado al carrito`);
    pingFab();
  };

  // Pequeña animación del FAB
  const [fabPing, setFabPing] = useState(false);
  const pingFab = () => {
    setFabPing(true);
    setTimeout(() => setFabPing(false), 450);
  };

  /* ===== Styles locales mínimos ===== */
  const STICKY_TOP = 'calc(var(--app-header-h, 64px) + 8px)';
  const catBarWrap = {
    position: "sticky", top: STICKY_TOP, background: "#fff", zIndex: 8,
    padding: "8px 0", borderBottom: "1px solid #e5e7eb", marginBottom: 10,
  };
  const catTab = {
    display: "inline-block", background: "#eef2ff", color: "#1e3a8a",
    border: "1px solid #c7d2fe", padding: "8px 12px", borderRadius: 999,
    fontWeight: 800, cursor: "pointer", flex: "0 0 auto",
  };
  const catTabActive = { ...catTab, background: "#1e40af", color: "#fff", borderColor: "#1e40af" };
  const catHeader = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:6 };
  const catTitle = { margin: 0, color: "#0f172a", borderLeft: "4px solid #0f766e", paddingLeft: 10 };
  const catCount = { fontSize: 12, color: "#64748b" };
  const grid = { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14 };
  const card = { background:"#fff", borderRadius:12, boxShadow:"0 6px 18px rgba(0,0,0,.08)", overflow:"hidden", border:"1px solid #eee", display:"flex", flexDirection:"column" };
  const pill = { background:"#0f766e", color:"#fff", borderRadius:8, padding:"2px 8px", fontWeight:700, fontSize:13, whiteSpace:"nowrap" };
  const addBtn = { border:"none", background:"#111827", color:"#fff", padding:"10px 12px", borderRadius:10, cursor:"pointer" };
  const backdrop = { position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 };
  const modal = { background:"#fff", borderRadius:14, padding:16, width:"min(520px,96vw)", boxShadow:"0 10px 30px rgba(0,0,0,0.2)" };
  const ghost = { background:"#e2e8f0", border:"none", color:"#0f172a", padding:"6px 10px", borderRadius:8, fontWeight:700, cursor:"pointer" };
  const primary = { border:"none", background:"#111827", color:"#fff", padding:"8px 12px", borderRadius:10, cursor:"pointer" };

  // Estilos Toast + Badge + Ping
  const toastWrap = {
    position:"fixed", left:0, right:0, bottom:78, display:"grid",
    placeItems:"center", zIndex:10050, pointerEvents:"none"
  };
  const toastBox = {
    background:"#111827", color:"#fff", padding:"10px 14px", borderRadius:12,
    boxShadow:"0 10px 24px rgba(0,0,0,.25)", fontWeight:700, pointerEvents:"auto"
  };
  const badge = {
    position:"absolute", top:-6, right:-6, minWidth:22, height:22,
    borderRadius:999, background:"#16a34a", color:"#fff", display:"grid",
    placeItems:"center", fontSize:12, fontWeight:900, padding:"0 6px",
    border:"2px solid #0b1220"
  };

  return (
    <>
      <div className="grid-2-1">
        {/* IZQUIERDA: menú */}
        <section>
          {/* Tabs */}
          <div style={catBarWrap}>
            <div className="cat-tabs">
              {categoriasOrdenadas.map((cat) => {
                const active = cat.id === selectedCatId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    aria-selected={active}
                    style={active ? catTabActive : catTab}
                  >
                    {cat.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista */}
          {loading && <div style={{ color:"#475569", marginTop:10 }}>Cargando menú…</div>}
          {!loading && !selectedCat && <div style={{ color:"#64748b", marginTop:10 }}>No hay categorías disponibles.</div>}

          {!loading && selectedCat && (
            <div style={{ marginTop:14 }}>
              <div style={catHeader}>
                <h3 style={catTitle}>{selectedCat.nombre}</h3>
                <span style={catCount}>
                  {Array.isArray(selectedCat.platillos) ? selectedCat.platillos.length : 0} producto(s)
                </span>
              </div>

              <div style={grid}>
                {(selectedCat.platillos || []).map((p) => (
                  <article key={p.id} style={card}>
                    <div className="product-media">
                      {p.imagenUrl
                        ? <img src={p.imagenUrl} alt={p.nombre} />
                        : <div style={{width:"100%",height:"100%",display:"grid",placeItems:"center",color:"#888",fontSize:13}}>Sin imagen</div>}
                    </div>

                    <div style={{ padding:"0.9rem 1rem 1rem", display:"grid", gap:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                        <h4 style={{ margin:0 }}>{p.nombre}</h4>
                        <span style={pill}>{money(p.precio)}</span>
                      </div>

                      <div className="btn-row">
                        <button
                          onClick={() => onAdd(p, selectedCat.tipo)}
                          style={addBtn}
                        >
                          Agregar
                        </button>

                        <button
                          onClick={() => setNoteModal({ open:true, platillo:p, nota:"", tipo:selectedCat.tipo })}
                          style={{ ...addBtn, background:"#0f766e" }}
                        >
                          Agregar con nota
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* DERECHA: carrito (desktop) */}
        <aside className="cart-sticky hide-on-mobile">
          <CartPanel />
        </aside>
      </div>

      {/* FAB carrito (móvil) */}
      <button
        className={`cart-fab show-on-mobile ${openCart ? "hide" : ""}`}
        onClick={() => setOpenCart(true)}
        aria-label="Abrir carrito"
        style={{
          position:"fixed",
          right:14,
          bottom:14,
          transform: fabPing ? "scale(1.06)" : "scale(1)",
          transition:"transform .18s ease"
        }}
      >
        <span style={{ position:"relative" }}>
          🛒 Ver carrito
          {cartCount > 0 && <span style={badge}>{cartCount}</span>}
        </span>
      </button>

      {/* Drawer carrito (móvil) */}
      {openCart && <div className="cart-drawer-backdrop" onClick={() => setOpenCart(false)} />}
      <aside className={`cart-drawer ${openCart ? "open" : ""}`}>
        <div className="cart-drawer-header">
          <strong>🛒 Tu pedido</strong>
          <button onClick={() => setOpenCart(false)} aria-label="Cerrar" className="cart-drawer-close">×</button>
        </div>
        <div className="cart-drawer-body">
          <CartPanel />
        </div>
      </aside>

      {/* Toast */}
      {toast.open && (
        <div style={toastWrap} aria-live="polite" aria-atomic="true">
          <div style={toastBox}>{toast.text}</div>
        </div>
      )}

      {/* Modal Nota */}
      {noteModal.open && (
        <div style={backdrop}>
          <div style={modal}>
            <h3 style={{ marginTop: 0 }}>Agregar nota</h3>
            <textarea
              rows={4}
              placeholder="Ej: Sin cebolla, extra salsa…"
              value={noteModal.nota}
              onChange={(e) => setNoteModal((s) => ({ ...s, nota: e.target.value }))}
              style={{ width:"100%", border:"1px solid #d1d5db", borderRadius:10, padding:10 }}
            />
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
              <button onClick={cerrarModalNota} style={ghost}>Cancelar</button>
              <button onClick={confirmarNota} style={primary}>Añadir al carrito</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
