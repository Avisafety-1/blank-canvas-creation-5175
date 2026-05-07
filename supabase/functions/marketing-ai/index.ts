import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRAND_VOICE = `You are a marketing content writer for AviSafe, a professional drone operations and aviation safety SaaS platform used by commercial drone operators in Norway and Europe.

BRAND VOICE RULES — follow these strictly:
- Professional B2B tone. Write for drone operators, safety officers, and aviation professionals.
- Clear, concise language. Every sentence must earn its place.
- Practical value first. Always give the reader something useful.
- NO exaggerated claims. Never use words like "revolutionary", "game-changing", "world-class", "best-in-class", "cutting-edge", "next-level" unless backed by specific evidence.
- NO fake numbers or unsupported statistics.
- Do NOT sound like a generic social media guru or AI marketing bot.
- Use maximum 1–2 emojis per post. Prefer none in formal contexts.
- Prefer credibility over hype. Show, don't tell.
- Mention AviSafe naturally — like a knowledgeable colleague recommending a tool, not a sales pitch.
- Write like someone who actually operates drones, not someone who just markets drone software.
- When relevant, include links to AviSafe's website. Use https://avisafe.no as the main link. For posts about risk assessment, SORA analysis, safety planning, or operational compliance, link to https://avisafe.no/sora instead. Only include a link if it adds value — do not force it into every post.
- Avoid these banned phrases: "game-changer", "revolutionary", "synergy", "disruptive", "paradigm shift", "leverage", "unlock your potential", "10x your results", "deep dive", "move the needle".`;

function buildDraftSystemPrompt(params: {
  platform: string;
  language: string;
  preset?: string;
  structure?: string;
  presetConfig?: any;
  brandSettings?: any;
}) {
  const { platform, language, preset, structure, presetConfig, brandSettings } = params;
  const langInstruction = language === "en"
    ? "Write in fluent, native English. Do NOT translate from Norwegian — write as a native English speaker would."
    : "Skriv på flytende, naturlig norsk. IKKE oversett fra engelsk — skriv som en norsk morsmålsbruker.";

  let presetBlock = "";
  if (presetConfig) {
    presetBlock = `
CONTENT PRESET: ${presetConfig.label}
- Tone: ${presetConfig.tone}
- Target audience: ${presetConfig.audience}
- CTA style: ${presetConfig.ctaStyle}
- Hashtag style: ${presetConfig.hashtagStyle}`;
  }

  const structureMap: Record<string, string> = {
    hook_insight_cta: "Structure: Start with a compelling hook (1-2 lines that stop scrolling), share a key insight or story (2-4 paragraphs), end with a clear call to action.",
    problem_solution_cta: "Structure: Open by identifying a real problem your audience faces, present a practical solution with specific details, close with actionable next steps.",
    short_educational: "Structure: A concise, informative post that teaches one thing well. 3-5 short paragraphs max. No fluff.",
    news_update: "Structure: Lead with what changed and why it matters. Be specific about the update. Keep it factual and forward-looking.",
    thought_leadership: "Structure: Share a perspective on an industry trend. Take a clear stance. Support it with reasoning or experience. Invite discussion.",
    checklist_tips: "Structure: A numbered or bulleted list of 5-7 actionable tips. Each tip should be 1-2 sentences. Easy to scan, high utility.",
  };
  const structureBlock = structure && structureMap[structure]
    ? `\nPOST STRUCTURE: ${structureMap[structure]}`
    : "";

  let extraRules = "";
  if (brandSettings) {
    if (brandSettings.customRules) extraRules += `\nADDITIONAL BRAND RULES: ${brandSettings.customRules}`;
    if (brandSettings.bannedPhrases?.length) extraRules += `\nADDITIONAL BANNED PHRASES: ${brandSettings.bannedPhrases.join(", ")}`;
  }

  return `${BRAND_VOICE}
${presetBlock}
${structureBlock}
${extraRules}

PLATFORM: ${platform}
LANGUAGE: ${langInstruction}

Generate content that feels like it was written by someone who deeply understands the drone industry, not by a marketing tool.`;
}

const draftToolSchema = {
  type: "function" as const,
  function: {
    name: "return_draft",
    description: "Return a structured marketing draft post",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title or headline" },
        hook: { type: "string", description: "Opening hook — 1-2 compelling lines" },
        body: { type: "string", description: "Main body content" },
        cta: { type: "string", description: "Call to action" },
        hashtags: { type: "array", items: { type: "string" }, description: "Relevant hashtags without #" },
        suggestedAudience: { type: "string", description: "Who this post is best suited for" },
        suggestedLanguage: { type: "string", enum: ["no", "en"] },
        characterCount: { type: "number", description: "Approximate character count of the full post" },
        whyItWorks: { type: "string", description: "Brief explanation of why this post is effective" },
        audienceFit: { type: "string", description: "What specific audience segment this resonates with and why" },
        followUpVariation: { type: "string", description: "A suggested follow-up post idea that builds on this one" },
      },
      required: ["title", "hook", "body", "cta", "hashtags", "suggestedAudience", "characterCount", "whyItWorks", "audienceFit", "followUpVariation"],
      additionalProperties: false,
    },
  },
};

const variantsToolSchema = {
  type: "function" as const,
  function: {
    name: "return_variants",
    description: "Return multiple draft variants",
    parameters: {
      type: "object",
      properties: {
        variants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              hook: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              suggestedAudience: { type: "string" },
              characterCount: { type: "number" },
              whyItWorks: { type: "string" },
              audienceFit: { type: "string" },
              followUpVariation: { type: "string" },
            },
            required: ["title", "hook", "body", "cta", "hashtags", "suggestedAudience", "characterCount", "whyItWorks", "audienceFit", "followUpVariation"],
            additionalProperties: false,
          },
        },
      },
      required: ["variants"],
      additionalProperties: false,
    },
  },
};

function handleError(status: number) {
  if (status === 429) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (status === 402) {
    return new Response(
      JSON.stringify({ error: "Payment required. Add credits to your workspace." }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, topic, ideaTitle, platform, preset, structure, language, variantCount, presetConfig, brandSettings } = await req.json();

    const aiHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    };

    // ── IDEAS ──
    if (type === "ideas") {
      const langNote = language === "en" ? "Respond in English." : "Respond in Norwegian.";
      const presetNote = preset ? `Focus on ideas related to: ${preset}` : "";

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `${BRAND_VOICE}\n\nYou are generating content IDEAS (not full posts). Each idea should be specific, actionable, and relevant to the drone/aviation safety industry. ${langNote} ${presetNote}`,
            },
            {
              role: "user",
              content: `Generate 5 specific, high-quality content ideas about: ${topic || "drone operations, aviation safety, and industry trends"}. Each idea should be concrete enough that a writer could immediately start drafting from it.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_ideas",
                description: "Return content ideas",
                parameters: {
                  type: "object",
                  properties: {
                    ideas: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          description: { type: "string" },
                          category: { type: "string", enum: ["blog", "social", "newsletter", "video"] },
                          suggestedPreset: { type: "string", enum: ["safety_tip", "compliance_tip", "product_update", "feature_announcement", "industry_insight", "operational_best_practice", "incident_learning", "founder_update"] },
                        },
                        required: ["title", "description", "category", "suggestedPreset"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["ideas"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_ideas" } },
        }),
      });

      if (!response.ok) {
        const errResp = handleError(response.status);
        if (errResp) return errResp;
        const text = await response.text();
        console.error("AI gateway error:", response.status, text);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const ideas = toolCall ? JSON.parse(toolCall.function.arguments).ideas : [];

      return new Response(JSON.stringify({ ideas }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DRAFT ──
    if (type === "draft") {
      const lang = language || "no";
      const plat = platform || "linkedin";
      const systemPrompt = buildDraftSystemPrompt({
        platform: plat,
        language: lang,
        preset,
        structure,
        presetConfig,
        brandSettings,
      });

      const count = variantCount && variantCount > 1 ? Math.min(variantCount, 3) : 1;
      const isMulti = count > 1;

      const userPrompt = isMulti
        ? `Generate ${count} distinct variants of a ${plat} post about: ${ideaTitle}. Each variant should take a different angle or approach while staying on topic.`
        : `Write a ${plat} post about: ${ideaTitle}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [isMulti ? variantsToolSchema : draftToolSchema],
          tool_choice: {
            type: "function",
            function: { name: isMulti ? "return_variants" : "return_draft" },
          },
        }),
      });

      if (!response.ok) {
        const errResp = handleError(response.status);
        if (errResp) return errResp;
        const text = await response.text();
        console.error("AI gateway error:", response.status, text);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No structured output returned");

      const parsed = JSON.parse(toolCall.function.arguments);

      if (isMulti) {
        return new Response(JSON.stringify({ variants: parsed.variants }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Compose full content from structured fields
      const fullContent = [parsed.hook, "", parsed.body, "", parsed.cta, "", parsed.hashtags?.map((h: string) => `#${h}`).join(" ")].join("\n").trim();

      return new Response(JSON.stringify({
        content: fullContent,
        structured: parsed,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid type. Use 'ideas' or 'draft'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("marketing-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
