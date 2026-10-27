-- Habilita Transacciones en las empresas ya creadas para que el módulo esté
-- disponible mientras se termina de configurar su selección individual.
insert into myappdb.empresa_modulos (empresa_id, modulo, activo, actualizado_en)
select id, 'transacciones', true, now()
from myappdb.empresas
on conflict (empresa_id, modulo) do update
set activo = true,
    actualizado_en = excluded.actualizado_en;
