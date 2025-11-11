// backend/src/routes/ordenes.mesero.routes.js
const express = require("express");
const { PrismaClient, OrdenEstado } = require("../generated/prisma");
const { rebalanceAssignments } = require("../services/cocina.assigner");
const { rebalanceAssignmentsBarra } = require("../services/barra.assigner");
const { broadcastMesa } = require("../services/mesas.events");

// (Opcional) Notificación a Caja por SSE si tienes services/caja.events.js
let broadcastCaja = null;
try {
  ({ broadcastCaja } = require("../services/caja.events"));
} catch (_) {}

const prisma = new PrismaClient();
const router = express.Router();

/* ================== Helpers ================== */
const toNumOrNull = (v) =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v))
    ? null
    : Number(v);

const NORM = (s) => String(s || "").trim().toUpperCase();

/** Intenta obtener el “monto de la reserva” desde campos posibles del modelo. */
function getReservaMontoMinimo(reserva) {
  if (!reserva || typeof reserva !== "object") return 0;
  const candidatos = [
    "montoPagado",
    "totalPagado",
    "pagoMonto",
    "monto",
    "deposito",
    "anticipo",
    "importe",
    "precio",
    "costoReserva",
    "valor",
  ];
  for (const k of candidatos) {
    const v = Number(reserva?.[k]);
    if (Number.isFinite(v) && v > 0) return Number(v.toFixed(2));
  }
  return 0;
}

/** Reserva “cercana” o en curso para una mesa (CONFIRMADA/PAGADO). */
async function findReservaCercanaByMesaId(mesaId, { fromMins = -90, toMins = 240 } = {}) {
  const now = new Date();
  const from = new Date(now.getTime() + fromMins * 60 * 1000);
  const to   = new Date(now.getTime() + toMins * 60 * 1000);
  return prisma.reserva.findFirst({
    where: {
      mesaId,
      estado: "CONFIRMADA",
      pagoEstado: "PAGADO",
      fechaHora: { gte: from, lte: to },
    },
    orderBy: { fechaHora: "asc" },
  });
}

/** Libera mesas y cancela reservas vencidas no usadas. */
async function autoSweepReservasYMesas() {
  const now = new Date();

  // 1) Cancelar reservas CONFIRMADA/PAGADO vencidas que no se usaron
  const vencidas = await prisma.reserva.findMany({
    where: {
      estado: "CONFIRMADA",
      pagoEstado: "PAGADO",
      hastaHora: { lt: now },
      verificadaPorMeseroId: null,
      aplicadoEnOrdenId: null,
    },
    select: { id: true, mesaId: true },
  });

  if (vencidas.length) {
    const resIds = vencidas.map((r) => r.id);
    const mesasIds = [...new Set(vencidas.map((r) => r.mesaId))];

    await prisma.$transaction([
      prisma.reserva.updateMany({
        where: { id: { in: resIds } },
        data: {
          estado: "CANCELADA",
          canceladaEn: now,
          refundEstado: "RECHAZADO",
          refundMonto: 0,
          refundMotivo: "No se presentó (auto)",
        },
      }),
      prisma.mesa.updateMany({
        where: { id: { in: mesasIds }, estado: "RESERVADA" },
        data: { estado: "DISPONIBLE", reservadaPor: null },
      }),
    ]);

    try {
      mesasIds.forEach((mesaId) => broadcastMesa?.({ type: "mesa:liberada", mesaId }));
    } catch {}
  }

  // 2) Mesas RESERVADA pero sin reserva ACTIVA ahora -> liberar
  const mesasMarcadas = await prisma.mesa.findMany({
    where: { estado: "RESERVADA" },
    select: { id: true },
  });

  if (mesasMarcadas.length) {
    const activas = await prisma.reserva.findMany({
      where: {
        mesaId: { in: mesasMarcadas.map((m) => m.id) },
        estado: "CONFIRMADA",
        pagoEstado: "PAGADO",
        fechaHora: { lte: now },
        hastaHora: { gt: now },
      },
      select: { mesaId: true },
    });
    const setActivas = new Set(activas.map((a) => a.mesaId));
    const liberar = mesasMarcadas.filter((m) => !setActivas.has(m.id)).map((m) => m.id);

    if (liberar.length) {
      await prisma.mesa.updateMany({
        where: { id: { in: liberar } },
        data: { estado: "DISPONIBLE", reservadaPor: null },
      });
      try {
        liberar.forEach((mesaId) => broadcastMesa?.({ type: "mesa:liberada", mesaId }));
      } catch {}
    }
  }
}

/* ======== Reglas duras de reserva: mínimo por raciones (platillos) ======== */
function getPersonasFromReserva(r) {
  const cand = [
    r?.personas,
    r?.cantidadPersonas,
    r?.pax,
    r?.asistentes,
    r?.cantidad,
  ]
    .map(Number)
    .find((v) => Number.isFinite(v) && v > 0);
  return cand || 0;
}

/**
 * Enforce por raciones (si deseas mantenerlo):
 * si hay reserva, #PLATILLOS >= personas de la reserva.
 * - Si orden ya existe: cuenta ítems PLATILLO en DB.
 * - Si es creación en memoria: pasa { createItemsCount } (solo platillos).
 * Lanza Error 409 si no cumple.
 */
async function enforceReservaMinRaciones({ tx, reservaId, mesaNumero, ordenId = null, createItemsCount = null }) {
  if (!reservaId) return;
  const reserva = await tx.reserva.findUnique({ where: { id: Number(reservaId) } });
  if (!reserva) {
    const err = new Error("RESERVA_NO_ENCONTRADA");
    err.status = 404;
    throw err;
  }
  const now = new Date();
  if (
    !(
      reserva.estado === "CONFIRMADA" &&
      reserva.pagoEstado === "PAGADO" &&
      reserva.fechaHora <= now &&
      reserva.hastaHora >= now
    )
  ) {
    const err = new Error("RESERVA_NO_VIGENTE");
    err.status = 409;
    err.userMessage = "La reserva no está vigente en este momento.";
    throw err;
  }

  let raciones = 0;
  if (createItemsCount != null) {
    raciones = Number(createItemsCount);
  } else if (ordenId) {
    raciones = await tx.ordenItem.count({
      where: { ordenId: Number(ordenId), tipo: "PLATILLO" },
    });
  }

  const personas = getPersonasFromReserva(reserva);
  if (personas > 0 && raciones < personas) {
    const err = new Error("ORDEN_INSUFICIENTE_PARA_RESERVA");
    err.status = 409;
    err.details = { requeridas: personas, actuales: raciones, faltan: personas - raciones };
    err.userMessage = `La mesa tiene una reserva de ${personas} persona(s). Debes agregar al menos ${personas} platillo(s).`;
    throw err;
  }
}

/* ================== Listados ================== */
router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const qMeseroId = toNumOrNull(req.query?.meseroId);
    const where = {
      finishedAt: null,
      meseroId: { not: null },
      ...(qMeseroId ? { meseroId: qMeseroId } : {}),
    };

    const ordenes = await prisma.orden.findMany({
      where,
      orderBy: { fecha: "asc" },
      include: {
        mesero: { select: { id: true, nombre: true } },
        items: true,
      },
    });
    return res.json(ordenes);
  } catch (e) {
    console.error("GET /ordenes", e);
    return res.status(500).json({ error: "Error al obtener órdenes" });
  }
});

/** Sólo pendientes de orden (estado EN_ESPERA) */
router.get("/pendientes", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const qMeseroId = toNumOrNull(req.query?.meseroId);
    const where = {
      finishedAt: null,
      estado: OrdenEstado.EN_ESPERA,
      meseroId: { not: null },
      ...(qMeseroId ? { meseroId: qMeseroId } : {}),
    };

    const ordenes = await prisma.orden.findMany({
      where,
      orderBy: { fecha: "desc" },
      include: {
        mesero: { select: { id: true, nombre: true } },
        items: { where: { estado: "PENDIENTE" } },
      },
    });
    return res.json(ordenes);
  } catch (e) {
    console.error("GET /ordenes/pendientes", e);
    return res.status(500).json({ error: "Error al obtener pendientes" });
  }
});

/* ================== Historial de órdenes TERMINADAS (Mesero) ================== */
router.get("/historial", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const qMeseroId = toNumOrNull(req.query?.meseroId);
    const page      = Math.max(1, toNumOrNull(req.query?.page) || 1);
    const pageSize  = Math.min(100, Math.max(1, toNumOrNull(req.query?.pageSize) || 20));

    const parseYMD = (s) => {
      if (!s || typeof s !== "string") return null;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const hoy = new Date(); hoy.setHours(23,59,59,999);
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30); hace30.setHours(0,0,0,0);

    const desdeStr = String(req.query?.desde || "");
    const hastaStr = String(req.query?.hasta || "");

    const desdeIn = parseYMD(desdeStr) || hace30;
    const hastaIn = parseYMD(hastaStr) || hoy;

    const where = {
      meseroId: { not: null },
      finishedAt: {
        not: null,
        gte: desdeIn,
        lte: hastaIn,
      },
      ...(qMeseroId ? { meseroId: qMeseroId } : {}),
    };

    const total = await prisma.orden.count({ where });

    const ordenes = await prisma.orden.findMany({
      where,
      orderBy: { finishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        mesero: { select: { id: true, nombre: true } },
        items:  { select: { id: true, nombre: true, precio: true, tipo: true, estado: true, nota: true } },
      },
    });

    const data = ordenes.map(o => {
      const totalItems = (o.items || []).reduce((acc, it) => acc + Number(it.precio || 0), 0);
      return { ...o, totalItems: Number(totalItems.toFixed(2)) };
    });

    return res.json({
      total,
      page,
      pageSize,
      desde: desdeIn.toISOString(),
      hasta: hastaIn.toISOString(),
      data,
    });
  } catch (e) {
    console.error("GET /ordenes/historial", e);
    return res.status(500).json({ error: "Error al obtener el historial" });
  }
});

/* ================== Crear orden (con bloqueo por monto de reserva) ================== */
router.post("/", async (req, res) => {
  // 1) Validación de entrada
  let { mesa, meseroId, items, esClienteReservo, esReservante, reservaId } = req.body || {};
  mesa = toNumOrNull(mesa);
  meseroId = toNumOrNull(meseroId);
  const reservaIdNum = toNumOrNull(reservaId);

  const esRes = Boolean(esClienteReservo ?? esReservante ?? false);

  if (!mesa || !meseroId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Datos incompletos (mesa, meseroId, items[])" });
  }

  // 2) Normaliza items
  const itemsLimpios = items
    .map((it) => {
      const nombre = (it?.nombre ?? "").toString().trim();
      const precio = Number(it?.precio);
      const nota   = (it?.nota ?? "").toString().trim();
      const tipo   = NORM(it?.tipo) === "BEBIDA" ? "BEBIDA" : "PLATILLO";
      if (!nombre || Number.isNaN(precio)) return null;
      return { nombre, precio, nota: nota === "" ? null : nota, tipo, estado: "PENDIENTE" };
    })
    .filter(Boolean);

  if (itemsLimpios.length === 0) {
    return res.status(400).json({ error: "Items inválidos (falta nombre o precio)" });
  }

  const subtotal = Number(itemsLimpios.reduce((acc, it) => acc + Number(it.precio || 0), 0).toFixed(2));

  try {
    // 3) Verifica mesero
    const mesero = await prisma.usuario.findUnique({ where: { id: meseroId }, select: { id: true } });
    if (!mesero) return res.status(404).json({ error: `Mesero ${meseroId} no existe` });

    // 4) Verifica mesa y que no tenga orden abierta
    const mesaReg = await prisma.mesa.findUnique({
      where: { numero: mesa },
      select: { id: true, numero: true, estado: true },
    });
    if (!mesaReg) return res.status(404).json({ error: `La mesa ${mesa} no existe` });

    const existeAbierta = await prisma.orden.findFirst({
      where: { mesa, finishedAt: null },
      select: { id: true },
    });
    if (existeAbierta) return res.status(409).json({ error: `La mesa ${mesa} está ocupada` });

    // 5) Si el mesero indicó que SÍ es el reservante ⇒ validar contra monto de reserva
    let reservaOK = null;
    if (esRes) {
      reservaOK = reservaIdNum
        ? await prisma.reserva.findFirst({
            where: {
              id: reservaIdNum,
              mesaId: mesaReg.id,
              estado: "CONFIRMADA",
              pagoEstado: "PAGADO",
              aplicadoEnOrdenId: null,
            },
          })
        : await findReservaCercanaByMesaId(mesaReg.id);

      if (!reservaOK) {
        return res.status(404).json({ error: "No hay una reserva válida para esta mesa" });
      }

      // 🔒 Nuevo: mínimo de consumo = monto con el que reservó
      const minConsumoQ = getReservaMontoMinimo(reservaOK);
      if (minConsumoQ > 0 && subtotal < minConsumoQ) {
        return res
          .status(422)
          .json({ error: `Consumo mínimo Q${minConsumoQ.toFixed(2)} para ocupar la mesa reservada` });
      }
    }

    // 6) Crear orden + ocupar mesa (transacción) + (opcional) REGLA DE RACIONES
    const result = await prisma.$transaction(async (tx) => {
      // Conteo de PLATILLOS que vienen en esta creación (para regla de raciones si la mantienes)
      const createPlatillos = itemsLimpios.filter((d) => d.tipo === "PLATILLO").length;

      // Si hay reserva elegida y usas regla de raciones, valida ANTES con los items en memoria
      if (reservaOK) {
        await enforceReservaMinRaciones({
          tx,
          reservaId: reservaOK.id,
          mesaNumero: mesaReg.numero,
          createItemsCount: createPlatillos,
        });
      }

      const nueva = await tx.orden.create({
        data: {
          mesa,
          mesero: { connect: { id: meseroId } },
          estado: OrdenEstado.EN_ESPERA,
          items: {
            create: itemsLimpios.map((d) => ({
              nombre: d.nombre,
              precio: d.precio,
              nota: d.nota,
              tipo: d.tipo,
              estado: d.estado,
            })),
          },
        },
        include: { items: true },
      });

      await tx.mesa.update({ where: { numero: mesa }, data: { estado: "OCUPADA" } });

      if (reservaOK) {
        await tx.reserva.update({
          where: { id: reservaOK.id },
          data: { verificadaPorMeseroId: meseroId, verificadaEn: new Date() },
        });

        // Validación posterior (defensiva) de raciones si procede
        await enforceReservaMinRaciones({
          tx,
          reservaId: reservaOK.id,
          mesaNumero: mesaReg.numero,
          ordenId: nueva.id,
        });
      }

      return nueva;
    });

    // 7) responde
    res.status(201).json({ mensaje: "Orden registrada", orden: result });

    // 8) efectos en bg
    setImmediate(async () => {
      try {
        await Promise.allSettled([
          rebalanceAssignments(),      // cocina
          rebalanceAssignmentsBarra(), // barra
          (async () => {
            try {
              const m = await prisma.mesa.findUnique({ where: { numero: mesa } });
              if (m) broadcastMesa({ type: "mesa_occupy", mesa: m });
            } catch {}
          })(),
        ]);
      } catch (bgErr) {
        console.error("POST /ordenes side-effects:", bgErr);
      }
    });
  } catch (e) {
    console.error("POST /ordenes ERROR:", e?.message || e);
    if (e?.code === "P2003") return res.status(409).json({ error: "Violación de integridad (FK). Revisa meseroId." });
    if (e?.code === "P2002") return res.status(409).json({ error: "Conflicto de unique." });
    return res.status(e?.status || 500).json({ error: e?.userMessage || "Error al registrar la orden" });
  }
});

/* ================== Detalle para edición ================== */
router.get("/:id", async (req, res) => {
  const id = toNumOrNull(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });
  try {
    res.set("Cache-Control", "no-store");
    const orden = await prisma.orden.findUnique({
      where: { id },
      include: {
        mesero: { select: { id: true, nombre: true } },
        items: {
          select: { id: true, nombre: true, precio: true, nota: true, tipo: true, estado: true, chefId: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!orden) return res.status(404).json({ error: "Orden no encontrada" });
    return res.json(orden);
  } catch (e) {
    console.error("GET /ordenes/:id", e);
    return res.status(500).json({ error: "Error al obtener la orden" });
  }
});

/* ================== Resumen de mesas (con barrido de reservas vencidas) ================== */
router.get("/resumen", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    await autoSweepReservasYMesas();

    const now = new Date();

    const mesas = await prisma.mesa.findMany({
      orderBy: [{ numero: "asc" }],
      select: { id: true, numero: true, capacidad: true, estado: true, reservadaPor: true },
    });

    // Reservas ACTIVAS en este instante
    const reservasActivas = await prisma.reserva.findMany({
      where: {
        estado: "CONFIRMADA",
        pagoEstado: "PAGADO",
        fechaHora: { lte: now },
        hastaHora: { gt: now },
      },
      select: { mesaId: true, nombre: true },
    });

    const activasPorMesa = new Map();
    for (const r of reservasActivas) if (!activasPorMesa.has(r.mesaId)) activasPorMesa.set(r.mesaId, r.nombre);

    const out = mesas.map((m) => {
      if (m.estado === "OCUPADA") return m;
      const nombre = activasPorMesa.get(m.id) ?? null;
      const estado = nombre ? "RESERVADA" : "DISPONIBLE";
      return { ...m, estado, reservadaPor: nombre };
    });

    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "No se pudieron obtener las mesas" });
  }
});

/* ================== Apply / Items extra ================== */
router.post("/:id/apply", async (req, res) => {
  const id = toNumOrNull(req.params.id);
  const { add = [], deleteIds = [], update = [] } = req.body || {};
  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {
    const orden = await prisma.orden.findUnique({ where: { id }, select: { id: true } });
    if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

    await prisma.$transaction(async (tx) => {
      // Updates de nota permitidos (PENDIENTE o ASIGNADO)
      if (Array.isArray(update) && update.length) {
        const idsUpd = update.map((u) => Number(u.id)).filter(Boolean);
        if (idsUpd.length) {
          const cand = await tx.ordenItem.findMany({
            where: { id: { in: idsUpd }, ordenId: id },
            select: { id: true, tipo: true, estado: true },
          });

          const permitidos = new Set(
            cand
              .filter((it) => {
                const e = String(it.estado || "").toUpperCase();
                return e === "PENDIENTE" || e === "ASIGNADO";
              })
              .map((x) => x.id)
          );

          for (const u of update) {
            const uid = Number(u.id);
            if (!uid || !permitidos.has(uid)) continue;
            await tx.ordenItem.update({
              where: { id: uid },
              data: { nota: (u.nota ?? "") === "" ? null : String(u.nota) },
            });
          }
        }
      }

      // Eliminaciones permitidas (PENDIENTE o ASIGNADO)
      if (Array.isArray(deleteIds) && deleteIds.length) {
        const candidatos = await tx.ordenItem.findMany({
          where: { id: { in: deleteIds.map(Number) }, ordenId: id },
          select: { id: true, estado: true },
        });

        const allowedDeleteIds = candidatos
          .filter((it) => {
            const s = String(it.estado || "").toUpperCase();
            return s === "PENDIENTE" || s === "ASIGNADO";
          })
          .map((it) => it.id);

        if (allowedDeleteIds.length) {
          await tx.ordenItem.deleteMany({
            where: { id: { in: allowedDeleteIds }, ordenId: id },
          });
        }
      }

      // Altas (siempre permitidas)
      if (Array.isArray(add) && add.length) {
        await tx.ordenItem.createMany({
          data: add.map((it) => ({
            ordenId: id,
            nombre: it.nombre,
            precio: it.precio,
            nota: (it.nota ?? "") === "" ? null : it.nota,
            tipo: NORM(it.tipo) === "BEBIDA" ? "BEBIDA" : "PLATILLO",
            estado: "PENDIENTE",
          })),
        });
      }
    });

    // 🔒 Enforce raciones si hay reserva vigente en la mesa de esta orden
    const ord = await prisma.orden.findUnique({
      where: { id },
      select: { id: true, mesa: true },
    });
    if (ord) {
      const now = new Date();
      const mesaRow = await prisma.mesa.findUnique({ where: { numero: ord.mesa }, select: { id: true } });
      if (mesaRow) {
        const reservaVigente = await prisma.reserva.findFirst({
          where: {
            mesaId: mesaRow.id,
            estado: "CONFIRMADA",
            pagoEstado: "PAGADO",
            fechaHora: { lte: now },
            hastaHora: { gte: now },
          },
          select: { id: true },
        });
        if (reservaVigente) {
          await enforceReservaMinRaciones({
            tx: prisma,
            reservaId: reservaVigente.id,
            mesaNumero: ord.mesa,
            ordenId: id,
          });
        }
      }
    }

    try {
      await rebalanceAssignments();
      await rebalanceAssignmentsBarra();
    } catch (errAssign) {
      console.error("⚠️  rebalance falló:", errAssign?.message || errAssign);
    }

    const ordenActualizada = await prisma.orden.findUnique({
      where: { id },
      include: { mesero: { select: { nombre: true } }, items: true },
    });

    return res.json({ mensaje: "Cambios aplicados", orden: ordenActualizada });
  } catch (e) {
    console.error("POST /ordenes/:id/apply", e);
    return res.status(e?.status || 500).json({ error: e?.userMessage || "No se pudieron aplicar los cambios" });
  }
});

router.post("/:id/items", async (req, res) => {
  const id = toNumOrNull(req.params.id);
  const { items } = req.body;
  if (!id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Datos incompletos" });
  }
  try {
    const exists = await prisma.orden.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ error: "Orden no encontrada" });

    await prisma.ordenItem.createMany({
      data: items.map((it) => ({
        ordenId: id,
        nombre: it.nombre,
        precio: it.precio,
        nota: (it.nota ?? "") === "" ? null : it.nota,
        tipo: NORM(it.tipo) === "BEBIDA" ? "BEBIDA" : "PLATILLO",
        estado: "PENDIENTE",
      })),
    });

    // 🔒 Enforce raciones si hay reserva vigente
    const ord = await prisma.orden.findUnique({
      where: { id },
      select: { id: true, mesa: true },
    });
    if (ord) {
      const now = new Date();
      const mesaRow = await prisma.mesa.findUnique({ where: { numero: ord.mesa }, select: { id: true } });
      if (mesaRow) {
        const reservaVigente = await prisma.reserva.findFirst({
          where: {
            mesaId: mesaRow.id,
            estado: "CONFIRMADA",
            pagoEstado: "PAGADO",
            fechaHora: { lte: now },
            hastaHora: { gte: now },
          },
          select: { id: true },
        });
        if (reservaVigente) {
          await enforceReservaMinRaciones({
            tx: prisma,
            reservaId: reservaVigente.id,
            mesaNumero: ord.mesa,
            ordenId: id,
          });
        }
      }
    }

    try {
      await rebalanceAssignments();
      await rebalanceAssignmentsBarra();
    } catch (errAssign) {
      console.error("⚠️  rebalance falló:", errAssign?.message || errAssign);
    }

    const ordenActualizada = await prisma.orden.findUnique({
      where: { id },
      include: { mesero: { select: { nombre: true } }, items: true },
    });

    return res.json({ mensaje: "Items anexados", orden: ordenActualizada });
  } catch (e) {
    console.error("POST /ordenes/:id/items", e);
    return res.status(e?.status || 500).json({ error: e?.userMessage || "Error al anexar items" });
  }
});

/* ================== Eliminar orden ================== */
router.delete("/:id", async (req, res) => {
  const id = toNumOrNull(req.params.id);
  try {
    const orden = await prisma.orden.findUnique({ where: { id } });
    if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

    await prisma.ordenItem.deleteMany({ where: { ordenId: id } });
    await prisma.orden.delete({ where: { id } });

    // Si ya no quedan órdenes NO PAGADAS para esa mesa, liberarla
    try {
      const pendientesOMarcadas = await prisma.orden.count({
        where: { mesa: orden.mesa, estado: { not: OrdenEstado.PAGADA } },
      });
      if (pendientesOMarcadas === 0) {
        const mesaUpdated = await prisma.mesa.update({
          where: { numero: orden.mesa },
          data: { estado: "DISPONIBLE" },
        });
        broadcastMesa({ type: "mesa_release", mesa: mesaUpdated });
      }
    } catch (_) {}

    return res.json({ mensaje: "Orden eliminada" });
  } catch (e) {
    console.error("DELETE /ordenes/:id", e);
    return res.status(500).json({ error: "Error al eliminar la orden" });
  }
});

/* ================== Finalizar orden ================== */
router.patch("/:id/finalizar", async (req, res) => {
  const id = toNumOrNull(req.params.id);
  if (!id) return res.status(400).json({ error: "ordenId inválido" });

  try {
    const orden = await prisma.orden.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!orden) return res.status(404).json({ error: "Orden no existe" });

    const items = Array.isArray(orden.items) ? orden.items : [];
    if (items.length === 0) return res.status(409).json({ error: "La orden no tiene items" });
    const allReady = items.every((it) => NORM(it.estado) === "LISTO");
    if (!allReady) return res.status(409).json({ error: "Aún hay items sin terminar" });

    const now = new Date();
    const durationSec = Math.max(0, Math.round((now - new Date(orden.fecha)) / 1000));

    // Actualiza orden
    const updated = await prisma.orden.update({
      where: { id },
      data: {
        finishedAt: now,
        durationSec,
        estado: OrdenEstado.PENDIENTE_PAGO,
      },
      include: { items: true },
    });

    // Libera mesa YA (verde)
    try {
      const mesaUpdated = await prisma.mesa.update({
        where: { numero: orden.mesa },
        data: { estado: "DISPONIBLE" },
      });
      broadcastMesa({ type: "mesa_release", mesa: mesaUpdated });
    } catch (e) {
      console.warn("No se pudo liberar la mesa:", e?.message);
    }

    // Marca reserva cercana como CUMPLIDA (si existe)
    try {
      const mesaRow = await prisma.mesa.findUnique({ where: { numero: orden.mesa } });
      if (mesaRow) {
        const r = await findReservaCercanaByMesaId(mesaRow.id, { fromMins: -240, toMins: 30 });
        if (r) {
          await prisma.reserva.update({ where: { id: r.id }, data: { estado: "CUMPLIDA", aplicadoEnOrdenId: id } });
        }
      }
    } catch (e) {
      console.warn("No se pudo marcar la reserva como CUMPLIDA:", e?.message);
    }

    // Avisar a Caja que hay pendiente de pago
    try { if (broadcastCaja) broadcastCaja({ type: "nueva_pendiente", ordenId: updated.id }); } catch (_) {}

    return res.json(updated);
  } catch (e) {
    console.error("PATCH /ordenes/:id/finalizar", e);
    return res.status(500).json({ error: "Error al finalizar la orden" });
  }
});

module.exports = router;
