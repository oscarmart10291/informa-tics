import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function RequireAuth() {
  const location = useLocation();
  let user = null;
  try { user = JSON.parse(localStorage.getItem('usuario')); } catch { user = null; }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Normaliza y guarda (opcional)
  const perms = Array.isArray(user?.permisos)
    ? user.permisos.map(p =>
        String(typeof p === 'string' ? p : (p?.nombre || p?.key || p?.clave || ''))
          .trim().toUpperCase().replace(/\s+/g, '_')
      )
    : [];
  const role = String(user?.rol?.nombre || '').trim().toUpperCase();
  const normalized = { ...user, permisos: perms, rol: { ...user?.rol, nombre: role } };
  try { localStorage.setItem('usuario', JSON.stringify(normalized)); } catch {}

  return <Outlet />;
}
