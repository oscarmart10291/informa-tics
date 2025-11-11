const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

// Helpers
const normalizarTipo = (t) => {
  const v = String(t || '').trim().toUpperCase();
  return v === 'BEBIBLE' ? 'BEBIBLE' : (v === 'COMESTIBLE' ? 'COMESTIBLE' : null);
};

// Crear categoría (activa por defecto)
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }

    // si no envían tipo, por defecto COMESTIBLE
    const tipoVal = normalizarTipo(tipo) || 'COMESTIBLE';

    const categoria = await prisma.categoria.create({
      data: {
        nombre: String(nombre).trim(),
        activo: true,
        tipo: tipoVal, // <-- nuevo
      },
    });

    res.json(categoria);
  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    }
    res.status(400).json({ error: 'Error al crear la categoría' });
  }
});

/**
 * Listar categorías con filtros opcionales:
 *  - ?soloActivas=1        -> solo categorías activas
 *  - ?conPlatillos=1       -> incluir platillos disponibles
 */
router.get('/', async (req, res) => {
  try {
    const { soloActivas, conPlatillos } = req.query;

    const where = {};
    if (String(soloActivas) === '1') where.activo = true;

    const include = {};
    if (String(conPlatillos) === '1') {
      include.platillos = { where: { disponible: true }, orderBy: { nombre: 'asc' } };
    }

    const categorias = await prisma.categoria.findMany({
      where,
      include: Object.keys(include).length ? include : undefined,
      orderBy: { nombre: 'asc' },
    });

    res.json(categorias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
});

// Actualizar nombre, activo y/o tipo
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, activo, tipo } = req.body;

  try {
    const data = {};

    if (nombre !== undefined) {
      const nom = String(nombre).trim();
      if (!nom) return res.status(400).json({ error: 'El nombre no puede ser vacío.' });
      data.nombre = nom;
    }

    if (activo !== undefined) data.activo = Boolean(activo);

    if (tipo !== undefined) {
      const tipoVal = normalizarTipo(tipo);
      if (!tipoVal) return res.status(400).json({ error: 'tipo inválido. Use COMESTIBLE o BEBIBLE.' });
      data.tipo = tipoVal;
    }

    const categoria = await prisma.categoria.update({
      where: { id },
      data,
    });

    res.json({ categoria });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe otra categoría con ese nombre.' });
    }
    res.status(400).json({ error: 'No se pudo actualizar la categoría' });
  }
});

// Alternar activo
router.put('/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const current = await prisma.categoria.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Categoría no encontrada' });

    const categoria = await prisma.categoria.update({
      where: { id },
      data: { activo: !current.activo },
    });

    res.json({ categoria });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'No se pudo cambiar el estado' });
  }
});

// Eliminar (impide borrar si tiene platillos asociados)
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const vinculados = await prisma.platillo.count({ where: { categoriaId: id } });
    if (vinculados > 0) {
      return res
        .status(409)
        .json({ error: `No se puede eliminar: la categoría está asociada a ${vinculados} platillo(s).` });
    }

    await prisma.categoria.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar: la categoría está asociada a 1 o más platillos.',
      });
    }
    res.status(400).json({ error: 'No se pudo eliminar la categoría' });
  }
});

/**
 * GET /categorias/visibles
 *  - Solo categorías activas
 *  - Incluye platillos disponibles
 *  - Oculta categorías sin platillos
 */
router.get('/visibles', async (_req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      where: { activo: true },
      include: { platillos: { where: { disponible: true }, orderBy: { nombre: 'asc' } } },
      orderBy: { nombre: 'asc' },
    });

    res.json(categorias.filter((c) => c.platillos.length > 0));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener categorías visibles' });
  }
});

module.exports = router;
