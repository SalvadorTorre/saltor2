const MEGAPLUS_ENDPOINT = 'https://rnc.megaplus.com.do/api/consulta';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: true, mensaje: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const rnc = (url.searchParams.get('rnc') || '').replace(/[^0-9]/g, '');

  if (!rnc) {
    return new Response(JSON.stringify({ error: true, mensaje: 'Parámetro rnc requerido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const upstream = await fetch(`${MEGAPLUS_ENDPOINT}?rnc=${encodeURIComponent(rnc)}`);
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: true, mensaje: 'No se pudo consultar el registro de RNC' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
