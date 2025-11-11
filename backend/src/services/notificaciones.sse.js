// backend/src/services/notificaciones.sse.js

/**
 * Gestor de canales SSE por "topic".
 * topic -> Set(res). Ej: "REPARTIDOR", "REPARTIDOR:12", "MESERO:5", etc.
 */

const express = require("express");
const sseRouter = express.Router();

const topics = new Map();

/* ==================== Utils internas ==================== */
function ensureTopic(t) {
  if (!topics.has(t)) topics.set(t, new Set());
  return topics.get(t);
}

function removeClient(topic, res) {
  const set = topics.get(topic);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) topics.delete(topic);
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify({ error: "unserializable", type: typeof obj });
  }
}

function addClient(topic, res) {
  const set = ensureTopic(topic);
  set.add(res);

  // Limpieza idempotente
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeClient(topic, res);
  };

  res.on("close", cleanup);
  res.on("finish", cleanup);
  res.on("error", cleanup);
  res.on("end", cleanup);

  return set.size;
}

/* ==================== Broadcasts ==================== */
function _emitRaw(topic, payload) {
  const set = topics.get(topic);
  if (!set || set.size === 0) return 0;
  for (const res of set) res.write(payload); // 👈 sin await, no bloquea
  return set.size;
}

/** Broadcast simple (solo data) */
function broadcast(topic, data) {
  const payload = `data: ${safeStringify(data)}\n\n`;
  return _emitRaw(topic, payload);
}

/** Broadcast con nombre de evento */
function broadcastEvent(topic, event, data) {
  const payload =
    `event: ${String(event)}\n` +
    `data: ${safeStringify(data)}\n\n`;
  return _emitRaw(topic, payload);
}

/* ==================== Handler SSE ==================== */
/**
 * Soporta:
 *   /sse?topic=REPARTIDOR
 *   /sse?topic=REPARTIDOR&scoped=1&userId=12
 *   /sse?topic=MESERO&scoped=1&userId=5
 */
function sseHandler(req, res) {
  try {
    const topicParam = (req.query.topic || "").toString().trim().toUpperCase();
    if (!topicParam) return res.status(400).end("topic requerido");

    const scoped = String(req.query.scoped || "") === "1";
    const needsUser = ["MESERO", "CLIENTE", "REPARTIDOR"].includes(topicParam) && scoped;

    let userId = req.query.userId != null ? Number(req.query.userId) : null;
    if (needsUser && (!userId || Number.isNaN(userId))) {
      return res.status(400).end("userId requerido");
    }

    // Topic final
    const t = needsUser ? `${topicParam}:${userId}` : topicParam;

    // ===== CORS (crítico para SSE si front y API no son mismo origen)
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); // para proxies
    // Si decides usar cookies/sesión en SSE, habilita lo de abajo y NO uses "*"
    // res.setHeader("Access-Control-Allow-Credentials", "true");

    // Cabeceras SSE
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Nginx: deshabilita el buffering
    });

    // Recomendar reconexión automática
    res.write(`retry: 10000\n`);

    // Forzar el envío de cabeceras (si existe)
    res.flushHeaders?.();

    // Mensaje inicial y alta del cliente
    res.write(`event: ready\ndata: ${safeStringify({ ok: true, topic: t })}\n\n`);
    addClient(t, res);

    // Heartbeat
    const hb = setInterval(() => {
      res.write(`event: ping\ndata: {}\n\n`);
    }, 25000);

    const stop = () => clearInterval(hb);
    res.on("close", stop);
    res.on("finish", stop);
    res.on("error", stop);
    res.on("end", stop);
  } catch (err) {
    console.error("[SSE] handler error:", err);
    try { res.end(); } catch {}
  }
}

/* Montaje del handler en el Router */
sseRouter.get("/sse", sseHandler);

/* ==================== Helpers de dominio ==================== */
function notifyRepartidores(event, payload) {
  return broadcastEvent("REPARTIDOR", event, payload);
}

function notifyRepartidor(userId, event, payload) {
  return broadcastEvent(`REPARTIDOR:${Number(userId)}`, event, payload);
}

function notifyMesero(userId, event, payload) {
  return broadcastEvent(`MESERO:${Number(userId)}`, event, payload);
}

function notifyCliente(userId, event, payload) {
  return broadcastEvent(`CLIENTE:${Number(userId)}`, event, payload);
}

/* ==================== Debug helpers ==================== */
function topicSize(topic) {
  const set = topics.get(topic);
  return set ? set.size : 0;
}

function listTopics() {
  return Array.from(topics.keys());
}

/* ==================== Exports ==================== */
module.exports = {
  // Express
  sseRouter,
  sseHandler,

  // Core broadcast
  broadcast,
  broadcastEvent,
  addClient,

  // Dominio
  notifyRepartidores,
  notifyRepartidor,
  notifyMesero,
  notifyCliente,

  // Debug
  topicSize,
  listTopics,
};
