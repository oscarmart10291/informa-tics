// backend/src/routes/ordenes.cocina.routes.js
const express = require("express");
const { PrismaClient } = require("../generated/prisma");
const {
  rebalanceAssignments,
  promoteNextForChef,
  reassignItemToAnotherChef,
} = require("../services/cocina.assigner");
const { evaluatePedidoForDelivery } = require("../services/pedido.delivery");
const { notifyPedidoListoParaEntrega } = require("../services/repartidor.notify"); // 👈 NUEVO
const { sendEmail } = require("../services/email");
const { broadcast } = require("../services/notificaciones.sse"); // SSE

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

/** Decora el item con esperaMin + mesaText y expone tipoEntrega desde pedidoCliente */
const decorateItem = (it) => {
  if (!it) return null;
  // ⏱️ medir desde el inicio REAL si existe
  const desde = it.preparandoEn ?? it.asignadoEn ?? it.creadoEn;
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

// ===== Heartbeat / Activar
router.post("/heartbeat", async (req, res) => {
  const chefId = Number(req.body?.chefId);
  if (!chefId) return res.status(400).json({ error: "chefId requerido" });

  await prisma.cocinaChef.upsert({
    where: { chefId },
    update: { activo: true, lastSeen: new Date() },
    create: { chefId, activo: true, lastSeen: new Date() },
  });

  await rebalanceAssignments();
  await promoteNextForChef(chefId);
  res.json({ ok: true });
});

// ===== Desactivar
router.post("/desactivar", async (req, res) => {
  const chefId = Number(req.body?.chefId);
  if (!chefId) return res.status(400).json({ error: "chefId requerido" });

  await prisma.cocinaChef.updateMany({
    where: { chefId },
    data: { activo: false, lastSeen: new Date() },
  });

  await rebalanceAssignments();
  res.json({ ok: true });
});

router.get("/mis", async (req, res) => {
  try {
    const chefId = Number(req.query?.chefId ?? req.headers["x-chef-id"]);
    if (!chefId) return res.status(400).json({ error: "chefId requerido" });

    await prisma.cocinaChef.upsert({
      where: { chefId },
      update: { activo: true, lastSeen: new Date() },
      create: { chefId, activo: true, lastSeen: new Date() },
    });

    // 1) busca si hay uno PREPARANDO
    const actualPrep = await prisma.ordenItem.findFirst({
      where: { chefId, tipo: "PLATILLO", estado: "PREPARANDO" },
      orderBy: { preparandoEn: "asc" },
      include: {
        orden: { select: { codigo: true, mesa: true, pedidoCliente: { select: { tipoEntrega: true } } } },
      },
    });

    // 2) lista de ASIGNADOS (candidatos a “actual” si no hay preparando)
    const asignados = await prisma.ordenItem.findMany({
      where: { chefId, tipo: "PLATILLO", estado: "ASIGNADO" },
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
      // “promueve visualmente” el primero de la cola como ACTUAL (aún sin iniciar)
      actual = asignados[0];
      cola = asignados.slice(1);
    }

    res.json({
      actual: decorateItem(actual),
      cola: cola.map(decorateItem),
    });
  } catch (e) {
    console.error("GET /cocina/mis ->", e?.message, e?.stack);
    res.status(500).json({ error: "No se pudo cargar" });
  }
});


// ===== Aceptar
router.post("/items/:itemId/aceptar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const chefId = Number(req.body?.chefId);
  if (!itemId || !chefId) return res.status(400).json({ error: "Datos incompletos" });

  try {
    const item = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: { id: true, tipo: true, chefId: true, estado: true, asignadoEn: true, preparandoEn: true }
    });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
    if (item.tipo !== "PLATILLO") return res.status(400).json({ error: "Solo PLATILLO se cocina" });
    if (item.chefId && item.chefId !== chefId) return res.status(409).json({ error: "Ítem de otro chef" });
    if (item.estado !== "ASIGNADO") return res.status(400).json({ error: "El ítem no está en tu cola" });

    const ya = await prisma.ordenItem.count({ where: { chefId, estado: "PREPARANDO" } });
    if (ya > 0) return res.status(400).json({ error: "Ya estás preparando un platillo" });

    const now = new Date();
    const upd = await prisma.ordenItem.update({
      where: { id: itemId },
      data: {
        chefId,
        estado: "PREPARANDO",
        asignadoEn: item.asignadoEn ?? now,       // por si venía vacío
        preparandoEn: item.preparandoEn ?? now,   // ⏱️ INICIO REAL (primera vez)
      },
    });

    res.json({ mensaje: "En preparación", item: upd });
  } catch (e) {
    console.error("POST /items/:id/aceptar ->", e?.message);
    res.status(500).json({ error: "No se pudo aceptar" });
  }
});

// ===== Empezar (sin pasar por "Aceptar")
router.post("/items/:itemId/preparar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const chefId = Number(req.body?.chefId) || null; // opcional
  if (!itemId) return res.status(400).json({ error: "itemId requerido" });

  try {
    const it = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: { id: true, tipo: true, estado: true, preparandoEn: true, asignadoEn: true, creadoEn: true }
    });
    if (!it) return res.status(404).json({ error: "Ítem no encontrado" });
    if (it.tipo !== "PLATILLO") return res.status(400).json({ error: "Solo PLATILLO se cocina" });

    const now = new Date();
    const upd = await prisma.ordenItem.update({
      where: { id: itemId },
      data: {
        chefId: chefId ?? undefined,
        estado: "PREPARANDO",
        asignadoEn: it.asignadoEn ?? now,
        preparandoEn: it.preparandoEn ?? now, // ⏱️ sello REAL de inicio
      },
    });

    res.json({ mensaje: "Preparación iniciada", item: upd });
  } catch (e) {
    console.error("POST /cocina/items/:id/preparar ->", e?.message);
    res.status(500).json({ error: "No se pudo iniciar preparación" });
  }
});

// ===== Rechazar
router.post("/items/:itemId/rechazar", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const chefId = Number(req.body?.chefId);
  if (!itemId || !chefId) return res.status(400).json({ error: "Datos incompletos" });

  try {
    const item = await prisma.ordenItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
    if (item.chefId && item.chefId !== chefId) return res.status(409).json({ error: "Ítem de otro chef" });

    await prisma.ordenItem.update({
      where: { id: itemId },
      data: { chefId: null, estado: "PENDIENTE", asignadoEn: null },
    });

    const reasignado = await reassignItemToAnotherChef(itemId, chefId);
    await promoteNextForChef(chefId);

    res.json({
      mensaje: reasignado
        ? "Rechazado y enviado a otro cocinero"
        : "Rechazado: queda en espera hasta que otro cocinero tenga espacio",
    });
  } catch (e) {
    console.error("POST /items/:id/rechazar ->", e?.message);
    res.status(500).json({ error: "No se pudo rechazar" });
  }
});

// ===== Listo (NO cierra la orden; solo notifica si aplica)
router.patch("/items/:itemId/listo", async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!itemId) return res.status(400).json({ error: "itemId requerido" });

  try {
    // ⏱️ idempotencia + backfill seguro de inicio si faltara
    const it = await prisma.ordenItem.findUnique({
      where: { id: itemId },
      select: {
        id: true, ordenId: true, nombre: true, chefId: true,
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
            tipo: "PLATILLO",
          },
        });
      } catch (e) {
        console.error("No se pudo guardar MeseroNotif (cocina):", e?.message);
      }

      broadcast(`MESERO:${ord.meseroId}`, {
        type: "ITEM_LISTO",
        subtipo: "PLATILLO",
        ordenId: ord.id,
        codigo: ord.codigo,
        itemId: upd.id,
        itemNombre: upd.nombre,
        creadoEn: new Date().toISOString()
      });
    }

    const restantes = await prisma.ordenItem.count({
      where: { ordenId: upd.ordenId, estado: { not: "LISTO" } },
    });

    if (restantes === 0) {
      // 1) Evalúa la orden para reparto/recoger
      try {
        const evalRes = await evaluatePedidoForDelivery(upd.ordenId);

        // 1.1) Si quedó LISTO_PARA_ENTREGA, crear notif de Repartidor + broadcast SSE
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

      // 2) Enviar correo al cliente (si mantienes esta rama)
      try {
        const pedido = await prisma.pedidoCliente.findFirst({
          where: { ordenId: upd.ordenId },
          select: {
            id: true,
            codigo: true,
            clienteEmail: true,
            tipoEntrega: true,
            total: true,
            items: true,
          },
        });

        if (pedido && pedido.clienteEmail) {
          const esDom = up(pedido.tipoEntrega) === 'DOMICILIO';
          const html = `
            <div style="font-family:Segoe UI,Arial,sans-serif">
              <h2 style="margin:0 0 .25rem">¡Tu pedido #${pedido.codigo} está listo!</h2>
              <p style="margin:.25rem 0">
                ${esDom
                  ? 'Un repartidor pasará a recogerlo en el restaurante en breve.'
                  : 'Puedes pasar a recogerlo en el restaurante.'}
              </p>
              ${pedidoItemsHtml(pedido.items || [])}
              <p style="margin:.75rem 0; font-size:16px"><b>Total: ${Q(pedido.total)}</b></p>
            </div>`;

          await sendEmail({
            to: pedido.clienteEmail,
            subject: `Pedido #${pedido.codigo} ${esDom ? 'en espera de repartidor' : 'listo para recoger'}`,
            html,
          });
        }
      } catch (errMail) {
        console.error('✉️ No se pudo enviar correo de pedido listo:', errMail?.message);
      }
    }

    if (upd.chefId) await promoteNextForChef(upd.chefId);
    await rebalanceAssignments();

    res.json({ mensaje: "Ítem listo", item: upd });
  } catch (e) {
    console.error("PATCH /cocina/items/:id/listo ->", e?.message);
    res.status(500).json({ error: "No se pudo marcar listo" });
  }
});

// ===== Historial
router.get("/historial", async (req, res) => {
  const chefId = Number(req.query.chefId || req.headers["x-chef-id"]);
  if (!chefId) return res.status(400).json({ error: "chefId requerido" });

  try {
    const items = await prisma.ordenItem.findMany({
      where: { chefId, estado: "LISTO" },
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
    console.error("GET /cocina/historial", e);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

module.exports = router;
