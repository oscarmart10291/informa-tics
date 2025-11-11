// src/routes/auth.change.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const { isStrongPassword, policyMessage, isReusedPassword } = require('../utils/passwordPolicy');

/**
 * POST /auth/change-password
 * body: { userId, actual, nueva }
 */
router.post('/change-password', async (req, res) => {
  try {
    const { userId, actual, nueva } = req.body;

    const u = await prisma.usuario.findUnique({
      where: { id: Number(userId) },
      include: { passwordHistory: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!u || !u.contrasena) return res.status(400).json({ ok: false, error: 'Usuario inválido' });

    const ok = await bcrypt.compare(actual, u.contrasena);
    if (!ok) return res.status(401).json({ ok: false, error: 'Contraseña actual incorrecta' });

    if (!isStrongPassword(nueva)) {
      return res.status(400).json({ ok: false, error: policyMessage() });
    }

    const lastHashes = [{ hash: u.contrasena }, ...(u.passwordHistory || [])].slice(0, 5);
    if (await isReusedPassword(nueva, lastHashes)) {
      return res.status(400).json({ ok: false, error: 'No puedes reutilizar ninguna de tus últimas 5 contraseñas.' });
    }

    const hash = await bcrypt.hash(nueva, 12);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: u.id },
        data: { contrasena: hash, debeCambiarPassword: false },
      });

      await tx.passwordHistory.create({
        data: { userId: u.id, hash },
      });

      const sobran = await tx.passwordHistory.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
        skip: 5,
      });
      if (sobran.length) {
        await tx.passwordHistory.deleteMany({
          where: { id: { in: sobran.map(h => h.id) } },
        });
      }
    });

    res.json({ ok: true, message: 'Contraseña actualizada' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudo cambiar la contraseña' });
  }
});

module.exports = router;
