# 🧪 Prueba de Estrés - Sistema de Gestión de Restaurante

Este documento explica cómo ejecutar la prueba de carga masiva para el sistema de gestión del restaurante.

## 📋 Descripción

El script `stress-test.js` realiza una prueba de estrés completa del sistema creando **1000 órdenes concurrentes** para evaluar el rendimiento y la estabilidad del sistema bajo carga extrema.

## 🎯 Qué hace el script

### Fase 1: Preparación de Datos (Seeding)
1. ✅ Verifica que exista el usuario `mesero1` (del seed inicial)
2. 🧹 Limpia órdenes de pruebas anteriores
3. 📁 Crea **20 categorías** (comestibles y bebibles)
4. 🍽️ Crea **100 platillos** distribuidos en las categorías
5. 🪑 Crea **150 mesas** con capacidades de 2-8 personas

### Fase 2: Prueba de Estrés
1. 🚀 Lanza **1000 órdenes simultáneas** contra el API REST
2. 📊 Cada orden contiene entre 2-8 items aleatorios
3. ⏱️ Mide tiempos de respuesta (mínimo, promedio, P50, P95, P99, máximo)
4. 📈 Recopila estadísticas de éxito/fallo
5. 💾 Verifica integridad de datos en la base de datos

## 🚀 Cómo ejecutar la prueba

### Prerequisitos

1. **Base de datos configurada y migrada:**
   ```bash
   npm run migrate
   ```

2. **Seed inicial ejecutado (crea usuarios y roles):**
   ```bash
   npm run seed
   ```

3. **Servidor backend corriendo:**
   ```bash
   npm run dev
   # O en otra terminal:
   npm start
   ```

### Ejecutar la prueba

En una terminal separada (mientras el servidor está corriendo):

```bash
cd backend
node stress-test.js
```

### Configuración personalizada

Puedes modificar la prueba usando variables de entorno:

```bash
# Cambiar número de órdenes (default: 1000)
NUM_ORDENES=500 node stress-test.js

# Cambiar URL del API (default: http://localhost:3001)
API_URL=http://localhost:4000 node stress-test.js

# Combinación
NUM_ORDENES=2000 API_URL=http://localhost:3001 node stress-test.js
```

### Configuración avanzada

Edita las constantes en `stress-test.js`:

```javascript
const CONFIG = {
  API_URL: process.env.API_URL || 'http://localhost:3001',
  NUM_ORDENES: parseInt(process.env.NUM_ORDENES) || 1000,
  NUM_CATEGORIAS: 20,        // Categorías a crear
  NUM_PLATILLOS: 100,        // Platillos a crear
  NUM_MESAS: 150,            // Mesas a crear
  ITEMS_POR_ORDEN_MIN: 2,    // Mínimo items por orden
  ITEMS_POR_ORDEN_MAX: 8,    // Máximo items por orden
};
```

## 📊 Interpretación de Resultados

### Ejemplo de salida exitosa:

```
======================================================================
📈 RESULTADOS DE LA PRUEBA DE ESTRÉS
======================================================================

⏱️  TIEMPO:
   - Tiempo total: 45.32s
   - Órdenes por segundo: 22.06

✅ ÉXITOS:
   - Órdenes creadas: 850 (85.0%)

❌ FALLOS:
   - Órdenes fallidas: 150 (15.0%)

   Distribución de errores:
      - La mesa X está ocupada: 148 veces
      - Network/Timeout error: 2 veces

⚡ TIEMPOS DE RESPUESTA (ms):
   - Mínimo: 125ms
   - Promedio: 532.45ms
   - Mediana (P50): 445ms
   - P95: 1250ms
   - P99: 2100ms
   - Máximo: 3500ms

💾 DATOS EN BASE DE DATOS:
   - Órdenes en DB: 850
   - Items en DB: 4250
   - Promedio items/orden: 5.00

======================================================================
```

### Métricas importantes:

1. **Órdenes por segundo**: Capacidad de procesamiento del sistema
2. **Tasa de éxito**: % de órdenes creadas exitosamente
3. **P95/P99**: El 95%/99% de las órdenes se completaron en este tiempo
4. **Errores comunes**:
   - "Mesa ocupada": Normal en carga concurrente extrema (race conditions)
   - "Timeout": El servidor no pudo responder a tiempo (sobrecarga)
   - "Network error": Problemas de conexión

## 🔍 Qué se está probando

### 1. Concurrencia
- Múltiples órdenes intentando ocupar la misma mesa simultáneamente
- Transacciones de base de datos bajo presión
- Manejo de race conditions

### 2. Rendimiento del API
- Tiempo de respuesta de endpoints
- Throughput (órdenes/segundo)
- Comportamiento bajo carga extrema

### 3. Auto-asignación de items
- `cocina.assigner.js` asigna items de tipo PLATILLO a chefs
- `barra.assigner.js` asigna items de tipo BEBIDA a bartenders
- Rendimiento de servicios de rebalanceo

### 4. Sistema de eventos SSE
- Broadcasting de cambios de mesas
- Notificaciones a caja
- Consumo de memoria bajo múltiples conexiones

### 5. Integridad de datos
- Todas las órdenes exitosas están en la DB
- Todos los items fueron creados correctamente
- Estados de mesas son consistentes

## ⚠️ Consideraciones

### Errores esperados en carga masiva

1. **"La mesa X está ocupada"**: Es NORMAL
   - En concurrencia real, múltiples requests intentan ocupar la misma mesa
   - El sistema correctamente rechaza órdenes duplicadas
   - Indica que el sistema de bloqueo funciona

2. **Timeouts ocasionales**: Aceptable en carga extrema
   - 1000 órdenes simultáneas no es un escenario real
   - En producción, las órdenes se crean gradualmente

3. **Baja tasa de éxito (50-60%)**: Esperado con 1000 concurrentes y 150 mesas
   - Mejora al aumentar NUM_MESAS en el script
   - O reducir NUM_ORDENES

### Optimizaciones recomendadas si hay problemas

1. **Si hay muchos timeouts:**
   - Aumentar timeout en axios (línea 208): `timeout: 30000`
   - Optimizar queries de base de datos
   - Agregar más índices en Prisma schema

2. **Si P95/P99 son muy altos (>5000ms):**
   - Revisar servicios de auto-asignación
   - Considerar desactivar SSE durante pruebas
   - Optimizar transacciones de BD

3. **Si hay memory leaks:**
   - Revisar conexiones SSE abiertas
   - Verificar que Prisma cierra conexiones correctamente

## 🧪 Pruebas graduales recomendadas

Antes de lanzar 1000 órdenes, prueba gradualmente:

```bash
# Prueba pequeña: 10 órdenes
NUM_ORDENES=10 node stress-test.js

# Prueba mediana: 100 órdenes
NUM_ORDENES=100 node stress-test.js

# Prueba grande: 500 órdenes
NUM_ORDENES=500 node stress-test.js

# Prueba completa: 1000 órdenes
node stress-test.js
```

Analiza los resultados en cada etapa para identificar cuellos de botella.

## 📝 Limpieza de datos

Para limpiar las órdenes de prueba:

```sql
-- Conectarse a PostgreSQL
DELETE FROM "OrdenItem" WHERE "ordenId" IN (
  SELECT id FROM "Orden" WHERE "meseroId" = (
    SELECT id FROM "Usuario" WHERE usuario = 'mesero1'
  )
);

DELETE FROM "Orden" WHERE "meseroId" = (
  SELECT id FROM "Usuario" WHERE usuario = 'mesero1'
);
```

O simplemente ejecuta el script de nuevo (limpia automáticamente órdenes sin tickets).

## 🎓 Aprendizajes esperados

Después de ejecutar esta prueba, deberías poder responder:

1. ¿Cuántas órdenes por segundo puede procesar el sistema?
2. ¿Cuál es el tiempo de respuesta promedio bajo carga?
3. ¿Qué componentes son cuellos de botella?
4. ¿El sistema maneja correctamente race conditions?
5. ¿La integridad de datos se mantiene bajo presión?

## 🔗 Próximos pasos

1. **Monitoreo en tiempo real**: Usar `htop`, `pg_stat_activity`
2. **Profiling**: Identificar queries lentos con Prisma logging
3. **Optimización**: Agregar índices, optimizar servicios
4. **Pruebas de otros flujos**: Finalizar órdenes, pagos, etc.

---

**¿Preguntas o problemas?** Revisa los logs del servidor backend para detalles de errores.
