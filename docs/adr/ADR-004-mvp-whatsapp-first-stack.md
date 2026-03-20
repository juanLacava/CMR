# ADR-004: MVP WhatsApp-first con Chatwoot + Supabase

## Estado

Aceptado

## Contexto

El producto necesita:

- operar principalmente desde WhatsApp
- centralizar mensajes de varias plataformas en una sola bandeja
- manejar clientes, stock y pedidos
- minimizar costo y tiempo de implementación

El repositorio actual no tiene una aplicación funcional. Solo contiene decisiones de arquitectura y un esqueleto documental.

## Decisión

Se adopta la siguiente estrategia para el MVP:

- `WhatsApp Cloud API` como canal principal oficial
- `Chatwoot` self-hosted como bandeja omnicanal y capa de atención
- `Supabase/Postgres` como fuente de verdad para clientes, stock y pedidos
- `IA asistida` para clasificación y sugerencias

## Consecuencias

### Positivas

- menor costo de desarrollo
- menor complejidad operativa
- se evita construir una bandeja desde cero
- se puede escalar a Instagram/Facebook más adelante
- el negocio conserva trazabilidad de stock y pedidos

### Negativas

- hay una dependencia operativa en Chatwoot
- parte del modelo conversacional vive fuera del CRM propio
- la sincronización Chatwoot -> Supabase debe diseñarse bien para evitar inconsistencias

## Alternativas descartadas

### 1. Agente IA autónomo como núcleo

Descartado para MVP porque:

- aumenta el riesgo operativo
- complica auditoría
- no resuelve bien la lógica de stock
- requiere más producto, testing y supervisión

### 2. Construir inbox omnicanal propia

Descartado para MVP porque:

- consume demasiado tiempo
- retrasa la salida al mercado
- resuelve un problema ya cubierto por software existente

### 3. Twilio como capa de WhatsApp

No se prioriza inicialmente porque:

- agrega costo intermediario
- el caso principal puede resolverse con la API oficial de Meta
