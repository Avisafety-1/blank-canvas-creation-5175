import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const topicsSchema = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Kort, beskrivende kurstittel på norsk" },
          chapter_reference: { type: "string", description: "Referanse til kapittel/seksjon i manualen, f.eks. 'Kap. 7.3' eller 'Seksjon 4.1–4.2'" },
          description: { type: "string", description: "1-2 setninger som forklarer hva kurset dekker" },
          focus_query: { type: "string", description: "Kort søkesetning som kan brukes for retrieval" },
        },
        required: ["title", "chapter_reference", "description", "focus_query"],
      },
    },
  },
  required: ["topics"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { manual_id } = (await req.json()) as { manual_id: string };
    if (!manual_id) {
      return new Response(JSON.stringify({ error: "manual_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: manual } = await admin
      .from("manuals")
      .select("id, title, company_id")
      .eq("id", manual_id)
      .maybeSingle();
    if (!manual) {
      return new Response(JSON.stringify({ error: "Manual not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization (same pattern as generate-course)
    const { data: visibleRaw } = await admin.rpc("get_user_visible_company_ids", { p_user_id: userId });
    const visibleIds: string[] = Array.isArray(visibleRaw)
      ? visibleRaw.map((v: any) => (typeof v === "string" ? v : v?.company_id ?? v?.get_user_visible_company_ids ?? null)).filter(Boolean)
      : [];
    let authorized = visibleIds.includes(manual.company_id);
    if (!authorized) {
      const { data: prof } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      authorized = prof?.company_id === manual.company_id;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch a representative sample of chunks (preferring those with headings)
    const { data: all } = await admin
      .from("manual_chunks")
      .select("chunk_index, chunk_text, section_heading")
      .eq("manual_id", manual_id)
      .order("chunk_index", { ascending: true });

    const total = all?.length || 0;
    if (total === 0) {
      return new Response(JSON.stringify({ error: "Ingen innhold funnet i manualen" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Diversified sampling — up to 20 chunks, prioritizing those with section_heading
    const want = Math.min(20, total);
    const step = Math.max(1, Math.floor(total / want));
    const sampled: any[] = [];
    for (let i = 0; i < total && sampled.length < want; i += step) {
      sampled.push(all![i]);
    }

    const contextBlock = sampled
      .map(
        (c, i) =>
          `--- CHUNK ${i + 1}${c.section_heading ? ` (Seksjon: ${c.section_heading})` : ""} ---\n${(c.chunk_text || "").slice(0, 1200)}`
      )
      .join("\n\n");

    const systemPrompt = `Du er en ekspert på dronesikkerhet og opplæring. Din oppgave er å analysere en operasjonsmanual og foreslå 5-8 spesifikke kurs-temaer som passer for trening av personell.

Regler:
- Hvert tema skal være FOKUSERT (ikke for bredt)
- Bruk faktiske kapittel-/seksjonsreferanser fra manualen når mulig
- Prioriter sikkerhetskritiske og operativt viktige temaer
- Unngå generiske temaer — vær konkret om hva manualen faktisk dekker
- Alle felt skal være på norsk
- Returner KUN gyldig output via emit_topics-verktøyet`;

    const userPrompt = `Analyser denne manualen og foreslå 5-8 kurs-temaer:

Manualtittel: ${manual.title}

Innhold (utvalg på tvers av manualen):
${contextBlock}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_topics",
              description: "Foreslå kurs-temaer basert på manualinnholdet",
              parameters: topicsSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_topics" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "AI er overbelastet. Prøv igjen om litt." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI-kreditter brukt opp." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI-kall feilet" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI returnerte ikke forslag" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ topics: parsed.topics || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-course-topics error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
