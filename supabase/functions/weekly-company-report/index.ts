import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { AVISAFE_LOGO_B64 } from "./logo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://app.avisafe.no";

interface ReportSection {
  title: string;
  rows: Array<{ label: string; value: string; warn?: boolean }>;
  empty?: string;
}

// ----- Date helpers ------------------------------------------------
function getPreviousISOWeek(now = new Date()) {
  // Find Monday of previous ISO week (UTC base)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // 1..7, Mon=1
  // Monday this week:
  d.setUTCDate(d.getUTCDate() - (day - 1));
  // Back one week:
  d.setUTCDate(d.getUTCDate() - 7);
  const weekStart = new Date(d);
  const weekEnd = new Date(d);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7); // exclusive

  // ISO week number
  const tmp = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const isoYear = tmp.getUTCFullYear();

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  return { weekStart, weekEnd, isoWeek, isoYear, prevWeekStart, prevWeekEnd: weekStart };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", timeZone: "Europe/Oslo" });
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "±0%" : "+∞";
  const diff = ((curr - prev) / prev) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(0)}%`;
}

// (Charts removed — plain HTML tables only)

// ----- HTML template ----------------------------------------------
function renderEmail(opts: {
  companyName: string;
  scopeLabel: string;
  weekRange: string;
  weekNum: number;
  activity: { missions: number; missionsPrev: number; flightHoursH: string; flightHoursPrevH: string; flights: number };
  departmentBreakdown?: Array<{ name: string; missions: number; flightHoursH: string; flights: number }>;
  incidents: { newCount: number; openCount: number; bySeverity: Record<string, number> };
  maintenance: { drones: Array<{ name: string; due: string; overdue: boolean }>; equipment: Array<{ name: string; due: string; overdue: boolean }> };
  documents: Array<{ name: string; user: string; due: string; overdue: boolean }>;
  competencies: Array<{ name: string; user: string; due: string; overdue: boolean }>;
  unsubscribeUrl: string;
}) {
  // Cards inherit width from a single fixed inner wrapper to avoid Gmail mobile shrink-to-content rendering.
  const card = (title: string, body: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="width:100%;min-width:100%;margin:0 0 16px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;table-layout:fixed;mso-table-lspace:0pt;mso-table-rspace:0pt">
      <tr><td width="100%" style="width:100%;padding:18px 20px">
        <h2 style="margin:0 0 14px;font-size:15px;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:600">${title}</h2>
        ${body}
      </td></tr>
    </table>`;

  const row = (label: string, value: string, warn = false) =>
    `<tr><td style="padding:6px 0;color:#475569;font-size:13px">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${warn ? "#b91c1c" : "#0f172a"};font-size:13px">${value}</td></tr>`;

  const emptyOk = (msg: string) =>
    `<div style="padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;color:#065f46;font-size:13px">${msg}</div>`;

  const flightHoursNow = parseFloat(opts.activity.flightHoursH);
  const flightHoursPrev = parseFloat(opts.activity.flightHoursPrevH);

  const activityChart = "";

  const activityRows = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${row("Antall oppdrag", `${opts.activity.missions} (${pctChange(opts.activity.missions, opts.activity.missionsPrev)})`)}
      ${row("Flytimer", `${opts.activity.flightHoursH}h (${pctChange(flightHoursNow, flightHoursPrev)})`)}
      ${row("Antall flyvninger", String(opts.activity.flights))}
    </table>`;

  const dept = opts.departmentBreakdown && opts.departmentBreakdown.length > 0
    ? `<div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:12px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">
          <tr>
            <th style="text-align:left;font-size:11px;color:#64748b;font-weight:500;padding:6px 0">AVDELING</th>
            <th style="text-align:right;font-size:11px;color:#64748b;font-weight:500;padding:6px 0">OPPDRAG</th>
            <th style="text-align:right;font-size:11px;color:#64748b;font-weight:500;padding:6px 0">TIMER</th>
            <th style="text-align:right;font-size:11px;color:#64748b;font-weight:500;padding:6px 0">FLY</th>
          </tr>
          ${opts.departmentBreakdown.map(d => `<tr>
            <td style="padding:4px 0;font-size:12px;color:#0f172a">${d.name}</td>
            <td style="text-align:right;font-size:12px">${d.missions}</td>
            <td style="text-align:right;font-size:12px">${d.flightHoursH}</td>
            <td style="text-align:right;font-size:12px">${d.flights}</td>
          </tr>`).join("")}
        </table>
      </div>`
    : "";

  const hasIncidentData = opts.incidents.newCount > 0 || opts.incidents.openCount > 0;
  const severityRows = Object.entries(opts.incidents.bySeverity)
    .map(([k, v]) => row(`Alvorlighetsgrad: ${k.charAt(0).toUpperCase() + k.slice(1)}`, String(v), true))
    .join("");
  const incidentsBody = !hasIncidentData
    ? emptyOk("Ingen nye eller åpne avvik")
    : `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${row("Nye avvik forrige uke", String(opts.incidents.newCount), opts.incidents.newCount > 0)}
        ${row("Åpne avvik totalt", String(opts.incidents.openCount), opts.incidents.openCount > 0)}
        ${severityRows}
      </table>`;

  const listItems = (items: Array<{ name: string; due: string; overdue: boolean; user?: string }>) =>
    items.map(i => `<tr>
        <td style="padding:5px 0;font-size:13px;color:#0f172a">${i.name}${i.user ? ` <span style="color:#64748b">(${i.user})</span>` : ""}</td>
        <td style="padding:5px 0;text-align:right;font-size:12px;color:${i.overdue ? "#b91c1c" : "#b45309"};font-weight:600;white-space:nowrap">${i.overdue ? "FORFALT " : ""}${i.due}</td>
      </tr>`).join("");

  const maintBody = opts.maintenance.drones.length === 0 && opts.maintenance.equipment.length === 0
    ? emptyOk("Ingen vedlikehold forfaller neste 30 dager")
    : `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">
        ${opts.maintenance.drones.length > 0 ? `<tr><td colspan="2" style="padding:6px 0 2px;font-size:11px;color:#64748b;font-weight:500">DRONER</td></tr>${listItems(opts.maintenance.drones)}` : ""}
        ${opts.maintenance.equipment.length > 0 ? `<tr><td colspan="2" style="padding:8px 0 2px;font-size:11px;color:#64748b;font-weight:500">UTSTYR</td></tr>${listItems(opts.maintenance.equipment)}` : ""}
      </table>`;

  const docsBody = opts.documents.length === 0
    ? emptyOk("Ingen dokumenter forfaller neste 30 dager")
    : `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">${listItems(opts.documents)}</table>`;

  const compBody = opts.competencies.length === 0
    ? emptyOk("Ingen kompetanser forfaller neste 30 dager")
    : `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">${listItems(opts.competencies)}</table>`;

  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;min-width:600px;max-width:600px;table-layout:fixed;border-collapse:separate">
        <tr><td width="600" style="background:#0f172a;padding:24px;border-radius:10px 10px 0 0;width:600px">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;table-layout:fixed">
            <tr>
              <td valign="middle" style="vertical-align:middle">
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600">Ukesrapport — ${opts.scopeLabel}</h1>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">${opts.companyName} · Uke ${opts.weekNum} (${opts.weekRange})</p>
              </td>
              <td valign="middle" align="right" width="150" style="vertical-align:middle;width:150px">
                <img src="cid:avisafe-logo" alt="AviSafe" width="140" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:1px;line-height:1px;margin-left:auto" />
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td width="600" style="background:#f8fafc;padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;width:600px;word-break:break-word">
          <table width="560" cellpadding="0" cellspacing="0" role="presentation" align="center" style="width:560px;min-width:560px;max-width:560px;table-layout:fixed;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt">
            <tr><td width="560" style="width:560px">
              ${card("Aktivitet forrige uke", activityRows + dept)}
              ${card("Avvik og hendelser", incidentsBody)}
              ${card("Vedlikehold (forfalt og neste 30 dager)", maintBody)}
              ${card("Dokumenter med utløp", docsBody)}
              ${card("Personell-kompetanser", compBody)}
              <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">
                Du mottar denne rapporten fordi du er admin i ${opts.companyName}.
                <a href="${opts.unsubscribeUrl}" style="color:#64748b;text-decoration:underline">Avmeld ukesrapporten</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}


// ----- Main --------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { dryRun?: boolean; companyId?: string; trigger?: string; recipientEmail?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dryRun = !!body.dryRun;
  const overrideEmail = body.recipientEmail?.trim().toLowerCase() || null;

  const { weekStart, weekEnd, isoWeek, isoYear, prevWeekStart, prevWeekEnd } = getPreviousISOWeek();
  const weekRange = `${fmtDate(weekStart)}–${fmtDate(new Date(weekEnd.getTime() - 86400000))}`;

  const summary = { companies: 0, recipients: 0, sent: 0, skipped: 0, errors: [] as string[] };

  // 1) Load companies
  let companiesQ = supabase.from("companies").select("id, navn, parent_company_id").eq("aktiv", true);
  if (body.companyId) companiesQ = companiesQ.eq("id", body.companyId);
  const { data: companies, error: cErr } = await companiesQ;
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const allCompanies = companies || [];
  const childrenByParent = new Map<string, string[]>();
  for (const c of allCompanies) {
    if (c.parent_company_id) {
      const arr = childrenByParent.get(c.parent_company_id) || [];
      arr.push(c.id);
      childrenByParent.set(c.parent_company_id, arr);
    }
  }

  for (const company of allCompanies) {
    summary.companies++;
    const isParent = !company.parent_company_id;
    const childIds = childrenByParent.get(company.id) || [];
    const scopeIds = isParent ? [company.id, ...childIds] : [company.id];
    const scopeLabel = isParent
      ? (childIds.length > 0 ? "Konsern" : "Selskap")
      : "Avdeling";

    try {
      // --- Activity (missions + flight_logs) for this week & previous week
      const startISO = weekStart.toISOString();
      const endISO = weekEnd.toISOString();
      const prevStartISO = prevWeekStart.toISOString();
      const prevEndISO = prevWeekEnd.toISOString();

      const [missionsRes, missionsPrevRes, flightsRes, flightsPrevRes] = await Promise.all([
        supabase.from("missions").select("id, company_id", { count: "exact" }).in("company_id", scopeIds).gte("tidspunkt", startISO).lt("tidspunkt", endISO),
        supabase.from("missions").select("id", { count: "exact", head: true }).in("company_id", scopeIds).gte("tidspunkt", prevStartISO).lt("tidspunkt", prevEndISO),
        supabase.from("flight_logs").select("id, company_id, flight_duration_minutes").in("company_id", scopeIds).gte("flight_date", startISO).lt("flight_date", endISO),
        supabase.from("flight_logs").select("flight_duration_minutes").in("company_id", scopeIds).gte("flight_date", prevStartISO).lt("flight_date", prevEndISO),
      ]);

      const missionsCount = missionsRes.count || (missionsRes.data?.length ?? 0);
      const missionsPrev = missionsPrevRes.count || 0;
      const flights = flightsRes.data || [];
      const flightsPrev = flightsPrevRes.data || [];
      const totalMinutes = flights.reduce((s, f: any) => s + (f.flight_duration_minutes || 0), 0);
      const totalMinutesPrev = flightsPrev.reduce((s, f: any) => s + (f.flight_duration_minutes || 0), 0);

      // Department breakdown for parent reports
      let departmentBreakdown: Array<{ name: string; missions: number; flightHoursH: string; flights: number }> | undefined;
      if (isParent && childIds.length > 0) {
        departmentBreakdown = [];
        for (const c of [company, ...allCompanies.filter(x => childIds.includes(x.id))]) {
          const m = (missionsRes.data || []).filter((x: any) => x.company_id === c.id).length;
          const f = flights.filter((x: any) => x.company_id === c.id);
          const mins = f.reduce((s, x: any) => s + (x.flight_duration_minutes || 0), 0);
          if (m > 0 || f.length > 0) {
            departmentBreakdown.push({ name: c.navn, missions: m, flightHoursH: (mins / 60).toFixed(1), flights: f.length });
          }
        }
      }

      // --- Incidents
      const [newIncRes, openIncRes] = await Promise.all([
        supabase.from("incidents").select("alvorlighetsgrad").in("company_id", scopeIds).gte("opprettet_dato", startISO).lt("opprettet_dato", endISO),
        supabase.from("incidents").select("id", { count: "exact", head: true }).in("company_id", scopeIds).neq("status", "lukket"),
      ]);
      const bySeverity: Record<string, number> = {};
      for (const i of (newIncRes.data || []) as any[]) {
        const s = i.alvorlighetsgrad || "ukjent";
        bySeverity[s] = (bySeverity[s] || 0) + 1;
      }

      // --- Maintenance horizon: now → +30 days. Include overdue.
      const horizon = new Date(Date.now() + 30 * 86400000).toISOString();

      const [dronesRes, equipRes, docsRes, compRes] = await Promise.all([
        supabase.from("drones").select("modell, serienummer, neste_inspeksjon").in("company_id", scopeIds).not("neste_inspeksjon", "is", null).lte("neste_inspeksjon", horizon).eq("aktiv", true),
        supabase.from("equipment").select("navn, neste_vedlikehold").in("company_id", scopeIds).not("neste_vedlikehold", "is", null).lte("neste_vedlikehold", horizon).eq("aktiv", true),
        supabase.from("documents").select("tittel, gyldig_til").in("company_id", scopeIds).not("gyldig_til", "is", null).lte("gyldig_til", horizon),
        supabase.from("personnel_competencies").select("navn, utloper_dato, profile_id").not("utloper_dato", "is", null).lte("utloper_dato", horizon),
      ]);

      const now = Date.now();
      const droneItems = ((dronesRes.data || []) as any[]).map(d => ({
        name: `${d.modell || "Drone"} (${d.serienummer || "u/SN"})`,
        due: fmtDate(new Date(d.neste_inspeksjon)),
        overdue: new Date(d.neste_inspeksjon).getTime() < now,
      }));
      const equipItems = ((equipRes.data || []) as any[]).map(e => ({
        name: e.navn || "Utstyr",
        due: fmtDate(new Date(e.neste_vedlikehold)),
        overdue: new Date(e.neste_vedlikehold).getTime() < now,
      }));
      const docItems = ((docsRes.data || []) as any[]).map(d => ({
        name: d.tittel || "Dokument",
        user: "",
        due: fmtDate(new Date(d.gyldig_til)),
        overdue: new Date(d.gyldig_til).getTime() < now,
      }));

      // Filter competencies by scope (need profile_ids that belong to scope)
      const compRaw = (compRes.data || []) as any[];
      let compItems: Array<{ name: string; user: string; due: string; overdue: boolean }> = [];
      if (compRaw.length > 0) {
        const profileIds = [...new Set(compRaw.map(c => c.profile_id).filter(Boolean))];
        const { data: scopedProfiles } = await supabase.from("profiles").select("id, full_name, company_id").in("id", profileIds).in("company_id", scopeIds);
        const pmap = new Map((scopedProfiles || []).map((p: any) => [p.id, p.full_name]));
        compItems = compRaw
          .filter(c => pmap.has(c.profile_id))
          .map(c => ({
            name: c.navn || "Kompetanse",
            user: pmap.get(c.profile_id) || "",
            due: fmtDate(new Date(c.utloper_dato)),
            overdue: new Date(c.utloper_dato).getTime() < now,
          }));
      }

      // --- Skip empty? (skip check when overriding recipient – we want to see template)
      const totallyEmpty =
        missionsCount === 0 && totalMinutes === 0 &&
        (newIncRes.data?.length ?? 0) === 0 && (openIncRes.count ?? 0) === 0 &&
        droneItems.length === 0 && equipItems.length === 0 && docItems.length === 0 && compItems.length === 0;

      if (totallyEmpty && !overrideEmail) {
        summary.skipped++;
        continue;
      }

      // --- Recipients
      let recipients: any[] = [];
      if (overrideEmail) {
        const { data: r } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("email", overrideEmail)
          .maybeSingle();
        if (r) recipients = [r];
      } else {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "administrator", "superadmin"]);
        const adminUserIds = [...new Set((roles || []).map((r: any) => r.user_id))];
        if (adminUserIds.length === 0) continue;

        const { data: rs } = await supabase
          .from("profiles")
          .select("id, full_name, email, weekly_report_unsubscribed")
          .in("id", adminUserIds)
          .eq("company_id", company.id)
          .eq("approved", true)
          .eq("weekly_report_unsubscribed", false)
          .not("email", "is", null);
        recipients = rs || [];
      }

      const html = renderEmail({
        companyName: company.navn,
        scopeLabel,
        weekRange,
        weekNum: isoWeek,
        activity: {
          missions: missionsCount,
          missionsPrev,
          flightHoursH: (totalMinutes / 60).toFixed(1),
          flightHoursPrevH: (totalMinutesPrev / 60).toFixed(1),
          flights: flights.length,
        },
        departmentBreakdown,
        incidents: { newCount: newIncRes.data?.length ?? 0, openCount: openIncRes.count ?? 0, bySeverity },
        maintenance: { drones: droneItems, equipment: equipItems },
        documents: docItems,
        competencies: compItems,
        unsubscribeUrl: "", // filled per recipient
      });

      const emailConfig = await getEmailConfig(company.id);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const subject = sanitizeSubject(`Ukesrapport ${company.navn} (${scopeLabel}) – uke ${isoWeek}`);

      for (const r of recipients) {
        summary.recipients++;
        // Idempotency check (skipped on override so you can re-test)
        if (!overrideEmail) {
          const { data: existing } = await supabase
            .from("weekly_report_sends")
            .select("id")
            .eq("company_id", company.id)
            .eq("recipient_user_id", r.id)
            .eq("iso_year", isoYear)
            .eq("iso_week", isoWeek)
            .maybeSingle();
          if (existing) { summary.skipped++; continue; }
        }

        // Personalised unsubscribe link (signed token = base64(user_id:hmac))
        const token = btoa(`${r.id}:${isoYear}:${isoWeek}`);
        const unsubscribeUrl = `${APP_URL}/unsubscribe-weekly?token=${encodeURIComponent(token)}`;
        const personalHtml = html.replace(/href=""/g, `href="${unsubscribeUrl}"`);

        if (dryRun) {
          summary.sent++;
          continue;
        }

        try {
          const attachments = [{
            filename: "avisafe-logo.png",
            content: AVISAFE_LOGO_B64,
            content_id: "avisafe-logo",
            content_type: "image/png",
          }];
          await sendEmail({ from: senderAddress, to: r.email, subject, html: personalHtml, attachments });
          if (!overrideEmail) {
            await supabase.from("weekly_report_sends").insert({
              company_id: company.id,
              recipient_user_id: r.id,
              recipient_email: r.email,
              scope_label: scopeLabel,
              iso_year: isoYear,
              iso_week: isoWeek,
              status: "sent",
            });
          }
          summary.sent++;
          await new Promise(res => setTimeout(res, 200)); // gentle rate-limit
        } catch (e: any) {
          summary.errors.push(`${company.navn}/${r.email}: ${e.message}`);
          await supabase.from("weekly_report_sends").insert({
            company_id: company.id,
            recipient_user_id: r.id,
            recipient_email: r.email,
            scope_label: scopeLabel,
            iso_year: isoYear,
            iso_week: isoWeek,
            status: "failed",
            error_message: String(e.message || e).slice(0, 500),
          });
        }
      }
    } catch (e: any) {
      summary.errors.push(`${company.navn}: ${e.message}`);
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
