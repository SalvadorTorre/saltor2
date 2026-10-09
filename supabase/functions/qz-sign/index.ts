const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function pemBytes(pem: string): ArrayBuffer {
  const content = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const certificate = Deno.env.get('QZ_CERTIFICATE');
  const privateKey = Deno.env.get('QZ_PRIVATE_KEY');
  if (!certificate || !privateKey) return new Response(JSON.stringify({ error: 'La firma QZ no está configurada' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const body = await req.json().catch(() => ({}));
  if (body.action === 'certificate') return new Response(JSON.stringify({ certificate }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (typeof body.toSign !== 'string' || !body.toSign) return new Response(JSON.stringify({ error: 'Solicitud de firma inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body.toSign));
    return new Response(JSON.stringify({ signature: toBase64(signature) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo firmar la solicitud QZ' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
