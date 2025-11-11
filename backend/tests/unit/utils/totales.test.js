// tests/unit/utils/totales.test.js
const { calcTotalesFromItems } = require('../../../src/utils/totales');

describe('totales - calcTotalesFromItems', () => {
  describe('Cálculos correctos', () => {
    test('debe calcular el total correctamente con items simples', () => {
      const items = [
        { cantidad: 2, precioUnit: 10.5 },
        { cantidad: 3, precioUnit: 5.0 }
      ];

      const result = calcTotalesFromItems(items);

      // (2 * 10.5) + (3 * 5.0) = 21 + 15 = 36
      expect(result.total).toBe(36);
    });

    test('debe calcular el total con un solo item', () => {
      const items = [
        { cantidad: 5, precioUnit: 7.5 }
      ];

      const result = calcTotalesFromItems(items);

      // 5 * 7.5 = 37.5
      expect(result.total).toBe(37.5);
    });

    test('debe manejar cantidades decimales', () => {
      const items = [
        { cantidad: 2.5, precioUnit: 10 },
        { cantidad: 1.5, precioUnit: 20 }
      ];

      const result = calcTotalesFromItems(items);

      // (2.5 * 10) + (1.5 * 20) = 25 + 30 = 55
      expect(result.total).toBe(55);
    });

    test('debe manejar precios decimales', () => {
      const items = [
        { cantidad: 3, precioUnit: 12.99 },
        { cantidad: 2, precioUnit: 8.50 }
      ];

      const result = calcTotalesFromItems(items);

      // (3 * 12.99) + (2 * 8.50) = 38.97 + 17.00 = 55.97
      expect(result.total).toBe(55.97);
    });

    test('debe redondear a 2 decimales correctamente', () => {
      const items = [
        { cantidad: 3, precioUnit: 10.333 }
      ];

      const result = calcTotalesFromItems(items);

      // 3 * 10.333 = 30.999 -> redondeado a 31.00
      expect(result.total).toBe(31);
    });

    test('debe manejar múltiples items con decimales complejos', () => {
      const items = [
        { cantidad: 2, precioUnit: 10.555 },
        { cantidad: 3, precioUnit: 7.777 },
        { cantidad: 1, precioUnit: 5.123 }
      ];

      const result = calcTotalesFromItems(items);

      // (2 * 10.555) + (3 * 7.777) + (1 * 5.123)
      // = 21.11 + 23.331 + 5.123 = 49.564 -> 49.56
      expect(result.total).toBe(49.56);
    });
  });

  describe('Casos edge', () => {
    test('debe retornar 0 para array vacío', () => {
      const items = [];
      const result = calcTotalesFromItems(items);
      expect(result.total).toBe(0);
    });

    test('debe manejar cantidad 0', () => {
      const items = [
        { cantidad: 0, precioUnit: 100 },
        { cantidad: 2, precioUnit: 10 }
      ];

      const result = calcTotalesFromItems(items);

      // (0 * 100) + (2 * 10) = 0 + 20 = 20
      expect(result.total).toBe(20);
    });

    test('debe manejar precio 0', () => {
      const items = [
        { cantidad: 5, precioUnit: 0 },
        { cantidad: 2, precioUnit: 10 }
      ];

      const result = calcTotalesFromItems(items);

      // (5 * 0) + (2 * 10) = 0 + 20 = 20
      expect(result.total).toBe(20);
    });

    test('debe manejar todos los items con precio 0', () => {
      const items = [
        { cantidad: 5, precioUnit: 0 },
        { cantidad: 3, precioUnit: 0 }
      ];

      const result = calcTotalesFromItems(items);
      expect(result.total).toBe(0);
    });

    test('debe manejar todos los items con cantidad 0', () => {
      const items = [
        { cantidad: 0, precioUnit: 50 },
        { cantidad: 0, precioUnit: 100 }
      ];

      const result = calcTotalesFromItems(items);
      expect(result.total).toBe(0);
    });
  });

  describe('Conversión de tipos', () => {
    test('debe convertir strings numéricos a números', () => {
      const items = [
        { cantidad: '2', precioUnit: '10.5' },
        { cantidad: '3', precioUnit: '5' }
      ];

      const result = calcTotalesFromItems(items);

      // (2 * 10.5) + (3 * 5) = 21 + 15 = 36
      expect(result.total).toBe(36);
    });

    test('debe manejar mezcla de números y strings', () => {
      const items = [
        { cantidad: 2, precioUnit: '10.5' },
        { cantidad: '3', precioUnit: 5 }
      ];

      const result = calcTotalesFromItems(items);
      expect(result.total).toBe(36);
    });

    test('debe convertir strings decimales correctamente', () => {
      const items = [
        { cantidad: '2.5', precioUnit: '10.75' }
      ];

      const result = calcTotalesFromItems(items);

      // 2.5 * 10.75 = 26.875 -> 26.88
      expect(result.total).toBe(26.88);
    });
  });

  describe('Valores grandes', () => {
    test('debe manejar cantidades muy grandes', () => {
      const items = [
        { cantidad: 1000, precioUnit: 99.99 }
      ];

      const result = calcTotalesFromItems(items);

      // 1000 * 99.99 = 99990
      expect(result.total).toBe(99990);
    });

    test('debe manejar precios muy grandes', () => {
      const items = [
        { cantidad: 5, precioUnit: 9999.99 }
      ];

      const result = calcTotalesFromItems(items);

      // 5 * 9999.99 = 49999.95
      expect(result.total).toBe(49999.95);
    });

    test('debe manejar muchos items', () => {
      const items = Array(100).fill({ cantidad: 1, precioUnit: 10 });

      const result = calcTotalesFromItems(items);

      // 100 items * (1 * 10) = 1000
      expect(result.total).toBe(1000);
    });
  });

  describe('Formato de resultado', () => {
    test('debe retornar un objeto con propiedad total', () => {
      const items = [{ cantidad: 1, precioUnit: 10 }];
      const result = calcTotalesFromItems(items);

      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');
    });

    test('debe retornar siempre un número (no string)', () => {
      const items = [{ cantidad: 2, precioUnit: 5.5 }];
      const result = calcTotalesFromItems(items);

      expect(typeof result.total).toBe('number');
      expect(result.total).not.toBe('11');
      expect(result.total).toBe(11);
    });

    test('no debe retornar decimales extra (máximo 2)', () => {
      const items = [{ cantidad: 3, precioUnit: 10.33333 }];
      const result = calcTotalesFromItems(items);

      const decimalPlaces = (result.total.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('Escenarios reales de restaurante', () => {
    test('debe calcular orden típica de restaurante', () => {
      const items = [
        { cantidad: 2, precioUnit: 45.50 },  // 2 platos principales
        { cantidad: 1, precioUnit: 15.00 },  // 1 entrada
        { cantidad: 3, precioUnit: 8.50 },   // 3 bebidas
        { cantidad: 2, precioUnit: 12.00 }   // 2 postres
      ];

      const result = calcTotalesFromItems(items);

      // (2*45.50) + (1*15.00) + (3*8.50) + (2*12.00)
      // = 91 + 15 + 25.5 + 24 = 155.5
      expect(result.total).toBe(155.5);
    });

    test('debe calcular orden con promoción (precio 0)', () => {
      const items = [
        { cantidad: 2, precioUnit: 30.00 },
        { cantidad: 1, precioUnit: 0 },      // Item gratis/promoción
        { cantidad: 2, precioUnit: 10.00 }
      ];

      const result = calcTotalesFromItems(items);

      // (2*30) + (1*0) + (2*10) = 60 + 0 + 20 = 80
      expect(result.total).toBe(80);
    });

    test('debe calcular orden con items fraccionarios (ej: 0.5 porción)', () => {
      const items = [
        { cantidad: 1, precioUnit: 50.00 },
        { cantidad: 0.5, precioUnit: 30.00 }, // Media porción
        { cantidad: 2, precioUnit: 15.00 }
      ];

      const result = calcTotalesFromItems(items);

      // (1*50) + (0.5*30) + (2*15) = 50 + 15 + 30 = 95
      expect(result.total).toBe(95);
    });
  });
});
