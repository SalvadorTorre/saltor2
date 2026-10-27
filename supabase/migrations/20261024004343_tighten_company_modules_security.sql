-- Evita una segunda política SELECT permisiva: la lectura del dueño ya está
-- incluida en empresa_modulos_lectura.
drop policy if exists empresa_modulos_dueno on myappdb.empresa_modulos;

drop policy if exists empresa_modulos_dueno_insert on myappdb.empresa_modulos;
create policy empresa_modulos_dueno_insert on myappdb.empresa_modulos
  for insert to authenticated
  with check ((select private.es_dueno_sistema()));

drop policy if exists empresa_modulos_dueno_update on myappdb.empresa_modulos;
create policy empresa_modulos_dueno_update on myappdb.empresa_modulos
  for update to authenticated
  using ((select private.es_dueno_sistema()))
  with check ((select private.es_dueno_sistema()));

drop policy if exists empresa_modulos_dueno_delete on myappdb.empresa_modulos;
create policy empresa_modulos_dueno_delete on myappdb.empresa_modulos
  for delete to authenticated
  using ((select private.es_dueno_sistema()));
