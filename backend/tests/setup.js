// tests/setup.js
// Configuración global para todos los tests

// Configurar variables de entorno para tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Mock console para tests más limpios (opcional)
global.console = {
  ...console,
  // Descomentar las siguientes líneas si quieres silenciar logs en tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: console.error, // Mantener errores visibles
};

// Timeout global para tests asíncronos
jest.setTimeout(5000);
