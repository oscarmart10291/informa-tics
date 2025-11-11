// src/routes/reporteria.mesas.js
const express = require('express')
const { usosDeMesas } = require('../services/reportes.mesas')

const router = express.Router()

// GET /reporteria/uso-mesas?scope=hoy|mes|anio|hist
router.get('/uso-mesas', async (req, res) => {
  try {
    const scope = req.query.scope || 'anio'
    const data = await usosDeMesas(scope)

    const top3 = data.slice(0, 3)
    const bottom3 = [...data].reverse().slice(0, 3)

    res.json({ porMesa: data, top3, bottom3 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'No se pudo calcular uso de mesas' })
  }
})

module.exports = router
