-- Replace legacy clasica template with estudio.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.sitios_web'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%plantilla%';
  if cname is not null then
    execute format('alter table public.sitios_web drop constraint %I', cname);
  end if;
end $$;

update public.sitios_web
set plantilla = 'estudio'
where plantilla = 'clasica';

alter table public.sitios_web
  add constraint sitios_web_plantilla_check
  check (plantilla in ('estudio', 'moderna'));
