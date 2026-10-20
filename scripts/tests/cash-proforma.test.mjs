import { PGlite } from '../../tmp/ncf-db/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema myappdb; create schema auth;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create table myappdb.empresas(id integer primary key);
insert into myappdb.empresas values(1),(2);
create table myappdb.usuarios(auth_usuario_id uuid,empresa_id integer,sucursal_id integer,estado text);
insert into myappdb.usuarios values(auth.uid(),1,10,'Activo');
create table myappdb.ecf_configuraciones(url_base text default 'old');
insert into myappdb.ecf_configuraciones values('https://ecf-propio.tail2c2b0a.ts.net/ecf');
create table myappdb.empresas_proforma(empresa_id integer primary key,activa boolean,ultimo_numero bigint,actualizado_en timestamptz);
insert into myappdb.empresas_proforma values(1,true,100,now()),(2,false,0,now());
create table myappdb.empresas_proforma_historial(empresa_id integer,accion text,numero_anterior bigint,numero_actual bigint,activa boolean);
create sequence myappdb.fiscal_counter;
create function myappdb.siguiente_encf_desde_secuencia_ncf_con_vencimiento(integer,text)
returns table(encf text,fecha_vencimiento date) language sql as $$ select 'E'||$2||lpad(nextval('myappdb.fiscal_counter')::text,10,'0'),'2027-12-31'::date $$;
`);
const common=`id bigint primary key,idempres integer,idsucursal integer,estado text,estado_dgii text,dgii_track_id text,dgii_codigo text,
dgii_mensaje_respuesta text,qr_link text,fec_firma timestamptz,dgii_request_json jsonb,dgii_response_json jsonb,
dgii_response_raw text,dgii_mensajes jsonb,dgii_error_message text,dgii_updated_at timestamptz,ecf_ambiente text,dgii_enviado_en timestamptz,dgii_intentos integer default 0`;
await db.exec(`
create table myappdb.facturas(${common},ncf text,tipo_ncf text,dgii_estado text,estado_envio_dgii text,dgii_codigo_respuesta text,"codSeguridad" text,dgii_respuesta jsonb);
create table myappdb.notas_credito(${common},encf_nota text,estado_envio_dgii text,dgii_codigo_seguridad text,fecha_vencimiento_secuencia date);
create table myappdb.gastos_menores(${common},encf text,dgii_codigo_seguridad text,fecha_vencimiento_secuencia date);
insert into myappdb.facturas(id,idempres,idsucursal,tipo_ncf,dgii_estado) values(1,1,10,'E31','No enviado'),(2,1,10,'E332','No enviado'),(3,2,20,'E332','No enviado'),(4,1,10,'E332','No enviado'),(5,2,20,'E31','No enviado'),(6,1,11,'E31','No enviado'),(7,1,10,'E31','No enviado'),(8,1,10,'E31','Enviado');
insert into myappdb.notas_credito(id,idempres,idsucursal) values(1,1,10);
insert into myappdb.gastos_menores(id,idempres,idsucursal) values(1,1,10);
grant usage on schema myappdb,auth to authenticated,service_role;
grant select on myappdb.usuarios to authenticated;
grant all on all tables in schema myappdb to service_role;
grant all on all sequences in schema myappdb to service_role;
`);
await db.exec(await readFile('supabase/migrations/20261016235000_ecf_queue_operations.sql','utf8'));

await db.exec(`
alter table myappdb.usuarios add column nombre_completo text default 'Cajera';
alter table myappdb.facturas add column numero_factura text,add column cliente_id bigint,add column forma_pago_codigo smallint,
  add column condicion_pago text,add column fecha_factura date,add column cobrada_en timestamptz,add column cobrada_por text;
create table myappdb.formapago(codigo smallint primary key);
insert into myappdb.formapago values(1),(4);
insert into myappdb.facturas(id,idempres,idsucursal,tipo_ncf,dgii_estado,estado,numero_factura)
values(10,1,10,'E32','No enviado','Pendiente de cobro','F010'),
(11,1,10,'E32','No enviado','Pendiente de cobro','F011'),
(12,1,10,'E31','No enviado','Pendiente de cobro','F012'),
(13,1,11,'E32','No enviado','Pendiente de cobro','F013'),
(14,2,20,'E32','No enviado','Pendiente de cobro','F014'),
(15,1,10,'E32','No enviado','Pendiente de cobro','F015'),
(16,1,10,'E32','No enviado','Pendiente de cobro','F016'),
(17,1,10,'E332','No enviado','Pendiente de cobro','F017'),
(18,1,10,'E332','No enviado','Pendiente de cobro','F018');
grant usage on schema myappdb,auth to authenticated;
grant select on myappdb.usuarios,myappdb.formapago,myappdb.empresas_proforma to authenticated;
grant select,update on myappdb.facturas to authenticated;
alter table myappdb.facturas enable row level security;
create policy test_cash_scope on myappdb.facturas for all to authenticated using(
  exists(select 1 from myappdb.usuarios u where u.auth_usuario_id=auth.uid() and u.empresa_id=facturas.idempres and u.sucursal_id=facturas.idsucursal and u.estado='Activo')
);
`);
const oldMigration=await readFile('supabase/migrations/20261014100000_cobro_en_caja.sql','utf8');
await db.exec(oldMigration.slice(oldMigration.indexOf('create or replace function myappdb.cobrar_factura('),oldMigration.indexOf('-- Cuentas por cobrar:')));
await db.exec(await readFile('supabase/migrations/20261019120000_cash_consumption_proforma.sql','utf8'));
const q=async(sql,args)=>(await db.query(sql,args)).rows;
const collect=async(id,payment=1)=>(await q('select * from myappdb.cobrar_factura_caja_proforma($1,$2::smallint)',[id,payment]))[0];
let count=0; const check=(ok,label)=>{assert.ok(ok,label);console.log('PASS',label);count++;};
await db.exec('set role authenticated');
let row=await collect(10);
check(row.tipo_ncf==='E332' && row.numero_factura==='F010','E32 se convierte en E332 y devuelve el tipo persistido');
let document=(await q('select * from myappdb.facturas where id=10'))[0];
check(document.estado==='Emitida' && document.cobrada_en && document.forma_pago_codigo===1 && document.ncf===null,'cobro conserva pago y espera numeración del firmador');
check(Number((await q('select ultimo_numero from myappdb.empresas_proforma where empresa_id=1'))[0].ultimo_numero)===100,'cobrar no consume aún el contador de firma');
await assert.rejects(()=>collect(10),/no está pendiente/);count++;
await assert.rejects(()=>collect(13),/empresa y sucursal/);count++;
await assert.rejects(()=>collect(14),/empresa y sucursal/);count++;
await assert.rejects(()=>collect(15,99),/forma de pago/);count++;
document=(await q('select * from myappdb.facturas where id=15'))[0];
check(document.tipo_ncf==='E32' && document.estado==='Pendiente de cobro' && document.cobrada_en===null,'pago inválido revierte conversión y cobro');
await assert.rejects(()=>collect(16,4),/cliente registrado/);count++;
check((await q('select tipo_ncf from myappdb.facturas where id=16'))[0].tipo_ncf==='E32','crédito sin cliente no deja conversión parcial');
row=await collect(12);check(row.tipo_ncf==='E31','facturas E31 conservan su tipo para cola fiscal');
row=await collect(17);check(row.tipo_ncf==='E332','una proforma elegida desde facturación se cobra como E332');
await db.exec('reset role');
await q('update myappdb.empresas_proforma set activa=false where empresa_id=1');
await db.exec('set role authenticated');
await assert.rejects(()=>collect(18),/no está activa/);count++;
row=await collect(11);
check(row.tipo_ncf==='E32','empresa sin proformas conserva la factura E32 fiscal');
document=(await q('select * from myappdb.facturas where id=11'))[0];
check(document.estado==='Emitida' && document.tipo_ncf==='E32','consumo normal se cobra para generar XML con su secuencia E32');
await db.exec('reset role');
await q('update myappdb.empresas_proforma set activa=true where empresa_id=1');
await q("insert into myappdb.ecf_operaciones(tipo,documento_id,empresa_id,sucursal_id,modo,encf,ambiente,url_base) values('FACTURA',15,1,10,'COLA','E320000000999','TEST','https://example.com')");
await db.exec('set role authenticated');
await assert.rejects(()=>collect(15),/ya tiene una operación/);count++;
await db.exec('reset role');
const op=(await q("select myappdb.reservar_operacion_ecf('FACTURA',10,1,10,'32','TEST','https://example.com') as op"))[0].op;
check(op.modo==='FIRMA' && op.encf==='E320000000101','la factura convertida usa solo firma y contador independiente');
check((await q('select is_called from myappdb.fiscal_counter'))[0].is_called===false,'no consume ninguna secuencia fiscal');
await q("select myappdb.guardar_resultado_ecf($1,'FIRMADA',$2)",[op.id,JSON.stringify({dgii_estado:'Firmada',ecf_xml_firmado:'<ECF>signed</ECF>',codSeguridad:'SEC123',qr_link:'https://qr.example',fec_firma:'2026-10-19T16:30:00Z'})]);
document=(await q('select * from myappdb.facturas where id=10'))[0];
check(document.tipo_ncf==='E332' && document.ecf_xml_firmado==='<ECF>signed</ECF>' && document.dgii_estado==='Firmada' && !document.ecf_operation_id && !document.dgii_track_id,'conserva XML firmado sin operación ni aceptación de DGII');
check(document.codSeguridad==='SEC123' && document.qr_link==='https://qr.example' && document.fec_firma,'conserva código de seguridad, QR y fecha real de firma para impresión');
const fiscal=(await q("select myappdb.reservar_operacion_ecf('FACTURA',11,1,10,'32','TEST','https://example.com') as op"))[0].op;
check(fiscal.modo==='COLA' && fiscal.encf==='E320000000001' && fiscal.fecha_vencimiento,'sin proforma usa autorización y secuencia E32 fiscal');
await q("select myappdb.guardar_resultado_ecf($1,'EN_COLA',$2)",[fiscal.id,JSON.stringify({dgii_estado:'En cola',ecf_operation_id:'cola-fiscal-32',ecf_xml_firmado:'<ECF>fiscal</ECF>'})]);
document=(await q('select * from myappdb.facturas where id=11'))[0];
check(document.tipo_ncf==='E32' && document.ecf_operation_id==='cola-fiscal-32' && document.dgii_estado==='En cola','E32 normal conserva su tipo y seguimiento fiscal');
console.log(`${count} verificaciones SQL de cobro proforma correctas`);
await db.close();
