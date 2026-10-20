# Revisión de secuencias: editar y agregar autorizaciones

## Evaluación UX

El grid mantiene todos los tipos y los rangos históricos. Se corrigieron la poca visibilidad del formulario en línea y la confusión entre modificar un registro y añadir otro. Cada fila real muestra «Editar», «Agregar más» e historial; la proforma ofrece solo su contador. Los iconos de lápiz y suma acompañan etiquetas visibles.

Editar conserva la identidad del registro. La nota del modal explica qué campos se mantienen protegidos cuando ya se utilizaron números; autorización, fechas, solicitados, estado y alerta siguen editables. Agregar más abre un registro independiente del mismo tipo, sugiere el siguiente inicio y solicita los límites reales autorizados. No copia referencia ni utilizados. Los errores permanecen dentro del modal.

## Impacto de especificación e implementación

Especificación funcional: `docs/ncf-sequence-register.md`. Componente: `src/app/ncf/ncf-page/`. Diálogo HTML nativo con foco contenido, Escape, retorno al disparador y cierre bloqueado durante guardado. Se evita reprogramar la apertura en cada refresco de consultas de Angular; las filas conservan identidad por ID/serie. La capa superior aplica explícitamente el tratamiento del tema oscuro global. Formularios compactos de cuatro columnas en escritorio y dos en móvil, con scroll propio y pie de acciones accesible.

Los contratos de crear y actualizar se conservan: crear inserta otra solicitud; editar envía ID, empresa de sesión, contador esperado y versión de actualización. El historial no se sobrescribe. La migración `20261019140000_ncf_use_available_ranges_in_order.sql` mantiene el consumo del rango activo de menor inicio antes de pasar al siguiente. Las pruebas SQL cubren remanentes, agotamiento, exclusión de vencidos, concurrencia y aislamiento de empresa.

## Verificación ejecutada

URL exacta: `http://localhost:4302/contabilidad/e-ncf?proforma&fixed`.
Variante oscura: `http://localhost:4302/contabilidad/e-ncf?proforma&dark`.
Se usaron servicios simulados en un workspace aislado; no se guardaron autorizaciones en una base real.

- Abrir editar, cambiar vencimiento y guardar: conserva el número actual E310000000524.
- Abrir agregar: referencia nueva vacía, mismo E31, inicio sugerido 1001 y utilizados cero.
- Escape/cerrar y Tab dentro del modal; tamaños de escritorio y 390 × 844; viewport restaurado.
- Consola: sin errores en la vista corregida.
- Red: siete respuestas observadas, sin respuestas fuera de 2xx ni errores de carga. Las llamadas de datos están simuladas, por lo que esto no valida el despliegue remoto.
- Artefactos locales: `tmp/ncf-preview/editar-secuencia-modal.jpg`, `agregar-autorizacion-modal.jpg`, `modal-movil.jpg`, `modal-oscuro.jpg`.

Kid Wow Check: **PASS**. Acción y estado visibles sin depender del color.
Mom Comprehension Check: **PASS**. «Editar» cambia ese registro; «Agregar más» conserva el anterior y registra otra autorización.

Pendiente para activación real: aplicar las migraciones nuevas y publicar el frontend. La verificación local no sustituye la comprobación del despliegue contra el backend real.
