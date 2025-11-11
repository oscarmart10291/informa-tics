import React, { useEffect, useState } from "react";
import { auth, googleProvider } from "../firebaseCliente";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getIdToken,
} from "firebase/auth";
import api from "../api"; // Usa la instancia con baseURL de producción

export default function LoginCliente() {
  const [loading, setLoading] = useState(false);

  /* ==========================================================
     🔁 Maneja el retorno del login con redirect (en móviles)
  ========================================================== */
  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          const idToken = await getIdToken(result.user, true);
          const email = result.user?.email || "";
          const res = await api.post(
            "/auth/google-cliente",
            { email }, // ✅ envía el email como respaldo
            { headers: { Authorization: `Bearer ${idToken}` } }
          );
          localStorage.setItem("usuario", JSON.stringify(res.data.usuario));
          window.location.replace("/cliente/home");
        }
      } catch (e) {
        console.error("Redirect result error:", e);
      }
    })();
  }, []);

  /* ==========================================================
     🔐 Iniciar sesión con Google (popup / fallback redirect)
  ========================================================== */
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      // 1️⃣ Intentar popup (rápido en desktop)
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const idToken = await getIdToken(result.user, true);
        const email = result.user?.email || "";

        const res = await api.post(
          "/auth/google-cliente",
          { email }, // ✅ se envía el correo en el body
          { headers: { Authorization: `Bearer ${idToken}` } }
        );

        localStorage.setItem("usuario", JSON.stringify(res.data.usuario));
        window.location.replace("/cliente/home");
        return; // 🔚 listo
      } catch (popupErr) {
        // 2️⃣ Fallback redirect (para móviles o bloqueos de popup)
        const code = popupErr?.code || "";
        const fallbackCodes = [
          "auth/operation-not-supported-in-this-environment",
          "auth/popup-blocked",
          "auth/popup-closed-by-user",
          "auth/cancelled-popup-request",
        ];
        if (!fallbackCodes.includes(code)) throw popupErr;
        await signInWithRedirect(auth, googleProvider);
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar sesión con Google.");
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     🎨 Estilos inline (manteniendo tu diseño original)
  ========================================================== */
  const page = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(135deg, rgba(220,38,38,.65), rgba(245,158,11,.55)), url('https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1974&auto=format&fit=crop') center/cover no-repeat fixed",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    padding: "24px",
  };

  const card = {
    width: "420px",
    maxWidth: "92vw",
    background: "rgba(255,255,255,.96)",
    borderRadius: "18px",
    boxShadow: "0 18px 50px rgba(0,0,0,.18)",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  };

  const header = { padding: "22px 22px 10px 22px" };
  const brandRow = { display: "flex", alignItems: "center", gap: "12px" };
  const brandIcon = {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "#fee2e2",
    color: "#dc2626",
    fontSize: 22,
    fontWeight: 700,
  };
  const title = { margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" };
  const subtitle = {
    margin: "8px 0 0",
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.45,
  };

  const body = { padding: "10px 22px 22px" };
  const btn = (disabled) => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#cbd5e1" : "#dc2626",
    color: "#fff",
    boxShadow: disabled ? "none" : "0 8px 20px rgba(220,38,38,.35)",
    transition: "transform .06s ease",
  });
  const googleIcon = { width: 20, height: 20, display: "block" };

  const foot = {
    padding: "14px 22px",
    background: "#f8fafc",
    borderTop: "1px solid #e5e7eb",
    fontSize: 12,
    color: "#64748b",
  };

  const link = { color: "#dc2626", textDecoration: "none", fontWeight: 700 };

  const badgeRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    fontSize: 12,
    color: "#1f2937",
  };
  const badge = {
    background: "rgba(255,255,255,.7)",
    border: "1px solid #e5e7eb",
    padding: "5px 10px",
    borderRadius: 999,
  };

  /* ==========================================================
     🧱 JSX render
  ========================================================== */
  return (
    <div style={page}>
      <div style={card}>
        {/* ====== Encabezado / Marca ====== */}
        <div style={header}>
          <div style={brandRow}>
            <div style={brandIcon}>🍽️</div>
            <div>
              <h1 style={title}>Restaurante Morales</h1>
              <p style={{ margin: 0, color: "#dc2626", fontWeight: 700 }}>
                Morales, Izabal
              </p>
            </div>
          </div>
          <p style={subtitle}>
            Cocina casera con sabor caribeño, hecha al momento. Inicia sesión
            para realizar y seguir tus pedidos.
          </p>
          <div style={badgeRow}>
            <span style={badge}>Lun–Sáb 11:00–23:00</span>
            <span style={badge}>Dom 12:00–20:00</span>
          </div>
        </div>

        {/* ====== Cuerpo / Botón Google ====== */}
        <div style={body}>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={btn(loading)}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = "scale(.98)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            aria-label="Continuar con Google"
          >
            <img
              style={googleIcon}
              src="https://www.svgrepo.com/show/355037/google.svg"
              alt="icon"
            />
            {loading ? "Conectando…" : "Continuar con Google"}
          </button>
        </div>

        {/* ====== Pie / Avisos ====== */}
        <div style={foot}>
          <div style={{ marginTop: 6 }}>
            Al continuar aceptas nuestra{" "}
            <a href="#" style={link}>
              Política de Privacidad
            </a>{" "}
            y{" "}
            <a href="#" style={link}>
              Términos y Condiciones
            </a>
            . No compartimos tu contraseña con el restaurante.
          </div>
        </div>
      </div>
    </div>
  );
}
