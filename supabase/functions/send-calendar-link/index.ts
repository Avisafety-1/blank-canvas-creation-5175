import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, feedUrl, companyId } = await req.json();

    if (!userId || !feedUrl || !companyId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Could not find user email" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await supabase.from("companies").select("navn").eq("id", companyId).single();
    const companyName = company?.navn || "AviSafe";

    const webcalUrl = feedUrl.replace('https://', 'webcal://');
    const googleCalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

    const htmlContent = `<!DOCTYPE html>
<html lang="no">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;color:#1a1a2e;margin:0 0 8px 0;">📅 Kalenderabonnement</h1>
      <p style="font-size:14px;color:#666;margin:0;">${companyName}</p>
    </div>
    <div style="background:#f8f9fa;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px 0;font-size:15px;">Her er din personlige kalenderlenke for automatisk synkronisering av oppdrag og hendelser.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${googleCalUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">📅 Abonner med Google Calendar</a>
      </div>
      <div style="text-align:center;margin:8px 0 0 0;">
        <a href="${feedUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ffffff;color:#1a1a2e;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:bold;border:2px solid #1a1a2e;">📅 Åpne kalenderlenke</a>
      </div>
    </div>
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;">
      <h2 style="font-size:16px;color:#1a1a2e;margin:0 0 8px 0;">Manuelt oppsett</h2>
      <p style="font-size:13px;color:#666;margin:0 0 12px 0;">Kopier denne URL-en og legg til manuelt i kalenderappen din:</p>
      <ul style="font-size:13px;color:#666;margin:0 0 12px 0;padding-left:20px;">
        <li><strong>Google Calendar:</strong> Legg til kalender → Fra URL</li>
        <li><strong>iPhone:</strong> Innstillinger → Kalender → Kontoer → Abonner</li>
        <li><strong>Outlook:</strong> Legg til kalender → Fra internett</li>
        <li><strong>Samsung:</strong> Kalender → Innstillinger → Legg til konto → ICS-lenke</li>
      </ul>
      <div style="background:#f0f0f0;border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#333;">${feedUrl}</div>
    </div>
    <p style="text-align:center;font-size:12px;color:#999;margin-top:32px;">Denne lenken er personlig og bør ikke deles med andre.</p>
  </div>
</body>
</html>`;

    const emailConfig = await getEmailConfig(companyId);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(`Din kalenderlenke – ${companyName}`), html: htmlContent });

    console.log(`Calendar link email sent to ${user.email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending calendar link email:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
