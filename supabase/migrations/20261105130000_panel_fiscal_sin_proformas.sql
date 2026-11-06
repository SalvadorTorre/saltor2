-- Panel fiscal e Inicio (Pendientes DGII): las proformas (E332) no entran en los cálculos.
do $mig$
declare
  v_def text; v_new text;
  v_cond_f text := $c$coalesce(f.estado, '') <> 'Anulada' and coalesce(f.tipo_ncf, '') !~ '(^|\D)332(\D|$)'$c$;
  v_cond_x text := $c$from myappdb.facturas x where coalesce(x.estado, '') <> 'Anulada' and coalesce(x.tipo_ncf, '') !~ '(^|\D)332(\D|$)'$c$;
begin
  v_def := pg_get_functiondef('myappdb.panel_fiscal(date, date)'::regprocedure);
  v_new := replace(v_def, $c$coalesce(f.estado, '') <> 'Anulada'$c$, v_cond_f);
  if v_new = v_def or (length(v_new) - length(v_def)) <> 2 * (length(v_cond_f) - length($c$coalesce(f.estado, '') <> 'Anulada'$c$)) then
    raise exception 'panel_fiscal: se esperaban 2 reemplazos';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('myappdb.dashboard_inicio()'::regprocedure);
  v_new := replace(v_def, $c$from myappdb.facturas x where coalesce(x.estado, '') <> 'Anulada'$c$, v_cond_x);
  if v_new = v_def then raise exception 'dashboard_inicio: bloque docs no encontrado'; end if;
  execute v_new;
end $mig$;
