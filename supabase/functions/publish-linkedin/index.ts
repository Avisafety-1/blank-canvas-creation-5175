import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LI_API = "https://api.linkedin.com";

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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, imageUrl, draftId } = await req.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "Tekst er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's company
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("company_id")
      .eq("id", claimsData.claims.sub)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "Ingen bedrift funnet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get decrypted token
    const ENCRYPTION_KEY = Deno.env.get("FH2_ENCRYPTION_KEY");
    if (!ENCRYPTION_KEY) {
      return new Response(JSON.stringify({ error: "Krypteringsnøkkel mangler" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenRow, error: tokenErr } = await supabaseAdmin.rpc(
      "get_linkedin_token",
      { p_company_id: profile.company_id, p_encryption_key: ENCRYPTION_KEY }
    );

    if (tokenErr || !tokenRow || tokenRow.length === 0) {
      return new Response(
        JSON.stringify({ error: "LinkedIn er ikke koblet til. Gå til Innstillinger for å koble til." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const liToken = tokenRow[0];
    const accessToken = liToken.access_token;
    const memberUrn = liToken.member_urn;

    // Build post payload
    let postPayload: any = {
      author: memberUrn,
      lifecycleState: "PUBLISHED",
      visibility: "PUBLIC",
      commentary: text.trim(),
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
    };

    // Handle image upload if provided
    if (imageUrl) {
      // Step 1: Initialize upload
      const initRes = await fetch(`${LI_API}/rest/images?action=initializeUpload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: memberUrn,
          },
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok) {
        console.error("LinkedIn image init error:", JSON.stringify(initData));
        return new Response(
          JSON.stringify({ error: "Kunne ikke initialisere bildeopplasting til LinkedIn" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploadUrl = initData.value?.uploadUrl;
      const imageUrn = initData.value?.image;

      if (!uploadUrl || !imageUrn) {
        console.error("Missing uploadUrl or imageUrn:", JSON.stringify(initData));
        return new Response(
          JSON.stringify({ error: "LinkedIn returnerte ikke opplastings-URL" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 2: Download image and upload to LinkedIn
      const imgRes = await fetch(imageUrl);
      const imgBlob = await imgRes.blob();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": imgBlob.type || "image/jpeg",
        },
        body: imgBlob,
      });

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        console.error("LinkedIn image upload error:", uploadErr);
        return new Response(
          JSON.stringify({ error: "Kunne ikke laste opp bilde til LinkedIn" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Add image to post
      postPayload.content = {
        media: {
          title: "Image",
          id: imageUrn,
        },
      };
    }

    // Step 3: Create post
    const postRes = await fetch(`${LI_API}/rest/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postPayload),
    });

    if (!postRes.ok) {
      const postErr = await postRes.json();
      console.error("LinkedIn post error:", JSON.stringify(postErr));
      return new Response(
        JSON.stringify({ error: postErr?.message || "Kunne ikke publisere til LinkedIn" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LinkedIn returns the post URN in the x-restli-id header
    const postUrn = postRes.headers.get("x-restli-id") || "";
    // Construct a LinkedIn post URL
    const postUrlId = postUrn.replace("urn:li:share:", "").replace("urn:li:ugcPost:", "");
    const postUrl = postUrlId ? `https://www.linkedin.com/feed/update/${postUrn}/` : "";

    // Update draft if draftId provided
    if (draftId) {
      const { data: existing } = await supabaseAdmin
        .from("marketing_drafts")
        .select("metadata")
        .eq("id", draftId)
        .single();

      await supabaseAdmin
        .from("marketing_drafts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existing?.metadata as any || {}),
            linkedin_post_urn: postUrn,
            linkedin_post_url: postUrl,
          },
        })
        .eq("id", draftId);
    }

    console.log(`Published to LinkedIn: ${postUrn}`);

    return new Response(
      JSON.stringify({ success: true, postUrn, postUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("publish-linkedin error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
