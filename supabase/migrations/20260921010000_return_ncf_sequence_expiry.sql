begin;

create function myappdb.siguiente_encf_desde_secuencia_ncf_con_vencimiento(
  p_empresa_id integer,
  p_tipo_ncf text
)
returns table (
  encf text,
  fecha_vencimiento date,
  alerta_secuencia boolean,
  mensaje_alerta text,
  usados integer,
  total integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  secuencia record;
  consecutivo bigint;
  porcentaje_usado numeric;
begin
  select s.*
  into secuencia
  from myappdb.ncf_secuencias s
  where s.empresa_id = p_empresa_id
    and (s.tipo_ncf = p_tipo_ncf or s.tipo_ncf ~ ('^' || regexp_replace(p_tipo_ncf, '[^0-9]', '', 'g') || '([^0-9]|$)'))
  order by s.id desc
  limit 1
  for update;

  if not found then
    raise exception 'No existe una secuencia NCF configurada para la empresa % y tipo e-CF %.', p_empresa_id, p_tipo_ncf using errcode = '22023';
  end if;

  if secuencia.estado <> 'Activa' then
    raise exception 'La secuencia % está % y no puede utilizarse.', secuencia.serie, lower(secuencia.estado) using errcode = '22023';
  end if;

  if secuencia.fecha_vencimiento ~ '^\d{2}/\d{2}/\d{4}$' then
    fecha_vencimiento := to_date(secuencia.fecha_vencimiento, 'DD/MM/YYYY');
  elsif secuencia.fecha_vencimiento ~ '^\d{4}-\d{2}-\d{2}$' then
    fecha_vencimiento := secuencia.fecha_vencimiento::date;
  end if;

  if fecha_vencimiento is null then
    raise exception 'La secuencia % no tiene una fecha de vencimiento válida.', secuencia.serie using errcode = '22023';
  end if;

  if fecha_vencimiento < current_date then
    update myappdb.ncf_secuencias set estado = 'Vencida' where id = secuencia.id;
    raise exception 'La secuencia % venció el %.', secuencia.serie, to_char(fecha_vencimiento, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  if secuencia.total <= 0 then
    raise exception 'La secuencia % no tiene una cantidad autorizada válida.', secuencia.serie using errcode = '22023';
  end if;

  if secuencia.usados >= secuencia.total then
    update myappdb.ncf_secuencias set estado = 'Agotada' where id = secuencia.id;
    raise exception 'La secuencia % está agotada (% de % comprobantes usados).', secuencia.serie, secuencia.usados, secuencia.total using errcode = '22023';
  end if;

  consecutivo := secuencia.rango_inicial::bigint + secuencia.usados;
  usados := secuencia.usados + 1;
  total := secuencia.total;
  porcentaje_usado := (usados::numeric * 100) / total;
  alerta_secuencia := porcentaje_usado >= secuencia.porcentaje_alerta;
  mensaje_alerta := case
    when alerta_secuencia then format('Alerta de secuencia: se ha utilizado %s%% (%s de %s) del e-NCF %s.', round(porcentaje_usado, 2), usados, total, secuencia.serie)
    else null
  end;
  encf := case when upper(secuencia.serie) like 'E%' then upper(secuencia.serie) else 'E' || secuencia.serie end || lpad(consecutivo::text, 10, '0');

  update myappdb.ncf_secuencias
  set usados = secuencia.usados + 1,
      alerta = alerta_secuencia,
      estado = case when secuencia.usados + 1 >= secuencia.total then 'Agotada' else 'Activa' end
  where id = secuencia.id;

  return next;
end;
$$;

revoke all on function myappdb.siguiente_encf_desde_secuencia_ncf_con_vencimiento(integer, text) from public, anon, authenticated;
grant execute on function myappdb.siguiente_encf_desde_secuencia_ncf_con_vencimiento(integer, text) to service_role;

commit;
