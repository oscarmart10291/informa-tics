# 🚀 Guía Rápida de Comandos - Pruebas de Estrés

## Prerequisitos (Solo Primera Vez)

```bash
cd backend
npm install
npm run migrate
npm run seed
```

---

## Iniciar el Servidor

**Siempre en Terminal 1:**
```bash
cd backend
npm run dev
```

Espera a ver: `✅ Servidor escuchando en puerto 3001`

---

## Comandos de Prueba (Terminal 2)

### 📦 Pruebas Básicas - Flujo Completo

```bash
# EMPIEZA AQUÍ - 10 órdenes (prueba rápida)
npm run stress-test:full:small

# 100 órdenes (prueba media)
npm run stress-test:full:medium

# 500 órdenes (prueba grande)
npm run stress-test:full:large

# 1000 órdenes con batch de 50 (default)
npm run stress-test:full
```

---

### ⚙️ Pruebas con Control de Concurrencia

```bash
# Lotes de 10 (MÁS SEGURO - Menos race conditions)
npm run stress-test:full:batch-10

# Lotes de 25 (BALANCE)
npm run stress-test:full:batch-25

# Lotes de 50 (DEFAULT)
npm run stress-test:full

# Lotes de 100 (MÁS RÁPIDO - Más race conditions)
npm run stress-test:full:batch-100
```

**Recomendación:** Si tienes muchos fallos de "mesa ocupada", reduce el BATCH_SIZE.

---

### 🎯 Pruebas con Simulación de Tiempo Real

```bash
# Con delays de preparación (más realista)
npm run stress-test:full:with-prep
```

Agrega tiempos de espera aleatorios entre pasos para simular comportamiento real.

---

### 🔧 Comandos Personalizados

```bash
# Personalizar número de órdenes
NUM_ORDENES=250 npm run stress-test:full

# Personalizar tamaño de lote
BATCH_SIZE=15 npm run stress-test:full

# Combinar parámetros
NUM_ORDENES=500 BATCH_SIZE=25 npm run stress-test:full

# Con simulación de tiempo
SIMULATE_PREP_TIME=true NUM_ORDENES=50 BATCH_SIZE=10 npm run stress-test:full

# Usar otro puerto del API
API_URL=http://localhost:4000 npm run stress-test:full

# Desactivar limpieza automática
AUTO_CLEAN=false npm run stress-test:full
```

---

## 🧹 Comandos de Limpieza

```bash
# Limpiar órdenes de prueba (mantiene datos base)
npm run clean

# Reset completo (elimina TODO y vuelve a crear)
npm run reset
```

**Cuándo usar cada uno:**

- `npm run clean` → Entre pruebas normales (rápido)
- `npm run reset` → Cuando algo se rompió o quieres empezar de cero (lento)

---

## 📊 Flujo Completo de Trabajo

### Scenario 1: Primera Prueba

```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd backend
npm run stress-test:full:small    # Empezar con 10 órdenes
```

Resultado esperado: 100% de éxito

---

### Scenario 2: Probar Diferentes Niveles de Carga

```bash
# Terminal 2 (servidor ya corriendo)
npm run stress-test:full:small     # 10 órdenes → 100% éxito
npm run stress-test:full:medium    # 100 órdenes → ~50-80% éxito
npm run stress-test:full:large     # 500 órdenes → ~20-40% éxito
npm run stress-test:full           # 1000 órdenes → ~5-10% éxito
```

No necesitas limpiar entre cada una si AUTO_CLEAN está activo (default).

---

### Scenario 3: Encontrar el BATCH_SIZE Óptimo

```bash
# Probar diferentes tamaños de lote con 1000 órdenes
npm run stress-test:full:batch-10     # Esperado: 70-90% éxito
npm run stress-test:full:batch-25     # Esperado: 50-70% éxito
npm run stress-test:full              # (batch-50) Esperado: 30-50% éxito
npm run stress-test:full:batch-100    # Esperado: 10-30% éxito
```

Anota los resultados de cada uno para comparar.

---

### Scenario 4: Prueba Realista

```bash
# Simula comportamiento real de restaurante
SIMULATE_PREP_TIME=true NUM_ORDENES=50 BATCH_SIZE=5 npm run stress-test:full
```

Esto es lo más cercano a uso real: pocas órdenes simultáneas, con tiempos de espera.

---

## 🎓 Para tu Presentación al Profesor

### Opción A: Demostración Rápida (5 minutos)

```bash
# 1. Mostrar que funciona bien con poca carga
npm run stress-test:full:small
# Resultado: 100% éxito

# 2. Mostrar el problema con alta carga
npm run stress-test:full
# Resultado: ~5-10% éxito (demuestra el problema)

# 3. Explicar que implementaste batching para mitigarlo
```

---

### Opción B: Análisis Comparativo (10 minutos)

```bash
# 1. Sin batching (batch grande)
BATCH_SIZE=1000 npm run stress-test:full
# Resultado: ~3% éxito

# 2. Con batching moderado
npm run stress-test:full:batch-25
# Resultado: ~50-70% éxito

# 3. Con batching conservador
npm run stress-test:full:batch-10
# Resultado: ~70-90% éxito

# Conclusión: El batching mejora significativamente los resultados
```

---

### Opción C: Solo Mostrar Resultados (ya ejecutaste antes)

No ejecutes nada en vivo, solo muestra:
1. El output guardado en un archivo .txt
2. El documento RESULTADOS-PRUEBA-ESTRES.md ya llenado
3. Capturas de pantalla

---

## ⚠️ Troubleshooting

### Problema: "Cannot connect to server"

```bash
# Verificar que el servidor está corriendo
curl http://localhost:3001/categorias

# Si no responde, reinicia el servidor
# Terminal 1: Ctrl+C y luego:
npm run dev
```

---

### Problema: "Mesa X está ocupada" (muchos errores)

**Solución:** Reducir BATCH_SIZE

```bash
# En lugar de:
npm run stress-test:full              # batch-50

# Usar:
npm run stress-test:full:batch-10     # batch-10
```

---

### Problema: "NO_TURNO_ABIERTO"

```bash
# Limpiar y reintentar
npm run reset
npm run stress-test:full:small
```

---

### Problema: La prueba se queda colgada

**Causas comunes:**
1. Servidor caído
2. Base de datos sin responder
3. Timeouts muy largos

**Solución:**
```bash
# Ctrl+C para cancelar
# Reiniciar servidor y BD
npm run reset
npm run dev
```

---

## 📈 Interpretar Resultados

### Resultado Bueno ✅
```
✅ ÉXITOS:
   - Órdenes completadas: 90+ (90%+)
```
Sistema funciona bien con esa carga.

---

### Resultado Aceptable ⚠️
```
✅ ÉXITOS:
   - Órdenes completadas: 50-89 (50-89%)
```
Sistema funciona pero tiene limitaciones bajo carga.

---

### Resultado Malo ❌
```
✅ ÉXITOS:
   - Órdenes completadas: <50 (<50%)
```
Sistema tiene problemas serios de concurrencia.

---

## 🎯 Recomendaciones por Escenario

### Si tienes POCO tiempo (solo quieres pasar la materia)

```bash
# Ejecuta solo esto:
npm run stress-test:full:small

# Llena el documento simple:
RESULTADOS-PRUEBA-ESTRES-SIMPLE.md

# Conclusión: "El sistema funciona correctamente"
```

---

### Si quieres BUENA nota

```bash
# Ejecuta 3 pruebas:
npm run stress-test:full:small    # Baseline
npm run stress-test:full:medium   # Carga media
npm run stress-test:full          # Stress alto

# Llena el documento completo:
RESULTADOS-PRUEBA-ESTRES.md

# Incluye comparación y análisis
```

---

### Si quieres DESTACAR (máxima nota)

```bash
# Ejecuta 5+ pruebas comparando BATCH_SIZE:
npm run stress-test:full:batch-10
npm run stress-test:full:batch-25
npm run stress-test:full:batch-50
npm run stress-test:full:batch-100
BATCH_SIZE=1000 npm run stress-test:full

# Documenta TODO con gráficas
# Propón soluciones técnicas (locking transaccional)
# Crea presentación con análisis profundo
```

---

## 📁 Guardar Resultados

### Opción 1: Copiar a archivo

```bash
npm run stress-test:full > resultados.txt
```

---

### Opción 2: Screenshot

- Ejecuta el comando
- Captura pantalla completa
- Pega en el documento

---

### Opción 3: Ambas

```bash
# Guardar en archivo Y ver en pantalla
npm run stress-test:full | tee resultados.txt
```

---

## 🔥 Comandos Pro (Avanzado)

```bash
# Prueba extrema (2000 órdenes)
NUM_ORDENES=2000 BATCH_SIZE=50 npm run stress-test:full

# Prueba ultra-conservadora
NUM_ORDENES=1000 BATCH_SIZE=5 npm run stress-test:full

# Prueba con API en otro servidor
API_URL=http://192.168.1.100:3001 npm run stress-test:full

# Solo crear órdenes (sin flujo completo)
npm run stress-test:medium

# Ver solo errores (filtrar output)
npm run stress-test:full 2>&1 | grep "❌"
```

---

## ✅ Checklist Antes de Presentar

Verifica que ejecutaste:

- [ ] Al menos UNA prueba completa
- [ ] Guardaste el output (screenshot o .txt)
- [ ] Llenaste el documento de resultados
- [ ] Entiendes los 3 problemas principales
- [ ] Puedes explicar qué es batching
- [ ] Sabes tu tasa de éxito
- [ ] Conoces el comando que ejecutaste

---

## 🎤 Qué Decir al Profesor

**Cuando te pregunte:** "¿Qué comando ejecutaste?"

**Responde:**
```
"Ejecuté npm run stress-test:full que procesa 1000 órdenes
en lotes de 50 simultáneas, probando el flujo completo desde
creación hasta cobro."
```

**Si pregunta:** "¿Puedes ejecutarlo ahora?"

**Responde:**
```
"Claro, aquí está el servidor corriendo (muestra Terminal 1),
y ejecuto npm run stress-test:full:small para una demo rápida
de 10 órdenes."
```

---

## 📞 Ayuda Rápida

**¿No sabes qué comando usar?**
→ Usa `npm run stress-test:full:small`

**¿El servidor no responde?**
→ `npm run dev` en Terminal 1

**¿Muchos errores?**
→ Reduce el BATCH_SIZE

**¿Quieres empezar de cero?**
→ `npm run reset`

**¿Necesitas resultados ya?**
→ Usa el documento SIMPLE

---

**¡Buena suerte! 🚀**
