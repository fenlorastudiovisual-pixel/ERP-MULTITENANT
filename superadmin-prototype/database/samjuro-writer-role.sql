-- Rol de escritura mínima para sincronizar precios hacia la Supabase de Samjuro.
-- EJECUTAR EN LA SUPABASE DE SAMJURO (SQL Editor, con cuenta administradora).
-- Importante: este archivo NO contiene contraseñas. Reemplaza el marcador en tu consola;
-- nunca guardes la connection string ni la contraseña en el repositorio.

-- 1) Rol sin privilegios de borrado, sin creación de roles/bases y sin DDL de tablas.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'erp_writer') then
    create role erp_writer login;
  end if;
end
$$;

alter role erp_writer with password 'REEMPLAZAR_CON_PASSWORD_SEGURO';
alter role erp_writer nosuperuser nocreaterole nocreatedb noinherit;
-- noinherit evita heredar privilegios amplios del rol public.

-- 2) Quitar cualquier privilegio previo sobre tablas del esquema public.
revoke all on all tables in schema public from erp_writer;
revoke all on all sequences in schema public from erp_writer;
grant usage on schema public to erp_writer;

-- 3) Permisos columnares: SELECT de identificación y UPDATE de UN solo campo por tabla.
--    No hay DELETE, no hay TRUNCATE, no hay UPDATE sobre pedidos ni catálogo transversal.
grant select (id, sku, nombre, precio) on public.presentaciones to erp_writer;
grant update (precio) on public.presentaciones to erp_writer;

grant select (id, sku, nombre, precio_referencia) on public.productos to erp_writer;
grant update (precio_referencia) on public.productos to erp_writer;

-- 4) Las tablas ya tenían RLS activo; solo agregamos pólizas de UPDATE para este rol.
--    No se modifica ninguna póliza de lectura existente (toma pedidos/catálogo siguen igual).
drop policy if exists "ERP writer actualiza precio presentacion" on public.presentaciones;
create policy "ERP writer actualiza precio presentacion"
  on public.presentaciones for update to erp_writer
  using (true) with check (true);

drop policy if exists "ERP writer actualiza precio referencia producto" on public.productos;
create policy "ERP writer actualiza precio referencia producto"
  on public.productos for update to erp_writer
  using (true) with check (true);

-- 5) Verificación (solo lectura). Debe devolver true para las 4 columnas y false para DELETE.
-- select has_table_privilege('erp_writer','public.presentaciones','UPDATE') as upd,
--        has_column_privilege('erp_writer','public.presentaciones','precio','UPDATE') as upd_precio,
--        has_column_privilege('erp_writer','public.presentaciones','sku','UPDATE') as upd_sku,
--        has_table_privilege('erp_writer','public.presentaciones','DELETE') as del;

-- Connection string resultante (guárdala fuera del repo, p. ej. SAMJURO-EXPORT/db-writer.txt):
-- postgresql://erp_writer:PASSWORD@db.ubisgeycyoctavcsvcgx.supabase.co:5432/postgres?sslmode=require
