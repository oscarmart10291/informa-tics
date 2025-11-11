import { http } from '../config/api';

export function fetchRepartidorNotifs({ repartidorId, limit = 20 }) {
  const p = new URLSearchParams();
  if (repartidorId) p.set('repartidorId', repartidorId);
  p.set('limit', String(limit));
  return http.get(`/repartidor/notifs?${p}`).then(r => r.data);
}

export function markAllRepartidorNotifsRead(repartidorId) {
  const p = new URLSearchParams();
  if (repartidorId) p.set('repartidorId', repartidorId);
  return http.patch(`/repartidor/notifs/visto-todas?${p}`).then(r => r.data);
}
