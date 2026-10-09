import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const decimal = (value: unknown): string => Number(value ?? 0).toFixed(2);
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const digits = (value: string | null | undefined, length: number): string => (value ?? '').match(new RegExp(`\\d{${length}}`))?.[0] ?? '';
const issueDate = (value: string): string => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB').replaceAll('/', '-');

function byteaToBase64(value: string): string {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }

async function decryptPassword(value: string): Promise<string> {
  const secret = Deno.env.get('ECF_ENCRYPTION_KEY') ?? Deno.env.get('JWT_SECRET');
  if (!secret) throw new Error('No está configurada la clave de protección para el certificado digital.');
  const [ivText, dataText] = value.split('.');
  if (!ivText || !dataText) throw new Error('La clave del certificado no tiene un formato válido.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivText) }, key, base64ToBytes(dataText));
  return new TextDecoder().decode(decoded);
}

function timestampFromResponse(value: unknown): string | null {
  if (!value) return null;
  const dominicanDate = String(value).match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
  if (dominicanDate) return new Date(`${dominicanDate[3]}-${dominicanDate[2]}-${dominicanDate[1]}T${dominicanDate[4] ?? '00:00:00'}`).toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401);

    const { creditNoteId } = await request.json();
    const noteId = Number(creditNoteId);
    if (!Number.isSafeInteger(noteId) || noteId <= 0) return json({ error: 'Indica una nota de crédito válida para enviar.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
    const { data: user } = await admin.from('usuarios').select('empresa_id, sucursal_id').eq('auth_usuario_id', authData.user.id).eq('estado', 'Activo').single();
    if (!user?.empresa_id || !user.sucursal_id) return json({ error: 'El usuario no tiene una empresa y sucursal activas.' }, 403);

    const { data: note } = await admin.from('notas_credito').select('id, idempres, idsucursal, encf_nota, encf_afectado, fecha_comprobante_afectado, fecha_emision, cliente_rnc, cliente_nombre, subtotal, itbis, total, codigo_modificacion, tipo_ingreso, forma_pago, motivo, estado_dgii, dgii_intentos').eq('id', noteId).eq('idempres', user.empresa_id).eq('idsucursal', user.sucursal_id).single();
    if (!note) return json({ error: 'No se encontró la nota de crédito de la empresa y sucursal actual.' }, 404);
    if (['Aceptado', 'Aceptado condicional'].includes(note.estado_dgii)) return json({ error: 'La nota de crédito ya fue aceptada por DGII y no puede reenviarse.' }, 409);
    if (!note.encf_afectado) return json({ error: 'La nota de crédito debe indicar el e-NCF afectado.' }, 400);

    const [{ data: company }, { data: config }, { data: certificate }, { data: lines }] = await Promise.all([
      admin.from('empresas').select('rnc, razon_social, direccion').eq('id', user.empresa_id).single(),
      admin.from('ecf_configuraciones').select('ambiente, url_base, tipo_ingreso, persistir_certificado').eq('empresa_id', user.empresa_id).single(),
      admin.from('certificados_firma_digital').select('archivo, clave_cifrada').eq('empresa_id', user.empresa_id).single(),
      admin.from('nota_credito_detalles').select('id, descripcion, cantidad, precio_unitario, descuento_porcentaje, total_linea, tasa_itbis').eq('nota_credito_id', note.id).order('id')
    ]);
    if (!lines?.length) return json({ error: 'La nota de crédito no tiene detalles para transmitir.' }, 400);
    if (!company?.rnc || !company.razon_social) return json({ error: 'Completa el RNC y la razón social de la empresa.' }, 400);
    if (!config) return json({ error: 'Falta la configuración e-CF de la empresa.' }, 400);
    if (!certificate?.archivo || !certificate.clave_cifrada) return json({ error: 'Carga el certificado digital y su clave antes de enviar.' }, 400);

    const { data: sequenceRows, error: counterError } = await admin.rpc('siguiente_encf_desde_secuencia_ncf_con_vencimiento', { p_empresa_id: user.empresa_id, p_tipo_ncf: '34' });
    const sequence = Array.isArray(sequenceRows) ? sequenceRows[0] : sequenceRows;
    const encf = sequence?.encf as string | undefined;
    if (counterError || !encf) throw counterError ?? new Error('No se pudo generar el e-NCF de la nota de crédito desde la secuencia NCF autorizada.');
    const sequenceExpiry = sequence?.fecha_vencimiento as string | undefined;
    if (!sequenceExpiry) throw new Error('La secuencia NCF no tiene una fecha de vencimiento válida.');
    const sequenceAlert = sequence?.mensaje_alerta as string | null | undefined;

    const modifiedDate = note.fecha_comprobante_afectado ? issueDate(note.fecha_comprobante_afectado) : '';
    const modificationCode = digits(note.codigo_modificacion, 1) || '3';
    const incomeType = digits(note.tipo_ingreso, 2) || config.tipo_ingreso;
    const paymentCode = /cr[eé]dito/i.test(note.forma_pago ?? '') ? '2' : '1';
    const affectedAge = note.fecha_comprobante_afectado ? Math.floor((new Date(`${note.fecha_emision}T12:00:00`).getTime() - new Date(`${note.fecha_comprobante_afectado}T12:00:00`).getTime()) / 86400000) : 0;
    const scenario: Record<string, string> = {
      Version: '1.0', TipoeCF: '34', ENCF: encf, FechaVencimientoSecuencia: issueDate(sequenceExpiry), RNCEmisor: company.rnc, RazonSocialEmisor: company.razon_social,
      DireccionEmisor: company.direccion ?? '', FechaEmision: issueDate(note.fecha_emision), TipoIngresos: incomeType,
      TipoPago: paymentCode, RNCComprador: note.cliente_rnc ?? '', RazonSocialComprador: note.cliente_nombre ?? '',
      IndicadorMontoGravado: '0',
      MontoExento: '0.00', MontoGravadoTotal: decimal(note.subtotal), MontoGravadoI1: decimal(note.subtotal), ITBIS1: '18',
      TotalITBIS: decimal(note.itbis), TotalITBIS1: decimal(note.itbis), MontoTotal: decimal(note.total),
      NCFModificado: note.encf_afectado, CodigoModificacion: modificationCode, RazonModificacion: note.motivo,
      IndicadorNotaCredito: affectedAge > 30 ? '1' : '0'
    };
    if (modifiedDate) scenario.FechaNCFModificado = modifiedDate;
    if (config.ambiente === 'TEST') scenario.CasoPrueba = `${company.rnc}${encf}`;
    lines.forEach((line: Record<string, unknown>, index: number) => {
      const lineNumber = index + 1;
      const subtotal = Number(line.total_linea ?? 0);
      const discount = Number(line.descuento_porcentaje ?? 0);
      scenario[`NumeroLinea[${lineNumber}]`] = String(lineNumber);
      scenario[`IndicadorFacturacion[${lineNumber}]`] = '1';
      scenario[`NombreItem[${lineNumber}]`] = String(line.descripcion ?? 'ITEM');
      scenario[`IndicadorBienoServicio[${lineNumber}]`] = '1';
      scenario[`CantidadItem[${lineNumber}]`] = decimal(line.cantidad);
      scenario[`PrecioUnitarioItem[${lineNumber}]`] = decimal(line.precio_unitario);
      scenario[`MontoItem[${lineNumber}]`] = decimal(subtotal);
      if (discount > 0) scenario[`DescuentoMonto[${lineNumber}]`] = decimal(Number(line.cantidad ?? 0) * Number(line.precio_unitario ?? 0) * discount / 100);
    });

    const requestJson = { scenarios: [scenario] };
    const endpoint = `${String(config.url_base).replace(/\/+$/, '')}/api/${String(config.ambiente).toLowerCase()}/test-body-direct-cert`;
    const remote = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cert-p12-b64': byteaToBase64(certificate.archivo), 'x-cert-password': await decryptPassword(certificate.clave_cifrada), 'x-cert-rnc': company.rnc, 'x-cert-persist': String(config.persistir_certificado) },
      body: JSON.stringify(requestJson)
    });
    const raw = await remote.text();
    let response: Record<string, unknown> = {};
    try { response = JSON.parse(raw); } catch { response = { raw }; }
    const responseData = asRecord(response.data);
    const responsePayload = asRecord(responseData.data);
    const results = Array.isArray(responsePayload.results) ? responsePayload.results : Array.isArray(responseData.results) ? responseData.results : Array.isArray(response.results) ? response.results : [];
    const result = asRecord(results[0]);
    const responseRfce = asRecord(result.responseRFCE);
    const dgiiResponse = asRecord(responseRfce.dgiiResponse);
    const ecfDgii = asRecord(result.ecfDgii);
    const rfceDgii = asRecord(result.rfceDgii);
    const externalStatus = String(dgiiResponse.estado ?? ecfDgii.estado ?? rfceDgii.estado ?? result.ecfEstado ?? result.rfceEstado ?? response.estado ?? response.status ?? '');
    const state = !remote.ok || /error/i.test(externalStatus) ? 'Error' : /rechaz/i.test(externalStatus) ? 'Rechazado' : /condicional/i.test(externalStatus) ? 'Aceptado condicional' : /acept/i.test(externalStatus) ? 'Aceptado' : 'Enviado';
    const remoteMessage = String(dgiiResponse.mensaje ?? ecfDgii.mensaje ?? rfceDgii.mensaje ?? responseData.message ?? response.message ?? response.mensaje ?? response.detail ?? (remote.ok ? 'Nota de crédito enviada al servicio e-CF.' : 'El servicio e-CF rechazó la solicitud.'));
    const message = sequenceAlert ? `${remoteMessage} ${sequenceAlert}` : remoteMessage;
    const trackId = String(dgiiResponse.trackId ?? ecfDgii.trackId ?? rfceDgii.trackId ?? result.trackId ?? response.trackId ?? response.TrackId ?? response.track_id ?? '') || null;
    const code = String(dgiiResponse.codigo ?? ecfDgii.codigo ?? rfceDgii.codigo ?? result.ecfCodigo ?? result.rfceCodigo ?? response.code ?? response.codigo ?? remote.status);
    const securityCode = String(responseRfce.codigoSeguridad ?? responseRfce.codigoSeguridadeCF ?? asRecord(result.rfceInfo).codigoSeguridad ?? asRecord(result.ecfInfo).codigoSeguridad ?? result.codigoSeguridadeCF ?? response.codSeguridad ?? response.codigoSeguridad ?? '') || null;
    const qrLink = String(responseRfce.qrUrl ?? asRecord(result.rfceInfo).qrUrl ?? asRecord(result.ecfInfo).qrUrl ?? result.link_original ?? response.qr_link ?? response.qrLink ?? '') || null;
    const signatureDate = timestampFromResponse(responseRfce.fechaHoraFirma ?? asRecord(result.rfceInfo).fechaHoraFirma ?? asRecord(result.ecfInfo).fechaHoraFirma ?? result.fechaHoraFirmaRFCE ?? response.fec_firma ?? response.fechaFirma);
    const responseMessages = dgiiResponse.mensajes ?? ecfDgii.mensajes ?? rfceDgii.mensajes ?? response.mensajes ?? response.messages ?? response.errores ?? response.errors ?? null;
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from('notas_credito').update({ encf_nota: encf, fecha_vencimiento_secuencia: sequenceExpiry, ecf_ambiente: config.ambiente, estado_dgii: state, estado_envio_dgii: state, dgii_track_id: trackId, dgii_codigo: code, dgii_codigo_seguridad: securityCode, qr_link: qrLink, fec_firma: signatureDate, dgii_mensaje_respuesta: message, dgii_request_json: requestJson, dgii_response_json: response, dgii_response_raw: raw, dgii_mensajes: responseMessages, dgii_error_message: remote.ok ? null : message, dgii_enviado_en: now, dgii_updated_at: now, dgii_intentos: Number(note.dgii_intentos ?? 0) + 1 }).eq('id', note.id);
    if (updateError) throw updateError;
    return json({ id: note.id, encf, dgii_estado: state, dgii_track_id: trackId, dgii_codigo_seguridad: securityCode, dgii_mensaje_respuesta: message }, remote.ok ? 200 : 502);
  } catch (error) {
    console.error('enviar-nota-credito-ecf', error);
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar la nota de crédito.' }, 500);
  }
});
