alter table myappdb.empresas add column if not exists pie_impresion text;
comment on column myappdb.empresas.pie_impresion is 'Mensaje de pie de página de la factura/orden (hasta 3 líneas), debajo de la firma.';
