-- Ambiente SIMULACION: empresa de prueba que no envía a la DGII (enviar-ecf v22 simula la respuesta).
alter table myappdb.ecf_configuraciones drop constraint if exists ecf_configuraciones_ambiente_check;
alter table myappdb.ecf_configuraciones add constraint ecf_configuraciones_ambiente_check
  check (ambiente = any (array['TEST','PROD','CERT','SIMULACION']));
alter table myappdb.ecf_operaciones drop constraint if exists ecf_operaciones_ambiente_check;
alter table myappdb.ecf_operaciones add constraint ecf_operaciones_ambiente_check
  check (ambiente = any (array['TEST','PROD','CERT','SIMULACION']));
alter table myappdb.facturas drop constraint if exists facturas_ecf_ambiente_check;
alter table myappdb.facturas add constraint facturas_ecf_ambiente_check
  check (ecf_ambiente = any (array['TEST','PROD','CERT','SIMULACION']));
alter table myappdb.notas_credito drop constraint if exists notas_credito_ecf_ambiente_check;
alter table myappdb.notas_credito add constraint notas_credito_ecf_ambiente_check
  check (ecf_ambiente = any (array['TEST','PROD','CERT','SIMULACION']));
alter table myappdb.contadores_ecf drop constraint if exists contadores_ecf_ambiente_check;
alter table myappdb.contadores_ecf add constraint contadores_ecf_ambiente_check
  check (ambiente = any (array['TEST','PROD','CERT','SIMULACION']));
