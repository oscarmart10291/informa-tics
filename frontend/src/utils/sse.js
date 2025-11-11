// frontend/src/utils/sse.js
import { http } from '../config/api';

const API_BASE = (http && http.defaults && http.defaults.baseURL)
  ? http.defaults.baseURL.replace(/\/+$/, '')
  : '';

function keyOf(topic, opts = {}) {
  const scoped = opts.scoped ? '1' : '0';
  const uid = opts.userId != null ? String(opts.userId) : '';
  return `${String(topic).toUpperCase()}|${scoped}|${uid}`;
}

function urlOf(topic, opts = {}) {
  const qs = new URLSearchParams();
  qs.set('topic', String(topic).toUpperCase());
  if (opts.scoped) qs.set('scoped', '1');
  if (opts.userId != null) qs.set('userId', String(opts.userId));
  return `${API_BASE}/sse?${qs.toString()}`;
}

const pool = new Map(); // key -> { es, refs, handlers:Set }

export function open(topic, opts = {}) {
  const key = keyOf(topic, opts);
  let entry = pool.get(key);

  if (!entry) {
    const url = urlOf(topic, opts);
    const es = new EventSource(url, /* { withCredentials: true } si usas cookies */);
    const handlers = new Set();

    const onMessage = (ev) => { for (const h of handlers) try { h(ev, 'message'); } catch {} };
    const onReady   = (ev) => { for (const h of handlers) try { h(ev, 'ready'); } catch {} };
    const onPing    = (ev) => { for (const h of handlers) try { h(ev, 'ping'); } catch {} };
    const onError   = (ev) => {
      // Log útil para saber si la conexión se corta o es bloqueada por CORS
      // (EventSource reintenta solo si el servidor envía "retry:")
      console.warn('[SSE] error en', url, ev);
      for (const h of handlers) try { h(ev, 'error'); } catch {}
    };

    es.onmessage = onMessage;
    es.addEventListener('ready', onReady);
    es.addEventListener('ping', onPing);
    es.addEventListener('error', onError);

    entry = { es, refs: 0, handlers };
    pool.set(key, entry);
  }

  entry.refs += 1;

  function subscribe(handler, eventNames = []) {
    if (typeof handler === 'function') entry.handlers.add(handler);
    const offs = [];
    for (const evName of eventNames) {
      const fn = (ev) => handler && handler(ev, evName);
      entry.es.addEventListener(evName, fn);
      offs.push(() => entry.es.removeEventListener(evName, fn));
    }
    return () => {
      if (typeof handler === 'function') entry.handlers.delete(handler);
      offs.forEach((off) => off());
    };
  }

  function close() {
    entry.refs -= 1;
    if (entry.refs <= 0) {
      try { entry.es.close(); } catch {}
      pool.delete(key);
    }
  }

  return { es: entry.es, subscribe, close, key };
}

export const SSE = { open };
