// frontend/src/api/reservas.js
import { http } from '../config/api';

// disponibilidad para un horario
export async function getMesasDisponibles(fechaHoraISO) {
  const { data } = await http.get('/reservas/disponibles', { params: { fechaHora: fechaHoraISO } });
  return data;
}

// crear reserva
export async function crearReserva({ mesaId, fechaHora, nombre, telefono, nota }) {
  const { data } = await http.post('/reservas', { mesaId, fechaHora, nombre, telefono, nota });
  return data;
}

// confirmar/pagar (CONFIRMADA)
export async function pagarReserva(reservaId, ref = 'SIMULADO') {
  const { data } = await http.post(`/reservas/${reservaId}/pagar`, { ref });
  return data;
}

// historial (admin)
export async function getHistorialReservas({ desde, hasta, estado, q } = {}) {
  const { data } = await http.get('/reservas/historial', { params: { desde, hasta, estado, q } });
  return data;
}

// cancelar (admin)
export async function cancelarReserva(reservaId, { reembolsar = false, motivo = '' } = {}) {
  const { data } = await http.post(`/reservas/${reservaId}/cancelar`, { reembolsar, motivo });
  return data;
}

// ===== NUEVO =====

// próximas reservas (para pintar chip en mesas)
export async function getReservasProximas({ min = 0, max = 180 } = {}) {
  const { data } = await http.get('/reservas/proximas', { params: { min, max } });
  return data;
}

// alertas de reservas (≤win minutos)
export async function getAlertasReservas(win = 45) {
  const { data } = await http.get('/reservas/alertas', { params: { win } });
  return data;
}

// verificar llegada por mesero
export async function verificarReserva(reservaId, meseroId) {
  const { data } = await http.post(`/reservas/${reservaId}/verificar-mesero`, { meseroId });
  return data;
}
