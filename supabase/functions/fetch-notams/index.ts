import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Parse DMS coordinates from NOTAM text for polygon geometry */
function parseNotamCoordinates(text: string | null | undefined): object | null {
  if (!text) return null;
  const regex = /(\d{2})(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})(\d{2})([EW])/g;
  const coords: [number, number][] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const latDeg = parseInt(match[1]);
    const latMin = parseInt(match[2]);
    const latSec = parseInt(match[3]);
    const latDir = match[4];
    const lngDeg = parseInt(match[5]);
    const lngMin = parseInt(match[6]);
    const lngSec = parseInt(match[7]);
    const lngDir = match[8];
    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === "S") lat = -lat;
    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    if (lngDir === "W") lng = -lng;
    coords.push([lng, lat]);
  }
  if (coords.length < 3) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first] as [number, number]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

/** Parse Q-line center coordinate like 5812N00707E or with radius 5812N00707E014 */
function parseQlineCenter(qline: string): { lat: number; lng: number; radiusNm: number | null } | null {
  // Format: DDMMN DDDMME or DDMMNDDDMME with optional 3-digit radius
  const match = qline.match(/(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})?/);
  if (!match) return null;
  let lat = parseInt(match[1]) + parseInt(match[2]) / 60;
  if (match[3] === "S") lat = -lat;
  let lng = parseInt(match[4]) + parseInt(match[5]) / 60;
  if (match[6] === "W") lng = -lng;
  const radiusNm = match[7] ? parseInt(match[7]) : null;
  return { lat, lng, radiusNm };
}

/** Create a circle polygon from center+radius for NOTAMs without polygon coords.
 *  Returns null if radius exceeds MAX_CIRCLE_NM (FIR-level NOTAMs). */
const MAX_CIRCLE_NM = 25;

function createCirclePolygon(lat: number, lng: number, radiusNm: number): object | null {
  if (radiusNm > MAX_CIRCLE_NM) return null; // Skip huge FIR-level circles
  const radiusKm = radiusNm * 1.852;
  const radiusDeg = radiusKm / 111.32;
  const points: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    const dlat = radiusDeg * Math.cos(angle);
    const dlng = radiusDeg * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
    points.push([lng + dlng, lat + dlat]);
  }
  return { type: "Polygon", coordinates: [points] };
}

/** Parse RSS date strings like "11 Apr 2026 06:30 GMT" */
function parseRssDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/** Parse an RSS item description to extract NOTAM fields */
function parseRssItem(title: string, description: string, guid: string) {
  // Extract NOTAM ID from title like "A2518/26: ..."
  const idMatch = title.match(/^([A-Z])(\d+)\/(\d{2}):/);
  const series = idMatch ? idMatch[1] : null;
  const number = idMatch ? parseInt(idMatch[2]) : 0;
  const year = idMatch ? 2000 + parseInt(idMatch[3]) : 0;
  const notamId = idMatch ? `${series}${number}/${idMatch[3]}` : guid;

  // Clean HTML from description
  const cleanDesc = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?pre>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  // Extract Q-line (first line, format: ENOR/QWULW/IV/BO/W/000/015/5812N00707E014)
  const qlineMatch = cleanDesc.match(/^([A-Z]{4}\/Q[^\n]+)/m);
  const qline = qlineMatch ? qlineMatch[1] : null;

  // Extract location from Q-line
  const location = qline ? qline.substring(0, 4) : null;

  // Extract Q-code and scope from Q-line segments
  // Format: FIR/Qcode/Traffic/Purpose/Scope/Lower/Upper/Coords
  const qlineSegments = qline?.split("/") ?? [];
  const qcodeMatch = qline?.match(/\/(Q[A-Z]+)\//);
  const qcode = qcodeMatch ? qcodeMatch[1] : null;
  const scope = qlineSegments.length >= 5 ? qlineSegments[4] : null;

  // Parse center from Q-line
  let centerLat: number | null = null;
  let centerLng: number | null = null;
  let radiusNm: number | null = null;
  if (qline) {
    const center = parseQlineCenter(qline);
    if (center) {
      centerLat = center.lat;
      centerLng = center.lng;
      radiusNm = center.radiusNm;
    }
  }

  // Extract NOTAM text (between Q-line and LOWER/UPPER)
  const textMatch = cleanDesc.match(/(?:^[A-Z]{4}\/Q[^\n]+\n+)?([\s\S]*?)(?:\nLOWER:|$)/);
  const notamText = textMatch ? textMatch[1].trim() : cleanDesc;

  // Extract altitudes
  const lowerMatch = cleanDesc.match(/LOWER:\s*(.+)/);
  const upperMatch = cleanDesc.match(/UPPER:\s*(.+)/);
  
  // Parse FL from altitude strings
  const parseFL = (alt: string | undefined): number | null => {
    if (!alt) return null;
    const flMatch = alt.match(/FL\s*(\d+)/i);
    if (flMatch) return parseInt(flMatch[1]);
    const ftMatch = alt.match(/([\d,]+)\s*Feet\s*(AMSL|AGL)?/i);
    if (ftMatch) return Math.round(parseInt(ftMatch[1].replace(/,/g, "")) / 100);
    if (/GND|SFC/i.test(alt)) return 0;
    return null;
  };

  const minimumFL = parseFL(lowerMatch?.[1]);
  const maximumFL = parseFL(upperMatch?.[1]);

  // Extract FROM/TO dates
  const fromMatch = cleanDesc.match(/FROM:\s*(\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}\s+GMT)/);
  const toMatch = cleanDesc.match(/TO:\s*(\d{1,2}\s+\w+\s+\d{4}\s+\d{2}:\d{2}\s+GMT)/);
  const effectiveStart = fromMatch ? parseRssDate(fromMatch[1]) : null;
  const effectiveEnd = toMatch ? parseRssDate(toMatch[1]) : null;

  // Check for PERM
  const isPerm = /PERM|permanent/i.test(cleanDesc);
  const effectiveEndInterpretation = isPerm ? "PERM" : (effectiveEnd ? null : "EST");

  // Parse polygon from text coordinates
  const parsedPolygon = parseNotamCoordinates(notamText);
  
  // If no polygon but we have center+radius, create circle
  // Skip circle for aerodrome (scope "A") NOTAMs — show as pin instead
  let geometryGeojson = parsedPolygon;
  if (!geometryGeojson && centerLat && centerLng && radiusNm && radiusNm > 0 && scope !== "A") {
    geometryGeojson = createCirclePolygon(centerLat, centerLng, radiusNm);
  }

  return {
    notam_id: notamId,
    series,
    number,
    year,
    location,
    country_code: "NOR",
    qcode,
    scope,
    traffic: null,
    purpose: null,
    notam_type: null,
    notam_text: notamText,
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    effective_end_interpretation: effectiveEndInterpretation,
    minimum_fl: minimumFL,
    maximum_fl: maximumFL,
    center_lat: centerLat,
    center_lng: centerLng,
    geometry_geojson: geometryGeojson,
    properties: { guid, qline, source: "notaminfo" },
  };
}

/** Fetch and parse a single RSS feed */
async function fetchRssFeed(feedUrl: string): Promise<ReturnType<typeof parseRssItem>[]> {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) {
    console.error(`RSS fetch error [${res.status}] for ${feedUrl}`);
    return [];
  }
  const xml = await res.text();

  // Simple XML parser for RSS items
  const items: ReturnType<typeof parseRssItem>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];
    const getTag = (tag: string) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)(?:<\\/${tag}>|$)`, "i"));
      return m ? m[1].trim() : "";
    };
    const title = getTag("title");
    const description = getTag("description");
    const guid = getTag("guid");

    if (title) {
      items.push(parseRssItem(title, description, guid));
    }
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    let totalUpserted = 0;
    let totalSkipped = 0;

    // ── Step 1: Fetch RSS feeds from notam_rss_feeds table ──
    const { data: feeds } = await supabase
      .from("notam_rss_feeds")
      .select("id, name, feed_url")
      .eq("enabled", true);

    if (feeds && feeds.length > 0) {
      console.log(`Fetching NOTAMs from ${feeds.length} RSS feed(s)...`);
      const feedResults: { name: string; count: number }[] = [];

      for (const feed of feeds) {
        try {
          const items = await fetchRssFeed(feed.feed_url);
          if (items.length === 0) {
            feedResults.push({ name: feed.name, count: 0 });
            continue;
          }

          // Filter expired
          const rows = items
            .filter((item) => {
              if (!item.effective_end) return true;
              const end = new Date(item.effective_end);
              if (end < now && item.effective_end_interpretation !== "PERM" && item.effective_end_interpretation !== "EST") {
                totalSkipped++;
                return false;
              }
              return true;
            })
            .map((item) => ({ ...item, fetched_at: now.toISOString() }));

          // Upsert in batches
          for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            const { error } = await supabase
              .from("notams")
              .upsert(batch, { onConflict: "notam_id" });
            if (error) {
              console.error(`Upsert error for feed "${feed.name}":`, error);
            } else {
              totalUpserted += batch.length;
            }
          }

          feedResults.push({ name: feed.name, count: rows.length });
        } catch (feedErr) {
          console.error(`Error processing feed "${feed.name}":`, feedErr);
          feedResults.push({ name: feed.name, count: -1 });
        }
      }
      console.log("RSS feed results:", JSON.stringify(feedResults));
    } else {
      console.warn("No enabled RSS feeds configured in notam_rss_feeds table");
    }

    // ── Step 2: Clean up expired NOTAMs ──
    const { count: deleteCount } = await supabase
      .from("notams")
      .delete({ count: "exact" })
      .lt("effective_end", now.toISOString())
      .not("effective_end_interpretation", "in", '("PERM","EST")');

    const staleDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await supabase
      .from("notams")
      .delete()
      .is("effective_end", null)
      .lt("fetched_at", staleDate.toISOString());

    console.log(`NOTAMs: upserted=${totalUpserted}, skipped=${totalSkipped}, deleted=${deleteCount || 0}`);

    return new Response(JSON.stringify({
      source: "RSS",
      upserted: totalUpserted,
      skipped: totalSkipped,
      deleted: deleteCount || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-notams error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
