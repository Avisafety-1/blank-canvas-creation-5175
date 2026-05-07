import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, Clock, LogOut, Rocket, Settings, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { PLANS, ADDONS, type PlanId, type AddonId } from "@/config/subscriptionPlans";

export const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isApproved, profileLoaded, subscribed, subscriptionLoading, isSuperAdmin, stripeExempt, hadPreviousSubscription, signOut } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('grower');
  const [selectedAddons, setSelectedAddons] = useState<AddonId[]>([]);

  // Don't gate if: still loading, no user, profile not loaded yet, not approved, superadmin,
  // has subscription, stripe exempt, OR auth is currently refreshing (avoid flash of paywall)
  if (!user || !profileLoaded || subscriptionLoading || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
    return <>{children}</>;
  }

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan: selectedPlan, addons: selectedAddons },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error('Kunne ikke starte betaling: ' + (e.message || 'Ukjent feil'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error('Kunne ikke åpne kundeportal: ' + (e.message || 'Ukjent feil'));
    } finally {
      setPortalLoading(false);
    }
  };

  const toggleAddon = (id: AddonId) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const isReturning = hadPreviousSubscription;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-3xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${
            isReturning ? 'bg-orange-500/10' : 'bg-primary/10'
          }`}>
            {isReturning ? (
              <Clock className="h-6 w-6 text-orange-500" />
            ) : (
              <Rocket className="h-6 w-6 text-primary" />
            )}
          </div>
          <h2 className="text-xl font-bold">
            {isReturning ? 'Abonnementet er utløpt' : 'Prøv AviSafe gratis i 5 dager'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isReturning
              ? 'Ditt abonnement er ikke lenger aktivt. Velg en plan for å fortsette.'
              : 'Start din gratis prøveperiode — ingen betaling før etter 5 dager.'}
          </p>
        </div>

        {/* Plan selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-all ${
                  isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <CardHeader className="text-center pb-2 pt-4">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <div className="text-2xl font-bold">
                    {plan.price} <span className="text-xs font-normal text-muted-foreground">NOK/bruker/mnd</span>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-foreground">
                        <Check className="h-3 w-3 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Addons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ADDONS.map((addon) => (
            <label
              key={addon.id}
              className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                selectedAddons.includes(addon.id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Checkbox
                checked={selectedAddons.includes(addon.id)}
                onCheckedChange={() => toggleAddon(addon.id)}
              />
              <div>
                <p className="font-medium text-xs"><p className="font-medium text-xs">{addon.name} – {addon.price} NOK/mnd</p></p>
                <p className="text-xs text-muted-foreground">{addon.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center space-y-3">
          <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full max-w-sm" size="lg">
            <CreditCard className="h-4 w-4 mr-2" />
            {checkoutLoading
              ? 'Åpner betaling…'
              : isReturning
                ? 'Forny abonnement'
                : 'Start gratis prøveperiode'}
          </Button>
          {isReturning && (
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading} className="w-full max-w-sm" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {portalLoading ? 'Åpner…' : 'Administrer abonnement'}
            </Button>
          )}
          <div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4 mr-2" />
              Logg ut
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
