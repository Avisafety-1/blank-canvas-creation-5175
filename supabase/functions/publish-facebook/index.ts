import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
    const PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID");

    if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
      return new Response(
        JSON.stringify({ error: "Facebook er ikke konfigurert. Legg til Page Access Token og Page ID i innstillingene." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, imageUrl, draftId } = await req.json();

    if (!text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Tekst er påkrevd" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let fbResponse: Response;
    let endpoint: string;

    if (imageUrl) {
      // Post with image
      endpoint = `${GRAPH_API}/${PAGE_ID}/photos`;
      fbResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          url: imageUrl,
          access_token: PAGE_ACCESS_TOKEN,
        }),
      });
    } else {
      // Text-only post
      endpoint = `${GRAPH_API}/${PAGE_ID}/feed`;
      fbResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          access_token: PAGE_ACCESS_TOKEN,
        }),
      });
    }

    const fbData = await fbResponse.json();

    if (!fbResponse.ok) {
      console.error("Facebook API error:", JSON.stringify(fbData));
      const errMsg = fbData?.error?.message || "Ukjent feil fra Facebook";
      return new Response(
        JSON.stringify({ error: `Facebook-feil: ${errMsg}` }),
        { status: fbResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update draft status if draftId provided
    const postId = fbData.id || fbData.post_id;
    const postUrl = `https://facebook.com/${postId}`;

    if (draftId) {
      // First get current metadata
      const { data: currentDraft } = await supabase
        .from("marketing_drafts")
        .select("metadata")
        .eq("id", draftId)
        .single();

      await supabase
        .from("marketing_drafts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...((currentDraft?.metadata as any) || {}),
            facebook_post_id: postId,
            facebook_post_url: postUrl,
          },
        })
        .eq("id", draftId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        postUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("publish-facebook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Ukjent feil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
