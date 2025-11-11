// src/pages/AdminPanel.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { http } from '../config/client';
import AdminDashboardSummary from '../components/AdminDashboardSummary';

// Catálogo de accesos del panel y el permiso que requiere cada uno
const CATALOGO = [
  { ruta: "/admin/usuarios",        texto: "Usuarios",          icono: "👥",  permiso: "CONFIGURAR_USUARIOS" },
  { ruta: "/admin/platillos",       texto: "Platillos",         icono: "🍽️", permiso: "CONFIGURAR_PLATILLOS" },
  { ruta: "/admin/historial",       texto: "Historial",         icono: "📜",  permiso: "VER_HISTORIAL" },
  { ruta: "/admin/menu",            texto: "Menú",              icono: "📋",  permiso: "VER_MENU" },
  { ruta: "/admin/categorias",      texto: "Categorías",        icono: "📂",  permiso: "GESTIONAR_CATEGORIAS" },
  { ruta: "/admin/roles",           texto: "Roles",             icono: "🛠",  permiso: "GESTIONAR_ROLES" },
  { ruta: "/admin/mesas",           texto: "Mesas",             icono: "🪑",  permiso: "CONFIGURAR_MESAS" },
  { ruta: "/admin/reservacion",     texto: "Reservaciones",     icono: "📅",  permiso: "RESERVAR_MESAS" },
  { ruta: "/admin/egresos",         texto: "Autorizar egresos", icono: "✅",  permiso: "AUTORIZAR_EGRESO" },
  { ruta: "/admin/caja-turnos",     texto: "Turnos de caja",    icono: "💵",  permiso: "AUTORIZAR_APERTURA_CAJA" },
  { ruta: "/admin/calificaciones",  texto: "Calificaciones",    icono: "⭐",  permiso: "CALIFICACIONES_VER" },
  { ruta: "/admin/reportes",        texto: "Reportería",        icono: "📊",  permiso: "REPORTES_VER" },
  
  { ruta: "/admin/propina",         texto: "Propina",           icono: "💁‍♀️", permiso: "CAJA" },
];

function AdminPanel() {
  const [usuario, setUsuario] = useState(null);
  const [permisosIdPorNombre, setPermisosIdPorNombre] = useState({}); // { NOMBRE: id }
  const [permisosDelRol, setPermisosDelRol] = useState([]); // [ids]
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // 1) Verificación de sesión y bloqueo si NO es admin
  useEffect(() => {
    try {
      const raw = localStorage.getItem('usuario');
      const u = raw ? JSON.parse(raw) : null;
      if (!u) {
        navigate('/login', { replace: true });
        return;
      }

      setUsuario(u);
      const esAdmin = u?.rol?.nombre?.toLowerCase() === 'administrador';
      if (!esAdmin) {
        navigate('/menu', { replace: true });
        return;
      }

      // 2) Cargar permisos (mapa nombre->id y permisos del rol)
      (async () => {
        try {
          const { data: listaPermisos } = await http.get('/permisos'); // [{id,nombre}]
          const map = {};
          for (const p of (listaPermisos || [])) map[p.nombre] = p.id;
          setPermisosIdPorNombre(map);

          const { data: roles } = await http.get('/permisos/roles-con-permisos');
          // roles puede venir como [{id,nombre,permisos:[{id,...}] o [ids]}]
          const rolActual =
            (roles || []).find(r => r.id === u?.rolId) ||
            (roles || []).find(r => String(r.nombre).toLowerCase() === String(u?.rol?.nombre || '').toLowerCase());

          const permisosNormalizados = Array.isArray(rolActual?.permisos)
            ? rolActual.permisos.map(x => (typeof x === 'number' ? x : x?.id)).filter(Boolean)
            : [];

          setPermisosDelRol(permisosNormalizados);
        } catch (e) {
          console.error('Error cargando permisos:', e);
          setError('No se pudieron cargar los permisos.');
        }
      })();
    } catch (e) {
      console.error(e);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const esAdmin = useMemo(
    () => usuario?.rol?.nombre?.toLowerCase() === 'administrador',
    [usuario]
  );

  // 3) Helper para saber si muestra cada botón
  const puedeVer = (permisoNombre) => {
    if (esAdmin) return true; // admin ve todo
    const idNecesario = permisosIdPorNombre[permisoNombre];
    if (!idNecesario) return false;
    return permisosDelRol.includes(idNecesario);
  };

  const cerrarSesion = () => {
    try {
      localStorage.removeItem('usuario');
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    } finally {
      window.location.replace('/login');
    }
  };

  if (!usuario || !esAdmin) return null; // mientras valida/redirige

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f5f6fa' }}>
      {/* Top bar */}
      <header style={{
        backgroundColor: '#1e3d59',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2rem',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>📋 Panel de Administración</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>👤 {usuario?.nombre || "Administrador"}</span>
          <button onClick={cerrarSesion} style={{
            backgroundColor: '#e63946',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '5px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}>Cerrar sesión</button>
        </div>
      </header>

      {/* === DASHBOARD (HOY) ARRIBA === */}
      <AdminDashboardSummary />

      {/* Contenido: Accesos rápidos ABAJO */}
      <div style={{
        maxWidth: '1100px',
        margin: '1.5rem auto 2.5rem',
        padding: '2rem',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.06)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.6rem', color: '#333' }}>Accesos rápidos</h2>

        {error && (
          <div style={{
            background: '#fdecea',
            color: '#a61b1b',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            marginBottom: '1rem',
            border: '1px solid #f5c2c0'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '2rem',
          justifyItems: 'center'
        }}>
          {CATALOGO.filter(btn => puedeVer(btn.permiso)).map(({ ruta, texto, icono }) => (
            <Link to={ruta} key={ruta} style={cuadroLink}>
              <div style={{ fontSize: '2rem' }}>{icono}</div>
              <span style={{ marginTop: '0.5rem', fontWeight: 500 }}>{texto}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const cuadroLink = {
  backgroundColor: '#f1f3f6',
  textDecoration: 'none',
  color: '#1e3d59',
  width: '170px',
  height: '130px',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s, box-shadow 0.2s',
  cursor: 'pointer'
};

export default AdminPanel;
