create or replace function public.can_manage_memberships(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_tenant_role(target_tenant_id, array['owner', 'admin'])
$$;

create or replace function public.list_tenant_memberships(target_tenant_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  full_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tm.id as membership_id,
    tm.user_id,
    tm.role,
    tm.created_at,
    p.full_name,
    p.email
  from public.tenant_memberships tm
  join public.profiles p on p.id = tm.user_id
  where tm.tenant_id = target_tenant_id
    and public.can_manage_memberships(target_tenant_id)
  order by
    case tm.role
      when 'owner' then 0
      when 'admin' then 1
      when 'agent' then 2
      else 3
    end,
    lower(coalesce(p.full_name, p.email)),
    tm.created_at;
$$;

create or replace function public.upsert_tenant_membership_by_email(
  target_tenant_id uuid,
  target_email text,
  target_role text
)
returns public.tenant_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(target_email));
  actor_role text;
  owner_count integer;
  target_profile public.profiles%rowtype;
  existing_membership public.tenant_memberships%rowtype;
  upserted_membership public.tenant_memberships%rowtype;
begin
  if not public.can_manage_memberships(target_tenant_id) then
    raise exception 'No tenes permisos para administrar miembros de este tenant';
  end if;

  if target_role not in ('owner', 'admin', 'agent', 'viewer') then
    raise exception 'Rol invalido: %', target_role;
  end if;

  if normalized_email = '' then
    raise exception 'Email requerido';
  end if;

  select tm.role
  into actor_role
  from public.tenant_memberships tm
  where tm.tenant_id = target_tenant_id
    and tm.user_id = auth.uid();

  if actor_role is null then
    raise exception 'No tenes membership en este tenant';
  end if;

  if actor_role <> 'owner' and target_role = 'owner' then
    raise exception 'Solo un owner puede asignar el rol owner';
  end if;

  select *
  into target_profile
  from public.profiles p
  where lower(p.email) = normalized_email
  limit 1;

  if target_profile.id is null then
    raise exception 'No existe un usuario registrado con ese email';
  end if;

  select *
  into existing_membership
  from public.tenant_memberships tm
  where tm.tenant_id = target_tenant_id
    and tm.user_id = target_profile.id;

  if existing_membership.id is not null and existing_membership.role = 'owner' and actor_role <> 'owner' then
    raise exception 'Solo un owner puede cambiar el rol de otro owner';
  end if;

  if existing_membership.id is not null and existing_membership.role = 'owner' and target_role <> 'owner' then
    select count(*)
    into owner_count
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant_id
      and tm.role = 'owner';

    if owner_count <= 1 then
      raise exception 'El tenant debe conservar al menos un owner';
    end if;
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (target_tenant_id, target_profile.id, target_role)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        updated_at = now()
  returning *
  into upserted_membership;

  return upserted_membership;
end;
$$;

create or replace function public.remove_tenant_membership(target_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.tenant_memberships%rowtype;
  actor_role text;
  owner_count integer;
begin
  select *
  into target_membership
  from public.tenant_memberships tm
  where tm.id = target_membership_id;

  if target_membership.id is null then
    raise exception 'Membership no encontrada';
  end if;

  if not public.can_manage_memberships(target_membership.tenant_id) then
    raise exception 'No tenes permisos para administrar miembros de este tenant';
  end if;

  select tm.role
  into actor_role
  from public.tenant_memberships tm
  where tm.tenant_id = target_membership.tenant_id
    and tm.user_id = auth.uid();

  if actor_role is null then
    raise exception 'No tenes membership en este tenant';
  end if;

  if target_membership.role = 'owner' and actor_role <> 'owner' then
    raise exception 'Solo un owner puede eliminar a otro owner';
  end if;

  if target_membership.role = 'owner' then
    select count(*)
    into owner_count
    from public.tenant_memberships tm
    where tm.tenant_id = target_membership.tenant_id
      and tm.role = 'owner';

    if owner_count <= 1 then
      raise exception 'El tenant debe conservar al menos un owner';
    end if;
  end if;

  delete from public.tenant_memberships tm
  where tm.id = target_membership_id;
end;
$$;

grant execute on function public.list_tenant_memberships(uuid) to authenticated;
grant execute on function public.upsert_tenant_membership_by_email(uuid, text, text) to authenticated;
grant execute on function public.remove_tenant_membership(uuid) to authenticated;
