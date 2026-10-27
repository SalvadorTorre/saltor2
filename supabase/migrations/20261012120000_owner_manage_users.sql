begin;
-- ===========================================================================
-- El dueño del sistema puede ver los usuarios de todas las empresas y
-- cambiarlos de empresa. Los administradores de cada empresa siguen limitados
-- a la suya (las políticas existentes no cambian).
-- ===========================================================================
drop policy if exists usuarios_dueno_select on myappdb.usuarios;
create policy usuarios_dueno_select on myappdb.usuarios for select to authenticated
  using ((select private.es_dueno_sistema()));
drop policy if exists usuarios_dueno_update on myappdb.usuarios;
create policy usuarios_dueno_update on myappdb.usuarios for update to authenticated
  using ((select private.es_dueno_sistema()))
  with check ((select private.es_dueno_sistema()));
commit;
