import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse multipart form data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = file.name.toLowerCase();
    let binData: Uint8Array;

    if (fileName.endsWith(".zip")) {
      const { default: JSZip } = await import("npm:jszip@3.10.1");
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const binEntry = Object.keys(zip.files).find(
        (name) => name.toLowerCase().endsWith(".bin") && !name.startsWith("__MACOSX")
      );
      if (!binEntry) {
        return new Response(
          JSON.stringify({ error: "Ingen .bin-fil funnet i ZIP-arkivet" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      binData = await zip.files[binEntry].async("uint8array");
    } else if (fileName.endsWith(".bin")) {
      binData = new Uint8Array(await file.arrayBuffer());
    } else {
      return new Response(
        JSON.stringify({ error: "Ugyldig filtype. Bruk .bin eller .zip med .bin-fil." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to Fly.io parser
    const parserUrl = Deno.env.get("ARDUPILOT_PARSER_URL");
    const parserSecret = Deno.env.get("ARDUPILOT_PARSER_SECRET");

    if (!parserUrl) {
      return new Response(
        JSON.stringify({ error: "ArduPilot parser ikke konfigurert. Kontakt administrator." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parserFormData = new FormData();
    parserFormData.append("file", new Blob([binData as BlobPart]), "flight.bin");

    const parserHeaders: Record<string, string> = {};
    if (parserSecret) {
      parserHeaders["X-Parser-Secret"] = parserSecret;
    }

    const parserResponse = await fetch(`${parserUrl}/parse`, {
      method: "POST",
      headers: parserHeaders,
      body: parserFormData,
    });

    if (!parserResponse.ok) {
      const errText = await parserResponse.text().catch(() => "Unknown parser error");
      console.error("ArduPilot parser error:", parserResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Parser-feil: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawData = await parserResponse.json();
    console.log("ArduPilot raw data keys:", Object.keys(rawData));

    const result = sanitizeResult(normalizeToUnified(rawData));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-ardupilot error:", error);
    const msg = error instanceof Error ? error.message : "Ukjent feil";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/* ────────────────────────────────────────────────────────── */
/*  Normalize raw ArduPilot parser output → DroneLogResult   */
/* ────────────────────────────────────────────────────────── */

function normalizeToUnified(raw: any) {
  const gps: Array<{ time_ms: number; lat: number; lng: number; alt: number; spd: number; nSat?: number; gps_week?: number; gps_ms?: number }> =
    raw.gps || [];
  const battery: Array<{ time_ms: number; volt: number; curr?: number; remaining?: number | null; curr_tot?: number; temp?: number | null; instance?: number }> =
    raw.battery || [];
  const attitude: Array<{ time_ms: number; pitch: number; roll: number; yaw: number }> =
    raw.attitude || [];
  const modes: Array<{ time_ms: number; mode: string; mode_num?: number }> = raw.modes || [];
  const messages: Array<{ time_ms: number; text: string }> = raw.messages || [];
  const ctun: Array<{ time_ms: number; crt?: number }> = raw.ctun || [];
  const vibeData: Array<{ time_ms: number; vibe_x: number; vibe_y: number; vibe_z: number; clip0: number; clip1: number; clip2: number }> = raw.vibe || [];
  const errData: Array<{ time_ms: number; subsys: number; subsys_name: string; ecode: number }> = raw.errors || [];
  const evData: Array<{ time_ms: number; id: number; name: string }> = raw.events || [];
  const rcin: Array<{ time_ms: number; c1: number; c2: number; c3: number; c4: number }> = raw.rcin || [];
  const vehicleType: string = raw.vehicle_type || "ArduPilot";
  const firmwareVersion: string | null = raw.firmware_version || null;
  const startUtc: string | null = raw.start_utc || null;
  const endUtc: string | null = raw.end_utc || null;

  // ── Battery — split by instance for dual-battery (needed before positions loop) ──
  const batt0 = battery.filter((b) => (b.instance || 0) === 0);
  const batt1 = battery.filter((b) => (b.instance || 0) === 1);
  const isDualBattery = batt1.length > 0;
  const primaryBatt = batt0.length > 0 ? batt0 : battery;

  // ── Positions (sample ~2500 max) ──
  const sampleRate = Math.max(1, Math.floor(gps.length / 2500));
  const positions: Array<Record<string, any>> = [];

  for (let i = 0; i < gps.length; i++) {
    if (i % sampleRate !== 0 && i !== gps.length - 1) continue;
    const p = gps[i];
    if (!p.lat || !p.lng || (p.lat === 0 && p.lng === 0)) continue;

    const att = interpolateAttitude(attitude, p.time_ms);
    const battReading = interpolateBattery(primaryBatt, p.time_ms);
    const rc = interpolateRcin(rcin, p.time_ms);

    const pos: Record<string, any> = {
      lat: p.lat,
      lng: p.lng,
      alt: p.alt || 0,
      height: p.alt || 0,
      timestamp: `PT${Math.round(p.time_ms / 1000)}S`,
      speed: p.spd || 0,
      pitch: att?.pitch || 0,
      roll: att?.roll || 0,
      yaw: att?.yaw || 0,
      gpsNum: p.nSat || 0,
    };

    if (battReading) {
      if (battReading.volt != null) pos.voltage = battReading.volt;
      if (battReading.curr != null) pos.current = battReading.curr;
      if (battReading.temp != null) pos.temp = battReading.temp;
      if (battReading.remaining != null && battReading.remaining >= 0 && battReading.remaining <= 100) {
        pos.battery = battReading.remaining;
      }
    }

    if (rc) {
      pos.rcAileron = rc.c1;   // Roll
      pos.rcElevator = rc.c2;  // Pitch
      pos.rcThrottle = rc.c3;  // Throttle
      pos.rcRudder = rc.c4;    // Yaw
    }

    positions.push(pos);
  }

  // ── Duration ──
  const firstTime = gps.length > 0 ? gps[0].time_ms : 0;
  const lastTime = gps.length > 0 ? gps[gps.length - 1].time_ms : 0;
  const durationMs = lastTime - firstTime;
  const durationMinutes = Number.isFinite(durationMs) ? Math.round(durationMs / 60000) : 0;
  const totalTimeSeconds = Number.isFinite(durationMs) ? Math.round(durationMs / 1000) : 0;

  // ── Max speed / altitude / distance ──
  let maxSpeed = 0;
  let maxAltitude = 0;
  let totalDist = 0;
  let maxDist = 0;

  for (let i = 0; i < gps.length; i++) {
    if (gps[i].spd > maxSpeed) maxSpeed = gps[i].spd;
    if (gps[i].alt > maxAltitude) maxAltitude = gps[i].alt;
    if (i > 0 && gps[0].lat && gps[0].lng) {
      const d = haversine(gps[i].lat, gps[i].lng, gps[i - 1].lat, gps[i - 1].lng);
      totalDist += d;
      const fromHome = haversine(gps[i].lat, gps[i].lng, gps[0].lat, gps[0].lng);
      if (fromHome > maxDist) maxDist = fromHome;
    }
  }

  // ── Max vertical speed from CTUN ──
  let maxVSpeed = 0;
  for (const c of ctun) {
    const vs = Math.abs(c.crt || 0); // CRt = climb rate m/s
    if (vs > maxVSpeed) maxVSpeed = vs;
  }

  // Battery stats (using already-computed primaryBatt/batt0/batt1/isDualBattery)

  const validBatteryReadings = primaryBatt
    .map((b) => b.remaining)
    .filter((r): r is number => r != null && r >= 0 && r <= 100);

  const minBattery = validBatteryReadings.length > 0 ? Math.min(...validBatteryReadings) : 0;

  let minVoltage = 999;
  let maxCurrent = 0;
  let maxBatteryTemp: number | null = null;
  for (const b of primaryBatt) {
    if (b.volt < minVoltage) minVoltage = b.volt;
    if (b.curr && b.curr > maxCurrent) maxCurrent = b.curr;
    if (b.temp != null) {
      if (maxBatteryTemp === null || b.temp > maxBatteryTemp) maxBatteryTemp = b.temp;
    }
  }

  // Secondary battery stats (instance 1)
  let batt1MinVoltage: number | null = null;
  let batt1TempMax: number | null = null;
  if (isDualBattery) {
    let v1Min = 999;
    for (const b of batt1) {
      if (b.volt < v1Min) v1Min = b.volt;
      if (b.temp != null) {
        if (batt1TempMax === null || b.temp > batt1TempMax) batt1TempMax = b.temp;
      }
    }
    batt1MinVoltage = v1Min < 999 ? Math.round(v1Min * 100) / 100 : null;
  }

  // ── GPS satellites ──
  let minGpsSats = 99;
  let maxGpsSats = 0;
  for (const p of gps) {
    if (p.nSat !== undefined) {
      if (p.nSat < minGpsSats) minGpsSats = p.nSat;
      if (p.nSat > maxGpsSats) maxGpsSats = p.nSat;
    }
  }

  // ── Events (deduplicated) ──
  const events: Array<{
    type: string;
    message: string;
    t_offset_ms: number | null;
    raw_field: string;
    raw_value: string;
  }> = [];

  // Mode changes — deduplicate consecutive same modes
  let lastMode = "";
  for (const m of modes) {
    if (m.mode === lastMode) continue;
    lastMode = m.mode;
    events.push({
      type: "mode_change",
      message: `Modus: ${m.mode}`,
      t_offset_ms: m.time_ms - firstTime,
      raw_field: "MODE",
      raw_value: m.mode,
    });
  }

  // ERR → error events
  for (const e of errData) {
    events.push({
      type: "error",
      message: `Feil: ${e.subsys_name} (kode ${e.ecode})`,
      t_offset_ms: e.time_ms - firstTime,
      raw_field: "ERR",
      raw_value: `${e.subsys_name}:${e.ecode}`,
    });
  }

  // EV → arm/disarm/failsafe events (only important ones)
  const importantEvIds = new Set([10, 11, 15, 17, 18, 44]); // ARMED, DISARMED, AUTO_ARMED, LAND_COMPLETE_MAYBE, LAND_COMPLETE, LOST_GPS
  for (const e of evData) {
    if (!importantEvIds.has(e.id)) continue;
    events.push({
      type: e.id === 10 || e.id === 15 ? "arm" : e.id === 11 ? "disarm" : "event",
      message: e.name,
      t_offset_ms: e.time_ms - firstTime,
      raw_field: "EV",
      raw_value: e.name,
    });
  }

  // Messages — deduplicate identical text
  const seenMessages = new Set<string>();
  for (const msg of messages) {
    if (seenMessages.has(msg.text)) continue;
    seenMessages.add(msg.text);
    events.push({
      type: "message",
      message: msg.text,
      t_offset_ms: msg.time_ms - firstTime,
      raw_field: "MSG",
      raw_value: msg.text,
    });
  }

  // ── RTH detection ──
  const rthTriggered = modes.some((m) =>
    ["rtl", "smartrtl", "smart_rtl", "land", "brake", "auto_rtl"].includes(m.mode.toLowerCase())
  );

  // ── Warnings ──
  const warnings: Array<{ type: string; message: string; value?: number }> = [];
  if (minBattery > 0 && minBattery < 20) {
    warnings.push({ type: "low_battery", message: `Lavt batterinivå: ${minBattery}%`, value: minBattery });
  }
  if (rthTriggered) {
    warnings.push({ type: "rth", message: "RTL/Land modus aktivert under flyging" });
  }

  // Vibration warnings
  if (vibeData.length > 0) {
    const maxVibe = Math.max(...vibeData.map((v) => Math.max(v.vibe_x, v.vibe_y, v.vibe_z)));
    const totalClips = vibeData.reduce((sum, v) => sum + v.clip0 + v.clip1 + v.clip2, 0);
    if (maxVibe > 60) {
      warnings.push({ type: "high_vibration", message: `Høy vibrasjon registrert: ${Math.round(maxVibe)} m/s²`, value: Math.round(maxVibe) });
    }
    if (totalClips > 0) {
      warnings.push({ type: "imu_clipping", message: `IMU clipping registrert (${totalClips} hendelser)`, value: totalClips });
    }
  }

  // Failsafe warnings from ERR
  const failsafeErrors = errData.filter((e) => e.subsys_name.startsWith("FAILSAFE_"));
  if (failsafeErrors.length > 0) {
    for (const f of failsafeErrors) {
      warnings.push({ type: "failsafe", message: `Failsafe utløst: ${f.subsys_name}` });
    }
  }

  // ── Positions ──
  const startPosition = positions.length > 0
    ? { lat: positions[0].lat, lng: positions[0].lng }
    : null;
  const endPosition = positions.length > 0
    ? { lat: positions[positions.length - 1].lat, lng: positions[positions.length - 1].lng }
    : null;

  // ── Aircraft name ──
  const aircraftName = firmwareVersion || vehicleType;

  return {
    positions,
    durationMinutes,
    durationMs,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    batteryReadings: validBatteryReadings,
    startPosition,
    endPosition,
    totalRows: gps.length,
    sampledPositions: positions.length,
    warnings,
    startTime: startUtc,
    endTimeUtc: endUtc,
    aircraftName,
    aircraftSN: null,
    aircraftSerial: null,
    droneType: null,
    totalDistance: totalDist > 0 ? Math.round(totalDist) : null,
    maxAltitude: maxAltitude > 0 ? Math.round(maxAltitude * 10) / 10 : null,
    detailsMaxSpeed: maxSpeed > 0 ? Math.round(maxSpeed * 10) / 10 : null,
    batteryTemperature: maxBatteryTemp,
    batteryTempMin: null,
    batteryMinVoltage: minVoltage < 999 ? Math.round(minVoltage * 100) / 100 : null,
    batteryCycles: null,
    minGpsSatellites: minGpsSats < 99 ? minGpsSats : null,
    maxGpsSatellites: maxGpsSats > 0 ? maxGpsSats : null,
    batterySN: null,
    batteryHealth: null,
    batteryFullCapacity: null,
    batteryCurrentCapacity: null,
    batteryStatus: null,
    batteryCellDeviationMax: null,
    maxDistance: maxDist > 0 ? Math.round(maxDist) : null,
    maxVSpeed: maxVSpeed > 0 ? Math.round(maxVSpeed * 10) / 10 : null,
    totalTimeSeconds,
    sha256Hash: null,
    guid: null,
    rthTriggered,
    events,
    isDualBattery,
    battery1Cycles: null,
    battery2Cycles: null,
    battery1MinVoltage: minVoltage < 999 ? Math.round(minVoltage * 100) / 100 : null,
    battery2MinVoltage: batt1MinVoltage,
    battery1TempMax: maxBatteryTemp,
    battery2TempMax: batt1TempMax,
    battery1FullCapacity: null,
    battery2FullCapacity: null,
    battery1CellDeviationMax: null,
    battery2CellDeviationMax: null,
    source: "ardupilot",
  };
}

function interpolateAttitude(
  attitude: Array<{ time_ms: number; pitch: number; roll: number; yaw: number }>,
  timeMs: number
): { pitch: number; roll: number; yaw: number } | null {
  if (attitude.length === 0) return null;
  let lo = 0;
  let hi = attitude.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (attitude[mid].time_ms < timeMs) lo = mid + 1;
    else hi = mid;
  }
  const closest = attitude[lo];
  return { pitch: closest.pitch, roll: closest.roll, yaw: closest.yaw };
}

function interpolateBattery(
  battery: Array<{ time_ms: number; volt: number; curr?: number; remaining?: number | null; temp?: number | null }>,
  timeMs: number
): { volt: number; curr?: number; remaining?: number | null; temp?: number | null } | null {
  if (battery.length === 0) return null;
  let lo = 0;
  let hi = battery.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (battery[mid].time_ms < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return battery[lo];
}

function interpolateRcin(
  rcin: Array<{ time_ms: number; c1: number; c2: number; c3: number; c4: number }>,
  timeMs: number
): { c1: number; c2: number; c3: number; c4: number } | null {
  if (rcin.length === 0) return null;
  let lo = 0;
  let hi = rcin.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rcin[mid].time_ms < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return rcin[lo];
}

function sanitizeResult(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) return null;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(sanitizeResult);
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeResult(v);
    }
    return out;
  }
  return obj;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
