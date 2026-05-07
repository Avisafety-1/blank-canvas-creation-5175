import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ICS helper functions
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatICSDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatICSDateOnly(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  type: string;
  allDay?: boolean;
  updatedAt?: Date;
}

function generateICSContent(events: CalendarEvent[], companyName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AviSafe//Calendar//NO",
    `X-WR-CALNAME:${escapeICSText(companyName)} - AviSafe`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Add VTIMEZONE for Norwegian time
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Oslo",
    "X-LIC-LOCATION:Europe/Oslo",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@avisafe.no`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatICSDateOnly(event.startDate)}`);
      if (event.endDate) {
        const nextDay = new Date(event.endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${formatICSDateOnly(nextDay)}`);
      }
    } else {
      lines.push(`DTSTART;TZID=Europe/Oslo:${formatICSDate(event.startDate)}`);
      if (event.endDate) {
        lines.push(`DTEND;TZID=Europe/Oslo:${formatICSDate(event.endDate)}`);
      } else {
        const endDate = new Date(event.startDate);
        endDate.setHours(endDate.getHours() + 1);
        lines.push(`DTEND;TZID=Europe/Oslo:${formatICSDate(endDate)}`);
      }
    }

    lines.push(`SUMMARY:${escapeICSText(event.title)}`);

    const descParts: string[] = [];
    if (event.description) {
      descParts.push(event.description);
    }
    descParts.push("Åpne i AviSafe: https://app.avisafe.no");
    lines.push(`DESCRIPTION:${escapeICSText(descParts.join("\\n\\n"))}`);
    lines.push("URL:https://app.avisafe.no");

    if (event.type) {
      lines.push(`CATEGORIES:${escapeICSText(event.type)}`);
    }

    // LAST-MODIFIED and SEQUENCE for sync detection
    if (event.updatedAt) {
      lines.push(`LAST-MODIFIED:${formatICSDate(event.updatedAt)}`);
      // SEQUENCE increases with each change - use minutes since epoch
      lines.push(`SEQUENCE:${Math.floor(event.updatedAt.getTime() / 60000)}`);
    } else {
      lines.push(`SEQUENCE:0`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with service role for data access
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token and get company_id
    const { data: subscription, error: subError } = await supabase
      .from("calendar_subscriptions")
      .select("id, company_id")
      .eq("token", token)
      .single();

    if (subError || !subscription) {
      console.error("Token validation failed:", subError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const companyId = subscription.company_id;

    // Update last_accessed_at
    await supabase
      .from("calendar_subscriptions")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", subscription.id);

    // Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("navn")
      .eq("id", companyId)
      .single();

    const companyName = company?.navn || "AviSafe";

    // Fetch all events for this company
    const events: CalendarEvent[] = [];
    const now = new Date();

    // 1. Calendar events (future only)
    const { data: calendarEvents } = await supabase
      .from("calendar_events")
      .select("id, title, description, event_date, event_time, type, updated_at")
      .eq("company_id", companyId)
      .gte("event_date", now.toISOString().split("T")[0]);

    if (calendarEvents) {
      for (const event of calendarEvents) {
        const eventDate = new Date(event.event_date);
        const updatedAt = event.updated_at ? new Date(event.updated_at) : undefined;
        if (event.event_time) {
          const [hours, minutes] = event.event_time.split(":");
          eventDate.setHours(parseInt(hours), parseInt(minutes));
          events.push({
            id: `cal-${event.id}`,
            title: event.title,
            description: event.description || undefined,
            startDate: eventDate,
            type: event.type,
            allDay: false,
            updatedAt,
          });
        } else {
          events.push({
            id: `cal-${event.id}`,
            title: event.title,
            description: event.description || undefined,
            startDate: eventDate,
            type: event.type,
            allDay: true,
            updatedAt,
          });
        }
      }
    }

    // 2. Missions (future only)
    const { data: missions } = await supabase
      .from("missions")
      .select("id, tittel, beskrivelse, tidspunkt, slutt_tidspunkt, oppdatert_dato")
      .eq("company_id", companyId)
      .gte("tidspunkt", now.toISOString());

    if (missions) {
      for (const mission of missions) {
        events.push({
          id: `mission-${mission.id}`,
          title: mission.tittel,
          description: mission.beskrivelse || undefined,
          startDate: new Date(mission.tidspunkt),
          endDate: mission.slutt_tidspunkt
            ? new Date(mission.slutt_tidspunkt)
            : undefined,
          type: "Oppdrag",
          updatedAt: mission.oppdatert_dato ? new Date(mission.oppdatert_dato) : undefined,
        });
      }
    }

    // 3. Documents with expiry dates
    const { data: documents } = await supabase
      .from("documents")
      .select("id, tittel, kategori, gyldig_til, oppdatert_dato")
      .eq("company_id", companyId)
      .not("gyldig_til", "is", null)
      .gte("gyldig_til", now.toISOString());

    if (documents) {
      for (const doc of documents) {
        events.push({
          id: `doc-${doc.id}`,
          title: `${doc.tittel} utgår`,
          description: `Kategori: ${doc.kategori}`,
          startDate: new Date(doc.gyldig_til!),
          type: "Dokument",
          allDay: true,
          updatedAt: doc.oppdatert_dato ? new Date(doc.oppdatert_dato) : undefined,
        });
      }
    }

    // 4. Drones with inspection dates
    const { data: drones } = await supabase
      .from("drones")
      .select("id, modell, neste_inspeksjon, oppdatert_dato")
      .eq("company_id", companyId)
      .not("neste_inspeksjon", "is", null)
      .gte("neste_inspeksjon", now.toISOString());

    if (drones) {
      for (const drone of drones) {
        events.push({
          id: `drone-${drone.id}`,
          title: `${drone.modell} - inspeksjon`,
          description: "Drone inspeksjon",
          startDate: new Date(drone.neste_inspeksjon!),
          type: "Vedlikehold",
          allDay: true,
          updatedAt: drone.oppdatert_dato ? new Date(drone.oppdatert_dato) : undefined,
        });
      }
    }

    // 5. Equipment with maintenance dates
    const { data: equipment } = await supabase
      .from("equipment")
      .select("id, navn, neste_vedlikehold, oppdatert_dato")
      .eq("company_id", companyId)
      .not("neste_vedlikehold", "is", null)
      .gte("neste_vedlikehold", now.toISOString());

    if (equipment) {
      for (const eq of equipment) {
        events.push({
          id: `eq-${eq.id}`,
          title: `${eq.navn} - vedlikehold`,
          description: "Utstyrsvedlikehold",
          startDate: new Date(eq.neste_vedlikehold!),
          type: "Vedlikehold",
          allDay: true,
          updatedAt: eq.oppdatert_dato ? new Date(eq.oppdatert_dato) : undefined,
        });
      }
    }

    // 6. Drone accessories with maintenance dates
    const { data: accessories } = await supabase
      .from("drone_accessories")
      .select("id, navn, neste_vedlikehold, updated_at")
      .eq("company_id", companyId)
      .not("neste_vedlikehold", "is", null)
      .gte("neste_vedlikehold", now.toISOString());

    if (accessories) {
      for (const acc of accessories) {
        events.push({
          id: `acc-${acc.id}`,
          title: `${acc.navn} - vedlikehold`,
          description: "Tilbehørsvedlikehold",
          startDate: new Date(acc.neste_vedlikehold!),
          type: "Vedlikehold",
          allDay: true,
          updatedAt: acc.updated_at ? new Date(acc.updated_at) : undefined,
        });
      }
    }

    // Generate ICS content
    const icsContent = generateICSContent(events, companyName);

    console.log(`Generated calendar feed for company ${companyId} with ${events.length} events`);

    return new Response(icsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="avisafe-calendar.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating calendar feed:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
