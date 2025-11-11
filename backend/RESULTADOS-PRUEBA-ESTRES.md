# 📊 Resultados de Prueba de Estrés - Sistema de Restaurante

**Nombre del estudiante:** ________________________________

**Fecha de ejecución:** ________________________________

**Configuración del sistema:**
- Sistema Operativo: ________________________________
- Node.js versión: ________________________________
- PostgreSQL versión: ________________________________

---

## 1. Descripción de la Prueba

### Objetivo
Validar el comportamiento del sistema de gestión de restaurante bajo condiciones de alta concurrencia, probando el flujo completo end-to-end desde la creación de órdenes hasta el cobro final.

### Flujo Probado

```
1. MESERO → Crea orden (POST /ordenes)
2. CHEF/BARTENDER → Procesa items en cocina/barra
3. MESERO → Finaliza orden (PATCH /ordenes/:id/finalizar)
4. CAJERO → Procesa pago (POST /caja/pagar)
```

### Configuración de Prueba

| Parámetro | Valor |
|-----------|-------|
| **Órdenes totales** | __________ |
| **Tamaño de lote (BATCH_SIZE)** | __________ |
| **Número de mesas** | __________ |
| **Número de platillos** | __________ |
| **Items por orden (rango)** | ______ a ______ items |
| **Simular tiempos de preparación** | Sí ☐  No ☐ |
| **API URL** | ______________________________ |

**Comando ejecutado:**
```bash
__________________________________________________________
```

---

## 2. Resultados Generales

### Métricas de Tiempo

| Métrica | Valor |
|---------|-------|
| **Tiempo total de ejecución** | __________ segundos |
| **Throughput (órdenes/segundo)** | __________ ord/s |

### Métricas de Éxito/Fallo

| Métrica | Cantidad | Porcentaje |
|---------|----------|------------|
| **Órdenes completadas** | __________ | _______% |
| **Órdenes fallidas** | __________ | _______% |
| **Total procesadas** | __________ | 100% |

### Datos en Base de Datos

| Métrica | Valor |
|---------|-------|
| **Órdenes creadas en BD** | __________ |
| **Órdenes pagadas en BD** | __________ |
| **Tickets generados** | __________ |
| **Tasa de completitud** | _______% |

---

## 3. Distribución de Errores

### Principales Errores Encontrados

Complete la tabla con los 10 errores más frecuentes:

| # | Tipo de Error | Cantidad | Porcentaje |
|---|--------------|----------|------------|
| 1 | ________________________________ | ________ | _______% |
| 2 | ________________________________ | ________ | _______% |
| 3 | ________________________________ | ________ | _______% |
| 4 | ________________________________ | ________ | _______% |
| 5 | ________________________________ | ________ | _______% |
| 6 | ________________________________ | ________ | _______% |
| 7 | ________________________________ | ________ | _______% |
| 8 | ________________________________ | ________ | _______% |
| 9 | ________________________________ | ________ | _______% |
| 10 | ________________________________ | ________ | _______% |

### Categorización de Errores

| Categoría | Cantidad | Descripción |
|-----------|----------|-------------|
| **Race conditions en mesas** | ________ | Órdenes que fallaron por "mesa ocupada" |
| **Fallos en cocina/barra** | ________ | Items que no pudieron ser procesados |
| **Errores de pago** | ________ | Fallos en el proceso de cobro |
| **Timeouts/Network** | ________ | Errores de conectividad o tiempo agotado |
| **Otros** | ________ | Otros tipos de error |

---

## 4. Tiempos de Respuesta

### Tiempos de Respuesta Completos (milisegundos)

| Percentil | Tiempo (ms) |
|-----------|-------------|
| **Mínimo** | ________ ms |
| **Promedio** | ________ ms |
| **Mediana (P50)** | ________ ms |
| **P95** | ________ ms |
| **P99** | ________ ms |
| **Máximo** | ________ ms |

### Tiempos por Paso (Promedio en ms)

| Paso del Flujo | Tiempo (ms) | % del Total |
|----------------|-------------|-------------|
| **Crear Orden** | ________ ms | _______% |
| **Cocina/Barra** | ________ ms | _______% |
| **Finalizar** | ________ ms | _______% |
| **Cobrar** | ________ ms | _______% |
| **TOTAL** | ________ ms | 100% |

**Cuello de botella identificado:** ________________________________

---

## 5. Embudo de Conversión

Complete el flujo de conversión de órdenes:

```
_______ órdenes lanzadas (100%)
    ↓
    ├─ _______ FALLARON en creación: _________________________________
    ↓
_______ órdenes creadas (_______%)
    ↓
    ├─ _______ FALLARON en cocina/barra: _____________________________
    ↓
_______ órdenes procesadas (_______%)
    ↓
    ├─ _______ FALLARON en pago: _____________________________________
    ↓
_______ órdenes completadas (_______%)
```

### Análisis del Embudo

**Fase con mayor pérdida:** ____________________________________________

**Tasa de conversión (creadas → pagadas):** _______%

---

## 6. Problemas Identificados

### Problema 1: ________________________________________________

**Descripción:**
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

**Frecuencia:** ________ veces (_______% del total)

**Impacto:**
☐ Crítico  ☐ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
___________________________________________________________________
___________________________________________________________________

---

### Problema 2: ________________________________________________

**Descripción:**
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

**Frecuencia:** ________ veces (_______% del total)

**Impacto:**
☐ Crítico  ☐ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
___________________________________________________________________
___________________________________________________________________

---

### Problema 3: ________________________________________________

**Descripción:**
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

**Frecuencia:** ________ veces (_______% del total)

**Impacto:**
☐ Crítico  ☐ Alto  ☐ Medio  ☐ Bajo

**Causa probable:**
___________________________________________________________________
___________________________________________________________________

---

## 7. Comparación con Pruebas Anteriores (Opcional)

Si ejecutaste múltiples pruebas, completa esta sección:

| Métrica | Prueba 1 | Prueba 2 | Prueba 3 | Cambio |
|---------|----------|----------|----------|--------|
| **BATCH_SIZE** | ________ | ________ | ________ | - |
| **Tasa de éxito** | _____% | _____% | _____% | _______ |
| **Órdenes creadas** | ________ | ________ | ________ | _______ |
| **Tiempo promedio** | ____ ms | ____ ms | ____ ms | _______ |
| **Errores "mesa ocupada"** | ________ | ________ | ________ | _______ |

**Conclusión de la comparación:**
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

---

## 8. Análisis de Concurrencia

### Efectividad del Batching

**¿El sistema de batching redujo los problemas de race condition?**
☐ Sí, significativamente
☐ Sí, parcialmente
☐ No, sin diferencia notable

**Evidencia:**
___________________________________________________________________
___________________________________________________________________

### Límites del Sistema

**Máxima concurrencia soportada con >90% éxito:** ________ órdenes simultáneas

**BATCH_SIZE óptimo encontrado:** ________

**Justificación:**
___________________________________________________________________
___________________________________________________________________

---

## 9. Aspectos Positivos Encontrados

Liste al menos 3 aspectos positivos del sistema:

1. **_____________________________________________________________**

   Evidencia: ________________________________________________________

2. **_____________________________________________________________**

   Evidencia: ________________________________________________________

3. **_____________________________________________________________**

   Evidencia: ________________________________________________________

---

## 10. Recomendaciones

### Prioridad Crítica

**Recomendación 1:**
___________________________________________________________________
___________________________________________________________________

**Impacto esperado:** ______________________________________________

---

**Recomendación 2:**
___________________________________________________________________
___________________________________________________________________

**Impacto esperado:** ______________________________________________

---

### Prioridad Alta

**Recomendación 3:**
___________________________________________________________________
___________________________________________________________________

---

**Recomendación 4:**
___________________________________________________________________
___________________________________________________________________

---

### Mejoras Futuras (Prioridad Media/Baja)

___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

---

## 11. Conclusiones

### ¿El sistema está listo para producción?

☐ Sí, sin cambios
☐ Sí, con cambios menores
☐ Sí, con cambios importantes
☐ No, requiere refactorización

### Resumen Ejecutivo

Escriba un párrafo resumiendo los hallazgos principales:

___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

### Aprendizajes Clave

1. ________________________________________________________________

2. ________________________________________________________________

3. ________________________________________________________________

---

## 12. Anexos

### Configuración del Sistema

**Hardware utilizado:**
- CPU: ___________________________________________________________
- RAM: ___________________________________________________________
- Disco: _________________________________________________________

**Software:**
- SO: ____________________________________________________________
- Node.js: _______________________________________________________
- PostgreSQL: ____________________________________________________
- Dependencias principales: ______________________________________

### Comandos Ejecutados

```bash
# Preparación
_________________________________________________________________

# Ejecución de prueba
_________________________________________________________________

# Limpieza (si aplica)
_________________________________________________________________
```

### Capturas de Pantalla o Logs Relevantes

_Pegar aquí capturas de pantalla o fragmentos de logs importantes:_

```
[Espacio para logs o screenshots]














```

---

## 13. Validación

### Checklist de Validación

Marque las verificaciones realizadas:

- [ ] El servidor estaba corriendo antes de la prueba
- [ ] La base de datos estaba limpia (npm run reset)
- [ ] Los usuarios (mesero, chef, bartender, cajero) existían
- [ ] El turno de caja estaba abierto
- [ ] Se verificó que las mesas estaban disponibles
- [ ] La prueba completó sin crashes del servidor
- [ ] Los datos en BD coinciden con el reporte
- [ ] Se documentaron todos los errores principales

### Integridad de Datos

**¿Los datos finales en BD son consistentes?**

- Órdenes en BD: ________ = Órdenes reportadas: ________  ☐ Sí  ☐ No
- Tickets en BD: ________ = Órdenes pagadas: ________  ☐ Sí  ☐ No
- Mesas disponibles después: ________ de ________ totales

---

## Firma y Validación

**Ejecutado por:** ________________________________  **Fecha:** __________

**Revisado por:** ________________________________  **Fecha:** __________

---

## Notas Adicionales

_Espacio para observaciones adicionales, problemas encontrados durante la ejecución, o cualquier información relevante no capturada en las secciones anteriores:_

___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

---

**Documento generado usando:** stress-test-full-flow.js v1.0
**Última actualización:** 2025-11-11
