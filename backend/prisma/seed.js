// prisma/seed.js
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function hash(p) { return bcrypt.hash(p, 12); }

// --- Claves oficiales de permisos ---
const PERMISOS = [
  // Administración
  { nombre: 'CONFIGURAR_USUARIOS', descripcion: 'Gestionar usuarios' },
  { nombre: 'CONFIGURAR_PLATILLOS', descripcion: 'Gestionar platillos' },
  { nombre: 'GESTIONAR_CATEGORIAS', descripcion: 'Gestionar categorías' },
  { nombre: 'GESTIONAR_ROLES', descripcion: 'Gestionar roles y permisos' },
  { nombre: 'VER_MENU', descripcion: 'Ver menú' },
  { nombre: 'VER_HISTORIAL', descripcion: 'Ver historial' },

  // Reportería
  { nombre: 'REPORTES_VER', descripcion: 'Ver reportería' },

  // Mesas
  { nombre: 'CONFIGURAR_MESAS', descripcion: 'Administrar mesas' },
  { nombre: 'RESERVAR_MESAS', descripcion: 'Gestionar/consultar reservaciones' },

  // Mesero / Órdenes
  { nombre: 'GENERAR_ORDEN', descripcion: 'Crear órdenes' },
  { nombre: 'VER_ORDENES', descripcion: 'Ver historial de órdenes' },
  { nombre: 'ORDENES_TERMINADAS', descripcion: 'Ver ordenes terminadas' },

  // Cocina / Barra
  { nombre: 'COCINA_VIEW', descripcion: 'Acceso a vista de cocina' },
  { nombre: 'BARRA_VIEW', descripcion: 'Acceso a vista de barra' },

  // Caja
  { nombre: 'CAJA', descripcion: 'Acceso a vista de caja y cobros' },
  { nombre: 'AUTORIZAR_EGRESO', descripcion: 'Aprobar/Rechazar egresos' },
  { nombre: 'AUTORIZAR_APERTURA_CAJA', descripcion: 'Autorizar aperturas de caja' },

  // Reparto
  { nombre: 'ACCESO_VISTA_REPARTO', descripcion: 'Acceso a vista de reparto' },

  // Calificaciones
  { nombre: 'CALIFICACIONES_VER', descripcion: 'Ver calificaciones' },

  // ✅ NUEVO: Configuración general (propina, etc.)
  { nombre: 'CONFIGURAR_PARAMETROS', descripcion: 'Configurar parámetros del sistema (p. ej. propina)' },
];

async function main() {
  // Normalización de claves legacy (igual que tu versión)...
  const legacy = await prisma.permiso.findUnique({ where: { nombre: 'REPARTO_VIEW' } });
  if (legacy) {
    let nuevo = await prisma.permiso.findUnique({ where: { nombre: 'ACCESO_VISTA_REPARTO' } });
    if (!nuevo) {
      nuevo = await prisma.permiso.create({
        data: { nombre: 'ACCESO_VISTA_REPARTO', descripcion: 'Acceso a vista de reparto' },
      });
    }
    const relaciones = await prisma.permisoPorRol.findMany({ where: { permisoId: legacy.id } });
    for (const pr of relaciones) {
      await prisma.permisoPorRol.upsert({
        where: { permisoId_rolId: { permisoId: nuevo.id, rolId: pr.rolId } },
        update: {},
        create: { permisoId: nuevo.id, rolId: pr.rolId },
      });
    }
    await prisma.permiso.delete({ where: { id: legacy.id } });
  }

  // Crear/actualizar catálogo de permisos
  for (const p of PERMISOS) {
    await prisma.permiso.upsert({
      where: { nombre: p.nombre },
      update: { descripcion: p.descripcion },
      create: { nombre: p.nombre, descripcion: p.descripcion },
    });
  }

  // Roles
  const admin       = await prisma.rol.upsert({ where: { nombre: 'Administrador' }, update: {}, create: { nombre: 'Administrador' } });
  const mesero      = await prisma.rol.upsert({ where: { nombre: 'Mesero' },        update: {}, create: { nombre: 'Mesero' } });
  const cocinero    = await prisma.rol.upsert({ where: { nombre: 'Cocinero' },      update: {}, create: { nombre: 'Cocinero' } });
  const bartender   = await prisma.rol.upsert({ where: { nombre: 'Bartender' },     update: {}, create: { nombre: 'Bartender' } });
  const cajero      = await prisma.rol.upsert({ where: { nombre: 'Cajero' },        update: {}, create: { nombre: 'Cajero' } });
  const repartidor  = await prisma.rol.upsert({ where: { nombre: 'Repartidor' },    update: {}, create: { nombre: 'Repartidor' } });

  // Vincular permisos
  const todosPermisos = await prisma.permiso.findMany();
  const mapPerm = Object.fromEntries(todosPermisos.map(p => [p.nombre, p.id]));

  // Admin -> todos
  for (const p of todosPermisos) {
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: p.id, rolId: admin.id } },
      update: {},
      create: { permisoId: p.id, rolId: admin.id },
    });
  }

  // Mesero
  for (const nombre of ['GENERAR_ORDEN', 'VER_ORDENES','ORDENES_TERMINADAS','CONFIGURAR_MESAS','RESERVAR_MESAS']) {
    const pid = mapPerm[nombre];
    if (!pid) continue;
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: pid, rolId: mesero.id } },
      update: {},
      create: { permisoId: pid, rolId: mesero.id },
    });
  }

  // Cocinero
  for (const nombre of ['COCINA_VIEW']) {
    const pid = mapPerm[nombre];
    if (!pid) continue;
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: pid, rolId: cocinero.id } },
      update: {},
      create: { permisoId: pid, rolId: cocinero.id },
    });
  }

  // Bartender
  for (const nombre of ['BARRA_VIEW']) {
    const pid = mapPerm[nombre];
    if (!pid) continue;
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: pid, rolId: bartender.id } },
      update: {},
      create: { permisoId: pid, rolId: bartender.id },
    });
  }

  // Cajero -> caja
  for (const nombre of ['CAJA']) {
    const pid = mapPerm[nombre];
    if (!pid) continue;
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: pid, rolId: cajero.id } },
      update: {},
      create: { permisoId: pid, rolId: cajero.id },
    });
  }

  // Repartidor
  for (const nombre of ['ACCESO_VISTA_REPARTO']) {
    const pid = mapPerm[nombre];
    if (!pid) continue;
    await prisma.permisoPorRol.upsert({
      where: { permisoId_rolId: { permisoId: pid, rolId: repartidor.id } },
      update: {},
      create: { permisoId: pid, rolId: repartidor.id },
    });
  }

  // ===== Usuarios demo (uno por cada rol) =====
  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: { estado: true, rolId: admin.id },
    create: {
      nombre: 'Admin',
      usuario: 'admin',
      correo: 'admin@demo.com',
      contrasena: await hash('admin123'),
      rolId: admin.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  await prisma.usuario.upsert({
    where: { usuario: 'mesero1' },
    update: { estado: true, rolId: mesero.id },
    create: {
      nombre: 'Mesero Demo',
      usuario: 'mesero1',
      correo: 'mesero1@demo.com',
      contrasena: await hash('mesero123'),
      rolId: mesero.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  await prisma.usuario.upsert({
    where: { usuario: 'cocinero1' },
    update: { estado: true, rolId: cocinero.id },
    create: {
      nombre: 'Cocinero Demo',
      usuario: 'cocinero1',
      correo: 'cocinero1@demo.com',
      contrasena: await hash('cocina123'),
      rolId: cocinero.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  await prisma.usuario.upsert({
    where: { usuario: 'bartender1' },
    update: { estado: true, rolId: bartender.id },
    create: {
      nombre: 'Bartender Demo',
      usuario: 'bartender1',
      correo: 'bartender1@demo.com',
      contrasena: await hash('barra123'),
      rolId: bartender.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  await prisma.usuario.upsert({
    where: { usuario: 'cajero1' },
    update: { estado: true, rolId: cajero.id },
    create: {
      nombre: 'Cajero Demo',
      usuario: 'cajero1',
      correo: 'cajero1@demo.com',
      contrasena: await hash('caja123'),
      rolId: cajero.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  await prisma.usuario.upsert({
    where: { usuario: 'repartidor1' },
    update: { estado: true, rolId: repartidor.id },
    create: {
      nombre: 'Repartidor Demo',
      usuario: 'repartidor1',
      correo: 'repartidor1@demo.com',
      contrasena: await hash('reparto123'),
      rolId: repartidor.id,
      estado: true,
      debeCambiarPassword: false,
    },
  });

  // ====== Settings iniciales ======
  await prisma.setting.upsert({
    where: { key: 'tip_percent' },
    update: { value: '10' },    // 10% por defecto
    create: { key: 'tip_percent', value: '10' },
  });

  console.log('Seed listo (permisos + roles + usuarios + setting tip_percent=10).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
