const MEGAPLUS_ENDPOINT = 'https://rnc.megaplus.com.do/api/consulta';
const LOOKUP_TIMEOUT_MS = 15_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  for (const key of ['mensaje', 'message', 'error', 'detalle', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: true, mensaje: 'Método no permitido.' }, 405);

  const url = new URL(req.url);
  const rnc = (url.searchParams.get('rnc') || '').replace(/[^0-9]/g, '');
  if (!rnc) return json({ error: true, mensaje: 'Parámetro RNC requerido.' }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${MEGAPLUS_ENDPOINT}?rnc=${encodeURIComponent(rnc)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'SaltorSystem-RNC/1.0'
      }
    });
    const rawBody = await upstream.text();
    let body: unknown = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = null;
    }

    if (!upstream.ok) {
      const fallback = upstream.status === 404
        ? 'No se encontró información para ese RNC en Megaplus.'
        : 'Megaplus no pudo completar la consulta en este momento.';
      return json({ error: true, mensaje: errorMessage(body, fallback) }, upstream.status === 404 ? 404 : 502);
    }

    if (!body || typeof body !== 'object') {
      return json({ error: true, mensaje: 'Megaplus devolvió una respuesta no válida. Intenta nuevamente.' }, 502);
    }

    return json(body as Record<string, unknown>);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return json({
      error: true,
      mensaje: timedOut
        ? 'La consulta a Megaplus tardó demasiado. Intenta nuevamente.'
        : 'No se pudo consultar el registro de RNC en Megaplus.'
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
