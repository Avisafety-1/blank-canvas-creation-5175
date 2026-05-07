// Auto-sync user email to Resend Audience.
// Called by DB triggers on public.profiles (insert/update/delete).
// No JWT required — protected by SYNC_WEBHOOK_SECRET shared with the trigger function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
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
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json, raw: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!audienceId) throw new Error("RESEND_AUDIENCE_ID not configured");

    // Optional shared-secret check (used by DB triggers)
    const expectedSecret = Deno.env.get("SYNC_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-sync-secret");
    if (expectedSecret && providedSecret !== expectedSecret) {
      // Allow service-role auth as fallback for backfill etc.
      const auth = req.headers.get("authorization") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!serviceKey || !auth.includes(serviceKey)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { action, email, first_name, last_name, old_email } = body as {
      action: "upsert" | "delete";
      email?: string;
      first_name?: string;
      last_name?: string;
      old_email?: string;
    };

    const norm = (e?: string) => (e || "").trim().toLowerCase();
    const newEmail = norm(email);
    const prevEmail = norm(old_email);

    if (action === "delete") {
      if (!newEmail) return new Response(JSON.stringify({ skipped: "no email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const r = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(newEmail)}`, { method: "DELETE" });
      return new Response(JSON.stringify({ action, email: newEmail, status: r.status, body: r.body }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert") {
      if (!newEmail || !newEmail.includes("@")) {
        return new Response(JSON.stringify({ skipped: "invalid email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If email changed, remove the old contact (best-effort)
      if (prevEmail && prevEmail !== newEmail) {
        await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(prevEmail)}`, { method: "DELETE" });
      }

      // Try create
      const create = await resendFetch(`/audiences/${audienceId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          first_name: first_name || "",
          last_name: last_name || "",
          unsubscribed: false,
        }),
      });

      // If already exists, patch name (do NOT flip unsubscribed back to false — respect user opt-out)
      if (!create.ok && create.status === 409) {
        const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(newEmail)}`, {
          method: "PATCH",
          body: JSON.stringify({ first_name: first_name || "", last_name: last_name || "" }),
        });
        return new Response(JSON.stringify({ action: "updated", email: newEmail, status: patch.status, body: patch.body }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ action: "created", email: newEmail, status: create.status, body: create.body }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-user-to-resend-audience error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
