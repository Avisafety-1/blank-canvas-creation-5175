import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AlertOctagon, CheckCircle, AlertTriangle, Info, ShieldCheck, ShieldAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AirRiskAnalysisSection } from "./AirRiskAnalysisSection";
import { GroundRiskAnalysisSection } from "./GroundRiskAnalysisSection";
import { OperationClassificationSection } from "./OperationClassificationSection";

interface CategoryScore {
  score: number;
  go_decision?: 'GO' | 'BETINGET' | 'NO-GO';
  factors: string[];
  concerns: string[];
  actual_conditions?: string;
  comparison_to_limits?: string;
  status?: 'green' | 'yellow' | 'red';
  drone_status?: string;
  experience_summary?: string;
  complexity_factors?: string;
}

interface RiskScoreCardProps {
  overallScore: number;
  recommendation: 'go' | 'caution' | 'no-go';
  categories: {
    weather?: CategoryScore;
    airspace?: CategoryScore;
    pilot_experience?: CategoryScore;
    mission_complexity?: CategoryScore;
    equipment?: CategoryScore;
  };
  hardStopTriggered?: boolean;
  hardStopReason?: string;
  missionOverview?: string;
  assessmentMethod?: string;
  categoryComments?: Record<string, string>;
  onCategoryCommentChange?: (category: string, comment: string) => void;
  readOnly?: boolean;
  approvalStatus?: 'approved' | 'not_approved' | null;
  approvalReason?: string | null;
  approvalThreshold?: number | null;
  airRiskAnalysis?: any;
  groundRiskAnalysis?: any;
  operationClassification?: any;
}

export const RiskScoreCard = ({ 
  overallScore, 
  recommendation, 
  categories,
  hardStopTriggered,
  hardStopReason,
  missionOverview,
  assessmentMethod,
  categoryComments,
  onCategoryCommentChange,
  readOnly,
  approvalStatus,
  approvalReason,
  approvalThreshold,
  airRiskAnalysis,
  groundRiskAnalysis,
  operationClassification
}: RiskScoreCardProps) => {
  const { t } = useTranslation();

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'bg-green-500';
    if (score >= 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRecommendationStyle = (rec: string) => {
    switch (rec) {
      case 'go':
        return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
      case 'caution':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
      case 'no-go':
        return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRecommendationText = (rec: string) => {
    switch (rec) {
      case 'go':
        return t('riskAssessment.goRecommendation', 'Anbefalt å fly');
      case 'caution':
        return t('riskAssessment.cautionRecommendation', 'Betinget anbefalt');
      case 'no-go':
        return t('riskAssessment.noGoRecommendation', 'Ikke anbefalt');
      default:
        return rec;
    }
  };

  const getGoDecisionBadge = (decision?: string) => {
    if (!decision) return null;
    
    const styles: Record<string, string> = {
      'GO': 'bg-green-500/20 text-green-700 dark:text-green-300',
      'BETINGET': 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
      'NO-GO': 'bg-red-500/20 text-red-700 dark:text-red-300',
    };

    return (
      <span className={cn("px-2 py-0.5 rounded text-xs font-semibold uppercase", styles[decision] || 'bg-muted')}>
        {decision}
      </span>
    );
  };

  const categoryLabels: Record<string, string> = {
    weather: t('riskAssessment.categories.weather', 'Vær'),
    airspace: t('riskAssessment.categories.airspace', 'Luftrom'),
    pilot_experience: t('riskAssessment.categories.pilotExperience', 'Piloterfaring'),
    mission_complexity: t('riskAssessment.categories.missionComplexity', 'Oppdragskompleksitet'),
    equipment: t('riskAssessment.categories.equipment', 'Utstyr'),
  };

  return (
    <div className="space-y-4">
      {/* HARD STOP Warning */}
      {hardStopTriggered && (
        <div className="p-4 rounded-lg border-2 border-red-500 bg-red-500/10">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-700 dark:text-red-300">
                {t('riskAssessment.hardStop', 'HARD STOP - Flyging ikke anbefalt')}
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {hardStopReason || t('riskAssessment.hardStopGeneric', 'Kritiske terskler er overskredet')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Approval Status Banner */}
      {approvalStatus === 'approved' && (
        <div className="p-4 rounded-lg border-2 border-green-500 bg-green-500/10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-green-700 dark:text-green-300">
                {t('riskAssessment.autoApproved', 'Oppdraget ble automatisk godkjent')}
              </h3>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                {approvalReason}
              </p>
            </div>
          </div>
        </div>
      )}
      {approvalStatus === 'not_approved' && (
        <div className="p-4 rounded-lg border-2 border-yellow-500 bg-yellow-500/10">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-yellow-700 dark:text-yellow-300">
                {t('riskAssessment.requiresApproval', 'Oppdraget krever manuell godkjenning')}
              </h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                {approvalReason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mission Overview */}
      {missionOverview && (
        <div className="p-3 rounded-lg bg-muted/50 border overflow-hidden">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {t('riskAssessment.missionOverview', 'Oppdragsoversikt')}
          </h4>
          <p className="text-sm break-words">{missionOverview}</p>
        </div>
      )}

      {/* Assessment Method */}
      {assessmentMethod && (
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                {t('riskAssessment.assessmentMethod', 'Vurderingsmetode')}
              </h4>
              <p className="text-xs text-muted-foreground">{assessmentMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* Overall Score */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-card border">
        <div>
          <p className="text-sm text-muted-foreground">{t('riskAssessment.overallScore', 'Samlet score')}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-bold">{overallScore.toFixed(1)}</span>
            <span className="text-lg sm:text-xl text-muted-foreground">/ 10</span>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border font-medium text-sm sm:text-base whitespace-nowrap",
          getRecommendationStyle(recommendation)
        )}>
          {getRecommendationText(recommendation)}
        </div>
      </div>

      {/* Operation Classification - Step 0 */}
      {operationClassification && (
        <OperationClassificationSection data={operationClassification} />
      )}

      {/* Category Scores */}
      <div className="space-y-3">
        {Object.entries(categories).map(([key, category]) => {
          if (!category) return null;
          return (
            <div key={key}>
              <div className="p-3 rounded-lg bg-card border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-medium text-sm sm:text-base">{categoryLabels[key] || key}</span>
                    {getGoDecisionBadge(category.go_decision)}
                  </div>
                  <span className="text-xs sm:text-sm font-medium flex-shrink-0">{category.score.toFixed(1)}/10</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all", getScoreColor(category.score))}
                    style={{ width: `${(category.score / 10) * 100}%` }}
                  />
                </div>
                
                {/* Category details */}
                {(category.actual_conditions || category.drone_status || category.experience_summary || category.complexity_factors) && (
                  <p className="text-xs text-muted-foreground mt-2 italic break-words">
                    {category.actual_conditions || category.drone_status || category.experience_summary || category.complexity_factors}
                  </p>
                )}
                
                {(category.factors.length > 0 || category.concerns.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {category.factors.map((factor, i) => (
                      <p key={`factor-${i}`} className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1">
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="break-words">{factor}</span>
                      </p>
                    ))}
                    {category.concerns.map((concern, i) => (
                      <p key={`concern-${i}`} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="break-words">{concern}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Manual comment */}
                <Textarea
                  placeholder={t('riskAssessment.addComment', 'Legg til kommentar...')}
                  value={categoryComments?.[key] || ''}
                  onChange={(e) => onCategoryCommentChange?.(key, e.target.value)}
                  readOnly={readOnly}
                  className={cn(
                    "mt-2 text-xs min-h-[60px]",
                    readOnly && "opacity-70 cursor-default"
                  )}
                />
              </div>
              
              {/* Air Risk Analysis section - shown after airspace category */}
              {key === 'airspace' && airRiskAnalysis && (
                <div className="mt-3">
                  <AirRiskAnalysisSection data={airRiskAnalysis} />
                </div>
              )}
              
              {/* Ground Risk Analysis section - shown after mission_complexity category */}
              {key === 'mission_complexity' && groundRiskAnalysis && (
                <div className="mt-3">
                  <GroundRiskAnalysisSection data={groundRiskAnalysis} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
