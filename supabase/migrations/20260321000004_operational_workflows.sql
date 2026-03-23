create or replace function public.is_inventory_reserved_order_status(target_status text)
returns boolean
language sql
immutable
as $$
  select target_status in ('draft', 'confirmed', 'paid')
$$;

create or replace function public.recalculate_product_reserved_stock(
  target_tenant_id uuid,
  target_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_reserved integer;
begin
  select coalesce(sum(oi.quantity), 0)::integer
  into next_reserved
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = target_product_id
    and o.tenant_id = target_tenant_id
    and public.is_inventory_reserved_order_status(o.status);

  update public.products
  set stock_reserved = next_reserved,
      updated_at = now()
  where id = target_product_id
    and tenant_id = target_tenant_id;
end;
$$;

create or replace function public.recalculate_reserved_stock_for_order(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant_id uuid;
  target_product_id uuid;
begin
  select o.tenant_id
  into target_tenant_id
  from public.orders o
  where o.id = target_order_id;

  if target_tenant_id is null then
    raise exception 'Pedido no encontrado';
  end if;

  for target_product_id in
    select distinct oi.product_id
    from public.order_items oi
    where oi.order_id = target_order_id
  loop
    perform public.recalculate_product_reserved_stock(target_tenant_id, target_product_id);
  end loop;
end;
$$;

create or replace function public.upsert_product(
  target_tenant_id uuid,
  target_name text,
  target_sku text,
  target_description text default null,
  target_price numeric default 0,
  target_currency text default 'ARS',
  target_stock_on_hand integer default 0,
  target_stock_minimum integer default 0,
  target_is_active boolean default true,
  target_product_id uuid default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(coalesce(target_name, ''));
  normalized_sku text := trim(coalesce(target_sku, ''));
  saved_product public.products%rowtype;
begin
  if not public.has_tenant_role(target_tenant_id, array['owner', 'admin']) then
    raise exception 'No tenes permisos para editar productos en este tenant';
  end if;

  if normalized_name = '' then
    raise exception 'Nombre requerido';
  end if;

  if normalized_sku = '' then
    raise exception 'SKU requerido';
  end if;

  if target_price < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  if target_stock_on_hand < 0 then
    raise exception 'El stock disponible no puede ser negativo';
  end if;

  if target_stock_minimum < 0 then
    raise exception 'El stock minimo no puede ser negativo';
  end if;

  if target_product_id is null then
    insert into public.products (
      tenant_id,
      name,
      sku,
      description,
      price,
      currency,
      stock_on_hand,
      stock_minimum,
      is_active
    )
    values (
      target_tenant_id,
      normalized_name,
      normalized_sku,
      nullif(trim(coalesce(target_description, '')), ''),
      target_price,
      coalesce(nullif(trim(coalesce(target_currency, '')), ''), 'ARS'),
      target_stock_on_hand,
      target_stock_minimum,
      coalesce(target_is_active, true)
    )
    returning *
    into saved_product;
  else
    update public.products
    set name = normalized_name,
        sku = normalized_sku,
        description = nullif(trim(coalesce(target_description, '')), ''),
        price = target_price,
        currency = coalesce(nullif(trim(coalesce(target_currency, '')), ''), 'ARS'),
        stock_on_hand = target_stock_on_hand,
        stock_minimum = target_stock_minimum,
        is_active = coalesce(target_is_active, true),
        updated_at = now()
    where id = target_product_id
      and tenant_id = target_tenant_id
    returning *
    into saved_product;

    if saved_product.id is null then
      raise exception 'Producto no encontrado para este tenant';
    end if;
  end if;

  return saved_product;
end;
$$;

create or replace function public.create_manual_order(
  target_tenant_id uuid,
  target_client_id uuid,
  target_items jsonb,
  target_status text default 'draft',
  target_notes text default null,
  target_channel text default 'manual',
  target_conversation_id uuid default null
)
returns table (
  order_id uuid,
  total_amount numeric,
  item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.orders%rowtype;
  item_payload jsonb;
  item_product_id uuid;
  item_quantity integer;
  product_row public.products%rowtype;
  next_total numeric(12,2) := 0;
  next_count integer := 0;
begin
  if not public.has_tenant_role(target_tenant_id, array['owner', 'admin', 'agent']) then
    raise exception 'No tenes permisos para crear pedidos en este tenant';
  end if;

  if target_status not in ('draft', 'confirmed', 'paid', 'fulfilled', 'cancelled') then
    raise exception 'Estado de pedido invalido: %', target_status;
  end if;

  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'El pedido requiere al menos un item';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = target_client_id
      and c.tenant_id = target_tenant_id
  ) then
    raise exception 'Cliente no encontrado para este tenant';
  end if;

  if target_conversation_id is not null and not exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and c.tenant_id = target_tenant_id
  ) then
    raise exception 'Conversacion invalida para este tenant';
  end if;

  insert into public.orders (
    tenant_id,
    client_id,
    conversation_id,
    channel,
    status,
    total_amount,
    currency,
    notes
  )
  values (
    target_tenant_id,
    target_client_id,
    target_conversation_id,
    coalesce(nullif(trim(coalesce(target_channel, '')), ''), 'manual'),
    target_status,
    0,
    'ARS',
    nullif(trim(coalesce(target_notes, '')), '')
  )
  returning *
  into created_order;

  for item_payload in
    select value
    from jsonb_array_elements(target_items)
  loop
    item_product_id := nullif(item_payload ->> 'product_id', '')::uuid;
    item_quantity := coalesce((item_payload ->> 'quantity')::integer, 0);

    if item_product_id is null then
      raise exception 'Cada item requiere product_id';
    end if;

    if item_quantity <= 0 then
      raise exception 'Cada item requiere cantidad mayor a cero';
    end if;

    select *
    into product_row
    from public.products p
    where p.id = item_product_id
      and p.tenant_id = target_tenant_id;

    if product_row.id is null then
      raise exception 'Producto no encontrado para este tenant';
    end if;

    if product_row.stock_on_hand < item_quantity then
      raise exception 'Stock insuficiente para %', product_row.name;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price
    )
    values (
      created_order.id,
      product_row.id,
      item_quantity,
      product_row.price
    );

    next_total := next_total + (product_row.price * item_quantity);
    next_count := next_count + 1;
  end loop;

  update public.orders
  set total_amount = next_total,
      updated_at = now()
  where id = created_order.id;

  perform public.recalculate_reserved_stock_for_order(created_order.id);

  return query
  select created_order.id, next_total, next_count;
exception
  when others then
    if created_order.id is not null then
      delete from public.orders where id = created_order.id;
    end if;
    raise;
end;
$$;

create or replace function public.set_order_status(
  target_order_id uuid,
  target_status text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
begin
  if target_status not in ('draft', 'confirmed', 'paid', 'fulfilled', 'cancelled') then
    raise exception 'Estado de pedido invalido: %', target_status;
  end if;

  select *
  into target_order
  from public.orders o
  where o.id = target_order_id;

  if target_order.id is null then
    raise exception 'Pedido no encontrado';
  end if;

  if not public.has_tenant_role(target_order.tenant_id, array['owner', 'admin', 'agent']) then
    raise exception 'No tenes permisos para editar pedidos en este tenant';
  end if;

  update public.orders
  set status = target_status,
      updated_at = now()
  where id = target_order_id
  returning *
  into target_order;

  perform public.recalculate_reserved_stock_for_order(target_order_id);

  return target_order;
end;
$$;

grant execute on function public.upsert_product(uuid, text, text, text, numeric, text, integer, integer, boolean, uuid) to authenticated;
grant execute on function public.create_manual_order(uuid, uuid, jsonb, text, text, text, uuid) to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
