/**
 * SafeSky HMAC-SHA256-V1 Authentication Module
 * 
 * Implements the HMAC signing protocol required by SafeSky's API.
 * Uses Deno's Web Crypto API (HKDF + HMAC via crypto.subtle).
 * 
 * Reference: https://docs.safesky.app/books/safesky-api-for-uav/page/authentication
 */

const encoder = new TextEncoder();

/** Base64url encode (no padding): uses - instead of +, _ instead of /, no = padding */
function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Standard base64 encode */
function base64encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** SHA-256 hash of a string, returned as lowercase hex */
async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive KID (Key Identifier) from API key.
 * kid = base64url(SHA256("kid:" + api_key)[0:16])
 */
export async function deriveKid(apiKey: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(`kid:${apiKey}`));
  const first16 = new Uint8Array(hash).slice(0, 16);
  return base64url(first16.buffer.slice(first16.byteOffset, first16.byteOffset + first16.byteLength));
}

/**
 * Derive HMAC signing key from API key using HKDF-SHA256.
 * hmac_key = HKDF-SHA256(api_key, salt="safesky-hmac-salt-v1", info="auth-v1", len=32)
 */
export async function deriveHmacKey(apiKey: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    'HKDF',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('safesky-hmac-salt-v1'),
      info: encoder.encode('auth-v1'),
    },
    keyMaterial,
    256
  );
  return crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Generate a UUID v4 nonce */
export function generateNonce(): string {
  return crypto.randomUUID();
}

/** Generate ISO8601 UTC timestamp with milliseconds (e.g., 2025-11-12T14:30:00.000Z) */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Build the canonical request string for HMAC signature.
 * 
 * Format:
 * METHOD\n
 * path\n
 * queryString\n
 * host:hostValue\n
 * x-ss-date:timestamp\n
 * x-ss-nonce:nonce\n
 * \n
 * sha256(body)
 */
export async function buildCanonicalRequest(
  method: string,
  path: string,
  queryString: string,
  host: string,
  timestamp: string,
  nonce: string,
  body: string
): Promise<string> {
  const bodyHash = await sha256Hex(body || '');
  return [
    method.toUpperCase(),
    path,
    queryString || '',
    `host:${host}`,
    `x-ss-date:${timestamp}`,
    `x-ss-nonce:${nonce}`,
    '', // empty line before body hash
    bodyHash,
  ].join('\n');
}

/** Generate HMAC-SHA256 signature as base64 (NOT hex) */
export async function generateSignature(
  canonicalRequest: string,
  hmacKey: CryptoKey
): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(canonicalRequest));
  return base64encode(sig);
}

/**
 * Generate all required HMAC authentication headers for a SafeSky API request.
 * 
 * @param apiKey - SafeSky API key (e.g., ssk_sandbox_... or ssk_live_...)
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Full request URL including protocol, host, path, and query string
 * @param body - Request body for POST/PUT requests (default: empty string)
 * @returns Object containing all required headers
 */
export async function generateAuthHeaders(
  apiKey: string,
  method: string,
  url: string,
  body: string = ''
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const queryString = parsedUrl.search ? parsedUrl.search.substring(1) : '';

  const timestamp = generateTimestamp();
  const nonce = generateNonce();

  const [kid, hmacKey] = await Promise.all([
    deriveKid(apiKey),
    deriveHmacKey(apiKey),
  ]);

  const canonicalRequest = await buildCanonicalRequest(
    method, path, queryString, host, timestamp, nonce, body
  );

  const signature = await generateSignature(canonicalRequest, hmacKey);

  return {
    'Authorization': `SS-HMAC Credential=${kid}/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature=${signature}`,
    'X-SS-Date': timestamp,
    'X-SS-Nonce': nonce,
    'X-SS-Alg': 'SS-HMAC-SHA256-V1',
  };
}
