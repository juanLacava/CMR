create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'agent', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_memberships_user_idx
  on public.tenant_memberships (user_id, tenant_id);

insert into public.profiles (id, email, full_name)
select
  au.id,
  coalesce(au.email, ''),
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(coalesce(au.email, ''), '@', 1))
from auth.users au
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = now();

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_auth_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_tenant_memberships_updated_at on public.tenant_memberships;
create trigger set_tenant_memberships_updated_at
before update on public.tenant_memberships
for each row execute function public.set_updated_at();

create or replace function public.is_member_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
  )
$$;

create or replace function public.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
      and tm.role = any(allowed_roles)
  )
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists tenant_memberships_select on public.tenant_memberships;
create policy tenant_memberships_select on public.tenant_memberships
for select
using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_id, array['owner', 'admin'])
);

drop policy if exists tenant_memberships_insert on public.tenant_memberships;
create policy tenant_memberships_insert on public.tenant_memberships
for insert
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists tenant_memberships_update on public.tenant_memberships;
create policy tenant_memberships_update on public.tenant_memberships
for update
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists tenant_memberships_delete on public.tenant_memberships;
create policy tenant_memberships_delete on public.tenant_memberships
for delete
using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select
using (public.is_member_of_tenant(id));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
for update
using (public.has_tenant_role(id, array['owner', 'admin']))
with check (public.has_tenant_role(id, array['owner', 'admin']));

drop policy if exists clients_tenant_isolation on public.clients;
drop policy if exists clients_select on public.clients;
drop policy if exists clients_write on public.clients;
create policy clients_select on public.clients
for select
using (public.is_member_of_tenant(tenant_id));

create policy clients_write on public.clients
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']));

drop policy if exists products_tenant_isolation on public.products;
drop policy if exists products_select on public.products;
drop policy if exists products_write on public.products;
create policy products_select on public.products
for select
using (public.is_member_of_tenant(tenant_id));

create policy products_write on public.products
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists conversations_tenant_isolation on public.conversations;
drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_write on public.conversations;
create policy conversations_select on public.conversations
for select
using (public.is_member_of_tenant(tenant_id));

create policy conversations_write on public.conversations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']));

drop policy if exists messages_tenant_isolation on public.messages;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_write on public.messages;
create policy messages_select on public.messages
for select
using (public.is_member_of_tenant(tenant_id));

create policy messages_write on public.messages
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']));

drop policy if exists orders_tenant_isolation on public.orders;
drop policy if exists orders_select on public.orders;
drop policy if exists orders_write on public.orders;
create policy orders_select on public.orders
for select
using (public.is_member_of_tenant(tenant_id));

create policy orders_write on public.orders
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'agent']));

drop policy if exists order_items_tenant_isolation on public.order_items;
drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_write on public.order_items;
create policy order_items_select on public.order_items
for select
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.is_member_of_tenant(o.tenant_id)
  )
);

create policy order_items_write on public.order_items
for all
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.has_tenant_role(o.tenant_id, array['owner', 'admin', 'agent'])
  )
)
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.has_tenant_role(o.tenant_id, array['owner', 'admin', 'agent'])
  )
);
