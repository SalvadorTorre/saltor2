-- Permite reintentar facturas normales (E31/E32) cuya operación quedó en ERROR
-- sin trackId de la DGII (p. ej. "read ECONNRESET" o 401 del servicio).
-- Reutiliza el mismo e-NCF; antes solo las proformas podían reintentarse.
do $$
declare d text;
begin
  select pg_get_functiondef('myappdb.reservar_operacion_ecf(text,bigint,integer,integer,text,text,text)'::regprocedure) into d;
  d := replace(d, 'if v_op.status=''ERROR'' and v_proforma then',
    'if v_op.status=''ERROR'' and (v_proforma or coalesce(v_op.resultado->>''dgii_track_id'','''')='''') then');
  execute d;
end $$;
