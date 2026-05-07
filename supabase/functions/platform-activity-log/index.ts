import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVISAFE_COMPANY_ID = "a6698b2d-8464-4f88-9bc4-ebcc072f629d";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify superadmin + Avisafe
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!roleData || roleData.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await admin
      .from("companies")
      .select("navn")
      .eq("id", profile.company_id)
      .single();

    if (!company || company.navn.toLowerCase() !== "avisafe") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse params
    const url = new URL(req.url);
    const excludeAvisafe = url.searchParams.get("exclude_avisafe") === "true";
    const limitParam = parseInt(url.searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(limitParam, 1), 200);

    // Fetch all companies and profiles for lookups
    const [companiesRes, profilesRes] = await Promise.all([
      admin.from("companies").select("id, navn"),
      admin.from("profiles").select("id, full_name, company_id"),
    ]);

    const companyMap = new Map<string, string>();
    for (const c of companiesRes.data || []) {
      companyMap.set(c.id, c.navn);
    }

    const profileMap = new Map<string, { name: string; companyId: string }>();
    for (const p of profilesRes.data || []) {
      profileMap.set(p.id, { name: p.full_name || "Ukjent", companyId: p.company_id });
    }

    // Query all 7 tables in parallel - fetch more than limit to allow merging
    const fetchLimit = limit * 2;

    const buildQuery = (table: string, columns: string) => {
      let q = admin.from(table).select(columns).order(
        table === "profiles" ? "created_at" :
        table === "mission_risk_assessments" ? "created_at" :
        "opprettet_dato",
        { ascending: false }
      ).limit(fetchLimit);

      if (excludeAvisafe) {
        q = q.neq("company_id", AVISAFE_COMPANY_ID);
      }
      return q;
    };

    const [missions, riskAssessments, incidents, documents, profiles, drones, equipment]: any[] =
      await Promise.all<any>([
        buildQuery("missions", "id, opprettet_dato, user_id, tittel, company_id"),
        buildQuery("mission_risk_assessments", "id, created_at, pilot_id, mission_id, company_id"),
        buildQuery("incidents", "id, opprettet_dato, user_id, tittel, company_id"),
        buildQuery("documents", "id, opprettet_dato, user_id, tittel, company_id, kategori"),
        buildQuery("profiles", "id, created_at, full_name, company_id"),
        buildQuery("drones", "id, opprettet_dato, user_id, modell, company_id"),
        buildQuery("equipment", "id, opprettet_dato, user_id, navn, company_id"),
      ]);

    // Build unified activity list
    type Activity = {
      type: string;
      description: string;
      person: string;
      company: string;
      timestamp: string;
    };

    const activities: Activity[] = [];

    for (const m of missions.data || []) {
      const p = profileMap.get(m.user_id);
      activities.push({
        type: "mission",
        description: m.tittel || "Nytt oppdrag",
        person: p?.name || "Ukjent",
        company: companyMap.get(m.company_id) || "Ukjent",
        timestamp: m.opprettet_dato,
      });
    }

    for (const r of riskAssessments.data || []) {
      const p = profileMap.get(r.pilot_id);
      activities.push({
        type: "risk_assessment",
        description: `Risikovurdering`,
        person: p?.name || "Ukjent",
        company: companyMap.get(r.company_id) || "Ukjent",
        timestamp: r.created_at,
      });
    }

    for (const i of incidents.data || []) {
      const p = i.user_id ? profileMap.get(i.user_id) : null;
      activities.push({
        type: "incident",
        description: i.tittel || "Ny hendelse",
        person: p?.name || "Ukjent",
        company: companyMap.get(i.company_id) || "Ukjent",
        timestamp: i.opprettet_dato,
      });
    }

    for (const d of documents.data || []) {
      const p = d.user_id ? profileMap.get(d.user_id) : null;
      activities.push({
        type: "document",
        description: d.tittel || "Nytt dokument",
        person: p?.name || "Ukjent",
        company: companyMap.get(d.company_id) || "Ukjent",
        timestamp: d.opprettet_dato,
      });
    }

    for (const pr of profiles.data || []) {
      activities.push({
        type: "new_user",
        description: pr.full_name || "Ny bruker",
        person: pr.full_name || "Ukjent",
        company: companyMap.get(pr.company_id) || "Ukjent",
        timestamp: pr.created_at,
      });
    }

    for (const dr of drones.data || []) {
      const p = profileMap.get(dr.user_id);
      activities.push({
        type: "drone",
        description: dr.modell || "Ny drone",
        person: p?.name || "Ukjent",
        company: companyMap.get(dr.company_id) || "Ukjent",
        timestamp: dr.opprettet_dato,
      });
    }

    for (const eq of equipment.data || []) {
      const p = profileMap.get(eq.user_id);
      activities.push({
        type: "equipment",
        description: eq.navn || "Nytt utstyr",
        person: p?.name || "Ukjent",
        company: companyMap.get(eq.company_id) || "Ukjent",
        timestamp: eq.opprettet_dato,
      });
    }

    // Sort by timestamp descending and limit
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const result = activities.slice(0, limit);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Platform activity log error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
