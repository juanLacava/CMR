# ADR-001 — Multi-tenancy con Row Level Security

**Estado:** Aceptado  
**Fecha:** 2026-03-10  
**Autores:** Arquitectura de Software

---

## Contexto

CMR es un SaaS donde múltiples emprendimientos (tenants) comparten la misma infraestructura. Necesitamos garantizar aislamiento total de datos entre tenants sin incurrir en costo operativo de mantener bases de datos separadas.

## Decisión

Usar **una única base de datos PostgreSQL** con `tenant_id` en cada tabla, asegurado mediante **Row Level Security (RLS)** nativo de Supabase.

```sql
-- Patrón aplicado a todas las tablas
ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON {tabla}
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Schema-per-tenant | Complejo de administrar a escala. Migraciones deben correr N veces. |
| DB-per-tenant | Costo prohibitivo. Inmanejable con cientos de tenants. |
| Filtrado en aplicación | Inseguro. Un bug en el código expone datos de otros tenants. |

## Consecuencias

- ✅ Costo de infraestructura mínimo (una sola DB)
- ✅ Migraciones corren una sola vez para todos los tenants
- ✅ Aislamiento garantizado a nivel de motor, no de aplicación
- ⚠️ Requiere disciplina: toda tabla nueva debe tener `tenant_id` + política RLS
- ⚠️ Queries de análisis cross-tenant (para el admin SaaS) requieren service role key
