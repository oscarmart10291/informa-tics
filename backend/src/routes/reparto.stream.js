// backend/src/routes/reparto.stream.js
const express = require('express');
const router = express.Router();

const clients = new Set();

router.get('/reparto/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders();
  res.write('event: ping\ndata: "ok"\n\n');

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

module.exports = router;
module.exports.broadcast = broadcast;
