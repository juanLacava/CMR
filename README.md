# CMR

> **Empleado IA para pequeños negocios.**  
> CRM omnicanal con atención automatizada vía WhatsApp, Instagram, Telegram y Webchat.

---

## Índice

1. [Visión del producto](#1-visión-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Glosario de términos](#4-glosario-de-términos)
5. [Guía de configuración del entorno](#5-guía-de-configuración-del-entorno)
6. [Convenciones del equipo](#6-convenciones-del-equipo)
7. [ADRs — Decisiones de arquitectura](#7-adrs--decisiones-de-arquitectura)
8. [Contactos y responsables](#8-contactos-y-responsables)

---

## 1. Visión del producto

CMR automatiza la operación diaria de un pequeño negocio. No se vende como CRM — se vende como **un empleado digital que nunca duerme**.

| Capacidad | Descripción |
|---|---|
| Atención al cliente | Responde consultas automáticamente con IA en <200ms |
| Gestión de ventas | Toma pedidos y gestiona stock sin intervención humana |
| Agenda de turnos | Reserva, confirma y recuerda citas de forma automática |
| Marketing proactivo | Campañas segmentadas por comportamiento del cliente |
| Dashboard unificado | Plata de hoy · stock crítico · chats pendientes |

**Canales soportados:** WhatsApp · Instagram DM · Telegram · Webchat

---

## 2. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHANNEL LAYER                            │
│          WhatsApp · Instagram · Telegram · Webchat              │
└────────────────────────────┬────────────────────────────────────┘
                             │ webhooks
┌────────────────────────────▼────────────────────────────────────┐
│                   MESSAGE INGESTION LAYER                       │
│         Webhook Handler → Normalizer → Event Publisher          │
│                                                                 │
│  { tenant_id, channel, client_id, message, timestamp }         │
└────────────────────────────┬────────────────────────────────────┘
                             │ Redis Streams
┌────────────────────────────▼────────────────────────────────────┐
│                         EVENT BUS                               │
│   MESSAGE_RECEIVED · INTENT_CLASSIFIED · ORDER_CREATED · ...    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        AI AGENT                                 │
│              Planner → Reasoner → Memory → Tools                │
└──────┬──────────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │          │
   CRM Tool  Stock Tool  Booking   Payment    Support
                           Tool      Tool      Tool
┌──────▼──────────▼──────────▼──────────▼──────────▼─────────────┐
│                    PERSISTENCE LAYER                            │
│        PostgreSQL (Supabase) + Redis (Upstash) + Storage        │
└─────────────────────────────────────────────────────────────────┘
```

**Principios:**
- Multi-tenant SaaS con Row Level Security
- Event-driven architecture
- Serverless-first (escala a cero, costo $0 en reposo)
- Infraestructura objetivo: < $2 por cliente activo

---

## 3. Estructura del repositorio

```
CMR/
│
├── apps/
│   └── web/                  # Next.js 14 — Dashboard del emprendedor
│
├── packages/
│   ├── supabase/             # Schema SQL, migraciones, Edge Functions
│   │   ├── migrations/       # Archivos .sql versionados
│   │   ├── functions/        # Supabase Edge Functions (webhooks, IA)
│   │   └── seed/             # Datos de prueba para desarrollo local
│   │
│   ├── bots/                 # Conectores de canales
│   │   ├── whatsapp/         # WhatsApp Cloud API webhook handler
│   │   ├── telegram/         # Telegram Bot API handler
│   │   └── instagram/        # Meta Graph API handler
│   │
│   └── ai/                   # Motor de inteligencia artificial
│       ├── agent/            # Planner + Reasoner
│       ├── tools/            # CRM, Stock, Booking, Payment tools
│       └── prompts/          # Prompt templates versionados
│
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   │   ├── ADR-001-multitenant-rls.md
│   │   ├── ADR-002-groq-over-openai-mvp.md
│   │   └── ADR-003-upstash-redis-streams.md
│   └── handoffs/             # Resúmenes de sesión para el equipo
│
├── .env.example              # Variables requeridas (sin valores)
├── .gitignore
└── README.md                 # Este archivo
```

---

## 4. Glosario de términos

Referencia obligatoria para todo el equipo. Usar estos términos de forma consistente en código, commits, PRs y comunicación.

### Entidades del dominio

| Término | Definición técnica |
|---|---|
| **Tenant** | Un emprendimiento cliente de CMR. Unidad de aislamiento en la DB. Cada tenant tiene su propio `tenant_id` UUID. |
| **Client** | El cliente final del emprendimiento (quien escribe por WhatsApp, etc.). No confundir con Tenant. |
| **Conversation** | Hilo de mensajes entre un Client y el sistema, en un canal específico. Tiene estado: `active`, `pending_human`, `closed`. |
| **Message** | Unidad atómica de comunicación dentro de una Conversation. Puede ser entrante (del client) o saliente (del bot o humano). |
| **Intent** | La intención detectada por la IA en un mensaje. Ejemplos: `book_appointment`, `product_query`, `price_question`. |
| **Confidence Score** | Número entre 0 y 1 que indica la certeza del modelo sobre la intención detectada. Si es `< 0.7`, se deriva al humano. |
| **Appointment** | Un turno reservado por un Client para un Service, atendido por un Staff en una fecha/hora específica. |
| **Order** | Pedido de uno o más Products realizado por un Client. Tiene ciclo de vida: `pending` → `confirmed` → `fulfilled` o `cancelled`. |
| **Campaign** | Envío masivo de mensajes a un segmento de Clients. Tiene estado, métricas de apertura y conversión. |
| **Stock Hold** | Reserva temporal de unidades de un Product en Redis (TTL: 10 min). Evita sobreventas durante el flujo del bot. |
| **Identity Resolution** | Proceso de vincular perfiles de un mismo Client en distintos canales (ej: mismo teléfono en WA e Instagram). |

### Arquitectura y sistema

| Término | Definición técnica |
|---|---|
| **Channel Layer** | Capa de entrada. Recibe mensajes raw de WhatsApp, Telegram, Instagram, Webchat. |
| **Ingestion Layer** | Normaliza mensajes de distintos canales al formato de evento estándar de CMR. |
| **Event Bus** | Redis Streams. Canal de comunicación asíncrono entre capas del sistema. |
| **AI Agent** | El motor central. Compuesto por Planner, Reasoner, Memory y Tool Layer. Decide qué acción tomar ante cada mensaje. |
| **Tool** | Función que el AI Agent puede invocar para interactuar con el sistema (leer stock, crear orden, reservar turno, etc.). |
| **Edge Function** | Función serverless desplegada en Supabase, co-ubicada con la DB para mínima latencia. Usada para webhooks y lógica transaccional. |
| **Multi-tenant** | Arquitectura donde múltiples Tenants comparten la misma infraestructura con aislamiento de datos garantizado por RLS. |
| **RLS** | Row Level Security. Política de PostgreSQL que filtra filas automáticamente según el `tenant_id` del usuario autenticado. |
| **ADR** | Architecture Decision Record. Documento que registra una decisión técnica: contexto, decisión tomada, alternativas descartadas y consecuencias. |
| **Migration** | Archivo SQL versionado que modifica el schema de la DB. Nunca se modifica producción sin una migration. |
| **Idempotencia** | Propiedad de una operación que produce el mismo resultado si se ejecuta una o múltiples veces. Crítico en el Event Bus para evitar duplicados. |
| **TTL** | Time To Live. Tiempo de vida de una clave en Redis. Se usa en Stock Hold (600s) y en sesiones de conversación. |

### Eventos del sistema

| Evento | Cuándo se dispara |
|---|---|
| `MESSAGE_RECEIVED` | Llega un mensaje de cualquier canal |
| `INTENT_CLASSIFIED` | La IA determinó la intención del mensaje |
| `CLIENT_CREATED` | Se registra un nuevo Client en el CRM |
| `ORDER_CREATED` | Se confirma un pedido |
| `APPOINTMENT_BOOKED` | Se reserva un turno |
| `STOCK_HOLD_CREATED` | Se inicia una reserva temporal de stock |
| `STOCK_HOLD_EXPIRED` | Expiró un Stock Hold sin confirmar compra |
| `HUMAN_HANDOFF_REQUIRED` | Confidence Score < 0.7, se notifica al dueño |

### Convenciones de naming en código

| Contexto | Convención | Ejemplo |
|---|---|---|
| Variables JS/TS | camelCase | `tenantId`, `clientName` |
| Tablas DB | snake_case | `order_items`, `campaign_logs` |
| Eventos | UPPER_SNAKE_CASE | `ORDER_CREATED` |
| Branches Git | kebab-case | `feat/booking-engine` |
| Archivos | kebab-case | `message-normalizer.ts` |
| Commits | Conventional Commits | `feat: add booking engine` |

---

## 5. Guía de configuración del entorno

### 5.1 Prerequisitos

Asegurarse de tener instalado:

```bash
node --version    # >= 20.x
npm --version     # >= 10.x
git --version     # >= 2.x
docker --version  # >= 24.x (para Supabase local)
```

Instalar Supabase CLI:

```bash
npm install -g supabase
supabase --version  # debe mostrar >= 1.x
```

Instalar ngrok para recibir webhooks localmente:

```bash
# Mac
brew install ngrok

# Linux / Windows
# Descargar desde https://ngrok.com/download
ngrok --version
```

### 5.2 Clonar el repositorio

```bash
git clone https://github.com/tu-org/CMR.git
cd CMR
npm install
```

### 5.3 Variables de entorno

Copiar el archivo de ejemplo y completar los valores:

```bash
cp .env.example .env.local
```

**Variables requeridas** (ver `.env.example` para descripción completa):

```bash
# ─── SUPABASE ────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Login + queries del dashboard via RLS
SUPABASE_SERVICE_ROLE_KEY=        # Solo backend, webhooks y automatizaciones

# ─── WHATSAPP CLOUD API ──────────────────────────────────────────
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=    # String aleatorio que vos elegís

# ─── TELEGRAM ────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ─── INSTAGRAM / META ────────────────────────────────────────────
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=

# ─── IA ──────────────────────────────────────────────────────────
GROQ_API_KEY=                     # https://console.groq.com (gratis)
OPENAI_API_KEY=                   # Solo para Fase 2

# ─── REDIS (UPSTASH) ─────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ─── EMAIL ───────────────────────────────────────────────────────
RESEND_API_KEY=                   # https://resend.com (gratis)

# ─── PAGOS ───────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ─── CMR MULTIUSUARIO ────────────────────────────────────────────
DEFAULT_TENANT_ID=                # Fallback backend para webhook/automatizaciones
CHATWOOT_APP_URL=http://localhost:3000
CHATWOOT_WEBHOOK_SECRET=
```

> ⚠️ **Regla de oro:** Nunca commitear `.env.local`. Está en `.gitignore`.  
> Las keys de producción viven únicamente como env vars en Vercel / Railway.

### 5.4 Inicializar Supabase local

```bash
# Levantar instancia local de Supabase (requiere Docker corriendo)
supabase start

# La CLI va a mostrar las URLs locales:
# API URL:     http://localhost:54321
# Studio URL:  http://localhost:54323  (dashboard visual)
# DB URL:      postgresql://postgres:postgres@localhost:54322/postgres
```

Aplicar el schema inicial:

```bash
supabase db reset
# Esto ejecuta todas las migrations en /supabase/migrations/
# y corre el seed si existe en /supabase/seed.sql
```

### 5.5 Multiusuario real

La web ahora autentica con Supabase Auth y aplica permisos por `tenant_memberships`.

- `apps/web` usa `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` queda reservado para backend confiable, por ejemplo `chatwoot-webhook`
- Cada usuario entra con email/password
- El acceso real a datos se define por membership y rol: `owner`, `admin`, `agent`, `viewer`

Migraciones involucradas:

- `20260320000001_init_mvp.sql`
- `20260320000002_multiuser_auth.sql`

Bootstrap minimo despues de `supabase db reset`:

1. Crear un usuario desde la app o Supabase Studio.
2. Ejecutar el bootstrap desde la raiz del repo:

```bash
npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio"
```

Opcionalmente se puede fijar slug y nombre completo:

```bash
npm run bootstrap:owner -- --email usuario@ejemplo.com --tenant-name "Mi negocio" --tenant-slug mi-negocio --full-name "Juan"
```

El script usa `SUPABASE_SERVICE_ROLE_KEY`, busca el usuario existente en Supabase Auth, crea el tenant si falta y garantiza la membership inicial con rol `owner`.

### 5.5 Configurar túnel para webhooks locales

WhatsApp, Instagram y Telegram necesitan una URL pública para enviar webhooks. En desarrollo local usamos ngrok:

```bash
# Terminal 1 — levantar el servidor de desarrollo
npm run dev
# corre en http://localhost:3000

# Terminal 2 — exponer al exterior
ngrok http 3000

# ngrok va a mostrar algo como:
# Forwarding  https://abc123.ngrok-free.app → localhost:3000
```

Usar la URL de ngrok para configurar los webhooks:

| Servicio | URL del webhook |
|---|---|
| WhatsApp Cloud API | `https://abc123.ngrok-free.app/api/webhooks/whatsapp` |
| Telegram | `https://abc123.ngrok-free.app/api/webhooks/telegram` |
| Instagram / Meta | `https://abc123.ngrok-free.app/api/webhooks/instagram` |

> 📌 La URL de ngrok cambia cada vez que se reinicia en el plan gratuito.  
> Para un entorno de desarrollo estable considerar Cloudflare Tunnel (gratis y URL fija).

### 5.6 Verificar que todo funciona

```bash
# Correr tests
npm run test

# Verificar conexión a Supabase local
npm run db:check

# Ver logs de Edge Functions en tiempo real
supabase functions serve --debug
```

Si todo está OK deberías ver el dashboard en `http://localhost:3000` y el Supabase Studio en `http://localhost:54323`.

### 5.7 Obtener las API keys necesarias

| Servicio | Dónde obtenerla | Costo |
|---|---|---|
| Supabase | https://supabase.com → New Project | Gratis |
| WhatsApp Cloud API | https://developers.facebook.com → My Apps | Gratis (1.000 conv/mes) |
| Telegram Bot | Hablar con @BotFather en Telegram | Gratis |
| Instagram Graph API | https://developers.facebook.com → mismo app que WA | Gratis |
| Groq API | https://console.groq.com | Gratis (14.400 req/día) |
| Upstash Redis | https://upstash.com | Gratis (10.000 cmd/día) |
| Resend | https://resend.com | Gratis (3.000 emails/mes) |

---

## 6. Convenciones del equipo

### Commits (Conventional Commits)

```bash
feat: descripción     # nueva funcionalidad
fix: descripción      # corrección de bug
docs: descripción     # solo documentación
refactor: descripción # refactor sin cambio de comportamiento
test: descripción     # agregar o modificar tests
chore: descripción    # tareas de mantenimiento
```

### Branches

```
main          → producción, protegida, solo merge via PR
staging       → pre-producción, pruebas integradas
feat/nombre   → nueva funcionalidad
fix/nombre    → corrección de bug
```

### Migraciones de DB

```bash
# Crear una migración nueva
supabase db diff -f nombre_descriptivo

# Aplicar migraciones localmente
supabase db reset

# NUNCA modificar la DB de producción manualmente
```

### Pull Requests

Todo PR debe incluir:
- Descripción del cambio
- Referencia al ticket o sesión de trabajo
- Tests que cubren el cambio
- Sección del handbook que aplica

---

## 7. ADRs — Decisiones de arquitectura

Los ADRs documentan el **por qué** de cada decisión técnica importante.  
Ubicación: `/docs/adr/`

### MVP recomendado

- [MVP WhatsApp-first](./docs/mvp-whatsapp-first.md)
- [ADR-004](./docs/adr/ADR-004-mvp-whatsapp-first-stack.md) | Chatwoot + Supabase + WhatsApp Cloud API

| ID | Título | Estado |
|---|---|---|
| [ADR-001](./docs/adr/ADR-001-multitenant-rls.md) | Multi-tenancy con RLS sobre schema-per-tenant | ✅ Aceptado |
| [ADR-002](./docs/adr/ADR-002-groq-over-openai-mvp.md) | Groq/LLaMA para MVP en lugar de OpenAI | ✅ Aceptado |
| [ADR-003](./docs/adr/ADR-003-upstash-redis-streams.md) | Upstash Redis Streams como Event Bus | ✅ Aceptado |
| [ADR-004](./docs/adr/ADR-004-mvp-whatsapp-first-stack.md) | MVP WhatsApp-first con Chatwoot + Supabase | ✅ Aceptado |

---

## 8. Contactos y responsables

| Rol | Responsabilidad |
|---|---|
| **Arquitectura** | Decisiones técnicas, revisión de ADRs, merge a `main` |
| **Backend** | Edge Functions, Event Bus, AI Agent, Tools |
| **Frontend** | Dashboard Next.js, componentes, UX |
| **Infraestructura** | Supabase, Vercel, Railway, variables de entorno |

---

*CMR — Engineering Handbook v1.0 · Referencia: `/handbook.odt`*
