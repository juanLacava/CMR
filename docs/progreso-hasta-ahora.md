# Progreso Hasta Ahora

## Estado general

Se retomó el proyecto CMR y quedó montada una base funcional para un CRM multiusuario con Supabase, Chatwoot y dashboard web en Next.js.

## Lo implementado

### 1. Estructura del monorepo

- Se ajustó el `package.json` raíz para usar `workspaces`.
- Se agregaron scripts para correr `apps/web` y Supabase desde la raíz.

### 2. MVP base existente validado

Quedaron identificados y revisados estos componentes:

- `apps/web`: dashboard web
- `supabase/functions/chatwoot-webhook`: webhook para persistencia desde Chatwoot
- `supabase/migrations/20260320000001_init_mvp.sql`: schema inicial CRM

### 3. Multiusuario real

Se implementó una segunda migración:

- `supabase/migrations/20260320000002_multiuser_auth.sql`

Esa migración agrega:

- tabla `profiles`
- tabla `tenant_memberships`
- trigger para sincronizar `auth.users` con `profiles`
- backfill de usuarios ya existentes
- helpers SQL para autorización por tenant y rol
- policies RLS por membership y rol

Roles definidos:

- `owner`
- `admin`
- `agent`
- `viewer`

### 4. Dashboard autenticado

La app web dejó de depender del `SUPABASE_SERVICE_ROLE_KEY` para lectura normal.

Ahora:

- usa `NEXT_PUBLIC_SUPABASE_URL`
- usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- autentica con Supabase Auth
- lista memberships por tenant
- permite login y signup
- selecciona tenant activo en la UI
- lee clientes, pedidos, productos y conversaciones bajo RLS

Archivos principales:

- `apps/web/app/dashboard-client.tsx`
- `apps/web/lib/supabase.ts`
- `apps/web/lib/env.ts`

### 5. Fixes hechos durante la puesta en marcha

- Se corrigió el acceso a env vars `NEXT_PUBLIC_*` en cliente para que Next.js las resuelva bien.
- Se corrigió `next.config.ts` para usar `typedRoutes` sin el warning viejo.
- Se resolvió el conflicto de nombres de migraciones renombrándolas a versiones únicas de 14 dígitos.
- Se confirmó que la app compila con:

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
npm --prefix apps/web run build
```

### 6. Gestión de equipo por tenant

Se agregó una tercera migración:

- `supabase/migrations/20260321000003_membership_management.sql`

Esa migración agrega:

- RPC `list_tenant_memberships`
- RPC `upsert_tenant_membership_by_email`
- RPC `remove_tenant_membership`
- validaciones para que solo `owner` y `admin` gestionen miembros
- restricción para que solo `owner` pueda promover o remover a otro `owner`
- protección para no dejar un tenant sin ningún `owner`

Además, el dashboard ahora:

- lista el equipo del tenant activo
- permite agregar o actualizar memberships por email
- permite remover memberships desde la UI
- oculta la administración de equipo a roles `agent` y `viewer`

### 7. Seed demo para desarrollo local

Se agregó un script de demo:

- `scripts/seed-demo-data.mjs`

Disponible desde:

```bash
npm run seed:demo -- --tenant-slug mi-negocio
```

El script:

- upsertea clientes demo
- upsertea productos demo
- recrea conversaciones y mensajes demo
- recrea pedidos demo con items
- deja el dashboard con datos visibles para validar métricas y vistas

### 8. Ajustes finales de UI

Se agregó un botón visible de `Sign out` dentro del bloque de sesión activa del dashboard para hacer más claro el cierre de sesión.

## Problemas resueltos

### Supabase local

- Se detectó conflicto de puerto `54327` por otro proyecto Supabase viejo.
- Se identificó el contenedor conflictivo y se liberó el puerto.
- Se levantó Supabase local correctamente.
- Se ejecutó `npx supabase db reset` con éxito.

### Variables de entorno

- Se detectó que Next estaba corriendo desde `apps/web`, por lo que el `.env.local` relevante debía estar también ahí.
- Se detectó además que `NEXT_PUBLIC_SUPABASE_URL` estaba mal escrita con comentario inline en la misma línea.
- Finalmente se corrigió el bug real de lectura dinámica de `process.env[name]` en cliente.

## Estado actual

Hoy el proyecto:

- levanta Supabase local
- aplica migraciones
- levanta la app web
- muestra pantalla de autenticación
- permite registro/login
- permite bootstrapear el primer `owner` por CLI
- permite gestionar memberships desde la UI
- permite cerrar sesión desde el dashboard
- puede cargarse con datos demo para validar vistas

## Estado validado localmente

Se dejó creado y validado este setup local:

- usuario owner: `eduardolacava@yahoo.com.ar`
- tenant: `Mi negocio`
- slug: `mi-negocio`
- datos demo cargados: 3 clientes, 3 productos, 2 conversaciones, 2 pedidos

## Lo que falta para usarlo

### Bootstrap inicial del primer owner

1. Crear un usuario desde la UI.
2. Ejecutar desde la raíz:

```bash
npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio"
```

Opcionales:

```bash
npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio" --tenant-slug mi-negocio --full-name "Juan"
```

El script:

- busca el usuario en `auth.users`
- crea el tenant si todavía no existe
- crea o reutiliza la membership con rol `owner`
- devuelve `userId`, `tenantId` y `membershipId`

## Variables mínimas para `apps/web/.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
CHATWOOT_APP_URL=http://localhost:3000
CHATWOOT_WEBHOOK_SECRET=test-secret
DEFAULT_TENANT_ID=
```

## Comandos usados con éxito

```bash
npm run supabase:start
npx supabase db reset
npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio"
npm run dev:web
```

## Próximos pasos recomendados

1. Probar el flujo completo de alta/baja/cambio de rol desde la UI con un segundo usuario.
2. Conectar Chatwoot al webhook.
3. Reemplazar datos demo por datos reales de prueba en `clients`, `products`, `orders`.
4. Si se resetea la DB, volver a correr `npm run bootstrap:owner` y `npm run seed:demo -- --tenant-slug mi-negocio`.
