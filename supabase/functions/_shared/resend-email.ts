export interface EmailAttachment {
  filename: string;
  content: string; // base64
  content_id?: string; // for inline (cid:)
  content_type?: string;
}

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/**
 * Send an email via the Resend HTTP API.
 * Requires RESEND_API_KEY to be set as an edge function secret.
 */
export async function sendEmail({ from, to, subject, html, replyTo, attachments }: SendEmailParams) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  if (attachments && attachments.length > 0) {
    body.attachments = attachments;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }

  return await res.json();
}

