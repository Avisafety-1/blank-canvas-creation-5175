import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Shield, ChevronDown, ChevronUp, Radar, Eye, AlertTriangle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AirRiskAnalysis {
  aec?: string;
  aec_reasoning?: string;
  initial_arc?: string;
  strategic_mitigations_applied?: string[];
  strategic_mitigations_not_applied?: string[];
  residual_arc?: string;
  tmpr_level?: string;
  tmpr_requirements?: {
    detect?: string;
    decide?: string;
    command?: string;
    execute?: string;
    feedback_loop?: string;
  };
  detection_recommendations?: string[];
  vlos_exemption?: boolean;
  traffic_types_to_consider?: string[];
  arc_reduction_reasoning?: string;
}

interface AirRiskAnalysisSectionProps {
  data: AirRiskAnalysis;
}

const arcColor = (arc?: string) => {
  if (!arc) return 'bg-muted text-muted-foreground';
  const lower = arc.toLowerCase();
  if (lower.includes('a')) return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  if (lower.includes('b')) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
  if (lower.includes('c')) return 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30';
  if (lower.includes('d')) return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
  return 'bg-muted text-muted-foreground';
};

const tmprBadgeColor = (level?: string) => {
  if (!level) return 'secondary';
  const l = level.toLowerCase();
  if (l === 'none') return 'default' as const;
  if (l === 'low') return 'default' as const;
  if (l === 'medium') return 'secondary' as const;
  if (l === 'high') return 'destructive' as const;
  return 'secondary' as const;
};

export const AirRiskAnalysisSection = ({ data }: AirRiskAnalysisSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!data || (!data.aec && !data.initial_arc)) return null;

  const arcChanged = data.initial_arc !== data.residual_arc;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-3 rounded-lg bg-card border overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Radar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm">Luftrisikoanalyse (ARC/TMPR)</span>
            {data.residual_arc && (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(data.residual_arc))}>
                {data.residual_arc}
              </span>
            )}
            {data.tmpr_level && (
              <Badge variant={tmprBadgeColor(data.tmpr_level)} className="text-[10px]">
                TMPR: {data.tmpr_level}
              </Badge>
            )}
            {data.vlos_exemption && (
              <Badge variant="outline" className="text-[10px]">VLOS</Badge>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* AEC */}
          {data.aec && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Air Encounter Category</p>
              <p className="text-sm font-medium">{data.aec}</p>
              {data.aec_reasoning && (
                <p className="text-xs text-muted-foreground">{data.aec_reasoning}</p>
              )}
            </div>
          )}

          {/* ARC progression */}
          {data.initial_arc && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Air Risk Class (ARC)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(data.initial_arc))}>
                  iARC: {data.initial_arc}
                </span>
                {arcChanged && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(data.residual_arc))}>
                      Residual: {data.residual_arc}
                    </span>
                  </>
                )}
                {!arcChanged && (
                  <span className="text-xs text-muted-foreground">(ingen reduksjon)</span>
                )}
              </div>
              {data.arc_reduction_reasoning && arcChanged && (
                <p className="text-xs text-muted-foreground mt-1">{data.arc_reduction_reasoning}</p>
              )}
            </div>
          )}

          {/* Strategic mitigations */}
          {(data.strategic_mitigations_applied?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strategiske mitigeringer</p>
              {data.strategic_mitigations_applied!.map((m, i) => (
                <p key={i} className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1">
                  <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{m}</span>
                </p>
              ))}
              {data.strategic_mitigations_not_applied?.map((m, i) => (
                <p key={`na-${i}`} className="text-xs text-muted-foreground flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{m}</span>
                </p>
              ))}
            </div>
          )}

          {/* TMPR */}
          {data.tmpr_level && data.tmpr_requirements && !data.vlos_exemption && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                TMPR-krav ({data.tmpr_level})
              </p>
              <div className="grid gap-1 text-xs">
                {Object.entries(data.tmpr_requirements).map(([key, val]) => {
                  if (!val) return null;
                  const labels: Record<string, string> = {
                    detect: 'Detect',
                    decide: 'Decide',
                    command: 'Command',
                    execute: 'Execute',
                    feedback_loop: 'Feedback Loop',
                  };
                  return (
                    <div key={key} className="flex gap-2">
                      <span className="font-medium text-muted-foreground w-20 flex-shrink-0">{labels[key] || key}</span>
                      <span>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.vlos_exemption && (
            <p className="text-xs text-muted-foreground italic flex items-start gap-1">
              <Eye className="w-3 h-3 mt-0.5 flex-shrink-0" />
              VLOS-operasjon — visuell kontakt med dronen er akseptabel taktisk mitigering for alle ARC-klasser.
            </p>
          )}

          {/* Detection recommendations */}
          {(data.detection_recommendations?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anbefalte deteksjonssystemer</p>
              <ul className="text-xs space-y-0.5">
                {data.detection_recommendations!.map((r, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Traffic types */}
          {(data.traffic_types_to_consider?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trafikktyper å vurdere</p>
              <div className="flex flex-wrap gap-1">
                {data.traffic_types_to_consider!.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
