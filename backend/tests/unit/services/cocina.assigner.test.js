// tests/unit/services/cocina.assigner.test.js

// Mock de Prisma y notificaciones ANTES de importar el módulo
jest.mock('../../../src/generated/prisma', () => {
  const mockPrisma = {
    ordenItem: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    cocinaChef: {
      findMany: jest.fn(),
    },
    usuario: {
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('../../../src/services/notificaciones.sse', () => ({
  broadcast: jest.fn(),
}));

const { PrismaClient } = require('../../../src/generated/prisma');
const { broadcast } = require('../../../src/services/notificaciones.sse');
const {
  promoteNextForChef,
  reassignItemToAnotherChef,
  rebalanceAssignments,
} = require('../../../src/services/cocina.assigner');

// Obtener la instancia mockeada de prisma
const prisma = new PrismaClient();

describe('cocina.assigner - promoteNextForChef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Promoción exitosa', () => {
    test('debe promover el ítem más antiguo ASIGNADO a PREPARANDO si no hay items preparando', async () => {
      const chefId = 1;
      const itemAsignado = {
        id: 100,
        chefId: 1,
        estado: 'ASIGNADO',
        tipo: 'PLATILLO',
        asignadoEn: new Date('2025-01-01T10:00:00Z'),
      };

      // Mock: no hay items en PREPARANDO
      prisma.ordenItem.count.mockResolvedValue(0);

      // Mock: hay un item ASIGNADO
      prisma.ordenItem.findFirst.mockResolvedValue(itemAsignado);

      // Mock: update exitoso
      prisma.ordenItem.update.mockResolvedValue({
        ...itemAsignado,
        estado: 'PREPARANDO',
      });

      await promoteNextForChef(chefId);

      // Verificar que se buscó items en PREPARANDO
      expect(prisma.ordenItem.count).toHaveBeenCalledWith({
        where: { chefId, estado: 'PREPARANDO' },
      });

      // Verificar que se buscó el siguiente item ASIGNADO
      expect(prisma.ordenItem.findFirst).toHaveBeenCalledWith({
        where: { chefId, estado: 'ASIGNADO', tipo: 'PLATILLO' },
        orderBy: { asignadoEn: 'asc' },
      });

      // Verificar que se actualizó a PREPARANDO
      expect(prisma.ordenItem.update).toHaveBeenCalledWith({
        where: { id: itemAsignado.id },
        data: {
          estado: 'PREPARANDO',
          asignadoEn: itemAsignado.asignadoEn,
        },
      });
    });

    test('debe usar fecha actual si asignadoEn es null', async () => {
      const chefId = 1;
      const itemAsignado = {
        id: 100,
        chefId: 1,
        estado: 'ASIGNADO',
        tipo: 'PLATILLO',
        asignadoEn: null,
      };

      prisma.ordenItem.count.mockResolvedValue(0);
      prisma.ordenItem.findFirst.mockResolvedValue(itemAsignado);
      prisma.ordenItem.update.mockResolvedValue({
        ...itemAsignado,
        estado: 'PREPARANDO',
      });

      await promoteNextForChef(chefId);

      // Verificar que se usó una nueva fecha
      const updateCall = prisma.ordenItem.update.mock.calls[0][0];
      expect(updateCall.data.asignadoEn).toBeInstanceOf(Date);
    });
  });

  describe('Sin promoción', () => {
    test('no debe promover si ya hay un item en PREPARANDO', async () => {
      const chefId = 1;

      // Mock: hay 1 item en PREPARANDO
      prisma.ordenItem.count.mockResolvedValue(1);

      await promoteNextForChef(chefId);

      // No debe buscar el siguiente ni actualizar
      expect(prisma.ordenItem.findFirst).not.toHaveBeenCalled();
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });

    test('no debe promover si no hay items ASIGNADOS', async () => {
      const chefId = 1;

      // Mock: no hay items en PREPARANDO
      prisma.ordenItem.count.mockResolvedValue(0);

      // Mock: no hay items ASIGNADOS
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await promoteNextForChef(chefId);

      // Debe buscar pero no actualizar
      expect(prisma.ordenItem.findFirst).toHaveBeenCalled();
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });
  });
});

describe('cocina.assigner - reassignItemToAnotherChef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Reasignación exitosa', () => {
    test('debe reasignar un item a otro chef disponible', async () => {
      const itemId = 100;
      const excludeChefId = 1;

      const item = {
        id: itemId,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'PLATILLO',
        nombre: 'Pasta Carbonara',
        nota: 'Sin cebolla',
      };

      // Mock: el item existe y es válido
      prisma.ordenItem.findUnique.mockResolvedValue(item);

      // Mock: chefs activos
      prisma.cocinaChef.findMany.mockResolvedValue([
        { chefId: 2 },
        { chefId: 3 },
      ]);

      // Mock: cargas de chefs
      prisma.ordenItem.count
        .mockResolvedValueOnce(2) // chef 2 tiene 2 abiertos
        .mockResolvedValueOnce(1); // chef 3 tiene 1 abierto

      // Mock: update exitoso
      prisma.ordenItem.update.mockResolvedValue({
        ...item,
        chefId: 3,
        estado: 'ASIGNADO',
        orden: { codigo: 'ORD-001', mesa: 'Mesa 5' },
      });

      // Mock: promoteNextForChef (count para PREPARANDO)
      prisma.ordenItem.count.mockResolvedValueOnce(0);
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      const result = await reassignItemToAnotherChef(itemId, excludeChefId);

      expect(result).toBe(true);

      // Verificar que se asignó al chef con menos carga (chef 3)
      expect(prisma.ordenItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: itemId },
          data: expect.objectContaining({
            chefId: 3,
            estado: 'ASIGNADO',
          }),
        })
      );

      // Verificar que se envió notificación
      expect(broadcast).toHaveBeenCalledWith(
        'COCINA',
        expect.objectContaining({
          type: 'NUEVO_PEDIDO_COCINA',
          itemId: item.id,
        })
      );
    });

    test('debe excluir al chef especificado', async () => {
      const itemId = 100;
      const excludeChefId = 2;

      const item = {
        id: itemId,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      // Mock: chefs activos incluyen al excluido
      prisma.cocinaChef.findMany.mockResolvedValue([
        { chefId: 2 }, // Este debe ser excluido
        { chefId: 3 },
      ]);

      // Solo el chef 3 debe ser consultado
      prisma.ordenItem.count.mockResolvedValueOnce(1); // chef 3

      prisma.ordenItem.update.mockResolvedValue({
        ...item,
        chefId: 3,
        estado: 'ASIGNADO',
        orden: {},
      });

      // Mock promote
      prisma.ordenItem.count.mockResolvedValueOnce(0);
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      const result = await reassignItemToAnotherChef(itemId, excludeChefId);

      expect(result).toBe(true);
      expect(prisma.ordenItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chefId: 3 }),
        })
      );
    });

    test('debe usar fallback a cocineros si no hay chefs activos', async () => {
      const itemId = 100;
      const excludeChefId = 1;

      const item = {
        id: itemId,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      // Mock: no hay chefs activos
      prisma.cocinaChef.findMany.mockResolvedValue([]);

      // Mock: hay cocineros habilitados
      prisma.usuario.findMany.mockResolvedValue([
        { id: 2 },
        { id: 3 },
      ]);

      prisma.ordenItem.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      prisma.ordenItem.update.mockResolvedValue({
        ...item,
        chefId: 2,
        estado: 'ASIGNADO',
        orden: {},
      });

      // Mock promote
      prisma.ordenItem.count.mockResolvedValueOnce(0);
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      const result = await reassignItemToAnotherChef(itemId, excludeChefId);

      expect(result).toBe(true);
      expect(prisma.usuario.findMany).toHaveBeenCalledWith({
        where: {
          rol: { nombre: 'COCINERO' },
          estado: true,
          NOT: { id: excludeChefId },
        },
        select: { id: true },
      });
    });
  });

  describe('Reasignación fallida', () => {
    test('debe retornar false si el item no existe', async () => {
      prisma.ordenItem.findUnique.mockResolvedValue(null);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });

    test('debe retornar false si el item no está en PENDIENTE', async () => {
      const item = {
        id: 100,
        estado: 'ASIGNADO', // No es PENDIENTE
        chefId: null,
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
    });

    test('debe retornar false si el item ya tiene chef asignado', async () => {
      const item = {
        id: 100,
        estado: 'PENDIENTE',
        chefId: 5, // Ya tiene chef
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
    });

    test('debe retornar false si el item no es PLATILLO', async () => {
      const item = {
        id: 100,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'BEBIDA', // No es PLATILLO
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
    });

    test('debe retornar false si no hay chefs disponibles', async () => {
      const item = {
        id: 100,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);
      prisma.cocinaChef.findMany.mockResolvedValue([]);
      prisma.usuario.findMany.mockResolvedValue([]);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
    });

    test('debe retornar false si todos los chefs están a capacidad máxima', async () => {
      const item = {
        id: 100,
        estado: 'PENDIENTE',
        chefId: null,
        tipo: 'PLATILLO',
      };

      prisma.ordenItem.findUnique.mockResolvedValue(item);

      prisma.cocinaChef.findMany.mockResolvedValue([
        { chefId: 2 },
        { chefId: 3 },
      ]);

      // Ambos chefs tienen 4 items (capacidad máxima)
      prisma.ordenItem.count.mockResolvedValue(4);

      const result = await reassignItemToAnotherChef(100, 1);

      expect(result).toBe(false);
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });
  });
});

describe('cocina.assigner - rebalanceAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Silenciar console.log para tests más limpios
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  describe('Rebalanceo exitoso', () => {
    test('debe asignar items pendientes a chefs disponibles', async () => {
      // Mock: hay 2 chefs activos
      prisma.cocinaChef.findMany.mockResolvedValue([
        { chefId: 1 },
        { chefId: 2 },
      ]);

      // Mock: hay 3 items pendientes
      prisma.ordenItem.findMany.mockResolvedValue([
        { id: 101, estado: 'PENDIENTE', tipo: 'PLATILLO' },
        { id: 102, estado: 'PENDIENTE', tipo: 'PLATILLO' },
        { id: 103, estado: 'PENDIENTE', tipo: 'PLATILLO' },
      ]);

      // Mock: cargas de chefs (chef 1 tiene 1, chef 2 tiene 0)
      prisma.ordenItem.count
        .mockResolvedValueOnce(1) // chef 1
        .mockResolvedValueOnce(0) // chef 2
        .mockResolvedValueOnce(0) // promote chef 1
        .mockResolvedValueOnce(0); // promote chef 2

      // Mock: updates exitosos
      prisma.ordenItem.update.mockResolvedValue({
        id: 101,
        estado: 'ASIGNADO',
        orden: { codigo: 'ORD-001', mesa: 'Mesa 1' },
      });

      // Mock: promote findFirst
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      // Debe haber asignado los 3 items
      expect(prisma.ordenItem.update).toHaveBeenCalledTimes(3);

      // Debe enviar notificaciones
      expect(broadcast).toHaveBeenCalledTimes(3);
    });

    test('debe balancear la carga entre chefs', async () => {
      prisma.cocinaChef.findMany.mockResolvedValue([
        { chefId: 1 },
        { chefId: 2 },
      ]);

      prisma.ordenItem.findMany.mockResolvedValue([
        { id: 101, estado: 'PENDIENTE', tipo: 'PLATILLO' },
        { id: 102, estado: 'PENDIENTE', tipo: 'PLATILLO' },
      ]);

      // Chef 1 tiene 3 abiertos, chef 2 tiene 0
      prisma.ordenItem.count
        .mockResolvedValueOnce(3) // chef 1
        .mockResolvedValueOnce(0) // chef 2
        .mockResolvedValueOnce(0) // promote chef 1
        .mockResolvedValueOnce(0); // promote chef 2

      prisma.ordenItem.update.mockResolvedValue({
        id: 101,
        estado: 'ASIGNADO',
        orden: {},
      });

      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      // El chef 2 (con menos carga) debe recibir más items
      const updateCalls = prisma.ordenItem.update.mock.calls;
      const chef2Assignments = updateCalls.filter(
        call => call[0].data.chefId === 2
      );

      // Chef 2 debe recibir al menos 1 item (probablemente ambos)
      expect(chef2Assignments.length).toBeGreaterThanOrEqual(1);
    });

    test('debe usar cocineros como fallback si no hay chefs activos', async () => {
      // No hay chefs activos
      prisma.cocinaChef.findMany.mockResolvedValue([]);

      // Hay cocineros habilitados
      prisma.usuario.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);

      prisma.ordenItem.findMany.mockResolvedValue([
        { id: 101, estado: 'PENDIENTE', tipo: 'PLATILLO' },
      ]);

      prisma.ordenItem.count.mockResolvedValue(0);

      prisma.ordenItem.update.mockResolvedValue({
        id: 101,
        estado: 'ASIGNADO',
        orden: {},
      });

      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      expect(prisma.usuario.findMany).toHaveBeenCalled();
      expect(prisma.ordenItem.update).toHaveBeenCalled();
    });

    test('debe respetar la capacidad máxima por chef', async () => {
      prisma.cocinaChef.findMany.mockResolvedValue([{ chefId: 1 }]);

      // 10 items pendientes
      const pendingItems = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: 100 + i,
          estado: 'PENDIENTE',
          tipo: 'PLATILLO',
        }));

      prisma.ordenItem.findMany.mockResolvedValue(pendingItems);

      // Chef ya tiene 2 items, capacidad es 4, así que solo puede recibir 2 más
      prisma.ordenItem.count.mockResolvedValue(2);

      prisma.ordenItem.update.mockResolvedValue({
        id: 101,
        estado: 'ASIGNADO',
        orden: {},
      });

      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      // Debe asignar máximo 2 items (capacidad 4 - 2 abiertos)
      expect(prisma.ordenItem.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sin rebalanceo', () => {
    test('no debe hacer nada si no hay chefs disponibles', async () => {
      prisma.cocinaChef.findMany.mockResolvedValue([]);
      prisma.usuario.findMany.mockResolvedValue([]);

      await rebalanceAssignments();

      expect(prisma.ordenItem.findMany).not.toHaveBeenCalled();
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });

    test('no debe hacer nada si no hay items pendientes', async () => {
      prisma.cocinaChef.findMany.mockResolvedValue([{ chefId: 1 }]);

      // No hay items pendientes
      prisma.ordenItem.findMany.mockResolvedValue([]);

      prisma.ordenItem.count.mockResolvedValue(0);
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      // No debe asignar nada
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });

    test('no debe asignar si todos los chefs están a capacidad máxima', async () => {
      prisma.cocinaChef.findMany.mockResolvedValue([{ chefId: 1 }]);

      prisma.ordenItem.findMany.mockResolvedValue([
        { id: 101, estado: 'PENDIENTE', tipo: 'PLATILLO' },
      ]);

      // Chef ya tiene 4 items (capacidad máxima)
      prisma.ordenItem.count.mockResolvedValue(4);
      prisma.ordenItem.findFirst.mockResolvedValue(null);

      await rebalanceAssignments();

      // No debe asignar nada
      expect(prisma.ordenItem.update).not.toHaveBeenCalled();
    });
  });
});
