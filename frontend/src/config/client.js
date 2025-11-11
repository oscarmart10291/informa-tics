// frontend/src/config/client.js
import axios from "axios";

/**
 * =========================
 *  Config desde variables
 * =========================
 * CRA (react-scripts) usa process.env.REACT_APP_*
 * Netlify: define REACT_APP_API_URL en el panel/env vars.
 */
export const USER_STORAGE_KEY = "usuario";
export const TOKEN_STORAGE_KEY = "token";

/**
 * Si quieres desactivar JWT fácilmente en algún entorno,
 * define REACT_APP_USE_JWT="false". Por default: true.
 */
export const USE_JWT = String(
  process.env.REACT_APP_USE_JWT ?? "true"
)
  .trim()
  .toLowerCase() !== "false";

/**
 * Backend API base URL (orden de prioridad):
 * 1) window.__API__ (si lo inyectas en index.html)
 * 2) REACT_APP_API_URL (Netlify/CRA)
 * 3) REACT_APP_API
 * 4) fallback local
 */
export const API =
  (typeof window !== "undefined" && window.__API__) ||
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API ||
  "http://localhost:3001";

// =========================
//  Axios instance
// =========================
export const http = axios.create({
  baseURL: API.replace(/\/$/, ""),
  withCredentials: true, // mantiene cookies si las hay
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

// =========================
//  Interceptor de request
// =========================
http.interceptors.request.use((cfg) => {
  try {
    // Usuario guardado por tu login
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    const usuario = rawUser ? JSON.parse(rawUser) : null;

    // Enviamos el ID por headers para que el backend (Railway) pueda
    // identificar al usuario aun si no hay cookie (caso Netlify/SSR).
    if (usuario?.id) {
      cfg.headers["X-Cajero-Id"] = String(usuario.id);
      cfg.headers["X-User-Id"] = String(usuario.id);
    }

    // Opcional: JWT
    if (USE_JWT) {
      const token =
        localStorage.getItem(TOKEN_STORAGE_KEY) ||
        (usuario && usuario.token) ||
        null;
      if (token) {
        cfg.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // noop
  }
  return cfg;
});

// =========================
//  Interceptor de respuesta
// =========================
http.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
      } catch {
        // noop
      }
    }
    return Promise.reject(err);
  }
);

// =========================
//  SSE helper
// =========================
export function openSSE(path) {
  const url = `${API.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  // Nota: EventSource con credenciales está soportado en la mayoría de navegadores modernos.
  // Si tu auth no depende de cookies, igualmente funcionará por ser GET público.
  return new EventSource(url, { withCredentials: true });
}
