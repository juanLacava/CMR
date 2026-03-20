create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text,
  phone text not null,
  email text,
  origin_channel text not null default 'whatsapp',
  tags text[] not null default '{}',
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sku text not null,
  description text,
  price numeric(12,2) not null default 0,
  currency text not null default 'ARS',
  stock_on_hand integer not null default 0,
  stock_reserved integer not null default 0,
  stock_minimum integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku),
  check (stock_on_hand >= 0),
  check (stock_reserved >= 0)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source text not null default 'chatwoot',
  source_conversation_id text,
  channel text not null default 'whatsapp',
  status text not null default 'open',
  subject text,
  assigned_to text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('open', 'pending', 'resolved'))
);

create unique index if not exists conversations_source_idx
  on public.conversations (tenant_id, source, source_conversation_id)
  where source_conversation_id is not null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source text not null default 'chatwoot',
  source_message_id text,
  direction text not null,
  content text,
  content_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (direction in ('inbound', 'outbound'))
);

create unique index if not exists messages_source_idx
  on public.messages (tenant_id, source, source_message_id)
  where source_message_id is not null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  conversation_id uuid references public.conversations(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'draft',
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'ARS',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'confirmed', 'paid', 'fulfilled', 'cancelled'))
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  check (quantity > 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create index if not exists clients_tenant_last_interaction_idx
  on public.clients (tenant_id, last_interaction_at desc nulls last);

create index if not exists products_tenant_active_idx
  on public.products (tenant_id, is_active);

create index if not exists conversations_tenant_status_idx
  on public.conversations (tenant_id, status, last_message_at desc nulls last);

create index if not exists messages_conversation_sent_at_idx
  on public.messages (conversation_id, sent_at desc);

create index if not exists orders_tenant_status_idx
  on public.orders (tenant_id, status, created_at desc);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

alter table public.tenants enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select
using (id = public.current_tenant_id());

drop policy if exists clients_tenant_isolation on public.clients;
create policy clients_tenant_isolation on public.clients
for all
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists products_tenant_isolation on public.products;
create policy products_tenant_isolation on public.products
for all
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists conversations_tenant_isolation on public.conversations;
create policy conversations_tenant_isolation on public.conversations
for all
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists messages_tenant_isolation on public.messages;
create policy messages_tenant_isolation on public.messages
for all
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists orders_tenant_isolation on public.orders;
create policy orders_tenant_isolation on public.orders
for all
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists order_items_tenant_isolation on public.order_items;
create policy order_items_tenant_isolation on public.order_items
for all
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.tenant_id = public.current_tenant_id()
  )
)
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.tenant_id = public.current_tenant_id()
  )
);
