import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleData?.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const masterKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!masterKey) {
      return new Response(JSON.stringify({ error: "DRONELOG_AVISAFE_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { from, to, companyId } = await req.json();

    // Determine which key to use
    let apiKey = masterKey;
    let keyScope: "master" | "company" = "master";
    let companyName: string | null = null;

    if (companyId) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: company } = await serviceClient
        .from("companies")
        .select("navn, dronelog_api_key")
        .eq("id", companyId)
        .single();

      if (company?.dronelog_api_key) {
        apiKey = company.dronelog_api_key;
        keyScope = "company";
        companyName = company.navn;
        console.log(`[dronelog-usage] Using company key for ${company.navn} (${companyId})`);
      } else {
        console.log(`[dronelog-usage] Company ${companyId} has no own key, falling back to master`);
      }
    }

    const keyFingerprint = apiKey.substring(0, 6) + "…";
    console.log(`[dronelog-usage] key=${keyFingerprint} scope=${keyScope}`);

    const params = new URLSearchParams();
    if (from) params.set("startDate", from);
    if (to) params.set("endDate", to);
    params.set("limit", "100");

    const url = `https://dronelogapi.com/api/v1/usage?${params.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const data = await res.json().catch(() => null);
    console.log("[dronelog-usage] response:", JSON.stringify(data));
    if (!res.ok) {
      console.error("[dronelog-usage] error:", res.status, data);
      return new Response(JSON.stringify({ error: "Failed to fetch usage", details: data }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Attach metadata about which key was used
    const result = typeof data === "object" && data !== null ? { ...data, _keyScope: keyScope, _companyName: companyName } : data;

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("dronelog-usage error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
