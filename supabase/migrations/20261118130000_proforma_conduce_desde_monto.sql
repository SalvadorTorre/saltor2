-- Ventas por período: las proformas de este monto o más SIEMPRE pasan a conduce (nunca a E32).
-- Solo buscándolas por número se pueden pasar a E32. Por empresa (Bella Real: 150,000).
-- (La nueva versión de myappdb.convertir_proformas_a_conduce se aplicó en Supabase con esta migración:
--  primero toma todas las proformas >= proforma_conduce_desde del período y luego completa con las demás
--  hasta el monto indicado; el resto del período pasa a E32 en cola.)
alter table myappdb.empresas add column if not exists proforma_conduce_desde numeric;
comment on column myappdb.empresas.proforma_conduce_desde is 'Conversión de proformas por período: las de este monto o más siempre pasan a conduce. Null = sin regla.';
update myappdb.empresas set proforma_conduce_desde = 150000 where id = 6;
