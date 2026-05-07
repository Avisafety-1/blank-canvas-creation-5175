import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICES: Record<string, string> = {
  starter: "price_1TB9TARrLM8xOFbkzV267Soh",
  grower: "price_1TB9TfRrLM8xOFbkV1ac0aY5",
  professional: "price_1TB9DARrLM8xOFbkVWT7zgGW",
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

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHANGE-PLAN] ${step}${detailsStr}`);
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
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const body = await req.json().catch(() => ({}));
    const newPlan = body.new_plan;
    if (!newPlan || !PLAN_PRICES[newPlan]) throw new Error(`Invalid plan: ${newPlan}`);

    // Get user's company
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) throw new Error("User has no company");

    // Resolve to parent company if child
    let effectiveCompanyId = profile.company_id;
    const { data: comp } = await supabaseClient
      .from('companies')
      .select('parent_company_id')
      .eq('id', profile.company_id)
      .single();
    if (comp?.parent_company_id) {
      effectiveCompanyId = comp.parent_company_id;
      logStep("Resolved to parent company", { child: profile.company_id, parent: effectiveCompanyId });
    }

    // Verify billing owner
    const { data: company } = await supabaseClient
      .from('companies')
      .select('billing_user_id')
      .eq('id', effectiveCompanyId)
      .single();

    if (company?.billing_user_id !== user.id) {
      throw new Error("Only the billing owner can change the plan");
    }

    // Get subscription
    const { data: sub } = await supabaseClient
      .from('company_subscriptions')
      .select('stripe_subscription_id')
      .eq('company_id', effectiveCompanyId)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      throw new Error("No active subscription found");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

    // Find the current plan item
    const planItem = subscription.items.data.find((item: any) => PRICE_TO_PLAN[item.price.id]);
    if (!planItem) throw new Error("No plan item found in subscription");

    const currentPlan = PRICE_TO_PLAN[planItem.price.id];
    if (currentPlan === newPlan) {
      return new Response(JSON.stringify({ changed: false, reason: 'same_plan' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Changing plan", { from: currentPlan, to: newPlan, itemId: planItem.id });

    // Update the subscription item with the new price, keep same quantity
    await stripe.subscriptionItems.update(planItem.id, {
      price: PLAN_PRICES[newPlan],
      proration_behavior: 'create_prorations',
    });

    // Update local record
    await supabaseClient
      .from('company_subscriptions')
      .update({ plan: newPlan, updated_at: new Date().toISOString() })
      .eq('company_id', effectiveCompanyId);

    logStep("Plan changed successfully", { from: currentPlan, to: newPlan });

    return new Response(JSON.stringify({ changed: true, plan: newPlan }), {
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
