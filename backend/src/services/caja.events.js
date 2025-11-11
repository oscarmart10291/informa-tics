// backend/src/services/caja.events.js
const clients = new Set();

function addCajaClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

function broadcastCaja(evt) {
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

module.exports = { addCajaClient, broadcastCaja };
