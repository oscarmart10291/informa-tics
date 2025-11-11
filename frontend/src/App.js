// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';

import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';
import Usuarios from './pages/Usuarios';
import Platillos from './pages/Platillos';
import Historial from './pages/Historial';
import PanelPorRol from './pages/PanelPorRol';
import MenuAdmin from './pages/MenuAdmin';
import ManageCategories from './pages/ManageCategories';
import GestionRoles from './pages/GestionRoles';
import VistaMesero from './pages/VistaMesero';
import OrdenesMesero from './pages/OrdenesMesero';
import Cocinero from './pages/Cocinero';
import CambiarPassword from './pages/CambiarPassword';
import Bartender from './pages/Bartender';
import Mesas from './pages/Mesas';
import HistorialOrdenesMesero from "./pages/HistorialOrdenesMesero";

import Caja from './pages/Caja';
import VentasDelDia from './pages/VentasDelDia';
import Egresos from './pages/Egresos';

import EgresosAdmin from './pages/EgresosAdmin';

import RequireAuth from './guards/RequireAuth';
import RequirePerm from './guards/RequirePerm';

import Repartidor from './pages/Repartidor';
import ReservasHistorial from './pages/ReservasHistorial';
import Reporteria from './pages/Reporteria';

// ✅ Admin
import AdminCajaTurnos from './pages/AdminCajaTurnos';
import AdminCalificaciones from './pages/AdminCalificaciones';
import AdminPropina from './pages/AdminPropina'; // ⬅️ NUEVO: componente real

function computeTitle(pathname) {
  const p = (pathname || '').toLowerCase();

  if (p.startsWith('/mesero')) return 'Mesero';
  if (p.startsWith('/caja/ventas')) return 'Cajero – Ventas del día';
  if (p.startsWith('/caja/egresos')) return 'Cajero – Egresos';
  if (p.startsWith('/caja')) return 'Cajero';

  if (p.startsWith('/cocina')) return 'Cocinero';
  if (p.startsWith('/barra')) return 'Bartender';
  if (p.startsWith('/reparto')) return 'Repartidor';

  if (p.startsWith('/admin/usuarios')) return 'Administración – Usuarios';
  if (p.startsWith('/admin/platillos')) return 'Administración – Platillos';
  if (p.startsWith('/admin/historial')) return 'Administración – Historial';
  if (p.startsWith('/admin/menu')) return 'Administración – Menú';
  if (p.startsWith('/admin/categorias')) return 'Administración – Categorías';
  if (p.startsWith('/admin/roles')) return 'Administración – Roles';
  if (p.startsWith('/admin/mesas')) return 'Administración – Mesas';
  if (p.startsWith('/admin/reservacion')) return 'Administración – Reservaciones';
  if (p.startsWith('/admin/egresos')) return 'Administración – Autorizar egresos';
  if (p.startsWith('/admin/caja-turnos')) return 'Administración – Turnos de caja';
  if (p.startsWith('/admin/calificaciones')) return 'Administración – Calificaciones';
  if (p.startsWith('/admin/propina')) return 'Administración – Propina';          // ✅
  if (p.startsWith('/admin/reportes')) return 'Administración – Reportería';
  if (p.startsWith('/admin')) return 'Administración';

  if (p.startsWith('/panel')) return 'Panel';

  if (p.startsWith('/cambiar-password')) return 'Cambiar contraseña';
  if (p === '/' || p.startsWith('/login')) return 'Iniciar sesión';
  return 'Restaurante';
}

function DynamicTitleWrapper() {
  const loc = useLocation();
  useEffect(() => {
    const base = computeTitle(loc.pathname);
    document.title = `${base} | Restaurante`;
  }, [loc.pathname]);
  return <Outlet />;
}

function RequirePasswordChange() {
  const loc = useLocation();
  const u = JSON.parse(localStorage.getItem('usuario') || 'null');
  const must = Boolean(u?.debeCambiarPassword);
  if (must && loc.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Protegidas por sesión */}
        <Route element={<RequireAuth />}>
          <Route path="/cambiar-password" element={<CambiarPassword />} />
          <Route element={<RequirePasswordChange />} />
          <Route element={<DynamicTitleWrapper />}>

            {/* Panel */}
            <Route path="/panel" element={<PanelPorRol />} />

            {/* ===== Admin ===== */}
            <Route element={<RequirePerm anyOf={[
              'CONFIGURAR_USUARIOS',
              'CONFIGURAR_PLATILLOS',
              'GESTIONAR_ROLES',
              'VER_HISTORIAL',
              'VER_MENU',
              'GESTIONAR_CATEGORIAS'
            ]} />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>

            <Route element={<RequirePerm anyOf={['CONFIGURAR_USUARIOS']} />}>
              <Route path="/admin/usuarios" element={<Usuarios />} />
            </Route>

            <Route element={<RequirePerm anyOf={['CONFIGURAR_PLATILLOS']} />}>
              <Route path="/admin/platillos" element={<Platillos />} />
            </Route>

            <Route element={<RequirePerm anyOf={['VER_HISTORIAL']} />}>
              <Route path="/admin/historial" element={<Historial />} />
            </Route>

            <Route element={<RequirePerm anyOf={['VER_MENU','GESTIONAR_CATEGORIAS']} />}>
              <Route path="/admin/menu" element={<MenuAdmin />} />
              <Route path="/admin/categorias" element={<ManageCategories />} />
            </Route>

            <Route element={<RequirePerm anyOf={['GESTIONAR_ROLES']} />}>
              <Route path="/admin/roles" element={<GestionRoles />} />
            </Route>

            {/* Admin Mesas */}
            <Route element={<RequirePerm anyOf={['CONFIGURAR_MESAS']} />}>
              <Route path="/admin/mesas" element={<Mesas />} />
            </Route>
            <Route element={<RequirePerm anyOf={['RESERVAR_MESAS']} />}>
              <Route path="/admin/reservacion" element={<ReservasHistorial />} />
            </Route>

            {/* Admin autoriza egresos */}
            <Route element={<RequirePerm anyOf={['AUTORIZAR_EGRESO']} />}>
              <Route path="/admin/egresos" element={<EgresosAdmin />} />
            </Route>

            {/* ✅ Admin: Turnos de Caja */}
            <Route element={<RequirePerm anyOf={['AUTORIZAR_APERTURA_CAJA']} />}>
              <Route path="/admin/caja-turnos" element={<AdminCajaTurnos />} />
            </Route>

            {/* ✅ Calificaciones */}
            <Route element={<RequirePerm anyOf={['CALIFICACIONES_VER','REPORTES_VER']} />}>
              <Route path="/admin/calificaciones" element={<AdminCalificaciones />} />
            </Route>

            {/* ✅ Propina (permiso: CAJA; ajusta si usas otro) */}
            <Route element={<RequirePerm anyOf={['CAJA']} />}>
              <Route path="/admin/propina" element={<AdminPropina />} />
            </Route>

            {/* ✅ Reportería */}
            <Route element={<RequirePerm anyOf={['REPORTES_VER']} />}>
              <Route path="/admin/reportes" element={<Reporteria />} />
            </Route>

            {/* ===== Mesero ===== */}
            <Route element={<RequirePerm anyOf={['GENERAR_ORDEN']} />}>
              <Route path="/mesero" element={<VistaMesero />} />
            </Route>
            <Route element={<RequirePerm anyOf={['VER_ORDENES']} />}>
              <Route path="/mesero/ordenes" element={<OrdenesMesero />} />
            </Route>
            <Route element={<RequirePerm anyOf={['ORDENES_TERMINADAS']} />}>
              <Route path="/mesero/historial" element={<HistorialOrdenesMesero />} />
            </Route>

            {/* ===== Cocina ===== */}
            <Route element={<RequirePerm anyOf={['COCINA_VIEW']} />}>
              <Route path="/cocina" element={<Cocinero />} />
            </Route>

            {/* ===== Barra ===== */}
            <Route element={<RequirePerm anyOf={['BARRA_VIEW']} />}>
              <Route path="/barra" element={<Bartender />} />
            </Route>

            {/* ===== Caja (Cajero) ===== */}
            <Route element={<RequirePerm anyOf={['CAJA']} />}>
              <Route path="/caja" element={<Caja />} />
              <Route path="/caja/ventas" element={<VentasDelDia />} />
            </Route>
            <Route element={<RequirePerm anyOf={['CAJA','SOLICITAR_EGRESO']} />}>
              <Route path="/caja/egresos" element={<Egresos />} />
            </Route>

            {/* ===== Repartidor ===== */}
            <Route element={<RequirePerm anyOf={['ACCESO_VISTA_REPARTO']} />}>
              <Route path="/reparto" element={<Repartidor />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}
