// src/App.js
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import RealizarPedido from "./pages/RealizarPedido";
import Reservacion from "./pages/Reservacion";
import HistorialPedidos from "./pages/HistorialPedidos";
import ClienteLayout from "./components/ClienteLayout";
import RequireClient from "./components/RequireClient";
import MisReservas from "./pages/MisReservas";

/* === Hook para cambiar título y favicon en cada ruta === */
function usePageTitle(baseTitle) {
  const location = useLocation();

  useEffect(() => {
    let title = baseTitle;
    let favicon = "/favicon-client.ico"; // 👈 usa un ícono distinto para clientes

    if (location.pathname.startsWith("/cliente/home")) title = "Inicio";
    if (location.pathname.startsWith("/cliente/pedido")) title = "Realizar Pedido";
    if (location.pathname.startsWith("/cliente/reservacion")) title = "Reservación";
    if (location.pathname.startsWith("/cliente/historial")) title = "Historial de pedidos";
    if (location.pathname.startsWith("/cliente/mis-reservas")) title = "Mis Reservaciones";

    document.title = `${title} | Restaurante Morales`;

    // Cambiar favicon dinámicamente
    const link = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.href = favicon;
    document.head.appendChild(link);
  }, [location, baseTitle]);
}

function AppRoutes() {
  // baseTitle aplica como prefijo genérico
  usePageTitle("Login Cliente");

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route
        path="/cliente/home"
        element={
          <RequireClient>
            <ClienteLayout><Home /></ClienteLayout>
          </RequireClient>
        }
      />

      <Route
        path="/cliente/pedido"
        element={
          <RequireClient>
            <ClienteLayout><RealizarPedido /></ClienteLayout>
          </RequireClient>
        }
      />

      <Route
        path="/cliente/reservacion"
        element={
          <RequireClient>
            <ClienteLayout><Reservacion /></ClienteLayout>
          </RequireClient>
        }
      />

      <Route
        path="/cliente/historial"
        element={
          <RequireClient>
            <ClienteLayout><HistorialPedidos /></ClienteLayout>
          </RequireClient>
        }
      />

      <Route
        path="/cliente/mis-reservas"
        element={
          <RequireClient>
            <ClienteLayout><MisReservas /></ClienteLayout>
          </RequireClient>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
