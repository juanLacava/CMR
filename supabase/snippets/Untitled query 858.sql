insert into public.tenants (name, slug)
  values ('Mi negocio', 'mi-negocio')
  returning id;
