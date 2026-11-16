-- Company websites module: one site per empresa, fixed templates and palettes, editable content only.

create table if not exists public.sitios_web (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  slug text not null unique,
  plantilla text not null check (plantilla in ('estudio', 'moderna')),
  paleta text not null check (paleta in ('clara', 'oscura', 'sol', 'rio')),
  contenido jsonb not null,
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sitios_web_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists sitios_web_slug_idx on public.sitios_web (slug);
create index if not exists sitios_web_empresa_id_idx on public.sitios_web (empresa_id);

drop trigger if exists sitios_web_set_updated_at on public.sitios_web;
create trigger sitios_web_set_updated_at
  before update on public.sitios_web
  for each row
  execute function public.set_updated_at();

alter table public.sitios_web enable row level security;

drop policy if exists sitios_web_all on public.sitios_web;
create policy sitios_web_all
  on public.sitios_web
  for all
  to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sitios_web'
  ) then
    alter publication supabase_realtime add table public.sitios_web;
  end if;
end $$;
