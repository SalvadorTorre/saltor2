alter table myappdb.empresas add column if not exists mostrar_inicio boolean not null default true;
comment on column myappdb.empresas.mostrar_inicio is 'Inicio: true muestra el resumen con datos; false muestra una pantalla de bienvenida sin datos.';
