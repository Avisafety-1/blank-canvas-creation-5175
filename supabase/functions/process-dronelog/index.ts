import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

// Vår egen Fly.io-parser. Hvis konfigurert prøver vi den først, og faller
// tilbake til DroneLog `/logs/upload` kun hvis Fly-parseren ikke støtter
// formatet eller er nede.
const DJI_PARSER_URL = (Deno.env.get("DJI_PARSER_URL") ?? "").replace(/\/+$/, "");
const DJI_PARSER_TOKEN = Deno.env.get("DJI_PARSER_TOKEN");

/**
 * Prøver vår egen Fly.io DJI-parser. Returnerer CSV-tekst på samme form som
 * DroneLog API leverer, eller null hvis vi må falle tilbake.
 */
async function tryFlyParser(
  fileBytes: Uint8Array,
  fileName: string,
  fields: string[],
): Promise<string | null> {
  if (!DJI_PARSER_URL || !DJI_PARSER_TOKEN) return null;
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBytes], { type: "application/octet-stream" }),
      fileName,
    );
    form.append("fields", fields.join(","));
    const parseUrl = `${DJI_PARSER_URL}/parse`;
    console.log(`[fly-parser] POST ${parseUrl} (${fileBytes.length} bytes)`);
    const res = await fetch(parseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${DJI_PARSER_TOKEN}` },
      body: form,
    });
    if (res.status === 422) {
      const j = await res.json().catch(() => ({}));
      console.warn(`[fly-parser] unsupported: ${j.reason ?? "unknown"}`);
      return null;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[fly-parser] error ${res.status}: ${txt.slice(0, 200)}, falling back`);
      return null;
    }
    const json = await res.json();
    // Konverter parsed JSON til DroneLog-CSV-form
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
    for (const s of samples) {
      lines.push(
        cols
          .map((c) => esc(s[c] ?? (c.startsWith("DETAILS.") ? details[c] : "")))
          .join(","),
      );
    }
    console.log(
      `[fly-parser] success: ${samples.length} samples, ${lines[0].split(",").length} columns`,
    );
    return lines.join("\n");
  } catch (err) {
    console.warn(`[fly-parser] exception: ${(err as Error).message}`);
    return null;
  }
}

// Expanded field list including new fields for dedup, RTH, cell deviation
const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "OSD.goHomeStatus",
  // Advanced analysis fields
  "OSD.vSpeed [m/s]","OSD.pitch","OSD.roll","OSD.yaw",
  "OSD.xSpeed [m/s]","OSD.ySpeed [m/s]","OSD.groundOrSky","OSD.gpsLevel",
  "OSD.isMotorOn","OSD.flycCommand","OSD.isGPSUsed","OSD.isVisionUsed",
  "OSD.isCompassError","OSD.voltageWarning",
  // Battery (single-battery drones)
  "BATTERY.chargeLevel","BATTERY.temperature [C]","BATTERY.voltage [V]","BATTERY.current [A]","BATTERY.timesCharged",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.relativeCapacity","BATTERY.status","BATTERY.status.RAW",
  "BATTERY.cellVoltage1 [V]","BATTERY.cellVoltage2 [V]","BATTERY.cellVoltage3 [V]",
  "BATTERY.cellVoltage4 [V]","BATTERY.cellVoltage5 [V]","BATTERY.cellVoltage6 [V]",
  "BATTERY.cellVoltageDeviation [V]","BATTERY.isCellVoltageDeviationHigh","BATTERY.maxCellVoltageDeviation [V]",
  "BATTERY.maxTemperature [C]","BATTERY.minTemperature [C]",
  "BATTERY.goHomeStatus",
  // BATTERY1 (dual-battery drones like M350/M300)
  "BATTERY1.chargeLevel","BATTERY1.voltage [V]","BATTERY1.timesCharged",
  "BATTERY1.temperature [C]","BATTERY1.fullCapacity [mAh]",
  "BATTERY1.cellVoltageDeviation [V]","BATTERY1.maxCellVoltageDeviation [V]",
  "BATTERY1.current [A]","BATTERY1.currentCapacity [mAh]",
  // BATTERY2
  "BATTERY2.chargeLevel","BATTERY2.voltage [V]","BATTERY2.timesCharged",
  "BATTERY2.temperature [C]","BATTERY2.fullCapacity [mAh]",
  "BATTERY2.cellVoltageDeviation [V]","BATTERY2.maxCellVoltageDeviation [V]",
  "BATTERY2.current [A]","BATTERY2.currentCapacity [mAh]",
  // RC inputs
  "RC.aileron","RC.elevator","RC.rudder","RC.throttle",
  // Gimbal
  "GIMBAL.pitch","GIMBAL.roll","GIMBAL.yaw",
  // Calculated fields
  "CALC.distanceFromHome [m]","CALC.distanceFromHomeMax [m]",
  // Home position
  "HOME.latitude","HOME.longitude","HOME.height [m]","HOME.goHomeStatus",
  // Weather
  "WEATHER.windDirection","WEATHER.windSpeed [m/s]","WEATHER.maxWindSpeed [m/s]",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.batterySerial","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxHeight [m]","DETAILS.maxHorizontalSpeed [m/s]","DETAILS.maxVerticalSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  "APP.warning",
].join(",");

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

/**
 * Find a header index using flexible matching.
 */
function findHeaderIndex(headers: string[], target: string): number {
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;

  const targetLower = target.toLowerCase();
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === targetLower);
  if (ciIdx !== -1) return ciIdx;

  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  const partialIdx = headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
  if (partialIdx !== -1) return partialIdx;

  const legacyMap: Record<string, string> = {
    "osd.flytimemilliseconds": "osd.flytime",
    "osd.speed": "osd.hspeed",
    "battery.chargelevel": "battery.chargelevel",
  };
  const mapped = legacyMap[targetLower];
  if (mapped) {
    const mappedIdx = headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === mapped);
    if (mappedIdx !== -1) return mappedIdx;
  }

  return -1;
}

// Notable flycState values that indicate issues
const FLYC_WARNING_STATES = new Set([
  "gohome","autolanding","atti","gps_atti","landing","failsafe",
  "gohome_avoid","motor_lock","not_enough_force","low_voltage_landing",
]);

// RTH-related goHomeStatus values
const RTH_ACTIVE_STATES = new Set([
  "goinghome","gohome","autogoinghome","lowbatterygoinghome",
  "rc_disconnect_goinghome","smart_goinghome",
]);

interface FlightEvent {
  type: string;
  message: string;
  t_offset_ms: number | null;
  raw_field: string;
  raw_value: string;
}

function parseCsvToResult(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Empty or invalid CSV response from DroneLog");
  }

  const headers = parseCsvRow(lines[0]);
  console.log("CSV headers received:", JSON.stringify(headers));

  // Core indices
  const latIdx = findHeaderIndex(headers, "OSD.latitude");
  const lonIdx = findHeaderIndex(headers, "OSD.longitude");
  const altIdx = findHeaderIndex(headers, "OSD.altitude [m]");
  const heightIdx = findHeaderIndex(headers, "OSD.height [m]");
  const timeIdx = findHeaderIndex(headers, "OSD.flyTime [ms]");
  const speedIdx = findHeaderIndex(headers, "OSD.hSpeed [m/s]");
  const batteryIdx = findHeaderIndex(headers, "BATTERY.chargeLevel");

  // Extended indices
  const gpsNumIdx = findHeaderIndex(headers, "OSD.gpsNum");
  const flycStateIdx = findHeaderIndex(headers, "OSD.flycState");
  const battTempIdx = findHeaderIndex(headers, "BATTERY.temperature [C]");
  const battVoltIdx = findHeaderIndex(headers, "BATTERY.voltage [V]");
  const battCurrentIdx = findHeaderIndex(headers, "BATTERY.current [A]");
  const battLoopIdx = findHeaderIndex(headers, "BATTERY.timesCharged");
  const dateTimeIdx = findHeaderIndex(headers, "CUSTOM.dateTime");
  const customDateUtcIdx = findHeaderIndex(headers, "CUSTOM.date [UTC]");
  const customTimeUtcIdx = findHeaderIndex(headers, "CUSTOM.updateTime [UTC]");
  const appWarnIdx = findHeaderIndex(headers, "APP.warning");

  // Battery extended
  const battFullCapIdx = findHeaderIndex(headers, "BATTERY.fullCapacity [mAh]");
  const battCurrCapIdx = findHeaderIndex(headers, "BATTERY.currentCapacity [mAh]");
  const battStatusIdx = findHeaderIndex(headers, "BATTERY.status");
  const battStatusRawIdx = findHeaderIndex(headers, "BATTERY.status.RAW");
  const battMaxTempIdx = findHeaderIndex(headers, "BATTERY.maxTemperature [C]");
  const battMinTempIdx = findHeaderIndex(headers, "BATTERY.minTemperature [C]");
  // Individual cell voltage indices for manual deviation fallback
  const cellVoltIdx1 = findHeaderIndex(headers, "BATTERY.cellVoltage1 [V]");
  const cellVoltIdx2 = findHeaderIndex(headers, "BATTERY.cellVoltage2 [V]");
  const cellVoltIdx3 = findHeaderIndex(headers, "BATTERY.cellVoltage3 [V]");
  const cellVoltIdx4 = findHeaderIndex(headers, "BATTERY.cellVoltage4 [V]");
  const cellVoltIdx5 = findHeaderIndex(headers, "BATTERY.cellVoltage5 [V]");
  const cellVoltIdx6 = findHeaderIndex(headers, "BATTERY.cellVoltage6 [V]");
  const cellVoltIndices = [cellVoltIdx1, cellVoltIdx2, cellVoltIdx3, cellVoltIdx4, cellVoltIdx5, cellVoltIdx6];
  // API-native cell deviation fields
  const cellDevIdx = findHeaderIndex(headers, "BATTERY.cellVoltageDeviation [V]");
  const cellDevHighIdx = findHeaderIndex(headers, "BATTERY.isCellVoltageDeviationHigh");
  const cellDevMaxIdx = findHeaderIndex(headers, "BATTERY.maxCellVoltageDeviation [V]");

  // BATTERY1/BATTERY2 indices (dual-battery drones)
  const batt1ChargeIdx = findHeaderIndex(headers, "BATTERY1.chargeLevel");
  const batt1VoltIdx = findHeaderIndex(headers, "BATTERY1.voltage [V]");
  const batt1CyclesIdx = findHeaderIndex(headers, "BATTERY1.timesCharged");
  const batt1TempIdx = findHeaderIndex(headers, "BATTERY1.temperature [C]");
  const batt1FullCapIdx = findHeaderIndex(headers, "BATTERY1.fullCapacity [mAh]");
  const batt1CellDevIdx = findHeaderIndex(headers, "BATTERY1.cellVoltageDeviation [V]");
  const batt1MaxCellDevIdx = findHeaderIndex(headers, "BATTERY1.maxCellVoltageDeviation [V]");
  const batt1CurrentIdx = findHeaderIndex(headers, "BATTERY1.current [A]");
  const batt2ChargeIdx = findHeaderIndex(headers, "BATTERY2.chargeLevel");
  const batt2VoltIdx = findHeaderIndex(headers, "BATTERY2.voltage [V]");
  const batt2CyclesIdx = findHeaderIndex(headers, "BATTERY2.timesCharged");
  const batt2TempIdx = findHeaderIndex(headers, "BATTERY2.temperature [C]");
  const batt2FullCapIdx = findHeaderIndex(headers, "BATTERY2.fullCapacity [mAh]");
  const batt2CellDevIdx = findHeaderIndex(headers, "BATTERY2.cellVoltageDeviation [V]");
  const batt2MaxCellDevIdx = findHeaderIndex(headers, "BATTERY2.maxCellVoltageDeviation [V]");
  const batt2CurrentIdx = findHeaderIndex(headers, "BATTERY2.current [A]");
  const isDualBattery = batt1ChargeIdx >= 0 && batt2ChargeIdx >= 0;

  // RTH indices
  const osdGoHomeIdx = findHeaderIndex(headers, "OSD.goHomeStatus");
  const homeGoHomeIdx = findHeaderIndex(headers, "HOME.goHomeStatus");
  const battGoHomeIdx = findHeaderIndex(headers, "BATTERY.goHomeStatus");

  // DETAILS indices (metadata – same value every row, read from row 1)
  const detStartTimeIdx = findHeaderIndex(headers, "DETAILS.startTime");
  const detAircraftNameIdx = findHeaderIndex(headers, "DETAILS.aircraftName");
  const detAircraftSNIdx = findHeaderIndex(headers, "DETAILS.aircraftSN");
  const detAircraftSerialIdx = findHeaderIndex(headers, "DETAILS.aircraftSerial");
  const detDroneTypeIdx = findHeaderIndex(headers, "DETAILS.droneType");
  const detBatterySNIdx = findHeaderIndex(headers, "DETAILS.batterySN");
  const detBatterySerialIdx = findHeaderIndex(headers, "DETAILS.batterySerial");
  const detTotalTimeIdx = findHeaderIndex(headers, "DETAILS.totalTime [s]");
  const detTotalDistIdx = findHeaderIndex(headers, "DETAILS.totalDistance [m]");
  const detMaxDistIdx = findHeaderIndex(headers, "DETAILS.maxDistance [m]");
  const detMaxAltIdx = findHeaderIndex(headers, "DETAILS.maxHeight [m]");
  const detMaxHSpeedIdx = findHeaderIndex(headers, "DETAILS.maxHorizontalSpeed [m/s]");
  const detMaxVSpeedIdx = findHeaderIndex(headers, "DETAILS.maxVerticalSpeed [m/s]");
  const detSha256Idx = findHeaderIndex(headers, "DETAILS.sha256Hash");
  const detGuidIdx = findHeaderIndex(headers, "DETAILS.guid");

  console.log("Column indices — lat:", latIdx, "lon:", lonIdx, "alt:", altIdx, "height:", heightIdx,
    "time:", timeIdx, "speed:", speedIdx, "battery:", batteryIdx, "gpsNum:", gpsNumIdx,
    "flycState:", flycStateIdx, "battTemp:", battTempIdx, "dateTime:", dateTimeIdx,
    "sha256:", detSha256Idx, "guid:", detGuidIdx, "osdGoHome:", osdGoHomeIdx,
    "isDualBattery:", isDualBattery, "batt1Charge:", batt1ChargeIdx, "batt2Charge:", batt2ChargeIdx);

  // Extract DETAILS metadata from first data row
  const firstRow = parseCsvRow(lines[1]);
  const startTime = detStartTimeIdx >= 0 ? firstRow[detStartTimeIdx] : "";
  const aircraftName = detAircraftNameIdx >= 0 ? firstRow[detAircraftNameIdx] : "";
  const rawAircraftSN = detAircraftSNIdx >= 0 ? stripQuotes(firstRow[detAircraftSNIdx]) : "";
  const aircraftSerial = detAircraftSerialIdx >= 0 ? stripQuotes(firstRow[detAircraftSerialIdx]) : "";
  const aircraftSN = rawAircraftSN || aircraftSerial;
  const droneType = detDroneTypeIdx >= 0 ? firstRow[detDroneTypeIdx] : "";
  const totalDistance = detTotalDistIdx >= 0 ? parseFloat(firstRow[detTotalDistIdx]) : NaN;
  const maxDistance = detMaxDistIdx >= 0 ? parseFloat(firstRow[detMaxDistIdx]) : NaN;
  const detailsMaxAlt = detMaxAltIdx >= 0 ? parseFloat(firstRow[detMaxAltIdx]) : NaN;
  const detailsMaxSpeed = detMaxHSpeedIdx >= 0 ? parseFloat(firstRow[detMaxHSpeedIdx]) : NaN;
  const detailsMaxVSpeed = detMaxVSpeedIdx >= 0 ? parseFloat(firstRow[detMaxVSpeedIdx]) : NaN;
  const detailsTotalTime = detTotalTimeIdx >= 0 ? parseFloat(firstRow[detTotalTimeIdx]) : NaN;
  const batteryCycles = battLoopIdx >= 0 ? parseInt(firstRow[battLoopIdx]) : NaN;
  const rawBatterySN = detBatterySNIdx >= 0 ? firstRow[detBatterySNIdx] : "";
  const batterySerial = detBatterySerialIdx >= 0 ? firstRow[detBatterySerialIdx] : "";
  const batterySN = (rawBatterySN || batterySerial).replace(/^"|"$/g, "").trim();
  console.log("Battery SN indices — batterySN:", detBatterySNIdx, "batterySerial:", detBatterySerialIdx, "resolved:", batterySN);

  // === DIAGNOSTIC: Inspect ALL battery-related headers and unique SN values across rows ===
  const batteryHeaders = headers.filter(h => /battery/i.test(h) && /SN|serial/i.test(h));
  console.log("[DIAG] Battery-related SN headers found in CSV:", JSON.stringify(batteryHeaders));
  console.log("[DIAG] All headers containing 'battery' (case-insensitive):", JSON.stringify(headers.filter(h => /battery/i.test(h))));

  // Scan ALL rows for unique battery SN values (in case they vary mid-flight or there are dual batteries)
  const uniqueBatterySNs = new Set<string>();
  if (detBatterySNIdx >= 0 || detBatterySerialIdx >= 0) {
    for (let r = 1; r < lines.length; r++) {
      const row = parseCsvRow(lines[r]);
      const sn1 = detBatterySNIdx >= 0 ? (row[detBatterySNIdx] || "").replace(/^"|"$/g, "").trim() : "";
      const sn2 = detBatterySerialIdx >= 0 ? (row[detBatterySerialIdx] || "").replace(/^"|"$/g, "").trim() : "";
      if (sn1) uniqueBatterySNs.add(sn1);
      if (sn2) uniqueBatterySNs.add(sn2);
    }
  }
  console.log("[DIAG] Unique battery SN values across ALL rows:", JSON.stringify(Array.from(uniqueBatterySNs)));
  console.log("[DIAG] Total unique battery SNs:", uniqueBatterySNs.size, "| Aircraft SN:", aircraftSN, "| isDualBattery flag:", isDualBattery);
  const batteryFullCap = battFullCapIdx >= 0 ? parseFloat(firstRow[battFullCapIdx]) : NaN;
  const batteryCurrCap = battCurrCapIdx >= 0 ? parseFloat(firstRow[battCurrCapIdx]) : NaN;
  const batteryStatus = battStatusIdx >= 0 ? firstRow[battStatusIdx] : "";
  const batteryStatusRaw = battStatusRawIdx >= 0 ? parseFloat(firstRow[battStatusRawIdx]) : NaN;
  // Derive battery health: prefer BATTERY.status.RAW (numeric), fall back to parsing BATTERY.status
  const batteryHealth = !isNaN(batteryStatusRaw) ? batteryStatusRaw
    : (!isNaN(parseFloat(batteryStatus)) ? parseFloat(batteryStatus) : NaN);
  // BATTERY.maxTemperature/minTemperature summary fields (constant per flight)
  const battSummaryMaxTemp = battMaxTempIdx >= 0 ? parseFloat(firstRow[battMaxTempIdx]) : NaN;
  const battSummaryMinTemp = battMinTempIdx >= 0 ? parseFloat(firstRow[battMinTempIdx]) : NaN;
  // Dual-battery metadata from first row
  const battery1Cycles = batt1CyclesIdx >= 0 ? parseInt(firstRow[batt1CyclesIdx]) : NaN;
  const battery2Cycles = batt2CyclesIdx >= 0 ? parseInt(firstRow[batt2CyclesIdx]) : NaN;
  const battery1FullCap = batt1FullCapIdx >= 0 ? parseFloat(firstRow[batt1FullCapIdx]) : NaN;
  const battery2FullCap = batt2FullCapIdx >= 0 ? parseFloat(firstRow[batt2FullCapIdx]) : NaN;
  const sha256Hash = detSha256Idx >= 0 ? firstRow[detSha256Idx] : "";
  const guid = detGuidIdx >= 0 ? firstRow[detGuidIdx] : "";

  // CUSTOM date/time UTC
  const customDateUtc = customDateUtcIdx >= 0 ? firstRow[customDateUtcIdx] : "";
  const customTimeUtc = customTimeUtcIdx >= 0 ? firstRow[customTimeUtcIdx] : "";

  // Determine flight start dateTime — prioritized fallback chain
  let flightStartTime = startTime || "";

  // Normaliser DETAILS.startTime som kan ha format "5/5/2023T11:36:03.86 AMZ"
  if (flightStartTime) {
    const testParsed = new Date(flightStartTime.replace(/Z$/, '').replace('T', ' '));
    if (isNaN(testParsed.getTime())) {
      const dtMatch = flightStartTime.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
      );
      if (dtMatch) {
        const [, month, day, year, hours, mins, secs, , ampm] = dtMatch;
        let h = parseInt(hours);
        if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
        flightStartTime = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`;
        console.log("Normalised startTime:", flightStartTime);
      } else {
        console.log("Could not parse startTime, clearing for fallback:", flightStartTime);
        flightStartTime = "";
      }
    }
  }

  // Fallback 1: CUSTOM.date [UTC] + CUSTOM.updateTime [UTC]
  if (!flightStartTime && customDateUtc) {
    flightStartTime = customTimeUtc
      ? `${customDateUtc}T${customTimeUtc}Z`
      : `${customDateUtc}T00:00:00Z`;
  }
  // Fallback 2: CUSTOM.dateTime
  if (!flightStartTime && dateTimeIdx >= 0 && firstRow[dateTimeIdx]) {
    flightStartTime = firstRow[dateTimeIdx];
  }

  console.log("startTime chain:", { startTime, customDateUtc, customTimeUtc, dateTime: dateTimeIdx >= 0 ? firstRow[dateTimeIdx] : "N/A", resolved: flightStartTime });

  // Advanced analysis indices
  const vSpeedIdx = findHeaderIndex(headers, "OSD.vSpeed [m/s]");
  const pitchIdx = findHeaderIndex(headers, "OSD.pitch");
  const rollIdx = findHeaderIndex(headers, "OSD.roll");
  const yawIdx = findHeaderIndex(headers, "OSD.yaw");
  const groundOrSkyIdx = findHeaderIndex(headers, "OSD.groundOrSky");
  const gpsLevelIdx = findHeaderIndex(headers, "OSD.gpsLevel");
  const rcAileronIdx = findHeaderIndex(headers, "RC.aileron");
  const rcElevatorIdx = findHeaderIndex(headers, "RC.elevator");
  const rcRudderIdx = findHeaderIndex(headers, "RC.rudder");
  const rcThrottleIdx = findHeaderIndex(headers, "RC.throttle");
  const gimbalPitchIdx = findHeaderIndex(headers, "GIMBAL.pitch");
  const gimbalRollIdx = findHeaderIndex(headers, "GIMBAL.roll");
  const gimbalYawIdx = findHeaderIndex(headers, "GIMBAL.yaw");
  const dist2DIdx = findHeaderIndex(headers, "CALC.distanceFromHome [m]");
  const dist3DIdx = findHeaderIndex(headers, "CALC.distanceFromHomeMax [m]");
  const homeLatIdx = findHeaderIndex(headers, "HOME.latitude");
  const homeLonIdx = findHeaderIndex(headers, "HOME.longitude");
  const homeHeightIdx = findHeaderIndex(headers, "HOME.height [m]");
  const weatherWindDirIdx = findHeaderIndex(headers, "WEATHER.windDirection");
  const weatherWindSpeedIdx = findHeaderIndex(headers, "WEATHER.windSpeed [m/s]");
  const weatherMaxWindSpeedIdx = findHeaderIndex(headers, "WEATHER.maxWindSpeed [m/s]");

  // Cardinal direction to degrees mapping
  const cardinalToDeg: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const parseWindDir = (raw: string | undefined): number | undefined => {
    if (!raw || raw === "") return undefined;
    const num = parseFloat(raw);
    if (!isNaN(num)) return num;
    return cardinalToDeg[raw.toUpperCase().trim()];
  };

  const positions: Array<Record<string, any>> = [];
  let maxSpeed = 0;
  let minBattery = batteryIdx >= 0 ? 100 : -1;
  let maxFlyTimeMs = 0;
  let maxBattTemp = -999;
  let minBattTemp = 999;
  let minBattVolt = 999;
  let maxBattCellDev = 0;
  let minGpsSats = 99;
  let maxGpsSats = 0;
  const batteryReadings: number[] = [];
  const warnings: Array<{ type: string; message: string; value?: number; severity?: string; count?: number }> = [];
  const flycStatesSet = new Set<string>();
  const appWarnings = new Set<string>();
  const events: FlightEvent[] = [];
  let rthTriggered = false;

  // Dual-battery tracking
  let minBatt1Volt = 999, minBatt2Volt = 999;
  let maxBatt1Temp = -999, maxBatt2Temp = -999;
  let maxBatt1CellDev = 0, maxBatt2CellDev = 0;
  const batt1Cycles = batt1CyclesIdx >= 0 ? NaN : NaN;
  const batt2Cycles = batt2CyclesIdx >= 0 ? NaN : NaN;

  // State tracking for event detection
  let prevAppWarn = "";
  let prevGoHomeStatus = "";

  const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 2500));

  // Track last timestamp for end_time_utc
  let lastTimestamp = "";

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;
    const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0;
    const height = heightIdx >= 0 ? parseFloat(cols[heightIdx]) : 0;
    const flyTimeMs = timeIdx >= 0 ? parseFloat(cols[timeIdx]) : NaN;
    const speed = speedIdx >= 0 ? parseFloat(cols[speedIdx]) : NaN;
    const battery = batteryIdx >= 0 ? parseFloat(cols[batteryIdx]) : NaN;

    // Extended field parsing
    const gpsSats = gpsNumIdx >= 0 ? parseInt(cols[gpsNumIdx]) : NaN;
    const battTemp = battTempIdx >= 0 ? parseFloat(cols[battTempIdx]) : NaN;
    const battVolt = battVoltIdx >= 0 ? parseFloat(cols[battVoltIdx]) : NaN;
    const flycState = flycStateIdx >= 0 ? cols[flycStateIdx] : "";
    const appWarn = appWarnIdx >= 0 ? cols[appWarnIdx] : "";

    // RTH status from multiple sources
    const osdGoHome = osdGoHomeIdx >= 0 ? cols[osdGoHomeIdx] : "";
    const homeGoHome = homeGoHomeIdx >= 0 ? cols[homeGoHomeIdx] : "";
    const battGoHome = battGoHomeIdx >= 0 ? cols[battGoHomeIdx] : "";
    const currentGoHome = osdGoHome || homeGoHome || battGoHome;

    // Track last custom timestamp for end_time
    if (customTimeUtcIdx >= 0 && cols[customTimeUtcIdx]) {
      lastTimestamp = cols[customTimeUtcIdx];
    }

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery)) {
      if (battery < minBattery) minBattery = battery;
      batteryReadings.push(battery);
    }
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;
    if (!isNaN(battTemp)) {
      if (battTemp > maxBattTemp) maxBattTemp = battTemp;
      if (battTemp < minBattTemp) minBattTemp = battTemp;
    }
    if (!isNaN(battVolt) && battVolt > 0 && battVolt < minBattVolt) minBattVolt = battVolt;

    // Dual-battery tracking
    if (isDualBattery) {
      const b1v = batt1VoltIdx >= 0 ? parseFloat(cols[batt1VoltIdx]) : NaN;
      const b2v = batt2VoltIdx >= 0 ? parseFloat(cols[batt2VoltIdx]) : NaN;
      const b1t = batt1TempIdx >= 0 ? parseFloat(cols[batt1TempIdx]) : NaN;
      const b2t = batt2TempIdx >= 0 ? parseFloat(cols[batt2TempIdx]) : NaN;
      if (!isNaN(b1v) && b1v > 0 && b1v < minBatt1Volt) minBatt1Volt = b1v;
      if (!isNaN(b2v) && b2v > 0 && b2v < minBatt2Volt) minBatt2Volt = b2v;
      if (!isNaN(b1t) && b1t > maxBatt1Temp) maxBatt1Temp = b1t;
      if (!isNaN(b2t) && b2t > maxBatt2Temp) maxBatt2Temp = b2t;
      const b1cd = batt1CellDevIdx >= 0 ? parseFloat(cols[batt1CellDevIdx]) : NaN;
      const b2cd = batt2CellDevIdx >= 0 ? parseFloat(cols[batt2CellDevIdx]) : NaN;
      if (!isNaN(b1cd) && b1cd > maxBatt1CellDev) maxBatt1CellDev = b1cd;
      if (!isNaN(b2cd) && b2cd > maxBatt2CellDev) maxBatt2CellDev = b2cd;
    }

    // Cell deviation: prefer API-native field, fallback to manual from cellVoltage1-6
    const apiCellDev = cellDevIdx >= 0 ? parseFloat(cols[cellDevIdx]) : NaN;
    if (!isNaN(apiCellDev) && apiCellDev > maxBattCellDev) {
      maxBattCellDev = apiCellDev;
    } else {
      const cellVoltages = cellVoltIndices
        .filter(idx => idx >= 0)
        .map(idx => parseFloat(cols[idx]))
        .filter(v => !isNaN(v) && v > 0);
      if (cellVoltages.length >= 2) {
        const rowDev = Math.max(...cellVoltages) - Math.min(...cellVoltages);
        if (rowDev > maxBattCellDev) maxBattCellDev = rowDev;
      }
    }
    if (!isNaN(gpsSats)) {
      if (gpsSats < minGpsSats) minGpsSats = gpsSats;
      if (gpsSats > maxGpsSats) maxGpsSats = gpsSats;
    }

    if (flycState && FLYC_WARNING_STATES.has(flycState.toLowerCase())) {
      flycStatesSet.add(flycState);
    }

    // ── Event detection ──
    const offsetMs = !isNaN(flyTimeMs) ? Math.round(flyTimeMs) : null;

    // APP.warn change
    if (appWarn && appWarn !== "0" && appWarn.toLowerCase() !== "none" && appWarn !== prevAppWarn) {
      appWarnings.add(appWarn);
      events.push({ type: "APP_WARNING", message: appWarn, t_offset_ms: offsetMs, raw_field: "APP.warn", raw_value: appWarn });
    }
    prevAppWarn = appWarn;

    // RTH detection
    if (currentGoHome && currentGoHome.toLowerCase() !== prevGoHomeStatus.toLowerCase()) {
      const lower = currentGoHome.toLowerCase();
      if (RTH_ACTIVE_STATES.has(lower)) {
        rthTriggered = true;
        events.push({ type: "RTH", message: `Return to Home: ${currentGoHome}`, t_offset_ms: offsetMs, raw_field: "goHomeStatus", raw_value: currentGoHome });
      }
    }
    prevGoHomeStatus = currentGoHome;

    // Low battery detection from charge level dropping below 20%
    if (!isNaN(battery) && battery < 20 && battery >= 0) {
      if (!events.some((e: any) => e.type === "LOW_BATTERY")) {
        events.push({ type: "LOW_BATTERY", message: `Battery charge low: ${battery}%`, t_offset_ms: offsetMs, raw_field: "BATTERY.chargeLevel [%]", raw_value: String(battery) });
      }
    }

    // Also detect RTH from flycState
    if (flycState && (flycState.toLowerCase() === "gohome" || flycState.toLowerCase() === "gohome_avoid")) {
      rthTriggered = true;
    }

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const ts = dateTimeIdx >= 0 && cols[dateTimeIdx] ? cols[dateTimeIdx] :
        (!isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`);
      const point: Record<string, any> = { lat, lng: lon, alt: isNaN(alt) ? 0 : alt, height: isNaN(height) ? 0 : height, timestamp: ts };
      // Extended telemetry for flight analysis
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
      if (ps(flycStateIdx)) point.flycState = ps(flycStateIdx);
      if (ps(groundOrSkyIdx)) point.groundOrSky = ps(groundOrSkyIdx);
      if (pf(weatherWindSpeedIdx) !== undefined) point.windSpeed = pf(weatherWindSpeedIdx);
      if (pf(weatherMaxWindSpeedIdx) !== undefined) point.maxWindSpeed = pf(weatherMaxWindSpeedIdx);
      const windDirRaw = weatherWindDirIdx >= 0 ? cols[weatherWindDirIdx]?.trim() : undefined;
      const windDirParsed = parseWindDir(windDirRaw);
      if (windDirParsed !== undefined) point.windDir = windDirParsed;
      // Dual-battery telemetry per point
      if (isDualBattery) {
        if (pf(batt1ChargeIdx) !== undefined) point.battery1 = pf(batt1ChargeIdx);
        if (pf(batt1VoltIdx) !== undefined) point.voltage1 = pf(batt1VoltIdx);
        if (pf(batt1CurrentIdx) !== undefined) point.current1 = pf(batt1CurrentIdx);
        if (pf(batt1TempIdx) !== undefined) point.temp1 = pf(batt1TempIdx);
        if (pf(batt2ChargeIdx) !== undefined) point.battery2 = pf(batt2ChargeIdx);
        if (pf(batt2VoltIdx) !== undefined) point.voltage2 = pf(batt2VoltIdx);
        if (pf(batt2CurrentIdx) !== undefined) point.current2 = pf(batt2CurrentIdx);
        if (pf(batt2TempIdx) !== undefined) point.temp2 = pf(batt2TempIdx);
      }
      positions.push(point);
    }
  }

  let durationMinutes = Math.round(maxFlyTimeMs / 60000);
  if (maxFlyTimeMs === 0 && lines.length > 10) {
    const estimatedSeconds = (lines.length - 1) / 10;
    durationMinutes = Math.round(estimatedSeconds / 60);
    console.log("flyTime column empty/missing, estimated duration from row count:", durationMinutes, "min");
  }

  // Compute end_time_utc
  let endTimeUtc: string | null = null;
  if (flightStartTime && durationMinutes > 0) {
    try {
      const startD = new Date(flightStartTime);
      if (!isNaN(startD.getTime())) {
        const endD = new Date(startD.getTime() + (maxFlyTimeMs || durationMinutes * 60000));
        endTimeUtc = endD.toISOString();
      }
    } catch { /* ignore */ }
  }

  // ── Generate warnings ──
  if (minBattery >= 0 && minBattery < 20) {
    warnings.push({ type: "low_battery", message: `Batterinivå gikk ned til ${minBattery}%`, value: minBattery });
  }
  if (maxBattTemp > 50) {
    warnings.push({ type: "high_battery_temp", message: `Batteritemperatur nådde ${maxBattTemp.toFixed(1)}°C`, value: maxBattTemp });
  }
  if (minGpsSats < 6 && minGpsSats >= 0) {
    warnings.push({ type: "low_gps", message: `Lavt antall GPS-satellitter: ${minGpsSats}`, value: minGpsSats });
  }
  if (flycStatesSet.size > 0) {
    warnings.push({ type: "flyc_state", message: `Flygkontrolltilstander: ${Array.from(flycStatesSet).join(", ")}` });
  }
  if (appWarnings.size > 0) {
    // Categorize and deduplicate APP warnings
    const criticalPatterns = /emergency|crash|motor|propeller|esc\s|failsafe|collision/i;
    const importantPatterns = /battery|rth|return.to.home|landing|gps|compass|imu|obstacle|height.limit|geofence|no.fly/i;
    // Everything else is info (signal, downlink, antenna, image transmission, etc.)

    const categorized: Record<string, { severity: string; count: number }> = {};
    for (const msg of appWarnings) {
      // Normalize: trim trailing punctuation variants, lowercase for grouping
      const normalized = msg.replace(/[.;,!]+$/, '').replace(/\s+/g, ' ').trim();
      // Determine severity
      let severity = 'info';
      if (criticalPatterns.test(normalized)) severity = 'critical';
      else if (importantPatterns.test(normalized)) severity = 'warning';

      if (categorized[normalized]) {
        categorized[normalized].count++;
      } else {
        categorized[normalized] = { severity, count: 1 };
      }
    }

    // Also count duplicates from events list for accurate counts
    const eventCounts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.type === 'APP_WARNING' && ev.message) {
        const norm = ev.message.replace(/[.;,!]+$/, '').replace(/\s+/g, ' ').trim();
        eventCounts[norm] = (eventCounts[norm] || 0) + 1;
      }
    }
    // Use event counts if larger (they track every occurrence, not just unique)
    for (const [msg, data] of Object.entries(categorized)) {
      if (eventCounts[msg] && eventCounts[msg] > data.count) {
        data.count = eventCounts[msg];
      }
    }

    // Push categorized warnings sorted by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const sorted = Object.entries(categorized).sort((a, b) => 
      (severityOrder[a[1].severity as keyof typeof severityOrder] ?? 2) - (severityOrder[b[1].severity as keyof typeof severityOrder] ?? 2)
    );

    for (const [msg, data] of sorted) {
      const countSuffix = data.count > 1 ? ` (×${data.count})` : '';
      warnings.push({ 
        type: `app_warning_${data.severity}`, 
        message: `${msg}${countSuffix}`, 
        severity: data.severity, 
        count: data.count 
      });
    }
  }
  if (maxBattCellDev > 0.1) {
    warnings.push({ type: "cell_deviation", message: `Høy celleavvik: ${maxBattCellDev.toFixed(3)}V`, value: maxBattCellDev });
  }

  // Mirror LOW_BATTERY events as actionable warnings so checkbox appears (only if valid battery data)
  if (minBattery >= 0 && events.some((e: any) => e.type === "LOW_BATTERY") && !warnings.find((w: any) => w.type === "low_battery")) {
    warnings.push({ type: "low_battery", message: `Lavt batteri registrert under flyging (${minBattery}%)`, value: minBattery });
  }

  for (let i = 1; i < positions.length; i++) {
    const altDiff = Math.abs(positions[i].height - positions[i - 1].height);
    if (altDiff > 50) {
      warnings.push({ type: "altitude_anomaly", message: `Plutselig høydeendring på ${altDiff.toFixed(0)}m registrert`, value: altDiff });
      break;
    }
  }

  const startPos = positions.length > 0 ? positions[0] : null;
  const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

  return {
    positions,
    durationMinutes,
    durationMs: maxFlyTimeMs,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    batteryReadings: batteryReadings.length > 100
      ? batteryReadings.filter((_, i) => i % Math.floor(batteryReadings.length / 100) === 0)
      : batteryReadings,
    startPosition: startPos,
    endPosition: endPos,
    totalRows: lines.length - 1,
    sampledPositions: positions.length,
    warnings,
    // Metadata
    startTime: flightStartTime || null,
    endTimeUtc: endTimeUtc,
    aircraftName: aircraftName || null,
    aircraftSN: aircraftSN || null,
    aircraftSerial: aircraftSerial || null,
    droneType: droneType || null,
    totalDistance: !isNaN(totalDistance) ? Math.round(totalDistance) : null,
    maxAltitude: !isNaN(detailsMaxAlt) ? Math.round(detailsMaxAlt * 10) / 10 : null,
    detailsMaxSpeed: !isNaN(detailsMaxSpeed) ? Math.round(detailsMaxSpeed * 10) / 10 : null,
    // Battery temp: prefer BATTERY.maxTemperature summary field, fallback to row-scanned max
    batteryTemperature: !isNaN(battSummaryMaxTemp) ? Math.round(battSummaryMaxTemp * 10) / 10
      : (maxBattTemp > -999 ? Math.round(maxBattTemp * 10) / 10 : null),
    batteryTempMin: !isNaN(battSummaryMinTemp) ? Math.round(battSummaryMinTemp * 10) / 10
      : (minBattTemp < 999 ? Math.round(minBattTemp * 10) / 10 : null),
    batteryMinVoltage: minBattVolt < 999 ? Math.round(minBattVolt * 100) / 100 : null,
    batteryCycles: !isNaN(batteryCycles) ? batteryCycles : null,
    minGpsSatellites: minGpsSats < 99 ? minGpsSats : null,
    maxGpsSatellites: maxGpsSats > 0 ? maxGpsSats : null,
    // Battery extended
    batterySN: batterySN || null,
    batteryHealth: !isNaN(batteryHealth) ? Math.round(batteryHealth * 10) / 10 : null,
    batteryFullCapacity: !isNaN(batteryFullCap) ? Math.round(batteryFullCap) : null,
    batteryCurrentCapacity: !isNaN(batteryCurrCap) ? Math.round(batteryCurrCap) : null,
    batteryStatus: batteryStatus || null,
    batteryCellDeviationMax: maxBattCellDev > 0 ? Math.round(maxBattCellDev * 1000) / 1000 : null,
    maxDistance: !isNaN(maxDistance) ? Math.round(maxDistance) : null,
    maxVSpeed: !isNaN(detailsMaxVSpeed) ? Math.round(detailsMaxVSpeed * 10) / 10 : null,
    totalTimeSeconds: !isNaN(detailsTotalTime) ? Math.round(detailsTotalTime) : null,
    // Dual-battery fields
    isDualBattery,
    battery1Cycles: !isNaN(battery1Cycles) ? battery1Cycles : null,
    battery2Cycles: !isNaN(battery2Cycles) ? battery2Cycles : null,
    battery1MinVoltage: minBatt1Volt < 999 ? Math.round(minBatt1Volt * 100) / 100 : null,
    battery2MinVoltage: minBatt2Volt < 999 ? Math.round(minBatt2Volt * 100) / 100 : null,
    battery1TempMax: maxBatt1Temp > -999 ? Math.round(maxBatt1Temp * 10) / 10 : null,
    battery2TempMax: maxBatt2Temp > -999 ? Math.round(maxBatt2Temp * 10) / 10 : null,
    battery1FullCapacity: !isNaN(battery1FullCap) ? Math.round(battery1FullCap) : null,
    battery2FullCapacity: !isNaN(battery2FullCap) ? Math.round(battery2FullCap) : null,
    battery1CellDeviationMax: maxBatt1CellDev > 0 ? Math.round(maxBatt1CellDev * 1000) / 1000 : null,
    battery2CellDeviationMax: maxBatt2CellDev > 0 ? Math.round(maxBatt2CellDev * 1000) / 1000 : null,
    // Dedup & event fields
    sha256Hash: sha256Hash || null,
    guid: guid || null,
    rthTriggered,
    events,
  };
}

// ── HTTP handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    try {
      const dronelogKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        return new Response(JSON.stringify({ ok: false, error: "DRONELOG_AVISAFE_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${DRONELOG_BASE}/fields`, {
        headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      const body = await res.text();
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, status: res.status, error: body.substring(0, 500) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let data;
      try { data = JSON.parse(body); } catch { data = body.substring(0, 500); }
      return new Response(JSON.stringify({ ok: true, fields: typeof data === "object" && data.result ? data.result : data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const globalKey = Deno.env.get("DRONELOG_AVISAFE_KEY");

    // Look up per-company key
    let dronelogKey = globalKey;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", authUser.id)
        .single();

      if (profile?.company_id) {
        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: company } = await serviceClient
          .from("companies")
          .select("dronelog_api_key")
          .eq("id", profile.company_id)
          .single();

        if (company?.dronelog_api_key) {
          dronelogKey = company.dronelog_api_key;
          console.log("Using per-company DroneLog key for company:", profile.company_id);
        }
      }
    } catch (err) {
      console.log("Could not look up company key, using global:", err);
    }

    if (!dronelogKey) {
      return new Response(JSON.stringify({ error: "DroneLog API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const keyFingerprint = dronelogKey.substring(0, 6) + "…";
    console.log(`[process-dronelog] key=${keyFingerprint}`);

    const contentType = req.headers.get("content-type") || "";

    // ── JSON actions (DJI login, list logs, process log) ──
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action } = body;

      if (action === "dji-login") {
        const { email, password } = body;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
          method: "POST",
          headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({ message: "Invalid response from DroneLog" }));
        if (!res.ok) {
          console.error(`[process-dronelog] dji-login key=${keyFingerprint} upstream=${res.status}`);
          const retryAfter = res.headers.get("Retry-After") || null;
          if (res.status === 429) {
            return new Response(JSON.stringify({ error: "Too many requests", details: data, upstreamStatus: 429, retryAfter, remaining: data?.remaining ?? null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          if (res.status === 401 || res.status === 403) {
            return new Response(JSON.stringify({ error: "Ugyldig eller utløpt API-nøkkel", details: data, upstreamStatus: res.status }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const errMsg = res.status === 500
            ? "DroneLog API serverfeil. Sjekk at DJI-legitimasjonen er korrekt, eller prøv igjen senere."
            : (data.message || "DJI login failed");
          return new Response(JSON.stringify({ error: errMsg, details: data, upstreamStatus: res.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-list-logs") {
        const { accountId, limit = 20, createdAfterId } = body;
        if (!accountId) {
          return new Response(JSON.stringify({ error: "accountId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        let qs = `limit=${limit}`;
        if (createdAfterId) qs += `&createdAfterId=${createdAfterId}`;
        const res = await fetch(`${DRONELOG_BASE}/logs/${accountId}?${qs}`, {
          headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
        });
        const data = await res.json();
        console.log(`[process-dronelog] dji-list-logs key=${keyFingerprint} upstream=${res.status}`);
        if (!res.ok) {
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After") || null;
            return new Response(JSON.stringify({ error: "Too many requests", details: data, upstreamStatus: 429, retryAfter, remaining: data?.remaining ?? null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: data.message || "Failed to list logs", details: data, upstreamStatus: res.status }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-process-log") {
        const { accountId, logId, downloadUrl } = body;
        if (!accountId || !logId) {
          return new Response(JSON.stringify({ error: "accountId and logId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const fieldList = FIELDS.split(",").map(f => f.trim());
        const logUrl = downloadUrl || `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;

        // Last ned filen og upload som multipart til /logs/upload (stabil flyt — Fly-parseren er deaktivert).
        console.log(`[process-dronelog] downloading log ${logId} for /logs/upload fallback`);
        const dl = await fetch(logUrl, { headers: { Authorization: `Bearer ${dronelogKey}` } });
        if (!dl.ok) {
          const errText = await dl.text().catch(() => "");
          console.error(`[process-dronelog] DJI Cloud download failed: ${dl.status}`);
          if (dl.status === 429) {
            const retryAfter = dl.headers.get("Retry-After") || null;
            return new Response(JSON.stringify({ error: "Too many requests", upstreamStatus: 429, retryAfter, remaining: null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: "DJI Cloud download failed", details: errText.slice(0, 500), upstreamStatus: dl.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const fileBytes = new Uint8Array(await dl.arrayBuffer());

        // Helper: upload bytes med gitt extension til DroneLog /logs/upload, prøv ZIP→TXT→reZIP ved 500.
        const uploadDjiBytes = async (bytes: Uint8Array, ext: string): Promise<string> => {
          const fileName = `dji_${logId}${ext}`;
          const boundary = "----DronLogBoundary" + Date.now();
          const fileMime = ext === ".zip" ? "application/zip" : ext === ".txt" ? "text/plain" : "application/octet-stream";
          const parts: string[] = [];
          for (const field of fieldList) {
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
          }
          parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileMime}\r\n\r\n`);
          const enc = new TextEncoder();
          const prefixBytes = enc.encode(parts.join(""));
          const suffixBytes = enc.encode(`\r\n--${boundary}--\r\n`);
          const uploadBody = new Uint8Array(prefixBytes.length + bytes.length + suffixBytes.length);
          uploadBody.set(prefixBytes, 0);
          uploadBody.set(bytes, prefixBytes.length);
          uploadBody.set(suffixBytes, prefixBytes.length + bytes.length);

          const upRes = await fetch(`${DRONELOG_BASE}/logs/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json", "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: uploadBody,
          });

          if (!upRes.ok) {
            const errText = await upRes.text();
            // ZIP fra DJI Cloud trigger ofte 500. Prøv ZIP→TXT→reZIP som siste forsøk.
            if (ext === ".zip" && upRes.status === 500) {
              console.log(`[process-dronelog] ZIP upload 500, prøver ZIP->TXT->reZIP for ${logId}`);
              const zip = await JSZip.loadAsync(bytes);
              const txtEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".txt"));
              if (txtEntry) {
                const txtBytes = await (txtEntry as any).async("uint8array");
                try {
                  return await uploadDjiBytes(txtBytes, ".txt");
                } catch {
                  const fresh = new JSZip();
                  fresh.file((txtEntry as any).name.split("/").pop() || `dji_${logId}.txt`, txtBytes);
                  const zipBytes = await fresh.generateAsync({ type: "uint8array", compression: "DEFLATE" });
                  return await uploadDjiBytes(zipBytes, ".zip");
                }
              }
            }
            const err: any = new Error(`DroneLog upload failed (${upRes.status}): ${errText.slice(0, 300)}`);
            err.status = upRes.status;
            throw err;
          }
          return await upRes.text();
        };

        try {
          // ZIP-magic = "PK\x03\x04"; ellers behandle som TXT.
          const looksLikeZip = fileBytes.length >= 4 && fileBytes[0] === 0x50 && fileBytes[1] === 0x4b;
          const csvText = await uploadDjiBytes(fileBytes, looksLikeZip ? ".zip" : ".txt");
          console.log(`[process-dronelog] /logs/upload OK, csv length=${csvText.length}`);
          const result = parseCsvToResult(csvText);
          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e: any) {
          const status = typeof e?.status === "number" ? e.status : 500;
          console.error(`[process-dronelog] /logs/upload failed: ${status} ${(e?.message || "").slice(0, 300)}`);
          if (status === 429) {
            return new Response(JSON.stringify({ error: "Too many requests", upstreamStatus: 429 }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: "DroneLog API error", details: String(e?.message || e).slice(0, 500), upstreamStatus: status, isUpstream500: status === 500 }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // ── DJI credential management ──

      if (action === "dji-save-credentials") {
        const { email, password, accountId: djiAccId, autoSyncEnabled } = body;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Encrypt password using SUPABASE_SERVICE_ROLE_KEY as encryption basis
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyMaterial, new TextEncoder().encode(password));
        const encryptedB64 = btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));

        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { error: upsertErr } = await serviceClient
          .from("dji_credentials")
          .upsert({
            user_id: authUser.id,
            dji_email: email,
            dji_password_encrypted: encryptedB64,
            dji_account_id: djiAccId || null,
            auto_sync_enabled: autoSyncEnabled === true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        if (upsertErr) {
          console.error("[process-dronelog] dji-save-credentials error:", upsertErr);
          return new Response(JSON.stringify({ error: "Failed to save credentials" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ saved: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-auto-login") {
        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: cred, error: credErr } = await serviceClient
          .from("dji_credentials")
          .select("dji_email, dji_password_encrypted, dji_account_id")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (credErr || !cred) {
          return new Response(JSON.stringify({ error: "No saved credentials" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Decrypt password
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const raw = Uint8Array.from(atob(cred.dji_password_encrypted), c => c.charCodeAt(0));
        const iv = raw.slice(0, 12);
        const ciphertext = raw.slice(12);
        const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
        const password = new TextDecoder().decode(decrypted);

        // Login to DJI via DroneLog API
        const res = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
          method: "POST",
          headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: cred.dji_email, password }),
        });
        const data = await res.json().catch(() => ({ message: "Invalid response from DroneLog" }));
        if (!res.ok) {
          console.error(`[process-dronelog] dji-auto-login upstream=${res.status}`);
          // If credentials are invalid, delete them
          if (res.status === 401 || res.status === 403 || res.status === 500) {
            await serviceClient.from("dji_credentials").delete().eq("user_id", authUser.id);
          }
          return new Response(JSON.stringify({ error: data.message || "Auto-login failed", upstreamStatus: res.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update stored accountId if needed
        const accountId = data.result?.djiAccountId || data.result?.id || data.result?.accountId || data.accountId;
        if (accountId && accountId !== cred.dji_account_id) {
          await serviceClient.from("dji_credentials").update({ dji_account_id: accountId }).eq("user_id", authUser.id);
        }

        return new Response(JSON.stringify({ ...data, email: cred.dji_email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-delete-credentials") {
        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await serviceClient.from("dji_credentials").delete().eq("user_id", authUser.id);
        return new Response(JSON.stringify({ deleted: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-update-auto-sync") {
        const { autoSyncEnabled } = body;
        if (typeof autoSyncEnabled !== "boolean") {
          return new Response(JSON.stringify({ error: "autoSyncEnabled must be boolean" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data, error } = await serviceClient
          .from("dji_credentials")
          .update({ auto_sync_enabled: autoSyncEnabled, updated_at: new Date().toISOString() })
          .eq("user_id", authUser.id)
          .select("id, auto_sync_enabled")
          .maybeSingle();

        if (error) {
          console.error("[process-dronelog] dji-update-auto-sync error:", error);
          return new Response(JSON.stringify({ error: "Failed to update auto-sync" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!data) {
          return new Response(JSON.stringify({ error: "No saved credentials" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ saved: true, autoSyncEnabled: data.auto_sync_enabled === true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── File upload ──
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parserOverride = String(formData.get("parser") || "").toLowerCase(); // "", "flyio", "dronelogapi"

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const fileName = file.name || "flight.txt";
    const boundary = "----DronLogBoundary" + Date.now();
    const fieldList = FIELDS.split(",").map(f => f.trim());

    // Debug-override: tving Fly.io-parser hvis bedt om
    if (parserOverride === "flyio") {
      const csv = await tryFlyParser(fileBytes, fileName, fieldList);
      if (!csv) {
        return new Response(JSON.stringify({ error: "Fly.io parser failed", details: "Parser returned no result (unsupported format, missing config or upstream error)", parser_used: "flyio" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const result = parseCsvToResult(csv);
      (result as any).parser_used = "flyio";
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parts: string[] = [];
    for (const field of fieldList) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
    }
    // DroneLog (Laravel mimes:txt,zip) validerer både filendelse og MIME — octet-stream gir 422.
    const lowerName = fileName.toLowerCase();
    const directMime = lowerName.endsWith(".zip") ? "application/zip" : lowerName.endsWith(".txt") ? "text/plain" : (file.type || "application/octet-stream");
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${directMime}\r\n\r\n`);

    const textEncoder = new TextEncoder();
    const prefixBytes = textEncoder.encode(parts.join(""));
    const suffixBytes = textEncoder.encode(`\r\n--${boundary}--\r\n`);

    const uploadBody = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
    uploadBody.set(prefixBytes, 0);
    uploadBody.set(fileBytes, prefixBytes.length);
    uploadBody.set(suffixBytes, prefixBytes.length + fileBytes.length);

    console.log("Upload: manual multipart, fields:", fieldList.length, "file:", fileName, "size:", fileBytes.length);

    const dronelogResponse = await fetch(`${DRONELOG_BASE}/logs/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dronelogKey}`,
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: uploadBody,
    });

    if (!dronelogResponse.ok) {
      const errText = await dronelogResponse.text();
      console.error(`[process-dronelog] file-upload key=${keyFingerprint} upstream=${dronelogResponse.status}`);
      if (dronelogResponse.status === 429) {
        const retryAfter = dronelogResponse.headers.get("Retry-After") || null;
        return new Response(JSON.stringify({ error: "Too many requests", upstreamStatus: 429, retryAfter }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "DroneLog API error", details: errText, upstreamStatus: dronelogResponse.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const csvText = await dronelogResponse.text();
    const result = parseCsvToResult(csvText);
    (result as any).parser_used = "dronelogapi";

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-dronelog error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
