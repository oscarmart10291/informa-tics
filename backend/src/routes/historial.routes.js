//Historial
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const historial = await prisma.historialModificacion.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        responsable: { select: { nombre: true } },
        platillo: { select: { nombre: true } },
        usuario: { select: { nombre: true } }
      }
    });
    res.json(historial);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

module.exports = router;
