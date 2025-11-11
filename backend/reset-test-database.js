// reset-test-database.js - Reset COMPLETO: elimina TODO (categorías, platillos, mesas, órdenes)
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();

async function resetTestDatabase() {
  console.log('\n🔥 RESET COMPLETO DE BASE DE DATOS DE PRUEBAS\n');
  console.log('⚠️  ADVERTENCIA: Esto eliminará:');
  console.log('   - Todas las órdenes');
  console.log('   - Todos los items de órdenes');
  console.log('   - Todas las categorías');
  console.log('   - Todos los platillos');
  console.log('   - Todas las mesas');
  console.log('   - Tickets, reservas, y otros datos relacionados\n');

  try {
    // Contar registros antes
    const stats = {
      ordenes: await prisma.orden.count(),
      items: await prisma.ordenItem.count(),
      categorias: await prisma.categoria.count(),
      platillos: await prisma.platillo.count(),
      mesas: await prisma.mesa.count(),
      tickets: await prisma.ticketVenta.count(),
      reservas: await prisma.reserva.count(),
    };

    console.log('📊 Estado actual:');
    Object.entries(stats).forEach(([key, count]) => {
      console.log(`   - ${key}: ${count}`);
    });
    console.log();

    console.log('🗑️  Eliminando datos en orden correcto...\n');

    // 1. Eliminar notificaciones
    await prisma.meseroNotif.deleteMany({});
    await prisma.repartidorNotif.deleteMany({});
    console.log('   ✅ Notificaciones eliminadas');

    // 2. Eliminar calificaciones
    await prisma.calificacionPedido.deleteMany({});
    console.log('   ✅ Calificaciones eliminadas');

    // 3. Eliminar observaciones de entrega
    await prisma.observacionEntrega.deleteMany({});
    console.log('   ✅ Observaciones eliminadas');

    // 4. Eliminar items de pedidos cliente
    await prisma.pedidoClienteItem.deleteMany({});
    console.log('   ✅ Items de pedidos cliente eliminados');

    // 5. Eliminar pedidos cliente
    await prisma.pedidoCliente.deleteMany({});
    console.log('   ✅ Pedidos cliente eliminados');

    // 6. Eliminar items de tickets
    await prisma.ordenItem.updateMany({
      where: { ticketVentaId: { not: null } },
      data: { ticketVentaId: null },
    });

    // 7. Eliminar tickets de venta
    await prisma.ticketVenta.deleteMany({});
    console.log('   ✅ Tickets de venta eliminados');

    // 8. Eliminar items de órdenes
    await prisma.ordenItem.deleteMany({});
    console.log('   ✅ Items de órdenes eliminados');

    // 9. Eliminar órdenes
    await prisma.orden.deleteMany({});
    console.log('   ✅ Órdenes eliminadas');

    // 10. Eliminar reservas
    await prisma.reserva.deleteMany({});
    console.log('   ✅ Reservas eliminadas');

    // 11. Eliminar mesas
    await prisma.mesa.deleteMany({});
    console.log('   ✅ Mesas eliminadas');

    // 12. Eliminar historial de modificaciones
    await prisma.historialModificacion.deleteMany({});
    console.log('   ✅ Historial de modificaciones eliminado');

    // 13. Eliminar platillos
    await prisma.platillo.deleteMany({});
    console.log('   ✅ Platillos eliminados');

    // 14. Eliminar categorías
    await prisma.categoria.deleteMany({});
    console.log('   ✅ Categorías eliminadas');

    console.log('\n✅ Reset completo exitoso!');
    console.log('💡 La base de datos está limpia. Ejecuta "npm run seed" para restaurar usuarios.\n');

  } catch (error) {
    console.error('\n❌ Error durante el reset:', error);
    console.error('\nPuede que algunos datos tengan restricciones de foreign key.');
    console.error('En ese caso, considera hacer un reset completo de Prisma:\n');
    console.error('  npx prisma migrate reset\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  resetTestDatabase().catch(console.error);
}

module.exports = { resetTestDatabase };
