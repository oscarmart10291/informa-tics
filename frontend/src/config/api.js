// src/config/api.js
import axios from "axios";

/** ================= UTILIDADES ================= **/
function clean(v) {
  const s = (v ?? "").toString().trim();
  if (!s || s === "undefined" || s === "null") return undefined;
  return s;
}

function getViteEnv(key) {
  try {
    // eslint-disable-next-line no-new-func
    const read = new Function(
      "k",
      "try { return (import.meta && import.meta.env && import.meta.env[k]) } catch(e) { return undefined }"
    );
    return clean(read(key));
  } catch {
    return undefined;
  }
}

function boolFromEnv(...vals) {
  const v = (vals.find((x) => typeof x === "string" && x.length) || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** ================= CONFIG PRINCIPAL ================= **/
export const USE_JWT =
  boolFromEnv(getViteEnv("VITE_USE_JWT"), process.env.REACT_APP_USE_JWT) || false;

const ATTACH_JWT_TO_SSE = USE_JWT; // Adjuntar token en query para EventSource
const USE_CRA_PROXY = false;       // a true si usas setupProxy.js

function resolveApiUrl() {
  const vite = getViteEnv("VITE_API_URL");
  if (vite) return vite;

  const cra = clean(process.env.REACT_APP_API_URL);
  if (cra) return cra;

  if (USE_CRA_PROXY) return "/api";

  try {
    const { protocol, hostname, port } = window.location;
    const backendPort =
      port === "5001" ? "3001" :
      port === "5173" ? "3001" :
      port === "3000" ? "3001" :
      (port || "3001");
    return `${protocol}//${hostname}:${backendPort}`;
  } catch {
    return "http://localhost:3001";
  }
}

export const apiUrl = resolveApiUrl();
export const API = apiUrl;

/** Construye URL WS/SSE a partir de http(s) base */
export function buildWsUrl(path = "/") {
  const u = new URL(path.startsWith("http") ? path : `${apiUrl}${path}`, apiUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

/* ========= Token helpers ========= */
const TOKEN_KEYS = ["token", "jwt", "accessToken"];

export function saveToken(token) {
  try {
    if (!token) return;
    localStorage.setItem(TOKEN_KEYS[0], token);
  } catch {}
}
export function clearToken() {
  try {
    TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("auth");
    localStorage.removeItem("session");
    localStorage.removeItem("sesion");
  } catch {}
}
export function readToken() {
  if (!USE_JWT) return null;
  try {
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k);
      if (v) return String(v);
    }
    const auth = JSON.parse(localStorage.getItem("auth") || "null");
    if (auth?.token) return String(auth.token);

    const sesion = JSON.parse(localStorage.getItem("session") || localStorage.getItem("sesion") || "null");
    if (sesion?.token) return String(sesion.token);

    // Hook opcional (por si tú controlas el token centralmente)
    if (typeof window !== "undefined" && typeof window.__getAuthToken === "function") {
      const t = window.__getAuthToken();
      if (t) return String(t);
    }
  } catch {}
  return null;
}

/** Para flujos de login: guarda {user, token} como quieras */
export function setAuthSession({ token, user } = {}) {
  try {
    if (token) saveToken(token);
    if (user) localStorage.setItem("auth", JSON.stringify({ user, token: readToken() || token || null }));
  } catch {}
}

/** Inyección DEV opcional para backend sin JWT (autorice: X-User-Json) */
function readDevUserJsonHeader() {
  try {
    const v = localStorage.getItem("DEV_USER_JSON");
    return v && v.trim().length ? v.trim() : null;
  } catch { return null; }
}

// Log único de config
if (typeof window !== "undefined" && !window.__API_URL_LOGGED__) {
  console.log("[config] apiUrl =", apiUrl, "| USE_JWT =", USE_JWT);
  window.__API_URL_LOGGED__ = true;
}

/* ========= Axios ========= */
export const http = axios.create({
  baseURL: apiUrl,
  withCredentials: true, // útil si luego usas cookies/sesiones
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

// Interceptor de request -> Agrega Authorization global
http.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers || {};

  if (USE_JWT) {
    const t = readToken();
    if (t && !cfg.headers.Authorization) {
      cfg.headers.Authorization = `Bearer ${t}`;
    }
    // En producción, NO mandes cabeceras dev
    if (cfg.headers["X-User-Json"]) delete cfg.headers["X-User-Json"];
  } else {
    // Dev only: autorice.js puede aceptar X-User-Json
    const devUser = readDevUserJsonHeader();
    if (devUser && !cfg.headers["X-User-Json"]) {
      cfg.headers["X-User-Json"] = devUser;
    }
  }

  return cfg;
});

// Manejo centralizado de 401 → (opcional) redirigir a login
const REDIR_401 = true; // ponlo en false si no quieres redirección automática
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (REDIR_401 && status === 401 && typeof window !== "undefined") {
      clearToken();
      const here = window.location.pathname + window.location.search;
      const to = `/login?next=${encodeURIComponent(here)}`;
      if (window.location.pathname !== "/login") window.location.assign(to);
    }
    return Promise.reject(err);
  }
);

/* ========= SSE helper ========= */
function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

/**
 * openSSE(topicOrPath, handlers = {}, opts = {})
 *
 * - Si pasas una RUTA (empieza con "/" o "http"), se conecta DIRECTO a esa ruta
 *   Ej: openSSE("/caja/stream")
 *
 * - Si pasas un NOMBRE DE TOPIC (string sin "/"), usa hub unificado:
 *   GET /sse?topic=MI_TOPIC
 *
 * - Adjunta ?token=... SOLO si USE_JWT=true (EventSource no manda Authorization)
 * - Devuelve el EventSource REAL
 */
export function openSSE(topicOrPath, handlers = {}, opts = {}) {
  const base = clean(apiUrl) || "http://localhost:3001";
  const token = USE_JWT ? readToken() : null;

  let urlObj;

  if (
    typeof topicOrPath === "string" &&
    (topicOrPath.startsWith("/") || /^https?:\/\//i.test(topicOrPath))
  ) {
    const full = topicOrPath.startsWith("/") ? `${base}${topicOrPath}` : topicOrPath;
    urlObj = new URL(full);
  } else {
    urlObj = new URL(`${base}/sse`);
    const params = urlObj.searchParams;
    params.set("topic", String(topicOrPath || ""));
    if (opts.scopedUserId) {
      params.set("scoped", "1");
      params.set("userId", String(opts.scopedUserId));
    }
  }

  // Adjunta JWT como query param SOLO si se está usando JWT realmente
  if (ATTACH_JWT_TO_SSE && token && !urlObj.searchParams.has("token")) {
    urlObj.searchParams.set("token", token);
  }

  const es = new EventSource(urlObj.toString(), { withCredentials: true });

  if (handlers.open)     es.onopen =    (ev) => handlers.open(ev);
  if (handlers.error)    es.onerror =   (ev) => handlers.error(ev);
  if (handlers.message)  es.onmessage = (ev) => handlers.message(safeParse(ev.data), ev);

  const reserved = new Set(["open", "error", "message"]);
  Object.keys(handlers || {}).forEach((name) => {
    if (!reserved.has(name)) {
      es.addEventListener(name, (ev) => handlers[name]?.(safeParse(ev.data), ev));
    }
  });

  return es;
}
