import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

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

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub;

    const { companyId, enable, selfProvision } = await req.json();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check authorization: superadmin OR self-provision by company administrator
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const isSuperAdmin = roleData?.role === "superadmin";
    const isCompanyAdmin = ["administrator", "admin"].includes(roleData?.role || "");

    if (selfProvision && isCompanyAdmin) {
      // Verify the caller belongs to this company
      const { data: profileData } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (profileData?.company_id !== companyId) {
        return new Response(JSON.stringify({ error: "Forbidden: not your company" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const masterKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!masterKey) {
      return new Response(JSON.stringify({ error: "DRONELOG_AVISAFE_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get company name
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("navn, dronelog_api_key")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (enable) {
      // Create new key via DroneLog API
      const res = await fetch(`${DRONELOG_BASE}/keys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${masterKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ name: company.navn }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("DroneLog create key error:", res.status, data);
        return new Response(JSON.stringify({ error: "Failed to create DroneLog key", details: data }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // The API returns the key in data.result.key or data.key
      const newKey = data?.result?.key || data?.key || data?.result?.api_key || data?.api_key;
      if (!newKey) {
        console.error("DroneLog key response missing key field:", JSON.stringify(data));
        return new Response(JSON.stringify({ error: "DroneLog API returned no key", response: data }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Save to database using service role for update
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error: updateError } = await serviceClient
        .from("companies")
        .update({ dji_flightlog_enabled: true, dronelog_api_key: newKey })
        .eq("id", companyId);

      if (updateError) {
        console.error("DB update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to save key to database" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, enabled: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // Deactivate: delete key from DroneLog if exists
      if (company.dronelog_api_key) {
        try {
          const res = await fetch(`${DRONELOG_BASE}/keys/${company.dronelog_api_key}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${masterKey}`,
              Accept: "application/json",
            },
          });
          const body = await res.text();
          console.log("DroneLog delete key response:", res.status, body);
        } catch (err) {
          console.error("DroneLog delete key error (non-fatal):", err);
        }
      }

      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error: updateError } = await serviceClient
        .from("companies")
        .update({ dji_flightlog_enabled: false, dronelog_api_key: null })
        .eq("id", companyId);

      if (updateError) {
        console.error("DB update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update database" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, enabled: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("manage-dronelog-key error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
