// tests/unit/middlewares/requirePerm.test.js

describe('requirePerm middleware', () => {
  let requirePerm;
  let originalEnv;

  beforeEach(() => {
    // Guardar env original
    originalEnv = { ...process.env };

    // Limpiar caché de require para recargar el módulo con nuevas env vars
    jest.resetModules();

    // Por defecto, modo estricto para tests
    process.env.STRICT_PERMS = 'true';
    process.env.PERMS_DEBUG = 'false';

    // Mock console para tests más limpios
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Cargar el módulo
    requirePerm = require('../../../src/middlewares/requirePerm');
  });

  afterEach(() => {
    // Restaurar env
    process.env = originalEnv;

    // Restaurar console
    console.warn.mockRestore();
    console.log.mockRestore();
    console.error.mockRestore();
  });

  // Helper para crear request/response mock
  const createMocks = () => {
    const req = {
      user: null,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    return { req, res, next };
  };

  describe('Modo NO estricto (desarrollo)', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.STRICT_PERMS = 'false';
      requirePerm = require('../../../src/middlewares/requirePerm');
    });

    test('debe permitir acceso sin usuario en modo no estricto', () => {
      const { req, res, next } = createMocks();

      const middleware = requirePerm(['ADMIN']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debe permitir acceso sin permisos en modo no estricto', () => {
      const { req, res, next } = createMocks();
      req.user = { id: 1, rol: { nombre: 'USER' } };

      const middleware = requirePerm(['ADMIN']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Modo estricto (producción)', () => {
    describe('Sin permisos requeridos', () => {
      test('debe permitir acceso si no se requieren permisos', () => {
        const { req, res, next } = createMocks();
        req.user = { id: 1, rol: { nombre: 'USER' } };

        const middleware = requirePerm([]);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      test('debe permitir acceso si anyOf es vacío', () => {
        const { req, res, next } = createMocks();
        req.user = { id: 1, rol: { nombre: 'USER' } };

        const middleware = requirePerm();
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Usuario no autenticado', () => {
      test('debe retornar 401 si no hay usuario', () => {
        const { req, res, next } = createMocks();

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHENTICATED' });
        expect(next).not.toHaveBeenCalled();
      });

      test('debe retornar 401 si req.user es null', () => {
        const { req, res, next } = createMocks();
        req.user = null;

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });

      test('debe retornar 401 si req.user es undefined', () => {
        const { req, res, next } = createMocks();

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Permisos con wildcard (*)', () => {
      test('debe permitir acceso con wildcard * en permisos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['*'],
          rol: { nombre: 'SUPERUSER' },
        };

        const middleware = requirePerm(['ADMIN', 'MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      test('debe dar wildcard automático a rol ADMIN', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: { nombre: 'ADMIN' },
        };

        const middleware = requirePerm(['MANAGE_USERS', 'DELETE_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe dar wildcard automático a rol ADMINISTRADOR', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: { nombre: 'ADMINISTRADOR' },
        };

        const middleware = requirePerm(['ANY_PERMISSION']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Verificación de permisos específicos', () => {
      test('debe permitir acceso si el usuario tiene el permiso requerido', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['MANAGE_USERS'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      test('debe permitir acceso si el usuario tiene al menos uno de los permisos requeridos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['READ_DATA'],
          rol: { nombre: 'USER' },
        };

        const middleware = requirePerm(['MANAGE_USERS', 'READ_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe denegar acceso si el usuario no tiene ningún permiso requerido', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['READ_DATA'],
          rol: { nombre: 'USER' },
        };

        const middleware = requirePerm(['MANAGE_USERS', 'DELETE_DATA']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Permiso insuficiente',
          })
        );
        expect(next).not.toHaveBeenCalled();
      });

      test('debe permitir acceso por rol como permiso implícito', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: { nombre: 'COCINERO' },
        };

        const middleware = requirePerm(['COCINERO']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Normalización de permisos', () => {
      test('debe normalizar permisos a mayúsculas', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['manage_users'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe normalizar espacios a guiones bajos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['manage users'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar permisos como objetos con clave', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: [{ clave: 'MANAGE_USERS' }],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar permisos como objetos con nombre', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: [{ nombre: 'MANAGE_USERS' }],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar permisos como objetos con key', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: [{ key: 'MANAGE_USERS' }],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe normalizar rol a mayúsculas y guiones bajos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: { nombre: 'super admin' },
        };

        const middleware = requirePerm(['SUPER_ADMIN']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Permisos desde rol', () => {
      test('debe leer permisos desde req.user.rol.permisos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: {
            nombre: 'MANAGER',
            permisos: ['MANAGE_USERS', 'VIEW_REPORTS'],
          },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe combinar permisos de usuario y rol', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['READ_DATA'],
          rol: {
            nombre: 'MANAGER',
            permisos: ['MANAGE_USERS'],
          },
        };

        const middleware = requirePerm(['READ_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe eliminar duplicados en permisos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['MANAGE_USERS', 'MANAGE_USERS'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Formatos de entrada', () => {
      test('debe aceptar permiso requerido como string', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['MANAGE_USERS'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm('MANAGE_USERS');
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe aceptar permisos requeridos como array', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['MANAGE_USERS'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS', 'DELETE_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe aceptar permisos como objetos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['MANAGE_USERS'],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm([{ clave: 'MANAGE_USERS' }]);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });

    describe('Opción strict', () => {
      test('debe permitir sobrescribir strict=false en opts', () => {
        const { req, res, next } = createMocks();
        // No hay usuario, pero strict=false

        const middleware = requirePerm(['ADMIN'], { strict: false });
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      test('debe permitir sobrescribir strict=true en opts', () => {
        jest.resetModules();
        process.env.STRICT_PERMS = 'false'; // Global no estricto
        requirePerm = require('../../../src/middlewares/requirePerm');

        const { req, res, next } = createMocks();
        // No hay usuario y forzamos strict=true

        const middleware = requirePerm(['ADMIN'], { strict: true });
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Manejo de errores', () => {
      test('debe capturar errores y retornar 500', () => {
        const { req, res, next } = createMocks();

        // Crear un usuario que cause error al acceder a sus propiedades
        Object.defineProperty(req, 'user', {
          get() {
            throw new Error('Test error');
          },
        });

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Error en middleware de permisos',
        });
        expect(next).not.toHaveBeenCalled();
      });

      test('debe loggear el error', () => {
        const { req, res, next } = createMocks();

        Object.defineProperty(req, 'user', {
          get() {
            throw new Error('Test error');
          },
        });

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(console.error).toHaveBeenCalledWith(
          'requirePerm error:',
          expect.any(Error)
        );
      });
    });

    describe('Casos edge', () => {
      test('debe manejar usuario sin rol', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['READ_DATA'],
        };

        const middleware = requirePerm(['READ_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar usuario con rol null', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['READ_DATA'],
          rol: null,
        };

        const middleware = requirePerm(['READ_DATA']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar permisos vacíos', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: [],
          rol: { nombre: 'USER' },
        };

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });

      test('debe manejar permisos undefined', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: { nombre: 'USER' },
        };

        const middleware = requirePerm(['ADMIN']);
        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
      });

      test('debe filtrar permisos vacíos y null', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          permisos: ['', null, undefined, 'MANAGE_USERS', '  '],
          rol: { nombre: 'MANAGER' },
        };

        const middleware = requirePerm(['MANAGE_USERS']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      test('debe manejar rol como string en req.user', () => {
        const { req, res, next } = createMocks();
        req.user = {
          id: 1,
          rol: 'COCINERO', // String en lugar de objeto
        };

        const middleware = requirePerm(['COCINERO']);
        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });
  });
});
