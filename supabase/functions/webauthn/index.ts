import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "https://esm.sh/@simplewebauthn/server@13.1.1";
import { isoBase64URL } from "https://esm.sh/@simplewebauthn/server@13.1.1/helpers";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RP_NAME = "AviSafe";
// Allow multiple origins for dev/prod
const ALLOWED_ORIGINS = [
  "https://app.avisafe.no",
  "https://login.avisafe.no",
  "https://avisafev2.lovable.app",
];

function getRpId(origin: string): string {
  if (origin.includes("avisafe.no")) return "avisafe.no";
  if (origin.includes("lovable.app")) return "avisafev2.lovable.app";
  return "localhost";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = await req.json();
    const action = body.action as string;
    const origin = req.headers.get("origin") || "https://app.avisafe.no";
    const rpID = getRpId(origin);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ──── REGISTER OPTIONS ────
    if (action === "register-options") {
      // Requires authenticated user
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) return json({ error: "Unauthorized" }, 401);

      const userId = user.id;
      const userEmail = user.email || "";

      // Get existing passkeys for this user
      const { data: existingKeys } = await supabaseAdmin
        .from("passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId);

      const excludeCredentials = (existingKeys || []).map((k: any) => ({
        id: k.credential_id,
        type: "public-key" as const,
        transports: k.transports || [],
      }));

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userID: new TextEncoder().encode(userId),
        userName: userEmail,
        userDisplayName: userEmail,
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "preferred",
        },
      });

      // Store challenge temporarily (encode in response, verify on return)
      // We sign the challenge with a HMAC so the client can't tamper
      const challengeData = JSON.stringify({
        challenge: options.challenge,
        userId,
        ts: Date.now(),
      });
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(challengeData));
      const signedChallenge = btoa(challengeData) + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));

      return json({ options, signedChallenge });
    }

    // ──── REGISTER VERIFY ────
    if (action === "register-verify") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) return json({ error: "Unauthorized" }, 401);

      const userId = user.id;
      const { credential, signedChallenge, deviceName } = body;

      // Verify signed challenge
      const [b64Data, b64Sig] = signedChallenge.split(".");
      const challengeJson = atob(b64Data);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const sigBytes = Uint8Array.from(atob(b64Sig), (c) => c.charCodeAt(0));
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        sigBytes,
        new TextEncoder().encode(challengeJson),
      );
      if (!valid) return json({ error: "Invalid challenge" }, 400);

      const challengeData = JSON.parse(challengeJson);
      if (challengeData.userId !== userId) return json({ error: "User mismatch" }, 400);
      if (Date.now() - challengeData.ts > 5 * 60 * 1000) return json({ error: "Challenge expired" }, 400);

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: [...ALLOWED_ORIGINS, origin],
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return json({ error: "Verification failed" }, 400);
      }

      const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Store in database
      const { error: insertError } = await supabaseAdmin.from("passkeys").insert({
        user_id: userId,
        credential_id: cred.id,
        public_key: isoBase64URL.fromBuffer(cred.publicKey),
        counter: Number(cred.counter),
        device_name: deviceName || null,
        transports: credential.response.transports || [],
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        return json({ error: "Could not save passkey" }, 500);
      }

      return json({ verified: true });
    }

    // ──── LOGIN OPTIONS (legacy, email-based) ────
    if (action === "login-options") {
      const { email } = body;

      // Look up user by email
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      if (userError) return json({ error: "Server error" }, 500);

      const matchedUser = userData.users.find(
        (u: any) => u.email?.toLowerCase() === email?.toLowerCase(),
      );
      if (!matchedUser) return json({ error: "No passkeys found" }, 404);

      // Get user's passkeys
      const { data: passkeys } = await supabaseAdmin
        .from("passkeys")
        .select("credential_id, transports")
        .eq("user_id", matchedUser.id);

      if (!passkeys || passkeys.length === 0) {
        return json({ error: "No passkeys found" }, 404);
      }

      const allowCredentials = passkeys.map((pk: any) => ({
        id: pk.credential_id,
        type: "public-key" as const,
        transports: pk.transports || [],
      }));

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      });

      // Sign challenge
      const challengeData = JSON.stringify({
        challenge: options.challenge,
        userId: matchedUser.id,
        ts: Date.now(),
      });
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(challengeData));
      const signedChallenge =
        btoa(challengeData) + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));

      return json({ options, signedChallenge });
    }

    // ──── LOGIN OPTIONS DISCOVERABLE (no email needed) ────
    if (action === "login-options-discoverable") {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
        // No allowCredentials → browser shows all available passkeys for this RP
      });

      // Sign challenge without userId (we don't know it yet)
      const challengeData = JSON.stringify({
        challenge: options.challenge,
        ts: Date.now(),
      });
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(challengeData));
      const signedChallenge =
        btoa(challengeData) + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));

      return json({ options, signedChallenge });
    }

    // ──── LOGIN VERIFY ────
    if (action === "login-verify") {
      const { credential, signedChallenge } = body;

      // Verify signed challenge
      const [b64Data, b64Sig] = signedChallenge.split(".");
      const challengeJson = atob(b64Data);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(0, 32)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const sigBytes = Uint8Array.from(atob(b64Sig), (c) => c.charCodeAt(0));
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        sigBytes,
        new TextEncoder().encode(challengeJson),
      );
      if (!valid) return json({ error: "Invalid challenge" }, 400);

      const challengeData = JSON.parse(challengeJson);
      if (Date.now() - challengeData.ts > 5 * 60 * 1000) return json({ error: "Challenge expired" }, 400);

      // For discoverable credentials, userId comes from the stored credential, not the challenge
      const credentialIdBase64 = credential.id;
      const { data: storedCred } = await supabaseAdmin
        .from("passkeys")
        .select("*")
        .eq("credential_id", credentialIdBase64)
        .single();

      // If challenge had a userId (legacy flow), verify it matches
      if (challengeData.userId && storedCred && storedCred.user_id !== challengeData.userId) {
        return json({ error: "User mismatch" }, 400);
      }

      const userId = storedCred?.user_id;

      if (!storedCred) return json({ error: "Credential not found" }, 400);

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: [...ALLOWED_ORIGINS, origin],
        expectedRPID: rpID,
        credential: {
          id: storedCred.credential_id,
          publicKey: isoBase64URL.toBuffer(storedCred.public_key),
          counter: Number(storedCred.counter),
          transports: storedCred.transports || [],
        },
      });

      if (!verification.verified) {
        return json({ error: "Authentication failed" }, 400);
      }

      // Update counter
      await supabaseAdmin
        .from("passkeys")
        .update({ counter: Number(verification.authenticationInfo.newCounter) })
        .eq("id", storedCred.id);

      // Generate a magic link token for the user
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError || !userData.user?.email) {
        return json({ error: "User not found" }, 500);
      }

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
      });

      if (linkError || !linkData) {
        console.error("Generate link error:", linkError);
        return json({ error: "Could not generate login token" }, 500);
      }

      // Extract the token from the generated link
      const linkUrl = new URL(linkData.properties.action_link);
      const token = linkUrl.searchParams.get("token");
      const tokenHash = linkData.properties.hashed_token;

      return json({
        verified: true,
        email: userData.user.email,
        token_hash: tokenHash,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("WebAuthn error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
