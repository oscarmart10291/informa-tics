import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import NotificationBellRepartidor from '../components/NotificationBellRepartidor';
import TipoCambioBadge from '../components/TipoCambioBadge';

const THEME = { dark: '#1e3d59', danger: '#e63946' };

const toKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '_');
const normRoleName = (name) => toKey(name);
const normPermList = (list) =>
  (Array.isArray(list) ? list : [])
    .map(p => (typeof p === 'string' ? p : (p?.clave || p?.nombre || p?.key || '')))
    .filter(Boolean)
    .map(toKey);

const getPermsFromUser = (u) => {
  const p1 = normPermList(u?.permisos || []);
  if (p1.length) return p1;
  return normPermList(u?.rol?.permisos || []);
};

function logout() {
  try { localStorage.removeItem('usuario'); sessionStorage.clear(); }
  finally { window.location.replace('/login'); }
}

const CATALOGO = [
  { ruta: "/admin/usuarios",   texto: "Usuarios",          icono: "👥",  permiso: "CONFIGURAR_USUARIOS" },
  { ruta: "/admin/platillos",  texto: "Platillos",         icono: "🍽️", permiso: "CONFIGURAR_PLATILLOS" },
  { ruta: "/admin/historial",  texto: "Historial",         icono: "📜",  permiso: "VER_HISTORIAL" },
  { ruta: "/admin/menu",       texto: "Menú",              icono: "📋",  permiso: "VER_MENU" },
  { ruta: "/admin/categorias", texto: "Categorías",        icono: "📂",  permiso: "GESTIONAR_CATEGORIAS" },
  { ruta: "/admin/roles",      texto: "Roles",             icono: "🛠",  permiso: "GESTIONAR_ROLES" },
  { ruta: "/admin/mesas",      texto: "Mesas",             icono: "🪑",  permiso: "CONFIGURAR_MESAS" },
  { ruta: "/admin/reservacion",texto: "Reservaciones",     icono: "📅",  permiso: "RESERVAR_MESAS" },
  { ruta: "/admin/egresos",    texto: "Autorizar egresos", icono: "✅",  permiso: "AUTORIZAR_EGRESO" },
  { ruta: "/admin/caja-turnos",texto: "Turnos de caja",    icono: "💵",  permiso: "AUTORIZAR_APERTURA_CAJA" },
  { ruta: "/admin/reportes",   texto: "Reportería",        icono: "📊",  permiso: "REPORTES_VER" },

  { ruta: "/mesero",           texto: "Generar Orden",     icono: "🛎️", permiso: "GENERAR_ORDEN" },
  { ruta: "/mesero/ordenes",   texto: "Historial Órdenes", icono: "📋",  permiso: "VER_ORDENES" },
  { ruta: "/mesero/historial", texto: "Órdenes Terminadas",icono: "✅",  permiso: "ORDENES_TERMINADAS" },

  { ruta: "/cocina",           texto: "Cocina",            icono: "👨‍🍳", permiso: "COCINA_VIEW" },
  { ruta: "/barra",            texto: "Barra",             icono: "🍹",   permiso: "BARRA_VIEW" },

  { ruta: "/reparto",          texto: "Reparto",           icono: "🏍️",   permiso: "ACCESO_VISTA_REPARTO" },

  { ruta: "/caja",             texto: "Caja",              icono: "💳", permiso: "CAJA" },
  { ruta: "/caja/ventas",      texto: "Ventas del día",    icono: "📈", permiso: "CAJA" },
  { ruta: "/caja/egresos",     texto: "Solicitar egresos", icono: "🏦", permiso: "CAJA" },
];

export default function PanelPorRol() {
  const [usuario, setUsuario] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [redirecting, setRedirecting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('usuario'));
    if (!u) { navigate('/login', { replace: true }); return; }
    setUsuario(u);
    setPermisos(getPermsFromUser(u));
  }, [navigate]);

  const roleName  = normRoleName(usuario?.rol?.nombre);
  const rolUpper  = String(usuario?.rol?.nombre || '').toUpperCase();
  const esRepartidor = rolUpper === 'REPARTIDOR';
  const esCajero     = rolUpper === 'CAJERO';
  const isAdmin = roleName === 'ADMINISTRADOR' || roleName === 'ADMIN';

  useEffect(() => {
    if (!usuario) return;
    if (isAdmin) { setRedirecting(true); navigate('/admin', { replace: true }); }
  }, [usuario, isAdmin, navigate]);

  if (!usuario || redirecting) {
    return (
      <div className="panel-shell">
        <header className="panel-header"><h1>Cargando…</h1></header>
        <main className="panel-main"><p>Preparando tu panel…</p></main>
        <style>{BASE_CSS}</style>
      </div>
    );
  }

  const setPerms = new Set(permisos);
  const accesos = CATALOGO.filter(item => !item.permiso || setPerms.has(item.permiso));
  const showDenied = location.state?.reason === 'forbidden';

  return (
    <div className="panel-shell">
      <header className="panel-header">
        <div className="ph-left">
          <h1 title={usuario?.nombre || 'Usuario'}>
            👤 Panel de {usuario?.nombre || 'Usuario'}
          </h1>
        </div>

        {esCajero && (
          <div className="ph-center">
            <div className="ph-center-inner"><TipoCambioBadge variant="inline" /></div>
          </div>
        )}

        <div className="ph-right">
          {esRepartidor && <NotificationBellRepartidor />}
          <span className="role-chip" title={roleName}>{roleName}</span>
          <button className="logout" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <span className="only-icon">⎋</span>
            <span className="label">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="panel-main">
        <h2 className="grid-title">Accesos según tus permisos</h2>

        {showDenied && (
          <div className="callout warn">No tienes permisos para la vista solicitada.</div>
        )}

        {accesos.length === 0 ? (
          <div className="callout warn">
            No tienes accesos habilitados todavía. Contacta al administrador para asignarte permisos.
          </div>
        ) : (
          <div className={`grid ${accesos.length === 1 ? 'single' : ''}`}>
            {accesos.map(({ ruta, texto, icono }) => (
              <Link key={ruta} to={ruta} className="tile">
                <div className="tile-ico">{icono}</div>
                <span className="tile-txt">{texto}</span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <style>{BASE_CSS}</style>
      <style>{`
        .panel-header{
          position: sticky; top: 0; z-index: 50;
          background:${THEME.dark}; color:#fff;
          padding: max(12px, env(safe-area-inset-top)) 12px 12px;
          display:flex; align-items:center; justify-content:space-between;
          box-shadow: 0 2px 8px rgba(0,0,0,.15);
          gap: 8px;
        }
        .ph-left{ min-width:0; flex:1 1 auto; }
        .ph-center{
          position:absolute; left:50%; top:50%;
          transform:translate(-50%,-50%); pointer-events:none;
        }
        .ph-center-inner{ pointer-events:auto; }
        .ph-right{ display:flex; align-items:center; gap:8px; flex:0 0 auto; }

        /* Título visible hasta 2 líneas en móvil */
        .panel-header h1{
          margin:0; font-size:18px; line-height:1.25;
          max-width: calc(100vw - 24px - 250px);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow:hidden;
          white-space: normal;
        }
        @media (min-width: 992px){
          .panel-header h1{ max-width:none; -webkit-line-clamp: unset; white-space: nowrap; }
        }

        .role-chip{
          background:rgba(255,255,255,.14);
          padding:6px 10px; border-radius:999px; font-weight:800;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          max-width: 42vw; font-size: 14px;
        }

        .logout{
          border:none; color:#fff; background:${THEME.danger};
          border-radius:999px; padding:8px 12px; font-weight:800; cursor:pointer;
          display:inline-flex; align-items:center; gap:8px;
        }
        .only-icon{ display:none; }
        @media (max-width:480px){
          .logout .label{ display:none; }
          .only-icon{ display:inline; }
          .role-chip{ max-width: 36vw; font-size:13px; }
        }

        .panel-main{
          max-width: 1000px; margin: 16px auto; padding: 16px;
          background:#fff; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,.05);
        }
        .grid-title{ margin: 0 0 14px; text-align:center; color:#333; }
        .callout{ padding:12px 14px; border-radius:10px; text-align:center; }
        .callout.warn{ background:#fff8e1; border:1px solid #ffe0a3; color:#7a5b00; }

        .grid{
          display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap:14px;
        }
        .grid.single{
          grid-template-columns: repeat(auto-fit, 220px);
          justify-content: center;
        }
        .tile{
          background:#f1f3f6; color:#1e3d59; text-decoration:none;
          min-height:110px; border-radius:12px;
          box-shadow: 0 2px 6px rgba(0,0,0,.08);
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          transition: transform .15s, box-shadow .15s;
        }
        .tile:hover{ transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.12); }
        .tile-ico{ font-size: 28px; line-height: 1; }
        .tile-txt{ margin-top:8px; font-weight: 700; }
      `}</style>
    </div>
  );
}

const BASE_CSS = `
  .panel-shell{
    min-height:100vh;
    background:#f9f9f9;
    font-family: Segoe UI, system-ui, -apple-system, Roboto, sans-serif;
  }
`;
