import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TB9TARrLM8xOFbkzV267Soh": "starter",
  "price_1TB9TfRrLM8xOFbkV1ac0aY5": "grower",
  "price_1TB9DARrLM8xOFbkVWT7zgGW": "professional",
  // Legacy
  "price_1TAvyMRrLM8xOFbkg986ibK4": "professional",
  "price_1TB8rSRwSSSiRYeAcdc2KWfQ": "starter",
  "price_1TB8rnRwSSSiRYeAWCmvXJoP": "grower",
  "price_1TB8s3RwSSSiRYeAuD8W8KR2": "professional",
};

const ADDON_PRICE_IDS: Record<string, string> = {
  "price_1TBuBDRrLM8xOFbk8RA3Ypgs": "sora_admin",
  "price_1TBuAiRrLM8xOFbkBbf8sL2H": "dji",
  "price_1TBu9ARrLM8xOFbkj393UO2H": "eccairs",
  // Legacy
  "price_1TB8tURrLM8xOFbk2fX9o05U": "sora_admin",
  "price_1TB9IBRrLM8xOFbkijdJUsL7": "dji",
  "price_1TB9JCRrLM8xOFbklvsgEyiV": "eccairs",
  "price_1TB8tlRwSSSiRYeAvnA3aHCq": "dji",
  "price_1TB8tzRwSSSiRYeAFy8wFJjt": "eccairs",
};

const safeDate = (val: any): string | null => {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val * 1000).toISOString();
  return new Date(val).toISOString();
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const parseSubscription = (subscription: any) => {
  let plan: string | null = null;
  let seatCount = 1;
  const addons: string[] = [];

  for (const item of subscription.items?.data || []) {
    const priceId = item.price?.id;
    if (PRICE_TO_PLAN[priceId]) {
      plan = PRICE_TO_PLAN[priceId];
      seatCount = item.quantity || 1;
    } else if (ADDON_PRICE_IDS[priceId]) {
      addons.push(ADDON_PRICE_IDS[priceId]);
    }
  }

  // Fallback to metadata
  if (!plan && subscription.metadata?.plan) {
    plan = subscription.metadata.plan;
  }

  return { plan, seatCount, addons };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SIGNING_SECRET is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      logStep("ERROR", { message: "No stripe-signature header" });
      return new Response(JSON.stringify({ error: "No signature" }), { status: 400, headers: corsHeaders });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Signature verification failed", { message: msg });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${msg}` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        const userId = session.metadata?.user_id;
        
        logStep("Checkout completed", {
          sessionId: session.id,
          companyId,
          userId,
          customerId: session.customer,
          subscriptionId: session.subscription,
        });

        // Set billing_user_id on company
        if (companyId && userId) {
          await supabaseClient
            .from('companies')
            .update({ billing_user_id: userId })
            .eq('id', companyId);
          logStep("Set billing_user_id", { companyId, userId });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const { plan, seatCount, addons } = parseSubscription(subscription);
        const companyId = (subscription as any).metadata?.company_id;
        const periodEnd = (subscription as any).current_period_end || subscription.items?.data[0]?.current_period_end;
        const isTrial = subscription.status === 'trialing';

        logStep("Subscription created/updated", {
          subscriptionId: subscription.id,
          status: subscription.status,
          plan,
          seatCount,
          addons,
          companyId,
        });

        if (companyId) {
          await supabaseClient
            .from('company_subscriptions')
            .upsert({
              company_id: companyId,
              stripe_customer_id: subscription.customer as string,
              plan: plan || 'starter',
              stripe_subscription_id: subscription.id,
              status: subscription.status,
              seat_count: seatCount,
              current_period_end: safeDate(periodEnd),
              cancel_at_period_end: (subscription as any).cancel_at_period_end ?? false,
              is_trial: isTrial,
              trial_end: isTrial ? safeDate((subscription as any).trial_end) : null,
              addons,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'company_id' });
          logStep("Synced company_subscriptions", { companyId });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = (subscription as any).metadata?.company_id;
        
        logStep("Subscription cancelled", {
          subscriptionId: subscription.id,
          companyId,
        });

        if (companyId) {
          await supabaseClient
            .from('company_subscriptions')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('company_id', companyId);
        }
        break;
      }
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep(`Subscription ${event.type.split('.').pop()}`, {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
        break;
      }
      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
