# Tests Unitarios con Jest

Este directorio contiene las pruebas unitarias del backend utilizando **Jest**.

## 📁 Estructura de Directorios

```
tests/
├── unit/                      # Pruebas unitarias
│   ├── utils/                # Tests de utilidades
│   │   ├── passwordPolicy.test.js
│   │   ├── totales.test.js
│   │   └── passwords.test.js
│   ├── services/             # Tests de servicios
│   │   └── cocina.assigner.test.js
│   └── middlewares/          # Tests de middlewares
│       └── requirePerm.test.js
├── integration/              # Pruebas de integración (futuro)
├── mocks/                    # Mocks para tests
│   └── prisma.mock.js
├── __fixtures__/             # Datos de prueba
└── setup.js                  # Configuración global
```

## 🚀 Comandos Disponibles

### Ejecutar todos los tests
```bash
npm test
```

### Ejecutar tests en modo watch (útil durante desarrollo)
```bash
npm run test:watch
```

### Ejecutar tests con reporte de cobertura
```bash
npm run test:coverage
```

### Ejecutar solo tests unitarios
```bash
npm run test:unit
```

### Ejecutar solo tests de integración
```bash
npm run test:integration
```

### Ejecutar tests en modo verbose
```bash
npm run test:verbose
```

## 📊 Resumen de Tests Actuales

### ✅ Utils (3 archivos, 77 tests)
- **passwordPolicy.test.js** - 33 tests
  - Validación de contraseñas fuertes
  - Política de contraseñas
  - Detección de contraseñas reutilizadas

- **totales.test.js** - 23 tests
  - Cálculos de totales de items
  - Manejo de decimales
  - Casos edge y escenarios reales

- **passwords.test.js** - 25 tests
  - Generación de contraseñas temporales
  - Unicidad y formato
  - Seguridad y distribución

### ✅ Services (1 archivo, 21 tests)
- **cocina.assigner.test.js** - 21 tests
  - Promoción de items en cocina
  - Reasignación de items rechazados
  - Rebalanceo de cargas entre chefs

### ✅ Middlewares (1 archivo, 37 tests)
- **requirePerm.test.js** - 37 tests
  - Verificación de permisos en modo estricto/no estricto
  - Wildcards y roles especiales
  - Normalización de permisos
  - Manejo de errores

**Total: 135 tests pasando ✅**

## 📝 Cómo Escribir Nuevos Tests

### Estructura básica de un test

```javascript
// tests/unit/utils/ejemplo.test.js
const { miFuncion } = require('../../../src/utils/ejemplo');

describe('Nombre del módulo - miFuncion', () => {
  describe('Casos exitosos', () => {
    test('debe hacer algo específico', () => {
      // Arrange (preparar)
      const input = 'valor de prueba';

      // Act (ejecutar)
      const result = miFuncion(input);

      // Assert (verificar)
      expect(result).toBe('resultado esperado');
    });
  });

  describe('Casos de error', () => {
    test('debe manejar errores correctamente', () => {
      expect(() => miFuncion(null)).toThrow();
    });
  });
});
```

### Mockear dependencias

Para mockear Prisma u otros módulos:

```javascript
// Mock ANTES de importar el módulo que lo usa
jest.mock('../../../src/generated/prisma', () => {
  const mockPrisma = {
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const { PrismaClient } = require('../../../src/generated/prisma');
const miServicio = require('../../../src/services/miServicio');

const prisma = new PrismaClient();

describe('Mi Servicio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('debe consultar usuario', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 1, nombre: 'Test' });

    const result = await miServicio.getUser(1);

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 1 }
    });
    expect(result.nombre).toBe('Test');
  });
});
```

## 🎯 Mejores Prácticas

### 1. Nombres descriptivos
```javascript
// ❌ Mal
test('test 1', () => {});

// ✅ Bien
test('debe calcular el total correctamente con items simples', () => {});
```

### 2. Organizar con describe
```javascript
describe('NombreModulo - nombreFuncion', () => {
  describe('Casos exitosos', () => {
    // tests exitosos
  });

  describe('Casos de error', () => {
    // tests de error
  });

  describe('Casos edge', () => {
    // casos límite
  });
});
```

### 3. Usar beforeEach para setup
```javascript
describe('Mi Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Otros setups necesarios
  });

  // tests...
});
```

### 4. Tests independientes
Cada test debe ser independiente y no depender del estado de otros tests.

### 5. Assertions claras
```javascript
// ❌ Mal
expect(result).toBeTruthy();

// ✅ Bien
expect(result).toBe(expectedValue);
expect(result).toHaveLength(5);
expect(result).toMatchObject({ id: 1, name: 'Test' });
```

## 🔧 Configuración

La configuración de Jest está en `jest.config.js`:

- **testEnvironment**: node (para backend)
- **testMatch**: `**/tests/**/*.test.js`
- **collectCoverageFrom**: `src/**/*.js`
- **coverageThreshold**: 50% (branches, functions, lines, statements)

## 📈 Cobertura de Código

Para ver el reporte de cobertura:

```bash
npm run test:coverage
```

Esto generará:
- Reporte en terminal
- Reporte HTML en `coverage/index.html`
- Reporte LCOV en `coverage/lcov-report/`

## 🐛 Debugging Tests

### Ejecutar un solo archivo de tests
```bash
npx jest tests/unit/utils/totales.test.js
```

### Ejecutar un solo test
```bash
npx jest -t "debe calcular el total correctamente"
```

### Ejecutar tests en modo debug
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## ❓ FAQ

### ¿Por qué usar Jest en lugar de Mocha?
Jest es más completo out-of-the-box:
- Mocking integrado
- Cobertura incluida
- Configuración mínima
- Mejor para proyectos Node.js modernos

### ¿Cómo mockear módulos externos?
```javascript
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: '123' }),
  })),
}));
```

### ¿Cómo testear código asíncrono?
```javascript
test('debe retornar datos async', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});
```

### ¿Cómo testear que se lanza un error?
```javascript
test('debe lanzar error', () => {
  expect(() => miFuncion()).toThrow('Error message');
});
```

## 🔗 Enlaces Útiles

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Jest Expect API](https://jestjs.io/docs/expect)
- [Jest Mock Functions](https://jestjs.io/docs/mock-functions)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## 🤝 Contribuir

Al agregar nuevas funcionalidades al backend:

1. **Escribe el código**
2. **Escribe los tests** en el directorio apropiado
3. **Ejecuta los tests**: `npm test`
4. **Verifica cobertura**: `npm run test:coverage`
5. **Asegúrate de que todos pasen** antes de hacer commit

¡Mantengamos la calidad del código alta! 🚀
