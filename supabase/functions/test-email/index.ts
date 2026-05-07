import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, recipient_email, subject: customSubject } = await req.json();

    if (!company_id || !recipient_email) {
      return new Response(JSON.stringify({ error: "company_id and recipient_email are required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    
    const rawSubject = customSubject || "Test e-post fra ditt system";
    const subject = sanitizeSubject(rawSubject);

    console.log("=== Email Debug Info ===");
    console.log("From:", senderAddress);
    console.log("To:", recipient_email);
    console.log("Subject:", subject);
    console.log("========================");

    await sendEmail({
      from: senderAddress,
      to: recipient_email,
      subject: subject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>✓ Test e-post</h1><p>E-postinnstillingene fungerer korrekt.</p><p>From: ${senderAddress}</p><p>Subject: ${subject}</p><p>Sendt via Resend API.</p></body></html>`,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Test e-post sendt vellykket",
      debug: {
        from: senderAddress,
        to: recipient_email,
        subject: subject,
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Kunne ikke sende test e-post", details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
