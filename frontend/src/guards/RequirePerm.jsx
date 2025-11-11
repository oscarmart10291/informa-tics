import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const toKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '_');

export default function RequirePerm({ anyOf = [], allOf = [] }) {
  const location = useLocation();

  let user = null;
  try { user = JSON.parse(localStorage.getItem('usuario')); } catch { user = null; }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Normaliza permisos a Set
  const have = new Set(
    (Array.isArray(user?.permisos) ? user.permisos : [])
      .map(p => (typeof p === 'string' ? p : (p?.nombre || p?.key || p?.clave || '')))
      .filter(Boolean)
      .map(toKey)
  );

  const needAny = anyOf.map(toKey);
  const needAll = allOf.map(toKey);

  const okAny = needAny.length === 0 ? true : needAny.some(k => have.has(k));
  const okAll = needAll.length === 0 ? true : needAll.every(k => have.has(k));

  if (!(okAny && okAll)) {
    // 👉 si no tiene permiso, manda al panel (no al login) para evitar limpiar el form
    return <Navigate to="/panel" replace state={{ reason: 'forbidden' }} />;
  }

  return <Outlet />;
}
