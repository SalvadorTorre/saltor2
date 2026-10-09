import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const decimal = (value: unknown): string => Number(value ?? 0).toFixed(2);
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const issueDate = (value: string): string => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB').replaceAll('/', '-');

function byteaToBase64(value: string): string {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

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

function paymentCode(value: string | null): string {
  if (/cr[eé]dito/i.test(value ?? '')) return '2';
  if (/gratuito/i.test(value ?? '')) return '3';
  return '1';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401);

    const { minorExpenseId } = await request.json();
    const expenseId = Number(minorExpenseId);
    if (!Number.isSafeInteger(expenseId) || expenseId <= 0) return json({ error: 'Indica un gasto menor válido para enviar.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
    const { data: user } = await admin.from('usuarios').select('empresa_id, sucursal_id').eq('auth_usuario_id', authData.user.id).eq('estado', 'Activo').single();
    if (!user?.empresa_id || !user.sucursal_id) return json({ error: 'El usuario no tiene una empresa y sucursal activas.' }, 403);

    const { data: expense } = await admin
      .from('gastos_menores')
      .select('id, idempres, idsucursal, fecha, beneficiario, monto_gravado, monto_exento, monto_itbis, total, forma_pago, concepto, estado_dgii, dgii_intentos')
      .eq('id', expenseId)
      .eq('idempres', user.empresa_id)
      .eq('idsucursal', user.sucursal_id)
      .single();
    if (!expense) return json({ error: 'No se encontró el gasto menor de la empresa y sucursal actual.' }, 404);
    if (['Aceptado', 'Aceptado condicional'].includes(expense.estado_dgii)) return json({ error: 'El gasto menor ya fue aceptado por DGII y no puede reenviarse.' }, 409);
    if (Number(expense.total ?? 0) <= 0) return json({ error: 'El gasto menor debe tener un total mayor que cero.' }, 400);

    const [{ data: company }, { data: config }, { data: certificate }] = await Promise.all([
      admin.from('empresas').select('rnc, razon_social, direccion').eq('id', user.empresa_id).single(),
      admin.from('ecf_configuraciones').select('ambiente, url_base, persistir_certificado').eq('empresa_id', user.empresa_id).single(),
      admin.from('certificados_firma_digital').select('archivo, clave_cifrada').eq('empresa_id', user.empresa_id).single()
    ]);
    if (!company?.rnc || !company.razon_social) return json({ error: 'Completa el RNC y la razón social de la empresa.' }, 400);
    if (!config?.ambiente || !config.url_base) return json({ error: 'Falta la configuración e-CF de la empresa.' }, 400);
    if (!certificate?.archivo || !certificate.clave_cifrada) return json({ error: 'Carga el certificado digital y su clave antes de enviar.' }, 400);

    const { data: sequenceRows, error: sequenceError } = await admin.rpc('siguiente_encf_desde_secuencia_ncf_con_vencimiento', {
      p_empresa_id: user.empresa_id,
      p_tipo_ncf: '43'
    });
    const sequence = Array.isArray(sequenceRows) ? sequenceRows[0] : sequenceRows;
    const encf = sequence?.encf as string | undefined;
    if (sequenceError || !encf) throw sequenceError ?? new Error('No se pudo generar el e-NCF E43 desde la secuencia autorizada.');
    const sequenceExpiry = sequence?.fecha_vencimiento as string | undefined;
    if (!sequenceExpiry) throw new Error('La secuencia E43 no tiene una fecha de vencimiento válida.');
    const sequenceAlert = sequence?.mensaje_alerta as string | null | undefined;

    // E43 (Gastos Menores) siempre se transmite como una línea exenta.
    const scenario: Record<string, string> = {
      Version: '1.0',
      TipoeCF: '43',
      ENCF: encf,
      FechaVencimientoSecuencia: issueDate(sequenceExpiry),
      IndicadorMontoGravado: '0',
      TipoPago: paymentCode(expense.forma_pago),
      RNCEmisor: company.rnc,
      RazonSocialEmisor: company.razon_social,
      DireccionEmisor: company.direccion ?? '',
      FechaEmision: issueDate(expense.fecha),
      RNCComprador: company.rnc,
      RazonSocialComprador: company.razon_social,
      MontoExento: decimal(expense.total),
      MontoGravadoTotal: '0.00',
      MontoGravadoI1: '0.00',
      ITBIS1: '18',
      TotalITBIS: '0.00',
      TotalITBIS1: '0.00',
      MontoTotal: decimal(expense.total),
      'NumeroLinea[1]': '1',
      'IndicadorFacturacion[1]': '4',
      'NombreItem[1]': String(expense.concept || expense.beneficiario || 'GASTO MENOR').slice(0, 80),
      'IndicadorBienoServicio[1]': '2',
      'CantidadItem[1]': '1.00',
      'PrecioUnitarioItem[1]': decimal(expense.total),
      'MontoItem[1]': decimal(expense.total)
    };
    if (String(config.ambiente).toUpperCase() === 'TEST') scenario.CasoPrueba = `${company.rnc}${encf}`;

    const requestJson = { scenarios: [scenario] };
    const endpoint = `${String(config.url_base).replace(/\/+$/, '')}/api/${String(config.ambiente).toLowerCase()}/test-body-direct-cert`;
    const remote = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cert-p12-b64': byteaToBase64(certificate.archivo),
        'x-cert-password': await decryptPassword(certificate.clave_cifrada),
        'x-cert-rnc': company.rnc,
        'x-cert-persist': String(config.persistir_certificado)
      },
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
    const remoteMessage = String(dgiiResponse.mensaje ?? ecfDgii.mensaje ?? rfceDgii.mensaje ?? responseData.message ?? response.message ?? response.mensaje ?? response.detail ?? (remote.ok ? 'Gasto menor enviado al servicio e-CF.' : 'El servicio e-CF rechazó la solicitud.'));
    const message = sequenceAlert ? `${remoteMessage} ${sequenceAlert}` : remoteMessage;
    const trackId = String(dgiiResponse.trackId ?? ecfDgii.trackId ?? rfceDgii.trackId ?? result.trackId ?? response.trackId ?? response.TrackId ?? response.track_id ?? '') || null;
    const code = String(dgiiResponse.codigo ?? ecfDgii.codigo ?? rfceDgii.codigo ?? result.ecfCodigo ?? result.rfceCodigo ?? response.code ?? response.codigo ?? remote.status);
    const securityCode = String(responseRfce.codigoSeguridad ?? responseRfce.codigoSeguridadeCF ?? asRecord(result.rfceInfo).codigoSeguridad ?? asRecord(result.ecfInfo).codigoSeguridad ?? result.codigoSeguridadeCF ?? response.codSeguridad ?? response.codigoSeguridad ?? '') || null;
    const qrLink = String(responseRfce.qrUrl ?? asRecord(result.rfceInfo).qrUrl ?? asRecord(result.ecfInfo).qrUrl ?? result.link_original ?? response.qr_link ?? response.qrLink ?? '') || null;
    const signatureDate = timestampFromResponse(responseRfce.fechaHoraFirma ?? asRecord(result.rfceInfo).fechaHoraFirma ?? asRecord(result.ecfInfo).fechaHoraFirma ?? result.fechaHoraFirmaRFCE ?? response.fec_firma ?? response.fechaFirma);
    const responseMessages = dgiiResponse.mensajes ?? ecfDgii.mensajes ?? rfceDgii.mensajes ?? response.mensajes ?? response.messages ?? response.errores ?? response.errors ?? null;
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from('gastos_menores').update({
      encf,
      fecha_vencimiento_secuencia: sequenceExpiry,
      ecf_ambiente: config.ambiente,
      estado_dgii: state,
      dgii_track_id: trackId,
      dgii_codigo: code,
      dgii_codigo_seguridad: securityCode,
      qr_link: qrLink,
      fec_firma: signatureDate,
      dgii_mensaje_respuesta: message,
      dgii_request_json: requestJson,
      dgii_response_json: response,
      dgii_response_raw: raw,
      dgii_mensajes: responseMessages,
      dgii_error_message: remote.ok ? null : message,
      dgii_enviado_en: now,
      dgii_updated_at: now,
      dgii_intentos: Number(expense.dgii_intentos ?? 0) + 1
    }).eq('id', expense.id);
    if (updateError) throw updateError;

    return json({ id: expense.id, encf, dgii_estado: state, dgii_track_id: trackId, dgii_codigo_seguridad: securityCode, dgii_mensaje_respuesta: message }, remote.ok ? 200 : 502);
  } catch (error) {
    console.error('enviar-gasto-menor-ecf', error);
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar el gasto menor.' }, 500);
  }
});
