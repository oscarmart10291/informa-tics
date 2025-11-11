//Rol
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

// Obtener todos los roles
router.get("/", async (req, res) => {
  try {
    const roles = await prisma.rol.findMany();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener roles" });
  }
});

module.exports = router;