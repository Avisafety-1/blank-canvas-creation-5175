import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getTemplateAttachments, generateDownloadLinksHtml } from "../_shared/attachment-utils.ts";
import { fixEmailImages } from "../_shared/template-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CustomerWelcomeRequest {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  company_name: string;
  company_id: string;
}

serve(async (req) => {
  console.log("Customer welcome email function called");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_id, customer_name, customer_email, company_name, company_id }: CustomerWelcomeRequest = await req.json();
    console.log("Processing welcome email for customer:", customer_name, customer_email, "company_id:", company_id);

    if (!customer_email) {
      return new Response(JSON.stringify({ message: "No email provided" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('id, subject, content')
      .eq('company_id', company_id)
      .eq('template_type', 'customer_welcome')
      .maybeSingle();

    if (templateError) throw templateError;

    let emailSubject = `Velkommen som kunde hos ${company_name}`;
    let emailContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Hei ${customer_name}!</h2><p>Vi er glade for å ønske deg velkommen som kunde hos <strong>${company_name}</strong>.</p></body></html>`;

    if (template) {
      emailSubject = template.subject.replace(/\{\{customer_name\}\}/g, customer_name).replace(/\{\{company_name\}\}/g, company_name);
      emailContent = template.content.replace(/\{\{customer_name\}\}/g, customer_name).replace(/\{\{company_name\}\}/g, company_name);
    }

    emailContent = fixEmailImages(emailContent);

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: customer_email, subject: sanitizeSubject(emailSubject), html: emailContent });

    console.log("Customer welcome email sent successfully to:", customer_email);

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error("Error in send-customer-welcome-email function:", errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
