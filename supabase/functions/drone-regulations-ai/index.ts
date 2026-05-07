import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Du er en ekspert på droneregelverk og droneteori. Du svarer KUN på spørsmål som handler om:

- EASA-regelverk for droner (EU-forordninger 2019/947, 2019/945, delegerte/implementerende forordninger)
- Luftfartstilsynets regler, veiledninger og rundskriv for droneoperatører i Norge
- Dronekategorier: Open (A1/A2/A3), Specific (STS-01, STS-02, PDRA), Certified
- SORA-metodikken (Specific Operations Risk Assessment)
- Droneteori: aerodynamikk, meteorologi, navigasjon, luftrom, kommunikasjon
- Flyregler og luftromsregler for droner (VLOS, BVLOS, maksimalhøyde, avstandskrav)
- Restriksjonsområder, fareområder, D-områder, R-områder, flyforbud
- Registrering, forsikring, pilotbevis (A1/A3, A2, STS)
- Praktiske tips for sikker droneoperasjon
- Remote ID og U-Space

Du svarer ALLTID på norsk.

Hvis noen spør om noe som IKKE er relatert til droner, droneregelverk, flyging, luftfart eller tilknyttede emner, svar høflig at du kun kan hjelpe med drone- og regelverksrelaterte spørsmål.

Gi konkrete referanser til relevant regelverk når mulig (f.eks. "I henhold til EU-forordning 2019/947, artikkel X...").

Hold svarene strukturerte og lettleselige med overskrifter og punktlister der det passer.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "For mange forespørsler, prøv igjen om litt." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-kreditter oppbrukt. Kontakt administrator." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI-tjenesten er utilgjengelig akkurat nå." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("drone-regulations-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
