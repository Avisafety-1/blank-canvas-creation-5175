import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailConfig {
  fromName?: string;
  fromEmail: string;
}

// Sanitize subject line - remove control characters only
export function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n]/g, ' ').trim();
}

// @deprecated - Use sanitizeSubject instead
export function encodeSubject(subject: string): string {
  console.warn('encodeSubject is deprecated - use sanitizeSubject instead');
  return sanitizeSubject(subject);
}

// Format sender address as RFC 5322 compliant string
export function formatSenderAddress(fromName: string | undefined, fromEmail: string): string {
  const email = fromEmail.toLowerCase();
  
  if (!fromName) {
    return email;
  }
  
  const hasNonAscii = /[^\x00-\x7F]/.test(fromName);
  
  if (hasNonAscii) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(fromName);
    const base64 = btoa(String.fromCharCode(...bytes));
    return `=?UTF-8?B?${base64}?= <${email}>`;
  }
  
  const hasSpecialChars = /[()<>\[\]:;@\\,."']/.test(fromName);
  
  if (hasSpecialChars) {
    const escapedName = fromName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escapedName}" <${email}>`;
  }
  
  return `${fromName} <${email}>`;
}

/**
 * Fetches email sender configuration from database, falls back to defaults.
 * With Resend, we only need fromName and fromEmail — no SMTP credentials.
 */
export async function getEmailConfig(companyId?: string): Promise<EmailConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let fromName: string | undefined;
  let fromEmail: string | undefined;

  if (companyId) {
    const { data: emailSettings, error: settingsError } = await supabase
      .from('email_settings')
      .select('from_name, from_email, enabled')
      .eq('company_id', companyId)
      .eq('enabled', true)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching email settings:", settingsError);
    }

    if (emailSettings) {
      fromName = emailSettings.from_name || undefined;
      fromEmail = emailSettings.from_email || undefined;
    }
  }

  // Default fallback
  if (!fromEmail) {
    fromEmail = 'noreply@avisafe.no';
    fromName = fromName || 'AviSafe';
  }

  return { fromName, fromEmail };
}
