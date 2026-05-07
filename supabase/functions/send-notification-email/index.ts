import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback, fixEmailImages } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId, generateDownloadLinksHtml } from "../_shared/attachment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  recipientId?: string;
  recipientEmail?: string;
  notificationType?: string;
  subject?: string;
  htmlContent?: string;
  type?: string;
  companyId?: string;
  missionId?: string;
  sentBy?: string;
  campaignId?: string;
  excludeUserIds?: string[];
  newUser?: { fullName: string; email: string; companyName: string; };
  incident?: { tittel: string; beskrivelse?: string; alvorlighetsgrad: string; lokasjon?: string; };
  mission?: { id?: string; tittel: string; lokasjon: string; tidspunkt: string; beskrivelse?: string; status?: string; };
  followupAssigned?: { recipientId: string; recipientName: string; incidentTitle: string; incidentSeverity: string; incidentLocation?: string; incidentDescription?: string; };
  approvalMission?: { id?: string; tittel: string; lokasjon?: string; tidspunkt: string; beskrivelse?: string; };
  pilotComment?: { missionTitle: string; missionLocation: string; missionDate: string; comment: string; senderName: string; };
  missionMention?: { recipientId: string; senderId?: string; senderName: string; missionTitle: string; missionLocation?: string; missionDate: string; missionNote: string; };
  trainingAssigned?: { recipientId: string; courseName: string; };
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/\n/g, '<br>');

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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { recipientId, recipientEmail, notificationType, subject, htmlContent, type, companyId, missionId, sentBy, campaignId, excludeUserIds = [], newUser, incident, mission, followupAssigned, approvalMission, pilotComment, missionMention, trainingAssigned, dry_run: dryRun }: EmailRequest & { dry_run?: boolean; trainingAssigned?: { recipientId: string; courseName: string } } = await req.json();

    // Handle new incident notification
    if (type === 'notify_new_incident' && companyId && incident) {
      const { data: incidentCompany } = await supabase.from('companies').select('parent_company_id').eq('id', companyId).single();
      const { data: sameCompanyUsers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);
      let parentResponsibles: any[] = [];
      if (incidentCompany?.parent_company_id) {
        const { data } = await supabase.from('profiles').select('id').eq('company_id', incidentCompany.parent_company_id).eq('approved', true).eq('can_be_incident_responsible', true);
        parentResponsibles = data || [];
      }
      const parentAdminIds = incidentCompany?.parent_company_id
        ? await getParentAdminIdsWithPreference(supabase, incidentCompany.parent_company_id, 'email_child_incidents')
        : [];
      const eligibleUsers = [...(sameCompanyUsers || []), ...parentResponsibles, ...parentAdminIds.map((id) => ({ id }))];
      if (!eligibleUsers?.length) return new Response(JSON.stringify({ success: true, message: 'No users' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const sameCompanyIds = [...new Set((sameCompanyUsers || []).map((u: any) => u.id))];
      const responsibleIds = [...new Set(parentResponsibles.map((u: any) => u.id))];
      const [{ data: sameCompanyPrefs }, { data: responsiblePrefs }] = await Promise.all([
        sameCompanyIds.length
          ? supabase.from('notification_preferences').select('user_id').in('user_id', sameCompanyIds).eq('email_new_incident', true)
          : Promise.resolve({ data: [] }),
        responsibleIds.length
          ? supabase.from('notification_preferences').select('user_id').in('user_id', responsibleIds).eq('email_new_incident', true)
          : Promise.resolve({ data: [] }),
      ]);
      const excludedUserIds = new Set(excludeUserIds.filter(Boolean));
      const notificationUserIds = [...new Set([...(sameCompanyPrefs || []).map((p: any) => p.user_id), ...(responsiblePrefs || []).map((p: any) => p.user_id), ...parentAdminIds])]
        .filter((userId) => !excludedUserIds.has(userId));
      if (!notificationUserIds.length) return new Response(JSON.stringify({ success: true, message: 'No users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const templateResult = await getEmailTemplateWithFallback(companyId, 'incident_notification', { incident_title: incident.tittel, incident_severity: incident.alvorlighetsgrad, incident_location: incident.lokasjon || 'Ikke oppgitt', incident_description: incident.beskrivelse || '', company_name: company?.navn || '' });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      for (const userId of notificationUserIds) {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
        emailsSent++;
      }
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle new mission notification
    if (type === 'notify_new_mission' && companyId && mission) {
      const { data: missionCompany } = await supabase.from('companies').select('parent_company_id').eq('id', companyId).single();
      const { data: eligibleUsers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);

      const { data: notificationPrefs } = eligibleUsers?.length
        ? await supabase.from('notification_preferences').select('user_id').in('user_id', eligibleUsers.map(u => u.id)).eq('email_new_mission', true)
        : { data: [] };
      const parentAdminIds = missionCompany?.parent_company_id
        ? await getParentAdminIdsWithPreference(supabase, missionCompany.parent_company_id, 'email_child_missions')
        : [];
      const notificationUserIds = [...new Set([...(notificationPrefs || []).map((p: any) => p.user_id), ...parentAdminIds])];
      if (!notificationUserIds.length) return new Response(JSON.stringify({ success: true, message: 'No users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(mission.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(companyId, 'mission_notification', { mission_title: mission.tittel, mission_location: mission.lokasjon, mission_date: missionDate, mission_status: mission.status || 'Planlagt', mission_description: mission.beskrivelse || '', company_name: company?.navn || '' });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      for (const userId of notificationUserIds) {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
        emailsSent++;
      }
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle new user notification to admins
    if (type === 'notify_admins_new_user' && companyId && newUser) {
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').in('role', ADMIN_ROLES);
      if (!adminRoles?.length) return new Response(JSON.stringify({ message: 'No admins' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: childCompany } = await supabase.from('companies').select('parent_company_id').eq('id', companyId).single();
      const companyIds = [companyId];
      if (childCompany?.parent_company_id) {
        companyIds.push(childCompany.parent_company_id);
      }

      const { data: adminProfiles } = await supabase.from('profiles').select('id, company_id').in('company_id', companyIds).in('id', adminRoles.map(r => r.user_id));
      if (!adminProfiles?.length) return new Response(JSON.stringify({ message: 'No admins in company' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const sameCompanyAdminIds = adminProfiles.filter((p: any) => p.company_id === companyId).map((p: any) => p.id);
      const parentAdminIds = childCompany?.parent_company_id
        ? adminProfiles.filter((p: any) => p.company_id === childCompany.parent_company_id).map((p: any) => p.id)
        : [];
      const [{ data: sameCompanyPrefs }, { data: parentPrefs }] = await Promise.all([
        sameCompanyAdminIds.length
          ? supabase.from('notification_preferences').select('user_id').in('user_id', sameCompanyAdminIds).eq('email_new_user_pending', true)
          : Promise.resolve({ data: [] }),
        parentAdminIds.length
          ? supabase.from('notification_preferences').select('user_id').in('user_id', parentAdminIds).eq('email_child_new_user_pending', true)
          : Promise.resolve({ data: [] }),
      ]);
      const notificationUserIds = [...new Set([...(sameCompanyPrefs || []).map((p: any) => p.user_id), ...(parentPrefs || []).map((p: any) => p.user_id)])];
      if (!notificationUserIds.length) return new Response(JSON.stringify({ message: 'No admins with notifications' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const templateResult = await getEmailTemplateWithFallback(companyId, 'admin_new_user', { new_user_name: newUser.fullName, new_user_email: newUser.email, company_name: newUser.companyName });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let sentCount = 0;
      for (const userId of notificationUserIds) {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
        sentCount++;
      }
      return new Response(JSON.stringify({ message: `Sent ${sentCount} notifications` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle followup assigned notification
    if (type === 'notify_followup_assigned' && companyId && followupAssigned) {
      const { data: prefs } = await supabase.from("notification_preferences").select("email_followup_assigned").eq("user_id", followupAssigned.recipientId).maybeSingle();
      if (!prefs?.email_followup_assigned) return new Response(JSON.stringify({ success: true, message: 'Disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: { user } } = await supabase.auth.admin.getUserById(followupAssigned.recipientId);
      if (!user?.email) throw new Error("User email not found");

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const templateResult = await getEmailTemplateWithFallback(companyId, 'followup_assigned', { user_name: followupAssigned.recipientName, incident_title: followupAssigned.incidentTitle, incident_severity: followupAssigned.incidentSeverity, incident_location: followupAssigned.incidentLocation || '', incident_description: followupAssigned.incidentDescription || '', company_name: company?.navn || '' });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle mission approval notification
    if (type === 'notify_mission_approval' && companyId && (mission || approvalMission)) {
      console.log(`[APPROVAL] Started — companyId=${companyId}`);
      const missionData = mission || approvalMission;

      const { data: adminRolesForApproval } = await supabase.from('user_roles').select('user_id').in('role', ADMIN_ROLES);
      if (!adminRolesForApproval?.length) return new Response(JSON.stringify({ success: true, message: 'No admins' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: approverProfiles } = await supabase.from('profiles').select('id, approval_company_ids, company_id').eq('approved', true).eq('can_approve_missions', true).in('id', adminRolesForApproval.map(r => r.user_id));
      console.log(`[APPROVAL] approverProfiles count=${approverProfiles?.length ?? 0}`);
      if (!approverProfiles?.length) return new Response(JSON.stringify({ success: true, message: 'No approvers' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: approvalCompany } = await supabase.from('companies').select('parent_company_id, prevent_self_approval').eq('id', companyId).single();
      const parentId = approvalCompany?.parent_company_id;
      console.log(`[APPROVAL] companyId=${companyId}, parent=${parentId ?? 'none'}`);

      const approvers = approverProfiles.filter((a: any) => {
        if (a.approval_company_ids?.includes('all')) {
          return a.company_id === companyId || (parentId && a.company_id === parentId);
        }
        if (a.approval_company_ids) {
          return a.approval_company_ids.includes(companyId);
        }
        return a.company_id === companyId;
      });
      let eligibleApprovers = approvers;
      if (approvalCompany?.prevent_self_approval && missionData?.id) {
        const { data: personnel } = await supabase.from('mission_personnel').select('profile_id').eq('mission_id', missionData.id);
        const assignedIds = new Set((personnel || []).map((p: any) => p.profile_id).filter(Boolean));
        eligibleApprovers = approvers.filter((a: any) => !assignedIds.has(a.id));
      }
      console.log(`[APPROVAL] Filtered approvers count=${eligibleApprovers.length}, ids=${JSON.stringify(eligibleApprovers.map((a:any) => a.id))}`);
      if (!eligibleApprovers.length) return new Response(JSON.stringify({ success: true, message: 'No eligible approvers for this department' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: notificationPrefs } = await supabase.from('notification_preferences').select('user_id').in('user_id', eligibleApprovers.map(u => u.id)).eq('email_mission_approval', true);
      console.log(`[APPROVAL] notificationPrefs count=${notificationPrefs?.length ?? 0}`);
      if (!notificationPrefs?.length) return new Response(JSON.stringify({ success: true, message: 'No approvers with notifications' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(missionData!.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(companyId, 'mission_approval_request', { mission_title: missionData!.tittel, mission_location: missionData!.lokasjon || 'Ikke oppgitt', mission_date: missionDate, mission_description: missionData!.beskrivelse || '', company_name: company?.navn || '' });

      if (!templateResult.content) {
        console.warn('Empty template content for mission_approval_request, using inline fallback');
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Oppdrag venter på godkjenning: ${missionData!.tittel}</h2><p>Lokasjon: ${missionData!.lokasjon || 'Ikke oppgitt'}</p><p>Tidspunkt: ${missionDate}</p><p>${missionData!.beskrivelse || ''}</p><p>Logg inn i appen for å godkjenne oppdraget.</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Oppdrag venter på godkjenning: ${missionData!.tittel}`;
      }

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
        emailsSent++;
      }
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle pilot comment notification
    if (type === 'notify_pilot_comment' && companyId && missionId && pilotComment) {
      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', missionId);

      if (!personnel?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No personnel' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(pilotComment.missionDate).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const templateResult = await getEmailTemplateWithFallback(companyId, 'pilot_comment_notification', {
        mission_title: pilotComment.missionTitle,
        mission_location: pilotComment.missionLocation,
        mission_date: missionDate,
        comment: pilotComment.comment,
        sender_name: pilotComment.senderName,
        company_name: company?.navn || '',
      });

      if (!templateResult.content) {
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Kommentar til oppdrag: ${pilotComment.missionTitle}</h2><p><strong>Fra:</strong> ${pilotComment.senderName}</p><p><strong>Lokasjon:</strong> ${pilotComment.missionLocation}</p><p><strong>Tidspunkt:</strong> ${missionDate}</p><p><strong>Kommentar:</strong></p><p>${pilotComment.comment}</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Kommentar til oppdrag: ${pilotComment.missionTitle}`;
      }

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      for (const p of personnel) {
        const { data: { user } } = await supabase.auth.admin.getUserById(p.profile_id);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
        emailsSent++;
      }
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle mission mention notification
    if (type === 'notify_mission_mention' && companyId && missionId && missionMention) {
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('id, full_name, company_id, approved')
        .eq('id', missionMention.recipientId)
        .maybeSingle();

      if (!recipientProfile?.approved || recipientProfile.company_id !== companyId) {
        return new Response(JSON.stringify({ success: true, message: 'Recipient not eligible' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const { data: { user: recipientUser } } = await supabase.auth.admin.getUserById(missionMention.recipientId);
      if (!recipientUser?.email) {
        return new Response(JSON.stringify({ success: true, message: 'No email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(missionMention.missionDate).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const appUrl = `https://app.avisafe.no/oppdrag?missionId=${missionId}`;
      const templateResult = await getEmailTemplateWithFallback(companyId, 'mission_mention_notification', {
        user_name: recipientProfile.full_name || 'Bruker',
        sender_name: missionMention.senderName,
        mission_title: missionMention.missionTitle,
        mission_location: missionMention.missionLocation || 'Ikke oppgitt',
        mission_date: missionDate,
        mission_note: escapeHtml(missionMention.missionNote || ''),
        company_name: company?.navn || '',
        app_url: appUrl,
      });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      await sendEmail({ from: senderAddress, to: recipientUser.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle training assigned notification
    if (type === 'notify_training_assigned' && trainingAssigned && companyId) {
      const { data: { user: recipientUser } } = await supabase.auth.admin.getUserById(trainingAssigned.recipientId);
      if (!recipientUser?.email) {
        return new Response(JSON.stringify({ success: true, message: 'No email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';
      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.logo { text-align: center; padding: 20px 20px 10px 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
</style></head><body>
<div class="container">
<div class="logo"><img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" /></div>
<div class="header"><h1 style="margin:0;font-size:20px;">Du har fått tildelt et kurs</h1></div>
<div class="content">
<h2 style="margin-top:0;">${trainingAssigned.courseName}</h2>
<p>Du har blitt tildelt et nytt kurs/test som må gjennomføres.</p>
<p>Logg inn i AviSafe for å starte kurset. Du finner det under din profil → Oppfølging.</p>
<p style="color:#666;font-size:12px;margin-top:20px;">— ${company?.navn || 'AviSafe'}</p>
</div></div></body></html>`;

      await sendEmail({
        from: senderAddress,
        to: recipientUser.email,
        subject: sanitizeSubject(`Nytt kurs tildelt: ${trainingAssigned.courseName}`),
        html: htmlBody,
      });

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle mission approved notification to pilots
    if (type === 'notify_mission_approved' && (companyId || true)) {
      if (!missionId) throw new Error('Missing missionId');

      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();
      if (missionError || !missionData) throw new Error('Mission not found');

      const effectiveCompanyId = companyId || missionData.company_id;

      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', missionId);

      if (!personnel?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No personnel' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const comments = Array.isArray(missionData.approver_comments) ? missionData.approver_comments : [];
      let commentsHtml = '';
      if (comments.length > 0) {
        commentsHtml = '<div class="comments-box"><h3>Kommentarer fra godkjenner</h3>';
        for (const c of comments) {
          commentsHtml += `<p><strong>${c.author_name}:</strong> ${c.comment}</p>`;
        }
        commentsHtml += '</div>';
      }

      const missionDate = new Date(missionData.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(effectiveCompanyId, 'mission_approved', {
        mission_title: missionData.tittel,
        mission_location: missionData.lokasjon || 'Ikke oppgitt',
        mission_date: missionDate,
        comments_section: commentsHtml,
      });

      if (!templateResult.content) {
        console.warn('Empty template content for mission_approved, using inline fallback');
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Oppdrag godkjent: ${missionData.tittel}</h2><p>Lokasjon: ${missionData.lokasjon || 'Ikke oppgitt'}</p><p>Tidspunkt: ${missionDate}</p>${commentsHtml}<p>Logg inn i appen for å se oppdraget.</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Oppdrag godkjent: ${missionData.tittel}`;
      }

      const emailConfig = await getEmailConfig(effectiveCompanyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      for (const p of personnel) {
        const { data: { user } } = await supabase.auth.admin.getUserById(p.profile_id);
        if (!user?.email) continue;
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject || 'Oppdrag godkjent'), html: templateResult.content });
        emailsSent++;
      }
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============================================================
    // BULK EMAIL HANDLERS (with campaign logging)
    // ============================================================

    if (type === 'bulk_email_users' && companyId && subject && htmlContent) {
      const { data: profiles } = await supabase.from('profiles').select('id, email').eq('company_id', companyId).eq('approved', true).not('email', 'is', null);
      if (!profiles?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validProfiles = profiles.filter(p => p.email);

      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: companyId,
        recipient_type: dryRun ? 'users_dry_run' : 'users',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validProfiles.length,
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_users: queued ${dryRun ? '[DRY RUN] ' : ''}${validProfiles.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        const sentToEmails: string[] = [];
        const failedEmails: string[] = [];
        for (const p of validProfiles) {
          try {
            await sendEmail({ from: senderAddress, to: p.email!, subject: sanitizeSubject(subject), html: fixedHtmlContent });
            sentToEmails.push(p.email!);
            console.info(`bulk_email_users: ✓ sent to ${p.email}`);
          } catch (e) {
            failedEmails.push(p.email!);
            console.error(`bulk_email_users: ✗ failed for ${p.email}`, e);
          }
        }
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: sentToEmails.length,
            sent_to_emails: sentToEmails,
            failed_emails: failedEmails,
          }).eq('id', campaign.id);
        }
        console.info(`bulk_email_users: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
        return new Response(JSON.stringify({ success: true, emailsSent: sentToEmails.length, failedEmails, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      } else {
        const dryRunEmails = validProfiles.map(p => p.email!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
        return new Response(JSON.stringify({ success: true, emailsSent: dryRunEmails.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
    }

    if (type === 'bulk_email_customers' && companyId && subject && htmlContent) {
      const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', companyId).eq('aktiv', true).not('epost', 'is', null);
      if (!customers?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validCustomers = customers.filter(c => c.epost);

      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: companyId,
        recipient_type: dryRun ? 'customers_dry_run' : 'customers',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validCustomers.length,
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_customers: queued ${dryRun ? '[DRY RUN] ' : ''}${validCustomers.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        const sentToEmails: string[] = [];
        const failedEmails: string[] = [];
        for (const c of validCustomers) {
          try {
            await sendEmail({ from: senderAddress, to: c.epost!, subject: sanitizeSubject(subject), html: fixedHtmlContent });
            sentToEmails.push(c.epost!);
            console.info(`bulk_email_customers: ✓ sent to ${c.epost}`);
          } catch (e) {
            failedEmails.push(c.epost!);
            console.error(`bulk_email_customers: ✗ failed for ${c.epost}`, e);
          }
        }
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: sentToEmails.length,
            sent_to_emails: sentToEmails,
            failed_emails: failedEmails,
          }).eq('id', campaign.id);
        }
        console.info(`bulk_email_customers: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
        return new Response(JSON.stringify({ success: true, emailsSent: sentToEmails.length, failedEmails, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      } else {
        const dryRunEmails = validCustomers.map(c => c.epost!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
        return new Response(JSON.stringify({ success: true, emailsSent: dryRunEmails.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
    }

    if (type === 'bulk_email_all_users' && subject && htmlContent) {
      let allAuthUsers: Array<{ email?: string }> = [];
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listError) { console.error('Error listing users:', listError); break; }
        if (!pageUsers?.length) break;
        allAuthUsers = allAuthUsers.concat(pageUsers);
        if (pageUsers.length < perPage) break;
        page++;
      }

      if (!allAuthUsers.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig();
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validUsers = allAuthUsers.filter(u => u.email);

      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: null,
        recipient_type: dryRun ? 'all_users_dry_run' : 'all_users',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validUsers.length,
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_all_users: queued ${dryRun ? '[DRY RUN] ' : ''}${validUsers.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        const sentToEmails: string[] = [];
        const failedEmails: string[] = [];
        for (const u of validUsers) {
          try {
            await sendEmail({ from: senderAddress, to: u.email!, subject: sanitizeSubject(subject), html: fixedHtmlContent });
            sentToEmails.push(u.email!);
            console.info(`bulk_email_all_users: ✓ sent to ${u.email}`);
          } catch (e) {
            failedEmails.push(u.email!);
            console.error(`bulk_email_all_users: ✗ failed for ${u.email}`, e);
          }
        }
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: sentToEmails.length,
            sent_to_emails: sentToEmails,
            failed_emails: failedEmails,
          }).eq('id', campaign.id);
        }
        console.info(`bulk_email_all_users: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
        return new Response(JSON.stringify({ success: true, emailsSent: sentToEmails.length, failedEmails, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      } else {
        const dryRunEmails = validUsers.map(u => u.email!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
        return new Response(JSON.stringify({ success: true, emailsSent: dryRunEmails.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
    }

    // ============================================================
    // SEND TO MISSED — send campaign only to new/missed recipients
    // ============================================================
    if (type === 'send_to_missed' && campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from('bulk_email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const alreadySentEmails = new Set<string>((campaign.sent_to_emails || []).map((e: string) => e.toLowerCase()));
      const fixedHtmlContent = fixEmailImages(campaign.html_content);

      let eligibleEmails: string[] = [];

      if (campaign.recipient_type === 'all_users') {
        let allAuthUsers: Array<{ email?: string }> = [];
        let page = 1;
        const perPage = 1000;
        while (true) {
          const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
          if (listError) break;
          if (!pageUsers?.length) break;
          allAuthUsers = allAuthUsers.concat(pageUsers);
          if (pageUsers.length < perPage) break;
          page++;
        }
        eligibleEmails = allAuthUsers.filter(u => u.email).map(u => u.email!);
      } else if (campaign.recipient_type === 'users' && campaign.company_id) {
        const { data: profiles } = await supabase.from('profiles')
          .select('email')
          .eq('company_id', campaign.company_id)
          .eq('approved', true)
          .not('email', 'is', null);
        eligibleEmails = (profiles || []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
      } else if (campaign.recipient_type === 'customers' && campaign.company_id) {
        const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', campaign.company_id).eq('aktiv', true).not('epost', 'is', null);
        eligibleEmails = (customers || []).map(c => c.epost).filter(Boolean) as string[];
      }

      const missedEmails = eligibleEmails.filter(email => !alreadySentEmails.has(email.toLowerCase()));

      if (missedEmails.length === 0) {
        return new Response(JSON.stringify({ success: true, emailsSent: 0, message: 'No new recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const emailConfig = campaign.recipient_type === 'all_users'
        ? await getEmailConfig()
        : await getEmailConfig(campaign.company_id || undefined);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      let emailsSent = 0;
      const newlySentEmails: string[] = [];
      const newlyFailedEmails: string[] = [];

      for (const email of missedEmails) {
        try {
          await sendEmail({ from: senderAddress, to: email, subject: sanitizeSubject(campaign.subject), html: fixedHtmlContent });
          emailsSent++;
          newlySentEmails.push(email);
        } catch (e) {
          newlyFailedEmails.push(email);
          console.error(`send_to_missed: failed for ${email}`, e);
        }
      }

      const updatedSentEmails = [...(campaign.sent_to_emails || []), ...newlySentEmails];
      const updatedFailedEmails = [...(campaign.failed_emails || []), ...newlyFailedEmails];
      await supabase.from('bulk_email_campaigns').update({
        sent_to_emails: updatedSentEmails,
        failed_emails: updatedFailedEmails,
        emails_sent: updatedSentEmails.length,
      }).eq('id', campaignId);

      return new Response(JSON.stringify({ success: true, emailsSent, newlySentEmails, newlyFailedEmails }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============================================================
    // PREVIEW MISSED COUNT
    // ============================================================
    if (type === 'preview_missed_count' && campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from('bulk_email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const alreadySentEmails = new Set<string>((campaign.sent_to_emails || []).map((e: string) => e.toLowerCase()));

      let eligibleEmails: string[] = [];

      if (campaign.recipient_type === 'all_users') {
        let allAuthUsers: Array<{ email?: string }> = [];
        let page = 1;
        const perPage = 1000;
        while (true) {
          const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
          if (listError) break;
          if (!pageUsers?.length) break;
          allAuthUsers = allAuthUsers.concat(pageUsers);
          if (pageUsers.length < perPage) break;
          page++;
        }
        eligibleEmails = allAuthUsers.filter(u => u.email).map(u => u.email!);
      } else if (campaign.recipient_type === 'users' && campaign.company_id) {
        const { data: profiles } = await supabase.from('profiles').select('email').eq('company_id', campaign.company_id).eq('approved', true).not('email', 'is', null);
        eligibleEmails = (profiles || []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
      } else if (campaign.recipient_type === 'customers' && campaign.company_id) {
        const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', campaign.company_id).eq('aktiv', true).not('epost', 'is', null);
        eligibleEmails = (customers || []).map(c => c.epost).filter(Boolean) as string[];
      }

      const missedCount = eligibleEmails.filter(email => !alreadySentEmails.has(email.toLowerCase())).length;

      return new Response(JSON.stringify({ success: true, missedCount, totalEligible: eligibleEmails.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Direct email by recipientEmail (e.g. flight alert notifications)
    if (recipientEmail && subject && htmlContent) {
      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const fixedHtmlContent = fixEmailImages(htmlContent);
      await sendEmail({ from: senderAddress, to: recipientEmail, subject: sanitizeSubject(subject), html: fixedHtmlContent });
      return new Response(JSON.stringify({ message: "Email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Single recipient flow
    if (!recipientId || !subject || !htmlContent) throw new Error('Missing required fields');

    const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", recipientId).maybeSingle();
    if (!prefs || (notificationType && !prefs[notificationType])) {
      return new Response(JSON.stringify({ message: "Disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: { user } } = await supabase.auth.admin.getUserById(recipientId);
    if (!user?.email) throw new Error("User email not found");

    const emailConfig = await getEmailConfig(companyId);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    const fixedHtmlContent = fixEmailImages(htmlContent);

    await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(subject), html: fixedHtmlContent });

    return new Response(JSON.stringify({ message: "Email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
