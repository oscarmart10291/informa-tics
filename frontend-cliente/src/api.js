// src/api.js
import axios from "axios";

// 👉 Usa la IP de tu PC y el puerto del backend
const baseURL =
  import.meta?.env?.VITE_API_URL || // si usas Vite y configuras esta var
  process.env.REACT_APP_API_URL ||   // si usas CRA y configuras esta var
  "http://localhost:3001";        // fallback directo (tu IP Wi-Fi)

const api = axios.create({
  baseURL,
  withCredentials: true, // deja true si usas cookies/sesiones
});

// (Opcional) Interceptor para ver errores de red claramente
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.message === "Network Error") {
      console.error("❌ Network Error: revisa IP/puerto, CORS y firewall.");
    }
    return Promise.reject(err);
  }
);

export default api;
export { baseURL };
