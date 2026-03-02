import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsonrepair } from "https://esm.sh/jsonrepair@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Contacto = { nombre: string; direccion: string; telefono: string; web: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY no configurada" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const prompt = `ACTÚA COMO ASISTENTE DE BÚSQUEDA COMERCIAL.

INSTRUCCIÓN: Busca información actual de empresas en Argentina (prioridad Buenos Aires) y devuélvela en formato JSON.

USA google_search para encontrar:
1) Importadores de hornos en Argentina, especialmente en Buenos Aires.
2) Comercios o tiendas de venta de hornos en Argentina (Buenos Aires y resto del país).

Para cada empresa encontrada incluye cuando esté disponible: nombre, dirección, teléfono y sitio web.
Si no encontrás algún dato (ej. web), deja el campo vacío "".

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después:

{
  "importadores": [
    { "nombre": "string", "direccion": "string", "telefono": "string", "web": "string" }
  ],
  "comercios": [
    { "nombre": "string", "direccion": "string", "telefono": "string", "web": "string" }
  ]
}

REQUISITOS:
- importadores: entre 3 y 8 empresas que importen o distribuyan hornos en Argentina/Buenos Aires. Incluye solo datos que encuentres (nombre, dirección, teléfono, web). Si falta un campo, usa "".
- comercios: entre 3 y 8 comercios que vendan hornos en Argentina. Misma estructura.
- Prioriza fuentes con datos de contacto reales (páginas amarillas, sitios de empresas, directorios).
- Todo en español. Nombres y direcciones tal como figuren.
- Respuesta SOLO JSON válido, sin markdown. Escapa comillas dobles en strings con \\". Sin saltos de línea dentro de valores.`;

  try {
    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.95,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const gData = await gRes.json();
    if (gData.error) {
      throw new Error(gData.error.message || "Error de API Gemini");
    }

    const parts = gData.candidates?.[0]?.content?.parts ?? [];
    let respuesta = parts
      .filter((p: { text?: string }) => p?.text)
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    respuesta = respuesta.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed: { importadores?: Contacto[]; comercios?: Contacto[] } = {
      importadores: [],
      comercios: [],
    };

    const firstBrace = respuesta.indexOf("{");
    const lastBrace = respuesta.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      let jsonStr = respuesta.substring(firstBrace, lastBrace + 1).trim();
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        try {
          jsonStr = jsonrepair(jsonStr);
          parsed = JSON.parse(jsonStr);
        } catch {
          parsed = { importadores: [], comercios: [] };
        }
      }
    }

    const importadores = Array.isArray(parsed.importadores) ? parsed.importadores : [];
    const comercios = Array.isArray(parsed.comercios) ? parsed.comercios : [];

    return new Response(
      JSON.stringify({
        importadores: importadores.map((r) => ({
          nombre: String(r?.nombre ?? "").trim(),
          direccion: String(r?.direccion ?? "").trim(),
          telefono: String(r?.telefono ?? "").trim(),
          web: String(r?.web ?? "").trim(),
        })),
        comercios: comercios.map((r) => ({
          nombre: String(r?.nombre ?? "").trim(),
          direccion: String(r?.direccion ?? "").trim(),
          telefono: String(r?.telefono ?? "").trim(),
          web: String(r?.web ?? "").trim(),
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[get-novedades-negocio]", message, err);
    return new Response(
      JSON.stringify({
        error: message,
        hint: !geminiKey
          ? "Configurá GEMINI_API_KEY en Supabase → Project Settings → Edge Functions → Secrets."
          : message.includes("API key") || message.includes("401")
            ? "Revisá que GEMINI_API_KEY sea correcta y tenga acceso a Gemini 2.0 Flash."
            : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
