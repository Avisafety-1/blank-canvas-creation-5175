import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "E-post er påkrevd" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lowerEmail = email.toLowerCase();
    let user: any = null;
    let page = 1;
    const perPage = 1000;
    while (!user) {
      const { data, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listErr) {
        console.error("listUsers error:", listErr);
        break;
      }
      const users = data?.users ?? [];
      user = users.find((u: any) => u.email?.toLowerCase() === lowerEmail);
      if (user || users.length < perPage) break;
      page++;
    }

    if (!user) {
      console.log(`No user matched ${lowerEmail} after pagination`);
      return new Response(JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log(`Found user ${user.id} for ${lowerEmail}, generating reset link...`);

    const { data: profile } = await supabase.from('profiles').select('company_id, full_name').eq('id', user.id).maybeSingle();
    if (!profile) throw new Error("Kunne ikke hente brukerinfo");

    const { data: company } = await supabase.from('companies').select('navn').eq('id', profile.company_id).single();

    const { data } = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://login.avisafe.no/reset-password' } });
    if (!data?.properties?.action_link) throw new Error("Kunne ikke generere tilbakestillingslenke");

    const actionUrl = new URL(data.properties.action_link);
    const tokenHash = actionUrl.searchParams.get("token") || actionUrl.searchParams.get("token_hash");
    if (!tokenHash) throw new Error("Kunne ikke ekstrahere token fra lenke");
    const resetLink = `https://login.avisafe.no/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

    const templateResult = await getEmailTemplateWithFallback(profile.company_id, 'password_reset', { user_name: profile.full_name || '', reset_link: resetLink, company_name: company?.navn || 'AviSafe' });

    const emailConfig = await getEmailConfig(profile.company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });

    return new Response(JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "En feil oppstod" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
