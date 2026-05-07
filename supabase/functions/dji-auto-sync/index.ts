import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "OSD.goHomeStatus",
  "OSD.vSpeed [m/s]","OSD.pitch [°]","OSD.roll [°]","OSD.directionYaw [°]",
  "OSD.xSpeed [m/s]","OSD.ySpeed [m/s]","OSD.groundOrSky","OSD.gpsLevel",
  "OSD.isMotorUp","OSD.flycCommand","OSD.isGPSUsed","OSD.isVisionUsed",
  "BATTERY.chargeLevel [%]","BATTERY.temperature [°C]","BATTERY.totalVoltage [V]","BATTERY.current [A]","BATTERY.loopNum",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.life [%]","BATTERY.status",
  "BATTERY.cellVoltage1 [V]","BATTERY.cellVoltage2 [V]","BATTERY.cellVoltage3 [V]",
  "BATTERY.cellVoltage4 [V]","BATTERY.cellVoltage5 [V]","BATTERY.cellVoltage6 [V]",
  "BATTERY.cellVoltageDeviation [V]","BATTERY.isCellVoltageDeviationHigh","BATTERY.maxCellVoltageDeviation [V]",
  "BATTERY.goHomeStatus",
  "RC.aileron","RC.elevator","RC.rudder","RC.throttle",
  "GIMBAL.pitch [°]","GIMBAL.roll [°]","GIMBAL.yaw [°]",
  "CALC.distance2D [m]","CALC.distance3D [m]","CALC.currentElevation [m]",
  "HOME.latitude","HOME.longitude","HOME.maxAllowedHeight [m]","HOME.goHomeStatus",
  "WEATHER.temperature [°C]","WEATHER.windDirection [°]","WEATHER.windSpeed [m/s]",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.batterySerial","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  "APP.warn",
].join(",");

// ── Date normalisation helper ──

function normalizeDateToISO(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}/.test(s)) return iso.toISOString();

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[\sT]+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
  );
  if (m) {
    const [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    const d = new Date(Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      h, parseInt(mins), parseInt(secs)
    ));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();

  return null;
}

// ── CSV parser ──

// RFC 4180-aware CSV row parser: respects quoted fields and "" escapes.
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const stripQuotes = (v: string) => (v ?? "").replace(/^"+|"+$/g, "").trim();

function findHeaderIndex(headers: string[], target: string): number {
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;
  const targetLower = target.toLowerCase();
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === targetLower);
  if (ciIdx !== -1) return ciIdx;
  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  return headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
}

function parseCsvMinimal(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("Empty CSV");

  const headers = parseCsvRow(lines[0]);
  const firstRow = parseCsvRow(lines[1]);

  const get = (field: string) => {
    const idx = findHeaderIndex(headers, field);
    return idx >= 0 ? stripQuotes(firstRow[idx] ?? "") : "";
  };
  const getNum = (field: string) => {
    const v = parseFloat(get(field));
    return isNaN(v) ? null : v;
  };

  const aircraftSN = get("DETAILS.aircraftSN") || get("DETAILS.aircraftSerial");
  const batterySN = get("DETAILS.batterySN") || get("DETAILS.batterySerial");
  const sha256Hash = get("DETAILS.sha256Hash");
  const totalTimeSec = getNum("DETAILS.totalTime [s]");
  const durationMinutes = totalTimeSec ? Math.round(totalTimeSec / 60) : Math.round((lines.length - 1) / 600);

  let startTime = normalizeDateToISO(get("DETAILS.startTime"));
  if (!startTime) {
    const customDate = get("CUSTOM.date [UTC]");
    const customTime = get("CUSTOM.updateTime [UTC]");
    if (customDate) {
      const combined = customTime ? `${customDate} ${customTime}` : `${customDate} 00:00:00`;
      startTime = normalizeDateToISO(combined);
    }
  }
  if (!startTime) startTime = normalizeDateToISO(get("CUSTOM.dateTime"));

  const positions: Array<Record<string, any>> = [];
  const latIdx = findHeaderIndex(headers, "OSD.latitude");
  const lonIdx = findHeaderIndex(headers, "OSD.longitude");
  const altIdx = findHeaderIndex(headers, "OSD.altitude [m]");
  const heightIdx = findHeaderIndex(headers, "OSD.height [m]");
  const timeIdx = findHeaderIndex(headers, "OSD.flyTime [ms]");
  const speedIdx = findHeaderIndex(headers, "OSD.hSpeed [m/s]");
  const batteryIdx = findHeaderIndex(headers, "BATTERY.chargeLevel [%]");
  const dateTimeIdx = findHeaderIndex(headers, "CUSTOM.dateTime");
  const vSpeedIdx = findHeaderIndex(headers, "OSD.vSpeed [m/s]");
  const pitchIdx = findHeaderIndex(headers, "OSD.pitch [°]");
  const rollIdx = findHeaderIndex(headers, "OSD.roll [°]");
  const yawIdx = findHeaderIndex(headers, "OSD.directionYaw [°]");
  const groundOrSkyIdx = findHeaderIndex(headers, "OSD.groundOrSky");
  const gpsLevelIdx = findHeaderIndex(headers, "OSD.gpsLevel");
  const gpsNumIdx = findHeaderIndex(headers, "OSD.gpsNum");
  const flycStateIdx = findHeaderIndex(headers, "OSD.flycState");
  const battVoltIdx = findHeaderIndex(headers, "BATTERY.totalVoltage [V]");
  const battCurrentIdx = findHeaderIndex(headers, "BATTERY.current [A]");
  const battTempIdx = findHeaderIndex(headers, "BATTERY.temperature [°C]");
  const rcAileronIdx = findHeaderIndex(headers, "RC.aileron");
  const rcElevatorIdx = findHeaderIndex(headers, "RC.elevator");
  const rcRudderIdx = findHeaderIndex(headers, "RC.rudder");
  const rcThrottleIdx = findHeaderIndex(headers, "RC.throttle");
  const gimbalPitchIdx = findHeaderIndex(headers, "GIMBAL.pitch [°]");
  const gimbalRollIdx = findHeaderIndex(headers, "GIMBAL.roll [°]");
  const gimbalYawIdx = findHeaderIndex(headers, "GIMBAL.yaw [°]");
  const dist2DIdx = findHeaderIndex(headers, "CALC.distance2D [m]");
  const dist3DIdx = findHeaderIndex(headers, "CALC.distance3D [m]");
  const elevationIdx = findHeaderIndex(headers, "CALC.currentElevation [m]");
  const weatherWindSpeedIdx = findHeaderIndex(headers, "WEATHER.windSpeed [m/s]");
  const weatherWindDirIdx = findHeaderIndex(headers, "WEATHER.windDirection [°]");

  let maxSpeed = 0;
  let minBattery = batteryIdx >= 0 ? 100 : -1;
  let maxFlyTimeMs = 0;
  const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 500));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;
    const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0;
    const height = heightIdx >= 0 ? parseFloat(cols[heightIdx]) : 0;
    const flyTimeMs = timeIdx >= 0 ? parseFloat(cols[timeIdx]) : NaN;
    const speed = speedIdx >= 0 ? parseFloat(cols[speedIdx]) : NaN;
    const battery = batteryIdx >= 0 ? parseFloat(cols[batteryIdx]) : NaN;

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery) && battery < minBattery) minBattery = battery;
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const ts = dateTimeIdx >= 0 && cols[dateTimeIdx] ? cols[dateTimeIdx] :
        (!isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`);
      const point: Record<string, any> = { lat, lng: lon, alt: isNaN(alt) ? 0 : alt, height: isNaN(height) ? 0 : height, timestamp: ts };
      const pf = (idx: number) => { const v = idx >= 0 ? parseFloat(cols[idx]) : NaN; return isNaN(v) ? undefined : Math.round(v * 100) / 100; };
      const pi = (idx: number) => { const v = idx >= 0 ? parseInt(cols[idx]) : NaN; return isNaN(v) ? undefined : v; };
      const ps = (idx: number) => idx >= 0 && cols[idx] ? cols[idx] : undefined;
      if (pf(speedIdx) !== undefined) point.speed = pf(speedIdx);
      if (pf(vSpeedIdx) !== undefined) point.vSpeed = pf(vSpeedIdx);
      if (pf(batteryIdx) !== undefined) point.battery = pf(batteryIdx);
      if (pf(battVoltIdx) !== undefined) point.voltage = pf(battVoltIdx);
      if (pf(battCurrentIdx) !== undefined) point.current = pf(battCurrentIdx);
      if (pf(battTempIdx) !== undefined) point.temp = pf(battTempIdx);
      if (pi(gpsNumIdx) !== undefined) point.gpsNum = pi(gpsNumIdx);
      if (pi(gpsLevelIdx) !== undefined) point.gpsLevel = pi(gpsLevelIdx);
      if (pf(pitchIdx) !== undefined) point.pitch = pf(pitchIdx);
      if (pf(rollIdx) !== undefined) point.roll = pf(rollIdx);
      if (pf(yawIdx) !== undefined) point.yaw = pf(yawIdx);
      if (pi(rcAileronIdx) !== undefined) point.rcAileron = pi(rcAileronIdx);
      if (pi(rcElevatorIdx) !== undefined) point.rcElevator = pi(rcElevatorIdx);
      if (pi(rcRudderIdx) !== undefined) point.rcRudder = pi(rcRudderIdx);
      if (pi(rcThrottleIdx) !== undefined) point.rcThrottle = pi(rcThrottleIdx);
      if (pf(gimbalPitchIdx) !== undefined) point.gimbalPitch = pf(gimbalPitchIdx);
      if (pf(gimbalRollIdx) !== undefined) point.gimbalRoll = pf(gimbalRollIdx);
      if (pf(gimbalYawIdx) !== undefined) point.gimbalYaw = pf(gimbalYawIdx);
      if (pf(dist2DIdx) !== undefined) point.dist2D = pf(dist2DIdx);
      if (pf(dist3DIdx) !== undefined) point.dist3D = pf(dist3DIdx);
      if (pf(elevationIdx) !== undefined) point.elevation = pf(elevationIdx);
      if (ps(flycStateIdx)) point.flycState = ps(flycStateIdx);
      if (ps(groundOrSkyIdx)) point.groundOrSky = ps(groundOrSkyIdx);
      if (pf(weatherWindSpeedIdx) !== undefined) point.windSpeed = pf(weatherWindSpeedIdx);
      if (pf(weatherWindDirIdx) !== undefined) point.windDir = pf(weatherWindDirIdx);
      positions.push(point);
    }
  }

  const startPos = positions.length > 0 ? positions[0] : null;
  const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

  return {
    aircraftSN,
    batterySN,
    sha256Hash,
    durationMinutes,
    durationSeconds: totalTimeSec ?? durationMinutes * 60,
    startTime: startTime || null,
    aircraftName: get("DETAILS.aircraftName") || null,
    droneType: get("DETAILS.droneType") || null,
    totalDistance: getNum("DETAILS.totalDistance [m]"),
    maxAltitude: getNum("DETAILS.maxAltitude [m]"),
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    maxDistance: getNum("DETAILS.maxDistance [m]"),
    startPosition: startPos,
    endPosition: endPos,
    positions,
    totalRows: lines.length - 1,
  };
}

// ── Upload helper ──

async function uploadAndParse(dronelogKey: string, fileBytes: Uint8Array, ext: string, logId: string): Promise<ReturnType<typeof parseCsvMinimal>> {
  const fieldList = FIELDS.split(",").map(f => f.trim());
  const fileName = `dji_${logId}${ext}`;
  const boundary = "----DronLogBoundary" + Date.now();
  const parts: string[] = [];
  for (const field of fieldList) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
  }
  // DroneLog (Laravel mimes:txt,zip) validerer både filendelse og MIME — octet-stream gir 422.
  const fileMime = ext === ".zip" ? "application/zip" : ext === ".txt" ? "text/plain" : "application/octet-stream";
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileMime}\r\n\r\n`);
  const enc = new TextEncoder();
  const prefixBytes = enc.encode(parts.join(""));
  const suffixBytes = enc.encode(`\r\n--${boundary}--\r\n`);
  const uploadBody = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
  uploadBody.set(prefixBytes, 0);
  uploadBody.set(fileBytes, prefixBytes.length);
  uploadBody.set(suffixBytes, prefixBytes.length + fileBytes.length);

  const uploadRes = await fetch(`${DRONELOG_BASE}/logs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, Accept: "application/json" },
    body: uploadBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    // ZIP fra DJI Cloud trigger ofte 500 fra DroneLog. TXT-extract gir 422 fordi binær
    // DJI .txt detekteres ikke som text/plain av Laravel finfo. Re-pakk i fersk ZIP.
    if (ext === ".zip" && uploadRes.status === 500) {
      console.log(`[dji-auto-sync] ZIP upload 500 for ${logId}, prøver ZIP->TXT->reZIP`);
      const zip = await JSZip.loadAsync(fileBytes);
      const txtEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".txt"));
      if (txtEntry) {
        const txtBytes = await (txtEntry as any).async("uint8array");
        try {
          return await uploadAndParse(dronelogKey, txtBytes, ".txt", logId);
        } catch (txtErr) {
          console.log(`[dji-auto-sync] TXT upload feilet for ${logId}, prøver re-zip`);
          const freshZip = new JSZip();
          freshZip.file((txtEntry as any).name.split("/").pop() || `dji_${logId}.txt`, txtBytes);
          const zipBytes = await freshZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
          return uploadAndParse(dronelogKey, zipBytes, ".zip", logId);
        }
      }
    }
    throw new Error(`DroneLog upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
  }

  const csvText = await uploadRes.text();
  return parseCsvMinimal(csvText);
}

// ── Decrypt DJI password ──

async function decryptPassword(encryptedB64: string): Promise<string> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const raw = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Process a single log via URL (DJI Cloud) ──
// Forsøker først vår egen Fly.io-parser, faller tilbake til DroneLog POST /logs.
const DJI_PARSER_URL = Deno.env.get("DJI_PARSER_URL");
const DJI_PARSER_TOKEN = Deno.env.get("DJI_PARSER_TOKEN");

async function tryFlyParserCsv(
  fileBytes: Uint8Array,
  fields: string[],
  logId: string,
): Promise<string | null> {
  if (!DJI_PARSER_URL || !DJI_PARSER_TOKEN) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([fileBytes], { type: "application/octet-stream" }), `${logId}.txt`);
    form.append("fields", fields.join(","));
    const res = await fetch(`${DJI_PARSER_URL}/parse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${DJI_PARSER_TOKEN}` },
      body: form,
    });
    if (res.status === 422) { console.warn(`[dji-auto-sync] fly parser unsupported`); return null; }
    if (!res.ok) { console.warn(`[dji-auto-sync] fly parser ${res.status}`); return null; }
    const json = await res.json();
    const samples: Array<Record<string, unknown>> = json.samples ?? [];
    const details: Record<string, unknown> = json.details ?? {};
    const cols = [...fields];
    if (!cols.includes("OSD.flyTime [ms]")) cols.unshift("OSD.flyTime [ms]");
    const esc = (v: unknown) => {
      if (v === undefined || v === null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(esc).join(",")];
    for (const s of samples) lines.push(cols.map(c => esc(s[c] ?? (c.startsWith("DETAILS.") ? details[c] : ""))).join(","));
    return lines.join("\n");
  } catch (e) {
    console.warn(`[dji-auto-sync] fly parser exception: ${(e as Error).message}`);
    return null;
  }
}

async function downloadAndParseLog(
  dronelogKey: string,
  accountId: string,
  logId: string,
  preferredUrl?: string,
): Promise<ReturnType<typeof parseCsvMinimal>> {
  const fieldList = FIELDS.split(",").map(f => f.trim());
  const fileUrl = preferredUrl || `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;

  // Last ned filbytes selv (DroneLog krever vår dronelogKey).
  const dl = await fetch(fileUrl, { headers: { Authorization: `Bearer ${dronelogKey}` } });
  if (!dl.ok) {
    const errText = await dl.text().catch(() => "");
    throw new Error(`DJI Cloud download failed (${dl.status}): ${errText.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await dl.arrayBuffer());

  // Last opp filbytene rett til DroneLog /logs/upload (stabil flyt — Fly-parseren er deaktivert).
  console.log(`[dji-auto-sync] uploading ${bytes.length} bytes to DroneLog /logs/upload for ${logId}`);
  return await uploadAndParse(dronelogKey, bytes, ".txt", logId);
}

// ── Auto-match drone/battery by serial ──

// Build list of company_ids that should be searched: own + parent (so shared
// drones/batteries from a parent company are auto-matched in child departments).
async function getSearchCompanyIds(serviceClient: any, companyId: string): Promise<string[]> {
  const ids = new Set<string>([companyId]);
  const { data: own } = await serviceClient
    .from("companies")
    .select("parent_company_id")
    .eq("id", companyId)
    .maybeSingle();
  if (own?.parent_company_id) ids.add(own.parent_company_id);
  return Array.from(ids);
}

// Match by exact OR prefix (handles old 16-char SNs vs new full 20-char SNs).
function snMatches(stored: string | null | undefined, parsed: string): boolean {
  if (!stored) return false;
  const s = stored.toLowerCase().trim();
  const p = parsed.toLowerCase().trim();
  if (!s || !p) return false;
  if (s === p) return true;
  // Old truncated SN in DB matches new full SN from log
  if (s.length >= 12 && p.startsWith(s)) return true;
  // Reverse: full SN in DB, truncated SN in log
  if (p.length >= 12 && s.startsWith(p)) return true;
  return false;
}

async function matchDroneAndBattery(
  serviceClient: any,
  companyId: string,
  parsed: ReturnType<typeof parseCsvMinimal>,
) {
  let matchedDroneId: string | null = null;
  let matchedBatteryId: string | null = null;
  let snMismatchSuggestion: any = null;

  const searchIds = await getSearchCompanyIds(serviceClient, companyId);

  if (parsed.aircraftSN) {
    const { data: drones } = await serviceClient
      .from("drones")
      .select("id, serienummer, internal_serial, company_id")
      .in("company_id", searchIds);

    if (drones) {
      const ownMatch = drones.find((d: any) =>
        d.company_id === companyId &&
        (snMatches(d.serienummer, parsed.aircraftSN) || snMatches(d.internal_serial, parsed.aircraftSN))
      );
      const anyMatch = ownMatch || drones.find((d: any) =>
        snMatches(d.serienummer, parsed.aircraftSN) || snMatches(d.internal_serial, parsed.aircraftSN)
      );
      if (anyMatch) {
        matchedDroneId = anyMatch.id;
        // Suggest update if stored SN differs from parsed SN (typically truncated)
        const storedSn = (anyMatch.serienummer || "").trim();
        const parsedSn = parsed.aircraftSN.trim();
        if (storedSn && parsedSn && storedSn !== parsedSn) {
          snMismatchSuggestion = {
            drone_id: anyMatch.id,
            current_sn: storedSn,
            suggested_sn: parsedSn,
            type: "drone",
          };
        }
      }
    }
  }

  if (parsed.batterySN) {
    const { data: batteries } = await serviceClient
      .from("equipment")
      .select("id, serienummer, internal_serial, company_id")
      .in("company_id", searchIds)
      .ilike("type", "batteri");

    if (batteries) {
      const ownMatch = batteries.find((b: any) =>
        b.company_id === companyId &&
        (snMatches(b.serienummer, parsed.batterySN) || snMatches(b.internal_serial, parsed.batterySN))
      );
      const anyMatch = ownMatch || batteries.find((b: any) =>
        snMatches(b.serienummer, parsed.batterySN) || snMatches(b.internal_serial, parsed.batterySN)
      );
      if (anyMatch) matchedBatteryId = anyMatch.id;
    }
  }

  return { matchedDroneId, matchedBatteryId, snMismatchSuggestion };
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Check if this is a manual single-user sync
    let manualUserId: string | null = null;
    let manualCompanyId: string | null = null;
    try {
      const body = await req.json();
      manualUserId = body?.userId || null;
      manualCompanyId = body?.companyId || null;
    } catch {
      // No body (cron call) — that's fine
    }

    // ── Manual sync: single user ──
    if (manualUserId) {
      // Look up user's company
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("company_id")
        .eq("id", manualUserId)
        .single();

      if (!profile?.company_id) {
        return new Response(JSON.stringify({ error: "User profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const companyId = manualCompanyId || profile.company_id;

      const { data: company } = await serviceClient
        .from("companies")
        .select("id, navn, dronelog_api_key, dji_sync_from_date")
        .eq("id", companyId)
        .eq("dji_flightlog_enabled", true)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Company not found or DJI not enabled" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const dronelogKey = company.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        return new Response(JSON.stringify({ error: "No DroneLog API key" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: credentials } = await serviceClient
        .from("dji_credentials")
        .select("user_id, dji_email, dji_password_encrypted, dji_account_id, last_sync_at")
        .eq("user_id", manualUserId);

      if (!credentials || credentials.length === 0) {
        return new Response(JSON.stringify({ error: "No DJI credentials for this user" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[dji-auto-sync] Manual sync for user ${manualUserId} in ${company.navn}`);

      let synced = 0;
      let errors = 0;
      let rateLimited = false;

      for (const cred of credentials) {
        if (rateLimited) break;
        const result = await syncSingleUser(serviceClient, dronelogKey, company, cred);
        synced += result.synced;
        errors += result.errors;
        rateLimited = result.rateLimited;
      }

      const elapsed = Date.now() - startMs;
      return new Response(JSON.stringify({
        success: true,
        synced,
        errors,
        rate_limited: rateLimited,
        elapsed_ms: elapsed,
        companies: [{ company: company.navn, synced, errors, details: rateLimited ? 'Rate limited' : undefined }],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Per-company mode (no userId): process all auto-sync users in one company ──
    if (manualCompanyId) {
      const { data: company } = await serviceClient
        .from("companies")
        .select("id, navn, dronelog_api_key, dji_sync_from_date")
        .eq("id", manualCompanyId)
        .eq("dji_flightlog_enabled", true)
        .single();

      if (!company) {
        return new Response(JSON.stringify({ error: "Company not found or DJI not enabled" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const dronelogKey = company.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        return new Response(JSON.stringify({ error: "No DroneLog API key" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: profiles } = await serviceClient
        .from("profiles").select("id").eq("company_id", company.id);
      const profileIds = (profiles || []).map((p: any) => p.id);

      const { data: credentials } = await serviceClient
        .from("dji_credentials")
        .select("user_id, dji_email, dji_password_encrypted, dji_account_id, last_sync_at")
        .in("user_id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("auto_sync_enabled", true);

      console.log(`[dji-auto-sync] Per-company sync ${company.navn}: ${credentials?.length || 0} users`);

      const work = async () => {
        let synced = 0, errors = 0, rateLimited = false;
        for (const cred of credentials || []) {
          if (rateLimited) break;
          const r = await syncSingleUser(serviceClient, dronelogKey, company, cred);
          synced += r.synced; errors += r.errors;
          if (r.rateLimited) rateLimited = true;
        }
        console.log(`[dji-auto-sync] ${company.navn} done: ${synced} synced, ${errors} errors`);
      };

      // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(work());
        return new Response(JSON.stringify({
          success: true, mode: "background", company: company.navn, users: credentials?.length || 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await work();
      return new Response(JSON.stringify({
        success: true, company: company.navn, elapsed_ms: Date.now() - startMs,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Auto-sync (cron): fan out per company in background ──
    const { data: companies, error: compErr } = await serviceClient
      .from("companies")
      .select("id, navn")
      .eq("dji_auto_sync_enabled", true)
      .eq("aktiv", true)
      .eq("dji_flightlog_enabled", true);

    if (compErr) throw compErr;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies with auto-sync enabled", synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[dji-auto-sync] Fanning out to ${companies.length} companies`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fnUrl = `${supabaseUrl}/functions/v1/dji-auto-sync`;

    // Fire-and-forget per-company invocations. Each gets its own wall-clock budget.
    // Stagger by 250ms to avoid hammering the DJI login endpoint simultaneously.
    const fanOut = async () => {
      for (let i = 0; i < companies.length; i++) {
        const c = companies[i];
        try {
          // Don't await response — let each run independently
          fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
              "apikey": serviceKey,
            },
            body: JSON.stringify({ companyId: c.id }),
          }).catch((e) => console.error(`[dji-auto-sync] fan-out fetch error for ${c.navn}:`, e));
        } catch (e) {
          console.error(`[dji-auto-sync] fan-out error for ${c.navn}:`, e);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    };

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(fanOut());
    } else {
      fanOut();
    }

    return new Response(JSON.stringify({
      success: true,
      mode: "fan_out",
      dispatched: companies.length,
      elapsed_ms: Date.now() - startMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[dji-auto-sync] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ── Sync a single user's DJI logs ──

async function syncSingleUser(
  serviceClient: any,
  dronelogKey: string,
  company: { id: string; navn: string; dji_sync_from_date: string | null },
  cred: { user_id: string; dji_email: string; dji_password_encrypted: string; dji_account_id: string | null; last_sync_at: string | null },
): Promise<{ synced: number; errors: number; rateLimited: boolean; loginFailed: boolean }> {
  let synced = 0;
  let errors = 0;
  let rateLimited = false;
  let loginFailed = false;

  try {
    const password = await decryptPassword(cred.dji_password_encrypted);

    const loginRes = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: cred.dji_email, password }),
    });

    if (!loginRes.ok) {
      const errBody = await loginRes.text();
      console.error(`[dji-auto-sync] Login failed for ${cred.dji_email}: ${loginRes.status} ${errBody.slice(0, 200)}`);
      loginFailed = true;
      if (loginRes.status === 429) { rateLimited = true; }
      errors++;
      return { synced, errors, rateLimited, loginFailed };
    }

    const loginData = await loginRes.json();
    const accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || cred.dji_account_id;

    if (!accountId) {
      console.error(`[dji-auto-sync] No accountId for ${cred.dji_email}`);
      errors++;
      return { synced, errors, rateLimited, loginFailed };
    }

    // List logs
    const listRes = await fetch(`${DRONELOG_BASE}/logs/${accountId}?limit=200`, {
      headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
    });

    if (!listRes.ok) {
      console.error(`[dji-auto-sync] List logs failed: ${listRes.status}`);
      await listRes.text();
      if (listRes.status === 429) { rateLimited = true; }
      errors++;
      return { synced, errors, rateLimited, loginFailed };
    }

    const listData = await listRes.json();
    const logs = listData.result?.logs || listData.result || [];

    if (!Array.isArray(logs) || logs.length === 0) {
      console.log(`[dji-auto-sync] No logs found for ${cred.dji_email}`);
      return { synced, errors, rateLimited, loginFailed };
    }

    console.log(`[dji-auto-sync] Found ${logs.length} logs for ${cred.dji_email}`);

    const syncFromDate = company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : null;

    for (const log of logs) {
      if (rateLimited) break;

      const logId = log.id || log.logId;
      if (!logId) continue;

      const logDateStr = normalizeDateToISO(log.date);

      if (syncFromDate && log.date) {
        const logDate = new Date(log.date);
        if (logDate < syncFromDate) continue;
      }

      const { data: existing } = await serviceClient
        .from("pending_dji_logs")
        .select("id")
        .eq("company_id", company.id)
        .eq("dji_log_id", String(logId))
        .maybeSingle();

      if (existing) continue;

      try {
        console.log(`[dji-auto-sync] Processing log ${logId} via POST /logs (URL-mode)`);
        const parsed = await downloadAndParseLog(dronelogKey, accountId, String(logId), log.downloadUrl);
        const { matchedDroneId, matchedBatteryId, snMismatchSuggestion } = await matchDroneAndBattery(serviceClient, company.id, parsed);

        let alreadyImported = false;
        let existingFlightLogId: string | null = null;
        if (parsed.sha256Hash) {
          const { data: existingFlight } = await serviceClient
            .from("flight_logs")
            .select("id")
            .eq("company_id", company.id)
            .eq("dronelog_sha256", parsed.sha256Hash)
            .maybeSingle();

          if (existingFlight) {
            alreadyImported = true;
            existingFlightLogId = existingFlight.id;
          }
        }

        const { error: insertErr } = await serviceClient
          .from("pending_dji_logs")
          .insert({
            company_id: company.id,
            user_id: cred.user_id,
            dji_log_id: String(logId),
            aircraft_name: parsed.aircraftName || log.aircraft || null,
            aircraft_sn: parsed.aircraftSN || null,
            flight_date: parsed.startTime || logDateStr,
            duration_seconds: Math.round(parsed.durationSeconds),
            max_height_m: parsed.maxAltitude || null,
            total_distance_m: parsed.totalDistance || null,
            parsed_result: parsed as any,
            matched_drone_id: matchedDroneId,
            matched_battery_id: matchedBatteryId,
            sn_mismatch_suggestion: snMismatchSuggestion,
            status: alreadyImported ? "approved" : "pending",
            processed_flight_log_id: existingFlightLogId,
          });

        if (insertErr) {
          if (insertErr.code === "23505") continue;
          console.error(`[dji-auto-sync] Insert error for log ${logId}:`, insertErr);
          errors++;
          continue;
        }

        synced++;
        console.log(`[dji-auto-sync] Fully processed log ${logId}${alreadyImported ? " (already imported)" : ""}`);
      } catch (parseErr: any) {
        if (parseErr.message?.includes("429") || parseErr.message?.includes("rate")) {
          rateLimited = true;
          console.warn(`[dji-auto-sync] Rate limited during download of ${logId}`);
          break;
        }
        console.error(`[dji-auto-sync] Parse failed for log ${logId}:`, parseErr.message);

        // If DJI Cloud returned no aircraft name AND parsing failed, this is
        // almost certainly an unsupported container format (M4D/M30/M350 etc).
        // Mark as 'unsupported' so it never appears in the "pending" list and
        // won't be re-fetched on subsequent syncs.
        const aircraftFromList = (log.aircraft || "").trim();
        const isUnsupported = !aircraftFromList;
        const targetStatus = isUnsupported ? "unsupported" : "pending";

        const { error: insertErr } = await serviceClient
          .from("pending_dji_logs")
          .insert({
            company_id: company.id,
            user_id: cred.user_id,
            dji_log_id: String(logId),
            aircraft_name: aircraftFromList || null,
            aircraft_sn: null,
            flight_date: logDateStr,
            duration_seconds: log.duration ? Math.round(log.duration) : null,
            parsed_result: null,
            matched_drone_id: null,
            matched_battery_id: null,
            status: targetStatus,
            error_code: isUnsupported ? "unsupported_format" : null,
            error_message: isUnsupported
              ? "Loggen kan ikke parses automatisk fra DJI Cloud. Last opp .txt manuelt fra dronen."
              : null,
            last_error_at: isUnsupported ? new Date().toISOString() : null,
          });

        if (insertErr && insertErr.code !== "23505") {
          console.error(`[dji-auto-sync] Fallback insert error:`, insertErr);
          errors++;
        } else {
          synced++;
        }
      }
    }

    // Update last_sync_at
    await serviceClient
      .from("dji_credentials")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", cred.user_id);

  } catch (credErr) {
    console.error(`[dji-auto-sync] Error for user ${cred.dji_email}:`, credErr);
    errors++;
  }

  return { synced, errors, rateLimited, loginFailed };
}
