-- Storage bucket for photo invoices (same shape as rrhh-archivos).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas-fotos',
  'facturas-fotos',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "facturas_fotos_select" on storage.objects;
create policy "facturas_fotos_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'facturas-fotos');

drop policy if exists "facturas_fotos_insert" on storage.objects;
create policy "facturas_fotos_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'facturas-fotos');

drop policy if exists "facturas_fotos_update" on storage.objects;
create policy "facturas_fotos_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'facturas-fotos')
  with check (bucket_id = 'facturas-fotos');

drop policy if exists "facturas_fotos_delete" on storage.objects;
create policy "facturas_fotos_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'facturas-fotos');
