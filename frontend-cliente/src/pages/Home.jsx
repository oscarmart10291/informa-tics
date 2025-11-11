import React from "react";

export default function Home() {
  const card = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 6px 18px rgba(0,0,0,.05)",
  };

  const blueCard = {
    ...card,
    background: "#0284c7",
    color: "white",
    textAlign: "center",
    boxShadow: "0 10px 24px rgba(2,132,199,.35)",
  };

  const sectionTitle = {
    marginTop: 0,
    marginBottom: 6,
    fontSize: 20,
    fontWeight: 700,
  };

  const btnPrimary = {
    display: "inline-block",
    background: "#0f766e",
    color: "white",
    padding: "12px 22px",
    borderRadius: 12,
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: 16,
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 18,
  };

  return (
    <div className="container" style={{ display: "grid", gap: 20, marginTop: 10 }}>
      {/* Encabezado principal */}
      <header style={blueCard}>
        <h1 style={{ margin: 0, fontSize: 28 }}>🍽️ Restaurante Morales</h1>
        <p style={{ margin: "6px 0 14px", fontSize: 16 }}>
          Cocina casera con sabor caribeño, hecha al momento.
        </p>
      </header>

      {/* Información principal */}
      <section style={grid}>
        <div style={card}>
          <h3 style={sectionTitle}>📍 Ubicación</h3>
          <p style={{ margin: 0 }}>
            4a Calle 3-45, Zona 1<br />
            <b>Morales, Izabal</b>, Guatemala
          </p>
          <p style={{ margin: "10px 0 0" }}>
            <a
              href="https://www.google.com/maps?q=Morales%20Izabal%2C%20Guatemala"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#0284c7",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Ver en Google Maps ↗
            </a>
          </p>
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>⏰ Horario</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Lunes a Domingo: 7:00 – 22:00</li>
          </ul>
          <p style={{ marginTop: 10, color: "#64748b" }}>
            Último pedido 30 min antes del cierre.
          </p>
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>☎️ Contacto</h3>
          <p style={{ margin: 0 }}>
            Tel/WhatsApp:{" "}
            <a
              href="tel:+50212345678"
              style={{
                color: "#0ea5e9",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              +502 1234-5678
            </a>
          </p>
          <p style={{ margin: "6px 0 0" }}>
            Email:{" "}
            <a
              href="mailto:mirestaurantegt502@gmail.com"
              style={{
                color: "#0ea5e9",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              mirestaurantegt502@gmail.com
            </a>
          </p>
        </div>
      </section>

      {/* Servicios */}
      <section style={card}>
        <h3 style={sectionTitle}>✨ Servicios</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            color: "#334155",
          }}
        >
          <div>🏠 Consumo en el local</div>
          <div>🚗 Servicio a domicilio</div>
          <div>🧾 Pedidos en línea</div>
          <div>💳 Pago con tarjeta o efectivo</div>
          <div>🅿️ Estacionamiento disponible</div>
          <div>📶 Wi-Fi para clientes</div>
        </div>
      </section>

      {/* Mapa */}
      <section style={card}>
        <h3 style={sectionTitle}>🗺️ Cómo llegar</h3>
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <iframe
            title="Mapa Morales Izabal"
            src="https://www.google.com/maps?q=Morales%20Izabal%2C%20Guatemala&output=embed"
            width="100%"
            height="300"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      {/* CTA final */}
      <section
        style={{
          ...card,
          textAlign: "center",
          background: "linear-gradient(180deg,#0f766e,#115e59)",
          color: "white",
        }}
      >
        <h3 style={{ marginTop: 0 }}>¿Listo para ordenar?</h3>
        <p style={{ margin: "6px 0 16px", opacity: 0.9 }}>
          Pide ahora y te avisamos cuando esté en preparación o listo para recoger.
        </p>
        <a href="/cliente/pedido" style={btnPrimary}>
          Empezar pedido 🍽️
        </a>
      </section>
    </div>
  );
}
