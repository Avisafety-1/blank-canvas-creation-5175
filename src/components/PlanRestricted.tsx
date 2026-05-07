import { usePlanGating } from '@/hooks/usePlanGating';
import { getPlanById, type GatedFeature } from '@/config/subscriptionPlans';
import { Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface PlanRestrictedProps {
  feature: GatedFeature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PlanRestricted = ({ feature, children, fallback }: PlanRestrictedProps) => {
  const { canAccess, requiredPlanFor } = usePlanGating();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const requiredPlan = getPlanById(requiredPlanFor(feature));

  const handleUpgrade = () => {
    // Navigate to dashboard with state flag — ProfileDialog listens for this
    navigate('/', { state: { openSubscription: true } });
  };

  const handleBack = () => {
    // If there's history, go back; otherwise go to dashboard
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        {t('plan.upgradeRequired', 'Oppgradering påkrevd')}
      </h2>
      <p className="text-muted-foreground max-w-md">
        {t('plan.featureRequiresPlan', {
          plan: requiredPlan?.name ?? 'Grower',
          defaultValue: `Denne funksjonen krever ${requiredPlan?.name ?? 'Grower'}-planen eller høyere.`,
        })}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="default" onClick={handleUpgrade}>
          {t('plan.upgradePlan', 'Oppgrader plan')}
        </Button>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back', 'Tilbake')}
        </Button>
      </div>
    </div>
  );
};
