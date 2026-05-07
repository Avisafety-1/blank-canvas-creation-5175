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

// ── Date normalisation ──

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
    const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(mins), parseInt(secs)));
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

function snMatches(stored: string | null | undefined, parsed: string): boolean {
  if (!stored) return false;
  const s = stored.toLowerCase().trim();
  const p = parsed.toLowerCase().trim();
  if (!s || !p) return false;
  if (s === p) return true;
  if (s.length >= 12 && p.startsWith(s)) return true;
  if (p.length >= 12 && s.startsWith(p)) return true;
  return false;
}

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
  // Advanced analysis indices
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
    // ZIP fra DJI Cloud trigger ofte 500. TXT-extract gir 422 fordi binær DJI .txt ikke
    // detekteres som text/plain av Laravel finfo. Re-pakk i fersk ZIP som siste forsøk.
    if (ext === ".zip" && uploadRes.status === 500) {
      console.log(`[dji-process-single] ZIP upload 500 for ${logId}, prøver ZIP->TXT->reZIP`);
      const zip = await JSZip.loadAsync(fileBytes);
      const txtEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".txt"));
      if (txtEntry) {
        const txtBytes = await (txtEntry as any).async("uint8array");
        try {
          return await uploadAndParse(dronelogKey, txtBytes, ".txt", logId);
        } catch (txtErr) {
          console.log(`[dji-process-single] TXT upload feilet for ${logId}, prøver re-zip`);
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

// ── URL-basert prosessering (DJI Cloud) ──
// Forsøker først vår egen Fly.io-parser. Hvis den ikke er konfigurert eller
// ikke støtter formatet, faller vi tilbake til DroneLog POST /logs (URL-mode).
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
    if (res.status === 422) { console.warn(`[dji-process-single] fly parser unsupported`); return null; }
    if (!res.ok) { console.warn(`[dji-process-single] fly parser ${res.status}`); return null; }
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
    console.warn(`[dji-process-single] fly parser exception: ${(e as Error).message}`);
    return null;
  }
}

async function processLogByUrl(
  dronelogKey: string,
  fileUrl: string,
  logId: string,
): Promise<{ ok: true; parsed: ReturnType<typeof parseCsvMinimal> } | { ok: false; status: number; errText: string }> {
  const fieldList = FIELDS.split(",").map(f => f.trim());

  // Last ned filen selv (DroneLog krever vår dronelogKey).
  let bytes: Uint8Array;
  try {
    const dl = await fetch(fileUrl, { headers: { Authorization: `Bearer ${dronelogKey}` } });
    if (!dl.ok) {
      const errText = await dl.text().catch(() => "");
      return { ok: false, status: dl.status, errText: `download: ${errText.slice(0, 200)}` };
    }
    bytes = new Uint8Array(await dl.arrayBuffer());
  } catch (e) {
    return { ok: false, status: 0, errText: `download exception: ${(e as Error).message}` };
  }

  // Last opp filbytene rett til DroneLog /logs/upload (stabil flyt — Fly-parseren er deaktivert).
  console.log(`[dji-process-single] uploading ${bytes.length} bytes to DroneLog /logs/upload for ${logId}`);
  try {
    const parsed = await uploadAndParse(dronelogKey, bytes, ".txt", logId);
    return { ok: true, parsed };
  } catch (e) {
    const msg = (e as Error).message;
    // Forsøk å trekke ut HTTP-status fra "DroneLog upload failed (NNN): ..."
    const m = /\((\d{3})\)/.exec(msg);
    const status = m ? parseInt(m[1], 10) : 500;
    return { ok: false, status, errText: msg };
  }
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

// ── Main handler: process a single pending DJI log on demand ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Helper: persist a parse error on the pending log and return a 200 response
  // so the client doesn't get a generic "non-2xx" crash. The UI uses error_code
  // to decide whether to show retry/disabled state.
  let currentPendingLogId: string | null = null;
  const persistError = async (errorCode: string, errorMessage: string) => {
    if (!currentPendingLogId) return;
    try {
      // Read current retry_count, then update with incremented value
      const { data: current } = await serviceClient
        .from("pending_dji_logs")
        .select("retry_count")
        .eq("id", currentPendingLogId)
        .maybeSingle();
      const nextRetry = (current?.retry_count ?? 0) + 1;
      await serviceClient
        .from("pending_dji_logs")
        .update({
          error_code: errorCode,
          error_message: errorMessage.slice(0, 500),
          last_error_at: new Date().toISOString(),
          retry_count: nextRetry,
        })
        .eq("id", currentPendingLogId);
    } catch (e) {
      console.error("[dji-process-single] persistError failed:", e);
    }
  };
  const errorResponse = (errorCode: string, errorMessage: string, httpStatus = 200) => {
    return new Response(
      JSON.stringify({ success: false, error_code: errorCode, error: errorMessage }),
      { status: httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  };

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: { user }, error: authErr } = await serviceClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { pending_log_id } = await req.json();
    if (!pending_log_id) {
      return new Response(JSON.stringify({ error: "Missing pending_log_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    currentPendingLogId = pending_log_id;

    // Fetch the pending log
    const { data: pendingLog, error: plErr } = await serviceClient
      .from("pending_dji_logs")
      .select("*")
      .eq("id", pending_log_id)
      .maybeSingle();

    if (plErr || !pendingLog) {
      return new Response(JSON.stringify({ error: "Pending log not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If already parsed, return existing result
    if (pendingLog.parsed_result) {
      return new Response(JSON.stringify({ success: true, parsed_result: pendingLog.parsed_result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user's DJI credentials
    const { data: cred } = await serviceClient
      .from("dji_credentials")
      .select("dji_email, dji_password_encrypted, dji_account_id")
      .eq("user_id", pendingLog.user_id)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "No DJI credentials found for this user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get company's DroneLog API key
    const { data: company } = await serviceClient
      .from("companies")
      .select("dronelog_api_key")
      .eq("id", pendingLog.company_id)
      .maybeSingle();

    const dronelogKey = company?.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!dronelogKey) {
      return new Response(JSON.stringify({ error: "No DroneLog API key configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Login to DJI (with one retry on 429 rate-limit)
    const password = await decryptPassword(cred.dji_password_encrypted);
    const doLogin = () => fetch(`${DRONELOG_BASE}/accounts/dji`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: cred.dji_email, password }),
    });
    let loginRes = await doLogin();
    if (loginRes.status === 429) {
      console.log("[dji-process-single] DJI login rate-limited, waiting 35s and retrying once");
      await new Promise((r) => setTimeout(r, 35000));
      loginRes = await doLogin();
    }

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      if (loginRes.status === 429) {
        await persistError("rate_limit", `DJI login rate-limited (429): ${errText.slice(0, 200)}`);
        return errorResponse("rate_limit", "DJI begrenser forespørsler. Prøv igjen om 1-2 minutter.");
      }
      await persistError("login_failed", `DJI login failed (${loginRes.status}): ${errText.slice(0, 200)}`);
      return errorResponse("login_failed", `Innlogging mot DJI feilet (${loginRes.status}). Sjekk DJI-passordet i din profil.`);
    }

    const loginData = await loginRes.json();
    const accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || cred.dji_account_id;

    if (!accountId) {
      await persistError("no_account_id", "Could not determine DJI account ID");
      return errorResponse("no_account_id", "Fant ikke DJI-konto-ID.");
    }

    // Process the log via URL (DroneLog henter filen selv fra DJI Cloud)
    const logId = pendingLog.dji_log_id;
    const downloadUrl = `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;

    console.log(`[dji-process-single] Processing log ${logId} via POST /logs (URL-mode)`);

    const result = await processLogByUrl(dronelogKey, downloadUrl, logId);

    if (!result.ok) {
      const { status, errText } = result;
      console.error(`[dji-process-single] processLogByUrl failed (${status}): ${errText.slice(0, 300)}`);
      if (status === 429) {
        await persistError("rate_limit", `DroneLog rate-limited (429): ${errText.slice(0, 200)}`);
        return errorResponse("rate_limit", "DJI begrenser forespørsler. Prøv igjen om 1-2 minutter.");
      }
      if (status === 404) {
        await persistError("download_failed", `Log not found (404): ${errText.slice(0, 200)}`);
        return errorResponse("download_failed", "Loggfilen ble ikke funnet hos DJI.");
      }
      // Unsupported container format heuristic: no aircraft name from DJI Cloud
      // listing AND parsing failed → mark as unsupported and remove from pending.
      const noAircraft = !pendingLog.aircraft_name || !pendingLog.aircraft_name.trim();
      if (noAircraft) {
        try {
          await serviceClient
            .from("pending_dji_logs")
            .update({
              status: "unsupported",
              error_code: "unsupported_format",
              error_message: "Loggen kan ikke parses automatisk fra DJI Cloud. Last opp .txt manuelt fra dronen.",
              last_error_at: new Date().toISOString(),
            })
            .eq("id", pending_log_id);
        } catch (e) {
          console.error("[dji-process-single] mark-unsupported failed:", e);
        }
        return errorResponse(
          "unsupported_format",
          "Filen støttes ikke for automatisk prosessering. Du må laste opp .txt-filen manuelt fra dronen.",
        );
      }
      await persistError("parse_error", `DroneLog ${status}: ${errText.slice(0, 300)}`);
      return errorResponse("parse_error", `DroneLog API kunne ikke prosessere loggen (${status}). Prøv igjen senere.`);
    }

    const parsed = result.parsed;

    // Build search list: own + parent (so shared drones/batteries from a parent
    // company are auto-matched in child departments).
    const searchCompanyIds: string[] = [pendingLog.company_id];
    {
      const { data: own } = await serviceClient
        .from("companies")
        .select("parent_company_id")
        .eq("id", pendingLog.company_id)
        .maybeSingle();
      if (own?.parent_company_id) searchCompanyIds.push(own.parent_company_id);
    }

    // Match by exact OR prefix (handles old 16-char SNs vs new full 20-char SNs).
    const snMatches = (stored: string | null | undefined, parsedSn: string): boolean => {
      if (!stored) return false;
      const s = stored.toLowerCase().trim();
      const p = parsedSn.toLowerCase().trim();
      if (!s || !p) return false;
      if (s === p) return true;
      if (s.length >= 12 && p.startsWith(s)) return true;
      if (p.length >= 12 && s.startsWith(p)) return true;
      return false;
    };

    // Auto-match drone by serial (with prefix support)
    let matchedDroneId: string | null = null;
    let snMismatchSuggestion: any = null;
    if (parsed.aircraftSN) {
      const { data: drones } = await serviceClient
        .from("drones")
        .select("id, serienummer, internal_serial, company_id")
        .in("company_id", searchCompanyIds);

      if (drones) {
        const ownMatch = drones.find(d =>
          d.company_id === pendingLog.company_id &&
          (snMatches(d.serienummer, parsed.aircraftSN!) || snMatches(d.internal_serial, parsed.aircraftSN!))
        );
        const match = ownMatch || drones.find(d =>
          snMatches(d.serienummer, parsed.aircraftSN!) || snMatches(d.internal_serial, parsed.aircraftSN!)
        );
        if (match) {
          matchedDroneId = match.id;
          const storedSn = (match.serienummer || "").trim();
          const parsedSn = parsed.aircraftSN.trim();
          if (storedSn && parsedSn && storedSn !== parsedSn) {
            snMismatchSuggestion = {
              drone_id: match.id,
              current_sn: storedSn,
              suggested_sn: parsedSn,
              type: "drone",
            };
          }
        }
      }
    }

    // Auto-match battery (with prefix support)
    let matchedBatteryId: string | null = null;
    if (parsed.batterySN) {
      const { data: batteries } = await serviceClient
        .from("equipment")
        .select("id, serienummer, internal_serial, company_id")
        .in("company_id", searchCompanyIds)
        .ilike("type", "batteri");

      if (batteries) {
        const ownMatch = batteries.find(b =>
          b.company_id === pendingLog.company_id &&
          (snMatches(b.serienummer, parsed.batterySN!) || snMatches(b.internal_serial, parsed.batterySN!))
        );
        const match = ownMatch || batteries.find(b =>
          snMatches(b.serienummer, parsed.batterySN!) || snMatches(b.internal_serial, parsed.batterySN!)
        );
        if (match) matchedBatteryId = match.id;
      }
    }

    // Update the pending log with parsed result
    await serviceClient
      .from("pending_dji_logs")
      .update({
        parsed_result: parsed as any,
        aircraft_sn: parsed.aircraftSN || null,
        aircraft_name: parsed.aircraftName || pendingLog.aircraft_name,
        flight_date: parsed.startTime || pendingLog.flight_date,
        duration_seconds: Math.round(parsed.durationSeconds),
        matched_drone_id: matchedDroneId,
        matched_battery_id: matchedBatteryId,
        max_height_m: parsed.maxAltitude || null,
        total_distance_m: parsed.totalDistance || null,
        sn_mismatch_suggestion: snMismatchSuggestion,
      } as any)
      .eq("id", pending_log_id);

    // Check if SHA-256 already exists in flight_logs
    if (parsed.sha256Hash) {
      const { data: existingFlight } = await serviceClient
        .from("flight_logs")
        .select("id")
        .eq("company_id", pendingLog.company_id)
        .eq("dronelog_sha256", parsed.sha256Hash)
        .maybeSingle();

      if (existingFlight) {
        // Mark as already imported
        await serviceClient
          .from("pending_dji_logs")
          .update({ status: "approved", processed_flight_log_id: existingFlight.id })
          .eq("id", pending_log_id);

        return new Response(JSON.stringify({
          success: true,
          already_imported: true,
          existing_flight_log_id: existingFlight.id,
          parsed_result: parsed,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      parsed_result: parsed,
      matched_drone_id: matchedDroneId,
      matched_battery_id: matchedBatteryId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[dji-process-single] Error:", error);
    await persistError("internal_error", String(error));
    return new Response(
      JSON.stringify({ success: false, error_code: "internal_error", error: "Intern feil ved parsing av loggen.", details: String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
