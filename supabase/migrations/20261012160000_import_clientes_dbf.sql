-- ===========================================================================
-- Migración de clientes desde DBF/cliente.dbf (sistema anterior) a
-- myappdb.clients, empresa GABANA SELECT LIQUOR STORE SRL (id 2).
-- 51 clientes (se omiten 8: sin nombre o de prueba).
--  * Sin RNC/cédula: documento provisional SD-<código>, tipo Cedula (no se usa
--    como RNC en la factura ni se envía a la DGII). Cámbialo luego en Clientes.
--  * DIAS vacío -> 30 días de crédito; CL_STATUS 1 = Activo, 0 = Inactivo.
--  * Las deudas (CL_DEUCLIE) NO se cargan aquí: van como "Saldo anterior" en
--    Cuentas por cobrar en el paso siguiente.
-- Además corrige dos reglas que impedían que dos empresas tuvieran un cliente
-- con el mismo código o documento (ya existen las equivalentes por empresa).
-- Todo en una transacción: si algo falla, no se carga nada.
-- ===========================================================================
begin;
alter table myappdb.clients drop constraint if exists clients_code_key;
alter table myappdb.clients drop constraint if exists clients_document_number_key;
drop index if exists myappdb.clients_code_key;
drop index if exists myappdb.clients_document_number_key;
alter table myappdb.clients disable trigger clients_bitacora;
insert into myappdb.clients
  (empresa_id, codigo, nombre_completo, tipo_documento, numero_documento, telefono, direccion,
   limite_credito, dias_credito, estado, categoria)
values
  (2, '123', 'SALVADOR JOSE TORRES', 'Cedula', 'SD-123', '232-342-323', 'ADSFASKDFAKSDFA', 50000.00, 30, 'Activo', 'Minorista'),
  (2, '124', 'PEDRO MARTINEZ', 'Cedula', 'SD-124', null, 'ADSFFASDDAS', 0, 30, 'Inactivo', 'Minorista'),
  (2, '22223', 'MARIA CRUZ', 'Cedula', 'SD-22223', null, null, 5000.00, 30, 'Activo', 'Minorista'),
  (2, '22225', 'JOSE', 'Cedula', 'SD-22225', null, null, 5000.00, 30, 'Activo', 'Minorista'),
  (2, '22232', 'PEDRO SANTANA', 'Cedula', 'SD-22232', '809-452-5632', 'SADKFLASKDLFA', 23000.00, 25, 'Activo', 'Minorista'),
  (2, '22233', 'FANTASIA TRIPE A', 'Cedula', 'SD-22233', '809-848-7392', 'CANAAN 1RO', 12000.00, 6, 'Activo', 'Minorista'),
  (2, '22234', 'PELUQUERIA USA', 'Cedula', 'SD-22234', '809-924-5425', 'LICEY SOLARES', 10000.00, 8, 'Activo', 'Minorista'),
  (2, '22235', 'COLM SAN MIGUEL MARIANO', 'Cedula', 'SD-22235', '849-356-0853', 'EL 26 SIERRA PRIETA', 0, 0, 'Inactivo', 'Minorista'),
  (2, '22236', 'COLM MONARCA', 'Cedula', 'SD-22236', '829-963-0711', 'MATA SAN JUAN', 25000.00, 8, 'Activo', 'Minorista'),
  (2, '22237', 'COLM ULTIMA TANDA', 'Cedula', 'SD-22237', '849-607-3258', null, 15000.00, 8, 'Activo', 'Minorista'),
  (2, '22238', 'VICTOR BITINBOY', 'Cedula', 'SD-22238', '809-602-7675', null, 0, 0, 'Inactivo', 'Minorista'),
  (2, '22239', 'HUGO ALMANDO', 'Cedula', 'SD-22239', '829-425-8782', null, 13000.00, 5, 'Activo', 'Minorista'),
  (2, '22240', 'COLM PUNTA PUNTA', 'Cedula', 'SD-22240', '809-390-7498', 'C YAMASA PUNTA VM', 75000.00, 5, 'Activo', 'Minorista'),
  (2, '22242', 'COLM LOS RUBIOS 4', 'Cedula', 'SD-22242', '849-353-6221', 'SAN FELIPE KM 14', 10000.00, 5, 'Activo', 'Minorista'),
  (2, '22243', 'FRANCIS VALENTIN', 'Cedula', 'SD-22243', '829-401-5734', 'PUNTA SAN FELIPE', 75000.00, 10, 'Activo', 'Minorista'),
  (2, '22244', 'JUAN TOMAS', 'Cedula', 'SD-22244', null, 'MATA GORDA', 25000.00, 10, 'Activo', 'Minorista'),
  (2, '22245', 'PUPI VAPER', 'Cedula', 'SD-22245', '829-723-1126', 'CANAAN 2DO', 30000.00, 8, 'Activo', 'Minorista'),
  (2, '22246', 'EMANUEL ARIAS', 'Cedula', 'SD-22246', '809-420-6853', null, 10000.00, 10, 'Activo', 'Minorista'),
  (2, '22247', 'MONARCA', 'Cedula', 'SD-22247', '829-963-0711', 'MATA SAN JUAN', 25000.00, 8, 'Activo', 'Minorista'),
  (2, '22248', 'YOANA MARTE OTRO FLO', 'Cedula', 'SD-22248', '849-862-1659', null, 25000.00, 8, 'Activo', 'Minorista'),
  (2, '22249', 'YONATAN PELUQUERIA', 'Cedula', 'SD-22249', '809-253-9462', 'MATA SAN JUAN', 12000.00, 8, 'Activo', 'Minorista'),
  (2, '22250', 'FELIX CABRAL', 'Cedula', 'SD-22250', '849-246-8669', 'ALMENDRO', 12000.00, 8, 'Activo', 'Minorista'),
  (2, '22251', 'TERRAZA ANNY', 'Cedula', 'SD-22251', '829-877-8600', 'CALLE CERVANTES', 15000.00, 8, 'Activo', 'Minorista'),
  (2, '22252', 'CARELA CMERCIAL', 'Cedula', 'SD-22252', '829-329-9227', 'MATA SAN JUAN', 20000.00, 8, 'Activo', 'Minorista'),
  (2, '22253', 'FRANCISCO ANT REYES', 'Cedula', 'SD-22253', '849-351-0417', 'MATA SAN JUAN', 10000.00, 5, 'Activo', 'Minorista'),
  (2, '22254', 'ANDRI ORTIZ LA CONEC', 'Cedula', 'SD-22254', '-   -', 'PUNTA SAN FELIPE', 50000.00, 8, 'Activo', 'Minorista'),
  (2, '22255', 'MARIANO', 'Cedula', 'SD-22255', '849-356-0853', 'EL 26 CIERRA PRIETA', 200000.00, 10, 'Activo', 'Minorista'),
  (2, '22256', 'PAULINO', 'Cedula', 'SD-22256', '829-718-2717', 'MATA SAN JUA', 12000.00, 8, 'Activo', 'Minorista'),
  (2, '22257', 'COLM YOKA', 'Cedula', 'SD-22257', '809-829-5525', 'C YAMASA KM 14', 50000.00, 8, 'Activo', 'Minorista'),
  (2, '22258', 'CARLOS A MORENO', 'Cedula', 'SD-22258', '809-618-2109', 'VISTA BELLA VM', 75000.00, 8, 'Activo', 'Minorista'),
  (2, '22259', 'MARIA FELIX', 'Cedula', 'SD-22259', '809-657-8232', 'CANAAN 2', 10000.00, 8, 'Activo', 'Minorista'),
  (2, '22260', 'COLM GERALDO', 'Cedula', 'SD-22260', '829-209-7861', null, 10000.00, 8, 'Activo', 'Minorista'),
  (2, '22261', 'ROBERTO CACHE', 'Cedula', 'SD-22261', '849-409-7465', 'HIGUERO', 150000.00, 10, 'Activo', 'Minorista'),
  (2, '22262', 'LUIYI REYES', 'Cedula', 'SD-22262', '849-267-1432', 'MATA SAN JUAN', 25000.00, 8, 'Activo', 'Minorista'),
  (2, '22263', 'DANNY MONTERO', 'Cedula', 'SD-22263', '809-984-9210', 'C/ YAMASA KM 18', 150000.00, 8, 'Activo', 'Minorista'),
  (2, '22264', 'JOAQUIN DE LA CRUZ', 'Cedula', 'SD-22264', '849-912-2824', 'LOS MORENOS SAN FELIPE', 100000.00, 8, 'Activo', 'Minorista'),
  (2, '22265', 'FABIAN MUÑOS FIGUEROA', 'Cedula', 'SD-22265', '829-718-2717', 'MATA SAN JUAN', 20000.00, 8, 'Activo', 'Minorista'),
  (2, '22266', 'NELLY', 'Cedula', 'SD-22266', '809-780-2450', null, 10000.00, 15, 'Activo', 'Minorista'),
  (2, '22267', 'WINNER RENE', 'Cedula', 'SD-22267', '809-390-7498', 'C/YAMASA KM 18', 100000.00, 8, 'Activo', 'Minorista'),
  (2, '22268', 'CRISTIAN MARTINEZ', 'Cedula', 'SD-22268', '829-720-8254', 'C/YAMASA KM15', 100000.00, 8, 'Activo', 'Minorista'),
  (2, '22269', 'ALFRED COMERCIAL', 'Cedula', 'SD-22269', '809-915-3963', 'C/YAMASA KM 15', 100000.00, 10, 'Activo', 'Minorista'),
  (2, '22270', 'EDDY BAEZ', 'Cedula', 'SD-22270', '829-958-2251', 'AV JACOBO MAJLUTA', 150000.00, 8, 'Activo', 'Minorista'),
  (2, '22271', 'SINDY PAREDES', 'Cedula', 'SD-22271', '829-566-8754', 'CARRETERA SAN FELIPE KM 14', 25000.00, 8, 'Activo', 'Minorista'),
  (2, '22272', 'PARADOR LONDRES', 'Cedula', 'SD-22272', '829-285-0729', 'C/YAMASA KM20', 200000.00, 10, 'Activo', 'Minorista'),
  (2, '22273', 'WELINTON DIAZ DIAZ', 'Cedula', 'SD-22273', '829-729-4312', 'CANAAN 1RO', 40000.00, 8, 'Activo', 'Minorista'),
  (2, '22274', 'MIGUEL ROJAS', 'Cedula', 'SD-22274', '809-706-1625', 'KM 20', 200000.00, 8, 'Activo', 'Minorista'),
  (2, '22275', 'EDWIN OZUNA', 'Cedula', 'SD-22275', '809-868-4013', 'MAL NOMBRE', 50000.00, 8, 'Activo', 'Minorista'),
  (2, '22276', 'PEDRO BRITO BIDO', 'RNC', '114814262', '809-520-1597', 'CALLE LOS MORENOS', 100000.00, 8, 'Activo', 'Minorista'),
  (2, '22277', 'MONARCA VIP', 'Cedula', 'SD-22277', '829-963-0711', 'MATA SAN JUAN', 100000.00, 8, 'Activo', 'Minorista'),
  (2, '22278', 'ALDRIN MORENO', 'Cedula', 'SD-22278', '849-257-5654', 'C-YAMASA SAN FELIPE', 50000.00, 8, 'Activo', 'Minorista'),
  (2, '22279', 'D ANGELA N DRINK BAR', 'Cedula', 'SD-22279', '809-886-0098', 'CANAAN 1RO', 50000.00, 8, 'Activo', 'Minorista')
on conflict do nothing;
alter table myappdb.clients enable trigger clients_bitacora;
insert into myappdb.bitacora (empresa_id, usuario_nombre, tabla, registro_id, accion, resumen, cambios)
values (2, 'Migración DBF', 'clients', null, 'Crear', 'Migración de 51 clientes desde cliente.dbf',
        jsonb_build_object('clientes_cargados', jsonb_build_object('despues', 51)));
do $$
declare v_total int;
begin
  select count(*) into v_total from myappdb.clients where empresa_id = 2 and numero_documento like 'SD-%' or (empresa_id = 2 and codigo = '22276');
  if v_total < 51 then
    raise exception 'Se esperaban 51 clientes migrados y hay %', v_total;
  end if;
  raise notice 'Clientes migrados en GABANA: %', v_total;
end $$;
commit;
