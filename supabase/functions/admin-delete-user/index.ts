import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  user_id?: string;
  email?: string;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ---- Authenticate requester ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requester },
      error: requesterErr,
    } = await admin.auth.getUser(token);

    if (requesterErr || !requester) {
      console.error("auth.getUser failed", requesterErr);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    // ---- Parse body ----
    const body = (await req.json().catch(() => ({}))) as Body;
    const userIdFromBody = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const emailFromBody = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!userIdFromBody && !emailFromBody) {
      return new Response(
        JSON.stringify({ error: "Missing user_id or email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // ---- Authorization: superadmin or admin ----
    const { data: requesterRoleRows, error: requesterRoleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id);

    if (requesterRoleErr) {
      console.error("Failed reading requester roles", requesterRoleErr);
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    const requesterRoles = new Set((requesterRoleRows ?? []).map((r) => r.role));
    const isSuperadmin = requesterRoles.has("superadmin");
    const isAdmin = requesterRoles.has("administrator") || requesterRoles.has("admin");

    if (!isSuperadmin && !isAdmin) {
      console.error("admin-delete-user: requester has no admin role", { roles: [...requesterRoles] });
      return new Response(
        JSON.stringify({ error: "Forbidden", stage: "authorization", detail: "Requester lacks admin role" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // ---- Prevent non-superadmin from deleting superadmin ----
    // (checked after target user is resolved below)

    // ---- Resolve target user id ----
    let targetUserId = userIdFromBody;

    if (!targetUserId && emailFromBody) {
      if (!isSuperadmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden - superadmin only" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }

      const { data: prof } = await admin
        .from("profiles")
        .select("id")
        .eq("email", emailFromBody)
        .maybeSingle();

      if (prof?.id) {
        targetUserId = prof.id;
      } else {
        const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
        if (listErr) {
          console.error("admin.listUsers failed", listErr);
          return new Response(
            JSON.stringify({ error: "Failed to lookup user" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
          );
        }
        const match = (listData?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === emailFromBody);
        if (!match?.id) {
          return new Response(
            JSON.stringify({ error: "User not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }
        targetUserId = match.id;
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
      );
    }

    // ---- Prevent non-superadmin from deleting a superadmin ----
    if (!isSuperadmin) {
      const { data: targetRoleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);

      const targetRoles = new Set((targetRoleRows ?? []).map((r) => r.role));
      if (targetRoles.has("superadmin")) {
        console.error("admin-delete-user: non-superadmin tried to delete superadmin");
        return new Response(
          JSON.stringify({ error: "Forbidden", stage: "authorization", detail: "Cannot delete superadmin" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }
    }

    // ---- If requester is only admin (not superadmin), enforce same-company ----
    if (!isSuperadmin) {
      const { data: requesterProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", requester.id)
        .maybeSingle();

      const { data: targetProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (!requesterProfile?.company_id || !targetProfile?.company_id ||
          requesterProfile.company_id !== targetProfile.company_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden", stage: "authorization", detail: "Different company" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }
    }

    console.log("admin-delete-user: deleting", { targetUserId, requestedBy: requester.id });

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

    // Run all SET NULL operations (order doesn't matter)
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
      // Join tables (NOT NULL profile_id — can't SET NULL, must DELETE)
      admin.from("drone_personnel").delete().eq("profile_id", targetUserId),
      admin.from("mission_personnel").delete().eq("profile_id", targetUserId),
      admin.from("flight_log_personnel").delete().eq("profile_id", targetUserId),
      admin.from("personnel_competencies").delete().eq("profile_id", targetUserId),
      // Session / device data
      admin.from("push_subscriptions").delete().eq("user_id", targetUserId),
      admin.from("map_viewer_heartbeats").delete().eq("user_id", targetUserId),
      admin.from("calendar_subscriptions").delete().eq("user_id", targetUserId),
      admin.from("active_flights").delete().eq("profile_id", targetUserId),
      admin.from("notification_preferences").delete().eq("user_id", targetUserId),
    ]);

    // Roles + profile (must be before auth delete)
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("id", targetUserId);

    // Finally: delete auth user
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delAuthErr) {
      console.error("auth.admin.deleteUser failed", delAuthErr);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", details: delAuthErr.message, nullifyErrors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    console.log("admin-delete-user: deleted", { targetUserId, nullifyErrors });

    return new Response(
      JSON.stringify({ success: true, user_id: targetUserId, warnings: nullifyErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error in admin-delete-user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
