-- Photo invoices: this company's own customer invoices, digitised from a photo. They keep the number printed
-- on the document, have no sale (oportunidad_id null) and need a client company. Sale invoices ('venta') keep
-- every rule of 20261028120000_ventas_facturas.sql. The oportunidades triggers look invoices up by
-- oportunidad_id, so photo invoices (null) never block a sale.

alter table public.facturas alter column oportunidad_id drop not null;

alter table public.facturas add column if not exists origen text not null default 'venta';
alter table public.facturas add column if not exists foto_path text;

alter table public.facturas drop constraint if exists facturas_origen_values_check;
alter table public.facturas
  add constraint facturas_origen_values_check check (origen in ('venta', 'foto'));

alter table public.facturas drop constraint if exists facturas_origen_check;
alter table public.facturas drop constraint if exists facturas_venta_o_cliente_check;
alter table public.facturas
  add constraint facturas_venta_o_cliente_check check (oportunidad_id is not null or empresa_id is not null);

alter table public.facturas drop constraint if exists facturas_iva_pct_check;
alter table public.facturas
  add constraint facturas_iva_pct_check check (iva_pct in (21, 10, 4, 0));

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
    if new.origen = 'foto' then
      new.numero := btrim(coalesce(new.numero, ''));
      if new.numero = '' or new.empresa_id is null then
        raise exception 'factura_foto_incompleta: a photo invoice needs a number and a client';
      end if;
      if new.oportunidad_id is not null then
        raise exception 'factura_foto_incompleta: a photo invoice cannot be linked to a sale';
      end if;
      if new.estado not in ('pendiente', 'pagada') then
        raise exception 'factura_insert_estado_invalido: a photo invoice must be pending or paid';
      end if;
      perform pg_advisory_xact_lock(hashtext('facturas_numero'));
      if exists (select 1 from public.facturas f where f.numero = new.numero) then
        raise exception 'factura_numero_duplicado:%', new.numero;
      end if;
      new.pagada_en := case when new.estado = 'pagada' then current_date end;
      new.anulada_en := null;
      return new;
    end if;
    if new.estado <> 'borrador' then
      raise exception 'factura_insert_no_borrador: a new invoice must be a draft';
    end if;
    if new.oportunidad_id is null then
      raise exception 'factura_insert_no_borrador: a sale invoice needs a sale';
    end if;
    new.numero := null;
    new.pagada_en := null;
    new.anulada_en := null;
    return new;
  end if;

  if old.estado = 'borrador' then
    if new.origen is distinct from old.origen or new.oportunidad_id is distinct from old.oportunidad_id then
      raise exception 'factura_inmutable: origen and oportunidad_id cannot change on a draft';
    end if;
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
    -- Only well-formed F-YYYY-N numbers count (N up to 9 digits, so it fits an int); photo invoices keep
    -- whatever number is printed on the document.
    perform pg_advisory_xact_lock(hashtext('facturas_numero'));
    select coalesce(max(substring(f.numero from 8)::int), 0) + 1 into counter
    from public.facturas f
    where f.numero ~ '^F-\d{4}-\d{1,9}$'
      and f.numero like format('F-%s-%%', extract(year from new.fecha_emision)::int);
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

-- Photo invoices have no sale to anchor them: deleting their client would orphan them. Sale invoices keep
-- the "on delete set null" behaviour of the empresa_id foreign key.
create or replace function public.empresas_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.facturas f where f.empresa_id = old.id and f.origen = 'foto') then
    raise exception 'empresa_con_facturas:%', old.nombre;
  end if;
  return old;
end;
$$;

drop trigger if exists empresas_before_delete on public.empresas;
create trigger empresas_before_delete
  before delete on public.empresas
  for each row
  execute function public.empresas_before_delete();
