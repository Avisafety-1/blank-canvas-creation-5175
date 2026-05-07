import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get authorization header to verify user is superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Decode JWT locally to avoid session_not_found network errors
    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid JWT");
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      const exp = payload.exp;
      if (!payload.sub || !exp || Date.now() / 1000 > exp) throw new Error("Token expired or invalid");
      userId = payload.sub;
    } catch {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Check if user is superadmin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "superadmin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden - superadmin only" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Check if breakdown by company is requested (via query param or body)
    const url = new URL(req.url);
    let breakdown = url.searchParams.get("breakdown") === "true";
    
    if (!breakdown && req.method === "POST") {
      try {
        const body = await req.json();
        breakdown = body?.breakdown === true;
      } catch {}
    }

    if (breakdown) {
      // Get all companies
      const { data: companies, error: compError } = await supabase
        .from("companies")
        .select("id, navn")
        .order("navn");

      if (compError) throw compError;

      // Get all profiles with company_id
      const { data: profiles, error: profError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("approved", true)
        .not("email", "is", null);

      if (profError) throw profError;

      const countMap: Record<string, number> = {};
      (profiles || []).forEach((p: any) => {
        if (p.company_id) {
          countMap[p.company_id] = (countMap[p.company_id] || 0) + 1;
        }
      });

      const result = (companies || []).map((c: any) => ({
        id: c.id,
        navn: c.navn,
        userCount: countMap[c.id] || 0,
      }));

      const total = Object.values(countMap).reduce((a: number, b: number) => a + b, 0);

      return new Response(
        JSON.stringify({ companies: result, total }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Original: count all approved users with email
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("approved", true)
      .not("email", "is", null);

    if (countError) {
      console.error("Error counting users:", countError);
      throw countError;
    }

    return new Response(
      JSON.stringify({ count: count || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in count-all-users:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
