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
export function directSignatureEndpoint(base: string, environment: string): string {
  const env = environment.toLowerCase();
  if (!['test', 'prod'].includes(env)) throw new Error('Ambiente e-CF inválido.');
  // El intermediario e-CF instalado publica esta ruta bajo /api. Firma el
  // XML con el certificado recibido, pero no lo transmite a la DGII.
  return `${serviceBase(base)}/api/${env}/generate-xml-no-send-direct-cert`;
}
export const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export function payload(value: unknown): Record<string, any> {
  const root = record(value); const data = record(root.data); const nested = record(data.data);
  const results = nested.results ?? data.results ?? root.results;
  return { ...root, ...data, ...nested, ...record(Array.isArray(results) ? results[0] : undefined) };
}
function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}
function errorText(value: unknown): string | null {
  const error = record(value);
  return firstText(error.message, error.detail, typeof value === 'string' ? value : null);
}
function messageFromHtmlError(raw: string): string | null {
  const match = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match?.[1]) return null;
  const text = match[1]
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return text || null;
}
function signatureDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value); const m = s.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}:\d{2}:\d{2})$/);
  const d = new Date(m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}-04:00` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function parseResult(value: unknown, status: string, raw: string): Record<string, unknown> {
  const p = payload(value);
  const responseXml = record(p.responseXML ?? p.ecfInfo);
  const responseRfce = record(p.responseRFCE ?? p.rfceInfo);
  const xmls = record(p.xmls);
  const dgii = record(responseRfce.dgiiResponse ?? p.dgiiResponse ?? p.dgii);
  const messages = p.mensajes ?? p.messages ?? dgii.mensajes ?? null;
  const providerError = errorText(p.error) ?? errorText(record(value).error);
  const htmlError = messageFromHtmlError(raw);
  const signedXml = firstText(p.xmlFirmado, p.signedXml, responseXml.xmlFirmado, responseRfce.xmlFirmado, xmls.ecf);
  const securityCode = firstText(
    p.codigoSeguridad, p.codigoSeguridadeCF, p.codSeguridad, p.cod_seguridad, p.securityCode,
    responseRfce.codigoSeguridad, responseRfce.codigoSeguridadeCF,
    responseXml.codigoSeguridad, responseXml.codigoSeguridadeCF,
  );
  const qrLink = firstText(
    p.qrUrl, p.qr_link, p.qrLink, p.enlace_qr, p.enlaceQR,
    responseRfce.qrUrl, responseRfce.qrLink,
    responseXml.qrUrl, responseXml.qrLink,
  );
  const signedAt = signatureDate(firstText(
    p.fechaHoraFirma, p.fec_firma, p.fecFirma, p.fecha_firma, p.fechaFirma, p.signatureDateTime,
    responseRfce.fechaHoraFirma, responseXml.fechaHoraFirma,
  ));
  return {
    ecf_queue_status: status, ecf_operation_id: p.operationId ? String(p.operationId) : null,
    dgii_estado: STATES[status], estado_dgii: STATES[status],
    dgii_track_id: (p.trackId ?? dgii.trackId) ? String(p.trackId ?? dgii.trackId) : null,
    dgii_codigo_respuesta: (p.codigo ?? p.code ?? dgii.codigo) != null ? String(p.codigo ?? p.code ?? dgii.codigo) : null,
    dgii_mensaje_respuesta: String(providerError ?? p.mensaje ?? p.message ?? dgii.mensaje ?? p.detail ?? htmlError ?? (messages ? JSON.stringify(messages) : STATES[status])),
    codSeguridad: securityCode,
    qr_link: qrLink, fec_firma: signedAt,
    ecf_xml_firmado: signedXml,
    dgii_mensajes: messages, dgii_response_json: value, dgii_response_raw: raw,
    dgii_error_message: status === 'ERROR' || status === 'ENVIO_INCIERTO' ? String(providerError ?? p.mensaje ?? p.message ?? p.detail ?? htmlError ?? STATES[status]) : null
  };
}
