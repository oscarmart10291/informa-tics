// backend/src/routes/sse.routes.js
const express = require("express");
const { sseHandler } = require("../services/notificaciones.sse");
const router = express.Router();

// Ejemplos:
// /sse?topic=COCINA
// /sse?topic=BARRA
// /sse?topic=MESERO&userId=123
router.get("/sse", sseHandler);

module.exports = router;