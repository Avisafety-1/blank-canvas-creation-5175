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
  // Legacy prices
  "price_1TAvyMRrLM8xOFbkg986ibK4": "professional",
  "price_1TB8rSRwSSSiRYeAcdc2KWfQ": "starter",
  "price_1TB8rnRwSSSiRYeAWCmvXJoP": "grower",
  "price_1TB8s3RwSSSiRYeAuD8W8KR2": "professional",
};

const ADDON_PRICE_IDS: Record<string, string> = {
  "price_1TBuBDRrLM8xOFbk8RA3Ypgs": "sora_admin",
  "price_1TBuAiRrLM8xOFbkBbf8sL2H": "dji",
  "price_1TBu9ARrLM8xOFbkj393UO2H": "eccairs",
  // Legacy addon prices
  "price_1TB8tURrLM8xOFbk2fX9o05U": "sora_admin",
  "price_1TB9IBRrLM8xOFbkijdJUsL7": "dji",
  "price_1TB9JCRrLM8xOFbklvsgEyiV": "eccairs",
  "price_1TB8tlRwSSSiRYeAvnA3aHCq": "dji",
  "price_1TB8tzRwSSSiRYeAFy8wFJjt": "eccairs",
};

const safeDate = (val: any): string => {
  if (!val) return 'unknown';
  if (typeof val === 'number') return new Date(val * 1000).toISOString();
  return new Date(val).toISOString();
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      // Gracefully handle missing/invalid JWT (e.g. anon key sent before session restore)
      logStep("No valid user session", { message: userError.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    if (!user?.email) {
      logStep("No user email available");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's company and check if they're the billing owner
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const rawCompanyId = profile?.company_id;

    // Resolve to parent company if child
    let companyId = rawCompanyId;
    if (rawCompanyId) {
      const { data: comp } = await supabaseClient
        .from('companies')
        .select('parent_company_id, billing_user_id')
        .eq('id', rawCompanyId)
        .single();
      if (comp?.parent_company_id) {
        companyId = comp.parent_company_id;
        logStep("Resolved to parent company", { child: rawCompanyId, parent: companyId });
      }
    }

    // Check company billing_user_id
    let isBillingOwner = false;
    if (companyId) {
      const { data: company } = await supabaseClient
        .from('companies')
        .select('billing_user_id')
        .eq('id', companyId)
        .single();
      isBillingOwner = company?.billing_user_id === user.id;
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Try to find Stripe customer by company subscription first, then by email
    let customerId: string | undefined;
    
    if (companyId) {
      const { data: companySub } = await supabaseClient
        .from('company_subscriptions')
        .select('stripe_customer_id')
        .eq('company_id', companyId)
        .maybeSingle();
      
      if (companySub?.stripe_customer_id) {
        customerId = companySub.stripe_customer_id;
        logStep("Found customer from company_subscriptions", { customerId });
      }
    }

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found customer by email", { customerId });
      }
    }

    if (!customerId) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ subscribed: false, is_billing_owner: isBillingOwner }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    const subscription = subscriptions.data.find((s: any) => 
      s.status === 'active' || s.status === 'trialing'
    );

    const hasActiveSub = !!subscription;
    const hadPreviousSubscription = subscriptions.data.length > 0;
    let plan: string | null = null;
    let subscriptionEnd = null;
    let cancelAtPeriodEnd = false;
    let isTrial = false;
    let trialEnd = null;
    let seatCount = 1;
    const addons: string[] = [];

    if (subscription) {
      const periodEnd = (subscription as any).current_period_end || subscription.items?.data[0]?.current_period_end;
      subscriptionEnd = safeDate(periodEnd);
      cancelAtPeriodEnd = (subscription as any).cancel_at_period_end ?? false;
      isTrial = subscription.status === 'trialing';
      if (isTrial && (subscription as any).trial_end) {
        trialEnd = safeDate((subscription as any).trial_end);
      }

      // Determine plan and addons from subscription items
      for (const item of subscription.items.data) {
        const priceId = item.price.id;
        if (PRICE_TO_PLAN[priceId]) {
          plan = PRICE_TO_PLAN[priceId];
          seatCount = item.quantity || 1;
        } else if (ADDON_PRICE_IDS[priceId]) {
          addons.push(ADDON_PRICE_IDS[priceId]);
        }
      }

      // Fallback: check metadata
      if (!plan && (subscription as any).metadata?.plan) {
        plan = (subscription as any).metadata.plan;
      }

      logStep("Subscription found", { subscriptionId: subscription.id, plan, seatCount, addons, isTrial });

      // Sync to company_subscriptions table
      if (companyId) {
        const subData = {
          company_id: companyId,
          stripe_customer_id: customerId,
          billing_user_id: isBillingOwner ? user.id : undefined,
          plan: plan || 'starter',
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          seat_count: seatCount,
          current_period_end: subscriptionEnd !== 'unknown' ? subscriptionEnd : null,
          cancel_at_period_end: cancelAtPeriodEnd,
          is_trial: isTrial,
          trial_end: trialEnd !== 'unknown' ? trialEnd : null,
          addons,
          updated_at: new Date().toISOString(),
        };

        // Remove undefined billing_user_id
        if (!isBillingOwner) delete (subData as any).billing_user_id;

        await supabaseClient
          .from('company_subscriptions')
          .upsert(subData, { onConflict: 'company_id' });
      }
    } else {
      logStep("No active/trialing subscription found", { hadPreviousSubscription });
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      plan,
      seat_count: seatCount,
      addons,
      subscription_end: subscriptionEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      is_trial: isTrial,
      trial_end: trialEnd,
      had_previous_subscription: hadPreviousSubscription,
      is_billing_owner: isBillingOwner,
    }), {
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
