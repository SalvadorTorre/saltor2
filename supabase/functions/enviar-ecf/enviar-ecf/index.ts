import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4201', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => {
  if (status >= 400) console.error('enviar-ecf respuesta', body);
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
};
const typeCode = (value: string | null): string => (value ?? '').match(/\d{2}/)?.[0] ?? '';
const decimal = (value: unknown): string => Number(value ?? 0).toFixed(2);
const timestampFromResponse = (value: unknown): string | null => {
  if (!value) return null;
  const dominicanDate = String(value).match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
  if (dominicanDate) return new Date(`${dominicanDate[3]}-${dominicanDate[2]}-${dominicanDate[1]}T${dominicanDate[4] ?? '00:00:00'}`).toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function byteaToBase64(value: string): string { const hex = value.startsWith('\\x') ? value.slice(2) : value; let binary = ''; for (let i = 0; i < hex.length; i += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16)); return btoa(binary); }
function base64ToBytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
async function decryptPassword(value: string): Promise<string> { const secret = Deno.env.get('JWT_SECRET'); if (!secret) throw new Error('No está disponible la clave de protección del servidor.'); const [ivText, dataText] = value.split('.'); if (!ivText || !dataText) throw new Error('La clave del certificado no tiene un formato válido.'); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']); const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivText) }, key, base64ToBytes(dataText)); return new TextDecoder().decode(decoded); }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401);
    const body = await request.json();
    const invoiceId = Number(body.invoiceId);
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return json({ error: 'Indica una factura válida para enviar.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
    const { data: user } = await admin.from('usuarios').select('empresa_id, sucursal_id').eq('auth_usuario_id', authData.user.id).eq('estado', 'Activo').single();
    if (!user) return json({ error: 'El usuario no tiene una empresa activa.' }, 403);
    const { data: invoice } = await admin.from('facturas').select('id, idempres, idsucursal, fecha_factura, tipo_ncf, cliente_rnc, cliente_nombre, cliente_direccion, subtotal, itbis, total, forma_pago_codigo, dgii_estado, estado, dgii_intentos').eq('id', invoiceId).eq('idempres', user.empresa_id).eq('idsucursal', user.sucursal_id).single();
    if (!invoice) return json({ error: 'No se encontró la factura de la empresa y sucursal actual.' }, 404);
    if (invoice.estado === 'Anulada' || invoice.dgii_estado === 'Aceptado') return json({ error: 'La factura no puede enviarse en su estado actual.' }, 409);
    const tipoEcf = typeCode(invoice.tipo_ncf);
    if (!tipoEcf) return json({ error: 'La factura no tiene un tipo e-CF válido.' }, 400);
    const [{ data: company }, { data: config }, { data: certificate }, { data: lines }] = await Promise.all([
      admin.from('empresas').select('rnc, razon_social, direccion').eq('id', user.empresa_id).single(),
      admin.from('ecf_configuraciones').select('ambiente, url_base, tipo_ingreso, persistir_certificado').eq('empresa_id', user.empresa_id).single(),
      admin.from('certificados_firma_digital').select('archivo, clave_cifrada').eq('empresa_id', user.empresa_id).single(),
      admin.from('factura_detalles').select('id, descripcion, cantidad, precio_unitario, total_linea, tasa_itbis').eq('factura_id', invoice.id).order('id')
    ]);
    if (!lines?.length) return json({ error: 'La factura no tiene detalles para transmitir.' }, 400);
    if (!company?.rnc || !company.razon_social) return json({ error: 'Completa el RNC y la razón social de la empresa.' }, 400);
    if (!config) return json({ error: 'Falta la configuración e-CF de la empresa.' }, 400);
    if (!certificate?.archivo || !certificate.clave_cifrada) return json({ error: 'Vuelve a cargar el certificado con su clave para habilitar el envío automático.' }, 400);
    const { data: sequenceRows, error: counterError } = await admin.rpc('siguiente_encf_desde_secuencia_ncf_con_vencimiento', { p_empresa_id: user.empresa_id, p_tipo_ncf: tipoEcf });
    const sequence = Array.isArray(sequenceRows) ? sequenceRows[0] : sequenceRows;
    const encf = sequence?.encf as string | undefined;
    if (counterError || !encf) throw counterError ?? new Error('No se pudo generar el e-NCF desde la secuencia NCF autorizada.');
    const sequenceExpiry = sequence?.fecha_vencimiento as string | undefined;
    if (!sequenceExpiry) throw new Error('La secuencia NCF no tiene una fecha de vencimiento válida.');
    const sequenceAlert = sequence?.mensaje_alerta as string | null | undefined;

    const issueDate = new Date(`${invoice.fecha_factura}T12:00:00`).toLocaleDateString('en-GB').replaceAll('/', '-');
    const sequenceExpiryDate = new Date(`${sequenceExpiry}T12:00:00`).toLocaleDateString('en-GB').replaceAll('/', '-');
    const scenario: Record<string, string> = { Version: '1.0', TipoeCF: tipoEcf, ENCF: encf, FechaVencimientoSecuencia: sequenceExpiryDate, RNCEmisor: company.rnc, RazonSocialEmisor: company.razon_social, DireccionEmisor: company.direccion ?? '', FechaEmision: issueDate, TipoIngresos: config.tipo_ingreso, TipoPago: String(invoice.forma_pago_codigo ?? 1), RNCComprador: invoice.cliente_rnc ?? '', RazonSocialComprador: invoice.cliente_nombre ?? '', MontoExento: '0.00', MontoGravadoTotal: decimal(invoice.subtotal), MontoGravadoI1: decimal(invoice.subtotal), ITBIS1: '18', TotalITBIS: decimal(invoice.itbis), TotalITBIS1: decimal(invoice.itbis), MontoTotal: decimal(invoice.total) };
    if (config.ambiente === 'TEST') scenario.CasoPrueba = `${company.rnc}${encf}`;
    lines.forEach((line: Record<string, unknown>, index: number) => {
      const n = index + 1;
      const rate = Number(line.tasa_itbis ?? 0);
      const divisor = rate > 0 ? 1 + (rate / 100) : 1;
      scenario[`NumeroLinea[${n}]`] = String(n);
      scenario[`IndicadorFacturacion[${n}]`] = '1';
      scenario[`NombreItem[${n}]`] = String(line.descripcion ?? 'ITEM');
      scenario[`IndicadorBienoServicio[${n}]`] = '1';
      scenario[`CantidadItem[${n}]`] = decimal(line.cantidad);
      scenario[`PrecioUnitarioItem[${n}]`] = decimal(Number(line.precio_unitario ?? 0) / divisor);
      scenario[`MontoItem[${n}]`] = decimal(Number(line.total_linea ?? 0) / divisor);
    });
    const endpoint = `${String(config.url_base).replace(/\/+$/, '')}/api/${String(config.ambiente).toLowerCase()}/test-body-direct-cert`;
    const requestJson = { scenarios: [scenario] };
    const remote = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cert-p12-b64': byteaToBase64(certificate.archivo), 'x-cert-password': await decryptPassword(certificate.clave_cifrada), 'x-cert-rnc': company.rnc, 'x-cert-persist': String(config.persistir_certificado) }, body: JSON.stringify(requestJson) });
    const raw = await remote.text(); let response: Record<string, unknown> = {}; try { response = JSON.parse(raw); } catch { response = { raw }; }
    const responseData = asRecord(response.data);
    const responsePayload = asRecord(responseData.data);
    const results = Array.isArray(responsePayload.results) ? responsePayload.results
      : Array.isArray(responseData.results) ? responseData.results
        : Array.isArray(response.results) ? response.results : [];
    const result = asRecord(results[0]);
    const responseXml = asRecord(result.responseXML);
    const responseRfce = asRecord(result.responseRFCE);
    const ecfInfo = asRecord(result.ecfInfo);
    const rfceInfo = asRecord(result.rfceInfo);
    const dgiiResponse = asRecord(responseRfce.dgiiResponse);
    const ecfDgii = asRecord(result.ecfDgii);
    const rfceDgii = asRecord(result.rfceDgii);
    const externalStatus = String(dgiiResponse.estado ?? ecfDgii.estado ?? rfceDgii.estado ?? result.ecfEstado ?? result.rfceEstado ?? response.estado ?? response.status ?? '');
    const state = !remote.ok || /error/i.test(externalStatus) ? 'Error'
      : /rechaz/i.test(externalStatus) ? 'Rechazado'
        : /condicional/i.test(externalStatus) ? 'Aceptado condicional'
          : /acept/i.test(externalStatus) ? 'Aceptado' : 'Enviado';
    const remoteMessage = String(dgiiResponse.mensaje ?? ecfDgii.mensaje ?? rfceDgii.mensaje ?? responseData.message ?? response.message ?? response.mensaje ?? response.detail ?? (remote.ok ? 'Factura enviada al servicio e-CF.' : 'El servicio e-CF rechazó la solicitud.'));
    const message = sequenceAlert ? `${remoteMessage} ${sequenceAlert}` : remoteMessage;
    const estadoDgii = state;
    const trackId = String(dgiiResponse.trackId ?? ecfDgii.trackId ?? rfceDgii.trackId ?? result.trackId ?? response.trackId ?? response.TrackId ?? response.track_id ?? '') || null;
    const code = String(dgiiResponse.codigo ?? ecfDgii.codigo ?? rfceDgii.codigo ?? result.ecfCodigo ?? result.rfceCodigo ?? response.code ?? response.codigo ?? response.dgii_codigo ?? remote.status);
    const securityCode = String(responseRfce.codigoSeguridad ?? responseRfce.codigoSeguridadeCF ?? rfceInfo.codigoSeguridad ?? rfceInfo.codigoSeguridadeCF ?? ecfInfo.codigoSeguridad ?? ecfInfo.codigoSeguridadeCF ?? responseXml.codigoSeguridad ?? responseXml.codigoSeguridadeCF ?? result.codigoSeguridadeCF ?? response.codSeguridad ?? response.cod_seguridad ?? response.codigoSeguridad ?? '') || null;
    const qrLink = String(responseRfce.qrUrl ?? rfceInfo.qrUrl ?? ecfInfo.qrUrl ?? responseXml.qrUrl ?? result.link_original ?? response.qr_link ?? response.qrLink ?? response.enlace_qr ?? response.enlaceQR ?? '') || null;
    const signatureDate = timestampFromResponse(responseRfce.fechaHoraFirma ?? rfceInfo.fechaHoraFirma ?? ecfInfo.fechaHoraFirma ?? responseXml.fechaHoraFirma ?? result.fechaHoraFirmaRFCE ?? response.fec_firma ?? response.fecFirma ?? response.fecha_firma ?? response.fechaFirma);
    const responseMessages = dgiiResponse.mensajes ?? ecfDgii.mensajes ?? rfceDgii.mensajes ?? response.mensajes ?? response.messages ?? response.errores ?? response.errors ?? null;
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from('facturas').update({ ncf: encf, ecf_ambiente: config.ambiente, dgii_estado: state, dgii_track_id: trackId, dgii_codigo_respuesta: code, dgii_mensaje_respuesta: message, dgii_respuesta: response, dgii_enviado_en: now, fechanf: now, dgii_intentos: Number(invoice.dgii_intentos ?? 0) + 1, estado_dgii: estadoDgii, codSeguridad: securityCode, qr_link: qrLink, fec_firma: signatureDate, estado_envio_dgii: state, dgii_request_json: requestJson, dgii_response_json: response, dgii_response_raw: raw, dgii_mensajes: responseMessages, dgii_error_message: remote.ok ? null : message, dgii_codigo: code, dgii_updated_at: now }).eq('id', invoice.id);
    if (updateError) throw updateError;
    return json({ id: invoice.id, dgii_estado: state, ncf: encf, dgii_mensaje_respuesta: message, dgii_respuesta: response }, remote.ok ? 200 : 502);
  } catch (error) { console.error('enviar-ecf', error); return json({ error: error instanceof Error ? error.message : 'No se pudo enviar la factura.' }, 500); }
});
