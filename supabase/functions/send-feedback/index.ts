import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub;

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, email, company_id')
      .eq('id', userId)
      .single();

    const senderName = profile?.full_name || 'Ukjent bruker';
    const senderEmail = profile?.email || 'ukjent';

    const { subject, message, imageUrl } = await req.json();

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Overskrift er påkrevd' }), { status: 400, headers: corsHeaders });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Melding er påkrevd' }), { status: 400, headers: corsHeaders });
    }
    if (subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Overskrift kan ikke være lengre enn 200 tegn' }), { status: 400, headers: corsHeaders });
    }
    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: 'Melding kan ikke være lengre enn 5000 tegn' }), { status: 400, headers: corsHeaders });
    }

    const imageSection = imageUrl
      ? `<p><strong>Vedlagt bilde:</strong></p><img src="${imageUrl}" alt="Vedlegg" style="max-width: 100%; max-height: 600px; border-radius: 8px; border: 1px solid #e5e7eb;" />`
      : '';

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2 style="color: #1a56db;">Tilbakemelding fra AviSafe</h2>
  <p><strong>Fra:</strong> ${senderName} (${senderEmail})</p>
  <p><strong>Emne:</strong> ${subject.trim()}</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <div style="white-space: pre-wrap;">${message.trim()}</div>
  ${imageSection}
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <p style="font-size: 12px; color: #6b7280;">Denne meldingen ble sendt via AviSafe tilbakemeldingsskjema.</p>
</body></html>`;

    const emailConfig = await getEmailConfig(profile?.company_id);

    await sendEmail({
      from: formatSenderAddress(emailConfig.fromName || 'AviSafe', emailConfig.fromEmail),
      to: 'support@avisafe.no',
      subject: sanitizeSubject(`Tilbakemelding: ${subject.trim()}`),
      html: htmlBody,
      replyTo: senderEmail,
    });

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (error) {
    console.error('Error sending feedback:', error);
    return new Response(JSON.stringify({ error: 'Kunne ikke sende tilbakemelding' }), { status: 500, headers: corsHeaders });
  }
});
