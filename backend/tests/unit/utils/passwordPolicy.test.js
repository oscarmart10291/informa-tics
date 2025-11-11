// tests/unit/utils/passwordPolicy.test.js
const bcrypt = require('bcryptjs');
const {
  isStrongPassword,
  policyMessage,
  isReusedPassword
} = require('../../../src/utils/passwordPolicy');

describe('passwordPolicy - isStrongPassword', () => {
  describe('Validaciones exitosas', () => {
    test('debe aceptar una contraseña válida con todos los requisitos', () => {
      const validPassword = 'MyP@ssw0rd123';
      expect(isStrongPassword(validPassword)).toBe(true);
    });

    test('debe aceptar contraseña con exactamente 10 caracteres', () => {
      const minLengthPassword = 'MyP@ss0rd1';
      expect(isStrongPassword(minLengthPassword)).toBe(true);
    });

    test('debe aceptar contraseña con múltiples caracteres especiales', () => {
      const specialCharsPassword = 'MyP@ss!#$%^&*()w0rd';
      expect(isStrongPassword(specialCharsPassword)).toBe(true);
    });

    test('debe aceptar contraseña con espacios como caracter especial', () => {
      const spacePassword = 'MyP@ss w0rd Space';
      expect(isStrongPassword(spacePassword)).toBe(true);
    });

    test('debe aceptar contraseña muy larga', () => {
      const longPassword = 'MyP@ssw0rd123456789ABCDEFGHIJKLMNOP';
      expect(isStrongPassword(longPassword)).toBe(true);
    });
  });

  describe('Validaciones fallidas', () => {
    test('debe rechazar contraseña con menos de 10 caracteres', () => {
      const shortPassword = 'MyP@ss0';
      expect(isStrongPassword(shortPassword)).toBe(false);
    });

    test('debe rechazar contraseña sin mayúsculas', () => {
      const noUppercase = 'myp@ssw0rd123';
      expect(isStrongPassword(noUppercase)).toBe(false);
    });

    test('debe rechazar contraseña sin minúsculas', () => {
      const noLowercase = 'MYP@SSW0RD123';
      expect(isStrongPassword(noLowercase)).toBe(false);
    });

    test('debe rechazar contraseña sin números', () => {
      const noDigit = 'MyP@ssword!!!';
      expect(isStrongPassword(noDigit)).toBe(false);
    });

    test('debe rechazar contraseña sin caracteres especiales', () => {
      const noSpecial = 'MyPassword123';
      expect(isStrongPassword(noSpecial)).toBe(false);
    });

    test('debe rechazar string vacío', () => {
      expect(isStrongPassword('')).toBe(false);
    });

    test('debe rechazar null', () => {
      expect(isStrongPassword(null)).toBe(false);
    });

    test('debe rechazar undefined', () => {
      expect(isStrongPassword(undefined)).toBe(false);
    });

    test('debe rechazar número', () => {
      expect(isStrongPassword(12345678901)).toBe(false);
    });

    test('debe rechazar objeto', () => {
      expect(isStrongPassword({ password: 'MyP@ssw0rd' })).toBe(false);
    });

    test('debe rechazar array', () => {
      expect(isStrongPassword(['MyP@ssw0rd'])).toBe(false);
    });
  });

  describe('Casos edge', () => {
    test('debe rechazar contraseña con solo espacios', () => {
      expect(isStrongPassword('          ')).toBe(false);
    });

    test('debe rechazar contraseña que cumple longitud pero falta un requisito', () => {
      const almostValid = 'mypassword123!'; // Falta mayúscula
      expect(isStrongPassword(almostValid)).toBe(false);
    });
  });
});

describe('passwordPolicy - policyMessage', () => {
  test('debe retornar el mensaje de política con los requisitos', () => {
    const message = policyMessage();
    expect(message).toContain('10 caracteres');
    expect(message).toContain('mayúscula');
    expect(message).toContain('minúscula');
    expect(message).toContain('número');
    expect(message).toContain('caracter especial');
  });

  test('debe retornar siempre el mismo mensaje', () => {
    const message1 = policyMessage();
    const message2 = policyMessage();
    expect(message1).toBe(message2);
  });

  test('debe retornar un string no vacío', () => {
    const message = policyMessage();
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });
});

describe('passwordPolicy - isReusedPassword', () => {
  describe('Detección de contraseñas reutilizadas', () => {
    test('debe detectar que una contraseña fue reutilizada', async () => {
      const plainPassword = 'MyP@ssw0rd123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const lastHashes = [
        { hash: hashedPassword },
        { hash: await bcrypt.hash('OtherP@ss1', 10) }
      ];

      const isReused = await isReusedPassword(plainPassword, lastHashes);
      expect(isReused).toBe(true);
    });

    test('debe retornar false si la contraseña no fue reutilizada', async () => {
      const newPassword = 'NewP@ssw0rd456';

      const lastHashes = [
        { hash: await bcrypt.hash('OldP@ss1', 10) },
        { hash: await bcrypt.hash('OldP@ss2', 10) }
      ];

      const isReused = await isReusedPassword(newPassword, lastHashes);
      expect(isReused).toBe(false);
    });

    test('debe retornar false si el array de hashes está vacío', async () => {
      const password = 'MyP@ssw0rd123';
      const isReused = await isReusedPassword(password, []);
      expect(isReused).toBe(false);
    });

    test('debe retornar false si lastNHashes es null', async () => {
      const password = 'MyP@ssw0rd123';
      const isReused = await isReusedPassword(password, null);
      expect(isReused).toBe(false);
    });

    test('debe retornar false si lastNHashes es undefined', async () => {
      const password = 'MyP@ssw0rd123';
      const isReused = await isReusedPassword(password);
      expect(isReused).toBe(false);
    });
  });

  describe('Manejo de errores', () => {
    test('debe manejar hashes corruptos sin lanzar error', async () => {
      const password = 'MyP@ssw0rd123';

      const lastHashes = [
        { hash: 'hash-invalido-corrupto' },
        { hash: 'otro-hash-corrupto' }
      ];

      const isReused = await isReusedPassword(password, lastHashes);
      expect(isReused).toBe(false);
    });

    test('debe manejar mezcla de hashes válidos e inválidos', async () => {
      const password = 'MyP@ssw0rd123';

      const lastHashes = [
        { hash: 'hash-invalido' },
        { hash: await bcrypt.hash('OtherP@ss1', 10) },
        { hash: null }
      ];

      // No debe lanzar error y debe retornar false
      const isReused = await isReusedPassword(password, lastHashes);
      expect(isReused).toBe(false);
    });
  });

  describe('Casos con múltiples hashes', () => {
    test('debe encontrar coincidencia en el primer hash', async () => {
      const password = 'MatchFirst123!';
      const firstHash = await bcrypt.hash(password, 10);

      const lastHashes = [
        { hash: firstHash },
        { hash: await bcrypt.hash('Other1!', 10) },
        { hash: await bcrypt.hash('Other2!', 10) }
      ];

      const isReused = await isReusedPassword(password, lastHashes);
      expect(isReused).toBe(true);
    });

    test('debe encontrar coincidencia en el último hash', async () => {
      const password = 'MatchLast123!';
      const lastHash = await bcrypt.hash(password, 10);

      const lastHashes = [
        { hash: await bcrypt.hash('Other1!', 10) },
        { hash: await bcrypt.hash('Other2!', 10) },
        { hash: lastHash }
      ];

      const isReused = await isReusedPassword(password, lastHashes);
      expect(isReused).toBe(true);
    });

    test('debe encontrar coincidencia en el medio de múltiples hashes', async () => {
      const password = 'MatchMiddle123!';
      const middleHash = await bcrypt.hash(password, 10);

      const lastHashes = [
        { hash: await bcrypt.hash('Other1!', 10) },
        { hash: middleHash },
        { hash: await bcrypt.hash('Other2!', 10) }
      ];

      const isReused = await isReusedPassword(password, lastHashes);
      expect(isReused).toBe(true);
    });
  });
});
