import { reserveOperation, submitOperation, operationResult } from '../_shared/ecf-operation.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const decimal = (value: unknown): string => Number(value ?? 0).toFixed(2);
const issueDate = (value: string): string => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB').replaceAll('/', '-');

function byteaToBase64(value: string): string {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  return btoa(binary);
}

function base64ToBytes(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
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

    const certificatePassword = await decryptPassword(certificate.clave_cifrada);
    const operation = await reserveOperation(admin, 'GASTO_MENOR', expense.id, user, '43', config);
    if (!operation.claimed) return json(operationResult(operation));
    const encf = operation.encf;
    const sequenceExpiry = operation.fecha_vencimiento;

    // E43 (Gastos Menores) siempre se transmite como una línea exenta.
    const scenario: Record<string, string> = {
      Version: '1.0',
      TipoeCF: '43',
      ENCF: encf,
      FechaVencimientoSecuencia: issueDate(sequenceExpiry!),
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
      'NombreItem[1]': String(expense.concepto || expense.beneficiario || 'GASTO MENOR').slice(0, 80),
      'IndicadorBienoServicio[1]': '2',
      'CantidadItem[1]': '1.00',
      'PrecioUnitarioItem[1]': decimal(expense.total),
      'MontoItem[1]': decimal(expense.total)
    };
    if (String(config.ambiente).toUpperCase() === 'TEST') scenario.CasoPrueba = `${company.rnc}${encf}`;

    const result = await submitOperation(admin, operation, scenario, {
      'Content-Type': 'application/json', 'x-cert-p12-b64': byteaToBase64(certificate.archivo),
      'x-cert-password': certificatePassword, 'x-cert-rnc': company.rnc
    });
    return json(result);
  } catch (error) {
    console.error('enviar-gasto-menor-ecf', error);
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar el gasto menor.' }, 500);
  }
});
