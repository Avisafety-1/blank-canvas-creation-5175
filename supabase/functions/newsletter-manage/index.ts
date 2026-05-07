import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_BASE = "https://api.resend.com";

async function resendFetch(path: string, opts: RequestInit = {}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function getAudienceId(): string {
  const id = Deno.env.get("RESEND_AUDIENCE_ID");
  if (!id) throw new Error("RESEND_AUDIENCE_ID not configured");
  return id;
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const audienceId = getAudienceId();

    // Public action — no auth required
    if (action === "public-subscribe") {
      const { email, first_name, last_name } = body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new Error("Ugyldig e-postadresse");
      }
      const result = await resendFetch(`/audiences/${audienceId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          first_name: first_name || "",
          last_name: last_name || "",
          unsubscribed: false,
        }),
      });
      return new Response(JSON.stringify({ ok: true, data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require superadmin auth
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: roleData } = await getAdminClient()
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .maybeSingle();

    if (!roleData) throw new Error("Forbidden: superadmin required");

    let result: unknown;

    switch (action) {
      case "list-contacts": {
        result = await resendFetch(`/audiences/${audienceId}/contacts`);
        break;
      }
      case "add-contact": {
        const { email, first_name, last_name } = body;
        result = await resendFetch(`/audiences/${audienceId}/contacts`, {
          method: "POST",
          body: JSON.stringify({ email, first_name: first_name || "", last_name: last_name || "", unsubscribed: false }),
        });
        break;
      }
      case "remove-contact": {
        const { contact_id } = body;
        result = await resendFetch(`/audiences/${audienceId}/contacts/${contact_id}`, {
          method: "DELETE",
        });
        break;
      }
      case "import-contacts": {
        const { emails } = body;
        const results: unknown[] = [];
        for (const email of emails) {
          try {
            const r = await resendFetch(`/audiences/${audienceId}/contacts`, {
              method: "POST",
              body: JSON.stringify({ email, unsubscribed: false }),
            });
            results.push({ email, ok: true, data: r });
          } catch (e) {
            results.push({ email, ok: false, error: (e as Error).message });
          }
        }
        result = { imported: results };
        break;
      }
      case "create-broadcast": {
        const { subject, html, from_name } = body;
        const broadcast = await resendFetch("/broadcasts", {
          method: "POST",
          body: JSON.stringify({
            audience_id: audienceId,
            from: `${from_name || "AviSafe"} <noreply@avisafe.no>`,
            subject,
            html,
          }),
        });
        await getAdminClient().from("newsletter_broadcasts").insert({
          subject,
          html_content: html,
          resend_broadcast_id: broadcast.id,
          status: "draft",
          created_by: user.id,
        });
        result = broadcast;
        break;
      }
      case "send-broadcast": {
        const { broadcast_id } = body;
        result = await resendFetch(`/broadcasts/${broadcast_id}/send`, {
          method: "POST",
        });
        await getAdminClient()
          .from("newsletter_broadcasts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("resend_broadcast_id", broadcast_id);
        break;
      }
      case "list-broadcasts": {
        const { data } = await getAdminClient()
          .from("newsletter_broadcasts")
          .select("*")
          .order("created_at", { ascending: false });
        result = data;
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result ?? { ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
