# 📝 Guía para Llenar los Documentos de Resultados

Esta guía te ayudará a completar `RESULTADOS-PRUEBA-ESTRES.md` o `RESULTADOS-PRUEBA-ESTRES-SIMPLE.md` con los datos de tu prueba.

---

## Paso 1: Ejecutar la Prueba

### Terminal 1: Servidor
```bash
cd backend
npm run dev
```

### Terminal 2: Prueba de Estrés
```bash
cd backend
npm run stress-test:full              # O el comando que elijas
```

**💡 Tip:** Copia TODO el output de la terminal. Lo necesitarás para llenar el documento.

---

## Paso 2: Abrir el Documento

Elige cuál documento usar:

- **`RESULTADOS-PRUEBA-ESTRES.md`** → Reporte completo y profesional (recomendado para entrega formal)
- **`RESULTADOS-PRUEBA-ESTRES-SIMPLE.md`** → Reporte corto y rápido

Abre el archivo en tu editor de texto favorito.

---

## Paso 3: Completar Sección por Sección

### 📋 Sección 1: Configuración de la Prueba

**Dónde encontrar los datos:**

En el output de la prueba verás algo como:
```
📊 Configuración:
   - Órdenes a procesar: 1000
   - Tamaño de lote (concurrencia): 50
   - Flujo: Crear → Cocina/Barra → Finalizar → Cobrar
   - Mesas disponibles: 150
   - Platillos disponibles: 100
```

**Cómo llenar:**
```markdown
| Parámetro | Valor |
|-----------|-------|
| **Órdenes totales** | 1000 |          ← Copia de "Órdenes a procesar"
| **Tamaño de lote (BATCH_SIZE)** | 50 |  ← Copia de "Tamaño de lote"
| **Número de mesas** | 150 |            ← Copia de "Mesas disponibles"
```

---

### 📊 Sección 2: Resultados Generales

**Dónde encontrar los datos:**

En el output verás:
```
⏱️  TIEMPO TOTAL:
   - Tiempo total: 2.60s
   - Órdenes por segundo: 384.02

✅ ÉXITOS:
   - Órdenes completadas: 61 (6.1%)

❌ FALLOS:
   - Órdenes fallidas: 939 (93.9%)

💾 DATOS EN BASE DE DATOS:
   - Órdenes creadas: 424
   - Órdenes pagadas: 61
   - Tickets generados: 61
   - Tasa de completitud: 14.4%
```

**Cómo llenar:**
```markdown
| **Tiempo total de ejecución** | 2.60 segundos |     ← De "Tiempo total"
| **Throughput (órdenes/segundo)** | 384.02 ord/s | ← De "Órdenes por segundo"

| **Órdenes completadas** | 61 | 6.1% |           ← De "✅ ÉXITOS"
| **Órdenes fallidas** | 939 | 93.9% |             ← De "❌ FALLOS"

| **Órdenes creadas en BD** | 424 |                ← De "💾 DATOS EN BASE DE DATOS"
| **Órdenes pagadas en BD** | 61 |
| **Tickets generados** | 61 |
| **Tasa de completitud** | 14.4% |
```

---

### ⏱️ Sección 4: Tiempos de Respuesta

**Dónde encontrar los datos:**

En el output verás:
```
⚡ TIEMPOS DE RESPUESTA COMPLETOS (ms):
   - Mínimo: 51ms
   - Promedio: 160.66ms
   - Mediana (P50): 104ms
   - P95: 323ms
   - P99: 355ms
   - Máximo: 355ms

🎯 TIEMPOS POR PASO (Promedio):
   - Crear Orden: 27.92ms
   - Cocina/Barra: 89.52ms
   - Finalizar: 15.31ms
   - Cobrar: 19.07ms
```

**Cómo llenar:**
```markdown
| **Mínimo** | 51 ms |                    ← Copia directamente
| **Promedio** | 160.66 ms |
| **Mediana (P50)** | 104 ms |
| **P95** | 323 ms |
| **P99** | 355 ms |
| **Máximo** | 355 ms |

| **Crear Orden** | 27.92 ms | 18.4% |  ← Tiempo (calcula % = 27.92/151.82*100)
| **Cocina/Barra** | 89.52 ms | 58.9% |
| **Finalizar** | 15.31 ms | 10.1% |
| **Cobrar** | 19.07 ms | 12.6% |
| **TOTAL** | 151.82 ms | 100% |       ← Suma de todos
```

**Cuello de botella:** El paso con mayor % (en este caso, "Cocina/Barra" con 58.9%)

---

### ❌ Sección 3: Distribución de Errores

**Dónde encontrar los datos:**

En el output verás:
```
❌ FALLOS:
   Distribución de errores:
      - Error procesando pago: 239 veces
      - 1 items fallaron en cocina/barra: 50 veces
      - 2 items fallaron en cocina/barra: 26 veces
      - La mesa 11 está ocupada: 6 veces
      - La mesa 33 está ocupada: 6 veces
      ...
```

**Cómo llenar los Top 10:**

1. Copia los primeros 10 errores
2. Calcula el porcentaje: (cantidad / total_fallos) * 100

```markdown
| # | Tipo de Error | Cantidad | Porcentaje |
|---|--------------|----------|------------|
| 1 | Error procesando pago | 239 | 25.5% |      ← 239/939*100 = 25.5%
| 2 | 1 items fallaron en cocina/barra | 50 | 5.3% |
| 3 | 2 items fallaron en cocina/barra | 26 | 2.8% |
| 4 | 3 items fallaron en cocina/barra | 25 | 2.7% |
| 5 | 4 items fallaron en cocina/barra | 17 | 1.8% |
| 6 | La mesa 11 está ocupada | 6 | 0.6% |
...
```

**Categorización:**

Agrupa los errores similares:

```markdown
| **Race conditions en mesas** | 576 | ← Suma todos los "La mesa X está ocupada"
| **Fallos en cocina/barra** | 118 | ← Suma todos los "X items fallaron"
| **Errores de pago** | 239 | ← "Error procesando pago"
| **Otros** | 6 | ← El resto
```

---

### 📉 Sección 5: Embudo de Conversión

**Cómo calcularlo:**

Usa los datos de la Sección 2:

```
1000 órdenes lanzadas (100%)              ← Total que intentaste (NUM_ORDENES)
    ↓
    ├─ 576 FALLARON en creación           ← Suma de "mesa ocupada"
    ↓
424 órdenes creadas (42.4%)               ← "Órdenes creadas en BD"
    ↓
    ├─ 118 FALLARON en cocina/barra       ← Suma de "items fallaron"
    ↓
306 órdenes procesadas (30.6%)            ← 424 - 118 = 306
    ↓
    ├─ 239 FALLARON en pago                ← "Error procesando pago"
    ↓
61 órdenes completadas (6.1%)             ← "Órdenes pagadas en BD"
```

**Fase con mayor pérdida:** La que tiene más fallos (en este caso, "creación" con 576 fallos)

**Tasa de conversión:** (órdenes pagadas / órdenes creadas) * 100 = (61/424)*100 = 14.4%

---

### 🔍 Sección 6: Problemas Identificados

**Problema 1: Race Conditions en Mesas**

```markdown
**Descripción:**
Múltiples órdenes intentan tomar la misma mesa simultáneamente.
El sistema no implementa locking transaccional, permitiendo que
varias órdenes pasen la validación de disponibilidad al mismo tiempo.

**Frecuencia:** 576 veces (61.3% del total)

**Impacto:**
☑️ Crítico  ☐ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
El endpoint POST /ordenes no usa transacciones atómicas. Entre la
verificación de disponibilidad y la actualización del estado, otra
request puede tomar la misma mesa.
```

**Problema 2: Fallos en Procesamiento de Cocina/Barra**

```markdown
**Descripción:**
Items de órdenes fallan al ser marcados como "listos" en cocina o barra.

**Frecuencia:** 118 veces (12.6% del total)

**Impacto:**
☐ Crítico  ☑️ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
Timeouts de 10 segundos insuficientes bajo alta carga, o race conditions
en actualización del estado de OrdenItem.
```

**Problema 3: Errores en Proceso de Pago**

```markdown
**Descripción:**
Órdenes finalizadas no pueden ser cobradas, fallando en el último paso.

**Frecuencia:** 239 veces (25.5% del total)

**Impacto:**
☑️ Crítico  ☐ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
Todas las órdenes actualizan el mismo CajaTurno simultáneamente,
causando conflictos en el campo totalVentas.
```

---

### ✅ Sección 9: Aspectos Positivos

**Ejemplos de lo que puedes escribir:**

```markdown
1. **Integridad de datos perfecta en órdenes exitosas**

   Evidencia: Las 61 órdenes completadas tienen 61 tickets generados,
   sin inconsistencias entre orden.estado y existencia de ticket.

2. **Tiempos de respuesta rápidos cuando no hay saturación**

   Evidencia: Tiempo mínimo de 51ms y promedio de 160ms demuestra
   que el sistema es eficiente bajo condiciones normales.

3. **El sistema no crashea bajo carga extrema**

   Evidencia: El servidor procesó 1000 requests concurrentes sin
   caerse, manejando errores apropiadamente.
```

---

### 💡 Sección 10: Recomendaciones

**Ejemplos:**

**Críticas:**
```markdown
1. Implementar transacciones con SELECT FOR UPDATE en creación de
   órdenes para eliminar race conditions en mesas.

   Impacto esperado: Reducir fallos de "mesa ocupada" de 61% a <5%

2. Usar transacciones atómicas en proceso de pago para evitar
   conflictos en actualización de CajaTurno.

   Impacto esperado: Reducir fallos de pago de 25% a <2%
```

**Mejoras Futuras:**
```markdown
- Implementar sistema de cola (Redis/Bull) para procesamiento asíncrono
- Aumentar timeouts a 30s para endpoints de cocina/barra bajo carga
- Agregar retry logic con exponential backoff en operaciones idempotentes
- Implementar connection pooling con límite de 100 conexiones
```

---

### 📝 Sección 11: Conclusiones

**Ejemplo de Resumen Ejecutivo:**

```markdown
La prueba de estrés reveló que el sistema tiene una arquitectura sólida
pero presenta limitaciones críticas de concurrencia. Con batching de 50
órdenes simultáneas, solo el 6.1% de las órdenes completaron el flujo
completo. Los principales problemas son race conditions en la asignación
de mesas (61% de fallos) y errores en el proceso de pago (25% de fallos).

El sistema funciona correctamente bajo carga normal, con tiempos de
respuesta de ~160ms promedio, pero no está preparado para concurrencia
extrema. Las órdenes que sí completan el flujo mantienen integridad
perfecta de datos.

Se requiere implementar locking transaccional en operaciones críticas
para preparar el sistema para producción. Con estas mejoras, se espera
alcanzar >90% de tasa de éxito.
```

**Aprendizajes Clave:**

```markdown
1. El throughput (velocidad bruta) no garantiza confiabilidad bajo carga

2. Las transacciones atómicas son esenciales para operaciones en
   recursos compartidos (mesas, turno de caja)

3. El batching reduce pero no elimina completamente las race conditions;
   se necesita solución arquitectónica en el backend
```

---

## Paso 4: Validar Datos

Antes de entregar, verifica:

### Checklist de Consistencia

- [ ] Órdenes totales = Órdenes completadas + Órdenes fallidas
- [ ] Suma de categorías de errores ≈ Total de órdenes fallidas
- [ ] Órdenes pagadas en BD = Tickets generados
- [ ] Porcentajes suman 100%
- [ ] El embudo hace sentido (cada paso ≤ paso anterior)

### Checklist de Calidad

- [ ] Completaste todas las secciones principales
- [ ] Los problemas tienen descripción clara
- [ ] Las recomendaciones son específicas y accionables
- [ ] La conclusión resume bien los hallazgos
- [ ] No hay campos en blanco (o marcaste N/A)

---

## Paso 5: Exportar (Opcional)

### Para entregar en PDF:

**Opción 1: VS Code**
1. Abre el `.md` en VS Code
2. Instala extensión "Markdown PDF"
3. Ctrl+Shift+P → "Markdown PDF: Export (pdf)"

**Opción 2: Online**
1. Copia el contenido del `.md`
2. Ve a https://www.markdowntopdf.com/
3. Pega y descarga PDF

**Opción 3: Pandoc (requiere instalación)**
```bash
pandoc RESULTADOS-PRUEBA-ESTRES.md -o RESULTADOS-PRUEBA-ESTRES.pdf
```

---

## Tips Finales

### ✅ Buenas Prácticas

- **Sé honesto:** Si algo salió mal, repórtalo (demuestra análisis crítico)
- **Sé específico:** Usa números exactos, no "muchos" o "pocos"
- **Sé profesional:** Usa lenguaje técnico apropiado
- **Sé conciso:** El profesor valorará claridad sobre extensión

### ❌ Errores Comunes a Evitar

- No copiar/pegar TODO el output (solo lo necesario)
- No inventar datos si no los tienes
- No dejar secciones en blanco sin explicación
- No olvidar calcular porcentajes y totales
- No contradecir tus propios números

### 🎯 Para Impresionar

1. **Agrega gráficas:** Usa Excel/Google Sheets para crear gráficas de:
   - Embudo de conversión
   - Distribución de errores (pie chart)
   - Tiempos por paso (bar chart)

2. **Compara múltiples pruebas:** Ejecuta con BATCH_SIZE 10, 25, 50 y compara

3. **Calcula métricas adicionales:**
   - Error rate por cada 100 órdenes
   - Tiempo promedio por orden exitosa vs fallida
   - % de mejora entre pruebas

4. **Propón soluciones técnicas:** No solo identifiques problemas, sugiere código específico

---

## Ejemplo Completo

Ver el archivo `EJEMPLO-RESULTADOS-LLENADO.md` para un ejemplo completamente llenado.

---

¿Dudas? Revisa:
- `STRESS-TEST-FULL-FLOW-README.md` - Guía de ejecución
- `STRESS-TEST-ANALYSIS.md` - Análisis técnico profundo
- Output de tu terminal - Todos los datos están ahí

**¡Buena suerte con tu presentación! 🚀**
