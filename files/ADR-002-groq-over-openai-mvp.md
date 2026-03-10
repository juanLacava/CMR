# ADR-002 — Groq/LLaMA para MVP en lugar de OpenAI

**Estado:** Aceptado  
**Fecha:** 2026-03-10  
**Autores:** Arquitectura de Software

---

## Contexto

El AI Agent necesita clasificar intenciones y generar respuestas en tiempo real. El costo de IA es el mayor riesgo de viabilidad en Fase 0 y Fase 1 cuando el revenue es mínimo.

## Decisión

Usar **Groq API con LLaMA 3.1** para el MVP (Fase 0 y Fase 1). Migrar a **OpenAI GPT-4o mini** en Fase 2 cuando el revenue lo justifique.

## Comparación

| Criterio | Groq + LLaMA 3.1 | OpenAI GPT-4o mini |
|---|---|---|
| Costo Fase 0-1 | **$0/día** (14.400 req gratis) | ~$0.15 / 1M tokens |
| Latencia | **<200ms** (hardware especializado) | ~500-800ms |
| Calidad razonamiento | Buena para clasificación de intención | Superior para razonamiento complejo |
| Disponibilidad | Alta | Alta |

## Consecuencias

- ✅ $0 de costo de IA hasta escalar
- ✅ Latencia mejor que OpenAI para clasificación simple
- ⚠️ LLaMA puede tener menos precisión en español coloquial rioplatense
- ⚠️ Límite de 14.400 req/día en free tier — suficiente para Fase 0-1
- 📌 **Migración a GPT-4o mini:** cuando superar los 20 tenants activos o cuando el confidence score promedio caiga por debajo de 0.75
