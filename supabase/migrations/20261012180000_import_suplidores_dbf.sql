-- ===========================================================================
-- Migración de suplidores desde DBF/suplidor.dbf (sistema anterior) a
-- myappdb.suplidores, empresa GABANA SELECT LIQUOR STORE SRL (id 2).
-- 7 suplidores, todos con RNC; sin balances pendientes.
-- Todo en una transacción: si algo falla, no se carga nada.
-- ===========================================================================
begin;
alter table myappdb.suplidores disable trigger suplidores_bitacora;
insert into myappdb.suplidores
  (empresa_id, codigo, nombre_comercial, tipo_documento, numero_documento, telefono, contacto, direccion, categoria, estado)
values
  (2, '12', 'RON DEPOT CASH & CARRY S A', 'RNC', '130660131', '8094127946', null, 'ENS. NACO PROX ESQUINA ORTEGA Y GASSET', 'Local', 'Activo'),
  (2, '13', 'ALTACOPA S A', 'RNC', '101585633', '8095370786', '8095376577', 'INDEPENDENCIA KM 12 HAINA STO DGO', 'Local', 'Activo'),
  (2, '14', 'FRITO-LAY DOMINICANA S A', 'RNC', '101601175', null, null, null, 'Local', 'Activo'),
  (2, '15', 'MERCASID S A', 'RNC', '101807687', null, null, null, 'Local', 'Activo'),
  (2, '16', 'DISTRIBUIDORA CORRIPIO CXA', 'RNC', '101003693', null, null, null, 'Local', 'Activo'),
  (2, '17', 'UNITED BRANDS S A', 'RNC', '124019338', null, null, null, 'Local', 'Activo'),
  (2, '18', 'AGUA PLANETA AZUL C POR A', 'RNC', '101503939', '8095657765', '8095405926', null, 'Local', 'Activo')
on conflict do nothing;
alter table myappdb.suplidores enable trigger suplidores_bitacora;
insert into myappdb.bitacora (empresa_id, usuario_nombre, tabla, registro_id, accion, resumen, cambios)
values (2, 'Migración DBF', 'suplidores', null, 'Crear', 'Migración de 7 suplidores desde suplidor.dbf',
        jsonb_build_object('suplidores_cargados', jsonb_build_object('despues', 7)));
do $$
declare v_n int;
begin
  select count(*) into v_n from myappdb.suplidores
  where empresa_id = 2 and codigo in ('12', '13', '14', '15', '16', '17', '18');
  if v_n <> 7 then raise exception 'Se esperaban 7 suplidores y hay %', v_n; end if;
  raise notice 'Suplidores migrados en GABANA: %', v_n;
end $$;
commit;
