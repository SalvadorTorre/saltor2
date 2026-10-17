import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Compatibilidad con el nombre anterior. Todos los envíos pasan por la reserva
// persistida del documento; un payload arbitrario no puede saltarse ese control.
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
    const { data: session, error: authError } = await client.auth.getUser();
    if (authError || !session.user) return json({ error: 'Sesión no válida.' }, 401);
    const body = await request.json();
    const routes = [ ['invoiceId', 'enviar-ecf'], ['creditNoteId', 'enviar-nota-credito-ecf'], ['minorExpenseId', 'enviar-gasto-menor-ecf'] ];
    const selected = routes.filter(([field]) => body[field] !== undefined);
    if (selected.length !== 1) return json({ error: 'Indica invoiceId, creditNoteId o minorExpenseId. El envío directo de scenarios fue sustituido por operaciones persistidas.' }, 400);
    const [field, name] = selected[0]; const id = Number(body[field]);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Documento inválido.' }, 400);
    const { data, error } = await client.functions.invoke(name, { body: { [field]: id } });
    if (error) {
      const context = error.context as Response | undefined;
      if (context) return json(await context.json(), context.status);
      throw error;
    }
    return json(data, data?.ecf_operation_id && ['EN_COLA', 'ENVIANDO_DGII', 'EN_PROCESO_DGII'].includes(data.ecf_queue_status) ? 202 : 200);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'No se pudo transmitir el comprobante.' }, 502); }
});
