import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Plane, AlertTriangle, CheckCircle, MapPin, Info } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface OperationClassification {
  requires_sora?: boolean;
  category?: string;
  subcategory?: string;
  reasoning?: string;
  alos_max_m?: number;
  alos_calculation?: string;
  sora_buffers_calculated?: boolean;
  sora_buffers_recommendation?: string;
  sts_applicable?: string;
  open_category_rules?: string[];
  company_requires_sora?: boolean;
}

interface OperationClassificationSectionProps {
  data: OperationClassification;
}

const categoryColor = (category?: string) => {
  if (!category) return 'bg-muted text-muted-foreground';
  const lower = category.toLowerCase();
  if (lower.includes('open') || lower.includes('åpen')) return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  if (lower.includes('sts')) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
  if (lower.includes('specific') || lower.includes('spesifikk')) return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
  return 'bg-muted text-muted-foreground';
};

export const OperationClassificationSection = ({ data }: OperationClassificationSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!data || (!data.category && data.requires_sora === undefined)) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-3 rounded-lg bg-card border overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Plane className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm">Operasjonskategorisering (Steg 0)</span>
            {data.category && (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", categoryColor(data.category))}>
                {data.category}{data.subcategory ? ` — ${data.subcategory}` : ''}
              </span>
            )}
            {data.requires_sora && data.sora_buffers_calculated && (
              <Badge variant="default" className="text-[10px] bg-green-600">SORA utført</Badge>
            )}
            {data.requires_sora && !data.sora_buffers_calculated && (
              <Badge variant="destructive" className="text-[10px]">SORA påkrevd</Badge>
            )}
            {data.requires_sora === false && (
              <Badge variant="default" className="text-[10px] bg-green-600">SORA ikke påkrevd</Badge>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Reasoning */}
          {data.reasoning && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Begrunnelse</p>
              <p className="text-sm">{data.reasoning}</p>
            </div>
          )}

          {/* STS applicable */}
          {data.sts_applicable && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Standard Scenario</p>
              <p className="text-sm">{data.sts_applicable}</p>
            </div>
          )}

          {/* Open category rules */}
          {data.open_category_rules && data.open_category_rules.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regler for kategorien</p>
              {data.open_category_rules.map((rule, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
                  <span>{rule}</span>
                </p>
              ))}
            </div>
          )}

          {/* ALOS */}
          {data.alos_max_m && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ALOS (Attitude Line of Sight)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{data.alos_max_m} m</Badge>
                {data.alos_calculation && (
                  <span className="text-xs text-muted-foreground">{data.alos_calculation}</span>
                )}
              </div>
            </div>
          )}

          {/* SORA buffers warning */}
          {data.requires_sora && data.sora_buffers_calculated === false && (
            <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    SORA-buffersoner ikke beregnet
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {data.sora_buffers_recommendation || 'Anbefaler å utføre SORA-bufferberegning på kartet før flyging.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {data.requires_sora && data.sora_buffers_calculated === true && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1">
              <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>SORA-buffersoner er beregnet for dette oppdraget</span>
            </p>
          )}

          {/* Company requires SORA */}
          {data.company_requires_sora && !data.requires_sora && (
            <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Operasjonen kan utføres uten SORA, men selskapet krever SORA som internkrav.
                </p>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
