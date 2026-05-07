import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function safeCount(table: string, sinceCol = "created_at", hoursBack = 24): Promise<number> {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const { count, error } = await admin
    .from(table as any)
    .select("*", { count: "exact", head: true })
    .gte(sinceCol, since);
  if (error) {
    console.warn(`count ${table} failed`, error.message);
    return -1;
  }
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { data: cfg } = await admin
      .from("monitoring_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!cfg || !cfg.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipients: string[] = cfg.recipient_emails ?? [];

    const [missions24, risk24, incidents24, flightLogs24] = await Promise.all([
      safeCount("missions"),
      safeCount("mission_risk_assessments"),
      safeCount("incidents"),
      safeCount("flight_logs"),
    ]);

    // Active users last 24h via auth.users.last_sign_in_at would need management API.
    // Instead, count distinct user_ids in flight_logs as a proxy.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recentAlerts } = await admin
      .from("monitoring_alerts")
      .select("alert_type, subject, sent_at")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(20);

    const html = `
      <h2>AviSafe Daglig drift-rapport</h2>
      <p>Periode: siste 24 timer</p>
      <h3>Aktivitet</h3>
      <ul>
        <li>Nye oppdrag: <b>${missions24}</b></li>
        <li>Risikovurderinger: <b>${risk24}</b></li>
        <li>Hendelser: <b>${incidents24}</b></li>
        <li>Flygelogger: <b>${flightLogs24}</b></li>
      </ul>
      <h3>Varsler siste døgn (${recentAlerts?.length ?? 0})</h3>
      ${
        recentAlerts && recentAlerts.length > 0
          ? `<ul>${recentAlerts.map((a) => `<li><b>${a.alert_type}</b> – ${a.subject} <i>(${new Date(a.sent_at).toLocaleString("nb-NO")})</i></li>`).join("")}</ul>`
          : "<p>Ingen varsler. ✅</p>"
      }
      <p style="color:#888;font-size:12px;margin-top:24px;">Automatisk generert av AviSafe Monitor.</p>
    `;

    for (const to of recipients) {
      try {
        await sendEmail({
          from: "AviSafe Monitor <noreply@avisafe.no>",
          to,
          subject: `AviSafe daglig drift-rapport ${new Date().toLocaleDateString("nb-NO")}`,
          html,
        });
      } catch (e) {
        console.error("digest send failed", to, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent_to: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("digest error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
