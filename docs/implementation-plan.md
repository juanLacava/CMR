# Implementacion Base

## Componentes creados

- `apps/web`: dashboard multiusuario en Next.js con login via Supabase Auth
- `supabase/functions/chatwoot-webhook`: webhook para persistir clientes, conversaciones, mensajes y borradores de pedido
- `supabase/migrations/20260320000001_init_mvp.sql`: esquema inicial del CRM
- `supabase/migrations/20260320000002_multiuser_auth.sql`: perfiles, memberships y RLS por rol

## Variables nuevas

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DEFAULT_TENANT_ID`
- `CHATWOOT_APP_URL`
- `CHATWOOT_WEBHOOK_SECRET`

## Flujo implementado

1. Chatwoot envia evento al webhook.
2. El webhook valida token opcional.
3. Se resuelve el cliente por `tenant_id + phone`.
4. Se hace upsert de la conversacion por `tenant_id + source + source_conversation_id`.
5. Se hace upsert del mensaje por `tenant_id + source + source_message_id`.
6. Si el texto parece comercial, se crea un pedido en estado `draft`.
7. La web expone login/signup con email y solo muestra tenants donde el usuario tenga membership.

## Siguiente paso

1. correr `supabase db reset` para aplicar tambien la migracion multiusuario
2. crear un usuario en Supabase Auth
3. ejecutar `npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio"`
4. desplegar la Edge Function
5. conectar Chatwoot con `x-chatwoot-token`
6. levantar `apps/web`
