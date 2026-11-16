-- Add accent-forward website palettes sol and rio.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.sitios_web'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%paleta%';
  if cname is not null then
    execute format('alter table public.sitios_web drop constraint %I', cname);
  end if;
end $$;

alter table public.sitios_web
  add constraint sitios_web_paleta_check
  check (paleta in ('clara', 'oscura', 'sol', 'rio'));
