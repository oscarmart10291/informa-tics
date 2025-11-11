// clean-test-data.js - Limpia solo las órdenes de prueba (mantiene categorías, platillos, mesas)
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();

async function cleanTestData() {
  console.log('\n🧹 Limpiando datos de pruebas...\n');

  try {
    // Obtener el ID del mesero de pruebas
    const mesero = await prisma.usuario.findFirst({
      where: { usuario: 'mesero1' },
      select: { id: true },
    });

    if (!mesero) {
      console.log('⚠️  No se encontró el usuario mesero1. No hay nada que limpiar.');
      return;
    }

    // Contar órdenes antes de limpiar
    const ordenesAntes = await prisma.orden.count({
      where: { meseroId: mesero.id },
    });

    const itemsAntes = await prisma.ordenItem.count({
      where: { orden: { meseroId: mesero.id } },
    });

    console.log(`📊 Estado actual:`);
    console.log(`   - Órdenes de prueba: ${ordenesAntes}`);
    console.log(`   - Items de prueba: ${itemsAntes}\n`);

    if (ordenesAntes === 0) {
      console.log('✅ No hay órdenes de prueba que limpiar.\n');
      return;
    }

    // Obtener IDs de órdenes a eliminar
    const ordenesAEliminar = await prisma.orden.findMany({
      where: {
        meseroId: mesero.id,
        tickets: { none: {} }, // Solo elimina órdenes sin tickets (de pruebas)
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

      console.log(`✅ Limpieza completada:`);
      console.log(`   - ${ordenesEliminadas.count} órdenes eliminadas`);
      console.log(`   - ${itemsEliminados.count} items eliminados`);
      if (notifsEliminadas.count > 0) {
        console.log(`   - ${notifsEliminadas.count} notificaciones eliminadas`);
      }
      console.log();
    }

    // Liberar todas las mesas (volverlas a DISPONIBLE)
    const mesasLiberadas = await prisma.mesa.updateMany({
      where: { estado: 'OCUPADA' },
      data: { estado: 'DISPONIBLE' },
    });

    if (mesasLiberadas.count > 0) {
      console.log(`🪑 ${mesasLiberadas.count} mesas liberadas (estado → DISPONIBLE)\n`);
    }

    console.log('✅ Sistema listo para nueva prueba!\n');

  } catch (error) {
    console.error('❌ Error al limpiar datos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  cleanTestData().catch(console.error);
}

module.exports = { cleanTestData };
