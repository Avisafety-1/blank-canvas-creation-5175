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

interface MaintenanceItem {
  id: string;
  name: string;
  type: 'drone' | 'equipment' | 'accessory';
  expiryDate: Date;
  daysUntilExpiry: number;
  companyId: string;
  statusLevel: string;
}

// ─── Status calculation (mirrors src/lib/maintenanceStatus.ts) ───

type Status = 'Grønn' | 'Gul' | 'Rød';

function calculateMaintenanceStatus(nextDate: string | null, warningDays = 14): Status {
  if (!nextDate) return 'Grønn';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(nextDate);
  d.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return 'Rød';
  if (daysUntil <= warningDays) return 'Gul';
  return 'Grønn';
}

function calculateUsageStatus(currentUsage: number, limit: number | null, warningMargin: number | null): Status {
  if (!limit || limit <= 0) return 'Grønn';
  if (currentUsage >= limit) return 'Rød';
  const threshold = (warningMargin != null && warningMargin > 0) ? limit - warningMargin : limit * 0.8;
  if (currentUsage >= threshold) return 'Gul';
  return 'Grønn';
}

const PRIORITY: Record<Status, number> = { 'Rød': 2, 'Gul': 1, 'Grønn': 0 };
function worstStatus(a: Status, b: Status): Status {
  return PRIORITY[a] >= PRIORITY[b] ? a : b;
}

function calculateDroneInspectionStatus(drone: any, missionsSinceInspection: number): Status {
  const dateStatus = calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14);
  const hoursSince = (drone.flyvetimer ?? 0) - (drone.hours_at_last_inspection ?? 0);
  const hoursStatus = calculateUsageStatus(hoursSince, drone.inspection_interval_hours, drone.varsel_timer);
  const missionsStatus = calculateUsageStatus(missionsSinceInspection, drone.inspection_interval_missions, drone.varsel_oppdrag);
  return [dateStatus, hoursStatus, missionsStatus].reduce((w, s) => worstStatus(w, s), 'Grønn' as Status);
}

// ─── Push notifications helper ───

async function sendPushNotifications(supabase: any, userId: string, title: string, body: string) {
  try {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('push_enabled, push_maintenance_reminder')
      .eq('user_id', userId)
      .single();
    if (!prefs?.push_enabled || !prefs?.push_maintenance_reminder) return false;

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);
    if (!subscriptions || subscriptions.length === 0) return false;

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;

    const webPush = await import("https://esm.sh/web-push@3.6.7");
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title, body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: { url: '/resources' }
    });

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (pushError: any) {
        console.error(`Push error for subscription ${sub.id}:`, pushError);
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
    return true;
  } catch (error) {
    console.error('Error sending push notifications:', error);
    return false;
  }
}

// ─── Count unique missions since last inspection for a drone ───

async function countMissionsSinceInspection(supabase: any, droneId: string, sistInspeksjon: string | null): Promise<number> {
  let query = supabase
    .from('flight_logs')
    .select('mission_id')
    .eq('drone_id', droneId)
    .not('mission_id', 'is', null);
  if (sistInspeksjon) {
    query = query.gt('flight_date', sistInspeksjon);
  }
  const { data } = await query;
  if (!data) return 0;
  return new Set(data.map((r: any) => r.mission_id)).size;
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for upcoming maintenance/inspections...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Fetch drones with status-relevant fields ──
    const { data: drones } = await supabase
      .from('drones')
      .select('id, modell, neste_inspeksjon, company_id, aktiv, technical_responsible_id, varsel_dager, varsel_timer, varsel_oppdrag, inspection_interval_hours, inspection_interval_missions, hours_at_last_inspection, flyvetimer, missions_at_last_inspection, sist_inspeksjon, maintenance_notification_sent')
      .eq('aktiv', true);

    // ── Equipment & accessories (unchanged — still date-based) ──
    const { data: equipment } = await supabase
      .from('equipment')
      .select('id, navn, neste_vedlikehold, company_id, aktiv, varsel_dager')
      .eq('aktiv', true)
      .not('neste_vedlikehold', 'is', null);

    const { data: accessories } = await supabase
      .from('drone_accessories')
      .select('id, navn, neste_vedlikehold, company_id, varsel_dager')
      .not('neste_vedlikehold', 'is', null);

    const companyIdsWithResources = [...new Set([
      ...(drones || []).map((d: any) => d.company_id),
      ...(equipment || []).map((e: any) => e.company_id),
      ...(accessories || []).map((a: any) => a.company_id),
    ].filter(Boolean))];

    const { data: resourceCompanies } = companyIdsWithResources.length
      ? await supabase.from('companies').select('id, parent_company_id').in('id', companyIdsWithResources)
      : { data: [] };
    const parentByCompany = new Map((resourceCompanies || []).map((c: any) => [c.id, c.parent_company_id]));

    // ── Notification prefs ──
    const { data: notificationPrefs } = await supabase
      .from('notification_preferences')
      .select('user_id, email_inspection_reminder, push_enabled, push_maintenance_reminder')
      .or('email_inspection_reminder.eq.true,and(push_enabled.eq.true,push_maintenance_reminder.eq.true)');

    const userIds = (notificationPrefs || []).map((p: any) => p.user_id);
    const { data: profiles } = userIds.length
      ? await supabase
          .from('profiles')
          .select('id, company_id, full_name')
          .in('id', userIds)
          .eq('approved', true)
      : { data: [] };

    const { data: authUsers } = await supabase.auth.admin.listUsers();

    // ── Pre-calculate drone statuses & collect which need notification ──
    const droneStatusMap = new Map<string, { status: Status; missionsSince: number }>();
    const dronesNeedingNotification: string[] = [];

    if (drones) {
      for (const drone of drones) {
        let missionsSince = 0;
        if (drone.inspection_interval_missions) {
          missionsSince = await countMissionsSinceInspection(supabase, drone.id, drone.sist_inspeksjon);
        }
        const status = calculateDroneInspectionStatus(drone, missionsSince);
        droneStatusMap.set(drone.id, { status, missionsSince });

        // If status is Gul or Rød AND notification not yet sent → flag it
        if ((status === 'Gul' || status === 'Rød') && !drone.maintenance_notification_sent) {
          dronesNeedingNotification.push(drone.id);
        }
      }
    }

    let totalEmailsSent = 0;
    let totalPushSent = 0;
    const parentMaintenanceNotificationKeys = new Set<string>();

    for (const pref of notificationPrefs || []) {
      const profile = profiles?.find((p: any) => p.id === pref.user_id);
      if (!profile) continue;

      const authUser = authUsers?.users.find((u: any) => u.id === pref.user_id);
      if (!authUser?.email) continue;

      const itemsNeedingAttention: MaintenanceItem[] = [];

      // ── Drones: use calculated status instead of reminder days ──
      const companyDrones = drones?.filter((d: any) => d.company_id === profile.company_id) || [];
      for (const drone of companyDrones) {
        if (drone.technical_responsible_id && drone.technical_responsible_id !== pref.user_id) continue;

        const info = droneStatusMap.get(drone.id);
        if (!info) continue;

        // Only include drones with Gul/Rød status that haven't been notified yet
        if ((info.status === 'Gul' || info.status === 'Rød') && !drone.maintenance_notification_sent) {
          const expiryDate = drone.neste_inspeksjon ? new Date(drone.neste_inspeksjon) : new Date();
          expiryDate.setHours(0, 0, 0, 0);
          const daysUntil = drone.neste_inspeksjon
            ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          itemsNeedingAttention.push({
            id: drone.id,
            name: drone.modell,
            type: 'drone',
            expiryDate,
            daysUntilExpiry: daysUntil,
            companyId: drone.company_id,
            statusLevel: info.status,
          });
        }
      }

      // ── Equipment: still date-based (unchanged) ──
      const companyEquipment = equipment?.filter((e: any) => e.company_id === profile.company_id) || [];
      for (const equip of companyEquipment) {
        const expiryDate = new Date(equip.neste_vedlikehold);
        expiryDate.setHours(0, 0, 0, 0);
        const reminderDate = new Date(today);
        reminderDate.setDate(reminderDate.getDate() + (equip.varsel_dager ?? 14));
        if (expiryDate <= reminderDate && expiryDate >= today) {
          itemsNeedingAttention.push({
            id: equip.id, name: equip.navn, type: 'equipment', expiryDate,
            daysUntilExpiry: Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
            companyId: equip.company_id,
            statusLevel: 'Gul',
          });
        }
      }

      // ── Accessories: still date-based (unchanged) ──
      const companyAccessories = accessories?.filter((a: any) => a.company_id === profile.company_id) || [];
      for (const acc of companyAccessories) {
        const expiryDate = new Date(acc.neste_vedlikehold);
        expiryDate.setHours(0, 0, 0, 0);
        const reminderDate = new Date(today);
        reminderDate.setDate(reminderDate.getDate() + (acc.varsel_dager ?? 14));
        if (expiryDate <= reminderDate && expiryDate >= today) {
          itemsNeedingAttention.push({
            id: acc.id, name: acc.navn, type: 'accessory', expiryDate,
            daysUntilExpiry: Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
            companyId: acc.company_id,
            statusLevel: 'Gul',
          });
        }
      }

      if (itemsNeedingAttention.length === 0) continue;

      itemsNeedingAttention.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      // ── Push notification ──
      if (pref.push_enabled && pref.push_maintenance_reminder) {
        const pushTitle = 'Vedlikeholdspåminnelse';
        const pushBody = itemsNeedingAttention.length === 1
          ? `${itemsNeedingAttention[0].name} krever vedlikehold`
          : `${itemsNeedingAttention.length} ressurser krever vedlikehold snart`;
        const pushSent = await sendPushNotifications(supabase, pref.user_id, pushTitle, pushBody);
        if (pushSent) totalPushSent++;
      }

      if (!pref.email_inspection_reminder) continue;

      // ── Build email ──
      const { data: companyData } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', profile.company_id)
        .single();

      const companyName = companyData?.navn || 'Selskapet';
      const emailConfig = await getEmailConfig(profile.company_id);
      const fromName = emailConfig.fromName || "AviSafe";

      const { data: template } = await supabase
        .from('email_templates')
        .select('subject, content')
        .eq('company_id', profile.company_id)
        .eq('template_type', 'maintenance_reminder')
        .maybeSingle();

      const typeLabels: Record<string, string> = { drone: 'Drone', equipment: 'Utstyr', accessory: 'Tilbehør' };

      let emailHtml: string;
      let emailSubject: string;

      if (template) {
        const itemsList = itemsNeedingAttention.map(item => {
          const dateStr = item.expiryDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
          const statusLabel = item.type === 'drone' ? ` [${item.statusLevel}]` : '';
          return `${typeLabels[item.type]}: ${item.name} - ${dateStr}${statusLabel}`;
        }).join('\n');

        emailSubject = template.subject
          .replace(/\{\{company_name\}\}/g, companyName)
          .replace(/\{\{item_count\}\}/g, String(itemsNeedingAttention.length));

        emailHtml = template.content
          .replace(/\{\{company_name\}\}/g, companyName)
          .replace(/\{\{items_list\}\}/g, itemsList)
          .replace(/\{\{item_count\}\}/g, String(itemsNeedingAttention.length))
          .replace(/\{\{user_name\}\}/g, profile.full_name || 'Bruker');
      } else {
        const itemsListHtml = itemsNeedingAttention.map(item => {
          const dateStr = item.expiryDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
          const urgencyColor = item.statusLevel === 'Rød' ? '#ef4444' : '#f59e0b';
          const statusText = item.type === 'drone'
            ? (item.statusLevel === 'Rød' ? 'Forfalt' : 'Nærmer seg')
            : `om ${item.daysUntilExpiry} ${item.daysUntilExpiry === 1 ? 'dag' : 'dager'}`;
          return `<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:15px;border-left:4px solid ${urgencyColor};"><h3 style="color:#333;font-size:16px;margin:0 0 8px 0;">${item.name}</h3><div style="margin-bottom:5px;"><strong style="color:#666;">Type:</strong><span style="color:#333;margin-left:8px;">${typeLabels[item.type]}</span></div><div><strong style="color:#666;">Status:</strong><span style="color:${urgencyColor};margin-left:8px;">${statusText}</span></div></div>`;
        }).join('');

        emailSubject = `Vedlikeholdspåminnelse: ${itemsNeedingAttention.length} ${itemsNeedingAttention.length === 1 ? 'ressurs' : 'ressurser'} krever oppmerksomhet`;

        emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;"><div style="max-width:600px;margin:0 auto;padding:20px;"><div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);color:white;padding:30px 20px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:24px;">Vedlikeholdspåminnelse</h1><p style="margin:10px 0 0 0;opacity:0.9;">${companyName}</p></div><div style="background:#ffffff;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p style="color:#666;margin-bottom:20px;">Hei${profile.full_name ? ' ' + profile.full_name : ''},</p><p style="color:#666;margin-bottom:20px;">Følgende ressurser har vedlikehold eller inspeksjon som krever oppmerksomhet:</p>${itemsListHtml}<p style="color:#666;margin-top:25px;">Logg inn i AviSafe for å se detaljer og registrere vedlikehold.</p></div><div style="text-align:center;padding:20px;color:#666;font-size:12px;"><p>Denne e-posten er sendt automatisk fra AviSafe.<br>Du kan justere varslingsinnstillingene i din profil.</p></div></div></body></html>`;
      }

      try {
        const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
        await sendEmail({ from: senderAddress, to: authUser.email, subject: sanitizeSubject(emailSubject), html: emailHtml });
        totalEmailsSent++;
        console.log(`Email sent to ${authUser.email}`);

        const childCompanyIds = [...new Set(itemsNeedingAttention.map((item) => item.companyId))];
        const parentRecipientIds = new Set<string>();
        for (const childCompanyId of childCompanyIds) {
          const parentCompanyId = parentByCompany.get(childCompanyId);
          if (!parentCompanyId || parentCompanyId === profile.company_id) continue;
          const ids = await getParentAdminIdsWithPreference(supabase, parentCompanyId, 'email_child_maintenance_reminder');
          ids.forEach((id) => parentRecipientIds.add(id));
        }

        for (const parentUserId of parentRecipientIds) {
          if (parentUserId === pref.user_id) continue;
          const key = `${parentUserId}:${itemsNeedingAttention.map((item) => item.id).sort().join(',')}`;
          if (parentMaintenanceNotificationKeys.has(key)) continue;
          parentMaintenanceNotificationKeys.add(key);
          const parentAuthUser = authUsers?.users.find((u: any) => u.id === parentUserId);
          if (!parentAuthUser?.email) continue;
          await sendEmail({ from: senderAddress, to: parentAuthUser.email, subject: sanitizeSubject(emailSubject), html: emailHtml });
          totalEmailsSent++;
        }
      } catch (emailError) {
        console.error(`Error sending email to ${authUser.email}:`, emailError);
      }
    }

    // Notify parent-company admins independently of local users' reminder settings.
    const childItemsByCompany = new Map<string, MaintenanceItem[]>();
    for (const drone of drones || []) {
      const info = droneStatusMap.get(drone.id);
      if (!info || info.status === 'Grønn' || drone.maintenance_notification_sent) continue;
      const expiryDate = drone.neste_inspeksjon ? new Date(drone.neste_inspeksjon) : new Date();
      expiryDate.setHours(0, 0, 0, 0);
      const daysUntil = drone.neste_inspeksjon ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const items = childItemsByCompany.get(drone.company_id) || [];
      items.push({ id: drone.id, name: drone.modell, type: 'drone', expiryDate, daysUntilExpiry: daysUntil, companyId: drone.company_id, statusLevel: info.status });
      childItemsByCompany.set(drone.company_id, items);
    }

    for (const equip of equipment || []) {
      const expiryDate = new Date(equip.neste_vedlikehold);
      expiryDate.setHours(0, 0, 0, 0);
      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + (equip.varsel_dager ?? 14));
      if (expiryDate > reminderDate || expiryDate < today) continue;
      const items = childItemsByCompany.get(equip.company_id) || [];
      items.push({ id: equip.id, name: equip.navn, type: 'equipment', expiryDate, daysUntilExpiry: Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)), companyId: equip.company_id, statusLevel: 'Gul' });
      childItemsByCompany.set(equip.company_id, items);
    }

    for (const acc of accessories || []) {
      const expiryDate = new Date(acc.neste_vedlikehold);
      expiryDate.setHours(0, 0, 0, 0);
      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + (acc.varsel_dager ?? 14));
      if (expiryDate > reminderDate || expiryDate < today) continue;
      const items = childItemsByCompany.get(acc.company_id) || [];
      items.push({ id: acc.id, name: acc.navn, type: 'accessory', expiryDate, daysUntilExpiry: Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)), companyId: acc.company_id, statusLevel: 'Gul' });
      childItemsByCompany.set(acc.company_id, items);
    }

    for (const [childCompanyId, items] of childItemsByCompany) {
      const parentCompanyId = parentByCompany.get(childCompanyId);
      if (!parentCompanyId || !items.length) continue;
      const parentRecipientIds = await getParentAdminIdsWithPreference(supabase, parentCompanyId, 'email_child_maintenance_reminder');
      if (!parentRecipientIds.length) continue;

      const { data: childCompany } = await supabase.from('companies').select('navn').eq('id', childCompanyId).single();
      const emailConfig = await getEmailConfig(childCompanyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || 'AviSafe', emailConfig.fromEmail);
      const itemsListHtml = items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry).map((item) => {
        const typeLabels: Record<string, string> = { drone: 'Drone', equipment: 'Utstyr', accessory: 'Tilbehør' };
        const dateStr = item.expiryDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
        const urgencyColor = item.statusLevel === 'Rød' ? '#ef4444' : '#f59e0b';
        const statusText = item.type === 'drone' ? (item.statusLevel === 'Rød' ? 'Forfalt' : 'Nærmer seg') : `om ${item.daysUntilExpiry} ${item.daysUntilExpiry === 1 ? 'dag' : 'dager'}`;
        return `<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:15px;border-left:4px solid ${urgencyColor};"><h3 style="color:#333;font-size:16px;margin:0 0 8px 0;">${item.name}</h3><div style="margin-bottom:5px;"><strong style="color:#666;">Type:</strong><span style="color:#333;margin-left:8px;">${typeLabels[item.type]}</span></div><div><strong style="color:#666;">Status:</strong><span style="color:${urgencyColor};margin-left:8px;">${statusText}</span></div><div><strong style="color:#666;">Avdeling:</strong><span style="color:#333;margin-left:8px;">${childCompany?.navn || 'Avdeling'}</span></div></div>`;
      }).join('');
      const emailSubject = `Vedlikeholdspåminnelse i avdeling: ${items.length} ${items.length === 1 ? 'ressurs' : 'ressurser'} krever oppmerksomhet`;
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;"><div style="max-width:600px;margin:0 auto;padding:20px;"><div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);color:white;padding:30px 20px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:24px;">Vedlikeholdspåminnelse</h1><p style="margin:10px 0 0 0;opacity:0.9;">${childCompany?.navn || 'Avdeling'}</p></div><div style="background:#ffffff;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p style="color:#666;margin-bottom:20px;">Følgende ressurser i en avdeling krever oppmerksomhet:</p>${itemsListHtml}<p style="color:#666;margin-top:25px;">Logg inn i AviSafe for å se detaljer og registrere vedlikehold.</p></div></div></body></html>`;

      const itemKey = items.map((item) => item.id).sort().join(',');
      for (const parentUserId of parentRecipientIds) {
        const key = `${parentUserId}:${itemKey}`;
        if (parentMaintenanceNotificationKeys.has(key)) continue;
        parentMaintenanceNotificationKeys.add(key);
        const parentAuthUser = authUsers?.users.find((u: any) => u.id === parentUserId);
        if (!parentAuthUser?.email) continue;
        await sendEmail({ from: senderAddress, to: parentAuthUser.email, subject: sanitizeSubject(emailSubject), html: emailHtml });
        totalEmailsSent++;
      }
    }

    // ── Mark drones as notified ──
    if (dronesNeedingNotification.length > 0) {
      await supabase
        .from('drones')
        .update({ maintenance_notification_sent: true })
        .in('id', dronesNeedingNotification);
      console.log(`Marked ${dronesNeedingNotification.length} drones as notified.`);
    }

    console.log(`Maintenance check complete. Sent ${totalEmailsSent} emails, ${totalPushSent} push notifications.`);

    return new Response(
      JSON.stringify({ success: true, emailsSent: totalEmailsSent, pushSent: totalPushSent, usersChecked: (notificationPrefs || []).length, dronesNotified: dronesNeedingNotification.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in check-maintenance-expiry function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
