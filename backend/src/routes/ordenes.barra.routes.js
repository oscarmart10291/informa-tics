// backend/src/routes/ordenes.barra.routes.js
const express = require("express");
const { PrismaClient } = require("../generated/prisma");
const {
  rebalanceAssignmentsBarra,
  promoteNextForBartender,
  reassignItemToAnotherBartender,
} = require("../services/barra.assigner");
const { evaluatePedidoForDelivery } = require("../services/pedido.delivery");
const { notifyPedidoListoParaEntrega } = require("../services/repartidor.notify");
const { sendEmail } = require("../services/email");
// Ojo: usamos sólo broadcast aquí; si tienes subscribe en notificaciones.sse, puedes
// cambiar el handler de /stream (abajo) para usarlo.
const { broadcast } = require("../services/notificaciones.sse");

const prisma = new PrismaClient();
const router = express.Router();

const up = (s='') => String(s||'').toUpperCase();
const Q  = (n) => `Q${Number(n||0).toFixed(2)}`;
const mesaText = (orden) =>
  orden?.mesa && Number(orden.mesa) > 0 ? `Mesa ${orden.mesa}` : "Pedido en línea";

function pedidoItemsHtml(items = []) {
  if (!items.length) return '<p><em>Sin productos</em></p>';
  const rows = items.map(i => `
    <tr>
      <td style="padding:.25rem .5rem">${i.qty ?? 1}× ${i.nombre}${i.nota ? ` <em style="color:#64748b">(nota: ${i.nota})</em>` : ''}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(i.precio)}</td>
      <td style="padding:.25rem .5rem; text-align:right">${Q(Number(i.precio) * Number(i.qty || 1))}</td>
    </tr>
  `).join('');
  return `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#f8fafc">
          <th align="left"  style="padding:.4rem .5rem">Producto</th>
          <th align="right" style="padding:.4rem .5rem">Precio</th>
          <th align="right" style="padding:.4rem .5rem">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/** Decora con esperaMin, mesaText y expone tipoEntrega (de orden.pedidoCliente) */
const decorateItem = (it) => {
  if (!it) return null;
  const desde = it.preparandoEn ?? it.asignadoEn ?? it.creadoEn; // ⏱️ inicio real si existe
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000));
  const mText = mesaText(it.orden);
  const tipoEntrega = it.orden?.pedidoCliente?.tipoEntrega || null;

  return {
    ...it,
    esperaMin: minutos,
    mesaText: mText,
    tipoEntrega,
    orden: it.orden ? { ...it.orden, mesaText: mText } : null,
  };
};

// ===== SSE (opcional) para evitar 404 en el frontend =====
router.get("/stream", (_req, res) => res.sendStatus(204));
// Si tienes subscribe en notificaciones.sse, usa esto en vez del 204:
// const { subscribe } = require("../services/notificaciones.sse");
// router.get("/stream", subscribe);

// ===== Heartbeat / Activar
router.post("/heartbeat", async (req, res) => {
  const bartenderId = Number(req.body?.bartenderId);
  if (!bartenderId) return res.status(400).json({ error: "bartenderId requerido" });

  await prisma.barraBartender.upsert({
    where: { bartenderId },
    update: { activo: true, lastSeen: new Date() },
    create: { bartenderId, activo: true, lastSeen: new Date() },
  });

  await rebalanceAssignmentsBarra();
  await promoteNextForBartender(bartenderId);
  res.json({ ok: true });
});

// ===== Desactivar
router.post("/desactivar", async (req, res) => {
  const bartenderId = Number(req.body?.bartenderId);
  if (!bartenderId) return res.status(400).json({ error: "bartenderId requerido" });

  await prisma.barraBartender.updateMany({
    where: { bartenderId },
    data: { activo: false, lastSeen: new Date() },
  });

  await rebalanceAssignmentsBarra();
  res.json({ ok: true });
});

router.get("/mis", async (req, res) => {
  try {
    const bartenderId = Number(req.query?.bartenderId ?? req.headers["x-bartender-id"]);
    if (!bartenderId) return res.status(400).json({ error: "bartenderId requerido" });

    await prisma.barraBartender.upsert({
      where: { bartenderId },
      update: { activo: true, lastSeen: new Date() },
      create: { bartenderId, activo: true, lastSeen: new Date() },
    });

    const actualPrep = await prisma.ordenItem.findFirst({
      where: { bartenderId, tipo: "BEBIDA", estado: "PREPARANDO" },
      orderBy: { preparandoEn: "asc" },
      include: {
        orden: { select: { codigo: true, mesa: true, pedidoCliente: { select: { tipoEntrega: true } } } },
      },
    });

    const asignados = await prisma.ordenItem.findMany({
      where: { bartenderId, tipo: "BEBIDA", estado: "ASIGNADO" },
      orderBy: { asignadoEn: "asc" },
      include: {
        orden: { select: { codigo: true, mesa: true, pedidoCliente: { select: { tipoEntrega: true } } } },
      },
      take: 50,
    });

    let actual = null;
    let cola = asignados;
    if (actualPrep) {
      actual = actualPrep;
    } else if (asignados.length > 0) {
      actual = asignados[0];
      cola = asignados.slice(1);
    }

    res.json({
      actual: decorateItem(actual),
      cola: cola.map(decorateItem),
    });
  } catch (e) {
    console.error("GET /barra/mis ->", e?.message, e?.stack);
    res.status(500).json({ error: "No se pudo cargar" });
  }
});

// ===== Aceptar (ASIGNADO -> PREPARANDO)
router.post("/items/:itemId/aceptar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const bartenderId = Number(req.body?.bartenderId);
  if (!itemId || !bartenderId) return res.status(400).json({ error: "Datos incompletos" });

  try {
    const item = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: { id: true, tipo: true, bartenderId: true, estado: true, asignadoEn: true, preparandoEn: true }
    });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
    if (item.tipo !== "BEBIDA") return res.status(400).json({ error: "Solo BEBIDA se atiende en barra" });
    if (item.bartenderId && item.bartenderId !== bartenderId) return res.status(409).json({ error: "Ítem de otro bartender" });
    if (item.estado !== "ASIGNADO") return res.status(400).json({ error: "El ítem no está en tu cola" });

    const ya = await prisma.ordenItem.count({ where: { bartenderId, estado: "PREPARANDO" } });
    if (ya > 0) return res.status(400).json({ error: "Ya estás preparando una bebida" });

    const now = new Date();
    const upd = await prisma.ordenItem.update({
      where: { id: itemId },
      data: {
        bartenderId,
        estado: "PREPARANDO",
        asignadoEn: item.asignadoEn ?? now,
        preparandoEn: item.preparandoEn ?? now, // ⏱️ INICIO REAL (primera vez)
      },
    });

    res.json({ mensaje: "En preparación", item: upd });
  } catch (e) {
    console.error("POST /barra/items/:id/aceptar ->", e?.message);
    res.status(500).json({ error: "No se pudo aceptar" });
  }
});

// ===== Empezar SIN pasar por "Aceptar" — IDEMPOTENTE (como cocina)  ✅
router.post("/items/:itemId/preparar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const bartenderId = Number(req.body?.bartenderId) || null; // opcional
  if (!itemId) return res.status(400).json({ error: "itemId requerido" });

  try {
    const it = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: {
        id: true, tipo: true, estado: true, bartenderId: true,
        preparandoEn: true, asignadoEn: true, creadoEn: true
      }
    });
    if (!it) return res.status(404).json({ error: "Ítem no encontrado" });
    if (it.tipo !== "BEBIDA") return res.status(400).json({ error: "Solo BEBIDA se atiende en barra" });

    // Idempotencia: NO devolvemos 400 si ya estaba en PREPARANDO.
    // Sólo verificamos pertenencia si se envía bartenderId.
    if (bartenderId && it.bartenderId && it.bartenderId !== bartenderId) {
      return res.status(409).json({ error: "Ítem de otro bartender" });
    }

    const now = new Date();
    const upd = await prisma.ordenItem.update({
      where: { id: itemId },
      data: {
        bartenderId: bartenderId ?? it.bartenderId ?? null,
        estado: "PREPARANDO",
        asignadoEn: it.asignadoEn ?? now,
        // ⏱️ sello de inicio REAL, pero no lo pisamos si ya existía
        preparandoEn: it.preparandoEn ?? now,
      },
    });

    res.json({ mensaje: "Preparación iniciada", item: upd });
  } catch (e) {
    console.error("POST /barra/items/:id/preparar ->", e?.message);
    res.status(500).json({ error: "No se pudo iniciar preparación" });
  }
});

// ===== Rechazar (SOLO si sigue ASIGNADO)
router.post("/items/:itemId/rechazar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const bartenderId = Number(req.body?.bartenderId);
  if (!itemId || !bartenderId) return res.status(400).json({ error: "Datos incompletos" });

  try {
    const item = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: { id: true, estado: true, bartenderId: true }
    });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado" });

    // No permitir rechazar si ya está en curso
    if (item.estado === "PREPARANDO") {
      return res.status(400).json({ error: "No se puede rechazar un ítem ya iniciado" });
    }
    if (item.estado !== "ASIGNADO") {
      return res.status(400).json({ error: "El ítem no está en estado asignado" });
    }

    if (item.bartenderId && item.bartenderId !== bartenderId) {
      return res.status(409).json({ error: "Ítem de otro bartender" });
    }

    await prisma.ordenItem.update({
      where: { id: itemId },
      data: { bartenderId: null, estado: "PENDIENTE", asignadoEn: null },
    });

    const reasignado = await reassignItemToAnotherBartender(itemId, bartenderId);
    await promoteNextForBartender(bartenderId);

    res.json({
      mensaje: reasignado
        ? "Rechazado y enviado a otro bartender"
        : "Rechazado: queda en espera hasta que otro bartender tenga espacio",
    });
  } catch (e) {
    console.error("POST /barra/items/:id/rechazar ->", e?.message);
    res.status(500).json({ error: "No se pudo rechazar" });
  }
});

// ===== Listo (NO cierra la orden; notifica si aplica)
router.patch("/items/:itemId/listo", async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!itemId) return res.status(400).json({ error: "itemId requerido" });

  try {
    // Idempotencia + backfill seguro de inicio si faltara
    const it = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: {
        id: true, ordenId: true, nombre: true, bartenderId: true,
        finalizadoEn: true, preparandoEn: true, asignadoEn: true, creadoEn: true
      }
    });
    if (!it) return res.status(404).json({ error: "Ítem no encontrado" });

    const data = {
      estado: "LISTO",
      finalizadoEn: it.finalizadoEn ?? new Date(),
    };
    const upd = await prisma.ordenItem.update({ where: { id: itemId }, data });

    // Notificación al mesero (BD + SSE)
    const ord = await prisma.orden.findUnique({
      where: { id: upd.ordenId },
      select: { id: true, codigo: true, meseroId: true }
    });
    if (ord?.meseroId) {
      try {
        await prisma.meseroNotif.create({
          data: {
            meseroId: ord.meseroId,
            ordenId: ord.id,
            itemNombre: upd.nombre,
            tipo: "BEBIDA",
          },
        });
      } catch (e) {
        console.error("No se pudo guardar MeseroNotif (barra):", e?.message);
      }

      broadcast(`MESERO:${ord.meseroId}`, {
        type: "ITEM_LISTO",
        subtipo: "BEBIDA",
        ordenId: ord.id,
        codigo: ord.codigo,
        itemId: upd.id,
        itemNombre: upd.nombre,
        creadoEn: new Date().toISOString()
      });
    }

    // Si TODOS los ítems de la orden están listos, evaluar DOMICILIO/LOCAL
    const restantes = await prisma.ordenItem.count({
      where: { ordenId: upd.ordenId, estado: { not: "LISTO" } },
    });

    if (restantes === 0) {
      try {
        const evalRes = await evaluatePedidoForDelivery(upd.ordenId);

        if (evalRes?.changed && evalRes?.set === "LISTO_PARA_ENTREGA") {
          const pedido = await prisma.pedidoCliente.findFirst({
            where: { ordenId: upd.ordenId },
          });
          if (pedido) {
            const notif = await notifyPedidoListoParaEntrega(pedido);
            broadcast("REPARTIDOR", {
              type: "NUEVO_PEDIDO_REPARTO",
              notifId: notif.id,
              pedidoId: pedido.id,
              codigo: pedido.codigo,
              total: pedido.total,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error("evaluatePedidoForDelivery fallo:", err?.message);
      }
    }

    if (upd.bartenderId) await promoteNextForBartender(upd.bartenderId);
    await rebalanceAssignmentsBarra();

    res.json({ mensaje: "Ítem listo", item: upd });
  } catch (e) {
    console.error("PATCH /barra/items/:id/listo ->", e?.message);
    res.status(500).json({ error: "No se pudo marcar listo" });
  }
});

// ===== Historial
router.get("/historial", async (req, res) => {
  const bartenderId = Number(req.query.bartenderId || req.headers["x-bartender-id"]);
  if (!bartenderId) return res.status(400).json({ error: "bartenderId requerido" });

  try {
    const items = await prisma.ordenItem.findMany({
      where: { bartenderId, estado: "LISTO" },
      orderBy: { finalizadoEn: "desc" },
      include: {
        orden: {
          select: {
            id: true,
            codigo: true,
            mesa: true,
            finishedAt: true,
            durationSec: true,
            pedidoCliente: { select: { tipoEntrega: true } },
          },
        },
      },
    });

    const decorated = items.map((it) => {
      const mText = mesaText(it.orden);
      const tipoEntrega = it.orden?.pedidoCliente?.tipoEntrega || null;
      return {
        ...it,
        mesaText: mText,
        tipoEntrega,
        orden: it.orden ? { ...it.orden, mesaText: mText } : null
      };
    });

    res.json(decorated);
  } catch (e) {
    console.error("GET /barra/historial", e);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

module.exports = router;
