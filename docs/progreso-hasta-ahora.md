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

## Retomada actual

En esta etapa se dejó una base operativa bastante más cercana a un inbox comercial usable, con flujo local reproducible desde Chatwoot hacia Supabase y una UI mucho más enfocada en atención por WhatsApp.

### 1. Fix de build de Next.js en monorepo

Se corrigió:

- `apps/web/next.config.ts`

Ahora Next resuelve `outputFileTracingRoot` contra la raíz real del repo y deja de tomar `/home/juan` como workspace por el lockfile externo.

También se ajustó el proyecto para que la app web pueda seguir funcionando en desarrollo aunque el puerto `3000` esté ocupado por otro proceso, quedando disponible automáticamente en `3001`.

### 2. Operación real desde el dashboard

Se agregó una cuarta migración:

- `supabase/migrations/20260321000004_operational_workflows.sql`

Esa migración incorpora:

- helper para recalcular `stock_reserved` desde `order_items`
- RPC `upsert_product`
- RPC `create_manual_order`
- RPC `set_order_status`

Objetivo:

- permitir escritura desde la UI sin mover lógica sensible al cliente
- mantener permisos por rol usando funciones SQL con validaciones explícitas
- recalcular reserva de stock cuando cambian pedidos o estados

### 3. Fix de persistencia del webhook con índices parciales

Se agregó una quinta migración:

- `supabase/migrations/20260322000005_webhook_upsert_constraints.sql`

Problema resuelto:

- el webhook usaba `upsert` contra índices únicos parciales
- PostgREST no aceptaba esos índices para `ON CONFLICT`
- eso rompía la persistencia reproducible del flujo Chatwoot

Resultado:

- cliente, conversación, mensaje y borrador de pedido vuelven a persistirse de forma confiable

### 4. Script de validación del flujo Chatwoot -> Supabase

Se agregó:

- `scripts/test-chatwoot-flow.mjs`

Disponible desde:

```bash
npm run test:chatwoot-flow -- --tenant-slug mi-negocio
```

El script:

- construye un payload de Chatwoot de prueba
- hace POST al webhook `chatwoot-webhook`
- valida en Supabase que existan cliente, conversación y mensaje
- verifica si se creó el `draft order` esperado cuando el texto es comercial

También admite:

```bash
npm run test:chatwoot-flow -- --tenant-slug mi-negocio --content "Quiero comprar 2 boxes premium hoy"
```

### 5. Dashboard convertido en centro de atención operativo

Se extendió principalmente:

- `apps/web/app/dashboard-client.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/lib/types.ts`
- `apps/web/lib/supabase.ts`

Capacidades nuevas:

- alta y edición rápida de productos para `titular` y `administrador`
- creación de pedidos manuales para `titular`, `administrador` y `agente`
- actualización de estado de pedidos desde la tabla
- vista de conversaciones recientes con foco de bandeja
- filtros de bandeja: abiertas, con pedido, sin pedido, inbound sin responder
- ordenamiento automático por prioridad operativa
- encabezados visuales: `Urgente`, `Comercial`, `Seguimiento`, `Resuelto`
- badges operativos: `Cliente nuevo`, `Sin pedido`, `Pedido borrador`, `Respondida por equipo`, `Esperando respuesta del cliente`, `Sin responder`, `Sin leer`
- señal de SLA por conversación
- búsqueda en bandeja
- atajos de teclado para navegación y respuesta
- detalle interno de conversación con mensajes sincronizados
- guardado de respuesta manual como mensaje saliente
- precarga de pedido desde una conversación
- asignación simple de responsables visibles del negocio
- plantillas rápidas de respuesta
- terminología visible unificada al español

### 6. Simulación de WhatsApp desde la UI

Se agregaron rutas backend:

- `apps/web/app/api/simulate-whatsapp/route.ts`
- `apps/web/app/api/send-conversation-reply/route.ts`

Y se ajustó:

- `supabase/functions/chatwoot-webhook/index.ts`

Resultado:

- desde el dashboard se puede simular un mensaje entrante de WhatsApp
- la simulación dispara el webhook local y refresca la conversación
- las respuestas manuales se persisten desde una ruta server-side
- si se completa la configuración de Chatwoot, la misma ruta queda lista para intentar enviar mensajes salientes reales

Variables relevantes para salida real a Chatwoot:

- `CHATWOOT_APP_URL`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_API_ACCESS_TOKEN`

### 7. Autenticación web más robusta

Se ajustó:

- `apps/web/lib/supabase.ts`

Resultado:

- el cliente usa un `storageKey` propio para evitar reciclar tokens viejos del navegador
- si Supabase responde `Invalid Refresh Token` o `Refresh Token Not Found`, la app limpia sesión local y vuelve al login

### 8. Limpieza del repo

Se ajustó:

- `.gitignore`

para ignorar `*.tsbuildinfo`, ya que es un artefacto generado y no debe formar parte del control de versiones como archivo operativo.

## Validación de esta sesión

### Verificado

- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run test:chatwoot-flow -- --tenant-slug mi-negocio`

Resultado observado en local:

- `webhook.ok: true`
- cliente persistido
- conversación persistida
- mensaje persistido
- `draftOrder` creado para mensajes comerciales
- `draftOrder: null` para mensajes no comerciales

## Estado actual para uso local

### Acceso

- usuario: `eduardolacava@yahoo.com.ar`
- clave temporal: `CMR-local-1234`
- negocio de prueba: `mi-negocio`

### Comandos de arranque

Web:

```bash
cd /home/juan/CMR/CMR
npm run dev:web
```

Nota:

- si `3000` está ocupado, Next levanta en `3001`

Webhook local:

```bash
cd /home/juan/CMR/CMR
npx supabase functions serve chatwoot-webhook --no-verify-jwt --env-file supabase/functions/.env.local
```

### Flujo de prueba recomendado

1. Entrar a la web
2. Simular un mensaje de WhatsApp desde la UI
3. Ver la conversación en la bandeja
4. Abrir el detalle
5. Responder manualmente
6. Usar la conversación para precargar un pedido

## Pendientes abiertos

- `next build` quedó con una falla opaca de webpack que no está aislada todavía
- la respuesta saliente queda preparada para Chatwoot, pero requiere credenciales reales para enviar al canal
- las plantillas rápidas y la asignación todavía no están persistidas como entidades formales por negocio

## Punto de reanudación recomendado

El siguiente bloque de trabajo más correcto es:

1. resolver el build roto de producción
2. persistir plantillas rápidas por negocio
3. persistir asignación usando usuarios reales y estados de lectura consistentes
4. conectar de punta a punta la respuesta saliente con Chatwoot o WhatsApp real

4. correr la prueba del flujo:

```bash
npm run test:chatwoot-flow -- --tenant-slug mi-negocio
```

Objetivo inmediato de la próxima sesión:

- validar end to end `Chatwoot -> webhook -> Supabase -> draft order`
- comprobar en la UI la creación/edición de productos y pedidos con roles reales

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
