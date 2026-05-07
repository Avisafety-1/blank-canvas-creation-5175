import { useAuth } from '@/contexts/AuthContext';
import { PLANS, type GatedFeature, type AddonId, type PlanId } from '@/config/subscriptionPlans';

const getPlanConfig = (planId: PlanId | null) =>
  PLANS.find(p => p.id === (planId ?? 'starter')) ?? PLANS[0];

export const usePlanGating = () => {
  const { subscriptionPlan, subscriptionAddons, isSuperAdmin, stripeExempt, seatCount } = useAuth();

  const bypass = isSuperAdmin || stripeExempt;
  const plan = getPlanConfig(subscriptionPlan);

  const canAccess = (feature: GatedFeature): boolean => {
    if (bypass) return true;
    return plan.gatedFeatures.includes(feature);
  };

  const maxDrones = bypass ? Infinity : (plan.maxDronesPerSeat ? plan.maxDrones * seatCount : plan.maxDrones);

  const hasAddon = (addon: AddonId): boolean => {
    if (bypass) return true;
    return subscriptionAddons.includes(addon);
  };

  const requiredPlanFor = (feature: GatedFeature): PlanId => {
    for (const p of PLANS) {
      if (p.gatedFeatures.includes(feature)) return p.id;
    }
    return 'professional';
  };

  return {
    canAccess,
    maxDrones,
    hasAddon,
    requiredPlanFor,
    currentPlan: plan,
    bypass,
    seatCount,
  };
};
