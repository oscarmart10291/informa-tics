// stress-test-full-flow.js - Prueba de Carga Masiva con FLUJO COMPLETO
// Ejecuta: Crear Orden → Cocina/Barra → Finalizar → Cobrar

const { PrismaClient } = require('./src/generated/prisma');
const axios = require('axios');

const prisma = new PrismaClient();

// ============== CONFIGURACIÓN ==============
const CONFIG = {
  API_URL: process.env.API_URL || 'http://localhost:3001',
  NUM_ORDENES: parseInt(process.env.NUM_ORDENES) || 1000,
  NUM_CATEGORIAS: 20,
  NUM_PLATILLOS: 100,
  NUM_MESAS: 150,
  ITEMS_POR_ORDEN_MIN: 2,
  ITEMS_POR_ORDEN_MAX: 8,
  AUTO_CLEAN: process.env.AUTO_CLEAN !== 'false',
  SIMULATE_PREP_TIME: process.env.SIMULATE_PREP_TIME === 'true', // Simular tiempo de preparación
};

// ============== DATOS DE SEED (igual que stress-test.js) ==============

const CATEGORIAS_COMESTIBLES = [
  'Entradas', 'Sopas', 'Ensaladas', 'Platos Fuertes', 'Carnes',
  'Pescados y Mariscos', 'Pastas', 'Pizzas', 'Hamburguesas', 'Postres',
  'Extras', 'Guarniciones',
];

const CATEGORIAS_BEBIBLES = [
  'Bebidas Frías', 'Bebidas Calientes', 'Jugos Naturales', 'Cócteles',
  'Cervezas', 'Vinos', 'Licores', 'Refrescos',
];

const PLATILLOS_EJEMPLOS = {
  'Entradas': [
    { nombre: 'Guacamole con Totopos', precio: 6.50 },
    { nombre: 'Nachos Supremos', precio: 8.00 },
    { nombre: 'Alitas BBQ', precio: 9.50 },
  ],
  'Platos Fuertes': [
    { nombre: 'Filete de Res', precio: 18.00 },
    { nombre: 'Pechuga a la Plancha', precio: 14.00 },
  ],
  'Bebidas Frías': [
    { nombre: 'Coca Cola', precio: 2.50 },
    { nombre: 'Limonada Natural', precio: 3.00 },
  ],
  'Bebidas Calientes': [
    { nombre: 'Café Americano', precio: 2.50 },
    { nombre: 'Cappuccino', precio: 3.50 },
  ],
};

// ============== UTILIDADES ==============

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createProgressBar(current, total, barLength = 40) {
  const percentage = (current / total) * 100;
  const filledLength = Math.floor((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  return `[${bar}] ${current}/${total} (${percentage.toFixed(1)}%)`;
}

// ============== FASE 1: SEED DE DATOS ==============

async function seedData() {
  console.log('\n🌱 FASE 1: Generando datos de prueba...\n');

  try {
    // 1. Verificar usuarios necesarios
    const mesero = await prisma.usuario.findFirst({
      where: { usuario: 'mesero1' },
      select: { id: true, nombre: true },
    });

    const cocinero = await prisma.usuario.findFirst({
      where: { rol: { nombre: 'Cocinero' } },
      select: { id: true, nombre: true },
    });

    const bartender = await prisma.usuario.findFirst({
      where: { rol: { nombre: 'Bartender' } },
      select: { id: true, nombre: true },
    });

    const cajero = await prisma.usuario.findFirst({
      where: { rol: { nombre: 'Cajero' } },
      select: { id: true, nombre: true },
    });

    if (!mesero || !cocinero || !bartender || !cajero) {
      console.error('❌ ERROR: Faltan usuarios. Ejecuta: npm run seed');
      console.error(`   - Mesero: ${mesero ? '✅' : '❌'}`);
      console.error(`   - Cocinero: ${cocinero ? '✅' : '❌'}`);
      console.error(`   - Bartender: ${bartender ? '✅' : '❌'}`);
      console.error(`   - Cajero: ${cajero ? '✅' : '❌'}`);
      process.exit(1);
    }

    console.log(`✅ Usuarios encontrados:`);
    console.log(`   - Mesero: ${mesero.nombre} (ID: ${mesero.id})`);
    console.log(`   - Cocinero: ${cocinero.nombre} (ID: ${cocinero.id})`);
    console.log(`   - Bartender: ${bartender.nombre} (ID: ${bartender.id})`);
    console.log(`   - Cajero: ${cajero.nombre} (ID: ${cajero.id})\n`);

    // 2. Limpiar datos anteriores
    if (CONFIG.AUTO_CLEAN) {
      console.log('🧹 Limpiando datos de pruebas anteriores...');

      const ordenesAEliminar = await prisma.orden.findMany({
        where: {
          mesero: { usuario: 'mesero1' },
          tickets: { none: {} },
        },
        select: { id: true },
      });

      if (ordenesAEliminar.length > 0) {
        const ordenesIds = ordenesAEliminar.map(o => o.id);
        const itemsEliminados = await prisma.ordenItem.deleteMany({
          where: { ordenId: { in: ordenesIds } },
        });
        const ordenesEliminadas = await prisma.orden.deleteMany({
          where: { id: { in: ordenesIds } },
        });
        console.log(`   - ${ordenesEliminadas.count} órdenes eliminadas`);
        console.log(`   - ${itemsEliminados.count} items eliminados`);
      } else {
        console.log(`   - 0 órdenes para eliminar`);
      }

      const mesasLiberadas = await prisma.mesa.updateMany({
        where: { estado: 'OCUPADA' },
        data: { estado: 'DISPONIBLE' },
      });
      console.log(`   - ${mesasLiberadas.count} mesas liberadas`);

      // Cerrar turnos de caja abiertos del cajero de prueba
      const cajero = await prisma.usuario.findFirst({
        where: { rol: { nombre: 'Cajero' } },
        select: { id: true },
      });

      if (cajero) {
        const turnosAbiertos = await prisma.cajaTurno.updateMany({
          where: {
            cajeroId: cajero.id,
            estado: { in: ['PENDIENTE', 'ABIERTA'] },
          },
          data: {
            estado: 'CERRADA',
            cerradoEn: new Date(),
          },
        });
        if (turnosAbiertos.count > 0) {
          console.log(`   - ${turnosAbiertos.count} turnos de caja cerrados`);
        }
      }
    }

    // 3. Crear Categorías
    console.log('\n📁 Creando categorías...');
    const categorias = [];
    const categoriasACrear = [
      ...CATEGORIAS_COMESTIBLES.map(nombre => ({ nombre, tipo: 'COMESTIBLE' })),
      ...CATEGORIAS_BEBIBLES.map(nombre => ({ nombre, tipo: 'BEBIBLE' })),
    ];

    for (const cat of categoriasACrear) {
      const categoria = await prisma.categoria.upsert({
        where: { nombre: cat.nombre },
        update: { activo: true, tipo: cat.tipo },
        create: { nombre: cat.nombre, tipo: cat.tipo, activo: true },
      });
      categorias.push(categoria);
    }
    console.log(`✅ ${categorias.length} categorías creadas`);

    // 4. Crear Platillos
    console.log('\n🍽️  Creando platillos...');
    const platillos = [];
    let platilloCounter = 0;

    for (const [categoriaNombre, items] of Object.entries(PLATILLOS_EJEMPLOS)) {
      const categoria = categorias.find(c => c.nombre === categoriaNombre);
      if (!categoria) continue;

      for (const item of items) {
        const platillo = await prisma.platillo.upsert({
          where: { nombre: item.nombre },
          update: { precio: item.precio, disponible: true, categoriaId: categoria.id },
          create: { nombre: item.nombre, precio: item.precio, categoriaId: categoria.id, disponible: true },
        });
        platillos.push(platillo);
        platilloCounter++;
      }
    }

    while (platilloCounter < CONFIG.NUM_PLATILLOS) {
      const categoria = getRandomElement(categorias);
      const nombre = `${categoria.nombre} Especial ${platilloCounter}`;
      const precio = parseFloat((Math.random() * 20 + 5).toFixed(2));

      try {
        const platillo = await prisma.platillo.create({
          data: { nombre, precio, categoriaId: categoria.id, disponible: true },
        });
        platillos.push(platillo);
        platilloCounter++;
      } catch (e) {
        continue;
      }
    }
    console.log(`✅ ${platillos.length} platillos creados`);

    // 5. Crear Mesas
    console.log('\n🪑 Creando mesas...');
    const mesas = [];
    for (let i = 1; i <= CONFIG.NUM_MESAS; i++) {
      const capacidad = getRandomInt(2, 8);
      const mesa = await prisma.mesa.upsert({
        where: { numero: i },
        update: { capacidad, activa: true },
        create: { numero: i, capacidad, activa: true },
      });
      mesas.push(mesa);
    }
    console.log(`✅ ${mesas.length} mesas creadas`);

    // 6. Crear turno de caja si no existe
    console.log('\n💰 Verificando turno de caja...');
    const turnoActivo = await prisma.cajaTurno.findFirst({
      where: {
        cajeroId: cajero.id,
        estado: 'ABIERTA', // Buscar turno abierto
      },
    });

    if (!turnoActivo) {
      // Buscar un admin para autorizar (puede ser el usuario admin)
      const admin = await prisma.usuario.findFirst({
        where: { rol: { nombre: 'Administrador' } },
        select: { id: true },
      });

      const nuevoTurno = await prisma.cajaTurno.create({
        data: {
          cajeroId: cajero.id,
          montoApertura: 100.00,
          estado: 'ABIERTA', // Crear directamente como ABIERTA
          autorizadoPorId: admin?.id, // Autorizado por admin
          autorizadoEn: new Date(), // Fecha de autorización
        },
      });
      console.log(`✅ Turno de caja creado y autorizado (ID: ${nuevoTurno.id})`);
    } else {
      console.log(`✅ Turno de caja abierto (ID: ${turnoActivo.id})`);
    }

    return {
      meseroId: mesero.id,
      cocineroId: cocinero.id,
      bartenderId: bartender.id,
      cajeroId: cajero.id,
      categorias,
      platillos,
      mesas,
    };

  } catch (error) {
    console.error('❌ Error en seed de datos:', error);
    throw error;
  }
}

// ============== FASE 2: FLUJO COMPLETO DE ORDEN ==============

async function procesarOrdenCompleta(mesaNum, meseroId, cocineroId, bartenderId, cajeroId, platillos) {
  const startTime = Date.now();
  const timings = {};

  try {
    // PASO 1: Crear Orden
    const numItems = getRandomInt(CONFIG.ITEMS_POR_ORDEN_MIN, CONFIG.ITEMS_POR_ORDEN_MAX);
    const items = [];

    for (let i = 0; i < numItems; i++) {
      const platillo = getRandomElement(platillos);
      const categoria = await prisma.categoria.findUnique({
        where: { id: platillo.categoriaId },
        select: { tipo: true },
      });

      items.push({
        nombre: platillo.nombre,
        precio: platillo.precio,
        tipo: categoria.tipo === 'BEBIBLE' ? 'BEBIDA' : 'PLATILLO',
      });
    }

    const createStart = Date.now();
    const ordenResponse = await axios.post(`${CONFIG.API_URL}/ordenes`, {
      mesa: mesaNum,
      meseroId,
      items,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Json': JSON.stringify({
          id: meseroId,
          nombre: 'mesero1',
          rol: { nombre: 'Mesero' },
          permisos: ['GENERAR_ORDEN', 'VER_ORDENES'],
        }),
      },
      timeout: 30000,
    });
    timings.crear = Date.now() - createStart;

    const orden = ordenResponse.data.orden; // La respuesta tiene estructura { mensaje, orden }
    const ordenId = orden.id;

    // Simular pequeño delay si está configurado
    if (CONFIG.SIMULATE_PREP_TIME) {
      await sleep(getRandomInt(100, 500));
    }

    // PASO 2: Procesar items en Cocina y Barra
    const prepStart = Date.now();
    const prepPromises = orden.items.map(async (item) => {
      const esBebida = item.tipo === 'BEBIDA';
      const endpoint = esBebida ? 'barra' : 'cocina';
      const trabajadorId = esBebida ? bartenderId : cocineroId;

      try {
        // Marcar como preparando
        await axios.post(`${CONFIG.API_URL}/${endpoint}/items/${item.id}/preparar`, {
          [esBebida ? 'bartenderId' : 'chefId']: trabajadorId,
        }, {
          headers: {
            'X-User-Json': JSON.stringify({
              id: trabajadorId,
              rol: { nombre: esBebida ? 'Bartender' : 'Cocinero' },
              permisos: [esBebida ? 'BARRA_VIEW' : 'COCINA_VIEW'],
            }),
          },
          timeout: 10000,
        });

        // Simular tiempo de preparación
        if (CONFIG.SIMULATE_PREP_TIME) {
          await sleep(getRandomInt(50, 200));
        }

        // Marcar como listo
        await axios.patch(`${CONFIG.API_URL}/${endpoint}/items/${item.id}/listo`, {}, {
          headers: {
            'X-User-Json': JSON.stringify({
              id: trabajadorId,
              rol: { nombre: esBebida ? 'Bartender' : 'Cocinero' },
              permisos: [esBebida ? 'BARRA_VIEW' : 'COCINA_VIEW'],
            }),
          },
          timeout: 10000,
        });

        return { success: true, itemId: item.id };
      } catch (error) {
        return { success: false, itemId: item.id, error: error.message };
      }
    });

    const prepResults = await Promise.all(prepPromises);
    timings.preparar = Date.now() - prepStart;

    const prepFailed = prepResults.filter(r => !r.success).length;
    if (prepFailed > 0) {
      throw new Error(`${prepFailed} items fallaron en cocina/barra`);
    }

    // PASO 3: Finalizar Orden
    const finalizarStart = Date.now();
    await axios.patch(`${CONFIG.API_URL}/ordenes/${ordenId}/finalizar`, {}, {
      headers: {
        'X-User-Json': JSON.stringify({
          id: meseroId,
          rol: { nombre: 'Mesero' },
          permisos: ['GENERAR_ORDEN', 'VER_ORDENES'],
        }),
      },
      timeout: 10000,
    });
    timings.finalizar = Date.now() - finalizarStart;

    // PASO 4: Cobrar (Pago completo)
    const pagarStart = Date.now();
    const totalOrden = items.reduce((sum, item) => sum + item.precio, 0);
    const metodoPago = Math.random() > 0.5 ? 'EFECTIVO' : 'TARJETA';

    const pagoPayload = {
      ordenId,
      metodoPago,
      clienteNombre: 'Cliente Prueba',
    };

    if (metodoPago === 'EFECTIVO') {
      pagoPayload.montoRecibido = Math.ceil(totalOrden + 10); // Redondear hacia arriba
    } else {
      pagoPayload.posCorrelativo = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    await axios.post(`${CONFIG.API_URL}/caja/pagar`, pagoPayload, {
      headers: {
        'X-User-Json': JSON.stringify({
          id: cajeroId,
          rol: { nombre: 'Cajero' },
          permisos: ['CAJA'],
        }),
      },
      timeout: 10000,
    });
    timings.pagar = Date.now() - pagarStart;

    const totalDuration = Date.now() - startTime;

    return {
      success: true,
      ordenId,
      mesa: mesaNum,
      items: items.length,
      total: totalOrden,
      metodoPago,
      timings,
      duration: totalDuration,
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      mesa: mesaNum,
      timings,
      duration: totalDuration,
      status: error.response?.status,
    };
  }
}

// ============== FASE 3: PRUEBA DE ESTRÉS ==============

async function stressTest(meseroId, cocineroId, bartenderId, cajeroId, platillos, mesas) {
  console.log('\n🔥 FASE 2: Iniciando prueba de carga masiva con FLUJO COMPLETO...\n');
  console.log(`📊 Configuración:`);
  console.log(`   - Órdenes a procesar: ${CONFIG.NUM_ORDENES}`);
  console.log(`   - Flujo: Crear → Cocina/Barra → Finalizar → Cobrar`);
  console.log(`   - Simular tiempos de prep: ${CONFIG.SIMULATE_PREP_TIME ? 'SÍ' : 'NO'}`);
  console.log(`   - API URL: ${CONFIG.API_URL}`);
  console.log(`   - Mesas disponibles: ${mesas.length}`);
  console.log(`   - Platillos disponibles: ${platillos.length}\n`);

  // Verificar servidor
  try {
    await axios.get(`${CONFIG.API_URL}/categorias`, { timeout: 5000 });
    console.log('✅ Servidor API responde correctamente\n');
  } catch (error) {
    console.error(`❌ ERROR: No se puede conectar con el servidor en ${CONFIG.API_URL}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const promises = [];
  const results = {
    success: 0,
    failed: 0,
    errors: {},
    durations: [],
    timingsByStep: {
      crear: [],
      preparar: [],
      finalizar: [],
      pagar: [],
    },
  };

  console.log('🚀 Lanzando órdenes concurrentes...\n');

  // Crear todas las órdenes concurrentemente
  for (let i = 0; i < CONFIG.NUM_ORDENES; i++) {
    const mesaNum = (i % mesas.length) + 1;

    const promise = procesarOrdenCompleta(mesaNum, meseroId, cocineroId, bartenderId, cajeroId, platillos)
      .then(result => {
        if (result.success) {
          results.success++;
          results.durations.push(result.duration);

          // Agregar timings por paso
          Object.keys(result.timings).forEach(step => {
            if (results.timingsByStep[step]) {
              results.timingsByStep[step].push(result.timings[step]);
            }
          });
        } else {
          results.failed++;
          const errorKey = result.error || 'Unknown error';
          results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;
        }

        // Mostrar progreso
        const total = results.success + results.failed;
        if (total % 50 === 0 || total === CONFIG.NUM_ORDENES) {
          console.log(createProgressBar(total, CONFIG.NUM_ORDENES));
        }

        return result;
      })
      .catch(error => {
        results.failed++;
        const errorKey = 'Network/Timeout error';
        results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;
      });

    promises.push(promise);
  }

  // Esperar a que todas terminen
  await Promise.allSettled(promises);

  const totalTime = Date.now() - startTime;

  // ============== RESULTADOS ==============
  console.log('\n\n' + '='.repeat(70));
  console.log('📈 RESULTADOS DE LA PRUEBA DE ESTRÉS - FLUJO COMPLETO');
  console.log('='.repeat(70) + '\n');

  console.log('⏱️  TIEMPO TOTAL:');
  console.log(`   - Tiempo total: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`   - Órdenes por segundo: ${(CONFIG.NUM_ORDENES / (totalTime / 1000)).toFixed(2)}\n`);

  console.log('✅ ÉXITOS:');
  console.log(`   - Órdenes completadas: ${results.success} (${((results.success / CONFIG.NUM_ORDENES) * 100).toFixed(1)}%)`);
  console.log(`   - Flujo: Creadas → Cocinadas → Finalizadas → Cobradas\n`);

  if (results.failed > 0) {
    console.log('❌ FALLOS:');
    console.log(`   - Órdenes fallidas: ${results.failed} (${((results.failed / CONFIG.NUM_ORDENES) * 100).toFixed(1)}%)\n`);
    console.log('   Distribución de errores:');
    Object.entries(results.errors)
      .sort((a, b) => b[1] - a[1])
      .forEach(([error, count]) => {
        console.log(`      - ${error}: ${count} veces`);
      });
    console.log();
  }

  if (results.durations.length > 0) {
    const sortedDurations = results.durations.sort((a, b) => a - b);
    const avg = results.durations.reduce((a, b) => a + b, 0) / results.durations.length;
    const min = sortedDurations[0];
    const max = sortedDurations[sortedDurations.length - 1];
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
    const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];

    console.log('⚡ TIEMPOS DE RESPUESTA COMPLETOS (ms):');
    console.log(`   - Mínimo: ${min}ms`);
    console.log(`   - Promedio: ${avg.toFixed(2)}ms`);
    console.log(`   - Mediana (P50): ${p50}ms`);
    console.log(`   - P95: ${p95}ms`);
    console.log(`   - P99: ${p99}ms`);
    console.log(`   - Máximo: ${max}ms\n`);
  }

  // Tiempos por paso
  console.log('🎯 TIEMPOS POR PASO (Promedio):');
  Object.entries(results.timingsByStep).forEach(([step, times]) => {
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const stepNames = {
        crear: 'Crear Orden',
        preparar: 'Cocina/Barra',
        finalizar: 'Finalizar',
        pagar: 'Cobrar',
      };
      console.log(`   - ${stepNames[step]}: ${avg.toFixed(2)}ms`);
    }
  });
  console.log();

  // Verificar en base de datos
  const ordenesCreadas = await prisma.orden.count({
    where: {
      meseroId,
      fecha: { gte: new Date(startTime) },
    },
  });

  const ordenesPagadas = await prisma.orden.count({
    where: {
      meseroId,
      fecha: { gte: new Date(startTime) },
      estado: 'PAGADA',
    },
  });

  const ticketsCreados = await prisma.ticketVenta.count({
    where: {
      fechaPago: { gte: new Date(startTime) },
    },
  });

  console.log('💾 DATOS EN BASE DE DATOS:');
  console.log(`   - Órdenes creadas: ${ordenesCreadas}`);
  console.log(`   - Órdenes pagadas: ${ordenesPagadas}`);
  console.log(`   - Tickets generados: ${ticketsCreados}`);
  console.log(`   - Tasa de completitud: ${((ordenesPagadas / ordenesCreadas) * 100).toFixed(1)}%\n`);

  console.log('='.repeat(70) + '\n');

  return results;
}

// ============== MAIN ==============

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 PRUEBA DE ESTRÉS - FLUJO COMPLETO END-TO-END');
  console.log('   Crear Orden → Cocina/Barra → Finalizar → Cobrar');
  console.log('='.repeat(70));

  try {
    const data = await seedData();
    await stressTest(
      data.meseroId,
      data.cocineroId,
      data.bartenderId,
      data.cajeroId,
      data.platillos,
      data.mesas
    );

    console.log('✅ Prueba de estrés completada exitosamente!\n');

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { seedData, stressTest };
