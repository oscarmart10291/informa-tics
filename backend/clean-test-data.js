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

    // Eliminar órdenes del mesero de pruebas (los items se eliminan en cascada)
    const resultado = await prisma.orden.deleteMany({
      where: {
        meseroId: mesero.id,
        tickets: { none: {} }, // Solo elimina órdenes sin tickets (de pruebas)
      },
    });

    console.log(`✅ Limpieza completada:`);
    console.log(`   - ${resultado.count} órdenes eliminadas\n`);

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
