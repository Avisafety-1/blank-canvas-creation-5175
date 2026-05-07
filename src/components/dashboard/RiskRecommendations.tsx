import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, Shield, AlertCircle } from "lucide-react";

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason?: string;
  risk_addressed?: string;
}

interface RiskRecommendationsProps {
  recommendations: Recommendation[];
  goConditions?: string[];
  prerequisites?: string[];
  aiDisclaimer?: string;
}

export const RiskRecommendations = ({ 
  recommendations, 
  goConditions,
  prerequisites,
  aiDisclaimer
}: RiskRecommendationsProps) => {
  const { t } = useTranslation();

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-500/30 bg-red-500/10';
      case 'medium':
        return 'border-yellow-500/30 bg-yellow-500/10';
      case 'low':
        return 'border-blue-500/30 bg-blue-500/10';
      default:
        return 'border-muted bg-muted/50';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return t('riskAssessment.priority.high', 'Høy prioritet');
      case 'medium':
        return t('riskAssessment.priority.medium', 'Medium prioritet');
      case 'low':
        return t('riskAssessment.priority.low', 'Lav prioritet');
      default:
        return priority;
    }
  };

  // Group recommendations by priority
  const highPriority = recommendations.filter(r => r.priority === 'high');
  const mediumPriority = recommendations.filter(r => r.priority === 'medium');
  const lowPriority = recommendations.filter(r => r.priority === 'low');

  const renderRecommendationGroup = (items: Recommendation[], title: string) => {
    if (items.length === 0) return null;
    
    return (
      <div className="space-y-2">
        {items.map((rec, index) => (
          <div 
            key={index}
            className={cn("p-3 rounded-lg border overflow-hidden", getPriorityStyle(rec.priority))}
          >
            <div className="flex items-start gap-2">
              {getPriorityIcon(rec.priority)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium uppercase opacity-70">
                    {getPriorityLabel(rec.priority)}
                  </span>
                </div>
                <p className="text-sm font-medium break-words">{rec.action}</p>
                {(rec.reason || rec.risk_addressed) && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {rec.risk_addressed || rec.reason}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Recommendations grouped by priority */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3">
            {t('riskAssessment.recommendations', 'Anbefalte tiltak')}
          </h4>
          <div className="space-y-4">
            {highPriority.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase mb-2">
                  {t('riskAssessment.priority.high', 'Høy prioritet')}
                </p>
                {renderRecommendationGroup(highPriority, 'high')}
              </div>
            )}
            {mediumPriority.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase mb-2">
                  {t('riskAssessment.priority.medium', 'Medium prioritet')}
                </p>
                {renderRecommendationGroup(mediumPriority, 'medium')}
              </div>
            )}
            {lowPriority.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase mb-2">
                  {t('riskAssessment.priority.low', 'Lav prioritet')}
                </p>
                {renderRecommendationGroup(lowPriority, 'low')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prerequisites / Go Conditions */}
      {(prerequisites && prerequisites.length > 0) && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 flex-shrink-0" />
            <span>{t('riskAssessment.prerequisites', 'Forutsetninger for flyging')}</span>
          </h4>
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 overflow-hidden">
            <ul className="space-y-1">
              {prerequisites.map((prereq, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="break-words">{prereq}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Go Conditions (backward compatibility) */}
      {(!prerequisites || prerequisites.length === 0) && goConditions && goConditions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            {t('riskAssessment.goConditions', 'Betingelser for flyging')}
          </h4>
          <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/10 overflow-hidden">
            <ul className="space-y-1">
              {goConditions.map((condition, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="break-words">{condition}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* AI Disclaimer */}
      {aiDisclaimer && (
        <div className="p-3 rounded-lg border border-muted bg-muted/30 overflow-hidden">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t('riskAssessment.aiDisclaimer', 'AI-forbehold')}
              </h4>
              <p className="text-xs text-muted-foreground break-words">{aiDisclaimer}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
