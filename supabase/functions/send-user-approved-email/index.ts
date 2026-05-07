import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { fixEmailImages } from "../_shared/template-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserApprovedRequest {
  user_id: string;
  user_name: string;
  user_email: string;
  company_name: string;
  company_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, user_name, user_email, company_name, company_id }: UserApprovedRequest = await req.json();
    if (!user_email) {
      return new Response(JSON.stringify({ message: "No email provided" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: template } = await supabase.from('email_templates').select('id, subject, content').eq('company_id', company_id).eq('template_type', 'user_approved').maybeSingle();

    let emailSubject = `Din bruker hos ${company_name} er godkjent`;
    let emailContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Hei ${user_name}!</h2><p>Din bruker hos <strong>${company_name}</strong> er nå godkjent.</p></body></html>`;

    if (template) {
      emailSubject = template.subject.replace(/\{\{user_name\}\}/g, user_name).replace(/\{\{company_name\}\}/g, company_name);
      emailContent = template.content.replace(/\{\{user_name\}\}/g, user_name).replace(/\{\{company_name\}\}/g, company_name);
    }

    emailContent = fixEmailImages(emailContent);

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: user_email, subject: sanitizeSubject(emailSubject), html: emailContent });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
