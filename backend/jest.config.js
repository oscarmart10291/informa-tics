// jest.config.js
module.exports = {
  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Directorios a ignorar
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],

  // Cobertura de código
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/generated/**',
    '!src/**/index.js'
  ],

  // Directorio de salida de cobertura
  coverageDirectory: 'coverage',

  // Umbrales de cobertura (opcional, puedes ajustarlos)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Formato de reportes de cobertura
  coverageReporters: ['text', 'lcov', 'html'],

  // Tiempo máximo por test (5 segundos)
  testTimeout: 5000,

  // Limpiar mocks automáticamente entre tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Setup files (se ejecutan antes de cada suite de tests)
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Variables de entorno para tests
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  }
};
