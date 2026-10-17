# Envío e-CF mediante cola

Base predeterminada: `https://ecf-propio.tail2c2b0a.ts.net/`. Se aceptan también configuraciones antiguas que terminan en `/ecf` o `/api`, normalizadas antes de construir la ruta.

- Facturas fiscales, notas de crédito E34 y gastos menores E43: `POST /ecf/{test|prod}/firmar-y-encolar-direct-cert`, body `{scenarios:[scenario]}` y headers del certificado; `x-cert-persist: true`.
- Proforma interna E332: `POST /ecf/{test|prod}/generate-xml-no-send-direct-cert`. Envía tipo 32 y ENCF con prefijo E32, reservado desde su contador independiente. Omite `x-cert-persist`, no consume autorizaciones E32 y termina como **Firmada**, sin consultar DGII.
- Seguimiento: `GET /ecf/{test|prod}/operaciones-encoladas/{operationId}`, exclusivamente desde la función `consultar-operacion-ecf`. Las credenciales del certificado nunca salen al navegador ni se guardan en las solicitudes de auditoría.

`ecf_operaciones` reserva el ENCF y bloquea envíos concurrentes bajo un bloqueo del documento. Guarda el origen y ambiente utilizados, `operationId`, solicitud sin secretos, respuestas, XML firmado, QR, código de seguridad y fecha de firma. `operationId` y `trackId` son identificadores diferentes. La actualización de operación y documento ocurre en una misma transacción. La lectura exige empresa **y sucursal** del perfil activo; la escritura y las RPC quedan limitadas a `service_role`.

Un 202 significa **En cola**, nunca aceptación DGII. Se consulta cada cuatro segundos, sin solapar peticiones, hasta `ACEPTADO`, `RECHAZADO` o `ERROR`. Se retoma el seguimiento al iniciar sesión o recargar la aplicación. El servicio remoto continúa trabajando aunque el navegador esté cerrado; el estado local se actualiza en la próxima consulta. Las respuestas finales son inmutables frente a consultas tardías. No se borran los metadatos de firma cuando una consulta no los trae.

Si el POST pierde la conexión, devuelve 5xx o no proporciona `operationId`, el documento queda **Envío por confirmar**. No se repite el POST automáticamente: primero hay que verificar el servicio remoto. Un intento interrumpido antes de guardar confirmación pasa al mismo estado después de tres minutos. Los rechazos/errores solo generan una nueva reserva después del restablecimiento explícito del e-NCF del documento; las operaciones anteriores se conservan inactivas como historial.

Caja espera aceptación antes de imprimir automáticamente mientras su pantalla permanezca abierta. Al salir de ella se puede consultar e imprimir desde Facturación → Consulta. La proforma se imprime identificada como PROFORMA.

El nombre legado `send-dgii-direct-cert` delega a las funciones persistidas. Ahora exige exactamente uno de `invoiceId`, `creditNoteId` o `minorExpenseId`; ya no acepta escenarios arbitrarios sin documento asociado. No hay llamadas actuales desde el frontend a ese nombre.

## Instalación

Aplicar las migraciones locales previas de secuencias/proforma y luego `20261016235000_ecf_queue_operations.sql`. Desplegar juntas `enviar-ecf`, `enviar-nota-credito-ecf`, `enviar-gasto-menor-ecf`, `consultar-operacion-ecf` y el adaptador `send-dgii-direct-cert`, incluyendo `_shared`. Finalmente publicar el frontend actualizado. Se mantienen los secretos existentes para descifrar certificados.

Validación local: build Angular, pruebas Angular de temporizadores/reanudación/cancelación de sesión, pruebas Deno del contrato HTTP con fetch simulado, y pruebas PostgreSQL mediante PGlite de reservas, aislamiento e historial. Esta validación no emite facturas ni sustituye una prueba de integración en TEST con el servicio real y un certificado autorizado.
