# 🚀 Guía Rápida - Prueba de Estrés

## ⚡ Uso Rápido

### Primera vez (setup inicial):
```bash
cd backend
npm run migrate    # Crear tablas
npm run seed       # Crear usuarios
```

### Ejecutar prueba de estrés:
```bash
# Terminal 1: Servidor
npm run dev

# Terminal 2: Prueba
npm run stress-test:small    # 10 órdenes (recomendado primero)
npm run stress-test:medium   # 100 órdenes
npm run stress-test          # 1000 órdenes
```

## 🔄 Ejecutar Múltiples Pruebas

### Opción 1: Limpieza automática (por defecto)
El script limpia órdenes anteriores automáticamente:
```bash
npm run stress-test:small    # Ejecuta y limpia
npm run stress-test:small    # Ejecuta de nuevo (limpia automáticamente)
npm run stress-test:medium   # Ejecuta con más órdenes
```

### Opción 2: Limpieza manual
Si quieres limpiar manualmente entre pruebas:
```bash
npm run stress-test:small    # Primera prueba
npm run clean                # Limpia solo órdenes (mantiene categorías/platillos/mesas)
npm run stress-test:medium   # Segunda prueba
```

### Opción 3: Reset completo
Si algo salió mal y quieres empezar desde cero:
```bash
npm run reset    # Elimina TODO (categorías, platillos, mesas, órdenes)
npm run seed     # Restaura usuarios
npm run stress-test:small    # Nueva prueba desde cero
```

## 📋 Comandos Disponibles

### Pruebas de Estrés
```bash
npm run stress-test          # 1000 órdenes (prueba estándar)
npm run stress-test:small    # 10 órdenes (prueba rápida)
npm run stress-test:medium   # 100 órdenes
npm run stress-test:large    # 500 órdenes
npm run stress-test:extreme  # 2000 órdenes (modo extremo)
```

### Limpieza
```bash
npm run clean    # Limpia solo órdenes de prueba (rápido)
                 # Mantiene: categorías, platillos, mesas
                 # Elimina: órdenes sin tickets

npm run reset    # Reset COMPLETO (lento)
                 # Elimina TODO y deja la BD vacía
                 # Después debes ejecutar: npm run seed
```

## 🎯 Flujo Recomendado

### Para pruebas rápidas y continuas:
```bash
# Setup una sola vez
npm run migrate
npm run seed

# Ejecutar pruebas múltiples veces
npm run stress-test:small     # AUTO limpia y ejecuta
npm run stress-test:small     # AUTO limpia y ejecuta
npm run stress-test:medium    # AUTO limpia y ejecuta
```

### Para comparar resultados sin limpiar:
```bash
# Desactivar limpieza automática
AUTO_CLEAN=false npm run stress-test:small
AUTO_CLEAN=false npm run stress-test:small
# Ahora tienes datos acumulados para analizar

# Limpiar cuando termines
npm run clean
```

## 📊 ¿Qué limpia cada comando?

### `npm run clean` (RÁPIDO - Recomendado)
✅ Elimina:
- Órdenes del mesero de prueba (sin tickets)
- Items de esas órdenes

❌ Mantiene:
- Categorías
- Platillos
- Mesas
- Usuarios
- Órdenes con tickets (pagadas)

⏱️ Tiempo: ~1 segundo

### `npm run reset` (COMPLETO - Solo si es necesario)
✅ Elimina:
- Todas las categorías
- Todos los platillos
- Todas las mesas
- Todas las órdenes
- Todos los tickets
- Todas las reservas
- Todas las notificaciones

❌ Mantiene:
- Usuarios y roles

⏱️ Tiempo: ~5-10 segundos

## 🔍 Verificar Estado de la BD

```bash
# Usando Prisma Studio (GUI)
npx prisma studio

# O consultas directas a PostgreSQL
psql -d tu_base_de_datos

# Contar registros:
SELECT
  (SELECT COUNT(*) FROM "Orden") as ordenes,
  (SELECT COUNT(*) FROM "Categoria") as categorias,
  (SELECT COUNT(*) FROM "Platillo") as platillos,
  (SELECT COUNT(*) FROM "Mesa") as mesas;
```

## ⚠️ Problemas Comunes

### "La mesa X está ocupada" (muchos errores)
**Solución:**
```bash
npm run clean    # Libera todas las mesas
npm run stress-test:small
```

### Datos acumulados de pruebas anteriores
**Solución:**
```bash
npm run clean    # Limpieza rápida
# O
npm run reset    # Reset completo
npm run seed     # Si usaste reset
```

### "No existe el usuario mesero1"
**Solución:**
```bash
npm run seed
```

### Base de datos corrupta o con errores
**Solución:**
```bash
npm run reset           # Reset completo
npm run seed            # Restaurar usuarios
npm run stress-test:small
```

## 💡 Tips

1. **Empieza pequeño**: Siempre usa `npm run stress-test:small` primero
2. **Limpieza automática**: Por defecto está activada, no necesitas hacer nada
3. **Entre pruebas**: La limpieza automática es suficiente
4. **Solo usa `npm run reset`**: Si algo está realmente roto

## 🎓 Ejemplos de Uso

### Escenario 1: Desarrollo diario
```bash
# Una sola vez
npm run migrate && npm run seed

# Pruebas durante el día
npm run stress-test:small    # Limpia automáticamente
npm run stress-test:small    # Limpia automáticamente
npm run stress-test:medium   # Limpia automáticamente
```

### Escenario 2: Comparar rendimiento
```bash
# Prueba 1
npm run stress-test:medium
# Anotar resultados: P95 = 850ms

# Limpiar
npm run clean

# Prueba 2 (después de optimización)
npm run stress-test:medium
# Anotar resultados: P95 = 620ms (¡mejoró!)
```

### Escenario 3: Testing extremo
```bash
# Acumular carga sin limpiar
AUTO_CLEAN=false npm run stress-test:medium  # 100 órdenes
AUTO_CLEAN=false npm run stress-test:medium  # +100 = 200 total
AUTO_CLEAN=false npm run stress-test:medium  # +100 = 300 total

# Ver cómo se comporta con 300 órdenes acumuladas
# Luego limpiar
npm run clean
```

---

**Para más detalles, consulta:** `STRESS-TEST-README.md`
