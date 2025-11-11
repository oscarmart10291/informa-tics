// tests/mocks/prisma.mock.js
// Mock del cliente Prisma para tests unitarios

const mockPrisma = {
  // Modelos principales
  usuario: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  orden: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  ordenItem: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },

  pedidoCliente: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  mesa: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },

  cajaTurno: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  ticketVenta: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },

  reserva: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  // Transacciones
  $transaction: jest.fn((callback) => {
    if (typeof callback === 'function') {
      return callback(mockPrisma);
    }
    return Promise.resolve(callback);
  }),

  // Query raw
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),

  // Conexión
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// Función helper para resetear todos los mocks
function resetPrismaMocks() {
  Object.keys(mockPrisma).forEach(model => {
    if (typeof mockPrisma[model] === 'object') {
      Object.keys(mockPrisma[model]).forEach(method => {
        if (jest.isMockFunction(mockPrisma[model][method])) {
          mockPrisma[model][method].mockReset();
        }
      });
    } else if (jest.isMockFunction(mockPrisma[model])) {
      mockPrisma[model].mockReset();
    }
  });
}

module.exports = { mockPrisma, resetPrismaMocks };
