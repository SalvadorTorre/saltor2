/** Contrato del intermediario e-CF. Nunca confundir operationId con trackId de DGII. */
export type DocumentKind = 'FACTURA' | 'NOTA_CREDITO' | 'GASTO_MENOR';
export const PENDING = ['EN_COLA', 'ENVIANDO_DGII', 'EN_PROCESO_DGII'];
export const TERMINAL = ['ACEPTADO', 'RECHAZADO', 'ERROR', 'FIRMADA'];
export const STATES: Record<string, string> = {
  PREPARANDO: 'Preparando envío', ENVIANDO_SERVICIO: 'Preparando envío',
  ENVIO_INCIERTO: 'Envío por confirmar', EN_COLA: 'En cola', ENVIANDO_DGII: 'Enviando DGII',
  EN_PROCESO_DGII: 'En proceso DGII', ACEPTADO: 'Aceptado', RECHAZADO: 'Rechazado', ERROR: 'Error', FIRMADA: 'Firmada'
};
export function serviceBase(value: unknown): string {
  const url = new URL(String(value || 'https://ecf-propio.tail2c2b0a.ts.net/'));
  if (url.protocol !== 'https:') throw new Error('La URL del servicio e-CF debe usar HTTPS.');
  return url.toString().replace(/\/+$/, '').replace(/\/(?:ecf|api)(?:\/(?:test|prod))?$/i, '');
}
export function endpoint(base: string, environment: string, signOnly = false, operationId?: string): string {
  const env = environment.toLowerCase();
  if (!['test', 'prod'].includes(env)) throw new Error('Ambiente e-CF inválido.');
  return `${serviceBase(base)}/ecf/${env}/${operationId
    ? `operaciones-encoladas/${encodeURIComponent(operationId)}`
    : signOnly ? 'generate-xml-no-send-direct-cert' : 'firmar-y-encolar-direct-cert'}`;
}
export const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export function payload(value: unknown): Record<string, any> {
  const root = record(value); const data = record(root.data); const nested = record(data.data);
  const results = nested.results ?? data.results ?? root.results;
  return { ...root, ...data, ...nested, ...record(Array.isArray(results) ? results[0] : undefined) };
}
function signatureDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value); const m = s.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}:\d{2}:\d{2})$/);
  const d = new Date(m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}-04:00` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function parseResult(value: unknown, status: string, raw: string): Record<string, unknown> {
  const p = payload(value); const dgii = record(p.dgiiResponse ?? p.dgii);
  const info = record(p.responseXML ?? p.ecfInfo);
  const messages = p.mensajes ?? p.messages ?? dgii.mensajes ?? null;
  return {
    ecf_queue_status: status, ecf_operation_id: p.operationId ? String(p.operationId) : null,
    dgii_estado: STATES[status], estado_dgii: STATES[status],
    dgii_track_id: (p.trackId ?? dgii.trackId) ? String(p.trackId ?? dgii.trackId) : null,
    dgii_codigo_respuesta: (p.codigo ?? p.code ?? dgii.codigo) != null ? String(p.codigo ?? p.code ?? dgii.codigo) : null,
    dgii_mensaje_respuesta: String(p.mensaje ?? p.message ?? dgii.mensaje ?? p.detail ?? (typeof p.error === 'string' ? p.error : null) ?? (messages ? JSON.stringify(messages) : STATES[status])),
    codSeguridad: p.codigoSeguridad ?? info.codigoSeguridad ?? null,
    qr_link: p.qrUrl ?? info.qrUrl ?? null, fec_firma: signatureDate(p.fechaHoraFirma ?? info.fechaHoraFirma),
    ecf_xml_firmado: p.xmlFirmado ?? info.xmlFirmado ?? null,
    dgii_mensajes: messages, dgii_response_json: value, dgii_response_raw: raw,
    dgii_error_message: status === 'ERROR' || status === 'ENVIO_INCIERTO' ? String(p.mensaje ?? p.message ?? p.detail ?? (typeof p.error === 'string' ? p.error : null) ?? STATES[status]) : null
  };
}
