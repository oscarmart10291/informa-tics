// src/routes/reportes.dashboard.routes.js
const express = require("express");
const { PrismaClient, OrdenEstado } = require("../generated/prisma");

const prisma = new PrismaClient();
const router = express.Router();

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Estados “en proceso” reales de tu enum
const ESTADOS_EN_PROCESO = [
  OrdenEstado.EN_ESPERA,
  OrdenEstado.EN_PREPARACION,
  OrdenEstado.PENDIENTE_PAGO,
];

router.get("/dashboard-hoy", async (_req, res) => {
  try {
    const { start, end } = todayRange();

    /* =========================
       1) Tickets pagados HOY
       (trae orden para saber si fue en línea o local)
    ========================= */
    const ticketsHoy = await prisma.ticketVenta.findMany({
      where: { fechaPago: { gte: start, lte: end } },
      select: {
        id: true,
        totalAPagar: true,
        orden: { select: { id: true, pedidoCliente: { select: { id: true } } } },
      },
    });

    const ventasDia = Number(
      ticketsHoy.reduce((acc, t) => acc + Number(t.totalAPagar || 0), 0).toFixed(2)
    );

    // Desglose terminadas (por ticket del día)
    let ordenesTerminadasHoyLocal = 0;
    let ordenesTerminadasHoyOnline = 0;
    for (const t of ticketsHoy) {
      if (t.orden?.pedidoCliente) ordenesTerminadasHoyOnline++;
      else ordenesTerminadasHoyLocal++;
    }
    const ordenesTerminadasHoy =
      ordenesTerminadasHoyLocal + ordenesTerminadasHoyOnline;

    /* =========================
       2) Ítems vendidos HOY
    ========================= */
    const ticketIds = ticketsHoy.map((t) => t.id);
    let platillosVendidos = 0, bebidasVendidas = 0;
    let masVendidoPlatillo = null, masVendidoBebida = null;

    if (ticketIds.length) {
      const items = await prisma.ordenItem.findMany({
        where: { ticketVentaId: { in: ticketIds } },
        select: { qty: true, tipo: true, nombre: true },
      });

      const topPlat = new Map();
      const topBeb  = new Map();

      for (const it of items) {
        const q = Number(it.qty || 0);
        const n = it.nombre || "Desconocido";
        const tipo = String(it.tipo || "").toUpperCase();
        if (tipo === "BEBIDA" || tipo === "BEBIBLE") {
          bebidasVendidas += q;
          const cur = topBeb.get(n) || { nombre: n, qty: 0 };
          cur.qty += q; topBeb.set(n, cur);
        } else {
          platillosVendidos += q;
          const cur = topPlat.get(n) || { nombre: n, qty: 0 };
          cur.qty += q; topPlat.set(n, cur);
        }
      }

      const pick = (map) => { let best = null; for (const v of map.values()) if (!best || v.qty > best.qty) best = v; return best; };
      masVendidoPlatillo = pick(topPlat) || null;
      masVendidoBebida   = pick(topBeb)  || null;
    }

    /* =========================
       3) Usuarios activos (no Cliente)
    ========================= */
    const usuariosActivos = await prisma.usuario.count({
      where: { estado: true, rol: { nombre: { not: "Cliente" } } },
    });

    /* =========================
       4) Mesas + reservas (ventana 45 min)
    ========================= */
    const mesasBase = await prisma.mesa.findMany({
      select: { id: true, numero: true, estado: true },
      orderBy: { numero: "asc" },
    });

    const now = new Date();
    const ventanaMin = 45;
    const hasta = new Date(now.getTime() + ventanaMin * 60 * 1000);

    const reservas = await prisma.reserva.findMany({
      where: {
        estado: { in: ["PENDIENTE", "CONFIRMADA"] },
        OR: [
          { AND: [{ fechaHora: { lte: now } }, { hastaHora: { gte: now } }] },     // en curso
          { AND: [{ fechaHora: { gte: now } }, { fechaHora: { lte: hasta } }] },   // en ≤ 45 min
        ],
      },
      select: { mesaId: true, fechaHora: true },
    });

    const proxPorMesa = new Map();
    for (const r of reservas) {
      const diffMin = Math.max(0, Math.round((r.fechaHora - now) / 60000));
      const prev = proxPorMesa.get(r.mesaId);
      if (prev === undefined || diffMin < prev) proxPorMesa.set(r.mesaId, diffMin);
    }

    const mesas = mesasBase.map(m => {
      let visualEstado = m.estado;
      let reservaEnMin = null;
      if (m.estado !== "OCUPADA" && proxPorMesa.has(m.id)) {
        visualEstado = "RESERVADA";
        reservaEnMin = proxPorMesa.get(m.id);
      }
      return { ...m, visualEstado, reservaEnMin };
    });

    const mesasOcupadas = mesas.filter(m => m.visualEstado === "OCUPADA").length;

    /* =========================
       5) Órdenes activas HOY (total y desglose)
    ========================= */
    const [ordenesActivasLocal, ordenesActivasOnline] = await Promise.all([
      prisma.orden.count({
        where: {
          fecha: { gte: start, lte: end },
          estado: { in: ESTADOS_EN_PROCESO },
          pedidoCliente: { is: null },
        },
      }),
      prisma.orden.count({
        where: {
          fecha: { gte: start, lte: end },
          estado: { in: ESTADOS_EN_PROCESO },
          pedidoCliente: { isNot: null },
        },
      }),
    ]);
    const ordenesActivas = ordenesActivasLocal + ordenesActivasOnline;

    /* =========================
       6) Órdenes activas por mesero (HOY)
    ========================= */
    const activasPorMesero = await prisma.orden.groupBy({
      by: ["meseroId"],
      where: {
        fecha: { gte: start, lte: end },
        estado: { in: ESTADOS_EN_PROCESO },
        meseroId: { not: null },
      },
      _count: { _all: true },
    });

    const idsMeseros = activasPorMesero.map(r => r.meseroId).filter(id => id !== null);
    const meseros = idsMeseros.length
      ? await prisma.usuario.findMany({
          where: { id: { in: idsMeseros } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombrePorId = new Map(meseros.map(m => [m.id, m.nombre]));
    const ordenesMesero = activasPorMesero
      .map(r => ({ meseroId: r.meseroId, nombre: nombrePorId.get(r.meseroId) || `#${r.meseroId}`, activas: r._count._all }))
      .sort((a, b) => b.activas - a.activas);

    /* =========================
       7) Cocina/Barra — KPIs de estado (HOY)
       (para dashboard: pendientes, asignados, preparando por tipo)
    ========================= */
    const [
      // PLATILLOS
      platillosPendientesHoy,
      platillosAsignadosHoy,
      platillosPreparandoseHoy,
      // BEBIDAS
      bebidasPendientesHoy,
      bebidasAsignadasHoy,
      bebidasPreparandoseHoy,
    ] = await Promise.all([
      prisma.ordenItem.count({
        where: {
          tipo: "PLATILLO",
          estado: "PENDIENTE",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),
      prisma.ordenItem.count({
        where: {
          tipo: "PLATILLO",
          estado: "ASIGNADO",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),
      prisma.ordenItem.count({
        where: {
          tipo: "PLATILLO",
          estado: "PREPARANDO",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),

      prisma.ordenItem.count({
        where: {
          tipo: "BEBIDA",
          estado: "PENDIENTE",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),
      prisma.ordenItem.count({
        where: {
          tipo: "BEBIDA",
          estado: "ASIGNADO",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),
      prisma.ordenItem.count({
        where: {
          tipo: "BEBIDA",
          estado: "PREPARANDO",
          orden: { fecha: { gte: start, lte: end }, estado: { in: ESTADOS_EN_PROCESO } },
        },
      }),
    ]);

    /* =========================
       Respuesta
       (incluye tanto campos directos como objetos kpis* para frontend)
    ========================= */
    res.json({
      ventasDia,
      platillosVendidos,
      bebidasVendidas,
      masVendidoPlatillo,
      masVendidoBebida,

      usuariosActivos,
      mesasOcupadas,
      mesas,

      ordenesActivas,
      ordenesActivasLocal,
      ordenesActivasOnline,

      // terminadas (hoy)
      ordenesTerminadasHoy,
      ordenesTerminadasHoyLocal,
      ordenesTerminadasHoyOnline,

      // por mesero
      ordenesMesero,

      // ====== Cocina (platillos)
      platillosPendientesHoy,
      platillosAsignadosHoy,
      platillosPreparandoseHoy,
      kpisCocina: {
        pendientes: platillosPendientesHoy,
        asignados:  platillosAsignadosHoy,
        preparando: platillosPreparandoseHoy,
      },

      // ====== Barra (bebidas)
      bebidasPendientesHoy,
      bebidasAsignadasHoy,
      bebidasPreparandoseHoy,
      kpisBarra: {
        pendientes: bebidasPendientesHoy,
        asignados:  bebidasAsignadasHoy,
        preparando: bebidasPreparandoseHoy,
      },
    });
  } catch (e) {
    console.error("[GET /reportes/dashboard-hoy] error:", e);
    res.status(500).json({ error: "Error generando dashboard de hoy", detail: String(e?.message || e) });
  }
});

module.exports = router;
