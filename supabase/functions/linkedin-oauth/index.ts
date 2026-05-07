import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LINKEDIN_API = "https://www.linkedin.com/oauth/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ENCRYPTION_KEY = Deno.env.get("FH2_ENCRYPTION_KEY");

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: "LinkedIn er ikke konfigurert" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/linkedin-oauth?action=callback`;

    // ── ACTION: authorize ──
    if (action === "authorize") {
      const body = await req.json();
      const { companyId } = body;
      if (!companyId) {
        return new Response(JSON.stringify({ error: "companyId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = btoa(JSON.stringify({ companyId }));
      const authUrl =
        `${LINKEDIN_API}/authorization?response_type=code` +
        `&client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}` +
        `&scope=w_member_social`;

      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: callback ──
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        return new Response(
          `<html><body><h2>LinkedIn-kobling avbrutt</h2><p>${errorParam}</p><script>window.close()</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      if (!code || !stateParam) {
        return new Response(
          `<html><body><h2>Ugyldig forespørsel</h2><script>window.close()</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      let companyId: string;
      try {
        const parsed = JSON.parse(atob(stateParam));
        companyId = parsed.companyId;
      } catch {
        return new Response(
          `<html><body><h2>Ugyldig state</h2><script>window.close()</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      // Exchange code for tokens
      const tokenRes = await fetch(`${LINKEDIN_API}/accessToken`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("LinkedIn token exchange error:", JSON.stringify(tokenData));
        return new Response(
          `<html><body><h2>Kunne ikke hente token</h2><p>${tokenData.error_description || "Ukjent feil"}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const expiresIn = tokenData.expires_in || 5184000; // 60 days default

      // Try multiple endpoints to fetch member URN
      let memberUrn: string | null = null;

      // Attempt 1: Community Management REST API
      const restMeRes = await fetch("https://api.linkedin.com/rest/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": "202401",
        },
      });
      if (restMeRes.ok) {
        const restMeData = await restMeRes.json();
        console.log("REST /me response:", JSON.stringify(restMeData));
        if (restMeData.sub) {
          memberUrn = `urn:li:person:${restMeData.sub}`;
        } else if (restMeData.id) {
          memberUrn = `urn:li:person:${restMeData.id}`;
        }
      } else {
        console.log("REST /me failed:", restMeRes.status, await restMeRes.text());
      }

      // Attempt 2: Legacy /v2/me
      if (!memberUrn) {
        const meRes = await fetch("https://api.linkedin.com/v2/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          console.log("v2/me response:", JSON.stringify(meData));
          if (meData.id) {
            memberUrn = `urn:li:person:${meData.id}`;
          }
        } else {
          console.log("v2/me failed:", meRes.status, await meRes.text());
        }
      }

      // Attempt 3: /v2/userinfo (if openid scope happens to be available)
      if (!memberUrn) {
        const uiRes = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (uiRes.ok) {
          const uiData = await uiRes.json();
          console.log("userinfo response:", JSON.stringify(uiData));
          if (uiData.sub) {
            memberUrn = `urn:li:person:${uiData.sub}`;
          }
        } else {
          console.log("userinfo failed:", uiRes.status, await uiRes.text());
        }
      }

      if (!memberUrn) {
        console.error("Could not fetch LinkedIn member URN from any endpoint");
        return new Response(
          `<html><body><h2>Kunne ikke hente LinkedIn-profil. Sjekk at LinkedIn-appen har riktige produkter aktivert (Community Management API).</h2><script>setTimeout(()=>window.close(),5000)</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      // Store encrypted tokens
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

      if (!ENCRYPTION_KEY) {
        console.error("FH2_ENCRYPTION_KEY not set");
        return new Response(
          `<html><body><h2>Krypteringsnøkkel mangler</h2><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const { error: upsertErr } = await supabase.rpc("upsert_linkedin_token", {
        p_company_id: companyId,
        p_access_token: accessToken,
        p_refresh_token: refreshToken || "",
        p_member_urn: memberUrn,
        p_expires_at: expiresAt,
        p_encryption_key: ENCRYPTION_KEY,
      });

      if (upsertErr) {
        console.error("Error storing LinkedIn token:", upsertErr);
        return new Response(
          `<html><body><h2>Kunne ikke lagre token</h2><p>${upsertErr.message}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      console.log(`LinkedIn connected for company ${companyId}, member ${memberUrn}`);

      return new Response(
        `<html><body><h2>✅ LinkedIn koblet til!</h2><p>Du kan lukke dette vinduet.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ── ACTION: status (check if connected) ──
    if (action === "status") {
      const body = await req.json();
      const { companyId } = body;
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

      const { data, error } = await supabase
        .from("linkedin_tokens")
        .select("member_urn, expires_at")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          connected: !!data,
          memberUrn: data?.member_urn || null,
          expiresAt: data?.expires_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("linkedin-oauth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
