import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_ROLES = ['administrator', 'admin', 'superadmin'];

async function getParentAdminIdsWithPreference(supabase: any, parentCompanyId: string, preferenceColumn: string): Promise<string[]> {
  const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ADMIN_ROLES);
  if (!roles?.length) return [];

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', parentCompanyId)
    .eq('approved', true)
    .in('id', roles.map((r: any) => r.user_id));
  if (!admins?.length) return [];

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', admins.map((a: any) => a.id))
    .eq(preferenceColumn, true);

  return [...new Set((prefs || []).map((p: any) => p.user_id))];
}

async function sendPushNotifications(supabase: any, companyId: string, title: string, body: string) {
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('approved', true);

    if (!profiles || profiles.length === 0) return;

    const userIds = profiles.map((p: any) => p.id);

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', userIds)
      .eq('push_enabled', true)
      .eq('push_document_expiry', true);

    if (!prefs || prefs.length === 0) return;

    const pushUserIds = prefs.map((p: any) => p.user_id);

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', pushUserIds);

    if (!subscriptions || subscriptions.length === 0) return;

    console.log(`Sending push notifications to ${subscriptions.length} subscriptions`);

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      console.error('VAPID keys not configured');
      return;
    }

    const webPush = await import("https://esm.sh/web-push@3.6.7");
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: { url: '/documents' }
    });

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        console.log(`Push sent to user ${sub.user_id}`);
      } catch (pushError: any) {
        console.error(`Push error for user ${sub.user_id}:`, pushError);
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          console.log(`Removed invalid subscription ${sub.id}`);
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for expiring documents...');

    const { data: expiringDocs, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .not('gyldig_til', 'is', null);

    if (docsError) throw docsError;

    if (!expiringDocs || expiringDocs.length === 0) {
      console.log('No documents with expiry dates found');
      return new Response(
        JSON.stringify({ success: true, message: 'No documents to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const documentsToNotify = expiringDocs.filter(doc => {
      if (!doc.gyldig_til || !doc.varsel_dager_for_utløp) return false;
      const expiryDate = new Date(doc.gyldig_til);
      const notificationDate = new Date(expiryDate);
      notificationDate.setDate(notificationDate.getDate() - doc.varsel_dager_for_utløp);
      notificationDate.setHours(0, 0, 0, 0);
      return notificationDate.getTime() === today.getTime();
    });

    if (documentsToNotify.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No notifications needed today' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${documentsToNotify.length} documents requiring notification`);

    const documentsByCompany = documentsToNotify.reduce((acc, doc) => {
      if (!acc[doc.company_id]) acc[doc.company_id] = [];
      acc[doc.company_id].push(doc);
      return acc;
    }, {} as Record<string, typeof documentsToNotify>);

    let totalEmailsSent = 0;
    let totalPushSent = 0;

    for (const [companyId, docs] of Object.entries(documentsByCompany) as [string, typeof documentsToNotify][]) {
      console.log(`Processing ${docs.length} documents for company ${companyId}`);

      const pushTitle = 'Dokumenter utløper snart';
      const pushBody = docs.length === 1 
        ? `${docs[0].tittel} utløper snart`
        : `${docs.length} dokumenter utløper snart`;
      
      await sendPushNotifications(supabase, companyId, pushTitle, pushBody);
      totalPushSent++;

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      const { data: eligibleUsers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('approved', true);

      const userIds = (eligibleUsers || []).map(u => u.id);

      const { data: notificationPrefs } = userIds.length
        ? await supabase
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', userIds)
            .eq('email_document_expiry', true)
        : { data: [] };

      const { data: companyData } = await supabase
        .from('companies')
        .select('navn, parent_company_id')
        .eq('id', companyId)
        .single();

      const companyName = companyData?.navn || 'Selskapet';
      const parentAdminIds = companyData?.parent_company_id
        ? await getParentAdminIdsWithPreference(supabase, companyData.parent_company_id, 'email_child_document_expiry')
        : [];
      const usersToNotify = [...new Set([...(notificationPrefs?.map(pref => pref.user_id) || []), ...parentAdminIds])];
      if (usersToNotify.length === 0) continue;

      const { data: authUsers } = await supabase.auth.admin.listUsers();
      if (!authUsers) continue;

      const { data: template } = await supabase
        .from('email_templates')
        .select('subject, content')
        .eq('company_id', companyId)
        .eq('template_type', 'document_reminder')
        .maybeSingle();

      for (const userId of usersToNotify) {
        const authUser = authUsers.users.find(u => u.id === userId);
        if (!authUser?.email) continue;

        if (template) {
          for (const doc of docs) {
            const expiryDate = new Date(doc.gyldig_til!).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

            const emailSubject = template.subject
              .replace(/\{\{document_title\}\}/g, doc.tittel)
              .replace(/\{\{expiry_date\}\}/g, expiryDate)
              .replace(/\{\{company_name\}\}/g, companyName);

            const emailContent = template.content
              .replace(/\{\{document_title\}\}/g, doc.tittel)
              .replace(/\{\{expiry_date\}\}/g, expiryDate)
              .replace(/\{\{company_name\}\}/g, companyName);

            try {
              await sendEmail({ from: senderAddress, to: authUser.email, subject: sanitizeSubject(emailSubject), html: emailContent });
              totalEmailsSent++;
            } catch (emailError) {
              console.error(`Error sending email to ${authUser.email}:`, emailError);
            }
          }
        } else {
          const documentsListHtml = docs.map(doc => {
            const expiryDate = new Date(doc.gyldig_til!).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
            const daysUntilExpiry = Math.ceil((new Date(doc.gyldig_til!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return `<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #ef4444;"><h3 style="color: #333; font-size: 16px; margin-bottom: 8px;">${doc.tittel}</h3><div style="margin-bottom: 5px;"><strong style="color: #666;">Kategori:</strong><span style="color: #333; margin-left: 8px;">${doc.kategori}</span></div><div style="margin-bottom: 5px;"><strong style="color: #666;">Utløper:</strong><span style="color: #ef4444; margin-left: 8px;">${expiryDate} (om ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'dag' : 'dager'})</span></div></div>`;
          }).join('');

          const emailHtml = `<h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Dokumenter som snart utløper</h1><p style="color: #666; margin-bottom: 20px;">Følgende dokumenter krever din oppmerksomhet:</p>${documentsListHtml}<p style="color: #666; margin-top: 20px; font-size: 14px;">Vennligst logg inn for å fornye eller oppdatere disse dokumentene.</p>`;

          try {
            await sendEmail({ from: senderAddress, to: authUser.email, subject: sanitizeSubject(`Dokumenter som snart utløper (${docs.length} ${docs.length === 1 ? 'dokument' : 'dokumenter'})`), html: emailHtml });
            totalEmailsSent++;
          } catch (emailError) {
            console.error(`Error sending email to ${authUser.email}:`, emailError);
          }
        }
      }
    }

    console.log(`Document expiry check complete. Sent ${totalEmailsSent} emails, ${totalPushSent} push batches.`);

    return new Response(
      JSON.stringify({ success: true, documentsChecked: documentsToNotify.length, emailsSent: totalEmailsSent, pushBatchesSent: totalPushSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in check-document-expiry function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
