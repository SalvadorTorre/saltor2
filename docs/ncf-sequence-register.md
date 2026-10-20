# Registro de solicitudes e-NCF

Ruta: `/contabilidad/e-ncf`.

- Mostrar por defecto todos los rangos guardados de la empresa, incluidos agotados y vencidos, en una tabla con desplazamiento horizontal. Filtros locales por tipo y texto; empresa resuelta exclusivamente desde la sesión.
- «Nueva solicitud», «Editar» y «Agregar más» abren un diálogo sobre el grid, con foco contenido, Escape y retorno al botón de origen. Guardar siempre inserta una fila independiente; editar conserva la versión anterior en el historial.
- Autorización es la referencia; se guarda separadamente su fecha. Solicitados y aceptados son cantidades de comprobantes. Este registro recibe solicitudes ya autorizadas (aceptados > 0), no tramita solicitudes ante DGII.
- Guardar internamente la empresa de la sesión, tipo/serie, referencia, fecha de autorización, solicitados, aceptados, desde/hasta, utilizados y vencimiento. Aceptados debe coincidir con el tamaño del rango y no superar solicitados. Los rangos no pueden solaparse dentro de una empresa/serie.
- Número actual = inicio + utilizados − 1; sin consumo mostrar «Sin utilizar». Próximo = inicio + utilizados si la secuencia sigue disponible. El contador cambia al emitir; en edición no se puede modificar. Una nueva solicitud permite registrar consumo anterior.
- Conservar registros previos. No ofrecer eliminación. Un rango consumido no se reemplaza. Guardados concurrentes rechazan datos obsoletos mediante actualizado_en/usados.
- Historial append-only por fila: estado inicial disponible, solicitudes, modificaciones y consumo de números. Lectura limitada por empresa; mostrar los últimos 100 movimientos, con fecha y todos los campos solicitados.
- No inventar referencia ni cantidad solicitada de datos anteriores: mostrar «Sin registrar». No es posible reconstruir cambios anteriores a la migración.
- Mostrar carga, error recuperable, vacío y ausencia de coincidencias. Usar SVG inline reconocibles para buscar, actualizar, agregar, editar e historial. Compatibilidad con el tema global y navegación por teclado.

Base de datos: aplicar `20261016220000_ncf_request_register_and_history.sql` antes de usar las nuevas escrituras. No requiere cambios en funciones Edge ni modifica la selección de rangos del emisor existente.

## Validación y evaluación UX

- Fortaleza: todas las solicitudes son visibles por defecto; la acción principal es «Nueva solicitud» y la edición se realiza en la página.
- Brechas corregidas: modal, iconos vacíos, ausencia de referencia/cantidades solicitadas, falta de historial consultable, empresas de demostración en lugar del catálogo real y errores de carga ocultos.
- Contrato de implementación: campos nuevos opcionales para leer datos anteriores; obligatorios en altas/ediciones del nuevo formulario. La base registra versiones y consumo en la misma transacción. Guardados obsoletos exigen recargar.
- Especificación afectada: este documento; componente, modelos, servicio NCF y migración implementan el contrato.
- URL visual probada: `http://localhost:4302/contabilidad/e-ncf` en un arnés local con el componente Angular real y servicios de prueba, sin conectarse a Supabase. Se verificaron tema claro/oscuro, móvil de 390 px, nueva solicitud, historial, vacío y error recuperable. La página no desborda el viewport móvil; el grid se desplaza dentro de su región.
- Consola de la vista de prueba: sin errores ni advertencias. Red: sin respuestas HTTP >= 400 ni fallos de carga observados en la recarga instrumentada. No se probaron peticiones reales de Supabase ni emisión a DGII.
- Pruebas: 21 pruebas Angular correctas; 16 verificaciones SQL sobre PostgreSQL efímero (PGlite), incluyendo aislamiento por empresa, conservación de filas/versiones, validación de cantidades/rangos/fechas y protección del contador. Reproducción SQL: `npm install --prefix tmp/ncf-db @electric-sql/pglite --no-audit --no-fund`, después `node scripts/tests/ncf-register.test.mjs`.
- Kid Wow Check: PASS (acción y propósito visibles). Mom Comprehension Check: PASS (etiquetas explícitas y distinción entre número actual/próximo). Los números por solicitud no indican cuál seleccionará el emisor; este mantiene su política existente de selección.
- Evidencia local: `tmp/ncf-preview/grid-historial.jpg` y `tmp/ncf-preview/grid-oscuro.jpg` (datos ficticios).

## Filas predeterminadas por tipo

- Por cada empresa se muestra una fila por cada tipo del catálogo que todavía no tiene rangos registrados: desde `0`, hasta `99999999999`, número actual `0`, solicitados/aceptados `0`, fechas y referencia sin registrar.
- Las filas predeterminadas se identifican como «Pendiente de configurar». Son valores iniciales de la pantalla, no autorizaciones fiscales ni secuencias disponibles para emisión. No se insertan rangos ficticios en la base.
- Editar la fila abre el formulario en la página con su empresa, tipo y rango inicial. Deben sustituirse por los datos autorizados antes de guardar. El registro real reemplaza la fila predeterminada de ese tipo en el grid.
- Los rangos reales y las solicitudes anteriores se conservan; no se sobreescriben con los valores predeterminados. Nuevas solicitudes siguen creando un registro independiente con historial.

Verificación de predeterminados: `http://localhost:4302/contabilidad/e-ncf?empty`, con servicios de prueba. Se comprobaron 10 filas, sus límites exactos y la apertura de E34 con su rango inicial; consola sin errores ni advertencias. Evidencia: `tmp/ncf-preview/predeterminadas.jpg`. Compilación y 21 pruebas Angular correctas.

## Contexto de sesión y actualización visual

- La pantalla operativa no muestra empresa en columnas, filtros ni formulario. No consulta el catálogo de empresas. Espera la restauración de la sesión y limita la consulta de secuencias e historial a su empresa, incluso para el dueño de plataforma.
- Las filas predeterminadas y las opciones se generan exclusivamente para ese tenant; se descartan respuestas con empresa distinta. En guardado se impone el ID de sesión y se rechaza editar/historiar una fila ajena. RLS permanece como control del servidor.
- Interfaz compacta: encabezado de control fiscal, resumen de registrados/disponibles/por configurar y panel continuo de filtros, tabla y pie. La columna inicial es el tipo, con distintivo de serie; la fecha de autorización acompaña su referencia. Números alineados y tabulares, estados con color y texto, columnas de tipo/acciones fijas en escritorio y scroll interno en móvil.
- Los predeterminados mantienen 0 a 99999999999. El formulario sigue dentro de la página y el historial conserva sus campos.

Verificación de la actualización visual: `http://localhost:4302/contabilidad/e-ncf`, componente real con sesión/servicios de prueba. Sin errores ni advertencias de consola y sin respuestas HTTP >= 400 ni fallos de carga en recarga instrumentada. Se revisaron formulario sin campo empresa, escritorio, tema oscuro y móvil a 390 px (sin desbordamiento de página). El formulario y el historial reciben foco y se desplazan a la vista al abrirse. Kid Wow Check: PASS; Mom Comprehension Check: PASS. Evidencia: `tmp/ncf-preview/grid-moderno.jpg`, `grid-moderno-oscuro.jpg` y `formulario-moderno.jpg`. No se han aplicado cambios a Supabase real.

## Proforma interna E332

- Activación por empresa en Plataforma → Empresas y suscripciones → empresa → Suscripción. Solo el dueño de plataforma puede activar/desactivar. Allí también puede ajustar el contador de la empresa seleccionada.
- Desactivada por defecto. Solo la empresa habilitada ve E332 como primera fila del grid. Las antiguas filas alternas E332 no se presentan como secuencias fiscales ni habilitan automáticamente la función.
- El formulario E332 solo solicita el número actual (último utilizado), entre 0 y 99999999999. No requiere autorización, cantidades solicitadas/aceptadas ni vencimiento. Puede ajustarse hacia adelante o atrás; la próxima numeración es actual + 1.
- Configuración y contador se guardan en `empresas_proforma`, separados de `ncf_secuencias`. La migración conserva el contador de la antigua secuencia alterna si existe. Desactivar/reactivar conserva el contador.
- Ajustes protegidos por versión y bloqueo de fila; registro append-only de habilitaciones y ajustes en `empresas_proforma_historial`. En la pantalla operativa el RPC resuelve el tenant desde la sesión. Solo plataforma puede indicar explícitamente otra empresa.
- El envío e-CF rechaza tipos E332/332 antes de interpretar los primeros dos dígitos, para que una proforma no se interprete como tipo 33. Esta entrega agrega configuración y contador; la creación/impresión de facturas proforma aún no está conectada a este contador.
- Aplicar `20261016230000_company_proforma_e332.sql` después de la migración del registro e historial. No se ha aplicado a Supabase real.
- Verificación SQL: `node scripts/tests/proforma.test.mjs` (requiere PGlite instalado como en las pruebas anteriores), 18 comprobaciones: permisos de plataforma, aislamiento de empresa, ajuste hacia atrás, versión obsoleta, límites, historial y desactivar/reactivar sin perder numeración. Angular: 29 pruebas aprobadas.

Validación visual E332: `http://localhost:4302/contabilidad/e-ncf?proforma` y `http://localhost:4302/plataforma/empresas?proforma` con componente real y servicios de prueba. Verificado: E332 primero, formulario de solo contador, ajuste 145 → 90, interruptor por empresa y conservación del número al desactivar/reactivar. En la variante desactivada `/contabilidad/e-ncf` no existe la fila/acción E332; consola sin errores y recarga instrumentada sin respuestas HTTP >= 400 ni fallos de red. Evidencias: `tmp/ncf-preview/proforma-grid.jpg` y `tmp/ncf-preview/proforma-plataforma.jpg`. Kid Wow Check: PASS; Mom Comprehension Check: PASS. Ninguna prueba visual escribió en Supabase real.

## Edición y nuevas autorizaciones

- **Editar** modifica el mismo registro y conserva la versión anterior en el historial. En un rango ya utilizado se mantienen bloqueados Desde/Hasta, Aceptados y Utilizados para no reescribir numeraciones emitidas. Se pueden editar referencia, solicitados, fechas, estado y alerta; la explicación se muestra dentro del modal.
- **Agregar más** registra una nueva autorización de la misma empresa/serie, con referencia y fechas propias y utilizados en cero. Sugiere el inicio después del mayor rango registrado, sin copiar la autorización ni el contador anterior. El usuario confirma los límites reales autorizados. La nueva fila no reemplaza el registro anterior.
- Los errores y conflictos se presentan dentro del diálogo sin borrar lo escrito. No se permite cerrar mientras se guarda. El grid permanece visible detrás; en proforma solo se ajusta el contador y no se agregan rangos DGII.
- Aplicar `20261019140000_ncf_use_available_ranges_in_order.sql`: el emisor consume primero los números disponibles del rango activo de menor inicio y continúa con el siguiente cuando se agota. Excluye rangos vencidos y conserva bloqueo transaccional; agregar una autorización no salta el remanente de la anterior.

Verificación UX: acciones visibles «Editar»/«Agregar más» con iconos distintos; formulario separado por intención, nota de campos protegidos y guardado explícito. Kid Wow Check y Mom Comprehension Check deben verificarse con el grid y ambos diálogos en vista clara, oscura y móvil.
