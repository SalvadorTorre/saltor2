import { directSignatureEndpoint, endpoint, parseResult, payload, PENDING, serviceBase, STATES, TERMINAL, type DocumentKind } from './ecf-queue.ts';
// Supabase's Edge client is injected so this module shares the caller's schema and service role.
type Db = any;
export interface Operation {
  id: string; tipo: DocumentKind; documento_id: number; empresa_id: number; sucursal_id: number;
  encf: string; fecha_vencimiento: string | null; ambiente: string; url_base: string;
  modo: 'FIRMA' | 'COLA'; status: string; operation_id: string | null; resultado: Record<string, any>;
  claimed?: boolean; creado_en?: string;
}
export function operationResult(op: Operation): any {
  return { ...op.resultado, id: op.documento_id, ncf: op.encf, encf: op.encf,
    ecf_operation_id: op.operation_id, ecf_queue_status: op.status,
    dgii_estado: STATES[op.status], estado_dgii: STATES[op.status],
    dgii_mensaje_respuesta: op.resultado.dgii_mensaje_respuesta ?? STATES[op.status],
    dgii_codigo_seguridad: op.resultado.codSeguridad ?? null };
}
export async function reserveOperation(db: Db, kind: DocumentKind, id: number, user: any, type: string, config: any): Promise<Operation> {
  const { data, error } = await db.rpc('reservar_operacion_ecf', {
    p_tipo: kind, p_documento_id: id, p_empresa_id: user.empresa_id, p_sucursal_id: user.sucursal_id,
    p_tipo_ecf: type, p_ambiente: String(config.ambiente).toUpperCase(), p_url_base: serviceBase(config.url_base)
  });
  if (error) throw new Error(error.message ?? 'No se pudo guardar la operación e-CF.');
  return data as Operation;
}
export async function saveResult(db: Db, op: Operation, status: string, result: any, request?: unknown): Promise<Operation> {
  const { data, error } = await db.rpc('guardar_resultado_ecf', {
    p_id: op.id, p_status: status, p_resultado: result, p_solicitud: request ?? null
  });
  if (error) throw new Error(error.message ?? 'No se pudo guardar la operación e-CF.');
  return data as Operation;
}
export async function submitOperation(db: Db, op: Operation, scenario: Record<string, string>, headers: Record<string, string>): Promise<any> {
  if (!op.claimed) return operationResult(op);
  // El servicio de firma de proformas recibe un escenario directo; la cola
  // de DGII conserva el sobre scenarios[] usado por su endpoint.
  const body = op.modo === 'FIRMA' ? scenario : { scenarios: [scenario] };
  // La reclamación SQL ya bloquea otros POST. Guardar el payload antes del HTTP conserva trazabilidad.
  await saveResult(db, op, 'ENVIANDO_SERVICIO', { dgii_estado: 'Preparando envío' }, body);
  if (op.modo === 'COLA') headers['x-cert-persist'] = 'true';
  else delete headers['x-cert-persist'];
  let response: Response; let raw: string; let data: unknown;
  try {
    const url = op.modo === 'FIRMA'
      ? directSignatureEndpoint(op.url_base, op.ambiente)
      : endpoint(op.url_base, op.ambiente, false);
    response = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000)
    });
    raw = await response.text();
    try { data = JSON.parse(raw); } catch { data = { raw }; }
  } catch {
    // La red puede fallar después de que el servidor recibió la factura: nunca reencolar automáticamente.
    const message = 'No se pudo confirmar la recepción. Verifica la operación en el servicio antes de reenviar.';
    return operationResult(await saveResult(db, op, 'ENVIO_INCIERTO', {
      dgii_estado: STATES.ENVIO_INCIERTO, dgii_mensaje_respuesta: message, dgii_error_message: message
    }));
  }
  const p = payload(data);
  let status: string;
  if (op.modo === 'FIRMA') {
    // Los distintos proveedores pueden devolver el XML firmado dentro de
    // responseXML, responseRFCE o en el resultado principal.
    const signedXml = parseResult(data, 'FIRMADA', raw).ecf_xml_firmado;
    status = response.ok && typeof signedXml === 'string' && signedXml.trim() ? 'FIRMADA' : response.ok ? 'ENVIO_INCIERTO' : 'ERROR';
  } else if (response.status === 202 && p.operationId) {
    status = PENDING.includes(String(p.status)) ? String(p.status) : 'EN_COLA';
  } else {
    // Incluso un 5xx podría ocurrir después de insertar en la cola.
    status = response.status >= 400 && response.status < 500 ? 'ERROR' : 'ENVIO_INCIERTO';
  }
  const result = parseResult(data, status, raw);
  if (op.modo === 'FIRMA') { result.ecf_operation_id = null; result.dgii_track_id = null; }
  return operationResult(await saveResult(db, op, status, result));
}
export async function queryOperation(db: Db, op: Operation): Promise<any> {
  if (['PREPARANDO', 'ENVIANDO_SERVICIO'].includes(op.status) && op.creado_en && Date.now() - Date.parse(op.creado_en) > 180_000) {
    return operationResult(await saveResult(db, op, 'ENVIO_INCIERTO', { dgii_estado: STATES.ENVIO_INCIERTO, dgii_mensaje_respuesta: 'El intento quedó sin confirmación. Revisa el servicio antes de reenviar.' }));
  }
  if (!op.operation_id || op.modo !== 'COLA' || TERMINAL.includes(op.status)) return operationResult(op);
  const response = await fetch(endpoint(op.url_base, op.ambiente, false, op.operation_id), { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`No se pudo consultar la cola (HTTP ${response.status}). Se conservará la operación.`);
  const raw = await response.text(); const data = JSON.parse(raw); const status = String(payload(data).status ?? '');
  if (![...PENDING, 'ACEPTADO', 'RECHAZADO', 'ERROR'].includes(status)) throw new Error('La cola devolvió un estado desconocido; se conservará el último estado.');
  return operationResult(await saveResult(db, op, status, parseResult(data, status, raw)));
}
