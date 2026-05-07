import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
  PushMessageError,
  type PushSubscription as WebPushSubscription,
} from "jsr:@negrel/webpush@0.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

interface DbPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Convert base64url to Uint8Array
function base64urlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Convert Uint8Array to base64url
function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Convert VAPID keys from base64url format to JWK format
function vapidKeysToJwk(
  publicKeyBase64url: string,
  privateKeyBase64url: string
): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  // Public key is in uncompressed format (65 bytes: 0x04 || x || y)
  const publicKeyRaw = base64urlToUint8Array(publicKeyBase64url);
  
  if (publicKeyRaw.length !== 65 || publicKeyRaw[0] !== 0x04) {
    throw new Error(`Invalid VAPID public key format. Expected 65 bytes starting with 0x04, got ${publicKeyRaw.length} bytes`);
  }
  
  const x = publicKeyRaw.slice(1, 33);
  const y = publicKeyRaw.slice(33, 65);
  
  const xBase64url = uint8ArrayToBase64url(x);
  const yBase64url = uint8ArrayToBase64url(y);
  
  const publicJwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: xBase64url,
    y: yBase64url,
  };
  
  const privateJwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: xBase64url,
    y: yBase64url,
    d: privateKeyBase64url,
  };
  
  return { publicKey: publicJwk, privateKey: privateJwk };
}

// Create application server from VAPID keys
async function createAppServer(
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<ApplicationServer> {
  // Convert base64url keys to JWK format
  const jwkKeys = vapidKeysToJwk(vapidPublicKey, vapidPrivateKey);
  
  console.log('JWK public key created with x length:', jwkKeys.publicKey.x?.length);
  console.log('JWK private key created with d length:', jwkKeys.privateKey.d?.length);
  
  // Import keys using the library's importVapidKeys function
  const vapidKeys = await importVapidKeys(jwkKeys, { extractable: false });
  
  return await ApplicationServer.new({
    contactInformation: vapidSubject,
    vapidKeys,
  });
}

// Send push notification using the webpush library
async function sendPush(
  appServer: ApplicationServer,
  subscription: DbPushSubscription,
  payload: PushPayload
): Promise<{ success: boolean; statusCode?: number; error?: string; isGone?: boolean }> {
  try {
    // Convert database subscription to WebPush subscription format
    const webPushSub: WebPushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };
    
    // Create subscriber
    const subscriber = appServer.subscribe(webPushSub);
    
    // Send the notification with encrypted payload
    const payloadJson = JSON.stringify(payload);
    await subscriber.pushTextMessage(payloadJson, {});
    
    console.log(`Push sent successfully to ${subscription.user_id}`);
    return { success: true, statusCode: 201 };
  } catch (error) {
    // Check if it's a PushMessageError (from the library)
    if (error instanceof PushMessageError) {
      const statusCode = error.response?.status;
      const isGone = error.isGone?.() ?? false;
      console.error(`Push failed for ${subscription.user_id}:`, statusCode, error.toString());
      return { success: false, statusCode, error: error.toString(), isGone };
    }
    
    console.error(`Error sending push to ${subscription.user_id}:`, error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@avisafe.no';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notifications not configured - missing VAPID keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating application server with VAPID keys...');
    console.log('VAPID Public Key length:', vapidPublicKey.length);
    console.log('VAPID Private Key length:', vapidPrivateKey.length);
    
    // Create the application server with VAPID credentials
    const appServer = await createAppServer(vapidPublicKey, vapidPrivateKey, vapidSubject);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, userIds, companyId, title, body, url, tag, data } = await req.json();

    // Build payload
    const payload: PushPayload = {
      title: title || 'AviSafe',
      body: body || 'Du har en ny varsling',
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: tag || 'avisafe-notification',
      url: url || '/',
      data: data || {}
    };

    console.log('Push payload:', JSON.stringify(payload));

    // Get subscriptions based on parameters
    let subscriptionsQuery = supabase.from('push_subscriptions').select('*');

    if (userId) {
      subscriptionsQuery = subscriptionsQuery.eq('user_id', userId);
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      subscriptionsQuery = subscriptionsQuery.in('user_id', userIds);
    } else if (companyId) {
      subscriptionsQuery = subscriptionsQuery.eq('company_id', companyId);
    } else {
      return new Response(
        JSON.stringify({ error: 'Must specify userId, userIds, or companyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: subscriptions, error: subsError } = await subscriptionsQuery;

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for the given criteria');
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending push to ${subscriptions.length} subscription(s)`);

    // Send to all subscriptions
    const results = await Promise.all(
      subscriptions.map(sub => sendPush(appServer, sub, payload))
    );

    // Remove invalid subscriptions (410 Gone or 404 Not Found)
    const invalidSubscriptions = subscriptions.filter((sub, i) => 
      results[i].isGone || results[i].statusCode === 410 || results[i].statusCode === 404
    );

    if (invalidSubscriptions.length > 0) {
      console.log(`Removing ${invalidSubscriptions.length} invalid subscription(s)`);
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', invalidSubscriptions.map(s => s.id));
    }

    const successCount = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).map(r => r.error);

    console.log(`Push results: ${successCount}/${subscriptions.length} successful`);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        sent: successCount,
        total: subscriptions.length,
        removed: invalidSubscriptions.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
