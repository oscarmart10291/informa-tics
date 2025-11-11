// backend/src/routes/platillos.routes.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

/**
 * GET /platillos
 * Query params opcionales:
 *  - ?soloDisponibles=1  -> solo platillos disponibles
 *  - ?soloActivas=1      -> solo categorías activas
 *  - ?categoriaId=123    -> filtra por categoría
 *
 * Devuelve siempre categoria con { id, nombre, tipo, activo }
 */
router.get('/', async (req, res) => {
  try {
    const { soloDisponibles, soloActivas, categoriaId } = req.query;

    const where = {};
    if (String(soloDisponibles) === '1') where.disponible = true;
    if (categoriaId) where.categoriaId = Number(categoriaId);
    if (String(soloActivas) === '1') {
      // filtra por categorías activas
      where.categoria = { activo: true };
    }

    const platillos = await prisma.platillo.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      include: {
        categoria: {
          select: {
            id: true,
            nombre: true,
            tipo: true,   // 👈 clave para que el front sepa si es BEBIBLE o COMESTIBLE
            activo: true,
          },
        },
      },
    });

    res.json(platillos);
  } catch (error) {
    console.error('Error al obtener platillos:', error);
    res.status(500).json({ error: 'Error al obtener los platillos.' });
  }
});

// Crear un nuevo platillo
router.post('/', async (req, res) => {
  const { nombre, precio, categoriaId } = req.body;
  if (!nombre || precio === undefined || !categoriaId) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const existente = await prisma.platillo.findUnique({ where: { nombre: String(nombre).trim() } });
    if (existente) return res.status(409).json({ error: 'El platillo ya existe.' });

    const nuevoPlatillo = await prisma.platillo.create({
      data: {
        nombre: String(nombre).trim(),
        precio: parseFloat(precio),
        categoria: { connect: { id: parseInt(categoriaId) } },
      },
      include: {
        categoria: { select: { id: true, nombre: true, tipo: true, activo: true } },
      },
    });

    res.status(201).json({ mensaje: 'Platillo creado exitosamente', platillo: nuevoPlatillo });
  } catch (error) {
    console.error('Error al crear platillo:', error);
    res.status(500).json({ error: 'Error al crear el platillo.' });
  }
});

// Actualizar un platillo y registrar en historial
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, categoriaId, responsableId } = req.body;

  try {
    const platilloOriginal = await prisma.platillo.findUnique({
      where: { id: parseInt(id) },
      include: { categoria: true },
    });
    if (!platilloOriginal) return res.status(404).json({ error: 'Platillo no encontrado' });

    const cambios = [];
    if (nombre !== undefined && String(platilloOriginal.nombre) !== String(nombre)) {
      cambios.push({ campo: 'nombre', valorAnterior: platilloOriginal.nombre, valorNuevo: String(nombre).trim() });
    }
    if (precio !== undefined && platilloOriginal.precio !== parseFloat(precio)) {
      cambios.push({
        campo: 'precio',
        valorAnterior: String(platilloOriginal.precio),
        valorNuevo: String(parseFloat(precio)),
      });
    }
    if (categoriaId !== undefined && platilloOriginal.categoriaId !== parseInt(categoriaId)) {
      const nuevaCat = await prisma.categoria.findUnique({ where: { id: parseInt(categoriaId) } });
      cambios.push({
        campo: 'categoria',
        valorAnterior: platilloOriginal.categoria?.nombre || '',
        valorNuevo: nuevaCat?.nombre || '',
      });
    }

    const actualizado = await prisma.platillo.update({
      where: { id: parseInt(id) },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(precio !== undefined ? { precio: parseFloat(precio) } : {}),
        ...(categoriaId !== undefined ? { categoria: { connect: { id: parseInt(categoriaId) } } } : {}),
      },
      include: { categoria: { select: { id: true, nombre: true, tipo: true, activo: true } } },
    });

    // Registrar cambios en historial
    for (const c of cambios) {
      await prisma.historialModificacion.create({
        data: {
          campo: c.campo,
          valorAnterior: c.valorAnterior,
          valorNuevo: c.valorNuevo,
          accion: `Modificación de platillo: campo '${c.campo}' actualizado.`,
          responsableId: parseInt(responsableId) || 1,
          platilloId: parseInt(id),
        },
      });
    }

    res.json({ mensaje: 'Platillo actualizado', platillo: actualizado });
  } catch (error) {
    console.error('Error al actualizar platillo:', error);
    res.status(500).json({ error: 'Error al actualizar el platillo.' });
  }
});

// Cambiar disponibilidad (activar/desactivar)
router.patch('/:id/disponibilidad', async (req, res) => {
  const { id } = req.params;
  const { disponible, responsableId } = req.body;

  // normaliza a boolean aunque llegue como string/number
  const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
  const nuevoEstado = toBool(disponible);

  try {
    const previo = await prisma.platillo.findUnique({ where: { id: parseInt(id) } });
    if (!previo) return res.status(404).json({ error: 'Platillo no encontrado' });

    const platillo = await prisma.platillo.update({
      where: { id: parseInt(id) },
      data: { disponible: nuevoEstado },
    });

    // Historial (sin campo "descripcion" que no existe en tu modelo)
    try {
      await prisma.historialModificacion.create({
        data: {
          accion: 'modificación',
          campo: 'disponible',
          valorAnterior: String(!nuevoEstado),
          valorNuevo: String(nuevoEstado),
          responsableId: parseInt(responsableId) || 1,
          platilloId: platillo.id,
        },
      });
    } catch (eHist) {
      console.error('No se pudo registrar el historial de disponibilidad:', eHist);
      // no fallamos la respuesta por el historial
    }

    res.json({
      mensaje: `Platillo ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`,
      platillo,
    });
  } catch (error) {
    console.error('Error al cambiar disponibilidad:', error);
    res.status(500).json({ error: 'Error al actualizar disponibilidad del platillo.' });
  }
});

// Guardar URL de imagen en BD (sin historial)
router.put('/:id/imagen', async (req, res) => {
  const id = parseInt(req.params.id);
  const { url } = req.body;

  if (!id || !url) return res.status(400).json({ error: 'Falta id o url' });

  try {
    const actual = await prisma.platillo.findUnique({ where: { id } });
    if (!actual) return res.status(404).json({ error: 'Platillo no encontrado' });

    const actualizado = await prisma.platillo.update({
      where: { id },
      data: { imagenUrl: String(url) },
    });

    res.json({ mensaje: 'Imagen guardada correctamente', platillo: actualizado });
  } catch (error) {
    console.error('Error guardando imagen en BD:', error);
    res.status(500).json({ error: 'Error al guardar imagen en la base de datos.' });
  }
});

module.exports = router;
