import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const DGII_REQUEST_TIMEOUT_MS = 150_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

function buildEndpointCandidates(
  baseUrl: string,
  ambiente: "test" | "prod",
): string[] {
  const base = cleanUrl(baseUrl);
  if (!base) return [];

  const endpoints: string[] = [];
  // El proxy actual publica PROD/TEST en /api/<ambiente>/<ruta>.
  // Se elimina el antiguo sufijo /ecf para usar primero la ruta canónica
  // anunciada por /api/health y /openapi.json.
  const canonicalBase = base.replace(/\/ecf$/i, "");
  if (/\/api$/i.test(canonicalBase)) {
    endpoints.push(`${canonicalBase}/${ambiente}/test-body-direct-cert`);
  } else {
    endpoints.push(`${canonicalBase}/api/${ambiente}/test-body-direct-cert`);
  }

  // Compatibilidad con aliases de instalaciones anteriores.
  endpoints.push(`${base}/api/${ambiente}/api/test-body-direct-cert`);
  endpoints.push(`${base}/${ambiente}/api/test-body-direct-cert`);

  return Array.from(new Set(endpoints));
}

function proxyErrorMessage(payload: any, status: number): string {
  const details = payload?.details;
  const raw = [
    details?.errors,
    details?.message,
    payload?.errors,
    payload?.message,
    payload?.raw,
  ].find((value) => typeof value === "string" && value.trim());
  const message = String(raw || "").trim();

  if (/fetch failed|dns error|failed to lookup|connect/i.test(message)) {
    return "El servicio e-CF no pudo conectarse con DGII. No reenvíe la factura hasta verificar su estado para evitar duplicados.";
  }

  return message || `DGII proxy respondió HTTP ${status}`;
}

function normalizeAmbiente(value: unknown): "test" | "prod" {
  const raw = String(value || "test").trim().toLowerCase();
  return raw === "prod" ? "prod" : "test";
}

function normalizeRnc(value: unknown): string {
  return String(value || "").replace(/[^0-9]/g, "");
}

function numberValue(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeScenarioForDgii(scenario: Record<string, unknown>) {
  if (!scenario) {
    return scenario;
  }

  const tipoEcf = String(scenario?.TipoeCF || "").trim();
  if (tipoEcf === "34") {
    const indicadorNotaCredito =
      String(scenario.IndicadorNotaCredito ?? "0").trim() || "0";
    const indicadorMontoGravado =
      String(scenario.IndicadorMontoGravado ?? "0").trim() || "0";
    const creditNote: Record<string, unknown> = {
      Version: scenario.Version || "1.0",
      TipoeCF: "34",
      ENCF: scenario.ENCF,
      IndicadorNotaCredito: indicadorNotaCredito,
      IndicadorMontoGravado: indicadorMontoGravado,
      TipoIngresos: scenario.TipoIngresos || "01",
      TipoPago: scenario.TipoPago || "1",
    };

    for (const [key, value] of Object.entries(scenario)) {
      if (
        key === "Version" ||
        key === "TipoeCF" ||
        key === "ENCF" ||
        key === "IndicadorNotaCredito" ||
        key === "IndicadorMontoGravado" ||
        key === "TipoIngresos" ||
        key === "TipoPago" ||
        key === "FechaLimitePago" ||
        key === "FechaVencimientoSecuencia"
      ) {
        continue;
      }
      creditNote[key] = value;
    }

    delete creditNote.FechaLimitePago;
    delete creditNote.FechaVencimientoSecuencia;
    delete creditNote.TerminoPago;
    delete creditNote.TipoCuentaPago;
    delete creditNote.NumeroCuentaPago;
    delete creditNote.BancoPago;
    for (let index = 1; index <= 3; index += 1) {
      delete creditNote[`FormaPago[${index}]`];
      delete creditNote[`MontoPago[${index}]`];
    }
    return creditNote;
  }

  if (tipoEcf !== "44") return scenario;

  const normalized: Record<string, unknown> = { ...scenario };
  const keys = Object.keys(normalized);
  const explicitLines = keys
    .map((key) => /^NumeroLinea\[(\d+)\]$/.exec(key)?.[1])
    .filter((value): value is string => Boolean(value));
  const lineIndexes = explicitLines.length
    ? Array.from(new Set(explicitLines))
    : keys
      .map((key) => /\[(\d+)\]$/.exec(key)?.[1])
      .filter((value): value is string => Boolean(value));

  for (const index of lineIndexes) {
    normalized[`IndicadorFacturacion[${index}]`] = "4";
    delete normalized[`MontoITBIS[${index}]`];
    delete normalized[`TasaITBIS[${index}]`];
  }

  delete normalized.IndicadorMontoGravado;
  delete normalized.RegimenPagos;
  delete normalized.MontoGravadoTotal;
  delete normalized.MontoGravadoI1;
  delete normalized.MontoGravadoI2;
  delete normalized.MontoGravadoI3;
  delete normalized.ITBIS1;
  delete normalized.ITBIS2;
  delete normalized.ITBIS3;
  delete normalized.TotalITBIS;
  delete normalized.TotalITBIS1;
  delete normalized.TotalITBIS2;
  delete normalized.TotalITBIS3;

  const totalLines = lineIndexes.reduce(
    (sum, index) => sum + numberValue(normalized[`MontoItem[${index}]`]),
    0,
  );
  const total = numberValue(normalized.MontoTotal) || totalLines;
  const montoExento = totalLines || total;
  normalized.MontoExento = montoExento.toFixed(2);
  normalized.MontoTotal = total.toFixed(2);

  return normalized;
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const col = String(column || "").trim().toLowerCase();
  const msg = String((error as any)?.message || "").toLowerCase();
  return (
    msg.includes(`could not find the '${col}' column`) ||
    msg.includes(`column "${col}"`) ||
    msg.includes(col)
  );
}

function isMissingTableError(error: unknown): boolean {
  const code = String((error as any)?.code || "").trim();
  const msg = String((error as any)?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" ||
    msg.includes("does not exist") || msg.includes("not exist") ||
    msg.includes("could not find the table");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      message: "Método no permitido. Usa POST.",
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const scenarios = Array.isArray(body?.scenarios)
      ? body.scenarios.map((scenario: Record<string, unknown>) =>
        normalizeScenarioForDgii(scenario)
      )
      : [];
    if (!scenarios.length) {
      return jsonResponse(400, {
        ok: false,
        message: "Debes enviar al menos un escenario en scenarios[].",
      });
    }

    const schema = String(
      body?.schema || Deno.env.get("APP_SCHEMA") || "myappdb",
    ).trim() || "myappdb";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) {
      throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    }

    const db = createClient(supabaseUrl, serviceRole, {
      db: { schema },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let { data: cfg, error: cfgError } = await db
      .from("configuracion_global")
      .select(
        "id,dgii_base_url,dgii_ambiente,certificado_p12_base64,certificado_password"
      )
      .eq("id", 1)
      .maybeSingle();

    if (cfgError && isMissingColumnError(cfgError, "dgii_ambiente")) {
      const legacy = await db
        .from("configuracion_global")
        .select(
          "id,dgii_base_url,certificado_p12_base64,certificado_password"
        )
        .eq("id", 1)
        .maybeSingle();

      cfg = legacy.data ? { ...legacy.data, dgii_ambiente: "test" } : null;
      cfgError = legacy.error;
    }

    if (cfgError) {
      throw new Error(`No se pudo leer configuracion_global: ${cfgError.message}`);
    }

    const dgiiBaseUrl = cleanUrl(cfg?.dgii_base_url || "");
    let dgiiAmbiente = normalizeAmbiente(cfg?.dgii_ambiente);
    const certB64 = String(cfg?.certificado_p12_base64 || "").trim();
    const certPassword = String(cfg?.certificado_password || "").trim();

    if (!dgiiBaseUrl) {
      return jsonResponse(422, {
        ok: false,
        message: "No hay dgii_base_url configurado en configuración global.",
      });
    }
    if (!certB64 && !certPassword) {
      return jsonResponse(422, {
        ok: false,
        message:
          "No hay certificado o contraseña configurados en Mantenimiento > Firma digital DGII.",
      });
    }
    if (!certB64) {
      return jsonResponse(422, {
        ok: false,
        message:
          "No hay certificado .p12 configurado en Mantenimiento > Firma digital DGII.",
      });
    }
    if (!certPassword) {
      return jsonResponse(422, {
        ok: false,
        message:
          "El certificado está cargado, pero falta su contraseña en Mantenimiento > Firma digital DGII.",
      });
    }

    const rncBody = normalizeRnc(body?.rncEmisor);
    const rncScenario = normalizeRnc(scenarios?.[0]?.RNCEmisor);
    const certRnc = rncBody || rncScenario;
    if (!certRnc) {
      return jsonResponse(422, {
        ok: false,
        message: "No se encontró RNC emisor para enviar a DGII.",
      });
    }

    let empresaAmbiente: any = null;
    const { data: empresasRows, error: empresasError } = await db
      .from("empresas")
      .select("cod_empre,nom_empre,rnc_empre")
      .limit(2000);

    if (empresasError) {
      throw new Error(`No se pudo leer empresas: ${empresasError.message}`);
    }

    const empresa = (empresasRows || []).find((row: any) =>
      normalizeRnc(row?.rnc_empre) === certRnc
    );

    if (empresa?.cod_empre) {
      const { data: cfgEmpresa, error: cfgEmpresaError } = await db
        .from("configuracion_dgii_empresa")
        .select("cod_empre,dgii_ambiente,activo")
        .eq("cod_empre", empresa.cod_empre)
        .maybeSingle();

      if (cfgEmpresaError && !isMissingTableError(cfgEmpresaError)) {
        throw new Error(
          `No se pudo leer configuracion_dgii_empresa: ${cfgEmpresaError.message}`,
        );
      }

      if (cfgEmpresa?.activo !== false && cfgEmpresa?.dgii_ambiente) {
        empresaAmbiente = cfgEmpresa;
        dgiiAmbiente = normalizeAmbiente(cfgEmpresa.dgii_ambiente);
      }
    }

    const payload = { scenarios };
    const endpointCandidates = buildEndpointCandidates(dgiiBaseUrl, dgiiAmbiente);
    if (!endpointCandidates.length) {
      return jsonResponse(422, {
        ok: false,
        message: "No hay endpoint DGII válido configurado.",
      });
    }

    let upstreamBody: any = null;
    let endpoint = endpointCandidates[0];
    let finalStatus = 500;
    const tried: Array<{ endpoint: string; status: number; details: any }> = [];
    let ok = false;

    for (const candidate of endpointCandidates) {
      endpoint = candidate;
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        DGII_REQUEST_TIMEOUT_MS,
      );
      let upstream: Response;
      let rawText = "";
      try {
        upstream = await fetch(candidate, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cert-p12-b64": certB64,
            "x-cert-password": certPassword,
            "x-cert-rnc": certRnc,
            "x-cert-persist": "true",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        rawText = await upstream.text();
      } catch (error) {
        const timeout = error instanceof DOMException && error.name === "AbortError";
        return jsonResponse(timeout ? 504 : 502, {
          ok: false,
          message: timeout
            ? "El servicio DGII tardó más de 150 segundos en responder. Verifique el estado antes de reenviar para evitar duplicados."
            : "No se pudo conectar con el servicio de facturación electrónica DGII.",
          details: error instanceof Error ? error.message : String(error),
          endpoint,
          ambiente: dgiiAmbiente,
          empresa: empresa?.cod_empre || null,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      finalStatus = upstream.status;
      try {
        upstreamBody = rawText ? JSON.parse(rawText) : {};
      } catch {
        upstreamBody = { raw: rawText };
      }

      if (upstream.ok) {
        ok = true;
        break;
      }

      tried.push({
        endpoint: candidate,
        status: upstream.status,
        details: upstreamBody,
      });

      // Si no es 404, no seguir intentando rutas alternativas.
      if (upstream.status !== 404) {
        break;
      }
    }

    if (!ok) {
      return jsonResponse(502, {
        ok: false,
        message: proxyErrorMessage(upstreamBody, finalStatus),
        details: upstreamBody,
        endpoint,
        ambiente: dgiiAmbiente,
        empresa: empresa?.cod_empre || null,
        ambiente_origen: empresaAmbiente ? "empresa" : "global",
        endpoints_intentados: tried,
      });
    }

    return jsonResponse(200, {
      ok: true,
      message: "Envío DGII procesado.",
      data: upstreamBody,
      endpoint,
      ambiente: dgiiAmbiente,
      empresa: empresa?.cod_empre || null,
      ambiente_origen: empresaAmbiente ? "empresa" : "global",
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      message: "Error enviando comprobante a DGII.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
