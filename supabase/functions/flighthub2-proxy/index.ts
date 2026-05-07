/* flighthub2-proxy v2 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── AWS SigV4 helpers (minimal, for OSS/S3-compatible upload) ───

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function signV4Put(
  endpoint: string, bucket: string, objectKey: string,
  body: Uint8Array, credentials: { access_key_id: string; access_key_secret: string; security_token: string }
): Promise<Response> {
  const url = new URL(`/${bucket}/${objectKey}`, endpoint);
  const host = url.host;
  const region = host.match(/oss-([^.]+)\./)?.[1] || host.match(/s3\.([^.]+)\./)?.[1] || "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = await sha256Hex(body);
  const contentType = "application/octet-stream";

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${credentials.security_token}\n`;

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token";

  const canonicalRequest = [
    "PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(credentials.access_key_secret, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "x-amz-security-token": credentials.security_token,
      "Authorization": authHeader,
    },
    body: body,
  });
}

// ─── Helper: Try fetching projects with both API variants ───

interface ApiVariant {
  name: string;
  listUrl: (base: string) => string;
  headerName: string;
  projectHeaderName?: string;
}

const NEW_API: ApiVariant = {
  name: "openapi-v0.1",
  listUrl: (base) => `${base}/openapi/v0.1/project?page=1&page_size=100&usage=simple`,
  headerName: "X-User-Token",
  projectHeaderName: "X-Project-Uuid",
};

const OLD_API: ApiVariant = {
  name: "manage-v1.0",
  listUrl: (base) => `${base}/manage/api/v1.0/projects?page=1&page_size=100`,
  headerName: "X-Organization-Key",
  projectHeaderName: "X-Project-Uuid",
};

const API_VARIANTS = [NEW_API, OLD_API];

async function tryListProjects(
  baseUrl: string, token: string, variant: ApiVariant,
  safeFetch: (url: string, opts: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; data: any; status: number; variant: string; bodyText: string }> {
  const url = variant.listUrl(baseUrl);
  const headers: Record<string, string> = {
    [variant.headerName]: token,
    "X-Request-Id": crypto.randomUUID(),
    "X-Language": "en",
  };

  console.log(`=== tryListProjects [${variant.name}] ===`);
  console.log("URL:", url);
  console.log("Auth header:", variant.headerName);

  const res = await safeFetch(url, { method: "GET", headers });
  const bodyText = await res.text();
  
  // Log ALL response headers for debugging
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => { respHeaders[key] = value; });
  console.log(`[${variant.name}] Status: ${res.status}, Body: ${bodyText.substring(0, 300)}`);
  console.log(`[${variant.name}] Response headers:`, JSON.stringify(respHeaders));

  let data: any = null;
  try { data = JSON.parse(bodyText); } catch { /* not JSON */ }

  // Check if this variant worked
  const isSuccess = res.ok && data?.code === 0;
  const isUnauthorized = data?.code === 200401 || res.status === 401;

  return {
    ok: isSuccess,
    data,
    status: res.status,
    variant: variant.name,
    bodyText,
  };
}

// ─── Main handler ───

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user's company
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get FlightHub 2 config
    const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
    const { data: company } = await supabase
      .from("companies")
      .select("flighthub2_base_url, parent_company_id")
      .eq("id", profile.company_id)
      .single();

    let fh2BaseUrl = ((company as any)?.flighthub2_base_url || "").trim();
    let parentCompany: any = null;
    let useParentFh2 = false;

    if ((company as any)?.parent_company_id) {
      const { data: parent } = await supabase
        .from("companies")
        .select("flighthub2_base_url, propagate_fh2_credentials")
        .eq("id", (company as any).parent_company_id)
        .single();
      parentCompany = parent;
      useParentFh2 = !!(parent as any)?.propagate_fh2_credentials;
    }

    // Decrypt token from vault table
    let fh2Token = "";
    if (encKey) {
      const { data: decrypted } = await supabase.rpc("get_fh2_token", {
        p_company_id: useParentFh2 ? (company as any).parent_company_id : profile.company_id,
        p_key: encKey,
      });
      fh2Token = (decrypted || "").trim();
    }

    // Strip accidental "Bearer " prefix
    if (fh2Token.toLowerCase().startsWith("bearer ")) {
      fh2Token = fh2Token.substring(7).trim();
    }

    if (useParentFh2 && parentCompany) {
      fh2BaseUrl = ((parentCompany as any)?.flighthub2_base_url || fh2BaseUrl).trim();
    }

    // Fallback to parent company only when inheritance is enabled
    if (!fh2Token && useParentFh2 && (company as any)?.parent_company_id) {
      if (encKey) {
        const { data: parentDecrypted } = await supabase.rpc("get_fh2_token", {
          p_company_id: (company as any).parent_company_id,
          p_key: encKey,
        });
        fh2Token = (parentDecrypted || "").trim();
      }
      if (!fh2BaseUrl) {
        fh2BaseUrl = ((parentCompany as any)?.flighthub2_base_url || "").trim();
      }
    }

    const body = await req.json();
    const { action, projectUuid, apiVersion, ...params } = body;

    // ─── Action: save-token (before token check) ───
    if (action === "save-token") {
      const tokenToSave = (params.token || "").trim().replace(/^bearer\s+/i, "");
      if (!tokenToSave) {
        return new Response(JSON.stringify({ error: "Token mangler" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!encKey) {
        return new Response(JSON.stringify({ error: "FH2_ENCRYPTION_KEY er ikke konfigurert på serveren" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: saveErr } = await supabase.rpc("save_fh2_token", {
        p_company_id: profile.company_id,
        p_token: tokenToSave,
        p_key: encKey,
      });
      if (saveErr) {
        console.error("save_fh2_token error:", saveErr);
        return new Response(JSON.stringify({ error: saveErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fh2Token) {
      return new Response(JSON.stringify({ error: "FlightHub 2 er ikke konfigurert for dette selskapet." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // If no base URL, auto-detect during test-connection; for other actions require it
    if (!fh2BaseUrl && action !== "test-connection") {
      return new Response(JSON.stringify({ error: "FlightHub 2 base URL er ikke konfigurert. Kjør 'Test tilkobling' først." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip trailing slash
    fh2BaseUrl = fh2BaseUrl.replace(/\/+$/, "");

    // Extract project_uuid from JWT
    let jwtProjectUuid = "";
    let jwtOrgUuid = "";
    let jwtPayload: any = null;
    try {
      const jwtParts = fh2Token.split(".");
      if (jwtParts.length === 3) {
        jwtPayload = JSON.parse(atob(jwtParts[1]));
        jwtProjectUuid = jwtPayload.project_uuid || "";
        jwtOrgUuid = jwtPayload.organization_uuid || "";
      }
    } catch (_) { /* ignore */ }

    // Token fingerprint for debugging (never log full token)
    const tokenFingerprint = fh2Token.length > 20
      ? `${fh2Token.substring(0, 10)}...${fh2Token.substring(fh2Token.length - 6)}`
      : `[len=${fh2Token.length}]`;
    console.log(`Token fingerprint: ${tokenFingerprint}, length: ${fh2Token.length}, org_uuid: ${jwtOrgUuid || "none"}`);

    // DNS error handling
    const safeFetch = async (url: string, opts: RequestInit) => {
      try {
        return await fetch(url, opts);
      } catch (err) {
        if (err.message?.includes("dns error") || err.message?.includes("Name or service not known")) {
          throw new Error(`DNS-oppslag feilet for ${new URL(url).hostname}. Sjekk at Base URL er korrekt.`);
        }
        throw new Error(`Nettverksfeil mot ${url}: ${err.message}`);
      }
    };

    // Determine which API variant to use (client can hint with apiVersion)
    function getVariant(): ApiVariant {
      if (apiVersion === "manage-v1.0") return OLD_API;
      if (apiVersion === "openapi-v0.1") return NEW_API;
      return NEW_API; // default
    }

    function makeHeaders(variant: ApiVariant, includeProject: boolean, forcedProjectUuid?: string): Record<string, string> {
      const h: Record<string, string> = {
        [variant.headerName]: fh2Token,
        "X-Request-Id": crypto.randomUUID(),
        "X-Language": "en",
      };
      const effectiveProjUuid = forcedProjectUuid || projectUuid || jwtProjectUuid;
      if (includeProject && effectiveProjUuid && variant.projectHeaderName) {
        h[variant.projectHeaderName] = effectiveProjUuid;
      }
      return h;
    }

    function extractListPayload(value: any): any[] {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.list)) return value.list;
      if (Array.isArray(value?.devices)) return value.devices;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.records)) return value.records;
      return [];
    }

    /**
     * DJI OpenAPI v0.1 /device returns nested objects:
     *   list: [{ gateway: { sn, callsign, device_model, ... }, drone: { sn, callsign, ... } }, ...]
     * This flattens them into individual device records.
     */
    function flattenDjiDeviceList(rawList: any[]): any[] {
      const result: any[] = [];
      for (const item of rawList) {
        if (!item || typeof item !== "object") continue;

        // DJI org/project format: { gateway: {...}, drone: {...} }
        const hasGatewayDrone = item.gateway || item.drone;
        if (hasGatewayDrone) {
          if (item.gateway) result.push({ ...item.gateway, _dji_role: "gateway" });
          if (item.drone) result.push({ ...item.drone, _dji_role: "drone" });
          continue;
        }

        // Some FH2 endpoints return: { ...device, sub_devices: [...] } or children/bind_device
        const subs = item.sub_devices || item.children || item.bind_device;
        if (Array.isArray(subs) && subs.length > 0) {
          // parent is usually a gateway/dock
          result.push({ ...item, _dji_role: item._dji_role || "gateway" });
          for (const sub of subs) {
            if (sub && typeof sub === "object") {
              result.push({ ...sub, _dji_role: sub._dji_role || "drone" });
            }
          }
          continue;
        }

        result.push(item);
      }
      return result;
    }

    function normalizeDevicePayload(device: any, project?: any): any {
      const sn = device.device_sn ?? device.sn ?? device.deviceSn ?? device.child_device_sn ?? "";
      const name = device.device_name ?? device.callsign ?? device.name ?? device.nickname ?? device.aircraft_name ?? "";
      const onlineStatus = typeof device.online_status === "number"
        ? device.online_status
        : device.device_online_status === true ? 1
        : device.device_online_status === false ? 0
        : device.status === "online" || device.is_online === true ? 1 : 0;

      let deviceModel = device.device_model;
      if (!deviceModel || typeof deviceModel !== "object") {
        deviceModel = {
          model: device.device_model_name ?? device.model_name ?? device.model ?? device.product_name,
          key: device.device_model_key ?? device.model_key,
        };
      }

      let deviceType = device.type ?? device.device_type ?? device.product_type;
      if (deviceType == null) {
        const cls = deviceModel?.class || device._dji_role;
        if (cls === "drone") deviceType = 0;
        else if (cls === "airport" || cls === "gateway" || cls === "dock") deviceType = 1;
        else if (cls === "rc") deviceType = 56;
      }

      return {
        ...device,
        device_sn: sn,
        device_name: name,
        device_model: deviceModel,
        online_status: onlineStatus,
        type: deviceType,
        firmware_version: device.firmware_version ?? device.firmware ?? device.firmwareVersion,
        mode_code: device.mode_code,
        camera_list: device.camera_list,
        project_uuid: project?.uuid ?? project?.project_uuid ?? project?.workspace_uuid ?? device.project_uuid ?? device.workspace_uuid,
        project_name: project?.name ?? project?.workspace_name ?? project?.project_name ?? device.project_name ?? device.workspace_name,
      };
    }

    // ─── Action: test-connection ───
    if (action === "test-connection") {
      const REGION_URLS = [
        "https://es-flight-api-eu.djigate.com",
        "https://es-flight-api-us.djigate.com",
        "https://es-flight-api-cn.djigate.com",
      ];
      // If we have a base URL, try it first; otherwise try all regions
      const urlsToTry = fh2BaseUrl
        ? [fh2BaseUrl, ...REGION_URLS.filter(u => u !== fh2BaseUrl.replace(/\/+$/, "").toLowerCase())]
        : REGION_URLS;

      const result: any = {
        server_ok: false,
        token_ok: false,
        api_version: null,
        project_count: 0,
        project_names: [],
      };

      for (const baseUrl of urlsToTry) {
        for (const variant of API_VARIANTS) {
          try {
            const attempt = await tryListProjects(baseUrl, fh2Token, variant, safeFetch);
            if (attempt.ok) {
              result.server_ok = true;
              result.token_ok = true;
              result.api_version = variant.name;

              // Extract project names
              const projectList = attempt.data?.data?.list || attempt.data?.data || [];
              result.project_count = projectList.length;
              result.project_names = projectList.map((p: any) => p.workspace_name || p.name || p.project_name || "Ukjent").filter(Boolean);

              // Auto-save working base URL
              const normalizedUrl = baseUrl.replace(/\/+$/, "");
              result.working_base_url = normalizedUrl;
              if (normalizedUrl !== (fh2BaseUrl || "").replace(/\/+$/, "")) {
                result.alternate_region_worked = true;
              }
              await supabase
                .from("companies")
                .update({ flighthub2_base_url: normalizedUrl })
                .eq("id", useParentFh2 ? (company as any).parent_company_id : profile.company_id);
              console.log(`✅ ${variant.name} worked on ${baseUrl}, saved base URL`);
              break;
            }
          } catch (err) {
            console.log(`❌ ${baseUrl} [${variant.name}] error: ${err.message}`);
          }
        }
        if (result.token_ok) break;

        // At least check if first URL server responds
        if (!result.server_ok) {
          try {
            const statusRes = await safeFetch(`${baseUrl}/openapi/v0.1/system_status`, {
              method: "GET", headers: { "X-Request-Id": crypto.randomUUID() }
            });
            if (statusRes.ok) result.server_ok = true;
          } catch (_) { /* ignore */ }
        }
      }

      // JWT diagnostics
      if (jwtPayload) {
        result.jwt_info = {
          is_jwt: true,
          organization_uuid: jwtPayload.organization_uuid || null,
          exp: jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null,
          expired: jwtPayload.exp ? (jwtPayload.exp * 1000 < Date.now()) : null,
        };
      }

      return new Response(JSON.stringify(result), {
        status: (result.server_ok || result.token_ok) ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: list-projects ───
    if (action === "list-projects") {
      // Try both variants
      for (const variant of API_VARIANTS) {
        try {
          const attempt = await tryListProjects(fh2BaseUrl, fh2Token, variant, safeFetch);
          if (attempt.ok) {
            console.log(`list-projects: ✅ ${variant.name} worked`);
            return new Response(JSON.stringify({ ...attempt.data, _api_version: variant.name }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (err) {
          console.log(`list-projects: ${variant.name} error: ${err.message}`);
        }
      }

      // Both failed
      return new Response(JSON.stringify({
        error: "Kunne ikke hente prosjekter. Begge API-varianter (ny og gammel) returnerte feil. Sjekk at organisasjonsnøkkelen er korrekt.",
        code: -1,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── For remaining actions, try both API variants ───
    const variant = getVariant();
    const projectHeadersForAction = makeHeaders(variant, true);

    // ─── Action: get-sts-token ───
    if (action === "get-sts-token") {
      const urls = [
        { url: `${fh2BaseUrl}/openapi/v0.1/project/sts-token`, v: NEW_API },
        { url: `${fh2BaseUrl}/manage/api/v1.0/project/sts-token`, v: OLD_API },
      ];
      for (const { url, v } of urls) {
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`get-sts-token [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`get-sts-token [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token fra FlightHub 2" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: upload-route ───
    if (action === "upload-route") {
      const { kmzBase64, routeName } = params;

      // Step 1: Get STS token (try both variants)
      let stsData: any = null;
      let workingVariant = NEW_API;
      for (const v of API_VARIANTS) {
        const stsUrl = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/project/sts-token`
          : `${fh2BaseUrl}/manage/api/v1.0/project/sts-token`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(stsUrl, { method: "GET", headers: h });
          const d = await res.json();
          if (d.code === 0) {
            stsData = d;
            workingVariant = v;
            break;
          }
        } catch (_) { /* try next */ }
      }

      if (!stsData || stsData.code !== 0) {
        return new Response(JSON.stringify({ error: "Kunne ikke hente STS-token", detail: stsData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { endpoint, bucket, credentials, object_key_prefix } = stsData.data;
      const objectKey = `${object_key_prefix}/${crypto.randomUUID()}/wayline.kmz`;

      // Step 2: Upload KMZ with SigV4
      const kmzBinary = Uint8Array.from(atob(kmzBase64), (c) => c.charCodeAt(0));
      console.log("Uploading KMZ to:", endpoint, "bucket:", bucket, "key:", objectKey, "size:", kmzBinary.length);

      try {
        const ossRes = await signV4Put(endpoint, bucket, objectKey, kmzBinary, credentials);
        const ossBody = await ossRes.text();
        console.log("OSS upload status:", ossRes.status, "body:", ossBody.substring(0, 300));

        if (!ossRes.ok) {
          return new Response(JSON.stringify({
            error: "OSS-opplasting feilet",
            oss_status: ossRes.status,
            oss_body: ossBody.substring(0, 500),
          }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (uploadErr: any) {
        return new Response(JSON.stringify({ error: `Feil ved opplasting: ${uploadErr.message}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 3: Notify FlightHub 2
      const finishUrl = workingVariant.name === "openapi-v0.1"
        ? `${fh2BaseUrl}/openapi/v0.1/wayline/finish-upload`
        : `${fh2BaseUrl}/manage/api/v1.0/wayline/finish-upload`;
      const finishHeaders = { ...makeHeaders(workingVariant, true), "Content-Type": "application/json" };
      const finishBody: Record<string, unknown> = {
        name: routeName || "Avisafe Route",
        object_key: objectKey,
      };
      // Include device_model_key if provided by client (e.g. "0-67-0" for M30)
      if (params.deviceModelKey) {
        finishBody.device_model_key = params.deviceModelKey;
      }
      console.log("[finish-upload] URL:", finishUrl);
      console.log("[finish-upload] body:", JSON.stringify(finishBody));
      const finishRes = await safeFetch(finishUrl, {
        method: "POST",
        headers: finishHeaders,
        body: JSON.stringify(finishBody),
      });
      const finishText = await finishRes.text();
      console.log("[finish-upload] status:", finishRes.status);
      console.log("[finish-upload] response:", finishText.substring(0, 2000));
      let finishData;
      try { finishData = JSON.parse(finishText); } catch { finishData = { raw: finishText }; }
      return new Response(JSON.stringify(finishData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: create-annotation ───
    if (action === "create-annotation") {
      const { name, desc, geoJson, annotationType } = params;

      for (const v of API_VARIANTS) {
        const annotUrl = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/map/element`
          : `${fh2BaseUrl}/manage/api/v1.0/map/element`;
        try {
          const h = { ...makeHeaders(v, true), "Content-Type": "application/json" };
          const res = await safeFetch(annotUrl, {
            method: "POST",
            headers: h,
            body: JSON.stringify({
              name: name || "SORA Buffer Zone",
              desc: desc || "Generated by Avisafe",
              resource: { type: annotationType ?? 2, content: geoJson },
            }),
          });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`create-annotation [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`create-annotation [${v.name}] error: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({ error: "Kunne ikke opprette annotasjon" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: list-devices (always merge org + all projects) ───
    if (action === "list-devices") {
      const diagnostics: any[] = [];
      const devicesByKey = new Map<string, any>();
      let workingVariant: string | null = null;

      for (const v of API_VARIANTS) {
        const orgUrl = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device`
          : `${fh2BaseUrl}/manage/api/v1.0/device?page=1&page_size=200`;

        // Step A: org-level device list
        try {
          const orgHeaders = makeHeaders(v, false);
          const orgRes = await safeFetch(orgUrl, { method: "GET", headers: orgHeaders });
          const orgText = await orgRes.text();
          let orgData: any = null;
          try { orgData = JSON.parse(orgText); } catch { /* ignore */ }

          const rawOrgList = extractListPayload(orgData?.data);
          const flatList = flattenDjiDeviceList(rawOrgList);
          const orgList = flatList.map((device: any) => normalizeDevicePayload(device));

          diagnostics.push({
            variant: v.name,
            stage: "org-device",
            url: orgUrl,
            status: orgRes.status,
            code: orgData?.code ?? null,
            raw_list_length: rawOrgList.length,
            flat_list_length: flatList.length,
            normalized_count: orgList.length,
            message: orgData?.message ?? null,
            raw_body_preview: orgText.substring(0, 500),
          });
          console.log(`list-devices [${v.name}] org-device status=${orgRes.status} code=${orgData?.code} norm=${orgList.length}`);

          if (orgRes.ok && orgData?.code === 0) {
            workingVariant = v.name;
            for (const device of orgList) {
              const key = device.device_sn || device.device_name;
              if (key) devicesByKey.set(key, device);
            }
          }
        } catch (err: any) {
          diagnostics.push({ variant: v.name, stage: "org-device", error: err.message });
          console.log(`list-devices [${v.name}] org error: ${err.message}`);
        }

        // Step B: ALWAYS attempt project-level merge regardless of org outcome
        try {
          const projectAttempt = await tryListProjects(fh2BaseUrl, fh2Token, v, safeFetch);
          const projects = extractListPayload(projectAttempt.data?.data);

          diagnostics.push({
            variant: v.name,
            stage: "project-list",
            status: projectAttempt.status,
            code: projectAttempt.data?.code ?? null,
            count: projects.length,
            message: projectAttempt.data?.message ?? null,
          });

          if (projectAttempt.ok && projects.length > 0 && v.projectHeaderName) {
            workingVariant = workingVariant || v.name;
            const projectDeviceUrl = v.name === "openapi-v0.1"
              ? `${fh2BaseUrl}/openapi/v0.1/project/device?page=1&page_size=200`
              : `${fh2BaseUrl}/manage/api/v1.0/project/device?page=1&page_size=200`;

            for (const project of projects) {
              const currentProjectUuid = project.uuid || project.project_uuid || project.workspace_uuid;
              if (!currentProjectUuid) continue;

              try {
                const projectHeaders = makeHeaders(v, true, currentProjectUuid);
                const projectRes = await safeFetch(projectDeviceUrl, { method: "GET", headers: projectHeaders });
                const projectText = await projectRes.text();
                let projectData: any = null;
                try { projectData = JSON.parse(projectText); } catch { /* ignore */ }

                const projectDevices = flattenDjiDeviceList(extractListPayload(projectData?.data))
                  .map((device: any) => normalizeDevicePayload(device, project));

                diagnostics.push({
                  variant: v.name,
                  stage: "project-device",
                  project_uuid: currentProjectUuid,
                  project_name: project.name || project.workspace_name || project.project_name,
                  status: projectRes.status,
                  code: projectData?.code ?? null,
                  count: projectDevices.length,
                  message: projectData?.message ?? null,
                  raw_body_preview: projectText.substring(0, 400),
                });
                console.log(`list-devices [${v.name}] project=${currentProjectUuid} count=${projectDevices.length}`);

                if (projectRes.ok && projectData?.code === 0) {
                  for (const device of projectDevices) {
                    const key = device.device_sn || `${device.device_name}-${currentProjectUuid}`;
                    if (key && !devicesByKey.has(key)) {
                      devicesByKey.set(key, device);
                    }
                  }
                }
              } catch (err: any) {
                diagnostics.push({
                  variant: v.name,
                  stage: "project-device",
                  project_uuid: currentProjectUuid,
                  error: err.message,
                });
              }
            }
          }
        } catch (err: any) {
          diagnostics.push({ variant: v.name, stage: "project-list", error: err.message });
        }

        // If we got devices on this variant, stop trying the other variant
        if (devicesByKey.size > 0) break;
      }

      if (workingVariant !== null) {
        return new Response(JSON.stringify({
          code: 0,
          message: "",
          data: { list: Array.from(devicesByKey.values()) },
          _api_version: workingVariant,
          _source: "merged-org-and-projects",
          diagnostics,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        ok: false,
        error: "Kunne ikke hente enheter fra FlightHub 2",
        diagnostics,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: debug-endpoint (raw sandbox for any FH2 API path) ───
    if (action === "debug-endpoint") {
      const { endpoint, method = "GET", projectUuid: dbgProjectUuid, body: dbgBody } = params;
      if (!endpoint || typeof endpoint !== "string") {
        return new Response(JSON.stringify({ error: "endpoint (string) er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cleanEndpoint = endpoint.replace(/^\/+/, "");
      const variants = [
        { name: "openapi-v1.0", base: `${fh2BaseUrl}/openapi/v1.0/${cleanEndpoint}`, v: NEW_API },
        { name: "openapi-v0.1", base: `${fh2BaseUrl}/openapi/v0.1/${cleanEndpoint}`, v: NEW_API },
        { name: "manage-v1.0", base: `${fh2BaseUrl}/manage/api/v1.0/${cleanEndpoint}`, v: OLD_API },
      ];
      const results: Record<string, any> = {};
      for (const { name, base, v } of variants) {
        try {
          const h: Record<string, string> = { ...makeHeaders(v, true, dbgProjectUuid) };
          if (method !== "GET" && method !== "HEAD") h["Content-Type"] = "application/json";
          console.log(`[debug-endpoint] ${method} ${base}`);
          const res = await safeFetch(base, {
            method,
            headers: h,
            body: dbgBody && method !== "GET" ? JSON.stringify(dbgBody) : undefined,
          });
          const text = await res.text();
          results[name] = {
            url: base,
            status: res.status,
            body: text.substring(0, 5000),
          };
        } catch (err: any) {
          results[name] = { url: base, error: err.message };
        }
      }
      return new Response(JSON.stringify({ ok: true, endpoint, method, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: start-livestream ───
    if (action === "start-livestream") {
      const {
        deviceSn,
        cameraIndex,
        qualityType = "adaptive",
        videoExpire = 7200,
        projectUuid: lsProjectUuidParam,
      } = params;
      if (!deviceSn || !cameraIndex) {
        return new Response(JSON.stringify({ error: "deviceSn og cameraIndex er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Map UI value -> DJI string enum (per OpenAPI spec).
      const qualityStringMap: Record<string, string> = {
        adaptive: "adaptive", auto: "adaptive",
        smooth: "smooth",
        hd: "high_definition", high_definition: "high_definition",
        "ultra-hd": "ultra_high_definition", ultrahd: "ultra_high_definition",
        ultra_high_definition: "ultra_high_definition",
      };
      const qStr = qualityStringMap[String(qualityType).toLowerCase()] ?? "adaptive";

      // ── Auto-resolve project_uuid if not provided ──
      let lsProjectUuid: string | undefined = lsProjectUuidParam || projectUuid || jwtProjectUuid || undefined;
      const projectResolveLog: any = {
        sourceFromClient: !!lsProjectUuidParam,
        sourceFromJwt: !lsProjectUuidParam && !!jwtProjectUuid,
      };

      if (!lsProjectUuid) {
        try {
          console.log(`[start-livestream] No projectUuid provided — auto-resolving via /openapi/v0.1/project + /project/device`);
          const listRes = await tryListProjects(fh2BaseUrl, fh2Token, NEW_API, safeFetch);
          const projects = listRes.data?.data?.list || listRes.data?.data || [];
          projectResolveLog.projectsFound = Array.isArray(projects) ? projects.length : 0;
          projectResolveLog.tried = [];

          let matched: string | undefined;
          if (Array.isArray(projects)) {
            for (const p of projects) {
              const pUuid = p.uuid ?? p.project_uuid ?? p.workspace_uuid;
              if (!pUuid) continue;
              const devUrl = `${fh2BaseUrl}/openapi/v0.1/project/device?project_uuid=${encodeURIComponent(pUuid)}&page=1&page_size=200`;
              try {
                const h = makeHeaders(NEW_API, true, pUuid);
                const dr = await safeFetch(devUrl, { method: "GET", headers: h });
                const dt = await dr.text();
                let dj: any = null;
                try { dj = JSON.parse(dt); } catch { /* ignore */ }
                const rawList = dj?.data?.list || dj?.data || [];
                const flat = flattenDjiDeviceList(Array.isArray(rawList) ? rawList : []);
                const found = flat.some((d: any) => {
                  const sn = d.device_sn ?? d.sn ?? d.child_device_sn;
                  return sn === deviceSn;
                });
                projectResolveLog.tried.push({
                  projectUuid: pUuid,
                  projectName: p.workspace_name ?? p.name ?? p.project_name,
                  status: dr.status,
                  deviceCount: flat.length,
                  matched: found,
                });
                if (found) { matched = pUuid; break; }
              } catch (e: any) {
                projectResolveLog.tried.push({ projectUuid: pUuid, error: e?.message });
              }
            }
          }

          if (matched) {
            lsProjectUuid = matched;
          } else if (Array.isArray(projects) && projects.length > 0) {
            const first = projects[0];
            lsProjectUuid = first.uuid ?? first.project_uuid ?? first.workspace_uuid;
            projectResolveLog.fallbackToFirst = true;
          }
          projectResolveLog.resolved = lsProjectUuid || null;
          console.log(`[start-livestream] Auto-resolve result:`, JSON.stringify(projectResolveLog));
        } catch (e: any) {
          projectResolveLog.error = e?.message;
          console.log(`[start-livestream] Auto-resolve failed: ${e?.message}`);
        }
      }

      const baseBody = {
        sn: deviceSn,
        camera_index: cameraIndex,
        video_expire: Number(videoExpire) || 7200,
      };

      // Only v0.1 path is valid (v1.0 + manage paths returned 404).
      const variants: { name: string; path: string; v: ApiVariant; field: "video_quality" | "quality_type" }[] = [
        { name: "openapi-v0.1+video_quality", path: "/openapi/v0.1/live-stream/start", v: NEW_API, field: "video_quality" },
        { name: "openapi-v0.1+quality_type",  path: "/openapi/v0.1/live-stream/start", v: NEW_API, field: "quality_type" },
      ];

      const attempts: any[] = [];
      console.log(`[start-livestream] sn=${deviceSn} camera=${cameraIndex} quality=${qStr} projectUuid=${lsProjectUuid || "(none)"}`);

      for (const pv of variants) {
        const url = `${fh2BaseUrl}${pv.path}`;
        const body = { ...baseBody, [pv.field]: qStr };
        try {
          const h: Record<string, string> = {
            ...makeHeaders(pv.v, true, lsProjectUuid),
            "Content-Type": "application/json",
          };
          console.log(`[start-livestream] POST ${url} field=${pv.field} projectHeader=${h["X-Project-Uuid"] || "(missing)"} body=${JSON.stringify(body)}`);
          const res = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
          const text = await res.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* keep text */ }
          attempts.push({
            variant: pv.name,
            url,
            field: pv.field,
            projectUuidSent: h["X-Project-Uuid"] || null,
            status: res.status,
            code: json?.code ?? null,
            message: json?.message ?? null,
            body: text.substring(0, 2000),
          });
          if (json && json.code === 0 && json.data?.url) {
            return new Response(JSON.stringify({
              ok: true,
              url: json.data.url,
              urlType: json.data.url_type,
              expireTs: json.data.expire_ts,
              variant: pv.name,
              raw: json,
              attempts,
              projectResolve: projectResolveLog,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } catch (err: any) {
          attempts.push({ variant: pv.name, url, field: pv.field, error: err.message });
        }
      }
      return new Response(JSON.stringify({
        ok: false,
        error: "Kunne ikke starte live stream",
        deviceSn,
        cameraIndex,
        qualityType: qStr,
        projectUuid: lsProjectUuid || null,
        projectResolve: projectResolveLog,
        attempts,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Action: device-state ───
    if (action === "device-state") {
      const { deviceSn } = params;
      if (!deviceSn) {
        return new Response(JSON.stringify({ error: "deviceSn er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device/${encodeURIComponent(deviceSn)}/state`
          : `${fh2BaseUrl}/manage/api/v1.0/device/${encodeURIComponent(deviceSn)}/state`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`device-state [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`device-state [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente enhetsstatus" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: device-hms ───
    if (action === "device-hms") {
      const { deviceSnList } = params;
      if (!deviceSnList) {
        return new Response(JSON.stringify({ error: "deviceSnList er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/device/hms?device_sn_list=${encodeURIComponent(deviceSnList)}`
          : `${fh2BaseUrl}/manage/api/v1.0/device/hms?device_sn_list=${encodeURIComponent(deviceSnList)}`;
        try {
          const h = makeHeaders(v, true);
          const res = await safeFetch(url, { method: "GET", headers: h });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`device-hms [${v.name}]: code=${data.code}`);
        } catch (err) {
          console.log(`device-hms [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke hente HMS-data" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: add-project-member ───
    if (action === "add-project-member") {
      const { userId, role, nickname } = params;
      if (!projectUuid || !userId) {
        return new Response(JSON.stringify({ error: "projectUuid og userId er påkrevd" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const v of API_VARIANTS) {
        const url = v.name === "openapi-v0.1"
          ? `${fh2BaseUrl}/openapi/v0.1/project/member`
          : `${fh2BaseUrl}/manage/api/v1.0/project/member`;
        try {
          const h = { ...makeHeaders(v, true), "Content-Type": "application/json" };
          // Ensure project header is set for this specific project
          if (v.projectHeaderName) h[v.projectHeaderName] = projectUuid;
          const res = await safeFetch(url, {
            method: "PUT",
            headers: h,
            body: JSON.stringify({
              user_id: userId,
              role: role || "project-member",
              nickname: nickname || "",
            }),
          });
          const data = await res.json();
          if (data.code === 0) {
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.log(`add-project-member [${v.name}]: code=${data.code}, msg=${data.message}`);
        } catch (err) {
          console.log(`add-project-member [${v.name}] error: ${err.message}`);
        }
      }
      return new Response(JSON.stringify({ error: "Kunne ikke legge til personell i prosjektet" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: test-device-api (raw debug, no normalization) ───
    if (action === "test-device-api") {
      const testSn = params.deviceSn || "1581F8DBW255D00A2M0U";
      const results: Record<string, any> = {};

      // 0. GET /system_status
      try {
        const url = `${fh2BaseUrl}/openapi/v0.1/system_status`;
        const h = makeHeaders(NEW_API, false);
        console.log(`[test-device-api] GET ${url}`);
        const res = await safeFetch(url, { method: "GET", headers: h });
        const text = await res.text();
        results.system_status = { status: res.status, body: text.substring(0, 3000) };
      } catch (err: any) {
        results.system_status = { error: err.message };
      }

      // 1. GET /device (org-level device list)
      try {
        const url = `${fh2BaseUrl}/openapi/v0.1/device`;
        const h = makeHeaders(NEW_API, false);
        console.log(`[test-device-api] GET ${url}`);
        const res = await safeFetch(url, { method: "GET", headers: h });
        const text = await res.text();
        results.device_list = { status: res.status, body: text.substring(0, 3000) };
      } catch (err: any) {
        results.device_list = { error: err.message };
      }

      // 2. GET /device/hms
      try {
        const url = `${fh2BaseUrl}/openapi/v0.1/device/hms?device_sn_list=${encodeURIComponent(testSn)}`;
        const h = makeHeaders(NEW_API, true);
        console.log(`[test-device-api] GET ${url}`);
        const res = await safeFetch(url, { method: "GET", headers: h });
        const text = await res.text();
        results.device_hms = { status: res.status, body: text.substring(0, 3000) };
      } catch (err: any) {
        results.device_hms = { error: err.message };
      }

      // 3. GET /device/{sn}/state
      try {
        const url = `${fh2BaseUrl}/openapi/v0.1/device/${encodeURIComponent(testSn)}/state`;
        const h = makeHeaders(NEW_API, true);
        console.log(`[test-device-api] GET ${url}`);
        const res = await safeFetch(url, { method: "GET", headers: h });
        const text = await res.text();
        results.device_state = { status: res.status, body: text.substring(0, 3000) };
      } catch (err: any) {
        results.device_state = { error: err.message };
      }

      // 4. GET /project/device for ALL projects
      try {
        const projUrl = `${fh2BaseUrl}/openapi/v0.1/project`;
        const projH = makeHeaders(NEW_API, false);
        console.log(`[test-device-api] GET ${projUrl} (fetching all projects)`);
        const projRes = await safeFetch(projUrl, { method: "GET", headers: projH });
        const projData = await projRes.json();
        const projects = projData?.data?.list || projData?.data || [];
        const projectList = Array.isArray(projects) ? projects : [];

        const allProjects: any[] = [];
        for (const p of projectList) {
          const uuid = p.project_uuid || p.uuid || p.id;
          const name = p.name || p.project_name || "?";
          if (!uuid) { allProjects.push({ name, error: "no uuid" }); continue; }
          try {
            const url = `${fh2BaseUrl}/openapi/v0.1/project/device`;
            const h = makeHeaders(NEW_API, true, uuid);
            console.log(`[test-device-api] project device: ${name} (${uuid})`);
            const res = await safeFetch(url, { method: "GET", headers: h });
            const text = await res.text();
            let deviceCount = 0;
            try { const parsed = JSON.parse(text); deviceCount = parsed?.data?.list?.length ?? 0; } catch {}
            allProjects.push({ uuid, name, status: res.status, device_count: deviceCount, body: text.substring(0, 500) });
          } catch (err: any) {
            allProjects.push({ uuid, name, error: err.message });
          }
        }
        results.all_projects = allProjects;
        results.project_count = projectList.length;
      } catch (err: any) {
        results.all_projects = { error: err.message };
      }

      return new Response(JSON.stringify({ ok: true, testSn, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flighthub2-proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
