// stress-test.js - Prueba de Carga Masiva para Sistema de Restaurante
// Genera 1000 órdenes concurrentes para probar el rendimiento del sistema

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
  AUTO_CLEAN: process.env.AUTO_CLEAN !== 'false', // Por defecto limpia órdenes anteriores
};

// ============== DATOS DE SEED ==============

const CATEGORIAS_COMESTIBLES = [
  'Entradas',
  'Sopas',
  'Ensaladas',
  'Platos Fuertes',
  'Carnes',
  'Pescados y Mariscos',
  'Pastas',
  'Pizzas',
  'Hamburguesas',
  'Postres',
  'Extras',
  'Guarniciones',
];

const CATEGORIAS_BEBIBLES = [
  'Bebidas Frías',
  'Bebidas Calientes',
  'Jugos Naturales',
  'Cócteles',
  'Cervezas',
  'Vinos',
  'Licores',
  'Refrescos',
];

const PLATILLOS_EJEMPLOS = {
  'Entradas': [
    { nombre: 'Guacamole con Totopos', precio: 6.50 },
    { nombre: 'Nachos Supremos', precio: 8.00 },
    { nombre: 'Alitas BBQ', precio: 9.50 },
    { nombre: 'Dedos de Queso', precio: 7.00 },
    { nombre: 'Camarones al Ajillo', precio: 12.00 },
  ],
  'Sopas': [
    { nombre: 'Sopa del Día', precio: 5.00 },
    { nombre: 'Crema de Champiñones', precio: 6.00 },
    { nombre: 'Sopa Azteca', precio: 6.50 },
    { nombre: 'Consomé de Pollo', precio: 5.50 },
  ],
  'Ensaladas': [
    { nombre: 'Ensalada César', precio: 8.50 },
    { nombre: 'Ensalada Mixta', precio: 7.00 },
    { nombre: 'Ensalada Griega', precio: 9.00 },
    { nombre: 'Ensalada de la Casa', precio: 7.50 },
  ],
  'Platos Fuertes': [
    { nombre: 'Filete de Res', precio: 18.00 },
    { nombre: 'Pechuga a la Plancha', precio: 14.00 },
    { nombre: 'Chuletas de Cerdo', precio: 15.00 },
    { nombre: 'Costillas BBQ', precio: 16.50 },
    { nombre: 'Lomo Saltado', precio: 15.50 },
  ],
  'Pastas': [
    { nombre: 'Espagueti Carbonara', precio: 12.00 },
    { nombre: 'Fettuccine Alfredo', precio: 11.50 },
    { nombre: 'Lasagna Boloñesa', precio: 13.00 },
    { nombre: 'Ravioles de Ricotta', precio: 12.50 },
  ],
  'Pizzas': [
    { nombre: 'Pizza Margherita', precio: 10.00 },
    { nombre: 'Pizza Pepperoni', precio: 11.00 },
    { nombre: 'Pizza Hawaiana', precio: 11.50 },
    { nombre: 'Pizza Cuatro Quesos', precio: 12.00 },
    { nombre: 'Pizza Vegetariana', precio: 11.00 },
  ],
  'Hamburguesas': [
    { nombre: 'Hamburguesa Clásica', precio: 9.00 },
    { nombre: 'Hamburguesa BBQ', precio: 10.00 },
    { nombre: 'Hamburguesa Doble Carne', precio: 12.00 },
    { nombre: 'Hamburguesa de Pollo', precio: 9.50 },
  ],
  'Postres': [
    { nombre: 'Pastel de Chocolate', precio: 5.50 },
    { nombre: 'Flan Napolitano', precio: 4.50 },
    { nombre: 'Helado (3 bolas)', precio: 5.00 },
    { nombre: 'Cheesecake', precio: 6.00 },
    { nombre: 'Brownie con Helado', precio: 6.50 },
  ],
  'Bebidas Frías': [
    { nombre: 'Coca Cola', precio: 2.50 },
    { nombre: 'Pepsi', precio: 2.50 },
    { nombre: 'Sprite', precio: 2.50 },
    { nombre: 'Agua Mineral', precio: 2.00 },
    { nombre: 'Limonada Natural', precio: 3.00 },
  ],
  'Bebidas Calientes': [
    { nombre: 'Café Americano', precio: 2.50 },
    { nombre: 'Café Espresso', precio: 2.00 },
    { nombre: 'Cappuccino', precio: 3.50 },
    { nombre: 'Té Verde', precio: 2.00 },
    { nombre: 'Chocolate Caliente', precio: 3.00 },
  ],
  'Jugos Naturales': [
    { nombre: 'Jugo de Naranja', precio: 3.50 },
    { nombre: 'Jugo de Piña', precio: 3.50 },
    { nombre: 'Jugo de Sandía', precio: 3.50 },
    { nombre: 'Jugo Mixto', precio: 4.00 },
  ],
  'Cervezas': [
    { nombre: 'Cerveza Nacional', precio: 3.50 },
    { nombre: 'Cerveza Importada', precio: 5.00 },
    { nombre: 'Cerveza Artesanal', precio: 6.00 },
  ],
};

// ============== UTILIDADES ==============

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
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
    // 1. Verificar que exista el usuario mesero1
    const mesero = await prisma.usuario.findFirst({
      where: { usuario: 'mesero1' },
      select: { id: true, nombre: true },
    });

    if (!mesero) {
      console.error('❌ ERROR: No existe el usuario mesero1. Ejecuta primero: npm run seed');
      process.exit(1);
    }

    console.log(`✅ Usuario mesero encontrado: ${mesero.nombre} (ID: ${mesero.id})\n`);

    // 2. Limpiar datos anteriores de pruebas (configurable)
    if (CONFIG.AUTO_CLEAN) {
      console.log('🧹 Limpiando datos de pruebas anteriores...');

      // Primero, obtener IDs de órdenes a eliminar
      const ordenesAEliminar = await prisma.orden.findMany({
        where: {
          mesero: { usuario: 'mesero1' },
          tickets: { none: {} },
        },
        select: { id: true },
      });

      if (ordenesAEliminar.length > 0) {
        const ordenesIds = ordenesAEliminar.map(o => o.id);

        // Eliminar dependencias en orden correcto (foreign key constraints)
        // 1. Notificaciones de mesero
        const notifsEliminadas = await prisma.meseroNotif.deleteMany({
          where: { ordenId: { in: ordenesIds } },
        });

        // 2. Items de órdenes
        const itemsEliminados = await prisma.ordenItem.deleteMany({
          where: { ordenId: { in: ordenesIds } },
        });

        // 3. Órdenes
        const ordenesEliminadas = await prisma.orden.deleteMany({
          where: { id: { in: ordenesIds } },
        });

        console.log(`   - ${ordenesEliminadas.count} órdenes de prueba eliminadas`);
        console.log(`   - ${itemsEliminados.count} items eliminados`);
        if (notifsEliminadas.count > 0) {
          console.log(`   - ${notifsEliminadas.count} notificaciones eliminadas`);
        }
      } else {
        console.log(`   - 0 órdenes de prueba para eliminar`);
      }

      // Liberar todas las mesas ocupadas
      const mesasLiberadas = await prisma.mesa.updateMany({
        where: { estado: 'OCUPADA' },
        data: { estado: 'DISPONIBLE' },
      });
      console.log(`   - ${mesasLiberadas.count} mesas liberadas`);
    } else {
      console.log('⏩ Omitiendo limpieza automática (AUTO_CLEAN=false)\n');
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

    console.log(`✅ ${categorias.length} categorías creadas/actualizadas`);

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
          update: {
            precio: item.precio,
            disponible: true,
            categoriaId: categoria.id
          },
          create: {
            nombre: item.nombre,
            precio: item.precio,
            categoriaId: categoria.id,
            disponible: true,
          },
        });
        platillos.push(platillo);
        platilloCounter++;
      }
    }

    // Crear platillos adicionales si es necesario
    while (platilloCounter < CONFIG.NUM_PLATILLOS) {
      const categoria = getRandomElement(categorias);
      const nombre = `${categoria.nombre} Especial ${platilloCounter}`;
      const precio = parseFloat((Math.random() * 20 + 5).toFixed(2));

      try {
        const platillo = await prisma.platillo.create({
          data: {
            nombre,
            precio,
            categoriaId: categoria.id,
            disponible: true,
          },
        });
        platillos.push(platillo);
        platilloCounter++;
      } catch (e) {
        // Si el nombre ya existe, continuar
        continue;
      }
    }

    console.log(`✅ ${platillos.length} platillos creados/actualizados`);

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

    console.log(`✅ ${mesas.length} mesas creadas/actualizadas`);

    return {
      meseroId: mesero.id,
      categorias,
      platillos,
      mesas,
    };

  } catch (error) {
    console.error('❌ Error en seed de datos:', error);
    throw error;
  }
}

// ============== FASE 2: PRUEBA DE ESTRÉS ==============

async function crearOrdenAPI(mesaNum, meseroId, platillos) {
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
      nota: Math.random() > 0.7 ? 'Sin cebolla' : null,
    });
  }

  const payload = {
    mesa: mesaNum,
    meseroId,
    items,
  };

  const startTime = Date.now();

  try {
    const response = await axios.post(`${CONFIG.API_URL}/ordenes`, payload, {
      headers: {
        'Content-Type': 'application/json',
        // Modo desarrollo sin JWT
        'X-User-Json': JSON.stringify({
          id: meseroId,
          nombre: 'mesero1',
          rol: { nombre: 'Mesero' },
          permisos: ['GENERAR_ORDEN', 'VER_ORDENES'],
        }),
      },
      timeout: 30000, // 30 segundos timeout
    });

    const duration = Date.now() - startTime;
    return {
      success: true,
      ordenId: response.data.id,
      duration,
      mesa: mesaNum,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      duration,
      mesa: mesaNum,
      status: error.response?.status,
    };
  }
}

async function stressTest(meseroId, platillos, mesas) {
  console.log('\n🔥 FASE 2: Iniciando prueba de carga masiva...\n');
  console.log(`📊 Configuración:`);
  console.log(`   - Órdenes a generar: ${CONFIG.NUM_ORDENES}`);
  console.log(`   - API URL: ${CONFIG.API_URL}`);
  console.log(`   - Mesas disponibles: ${mesas.length}`);
  console.log(`   - Platillos disponibles: ${platillos.length}`);
  console.log(`   - Items por orden: ${CONFIG.ITEMS_POR_ORDEN_MIN}-${CONFIG.ITEMS_POR_ORDEN_MAX}\n`);

  // Verificar que el servidor esté disponible
  try {
    await axios.get(`${CONFIG.API_URL}/categorias`, { timeout: 5000 });
    console.log('✅ Servidor API responde correctamente\n');
  } catch (error) {
    console.error(`❌ ERROR: No se puede conectar con el servidor en ${CONFIG.API_URL}`);
    console.error('   Asegúrate de que el servidor esté corriendo: npm run dev');
    process.exit(1);
  }

  const startTime = Date.now();
  const promises = [];
  const results = {
    success: 0,
    failed: 0,
    errors: {},
    durations: [],
    mesasOcupadas: new Set(),
  };

  console.log('🚀 Lanzando órdenes concurrentes...\n');

  // Crear todas las órdenes concurrentemente
  for (let i = 0; i < CONFIG.NUM_ORDENES; i++) {
    // Usar diferentes mesas en un patrón circular para evitar conflictos
    const mesaNum = (i % mesas.length) + 1;

    const promise = crearOrdenAPI(mesaNum, meseroId, platillos)
      .then(result => {
        if (result.success) {
          results.success++;
          results.durations.push(result.duration);
        } else {
          results.failed++;
          const errorKey = result.error || 'Unknown error';
          results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;

          // Si es error de mesa ocupada, registrarlo
          if (result.error?.includes('ocupada')) {
            results.mesasOcupadas.add(result.mesa);
          }
        }

        // Mostrar progreso cada 50 órdenes
        const total = results.success + results.failed;
        if (total % 50 === 0) {
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

  // Esperar a que todas las órdenes terminen
  await Promise.allSettled(promises);

  const totalTime = Date.now() - startTime;

  // ============== RESULTADOS ==============
  console.log('\n\n' + '='.repeat(70));
  console.log('📈 RESULTADOS DE LA PRUEBA DE ESTRÉS');
  console.log('='.repeat(70) + '\n');

  console.log('⏱️  TIEMPO:');
  console.log(`   - Tiempo total: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`   - Órdenes por segundo: ${(CONFIG.NUM_ORDENES / (totalTime / 1000)).toFixed(2)}\n`);

  console.log('✅ ÉXITOS:');
  console.log(`   - Órdenes creadas: ${results.success} (${((results.success / CONFIG.NUM_ORDENES) * 100).toFixed(1)}%)\n`);

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

    console.log('⚡ TIEMPOS DE RESPUESTA (ms):');
    console.log(`   - Mínimo: ${min}ms`);
    console.log(`   - Promedio: ${avg.toFixed(2)}ms`);
    console.log(`   - Mediana (P50): ${p50}ms`);
    console.log(`   - P95: ${p95}ms`);
    console.log(`   - P99: ${p99}ms`);
    console.log(`   - Máximo: ${max}ms\n`);
  }

  if (results.mesasOcupadas.size > 0) {
    console.log('🪑 CONFLICTOS DE MESAS:');
    console.log(`   - ${results.mesasOcupadas.size} mesas tuvieron conflictos de concurrencia`);
    console.log(`   - Esto es normal en carga masiva simultánea\n`);
  }

  // Verificar datos en la base de datos
  const ordenesCreadas = await prisma.orden.count({
    where: {
      meseroId,
      fecha: {
        gte: new Date(startTime),
      },
    },
  });

  const itemsCreados = await prisma.ordenItem.count({
    where: {
      orden: {
        meseroId,
        fecha: {
          gte: new Date(startTime),
        },
      },
    },
  });

  console.log('💾 DATOS EN BASE DE DATOS:');
  console.log(`   - Órdenes en DB: ${ordenesCreadas}`);
  console.log(`   - Items en DB: ${itemsCreados}`);
  console.log(`   - Promedio items/orden: ${(itemsCreados / ordenesCreadas).toFixed(2)}\n`);

  console.log('='.repeat(70) + '\n');

  return results;
}

// ============== MAIN ==============

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 PRUEBA DE ESTRÉS - SISTEMA DE GESTIÓN DE RESTAURANTE');
  console.log('='.repeat(70));

  try {
    // Fase 1: Seed
    const { meseroId, platillos, mesas } = await seedData();

    // Fase 2: Stress Test
    await stressTest(meseroId, platillos, mesas);

    console.log('✅ Prueba de estrés completada exitosamente!\n');

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { seedData, stressTest };
