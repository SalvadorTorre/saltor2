# Envío e-CF mediante cola

Base predeterminada: `https://ecf-propio.tail2c2b0a.ts.net/`. Se aceptan también configuraciones antiguas que terminan en `/ecf` o `/api`, normalizadas antes de construir la ruta.

- Facturas fiscales, notas de crédito E34 y gastos menores E43: `POST /ecf/{test|prod}/firmar-y-encolar-direct-cert`, body `{scenarios:[scenario]}` y headers del certificado; `x-cert-persist: true`.
- Proforma interna E332: `POST /ecf/{test|prod}/generate-xml-no-send-direct-cert`. Envía tipo 32 y ENCF con prefijo E32, reservado desde su contador independiente. Omite `x-cert-persist`, no consume autorizaciones E32 y termina como **Firmada**, sin consultar DGII.
- Seguimiento: `GET /ecf/{test|prod}/operaciones-encoladas/{operationId}`, exclusivamente desde la función `consultar-operacion-ecf`. Las credenciales del certificado nunca salen al navegador ni se guardan en las solicitudes de auditoría.

`ecf_operaciones` reserva el ENCF y bloquea envíos concurrentes bajo un bloqueo del documento. Guarda el origen y ambiente utilizados, `operationId`, solicitud sin secretos, respuestas, XML firmado, QR, código de seguridad y fecha de firma. `operationId` y `trackId` son identificadores diferentes. La actualización de operación y documento ocurre en una misma transacción. La lectura exige empresa **y sucursal** del perfil activo; la escritura y las RPC quedan limitadas a `service_role`.

Un 202 significa **En cola**, nunca aceptación DGII. Se consulta cada cuatro segundos, sin solapar peticiones, hasta `ACEPTADO`, `RECHAZADO` o `ERROR`. Se retoma el seguimiento al iniciar sesión o recargar la aplicación. Las respuestas finales son inmutables frente a consultas tardías. No se borran los metadatos de firma cuando una consulta no los trae.

## Reconciliación en segundo plano

La función `reconciliar-ecf-pendientes` revisa hasta 20 operaciones activas por ejecución y actualiza la base aunque ningún usuario tenga la aplicación abierta. La migración `20261020114525_ecf_background_reconciliation.sql` habilita el control de concurrencia y deja preparada una tarea de Supabase Cron cada minuto. La llamada se protege con una clave exclusiva de cron: se guarda en Vault como `ecf_reconciliador_secret` y como secreto de Edge Function bajo `ECF_RECONCILER_SECRET`.

La tarea no se programa hasta que existan en Vault `ecf_reconciliador_url`, `ecf_reconciliador_publishable_key` y `ecf_reconciliador_secret`. Luego se activa ejecutando `select myappdb.configurar_reconciliacion_ecf_programada();`. La interfaz de Consulta de Facturas muestra el identificador de operación, estado de cola, intentos, ambiente y última actualización, además de permitir filtrar todos los estados pendientes.

Si el POST pierde la conexión, devuelve 5xx o no proporciona `operationId`, el documento queda **Envío por confirmar**. No se repite el POST automáticamente: primero hay que verificar el servicio remoto. Un intento interrumpido antes de guardar confirmación pasa al mismo estado después de tres minutos. Los rechazos/errores solo generan una nueva reserva después del restablecimiento explícito del e-NCF del documento; las operaciones anteriores se conservan inactivas como historial.

Caja espera aceptación antes de imprimir automáticamente mientras su pantalla permanezca abierta. Al salir de ella se puede consultar e imprimir desde Facturación → Consulta. La proforma se imprime identificada como PROFORMA.

El nombre legado `send-dgii-direct-cert` delega a las funciones persistidas. Ahora exige exactamente uno de `invoiceId`, `creditNoteId` o `minorExpenseId`; ya no acepta escenarios arbitrarios sin documento asociado. No hay llamadas actuales desde el frontend a ese nombre.

## Instalación

Aplicar las migraciones locales previas de secuencias/proforma y luego `20261016235000_ecf_queue_operations.sql`. Desplegar juntas `enviar-ecf`, `enviar-nota-credito-ecf`, `enviar-gasto-menor-ecf`, `consultar-operacion-ecf` y el adaptador `send-dgii-direct-cert`, incluyendo `_shared`. Finalmente publicar el frontend actualizado. Se mantienen los secretos existentes para descifrar certificados.

Validación local: build Angular, pruebas Angular de temporizadores/reanudación/cancelación de sesión, pruebas Deno del contrato HTTP con fetch simulado, y pruebas PostgreSQL mediante PGlite de reservas, aislamiento e historial. Esta validación no emite facturas ni sustituye una prueba de integración en TEST con el servicio real y un certificado autorizado.

## Cobro de consumo en Caja

`cobrar_factura_caja_proforma` consulta la activación de proformas de la empresa y devuelve el tipo realmente guardado. Si una E32 se cobra en una empresa con proforma activa, se convierte a E332 dentro de la misma transacción del cobro. No reserva ni consume un rango fiscal E32: `enviar-ecf` usa el contador independiente y la ruta de solo firma, devuelve el XML y guarda los datos de firma antes de imprimir. Si la empresa no tiene proformas activas, la factura conserva E32 y se firma/envía mediante la cola fiscal con su secuencia autorizada normal. Una E332 explícita requiere que la función esté activa.

Caja usa el tipo devuelto por el servidor, espera la firma y no imprime una proforma si falta el XML firmado. Las E32 normales se imprimen al ser aceptadas, igual que las otras facturas enviadas a la cola. Los recibos usan `fec_firma`, sin sustituirla por la hora del envío, e incluyen QR, código de seguridad, detalle, importes, condición y notas. El XML firmado queda disponible para descargar desde la vista de consulta.

Aplicar `20261019120000_cash_consumption_proforma.sql` después de las migraciones de proforma/cola y publicar el frontend junto con la nueva RPC. Su nombre distinto hace que un frontend actualizado falle antes de cobrar si aún no se ha instalado esta migración, en lugar de cobrar e imprimir sin firmar.
