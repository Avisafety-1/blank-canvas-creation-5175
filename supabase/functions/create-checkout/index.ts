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

const ADDON_PRICES: Record<string, string> = {
  sora_admin: "price_1TBuBDRrLM8xOFbk8RA3Ypgs",
  dji: "price_1TBuAiRrLM8xOFbkBbf8sL2H",
  eccairs: "price_1TBu9ARrLM8xOFbkj393UO2H",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const plan = body.plan || 'starter';
    const addons: string[] = body.addons || [];

    if (!PLAN_PRICES[plan]) throw new Error(`Invalid plan: ${plan}`);
    logStep("Plan selected", { plan, addons });

    // Get user's company and count approved users
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

    const { count: seatCount } = await supabaseClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', effectiveCompanyId)
      .eq('approved', true);

    const seats = seatCount || 1;
    logStep("Seat count", { companyId: effectiveCompanyId, seats });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
    }

    // Build line items: plan × seats + addons × 1
    const line_items: any[] = [
      { price: PLAN_PRICES[plan], quantity: seats },
    ];

    for (const addon of addons) {
      if (ADDON_PRICES[addon]) {
        line_items.push({ price: ADDON_PRICES[addon], quantity: 1 });
      }
    }
    logStep("Line items", { line_items });

    const origin = req.headers.get("origin") || "https://avisafev2.lovable.app";

    // Check for previous subscription (trial abuse prevention)
    let hadPreviousSub = false;
    if (customerId) {
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1 });
      hadPreviousSub = subs.data.length > 0;
      logStep("Previous subscription check", { hadPreviousSub });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items,
      mode: "subscription",
      metadata: {
        company_id: effectiveCompanyId,
        user_id: user.id,
        plan,
        addons: JSON.stringify(addons),
        seat_count: String(seats),
      },
      ...(hadPreviousSub ? {} : {
        subscription_data: {
          trial_period_days: 5,
          trial_settings: {
            end_behavior: { missing_payment_method: 'cancel' },
          },
          metadata: {
            company_id: effectiveCompanyId,
            plan,
            addons: JSON.stringify(addons),
          },
        },
      }),
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
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
