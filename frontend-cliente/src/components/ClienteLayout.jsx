import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getUser, logout } from "../utils/session";

const navItem = ({ isActive }) => ({
  display: "block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  color: "white",
  background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
});

export default function ClienteLayout({ children }) {
  const user = getUser();
  const [open, setOpen] = useState(false);

  return (
    <div className="cl-layout">
      {/* Backdrop móvil */}
      {open && <div className="cl-backdrop" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`cl-side ${open ? "open" : ""}`}>
        {/* Header del sidebar (móvil) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/cliente/home" style={{ color: "white", textDecoration: "none" }} onClick={()=>setOpen(false)}>
            <h2 style={{ margin: 0, fontWeight: 800, letterSpacing: 0.3 }}>🍷 Restaurante</h2>
          </Link>

          {/* Botón cerrar sólo en móvil */}
          <button
            onClick={() => setOpen(false)}
            className="only-mobile"
            aria-label="Cerrar menú"
            style={{
              width: 38, height: 38, borderRadius: 10,
              border: "none", background: "rgba(255,255,255,.15)",
              color: "#fff", fontWeight: 900, cursor: "pointer"
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 24, display: "grid", gap: 8 }}>
          <NavLink to="/cliente/home" style={navItem} onClick={()=>setOpen(false)}>🏠 Inicio</NavLink>
          <NavLink to="/cliente/pedido" style={navItem} onClick={()=>setOpen(false)}>🍽️ Realizar pedido</NavLink>
          <NavLink to="/cliente/reservacion" style={navItem} onClick={()=>setOpen(false)}>📅 Reservación</NavLink>
          <NavLink to="/cliente/historial" style={navItem} onClick={()=>setOpen(false)}>🧾 Historial</NavLink>
          <NavLink to="/cliente/mis-reservas" style={navItem} onClick={()=>setOpen(false)}>📜 Mis reservaciones</NavLink>
        </div>
      </aside>

      {/* Header */}
      <header className="cl-main-header">
        {/* Hamburguesa (solo móvil) */}
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="only-mobile"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40, height: 40, borderRadius: 10,
            border: "1px solid #e5e7eb", background: "#fff",
          }}
        >
          ☰
        </button>

        {/* Usuario */}
        <div style={{ fontWeight: 700, color: "#333", marginLeft: 8 }}>
          {user ? `👤 ${user.nombre || user.usuario || user.correo}` : "Cliente"}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            border: "none", background: "#222", color: "white",
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </header>

      {/* Main */}
      <main className="cl-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
