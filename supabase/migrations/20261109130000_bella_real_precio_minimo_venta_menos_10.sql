-- Bella Real: precio mínimo = precio de venta − 10 % (el anterior quedó guardado en precioespecial).
update myappdb.products
set precio_minimo = round(precio_venta * 0.9, 2)
where empresa_id = 6;
