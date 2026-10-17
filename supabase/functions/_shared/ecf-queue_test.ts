import { endpoint, parseResult, serviceBase } from './ecf-queue.ts';
import { queryOperation, submitOperation, type Operation } from './ecf-operation.ts';
const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
function operation(modo: 'COLA' | 'FIRMA' = 'COLA'): Operation {
  return { id: 'local-id', tipo: 'FACTURA', documento_id: 1, empresa_id: 1, sucursal_id: 1,
    encf: 'E320000000001', fecha_vencimiento: null, ambiente: 'TEST', url_base: 'https://service.example/ecf',
    modo, status: 'PREPARANDO', operation_id: null, resultado: {}, claimed: true };
}
function database(op: Operation) {
  return { rpc: (_: string, args: any) => {
    op.status = args.p_status;
    op.resultado = { ...op.resultado, ...Object.fromEntries(Object.entries(args.p_resultado).filter(([, v]) => v !== null)) };
    op.operation_id = op.resultado.ecf_operation_id ?? op.operation_id;
    return Promise.resolve({ data: structuredClone(op), error: null });
  } };
}
Deno.test('URLs test/prod normalizan configuraciones anteriores y escapan operationId', () => {
  assert(serviceBase('https://service.example/ecf/') === 'https://service.example');
  assert(endpoint('https://service.example/api', 'PROD') === 'https://service.example/ecf/prod/firmar-y-encolar-direct-cert');
  assert(endpoint('https://service.example', 'TEST', false, 'a/b') === 'https://service.example/ecf/test/operaciones-encoladas/a%2Fb');
});
Deno.test('202 guarda firma, operación y estado pendiente; persist siempre true', async () => {
  const original = globalThis.fetch; const op = operation();
  try {
    globalThis.fetch = async (url, init) => {
      assert(String(url).endsWith('/ecf/test/firmar-y-encolar-direct-cert'));
      assert(new Headers(init?.headers).get('x-cert-persist') === 'true');
      assert(JSON.parse(String(init?.body)).scenarios[0].TipoeCF === '32');
      return new Response(JSON.stringify({ operationId: 'op-1', codigoSeguridad: 'ABC', fechaHoraFirma: '16-10-2026 12:30:00', qrUrl: 'https://qr', xmlFirmado: '<signed/>' }), { status: 202 });
    };
    const result = await submitOperation(database(op), op, { TipoeCF: '32' }, { 'Content-Type': 'application/json' });
    assert(result.dgii_estado === 'En cola' && result.ecf_operation_id === 'op-1' && !result.dgii_track_id);
    assert(result.ecf_xml_firmado === '<signed/>' && result.qr_link === 'https://qr' && result.codSeguridad === 'ABC');
    assert(result.fec_firma === '2026-10-16T16:30:00.000Z');
  } finally { globalThis.fetch = original; }
});
Deno.test('proforma solo firma, omite persist y nunca crea operación de cola', async () => {
  const original = globalThis.fetch; const op = operation('FIRMA');
  try {
    globalThis.fetch = async (url, init) => {
      assert(String(url).endsWith('/generate-xml-no-send-direct-cert'));
      assert(!new Headers(init?.headers).has('x-cert-persist'));
      return new Response(JSON.stringify({ xmlFirmado: '<proforma/>', qrUrl: 'https://qr', operationId: 'unexpected', trackId: 'unexpected' }));
    };
    const result = await submitOperation(database(op), op, { TipoeCF: '32' }, { 'x-cert-persist': 'true' });
    assert(result.dgii_estado === 'Firmada' && result.ecf_operation_id === null && !result.dgii_track_id);
  } finally { globalThis.fetch = original; }
});
Deno.test('doble clic reutiliza operación sin otro HTTP', async () => {
  const original = globalThis.fetch; const op = { ...operation(), claimed: false };
  try {
    globalThis.fetch = () => { throw new Error('No debe enviar'); };
    const result = await submitOperation(database(op), op, {}, {});
    assert(result.ncf === op.encf);
  } finally { globalThis.fetch = original; }
});
for (const mode of ['timeout', 'missingId', 'serverError'] as const) {
  Deno.test(`${mode}: conserva reserva sin reintento automático`, async () => {
    const original = globalThis.fetch; const op = operation(); let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        if (mode === 'timeout') throw new TypeError('Network interrupted');
        return new Response('{}', { status: mode === 'serverError' ? 503 : 202 });
      };
      const result = await submitOperation(database(op), op, {}, {});
      assert(result.ecf_queue_status === 'ENVIO_INCIERTO' && calls === 1);
    } finally { globalThis.fetch = original; }
  });
}
Deno.test('consulta es GET sin credenciales del certificado y mantiene operationId distinto de trackId', async () => {
  const original = globalThis.fetch; const op = { ...operation(), status: 'EN_COLA', operation_id: 'queue-id' };
  try {
    globalThis.fetch = async (url, init) => {
      assert(String(url).endsWith('/operaciones-encoladas/queue-id') && !init?.method && !init?.headers);
      return new Response(JSON.stringify({ status: 'ACEPTADO', trackId: 'dgii-track', codigo: '1', mensajes: ['Aceptado'] }));
    };
    const result = await queryOperation(database(op), op);
    assert(result.ecf_operation_id === 'queue-id' && result.dgii_track_id === 'dgii-track' && result.dgii_estado === 'Aceptado');
  } finally { globalThis.fetch = original; }
});
Deno.test('estados finales no consultan ni reenvían', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error('No debe consultar'); };
    for (const status of ['ACEPTADO', 'RECHAZADO', 'ERROR', 'FIRMADA']) {
      const op = { ...operation(), status, operation_id: 'queue-id' };
      assert((await queryOperation(database(op), op)).ecf_queue_status === status);
    }
  } finally { globalThis.fetch = original; }
});
Deno.test('consulta fallida o estado desconocido no destruyen operación', async () => {
  const original = globalThis.fetch; const op = { ...operation(), status: 'EN_COLA', operation_id: 'queue-id' };
  try {
    for (const response of [new Response('{}', { status: 502 }), new Response('{"status":"DESCONOCIDO"}')]) {
      globalThis.fetch = async () => response;
      let failed = false; try { await queryOperation(database(op), op); } catch { failed = true; }
      assert(failed && op.status === 'EN_COLA');
    }
  } finally { globalThis.fetch = original; }
});
Deno.test('parsea datos nuevos también dentro de data', () => {
  const result = parseResult({ data: { operationId: 'op', codigoSeguridad: 'XYZ', xmlFirmado: '<xml/>' } }, 'EN_COLA', '{}');
  assert(result.ecf_operation_id === 'op' && result.codSeguridad === 'XYZ');
});

Deno.test('intento interrumpido termina por confirmar sin reenviar', async () => {
  const op = { ...operation(), creado_en: new Date(Date.now()-181_000).toISOString() };
  const result = await queryOperation(database(op), op);
  assert(result.ecf_queue_status === 'ENVIO_INCIERTO');
});
Deno.test('proforma sin XML no se marca firmada', async () => {
  const original = globalThis.fetch; const op = operation('FIRMA');
  try {
    globalThis.fetch = async () => new Response('{}');
    const result = await submitOperation(database(op), op, { TipoeCF: '32' }, {});
    assert(result.ecf_queue_status === 'ENVIO_INCIERTO');
  } finally { globalThis.fetch = original; }
});
