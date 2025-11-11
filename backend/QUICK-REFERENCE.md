# ⚡ Referencia Rápida - Pruebas de Estrés

## 🚀 Setup (Solo Primera Vez)
```bash
cd backend && npm install && npm run migrate && npm run seed
```

---

## 📟 Comandos Esenciales

### Iniciar Servidor (Terminal 1)
```bash
npm run dev
```

### Ejecutar Pruebas (Terminal 2)

| Comando | Órdenes | Batch | Descripción |
|---------|---------|-------|-------------|
| `npm run stress-test:full:small` | 10 | 50 | **EMPIEZA AQUÍ** ⭐ |
| `npm run stress-test:full:medium` | 100 | 50 | Carga media |
| `npm run stress-test:full:large` | 500 | 50 | Carga alta |
| `npm run stress-test:full` | 1000 | 50 | **Stress máximo** |

### Control de Concurrencia

| Comando | Batch | Seguridad | Éxito Esperado |
|---------|-------|-----------|----------------|
| `npm run stress-test:full:batch-10` | 10 | 🟢 Muy seguro | 70-90% |
| `npm run stress-test:full:batch-25` | 25 | 🟡 Balance | 50-70% |
| `npm run stress-test:full` | 50 | 🟠 Moderado | 30-50% |
| `npm run stress-test:full:batch-100` | 100 | 🔴 Agresivo | 10-30% |

### Limpieza

```bash
npm run clean    # Limpiar órdenes de prueba
npm run reset    # Reset completo
```

---

## 🎯 Personalización

```bash
# Cambiar número de órdenes
NUM_ORDENES=500 npm run stress-test:full

# Cambiar tamaño de lote
BATCH_SIZE=15 npm run stress-test:full

# Combinación
NUM_ORDENES=250 BATCH_SIZE=25 npm run stress-test:full
```

---

## 📊 Interpretar Resultados

```
✅ Órdenes completadas: XX (XX%)     ← Tu tasa de éxito
❌ Órdenes fallidas: XX (XX%)        ← Problemas encontrados
💾 Órdenes creadas: XXX              ← Cuántas pasaron primer paso
💾 Órdenes pagadas: XX               ← Cuántas completaron TODO
```

**Bueno:** >90% éxito
**Aceptable:** 50-90% éxito
**Malo:** <50% éxito

---

## 🔥 Quick Start Para Presentación

```bash
# Terminal 1: Servidor
cd backend && npm run dev

# Terminal 2: Prueba
npm run stress-test:full:small

# Copiar output, llenar documento, listo!
```

---

## ⚠️ Si Algo Falla

```bash
# Servidor no responde → Reiniciar
Ctrl+C en Terminal 1, luego: npm run dev

# Muchos errores "mesa ocupada" → Reducir batch
npm run stress-test:full:batch-10

# Se colgó → Cancelar y reset
Ctrl+C, luego: npm run reset
```

---

## 📄 Documentos

- `RESULTADOS-PRUEBA-ESTRES.md` → Plantilla completa
- `RESULTADOS-PRUEBA-ESTRES-SIMPLE.md` → Plantilla corta
- `GUIA-LLENAR-RESULTADOS.md` → Cómo llenar
- `COMANDOS-PRUEBAS.md` → Guía detallada (este doc)

---

## 💬 Para el Profesor

**"¿Qué hiciste?"**
→ *"Implementé prueba de estrés del flujo completo con 1000 órdenes concurrentes"*

**"¿Qué encontraste?"**
→ *"Problemas de race condition con X% de fallos. Implementé batching que mejoró a Y%"*

**"¿Solución?"**
→ *"Locking transaccional en el backend para recursos compartidos"*

---

**¡Todo listo! 🎯**
