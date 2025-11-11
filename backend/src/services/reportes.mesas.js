// src/services/reportes.mesas.js
const { PrismaClient } = require('../generated/prisma')
const prisma = new PrismaClient({ log: ['warn', 'error'] })

function rangoPorScope(scope) {
  if (scope === 'hist') return {}
  const now = new Date()
  if (scope === 'hoy') {
    const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1)
    return { desde, hasta }
  }
  if (scope === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth(), 1)
    const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { desde, hasta }
  }
  const desde = new Date(now.getFullYear(), 0, 1)
  const hasta = new Date(now.getFullYear() + 1, 0, 1)
  return { desde, hasta }
}

/* ---- helpers internos ---- */

// 1) Conteo por ORDEN (1 orden = 1 uso de mesa)
// - Excluimos mesa 0 (online)
// - Ignoramos CANCELADA
// - Solo consumo local (sin pedidoCliente o pedidoCliente.tipoEntrega = 'LOCAL')
async function contarUsosOrdenes(scope = 'anio') {
  const { desde, hasta } = rangoPorScope(scope)
  const rows = await prisma.orden.groupBy({
    by: ['mesa'],
    _count: { _all: true },
    where: {
      mesa: { notIn: [0, null] },
      estado: { not: 'CANCELADA' },
      ...(desde && hasta ? { fecha: { gte: desde, lt: hasta } } : {}),
      OR: [
        { pedidoCliente: { is: null } },
        { pedidoCliente: { is: { tipoEntrega: 'LOCAL' } } },
      ],
    },
  })
  return rows.map(r => ({ mesa: r.mesa, usos: r._count._all }))
}

// 2) Conteo por RESERVA (si tienes reservas con mesa asignada)
// - Cuenta solo estados válidos (ajusta a tus estados reales)
async function contarUsosReservas(scope = 'anio') {
  const { desde, hasta } = rangoPorScope(scope)
  // Si no tienes tabla de reservas coméntalo o ajusta nombres:
  if (!prisma.reserva) return [] // por si tu schema aún no la tiene

  const rows = await prisma.reserva.groupBy({
    by: ['mesa'],
    _count: { _all: true },
    where: {
      mesa: { not: null },
      estado: { in: ['CONFIRMADA', 'ASISTIO'] }, // AJUSTA a tus estados reales
      ...(desde && hasta ? { fecha: { gte: desde, lt: hasta } } : {}),
    },
  })
  return rows.map(r => ({ mesa: r.mesa, usos: r._count._all }))
}

/* ---- API del servicio ---- */

// Devuelve array fusionado por mesa: { mesa, usosPorOrden, usosPorReserva, usosTotales }
async function usosDeMesas(scope = 'anio') {
  const [o, r] = await Promise.all([
    contarUsosOrdenes(scope),
    contarUsosReservas(scope),
  ])

  const map = new Map() // mesa -> { usosPorOrden, usosPorReserva }
  for (const it of o) {
    map.set(it.mesa, { usosPorOrden: it.usos, usosPorReserva: 0 })
  }
  for (const it of r) {
    const prev = map.get(it.mesa) ?? { usosPorOrden: 0, usosPorReserva: 0 }
    prev.usosPorReserva += it.usos
    map.set(it.mesa, prev)
  }

  // a plano
  const result = Array.from(map.entries()).map(([mesa, v]) => ({
    mesa,
    usosPorOrden: v.usosPorOrden,
    usosPorReserva: v.usosPorReserva,
    usosTotales: v.usosPorOrden + v.usosPorReserva,
  }))

  // IMPORTANTE: si tienes una tabla `Mesa` y quieres incluir mesas con 0 usos,
  // aquí podrías hacer un left join lógico con esa lista para que salgan en 0.
  return result.sort((a, b) => b.usosTotales - a.usosTotales)
}

// Top N por total (órdenes + reservas)
async function topMesasPorUso(scope = 'anio', take = 5) {
  const all = await usosDeMesas(scope)
  return all.slice(0, take)
}

// Mesa más usada (total)
async function mesaMasUsada(scope = 'anio') {
  const all = await usosDeMesas(scope)
  return all[0] ?? null
}

// Mesa menos usada (total)
async function mesaMenosUsada(scope = 'anio') {
  const all = await usosDeMesas(scope)
  if (!all.length) return null
  return all[all.length - 1]
}

module.exports = {
  usosDeMesas,
  topMesasPorUso,
  mesaMasUsada,
  mesaMenosUsada,
}
