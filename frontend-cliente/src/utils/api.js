// frontend-cliente/src/utils/api.js
import axios from 'axios';

// Ajusta la URL base de tu backend:
export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // si usas sesiones/cookies
});

export const ReservasApi = {
  disponibles: (params) => http.get('/reservas/disponibles', { params }),
  crear: (payload) => http.post('/reservas', payload),
  cancelarCliente: (id, email) => http.post(`/reservas/${id}/cancelar-cliente`, { email }),
  mis: (email) => http.get('/reservas/mis', { params: { email } }),
};
