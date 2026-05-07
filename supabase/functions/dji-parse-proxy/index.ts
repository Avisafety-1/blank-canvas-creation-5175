/**
 * dji-parse-proxy
 *
 * Laster ned en DJI-loggfil (via DroneLog signed downloadUrl, eller direkte URL),
 * sender den til vår egen Fly.io-parser, og returnerer en CSV-streng i samme
 * format som DroneLog API returnerer fra POST /logs/upload.
 *
 * Dette gjør at de eksisterende edge functions (process-dronelog, dji-process-single,
 * dji-auto-sync) kan bruke samme parseCsvToResult / parseCsvMinimal som før —
 * de bytter bare ut hvor CSV-en kommer fra.
 *
 * Hvis Fly-parseren returnerer 422 (ukjent versjon / scrambled), eller er nede,
 * svarer vi med { fallback: true, reason }, så kallende funksjon kan falle
 * tilbake til DroneLog `/logs/upload`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PARSER_URL = (Deno.env.get("DJI_PARSER_URL") ?? "").replace(/\/+$/, "");
const PARSER_TOKEN = Deno.env.get("DJI_PARSER_TOKEN");

interface ProxyRequest {
  downloadUrl?: string; // DJI/DroneLog signed URL
  dronelogKey?: string; // Bearer for å hente fra DroneLog
  fileBase64?: string; // alternativ: fil sendes inline (manuell upload)
  fileName?: string;
  fields: string[]; // DroneLog-feltnavn vi vil ha med
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!PARSER_URL || !PARSER_TOKEN) {
      return jsonResp(
        { fallback: true, reason: "parser-not-configured" },
        200,
      );
    }

    // Auth — vi krever vanlig Supabase JWT for å unngå misbruk
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return jsonResp({ error: "unauthorized" }, 401);

    const body = (await req.json()) as ProxyRequest;
    if (!body.fields || body.fields.length === 0) {
      return jsonResp({ error: "fields required" }, 400);
    }

    // 1) Skaff filbytes
    let fileBytes: Uint8Array;
    let fileName = body.fileName ?? "dji.txt";

    if (body.fileBase64) {
      fileBytes = Uint8Array.from(atob(body.fileBase64), (c) =>
        c.charCodeAt(0),
      );
    } else if (body.downloadUrl) {
      const headers: Record<string, string> = {};
      if (body.dronelogKey) {
        headers.Authorization = `Bearer ${body.dronelogKey}`;
      }
      const dl = await fetch(body.downloadUrl, { headers });
      if (!dl.ok) {
        const txt = await dl.text().catch(() => "");
        console.error(
          "[dji-parse-proxy] download failed:",
          dl.status,
          txt.slice(0, 200),
        );
        return jsonResp(
          { fallback: true, reason: `download-failed-${dl.status}` },
          200,
        );
      }
      fileBytes = new Uint8Array(await dl.arrayBuffer());
      const cd = dl.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename="?([^";]+)"?/i);
      if (m) fileName = m[1];
    } else {
      return jsonResp(
        { error: "downloadUrl or fileBase64 required" },
        400,
      );
    }

    console.log(
      `[dji-parse-proxy] sending ${fileBytes.length} bytes to fly parser`,
    );

    // 2) Send til Fly-parser (ny Rust-app: returnerer { version, details, frames })
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBytes], { type: "application/octet-stream" }),
      fileName,
    );
    // Ny app ignorerer `fields` og returnerer alle frames; vi filtrerer på vår side.
    form.append("format", "json");

    const parseRes = await fetch(`${PARSER_URL}/parse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PARSER_TOKEN}` },
      body: form,
    });

    if (parseRes.status === 422) {
      const err = await parseRes.json().catch(() => ({}));
      console.warn("[dji-parse-proxy] parser unsupported:", err);
      return jsonResp(
        { fallback: true, reason: err.reason ?? "unsupported" },
        200,
      );
    }
    if (!parseRes.ok) {
      const txt = await parseRes.text().catch(() => "");
      console.error("[dji-parse-proxy] parser error:", parseRes.status, txt);
      return jsonResp(
        { fallback: true, reason: `parser-${parseRes.status}` },
        200,
      );
    }

    const parsed = await parseRes.json();
    console.log(
      `[dji-parse-proxy] parsed v${parsed.version}, ${parsed.frame_count} frames`,
    );

    // 3) Konverter normaliserte Rust frames -> DroneLog-CSV
    const csv = framesToDroneLogCsv(parsed, body.fields);
    return new Response(
      JSON.stringify({
        ok: true,
        csv,
        summary: {
          version: parsed.version,
          frameCount: parsed.frame_count,
          aircraftSN: parsed.details?.aircraft_sn,
          startTime: parsed.details?.start_time,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[dji-parse-proxy] error:", err);
    return jsonResp(
      { fallback: true, reason: `exception-${(err as Error).message}` },
      200,
    );
  }
});

function jsonResp(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Konverter dji-log-parser Frame[] -> CSV med DroneLog-kompatible kolonnenavn.
 *
 * Rust Frame-struktur (alle felt valgfrie):
 *   { custom: {...}, osd: {...}, gimbal: {...}, camera: {...},
 *     rc: {...}, battery: {...}, home: {...}, recover: {...}, app: {...} }
 *
 * Vi mapper de viktigste til DroneLog-felter som edge functions allerede vet
 * å parse via parseCsvToResult / parseCsvMinimal.
 */
function framesToDroneLogCsv(parsed: any, fields: string[]): string {
  const frames: any[] = parsed.frames ?? [];
  const details = parsed.details ?? {};

  const headerCols = [...fields];
  if (!headerCols.includes("OSD.flyTime [ms]")) {
    headerCols.unshift("OSD.flyTime [ms]");
  }

  const lines: string[] = [];
  lines.push(headerCols.map(csvEscape).join(","));

  let t = 0;
  for (const f of frames) {
    const mapped = mapFrame(f, t, details);
    const row = headerCols.map((c) => {
      let v = mapped[c];
      if (v === undefined && c.startsWith("DETAILS.")) v = mapped[c];
      return csvEscape(v);
    });
    lines.push(row.join(","));
    t += 100; // ~10 Hz, samme antagelse som tidligere parser
  }
  return lines.join("\n");
}

function mapFrame(f: any, t: number, details: any): Record<string, unknown> {
  const osd = f.osd ?? {};
  const home = f.home ?? {};
  const gimbal = f.gimbal ?? {};
  const battery = f.battery ?? {};
  const out: Record<string, unknown> = {
    "OSD.flyTime [ms]": t,
    "OSD.latitude": osd.latitude,
    "OSD.longitude": osd.longitude,
    "OSD.altitude [m]": osd.altitude,
    "OSD.height [m]": osd.height,
    "OSD.hSpeed [m/s]":
      osd.x_speed !== undefined && osd.y_speed !== undefined
        ? Math.sqrt(osd.x_speed ** 2 + osd.y_speed ** 2)
        : undefined,
    "OSD.vSpeed [m/s]": osd.z_speed !== undefined ? -osd.z_speed : undefined,
    "OSD.pitch [°]": osd.pitch,
    "OSD.roll [°]": osd.roll,
    "OSD.directionYaw [°]": osd.yaw,
    "OSD.gpsNum": osd.gps_num,
    "OSD.flycState": osd.fly_state ?? osd.flyc_state,
    "HOME.latitude": home.latitude,
    "HOME.longitude": home.longitude,
    "HOME.altitude [m]": home.altitude,
    "GIMBAL.pitch [°]": gimbal.pitch,
    "GIMBAL.roll [°]": gimbal.roll,
    "GIMBAL.yaw [°]": gimbal.yaw,
    "BATTERY.totalVoltage [V]": battery.voltage,
    "BATTERY.current [A]": battery.current,
    "BATTERY.chargeLevel [%]": battery.charge_level,
    "BATTERY.temperature [°C]": battery.temperature,
    "DETAILS.aircraftName": details.aircraft_name,
    "DETAILS.aircraftSN": details.aircraft_sn,
    "DETAILS.batterySN": details.battery_sn,
    "DETAILS.startTime": details.start_time,
  };
  // cellVoltage1..N
  const cells = battery.cell_voltages ?? battery.cells ?? [];
  if (Array.isArray(cells)) {
    cells.forEach((v: number, i: number) => {
      out[`BATTERY.cellVoltage${i + 1} [V]`] = v;
    });
    if (cells.length >= 2) {
      const valid = cells.filter((v: number) => v > 0.5 && v < 5);
      if (valid.length >= 2) {
        out["BATTERY.cellVoltageDeviation [V]"] =
          Math.max(...valid) - Math.min(...valid);
      }
    }
  }
  return out;
}

function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
