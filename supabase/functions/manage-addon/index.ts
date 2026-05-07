import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADDON_PRICES: Record<string, string> = {
  sora_admin: "price_1TBuBDRrLM8xOFbk8RA3Ypgs",
  dji: "price_1TBuAiRrLM8xOFbkBbf8sL2H",
  eccairs: "price_1TBu9ARrLM8xOFbkj393UO2H",
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

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-ADDON] ${step}${detailsStr}`);
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
    const { addon_id, action } = body;

    if (!addon_id || !ADDON_PRICES[addon_id]) throw new Error(`Invalid addon_id: ${addon_id}`);
    if (action !== 'add' && action !== 'remove') throw new Error(`Invalid action: ${action}`);

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
      throw new Error("Only the billing owner can manage addons");
    }

    // Get subscription
    const { data: sub } = await supabaseClient
      .from('company_subscriptions')
      .select('stripe_subscription_id, addons')
      .eq('company_id', effectiveCompanyId)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      throw new Error("No active subscription found");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const addonPriceId = ADDON_PRICES[addon_id];

    if (action === 'add') {
      // Check not already present
      const existing = subscription.items.data.find((item: any) => ADDON_PRICE_IDS[item.price.id] === addon_id);
      if (existing) {
        return new Response(JSON.stringify({ success: true, addons: sub.addons, reason: 'already_active' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      logStep("Adding addon", { addon_id, priceId: addonPriceId });
      await stripe.subscriptionItems.create({
        subscription: sub.stripe_subscription_id,
        price: addonPriceId,
        proration_behavior: 'create_prorations',
      });

      const updatedAddons = [...(sub.addons || []), addon_id];
      await supabaseClient
        .from('company_subscriptions')
        .update({ addons: updatedAddons, updated_at: new Date().toISOString() })
        .eq('company_id', effectiveCompanyId);

      logStep("Addon added", { addon_id, updatedAddons });

      return new Response(JSON.stringify({ success: true, addons: updatedAddons }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      // Remove addon
      const itemToRemove = subscription.items.data.find((item: any) => ADDON_PRICE_IDS[item.price.id] === addon_id);
      if (!itemToRemove) {
        return new Response(JSON.stringify({ success: true, addons: sub.addons, reason: 'not_active' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      logStep("Removing addon", { addon_id, itemId: itemToRemove.id });
      await stripe.subscriptionItems.del(itemToRemove.id, {
        proration_behavior: 'create_prorations',
      });

      const updatedAddons = (sub.addons || []).filter((a: string) => a !== addon_id);
      await supabaseClient
        .from('company_subscriptions')
        .update({ addons: updatedAddons, updated_at: new Date().toISOString() })
        .eq('company_id', effectiveCompanyId);

      logStep("Addon removed", { addon_id, updatedAddons });

      return new Response(JSON.stringify({ success: true, addons: updatedAddons }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
