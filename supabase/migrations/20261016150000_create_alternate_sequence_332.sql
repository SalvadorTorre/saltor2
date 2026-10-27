begin;
-- Secuencia interna alterna para documentos tipo 332.
-- No es un TipoeCF oficial y no debe enviarse a la DGII.

insert into myappdb.ncf_secuencias (
  empresa_id,
  tipo_ncf,
  serie,
  rango_inicial,
  rango_final,
  fecha_autorizacion,
  fecha_vencimiento,
  usados,
  total,
  estado,
  alerta,
  porcentaje_alerta
)
select
  empresa.id,
  '332',
  'E332',
  '1',
  '999999999',
  to_char(current_date, 'DD/MM/YYYY'),
  '31/12/2099',
  0,
  999999999,
  'Activa',
  false,
  80
from myappdb.empresas as empresa
where empresa.estado = 'Activa'
  and not exists (
    select 1
    from myappdb.ncf_secuencias as secuencia
    where secuencia.empresa_id = empresa.id
      and secuencia.tipo_ncf = '332'
  );
commit;
