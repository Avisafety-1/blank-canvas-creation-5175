// Backfill all profile emails to Resend Audience. Superadmin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const RESEND_BASE = "https://api.resend.com";
async function resendFetch(path: string, opts: RequestInit = {}) {
  const apiKey = Deno.env.get("RESEND_API_KEY")!;
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!audienceId) throw new Error("RESEND_AUDIENCE_ID not configured");

    // Auth: superadmin only
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = getAdminClient();
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: superadmin required");

    // Fetch all profiles with email
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("email, full_name")
      .not("email", "is", null);
    if (error) throw error;

    let added = 0, updated = 0, failed = 0, skipped = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const p of profiles ?? []) {
      const email = (p.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) { skipped++; continue; }

      const fullName = (p.full_name || "").trim();
      const [first_name, ...rest] = fullName.split(" ");
      const last_name = rest.join(" ");

      try {
        const r = await resendFetch(`/audiences/${audienceId}/contacts`, {
          method: "POST",
          body: JSON.stringify({
            email,
            first_name: first_name || "",
            last_name: last_name || "",
            unsubscribed: false,
          }),
        });
        if (r.ok) {
          added++;
        } else if (r.status === 409) {
          // Already exists — patch names only
          const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
            method: "PATCH",
            body: JSON.stringify({ first_name: first_name || "", last_name: last_name || "" }),
          });
          if (patch.ok) updated++; else { failed++; errors.push({ email, error: `patch ${patch.status}` }); }
        } else {
          failed++;
          errors.push({ email, error: `create ${r.status}` });
        }
      } catch (e) {
        failed++;
        errors.push({ email, error: (e as Error).message });
      }

      // Smooth rate-limit
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({
      total: profiles?.length ?? 0, added, updated, failed, skipped, errors: errors.slice(0, 20),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-resend-audience error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
