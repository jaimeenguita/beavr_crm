-- Sales and invoicing: sale date on opportunities and the invoices table.
-- Won = estado in ('won', 'ganada') (the CRM uses 'won'; 'ganada' is the legacy value).

-- 1. Sale date -----------------------------------------------------------------------------------

alter table public.oportunidades
  add column if not exists ganada_en timestamptz;

update public.oportunidades
set ganada_en = creado_en
where estado in ('won', 'ganada')
  and ganada_en is null;

-- 2. Invoices ------------------------------------------------------------------------------------

create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  oportunidad_id uuid not null references public.oportunidades(id) on delete restrict,
  empresa_id uuid references public.empresas(id) on delete set null,
  fecha_emision date not null default current_date,
  fecha_vencimiento date not null default current_date + 30,
  base numeric(12, 2) not null check (base >= 0),
  iva_pct numeric(5, 2) not null default 21,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'pendiente', 'pagada', 'anulada')),
  pagada_en date,
  anulada_en date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facturas_vencimiento_check check (fecha_vencimiento >= fecha_emision)
);

-- One live invoice per sale: cancelling an invoice frees the sale.
create unique index if not exists facturas_oportunidad_live_idx
  on public.facturas (oportunidad_id)
  where estado <> 'anulada';

create index if not exists facturas_estado_idx on public.facturas (estado);
create index if not exists facturas_fecha_emision_idx on public.facturas (fecha_emision);

drop trigger if exists facturas_set_updated_at on public.facturas;
create trigger facturas_set_updated_at
  before update on public.facturas
  for each row
  execute function public.set_updated_at();

alter table public.facturas enable row level security;

drop policy if exists facturas_all on public.facturas;
create policy facturas_all
  on public.facturas
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
      and tablename = 'facturas'
  ) then
    alter publication supabase_realtime add table public.facturas;
  end if;
end $$;

-- 3. Invoice lifecycle and numbering -------------------------------------------------------------
-- borrador -> borrador | pendiente (assigns the number); pendiente -> pagada | anulada (only estado and its
-- date). pagada and anulada are final. New rows are always borrador. The only other change allowed on an
-- issued invoice is empresa_id becoming null (the "on delete set null" FK of empresas).

create or replace function public.facturas_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  frozen public.facturas := new;
  counter int;
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then
      raise exception 'factura_insert_no_borrador: a new invoice must be a draft';
    end if;
    new.numero := null;
    new.pagada_en := null;
    new.anulada_en := null;
    return new;
  end if;

  if old.estado = 'borrador' then
    if new.estado not in ('borrador', 'pendiente') then
      raise exception 'factura_transicion_invalida: a draft can only be issued';
    end if;
    new.pagada_en := null;
    new.anulada_en := null;
    if new.estado = 'borrador' then
      new.numero := null;
      return new;
    end if;
    -- Issue: yearly correlative number, serialized so two users never get the same one.
    perform pg_advisory_xact_lock(hashtext('facturas_numero'));
    select coalesce(max(substring(f.numero from 8)::int), 0) + 1 into counter
    from public.facturas f
    where f.numero like format('F-%s-%%', extract(year from new.fecha_emision)::int);
    new.numero := format(
      'F-%s-%s',
      extract(year from new.fecha_emision)::int,
      lpad(counter::text, greatest(4, length(counter::text)), '0')
    );
    return new;
  end if;

  -- Issued invoice: immutable except the transition below (and empresa_id set to null).
  frozen.updated_at := old.updated_at;
  if new.empresa_id is null then
    frozen.empresa_id := old.empresa_id;
  end if;
  if new.estado = old.estado then
    if frozen is distinct from old then
      raise exception 'factura_inmutable: an issued invoice cannot be modified';
    end if;
    return new;
  end if;

  if old.estado <> 'pendiente' or new.estado not in ('pagada', 'anulada') then
    raise exception 'factura_transicion_invalida: % -> % is not allowed', old.estado, new.estado;
  end if;
  frozen.estado := old.estado;
  frozen.pagada_en := old.pagada_en;
  frozen.anulada_en := old.anulada_en;
  if frozen is distinct from old then
    raise exception 'factura_inmutable: an issued invoice cannot be modified';
  end if;
  new.pagada_en := old.pagada_en;
  new.anulada_en := old.anulada_en;
  if new.estado = 'pagada' then
    new.pagada_en := current_date;
  else
    new.anulada_en := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_before_write on public.facturas;
create trigger facturas_before_write
  before insert or update on public.facturas
  for each row
  execute function public.facturas_before_write();

-- 4. Pipeline integrity --------------------------------------------------------------------------
-- With an issued invoice an opportunity cannot leave Won nor be deleted; drafts are discarded.
-- The invoice rows are locked first so a concurrent issue cannot slip in between check and delete.

create or replace function public.oportunidades_ganada_en()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_won boolean := new.estado in ('won', 'ganada');
  emitida text;
begin
  if tg_op = 'INSERT' then
    if is_won then
      new.ganada_en := coalesce(new.ganada_en, now());
    end if;
    return new;
  end if;

  if is_won and old.estado not in ('won', 'ganada') then
    new.ganada_en := now();
  elsif not is_won and old.estado in ('won', 'ganada') then
    perform 1 from public.facturas where oportunidad_id = old.id for update;
    select numero into emitida
    from public.facturas
    where oportunidad_id = old.id and estado in ('pendiente', 'pagada')
    limit 1;
    if found then
      raise exception 'factura_emitida:%', emitida;
    end if;
    delete from public.facturas where oportunidad_id = old.id and estado = 'borrador';
    new.ganada_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists oportunidades_ganada_en on public.oportunidades;
create trigger oportunidades_ganada_en
  before insert or update of estado on public.oportunidades
  for each row
  execute function public.oportunidades_ganada_en();

create or replace function public.oportunidades_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  emitida text;
begin
  perform 1 from public.facturas where oportunidad_id = old.id for update;
  delete from public.facturas where oportunidad_id = old.id and estado = 'borrador';
  select numero into emitida from public.facturas where oportunidad_id = old.id limit 1;
  if found then
    raise exception 'factura_emitida:%', emitida;
  end if;
  return old;
end;
$$;

drop trigger if exists oportunidades_before_delete on public.oportunidades;
create trigger oportunidades_before_delete
  before delete on public.oportunidades
  for each row
  execute function public.oportunidades_before_delete();
