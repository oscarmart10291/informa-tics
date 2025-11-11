//backend/src/routes/tipocambio.routes.js
const express = require('express');
const router = express.Router();
const { getTipoCambio } = require('../services/tipocambio.banguat');

router.get('/tipo-cambio', async (_req, res) => {
  try {
    const data = await getTipoCambio();
    res.json(data);
  } catch (e) {
    console.error('TipoCambio error:', e?.message || e);
    res.status(503).json({
      error: 'No disponible',
      detail: e?.message || String(e),
      code: e?.code || 'TC_ERROR',
    });
  }
});

module.exports = router;
