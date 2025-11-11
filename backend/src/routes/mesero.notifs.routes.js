//src/routes/mesero.notifis.routes.js
const express = require("express");
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const router = express.Router();

// GET /mesero/notifs?meseroId=123&limit=20
router.get("/", async (req, res) => {
  try {
    const meseroId = req.query.meseroId ? Number(req.query.meseroId) : null;
    const limit = Math.min(100, Number(req.query.limit || 20));

    const where = meseroId
      ? { OR: [{ meseroId }, { meseroId: null }] }
      : {};

    const notifs = await prisma.meseroNotif.findMany({
      where,
      orderBy: [{ visto: "asc" }, { creadoEn: "desc" }],
      include: { orden: { select: { codigo: true, mesa: true } } },
      take: limit,
    });

    res.json(notifs);
  } catch (e) {
    console.error("GET /mesero/notifs ->", e);
    res.status(500).json({ error: "No se pudieron cargar notificaciones" });
  }
});

// PATCH /mesero/notifs/:id/visto
router.patch("/:id/visto", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const n = await prisma.meseroNotif.update({
      where: { id },
      data: { visto: true },
    });
    res.json(n);
  } catch (e) {
    console.error("PATCH /mesero/notifs/:id/visto ->", e);
    res.status(500).json({ error: "No se pudo marcar como vista" });
  }
});

// PATCH /mesero/notifs/visto-todas?meseroId=123
router.patch("/visto-todas", async (req, res) => {
  try {
    const meseroId = req.query.meseroId ? Number(req.query.meseroId) : null;
    const where = meseroId
      ? { visto: false, OR: [{ meseroId }, { meseroId: null }] }
      : { visto: false };

    const { count } = await prisma.meseroNotif.updateMany({
      where,
      data: { visto: true },
    });

    res.json({ ok: true, count });
  } catch (e) {
    console.error("PATCH /mesero/notifs/visto-todas ->", e);
    res.status(500).json({ error: "No se pudieron marcar todas como vistas" });
  }
});

module.exports = router;
