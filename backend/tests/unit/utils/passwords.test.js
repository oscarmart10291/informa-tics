// tests/unit/utils/passwords.test.js
const { genTempPassword } = require('../../../src/utils/passwords');

describe('passwords - genTempPassword', () => {
  describe('Formato de salida', () => {
    test('debe generar una contraseña temporal con formato correcto', () => {
      const password = genTempPassword();

      // Formato esperado: "xxxx-yyyy" donde xxxx son 4 caracteres hex y yyyy son 4 caracteres base64url
      expect(password).toMatch(/^[a-f0-9]{4}-[A-Za-z0-9_-]{4}$/);
    });

    test('debe contener un guión separador', () => {
      const password = genTempPassword();
      expect(password).toContain('-');
    });

    test('debe tener longitud de 9 caracteres (4 + guión + 4)', () => {
      const password = genTempPassword();
      expect(password).toHaveLength(9);
    });

    test('la primera parte debe ser hexadecimal (4 caracteres)', () => {
      const password = genTempPassword();
      const firstPart = password.split('-')[0];

      expect(firstPart).toHaveLength(4);
      expect(firstPart).toMatch(/^[a-f0-9]{4}$/);
    });

    test('la segunda parte debe ser base64url (4 caracteres)', () => {
      const password = genTempPassword();
      const secondPart = password.split('-')[1];

      expect(secondPart).toHaveLength(4);
      expect(secondPart).toMatch(/^[A-Za-z0-9_-]{4}$/);
    });
  });

  describe('Unicidad', () => {
    test('debe generar contraseñas diferentes en llamadas consecutivas', () => {
      const password1 = genTempPassword();
      const password2 = genTempPassword();

      expect(password1).not.toBe(password2);
    });

    test('debe generar contraseñas únicas en 100 intentos', () => {
      const passwords = new Set();

      for (let i = 0; i < 100; i++) {
        passwords.add(genTempPassword());
      }

      // Todas deben ser únicas
      expect(passwords.size).toBe(100);
    });

    test('debe generar contraseñas únicas en 1000 intentos', () => {
      const passwords = new Set();

      for (let i = 0; i < 1000; i++) {
        passwords.add(genTempPassword());
      }

      // Permitir máximo 1 colisión en 1000 intentos (muy improbable pero posible)
      expect(passwords.size).toBeGreaterThanOrEqual(999);
    });
  });

  describe('Tipo de dato', () => {
    test('debe retornar un string', () => {
      const password = genTempPassword();
      expect(typeof password).toBe('string');
    });

    test('no debe retornar null o undefined', () => {
      const password = genTempPassword();
      expect(password).not.toBeNull();
      expect(password).not.toBeUndefined();
    });

    test('no debe retornar string vacío', () => {
      const password = genTempPassword();
      expect(password.length).toBeGreaterThan(0);
    });
  });

  describe('Características de seguridad', () => {
    test('debe contener caracteres alfanuméricos', () => {
      const password = genTempPassword();
      expect(password).toMatch(/[a-zA-Z0-9]/);
    });

    test('debe tener entropía suficiente (diferentes caracteres)', () => {
      const password = genTempPassword();
      const uniqueChars = new Set(password.replace('-', ''));

      // Debe tener al menos 4 caracteres únicos (sin contar el guión)
      expect(uniqueChars.size).toBeGreaterThanOrEqual(4);
    });

    test('no debe contener espacios', () => {
      const password = genTempPassword();
      expect(password).not.toContain(' ');
    });

    test('no debe contener caracteres especiales excepto guión y caracteres base64url', () => {
      const password = genTempPassword();
      // Solo permite: a-z, A-Z, 0-9, guión, y caracteres base64url (_ y -)
      expect(password).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('Casos de uso real', () => {
    test('las contraseñas generadas deben ser válidas para URLs', () => {
      const password = genTempPassword();

      // No debe contener caracteres que necesiten encoding en URL
      const encoded = encodeURIComponent(password);
      expect(encoded).toBe(password);
    });

    test('debe generar contraseñas que se puedan copiar fácilmente', () => {
      const password = genTempPassword();

      // No debe contener caracteres ambiguos o difíciles de distinguir
      // (esto es subjetivo, pero podemos verificar que no hay caracteres raros)
      expect(password).not.toContain('\\');
      expect(password).not.toContain('"');
      expect(password).not.toContain("'");
    });

    test('debe generar múltiples contraseñas rápidamente', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        genTempPassword();
      }

      const duration = Date.now() - start;

      // Debe generar 1000 contraseñas en menos de 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Distribución de caracteres', () => {
    test('debe usar variedad de caracteres en primera parte (hex)', () => {
      const passwords = Array(50).fill(null).map(() => genTempPassword());
      const firstParts = passwords.map(p => p.split('-')[0]);
      const allChars = firstParts.join('');

      // Debe usar al menos 10 caracteres hexadecimales diferentes en 50 passwords
      const uniqueChars = new Set(allChars);
      expect(uniqueChars.size).toBeGreaterThanOrEqual(10);
    });

    test('debe usar variedad de caracteres en segunda parte (base64url)', () => {
      const passwords = Array(50).fill(null).map(() => genTempPassword());
      const secondParts = passwords.map(p => p.split('-')[1]);
      const allChars = secondParts.join('');

      // Debe usar al menos 15 caracteres diferentes en 50 passwords
      const uniqueChars = new Set(allChars);
      expect(uniqueChars.size).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Robustez', () => {
    test('debe funcionar correctamente después de muchas llamadas', () => {
      // Generar 100 contraseñas y verificar que todas son válidas
      for (let i = 0; i < 100; i++) {
        const password = genTempPassword();
        expect(password).toMatch(/^[a-f0-9]{4}-[A-Za-z0-9_-]{4}$/);
      }
    });

    test('no debe lanzar excepciones', () => {
      expect(() => genTempPassword()).not.toThrow();
    });

    test('debe ser consistente en su formato', () => {
      const passwords = Array(20).fill(null).map(() => genTempPassword());

      passwords.forEach(password => {
        expect(password).toHaveLength(9);
        // La segunda parte puede contener guiones (base64url), así que verificamos de otra forma
        const firstPart = password.substring(0, 4);
        const separator = password.charAt(4);
        const secondPart = password.substring(5);

        expect(firstPart).toHaveLength(4);
        expect(separator).toBe('-');
        expect(secondPart).toHaveLength(4);
        expect(firstPart).toMatch(/^[a-f0-9]{4}$/);
      });
    });
  });

  describe('Ejemplos de salida válidos', () => {
    test('debe generar contraseñas con formato similar a los ejemplos documentados', () => {
      const password = genTempPassword();

      // Ejemplos documentados en el código: "a1f9-Xk7B"
      // Primera parte: 4 caracteres hex minúsculas
      const firstPart = password.substring(0, 4);
      expect(firstPart).toMatch(/^[a-f0-9]{4}$/);

      // Guión separador en posición 4
      expect(password.charAt(4)).toBe('-');

      // Segunda parte: 4 caracteres alfanuméricos (puede incluir guiones en base64url)
      const secondPart = password.substring(5);
      expect(secondPart).toHaveLength(4);
    });

    test('múltiples generaciones deben seguir el mismo patrón', () => {
      const passwords = [
        genTempPassword(),
        genTempPassword(),
        genTempPassword()
      ];

      passwords.forEach(password => {
        expect(password).toMatch(/^[a-f0-9]{4}-[A-Za-z0-9_-]{4}$/);
      });
    });
  });
});
