begin;

update myappdb.facturas
set tipo_ncf = case substring(coalesce(tipo_ncf, '') from '([0-9]{2})')
  when '01' then 'E31'
  when '02' then 'E32'
  when '03' then 'E33'
  when '04' then 'E34'
  else 'E' || substring(tipo_ncf from '([0-9]{2})')
end
where tipo_ncf is not null
  and tipo_ncf !~ '^E[0-9]{2}$'
  and tipo_ncf ~ '[0-9]{2}';

commit;
