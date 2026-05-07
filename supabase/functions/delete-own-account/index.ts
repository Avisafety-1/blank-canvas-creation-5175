import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);

    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const targetUserId = user.id;
    console.log("delete-own-account: deleting", { targetUserId });

    // ============================================================
    // SET NULL — preserve company data, just remove user reference
    // ============================================================
    const nullifyErrors: string[] = [];

    const setNull = async (table: string, column: string) => {
      const { error } = await admin.from(table).update({ [column]: null }).eq(column, targetUserId);
      if (error) {
        console.error(`SET NULL failed: ${table}.${column}`, error.message);
        nullifyErrors.push(`${table}.${column}: ${error.message}`);
      }
    };

    await Promise.all([
      setNull("calendar_events", "user_id"),
      setNull("customers", "user_id"),
      setNull("dji_credentials", "user_id"),
      setNull("documents", "user_id"),
      setNull("drone_accessories", "user_id"),
      setNull("drone_equipment_history", "user_id"),
      setNull("drone_inspections", "user_id"),
      setNull("drone_log_entries", "user_id"),
      setNull("drones", "user_id"),
      setNull("dronetag_devices", "user_id"),
      setNull("equipment", "user_id"),
      setNull("equipment_log_entries", "user_id"),
      setNull("flight_logs", "user_id"),
      setNull("incident_comments", "user_id"),
      setNull("incidents", "user_id"),
      setNull("incidents", "oppfolgingsansvarlig_id"),
      setNull("mission_risk_assessments", "pilot_id"),
      setNull("mission_sora", "prepared_by"),
      setNull("mission_sora", "approved_by"),
      setNull("missions", "user_id"),
      setNull("missions", "approved_by"),
      setNull("news", "user_id"),
      setNull("profiles", "approved_by"),
    ]);

    // Best-effort: tables that may or may not exist
    await Promise.all([
      setNull("pending_dji_logs", "user_id"),
      setNull("personnel_log_entries", "profile_id"),
      setNull("personnel_log_entries", "user_id"),
      setNull("incident_eccairs_mappings", "created_by"),
    ]);

    // ============================================================
    // DELETE — join tables with NOT NULL profile refs + session data
    // ============================================================
    await Promise.all([
      admin.from("drone_personnel").delete().eq("profile_id", targetUserId),
      admin.from("mission_personnel").delete().eq("profile_id", targetUserId),
      admin.from("flight_log_personnel").delete().eq("profile_id", targetUserId),
      admin.from("personnel_competencies").delete().eq("profile_id", targetUserId),
      admin.from("push_subscriptions").delete().eq("user_id", targetUserId),
      admin.from("map_viewer_heartbeats").delete().eq("user_id", targetUserId),
      admin.from("calendar_subscriptions").delete().eq("user_id", targetUserId),
      admin.from("active_flights").delete().eq("profile_id", targetUserId),
      admin.from("notification_preferences").delete().eq("user_id", targetUserId),
    ]);

    // Roles + profile
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("id", targetUserId);

    // Finally: delete auth user
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delAuthErr) {
      console.error("auth.admin.deleteUser failed", delAuthErr);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", details: delAuthErr.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    console.log("delete-own-account: deleted", { targetUserId, nullifyErrors });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error in delete-own-account:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
