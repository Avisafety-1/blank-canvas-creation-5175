import { supabase } from "@/integrations/supabase/client";

type NotificationType = 
  | 'email_new_incident' 
  | 'email_new_mission' 
  | 'email_document_expiry' 
  | 'email_new_user_pending' 
  | 'email_followup_assigned';

interface SendNotificationParams {
  recipientId: string;
  notificationType: NotificationType;
  subject: string;
  htmlContent: string;
  companyId?: string;
}

export const sendNotificationEmail = async ({
  recipientId,
  notificationType,
  subject,
  htmlContent,
  companyId,
}: SendNotificationParams) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification-email', {
      body: {
        recipientId,
        notificationType,
        subject,
        htmlContent,
        companyId,
      },
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error };
  }
};

// Helper for generating HTML content for incident notifications
export const generateIncidentNotificationHTML = (incident: {
  tittel: string;
  beskrivelse?: string;
  alvorlighetsgrad: string;
  lokasjon?: string;
}) => {
  const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';
  return `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.logo { text-align: center; padding: 20px 20px 10px 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
.severity-Lav { background: #dbeafe; color: #1e40af; }
.severity-Middels { background: #fef3c7; color: #92400e; }
.severity-Høy { background: #fed7aa; color: #9a3412; }
.severity-Kritisk { background: #fee2e2; color: #991b1b; }
.button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
</style>
</head>
<body>
<div class="container">
<div class="logo">
  <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
</div>
<div class="header">
<h1>Du er satt som oppfølgingsansvarlig</h1>
</div>
<div class="content">
<h2>${incident.tittel}</h2>
<p><strong>Alvorlighetsgrad:</strong> <span class="severity severity-${incident.alvorlighetsgrad}">${incident.alvorlighetsgrad}</span></p>
${incident.lokasjon ? `<p><strong>Lokasjon:</strong> ${incident.lokasjon}</p>` : ''}
${incident.beskrivelse ? `<p><strong>Beskrivelse:</strong><br>${incident.beskrivelse}</p>` : ''}
<p style="margin-top: 20px;">Logg inn i Avisafe for å følge opp denne hendelsen.</p>
</div>
</div>
</body>
</html>`;
};

