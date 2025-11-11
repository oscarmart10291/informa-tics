# 🔥 Prueba de Estrés - FLUJO COMPLETO END-TO-END

## 🎯 ¿Qué hace este script?

A diferencia del `stress-test.js` básico que solo **crea órdenes**, este script ejecuta el **FLUJO COMPLETO** del sistema:

```
1. 📝 Crear Orden (mesero)
        ↓
2. 👨‍🍳 Cocina/Barra procesa items
   - Marcar como PREPARANDO
   - Marcar como LISTO
        ↓
3. ✅ Finalizar Orden (mesero)
   - Cambiar estado a PENDIENTE_PAGO
   - Liberar mesa
        ↓
4. 💰 Cobrar (cajero)
   - Crear ticket de venta
   - Marcar como PAGADA
```

## 🚀 Comandos Disponibles

### Pruebas básicas (recomendadas):
```bash
npm run stress-test:full:small    # 10 órdenes completas (EMPIEZA AQUÍ)
npm run stress-test:full:medium   # 100 órdenes completas
npm run stress-test:full:large    # 500 órdenes completas
npm run stress-test:full          # 1000 órdenes completas (50 concurrentes)
```

### Pruebas con control de concurrencia (batching):
```bash
# 1000 órdenes con diferentes tamaños de lote
npm run stress-test:full:batch-10    # Lotes de 10 (más seguro, más lento)
npm run stress-test:full:batch-25    # Lotes de 25 (balance)
npm run stress-test:full              # Lotes de 50 (default)
npm run stress-test:full:batch-100   # Lotes de 100 (más rápido, más race conditions)
```

### Prueba con simulación de tiempo de preparación:
```bash
npm run stress-test:full:with-prep    # 10 órdenes con delays realistas
```

### Personalizado:
```bash
# Cambiar número de órdenes y tamaño de lote
NUM_ORDENES=500 BATCH_SIZE=25 node stress-test-full-flow.js

# Con simulación de tiempo de preparación
SIMULATE_PREP_TIME=true NUM_ORDENES=20 node stress-test-full-flow.js
```

## 📋 Prerequisitos

**Una sola vez (setup inicial):**
```bash
cd backend
npm install
npm run migrate    # Crear tablas
npm run seed       # Crear usuarios (mesero, cocinero, bartender, cajero)
```

## ⚡ Cómo ejecutar

### Terminal 1: Levantar servidor
```bash
cd backend
npm run dev
```

### Terminal 2: Ejecutar prueba
```bash
cd backend
npm run stress-test:full:small    # Empieza con 10 órdenes
```

## 📊 Ejemplo de Salida

```
======================================================================
🧪 PRUEBA DE ESTRÉS - FLUJO COMPLETO END-TO-END
   Crear Orden → Cocina/Barra → Finalizar → Cobrar
======================================================================

🌱 FASE 1: Generando datos de prueba...

✅ Usuarios encontrados:
   - Mesero: Mesero Demo (ID: 2)
   - Cocinero: Cocinero Demo (ID: 3)
   - Bartender: Bartender Demo (ID: 4)
   - Cajero: Cajero Demo (ID: 5)

🧹 Limpiando datos de pruebas anteriores...
   - 10 órdenes eliminadas
   - 50 items eliminados
   - 5 mesas liberadas

📁 Creando categorías...
✅ 20 categorías creadas

🍽️  Creando platillos...
✅ 100 platillos creados

🪑 Creando mesas...
✅ 150 mesas creadas

💰 Verificando turno de caja...
✅ Turno de caja activo (ID: 1)

🔥 FASE 2: Iniciando prueba de carga masiva con FLUJO COMPLETO...

📊 Configuración:
   - Órdenes a procesar: 10
   - Flujo: Crear → Cocina/Barra → Finalizar → Cobrar
   - Simular tiempos de prep: NO
   - API URL: http://localhost:3001
   - Mesas disponibles: 150
   - Platillos disponibles: 100

✅ Servidor API responde correctamente

🚀 Lanzando órdenes concurrentes...

[████████████████████████████████████████] 10/10 (100.0%)

======================================================================
📈 RESULTADOS DE LA PRUEBA DE ESTRÉS - FLUJO COMPLETO
======================================================================

⏱️  TIEMPO TOTAL:
   - Tiempo total: 12.45s
   - Órdenes por segundo: 0.80

✅ ÉXITOS:
   - Órdenes completadas: 10 (100.0%)
   - Flujo: Creadas → Cocinadas → Finalizadas → Cobradas

⚡ TIEMPOS DE RESPUESTA COMPLETOS (ms):
   - Mínimo: 1050ms
   - Promedio: 1245.30ms
   - Mediana (P50): 1200ms
   - P95: 1450ms
   - P99: 1500ms
   - Máximo: 1520ms

🎯 TIEMPOS POR PASO (Promedio):
   - Crear Orden: 185.20ms
   - Cocina/Barra: 650.45ms
   - Finalizar: 95.30ms
   - Cobrar: 314.35ms

💾 DATOS EN BASE DE DATOS:
   - Órdenes creadas: 10
   - Órdenes pagadas: 10
   - Tickets generados: 10
   - Tasa de completitud: 100.0%

======================================================================

✅ Prueba de estrés completada exitosamente!
```

## 🔍 ¿Qué se está probando?

### 1. Sistema completo end-to-end
- ✅ Creación de órdenes
- ✅ Auto-asignación a cocina/barra
- ✅ Procesamiento en cocina (items PLATILLO)
- ✅ Procesamiento en barra (items BEBIDA)
- ✅ Notificaciones a mesero
- ✅ Finalización de orden
- ✅ Liberación de mesa
- ✅ Creación de ticket de venta
- ✅ Registro en turno de caja
- ✅ Marcado de orden como PAGADA

### 2. Concurrencia extrema
- Múltiples órdenes procesándose simultáneamente
- Chefs/bartenders trabajando en paralelo
- Cajeros procesando pagos concurrentes

### 3. Integridad de datos
- Todas las órdenes creadas llegan a PAGADA
- Todos los items son procesados
- Todos los tickets son generados
- Mesas son liberadas correctamente

### 4. Rendimiento bajo carga
- Tiempos de respuesta por paso
- Throughput del sistema completo
- Cuellos de botella identificados

## 📈 Métricas importantes

### Tasa de completitud
```
Tasa de completitud = (Órdenes PAGADAS / Órdenes Creadas) × 100%
```
**Objetivo:** 100% en pruebas pequeñas (10-100 órdenes)

### Tiempo promedio por paso
- **Crear Orden:** ~150-300ms (depende de # de items)
- **Cocina/Barra:** ~500-1000ms (paralelo, múltiples items)
- **Finalizar:** ~50-150ms (simple update)
- **Cobrar:** ~200-400ms (cálculos + ticket)

### Tiempo total por orden
- **Sin simulación:** 1000-1500ms por orden completa
- **Con simulación:** 2000-5000ms (más realista)

## 🆚 Diferencias con stress-test.js

| Característica | `stress-test.js` | `stress-test-full-flow.js` |
|----------------|------------------|----------------------------|
| **Crea órdenes** | ✅ | ✅ |
| **Procesa en cocina/barra** | ❌ | ✅ |
| **Finaliza órdenes** | ❌ | ✅ |
| **Cobra órdenes** | ❌ | ✅ |
| **Libera mesas** | ❌ | ✅ |
| **Crea tickets** | ❌ | ✅ |
| **Tiempo por orden** | ~200-500ms | ~1000-1500ms |
| **Carga de BD** | Baja | Alta |
| **Carga de CPU** | Baja | Media-Alta |
| **Prueba completa** | ❌ | ✅ |

## ⚙️ Configuración avanzada

### Variables de entorno

```bash
# Número de órdenes (default: 1000)
NUM_ORDENES=100

# Tamaño de lote - órdenes concurrentes por batch (default: 50)
BATCH_SIZE=25

# URL del API (default: http://localhost:3001)
API_URL=http://localhost:4000

# Simular tiempos de preparación (default: false)
SIMULATE_PREP_TIME=true

# Desactivar limpieza automática (default: true)
AUTO_CLEAN=false
```

### Ejemplo combinado
```bash
NUM_ORDENES=500 BATCH_SIZE=25 SIMULATE_PREP_TIME=true node stress-test-full-flow.js
```

## 🎯 Sistema de Batching (Control de Concurrencia)

### ¿Qué es el batching?

El sistema procesa órdenes **en lotes** en lugar de lanzar todas simultáneamente:

**Sin batching (problema):**
```
1000 requests → API simultáneos → Race conditions → Alta tasa de fallos
```

**Con batching (solución):**
```
Lote 1: 50 órdenes → Espera → Lote 2: 50 órdenes → Espera → ...
```

### ¿Por qué es necesario?

**Problemas sin batching:**
- ❌ Race conditions en mesas (múltiples órdenes intentan tomar la misma mesa)
- ❌ Locks en base de datos por alta concurrencia
- ❌ Timeouts por sobrecarga del servidor
- ❌ Fallos en cocina/barra por conflictos de estado

**Beneficios del batching:**
- ✅ Reduce race conditions controlando concurrencia
- ✅ Evita saturar el connection pool de la BD
- ✅ Mayor tasa de éxito en pruebas de carga
- ✅ Más cercano a uso real (no hay 1000 meseros simultáneos)

### Cómo elegir el tamaño de lote

| BATCH_SIZE | Uso recomendado | Pros | Contras |
|------------|----------------|------|---------|
| **10** | Debugging, sistemas limitados | Muy seguro, pocos fallos | Muy lento |
| **25** | Testing normal, CI/CD | Buen balance | Moderadamente lento |
| **50** | Default, pruebas realistas | Balance óptimo | Algunos fallos posibles |
| **100** | Stress máximo | Rápido | Más race conditions |

### Ejemplo de resultados

**Sin batching (1000 simultáneas):**
- Tasa de éxito: 3.1%
- Órdenes creadas: 327/1000
- Principal error: "Mesa ocupada" (race condition)

**Con batching (lotes de 50):**
- Tasa de éxito esperada: 90-100%
- Órdenes creadas: 950-1000/1000
- Errores ocasionales en picos de carga

## 🧹 Limpieza de datos

El script limpia automáticamente órdenes anteriores antes de ejecutar. Si quieres limpiar manualmente:

```bash
npm run clean    # Limpia órdenes de prueba
npm run reset    # Reset completo (si algo falla)
```

## ⚠️ Problemas comunes

### "No existe el usuario mesero1/cocinero1/bartender1/cajero1"
**Solución:**
```bash
npm run seed
```

### "No hay turno de caja activo"
El script lo crea automáticamente. Si hay error:
```bash
# Crear turno manualmente vía Prisma Studio
npx prisma studio
# O resetear y volver a seed
npm run reset && npm run seed
```

### Muchos errores de timeout
**Soluciones:**
1. Reducir NUM_ORDENES: `NUM_ORDENES=10 npm run stress-test:full:small`
2. Desactivar simulación: `SIMULATE_PREP_TIME=false` (default)
3. Aumentar timeout en el código (líneas con `timeout: 30000`)

### Órdenes quedan en PENDIENTE_PAGO o EN_PREPARACION
Indica que el flujo se interrumpió. Causas comunes:
- Timeout en cocina/barra
- Error en auto-asignación
- Servidor sobrecargado

**Solución:** Reducir carga o revisar logs del servidor.

## 💡 Tips de uso

### 1. Empieza pequeño
```bash
npm run stress-test:full:small    # 10 órdenes
```

### 2. Escala gradualmente
```bash
npm run stress-test:full:small    # 10 órdenes ✅
npm run stress-test:full:medium   # 100 órdenes ✅
npm run stress-test:full:large    # 500 órdenes
```

### 3. Usa simulación para pruebas realistas
```bash
npm run stress-test:full:with-prep    # Simula tiempos de cocina
```

### 4. Monitorea el servidor
En la terminal del servidor verás logs de:
- Órdenes creadas
- Items asignados
- Rebalanceos
- Notificaciones
- Tickets generados

### 5. Revisa la base de datos
```bash
npx prisma studio
```
Verifica:
- Órdenes en estado PAGADA
- Items con pagado: true
- Tickets generados
- Mesas en DISPONIBLE

## 🎓 Casos de uso

### Desarrollo: Probar flujo completo
```bash
npm run stress-test:full:small
```

### QA: Validar sistema bajo carga
```bash
npm run stress-test:full:medium
```

### Performance: Identificar cuellos de botella
```bash
npm run stress-test:full:large
# Analizar tiempos por paso
```

### Simulación realista: Con delays
```bash
npm run stress-test:full:with-prep
# Simula tiempos de preparación de cocina/barra
```

## 🔗 Archivos relacionados

- `stress-test.js` - Prueba básica (solo creación)
- `stress-test-full-flow.js` - Prueba completa (este)
- `clean-test-data.js` - Limpieza rápida
- `reset-test-database.js` - Reset completo
- `STRESS-TEST-QUICK-GUIDE.md` - Guía rápida básica

---

**¿Preguntas?** Revisa los logs del servidor para más detalles.
