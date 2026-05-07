import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_API = "https://graph.instagram.com/v22.0";

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

    let ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN")?.trim();
    const IG_ACCOUNT_ID = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")?.trim();
    const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET")?.trim();

    if (!ACCESS_TOKEN || !IG_ACCOUNT_ID) {
      return new Response(
        JSON.stringify({ error: "Instagram er ikke konfigurert. Legg til INSTAGRAM_ACCESS_TOKEN og INSTAGRAM_BUSINESS_ACCOUNT_ID i secrets." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to exchange short-lived token for long-lived token if app secret is available
    if (APP_SECRET) {
      try {
        const exchangeUrl = `${IG_API}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(APP_SECRET)}&access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
        const exchangeRes = await fetch(exchangeUrl);
        const exchangeData = await exchangeRes.json();
        if (exchangeRes.ok && exchangeData.access_token) {
          ACCESS_TOKEN = exchangeData.access_token;
          console.log("Successfully exchanged for long-lived token, expires_in:", exchangeData.expires_in);
        } else {
          console.log("Token exchange skipped (may already be long-lived):", JSON.stringify(exchangeData));
        }
      } catch (e) {
        console.log("Token exchange failed, using original token:", e);
      }
    }

    const { text, imageUrl, draftId } = await req.json();

    if (!imageUrl?.trim()) {
      return new Response(
        JSON.stringify({ error: "Instagram krever et bilde. Legg til et bilde i utkastet først." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the token works by checking the account
    const meRes = await fetch(`${IG_API}/me?fields=id,username`, {
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` },
    });
    const meData = await meRes.json();
    console.log("Instagram /me response:", JSON.stringify(meData));

    if (!meRes.ok) {
      return new Response(
        JSON.stringify({ error: `Instagram token ugyldig: ${meData?.error?.message || "Ukjent feil"}. Generer et nytt token i developers.facebook.com.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = meData.id || IG_ACCOUNT_ID;

    // Step 1: Create media container
    console.log("Creating container for user:", userId);
    const containerRes = await fetch(`${IG_API}/${userId}/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: text || "",
      }),
    });

    const containerData = await containerRes.json();

    if (!containerRes.ok) {
      console.error("Instagram container error:", JSON.stringify(containerData));
      const errMsg = containerData?.error?.message || "Ukjent feil fra Instagram (container)";
      return new Response(
        JSON.stringify({ error: `Instagram-feil: ${errMsg}` }),
        { status: containerRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const creationId = containerData.id;
    console.log("Container created:", creationId);

    // Step 2: Wait for container to be ready (poll status)
    const MAX_POLLS = 15;
    const POLL_INTERVAL_MS = 2000;
    for (let i = 0; i < MAX_POLLS; i++) {
      const statusRes = await fetch(`${IG_API}/${creationId}?fields=status_code`, {
        headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` },
      });
      const statusData = await statusRes.json();
      console.log(`Poll ${i + 1}/${MAX_POLLS}: status_code=${statusData.status_code}`);

      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        return new Response(
          JSON.stringify({ error: `Instagram medieprosessering feilet: ${JSON.stringify(statusData)}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (i === MAX_POLLS - 1) {
        return new Response(
          JSON.stringify({ error: "Instagram brukte for lang tid på å prosessere bildet. Prøv igjen." }),
          { status: 408, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Step 3: Publish the container
    const publishRes = await fetch(`${IG_API}/${userId}/media_publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        creation_id: creationId,
      }),
    });

    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      console.error("Instagram publish error:", JSON.stringify(publishData));
      const errMsg = publishData?.error?.message || "Ukjent feil fra Instagram (publish)";
      return new Response(
        JSON.stringify({ error: `Instagram-feil: ${errMsg}` }),
        { status: publishRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const postId = publishData.id;
    const postUrl = `https://www.instagram.com/p/${postId}/`;
    console.log("Published successfully:", postUrl);

    // Update draft if draftId provided
    if (draftId) {
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
            instagram_post_id: postId,
            instagram_post_url: postUrl,
          },
        })
        .eq("id", draftId);
    }

    return new Response(
      JSON.stringify({ success: true, postId, postUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("publish-instagram error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Ukjent feil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
