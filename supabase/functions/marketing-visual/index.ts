import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVISAFE_BRAND_RULES = `You are generating a marketing visual for AviSafe — a Norwegian drone operations management and aviation safety SaaS platform used by professional drone operators in Scandinavia.

WHAT AVISAFE ACTUALLY LOOKS LIKE:
- The app has a dark navy header bar (#1a2332) with the white AviSafe logo (diamond-shaped icon + "AVISAFE" text)
- Background aesthetic: Norwegian mountain landscapes with fog/clouds, moody and atmospheric — NOT bright sunny stock photos
- UI uses glassmorphism cards (frosted glass effect with backdrop-blur) over the mountain background
- The primary interface is a full-screen interactive MAP with colored airspace zones (pink/magenta restricted zones, orange warning zones, yellow caution zones, blue controlled airspace polygons)
- Dashboard shows: mission cards, drone fleet status (green/yellow/red indicators), weather data, flight logs, document lists
- Color palette: Deep navy (#1a2332), cool slate blue (#1a5091), white text on dark, subtle blue accents, muted backgrounds
- Status colors: Green = OK/active, Yellow = warning/maintenance needed, Red = critical/overdue
- Typography: Clean sans-serif (Roboto/system), professional and restrained — no decorative or playful fonts

KEY AVISAFE FEATURES (use these in visuals, not generic dashboards):
- Interactive airspace map with colored restriction zone polygons (the core feature)
- SORA risk assessment for drone operations
- Mission planning with crew, drones, and equipment assignment
- Drone fleet management with maintenance tracking
- Incident reporting with ECCAIRS integration (EU aviation safety reporting)
- Flight logging with DJI auto-sync
- Pre-flight weather assessment (wind speed, visibility, temperature limits)
- NOTAM and airspace restriction awareness
- Digital checklists and document management

LOGO RULES:
- You are provided with the official AviSafe logo as a reference image
- Reproduce the exact logo as shown — diamond icon + "AVISAFE" text
- Place it small and clean in a corner (bottom-right or top-left)
- On dark backgrounds: white logo. On light backgrounds: dark logo.

VISUAL STYLE:
- Think Stripe/Linear quality but with a Nordic, aviation feel
- Mountain/sky/cloud imagery as backgrounds — atmospheric and professional
- Dark, moody color grading — NOT bright and cheerful
- Clean negative space, professional typography
- If showing UI elements, they must look like AviSafe's actual map-centric interface with airspace polygons

STRICTLY NEVER DO:
- Generic analytics dashboards with bar charts, pie charts, or line graphs as the main element — AviSafe is map-first
- Bright corporate blue (#0066FF) or tech-startup gradients — AviSafe uses deep navy
- Cartoon or illustrated drones — only realistic or silhouette drones
- Stock photo clichés (handshakes, generic offices, smiling people with tablets)
- Silicon Valley startup aesthetics — this is Norwegian B2B aviation
- Inventing UI elements that don't exist in AviSafe (stock tickers, social feeds, chat bubbles, CRM tables)
- Rounded playful UI with pastel colors — AviSafe is sharp and professional
- Any dashboard that could be "any SaaS product" — it must be recognizably aviation/drone-focused with maps`;

function buildSafetyGraphicPrompt(params: { title: string; subtitle?: string; template: string; format: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a professional safety-focused marketing image for a LinkedIn post (${aspect} aspect ratio).

Topic: ${params.title}
${params.subtitle ? `Subtitle: ${params.subtitle}` : ""}
Template style: ${params.template}

The visual should:
- Illustrate the safety concept using clean iconography, diagrams, or atmospheric drone/aviation photography
- Use AviSafe's deep navy/slate color palette with mountain/sky atmosphere
- Include the title text "${params.title}" in clean white typography on a dark overlay
${params.subtitle ? `- Include subtitle "${params.subtitle}" in smaller, lighter text` : ""}
- Have the AviSafe logo in a corner
- Feel like a premium Nordic aviation brand — moody, atmospheric, professional
- Reference real drone safety concepts: airspace awareness, pre-flight checks, weather limits, NOTAM compliance, SORA risk categories

Background options (pick the most relevant):
- Atmospheric mountain/cloud scene with dark overlay
- Aerial drone perspective over Norwegian landscape
- Abstract airspace zone visualization (colored polygons on dark map)
- Clean dark gradient with subtle topographic map texture`;
}

function buildProductMockupPrompt(params: { title: string; subtitle?: string; template: string; format: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a professional product mockup image for a LinkedIn post (${aspect} aspect ratio).

Subject: ${params.title}
${params.subtitle ? `Context: ${params.subtitle}` : ""}
Template style: ${params.template}

The device screen MUST show AviSafe's actual interface:
- A full-screen MAP with colored airspace zone polygons (pink/magenta restricted areas, orange warning zones, blue controlled airspace)
- Dark navy header bar with white AviSafe logo
- Side panel or overlay cards with mission details, weather data, or drone status
- NOT generic dashboards with charts — AviSafe is a MAP-BASED application

Layout:
- Realistic device (MacBook, iPad, or iPhone) at a slight angle
- Background: moody Norwegian mountain landscape with fog/clouds, or clean dark gradient
- Title "${params.title}" in clean white typography
${params.subtitle ? `- Subtitle "${params.subtitle}" in lighter text` : ""}
- AviSafe logo branding in corner
- Professional, aspirational — like a premium Nordic SaaS product page`;
}

function buildScreenshotLayoutPrompt(params: { title: string; subtitle?: string; template: string; format: string; screenshotDescription?: string }) {
  const aspect = params.format === "1200x628" ? "landscape 16:9" : "square 1:1";
  return `${AVISAFE_BRAND_RULES}

Generate a professional marketing layout image for a LinkedIn post (${aspect} aspect ratio).

This should look like a polished feature highlight:
- Title: "${params.title}"
${params.subtitle ? `- Subtitle: "${params.subtitle}"` : ""}
- Template style: ${params.template}
${params.screenshotDescription ? `- The main visual area should depict: ${params.screenshotDescription}` : "- The main visual area should show AviSafe's map interface with colored airspace polygons, dark header, and mission data overlay"}

Layout:
- Floating device or card-style frame showing the AviSafe UI
- The UI inside MUST feature a map with airspace zones — not generic charts
- Title text prominent at top or left in clean white typography
- Background: dark navy gradient with subtle mountain/topographic texture, or atmospheric cloud imagery
- AviSafe logo in corner
- Professional spacing, clean alignment
- Nordic aviation brand feeling — premium, restrained, atmospheric`;
}

const AVISAFE_LOGO_URL = "https://app.avisafe.no/avisafe-logo-text.png";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { type, title, subtitle, template, format, screenshotUrl, companyId, draftId } = body;

    let prompt: string;
    const params = { title: title || "AviSafe", subtitle, template: template || "feature_highlight", format: format || "1200x1200" };

    switch (type) {
      case "safety_graphic":
        prompt = buildSafetyGraphicPrompt(params);
        break;
      case "product_mockup":
        prompt = buildProductMockupPrompt(params);
        break;
      case "screenshot_layout":
        prompt = buildScreenshotLayoutPrompt({ ...params, screenshotDescription: subtitle });
        break;
      default:
        throw new Error(`Unknown visual type: ${type}`);
    }

    const contentParts: any[] = [
      { type: "text", text: prompt + "\n\nIMPORTANT: The attached image is the official AviSafe logo. Reproduce this exact logo faithfully in the corner of the generated visual. Do not redesign or approximate it." },
      { type: "image_url", image_url: { url: AVISAFE_LOGO_URL } },
    ];

    if (screenshotUrl && type === "screenshot_layout") {
      contentParts.push({ type: "image_url", image_url: { url: screenshotUrl } });
      contentParts[0] = {
        type: "text",
        text: prompt + "\n\nIMPORTANT: The first attached image is the official AviSafe logo — reproduce it exactly in the corner. The second attached image is a real screenshot from the AviSafe app — use it as the main UI visual in the layout, framed professionally. This is what AviSafe actually looks like.",
      };
    }

    const messages: any[] = [{ role: "user", content: contentParts }];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Prøv igjen om litt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Ingen flere AI-kreditter. Fyll på i Lovable-innstillingene." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) throw new Error("No image returned from AI");

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid image data format");

    const imageExt = base64Match[1];
    const base64Content = base64Match[2];
    const imageBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const fileName = `${companyId}/${crypto.randomUUID()}.${imageExt}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("marketing-media")
      .upload(fileName, imageBytes, { contentType: `image/${imageExt}`, upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("marketing-media")
      .getPublicUrl(fileName);

    const fileUrl = publicUrlData.publicUrl;

    const { data: mediaRow, error: insertError } = await supabaseAdmin
      .from("marketing_media")
      .insert({
        company_id: companyId,
        draft_id: draftId || null,
        created_by: user.id,
        media_type: type === "safety_graphic" ? "graphic" : "image",
        layout_template: template || null,
        source_type: screenshotUrl ? "screenshot" : "ai",
        file_url: fileUrl,
        title: title || null,
        subtitle: subtitle || null,
        image_format: format || "1200x1200",
        metadata: { type, template, prompt: prompt.substring(0, 200) },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(`Failed to save media: ${insertError.message}`);
    }

    return new Response(JSON.stringify({ media: mediaRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("marketing-visual error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
