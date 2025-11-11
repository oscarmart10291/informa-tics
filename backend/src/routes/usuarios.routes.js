// backend/src/routes/usuarios.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient, OrdenEstado } = require('../generated/prisma');
const prisma = new PrismaClient();
const { sendEmail } = require('../services/email');
const { genTempPassword } = require('../utils/passwords');

const { isStrongPassword, policyMessage, isReusedPassword } = require('../utils/passwordPolicy');

// Estados que NO cuentan como orden activa (permiten desactivar)
const ESTADOS_FINALES_ORDEN = [OrdenEstado.PAGADA, OrdenEstado.CANCELADA];

// Para reparto
const DELIVERY_FINALES = ['ENTREGADO', 'CANCELADO'];

// =========================
// GET /usuarios (activos o inactivos) — EXCLUYE rol "Cliente"
// =========================
router.get('/', async (req, res) => {
  try {
    const inactivos = req.query.inactivos === '1';

    // 1) Usuarios base (activos/inactivos, sin Cliente)
    const usuarios = await prisma.usuario.findMany({
      where: {
        estado: inactivos ? false : true,
        rol: { nombre: { not: 'Cliente' } }
      },
      select: {
        id: true,
        nombre: true,
        usuario: true,
        correo: true,
        rol: { select: { nombre: true } }
      },
      orderBy: { id: 'asc' }
    });

    if (usuarios.length === 0) return res.json([]);

    // 2) Armar mapas de conteos por usuario
    const ids = usuarios.map(u => u.id);

    // 2.1) Mesero: órdenes activas (no PAGADA / no CANCELADA)
    const gruposOrden = await prisma.orden.groupBy({
      by: ['meseroId'],
      where: {
        meseroId: { in: ids },
        estado: { notIn: [OrdenEstado.PAGADA, OrdenEstado.CANCELADA] },
      },
      _count: { _all: true },
    });
    const openOrdersByUser = new Map(gruposOrden.map(g => [g.meseroId, g._count._all]));

    // 2.2) Cocinero: items activos (ASIGNADO o PREPARANDO)
    const gruposCocina = await prisma.ordenItem.groupBy({
      by: ['chefId'],
      where: {
        chefId: { in: ids },
        tipo: 'PLATILLO',
        estado: { in: ['ASIGNADO', 'PREPARANDO'] },
      },
      _count: { _all: true },
    });
    const kitchenByUser = new Map(gruposCocina.map(g => [g.chefId, g._count._all]));

    // 2.3) Bartender: items activos (ASIGNADO o PREPARANDO)
    const gruposBarra = await prisma.ordenItem.groupBy({
      by: ['bartenderId'],
      where: {
        bartenderId: { in: ids },
        tipo: 'BEBIDA',
        estado: { in: ['ASIGNADO', 'PREPARANDO'] },
      },
      _count: { _all: true },
    });
    const barByUser = new Map(gruposBarra.map(g => [g.bartenderId, g._count._all]));

    // 2.4) Cajero: turno de caja en estados bloqueantes
    const turnos = await prisma.cajaTurno.findMany({
      where: { cajeroId: { in: ids }, estado: { in: ['PENDIENTE', 'ABIERTA', 'CIERRE_PENDIENTE'] } },
      select: { cajeroId: true }
    });
    const cajaActiva = new Set(turnos.map(t => t.cajeroId));

    // 2.5) Repartidor: pedidos asignados/en curso (no finales)
    const pedidosActivos = await prisma.pedidoCliente.findMany({
      where: {
        repartidorId: { in: ids },
        NOT: { deliveryStatus: { in: DELIVERY_FINALES } }
      },
      select: { repartidorId: true }
    });
    const repartoActivoSet = new Set(pedidosActivos.map(p => p.repartidorId));

    // 3) Respuesta con flags
    const conFlags = usuarios.map(u => {
      const hasOpenOrders   = (openOrdersByUser.get(u.id) || 0) > 0;
      const hasActiveKitchen= (kitchenByUser.get(u.id) || 0) > 0;
      const hasActiveBar    = (barByUser.get(u.id) || 0) > 0;
      const hasOpenCashbox  = cajaActiva.has(u.id);
      const hasActiveDelivery = repartoActivoSet.has(u.id);
      return {
        ...u,
        hasOpenOrders,
        hasActiveKitchen,
        hasActiveBar,
        hasOpenCashbox,
        hasActiveDelivery,
      };
    });

    res.json(conFlags);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// =========================
/* POST /usuarios (crear con contraseña temporal por correo) */
// =========================
router.post('/', async (req, res) => {
  let { nombre, usuario, correo, rolId, responsableId } = req.body;

  // normalizar
  nombre = String(nombre || '').trim();
  usuario = String(usuario || '').trim();
  correo = String(correo || '').trim().toLowerCase();
  rolId = parseInt(rolId);
  responsableId = parseInt(responsableId);

  if (!nombre || !usuario || !correo || !rolId || !responsableId) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const rol = await prisma.rol.findUnique({ where: { id: rolId } });
    if (!rol) return res.status(404).json({ error: 'Rol no encontrado.' });

    const rolNombre = rol.nombre.toLowerCase();
    if (rolNombre === 'administrador' || rolNombre === 'cliente') {
      return res.status(403).json({ error: 'Este rol no puede asignarse desde el panel de administración.' });
    }

    const duplicado = await prisma.usuario.findFirst({
      where: {
        OR: [
          { usuario: { equals: usuario, mode: 'insensitive' } },
          { correo:  { equals: correo,  mode: 'insensitive' } },
        ]
      },
      select: { id: true, estado: true, nombre: true, usuario: true, correo: true }
    });

    if (duplicado) {
      if (duplicado.estado === true) {
        return res.status(409).json({ error: 'El usuario o correo ya está en uso.' });
      }
      return res.status(409).json({
        error: 'Existe un usuario eliminado con ese usuario/correo. Puedes restaurarlo.',
        existeInactivo: true,
        usuarioId: duplicado.id,
        nombre: duplicado.nombre,
        usuarioDup: duplicado.usuario,
        correoDup: duplicado.correo
      });
    }

    let temp = genTempPassword();
    // opcional: reforzar que cumpla política
    let guard = 0;
    const MAX_TRIES = 5;
    const { isStrongPassword: strong } = require('../utils/passwordPolicy');
    while (!strong(temp) && guard < MAX_TRIES) {
      temp = genTempPassword();
      guard++;
    }

    const hash = await bcrypt.hash(temp, 12);

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre, usuario, correo, rolId,
        contrasena: hash,
        debeCambiarPassword: true,
        estado: true
      }
    });

    // guardar en historial para bloquear reutilización
    await prisma.passwordHistory.create({
      data: { userId: nuevoUsuario.id, hash },
    });

    await prisma.historialModificacion.create({
      data: {
        usuarioId: nuevoUsuario.id,
        campo: 'usuario',
        valorAnterior: null,
        valorNuevo: `${nuevoUsuario.nombre} (${nuevoUsuario.usuario})`,
        accion: 'creación',
        responsableId
      }
    });

    let emailSent = true;
    try {
      await sendEmail({
        to: correo,
        subject: `Usuario creado: ${usuario} (${rol.nombre})`,
        html: `
          <h2>¡Bienvenido/a, ${nombre}!</h2>
          <p>Se creó tu cuenta en el sistema.</p>
          <p><b>Rol:</b> ${rol.nombre}</p>
          <p><b>Usuario:</b> <code style="font-size:15px">${usuario}</code></p>
          <p><b>Contraseña temporal:</b> <code style="font-size:16px">${temp}</code></p>
          <p>Puedes ingresar aquí y cambiarla al entrar:</p>
          <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Ingresar</a></p>
          <hr/>
          <small>Por seguridad, esta contraseña es temporal. Deberás cambiarla en tu primer inicio de sesión.</small>
        `
      });
    } catch (e) {
      emailSent = false;
      console.error('✉️ Error correo (creación):', e.message);
    }

    return res.status(201).json({
      mensaje: emailSent ? 'Usuario creado y correo enviado' : 'Usuario creado. No se pudo enviar el correo.',
      emailSent,
      usuario: nuevoUsuario
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

// =========================
// PUT /usuarios/:id (actualizar)
// =========================
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  let { nombre, usuario, correo, contrasena, rolId, responsableId } = req.body;

  if (!nombre || !usuario || !correo || !rolId || !responsableId) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  // normalizar
  nombre = String(nombre || '').trim();
  usuario = String(usuario || '').trim();
  correo = String(correo || '').trim().toLowerCase();
  rolId = parseInt(rolId);
  responsableId = parseInt(responsableId);

  try {
    const anterior = await prisma.usuario.findUnique({ where: { id } });
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const existente = await prisma.usuario.findFirst({
      where: {
        estado: true,
        AND: [
          { id: { not: id } },
          {
            OR: [
              { usuario: { equals: usuario, mode: 'insensitive' } },
              { correo:  { equals: correo,  mode: 'insensitive' } },
            ]
          }
        ]
      }
    });
    if (existente) {
      return res.status(409).json({ error: 'El usuario o correo ya existe.' });
    }

    const cambios = [];
    const updateData = { nombre, usuario, correo, rolId };

    if (contrasena && contrasena.trim()) {
      const nuevoPlano = contrasena.trim();

      if (!isStrongPassword(nuevoPlano)) {
        return res.status(400).json({ error: policyMessage() });
      }

      const last = await prisma.passwordHistory.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const lista = anterior?.contrasena ? [{ hash: anterior.contrasena }, ...last] : last;

      if (await isReusedPassword(nuevoPlano, lista)) {
        return res.status(400).json({ error: 'No puedes reutilizar ninguna de las últimas 5 contraseñas.' });
      }

      const newHash = await bcrypt.hash(nuevoPlano, 12);

      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id },
          data: { ...updateData, contrasena: newHash, debeCambiarPassword: false },
        });

        await tx.passwordHistory.create({
          data: { userId: id, hash: newHash },
        });

        const sobran = await tx.passwordHistory.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          skip: 5,
        });
        if (sobran.length) {
          await tx.passwordHistory.deleteMany({
            where: { id: { in: sobran.map(h => h.id) } },
          });
        }
      });

      cambios.push({ campo: 'contrasena', valorAnterior: '****', valorNuevo: '****' });
    } else {
      await prisma.usuario.update({ where: { id }, data: updateData });
    }

    if (anterior.nombre !== nombre) cambios.push({ campo: 'nombre', valorAnterior: anterior.nombre, valorNuevo: nombre });
    if (anterior.usuario !== usuario) cambios.push({ campo: 'usuario', valorAnterior: anterior.usuario, valorNuevo: usuario });
    if (anterior.correo !== correo)   cambios.push({ campo: 'correo',  valorAnterior: anterior.correo,  valorNuevo: correo  });

    if (anterior.rolId !== rolId) {
      const nuevoRol   = await prisma.rol.findUnique({ where: { id: rolId } });
      const anteriorRol= await prisma.rol.findUnique({ where: { id: anterior.rolId } });
      cambios.push({ campo: 'rol', valorAnterior: anteriorRol?.nombre, valorNuevo: nuevoRol?.nombre });
    }

    for (const c of cambios) {
      const accion =
        c.campo === 'rol'
          ? `Cambio de rol de ${nombre} (${usuario}): ${c.valorAnterior} → ${c.valorNuevo}`
          : c.campo === 'contrasena'
          ? `Cambio de contraseña de ${nombre} (${usuario})`
          : `Cambio en ${c.campo} de ${nombre} (${usuario}): ${c.valorAnterior || '—'} → ${c.valorNuevo || '—'}`;

      await prisma.historialModificacion.create({
        data: { usuarioId: id, campo: c.campo, valorAnterior: c.valorAnterior, valorNuevo: c.valorNuevo, accion, responsableId }
      });
    }

    const usuarioConRol = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, usuario: true, correo: true, rol: { select: { nombre: true } } }
    });

    res.json({ mensaje: 'Usuario actualizado correctamente', usuario: usuarioConRol });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// =========================
// DELETE /usuarios/:id (borrado lógico con bloqueos)
// =========================
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const responsableId = 1;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const rolNombre = (usuario.rol?.nombre || '').toLowerCase();

    const activasOrden = await prisma.orden.count({
      where: { meseroId: id, estado: { notIn: ESTADOS_FINALES_ORDEN } },
    });
    if (activasOrden > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar: el usuario tiene órdenes activas.',
        ordenesActivas: activasOrden,
      });
    }

    const activosCocina = await prisma.ordenItem.count({
      where: { chefId: id, tipo: 'PLATILLO', estado: { in: ['ASIGNADO', 'PREPARANDO'] } },
    });
    const activosBarra = await prisma.ordenItem.count({
      where: { bartenderId: id, tipo: 'BEBIDA', estado: { in: ['ASIGNADO', 'PREPARANDO'] } },
    });
    if (activosCocina + activosBarra > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar: el usuario tiene productos en preparación/asignados.',
        itemsActivos: { cocina: activosCocina, barra: activosBarra },
      });
    }

    if (rolNombre.includes('cajero')) {
      const cajaAbierta = await prisma.cajaTurno.count({
        where: { cajeroId: id, estado: { in: ['PENDIENTE', 'ABIERTA', 'CIERRE_PENDIENTE'] } },
      });
      if (cajaAbierta > 0) {
        return res.status(409).json({
          error: 'No se puede desactivar: el cajero tiene un turno de caja activo o pendiente de cierre.',
          cajaTurnosActivos: cajaAbierta,
        });
      }
    }

    if (rolNombre.includes('repartidor')) {
      const entregasActivas = await prisma.pedidoCliente.count({
        where: {
          repartidorId: id,
          NOT: { deliveryStatus: { in: DELIVERY_FINALES } },
        },
      });
      if (entregasActivas > 0) {
        return res.status(409).json({
          error: 'No se puede desactivar: el repartidor tiene entregas en curso.',
          entregasActivas,
        });
      }
    }

    await prisma.usuario.update({ where: { id }, data: { estado: false } });

    await prisma.historialModificacion.create({
      data: {
        usuarioId: id,
        campo: 'estado',
        valorAnterior: 'activo',
        valorNuevo: 'eliminado',
        accion: `eliminación de ${usuario.nombre} (${usuario.usuario})`,
        responsableId
      }
    });

    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// =========================
// PUT /usuarios/:id/restaurar
// =========================
router.put('/:id/restaurar', async (req, res) => {
  const id = parseInt(req.params.id);
  const { responsableId } = req.body;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (usuario.estado === true) return res.status(400).json({ error: 'El usuario ya está activo.' });

    const reactivado = await prisma.usuario.update({ where: { id }, data: { estado: true } });

    await prisma.historialModificacion.create({
      data: {
        usuarioId: id,
        campo: 'estado',
        valorAnterior: 'eliminado',
        valorNuevo: 'activo',
        accion: `restauración de ${reactivado.nombre} (${reactivado.usuario})`,
        responsableId: parseInt(responsableId) || 1
      }
    });

    res.json({ mensaje: 'Usuario restaurado', usuario: reactivado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al restaurar usuario.' });
  }
});

// =========================
// POST /usuarios/:id/reset-password
// =========================
router.post('/:id/reset-password', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = await prisma.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    let temp = genTempPassword();
    let guard = 0;
    const MAX_TRIES = 5;
    while (!isStrongPassword(temp) && guard < MAX_TRIES) {
      temp = genTempPassword();
      guard++;
    }

    const hash = await bcrypt.hash(temp, 12);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: { contrasena: hash, debeCambiarPassword: true }
      });

      await tx.passwordHistory.create({
        data: { userId: id, hash },
      });

      const sobran = await tx.passwordHistory.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: 5,
      });
      if (sobran.length) {
        await tx.passwordHistory.deleteMany({
          where: { id: { in: sobran.map(h => h.id) } },
        });
      }
    });

    await sendEmail({
      to: user.correo,
      subject: `Nueva contraseña temporal para ${user.usuario}`,
      html: `
        <h2>Hola ${user.nombre},</h2>
        <p>Se generó una <b>contraseña temporal</b> para tu cuenta.</p>
        <p><b>Usuario:</b> <code style="font-size:15px">${user.usuario}</code></p>
        <p><b>Rol:</b> ${user.rol?.nombre || '-'}</p>
        <p><b>Contraseña temporal:</b> <code style="font-size:16px">${temp}</code></p>
        <p>Ingresa y cámbiala de inmediato:</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Ingresar</a></p>
        <hr/>
        <small>Si no solicitaste este cambio, contacta al administrador.</small>
      `
    });

    res.json({ ok: true, message: 'Contraseña temporal enviada' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'No se pudo reenviar la temporal' });
  }
});

module.exports = router;
