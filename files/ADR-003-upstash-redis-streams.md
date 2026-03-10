# ADR-003 — Upstash Redis Streams como Event Bus

**Estado:** Aceptado  
**Fecha:** 2026-03-10  
**Autores:** Arquitectura de Software

---

## Contexto

El handbook define Redis Streams como Event Bus (sección 5.3). Necesitamos una solución compatible con Redis Streams que no requiera infraestructura dedicada en Fase 0-1.

## Decisión

Usar **Upstash Redis** (serverless) en lugar de un Redis dedicado. Upstash es 100% compatible con Redis Streams y tiene free tier suficiente para Fase 0-1.

## Detalles de implementación

```
Upstash Redis Streams — free tier:
- 10.000 comandos/día
- Compatible con redis-cli y todos los clientes Redis estándar
- Sin servidor que administrar
- Persiste datos (a diferencia de Redis volátil)
```

Uso en el sistema:
- **Event Bus:** streams para `MESSAGE_RECEIVED`, `ORDER_CREATED`, etc.
- **Stock Hold:** keys con TTL de 600s para reservas temporales
- **Conversation State:** memoria corta del AI Agent por sesión
- **Idempotencia:** set de `event_id` procesados para evitar duplicados

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Redis en Railway | $5-10/mes adicionales en Fase 0. Innecesario. |
| RabbitMQ | Más complejo, requiere servidor dedicado |
| Supabase Realtime | No es un message broker, no tiene persistencia de eventos |

## Consecuencias

- ✅ $0 costo en Fase 0-1
- ✅ Sin ops — no hay servidor Redis que mantener
- ✅ Mismo protocolo Redis, migración transparente si se necesita escalar
- ⚠️ Límite de 10.000 comandos/día en free tier
- ⚠️ En Fase 2 con alto volumen, upgrade a Upstash Pro (~$10/mes) o Redis dedicado en Railway
