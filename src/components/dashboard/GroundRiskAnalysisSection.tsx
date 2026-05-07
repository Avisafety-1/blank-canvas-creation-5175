import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Shield, ChevronDown, ChevronUp, Layers, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MitigationEntry {
  applicable: boolean;
  robustness?: string | null;
  reduction: number;
  reasoning?: string;
}

interface GroundRiskAnalysis {
  characteristic_dimension?: string;
  max_speed_category?: string;
  drone_weight_kg?: number;
  population_density_band?: string;
  population_density_description?: string;
  population_density_value?: number;
  population_density_calculation?: string;
  population_density_average?: number;
  population_density_driver?: string;
  population_density_source?: string;
  population_density_footprint?: string;
  ssb_grid_population?: number;
  ssb_grid_resolution_m?: number;
  igrc?: number;
  igrc_reasoning?: string;
  mitigations?: {
    m1a_sheltering?: MitigationEntry;
    m1b_operational_restrictions?: MitigationEntry;
    m1c_ground_observation?: MitigationEntry;
    m2_impact_reduction?: MitigationEntry;
  };
  total_reduction?: number;
  fgrc?: number;
  fgrc_reasoning?: string;
  controlled_ground_area?: boolean;
  grc_calculation_method?: string;
  igrc_table_basis?: string;
}

interface GroundRiskAnalysisSectionProps {
  data: GroundRiskAnalysis;
}

const grcColor = (grc?: number) => {
  if (grc == null) return 'bg-muted text-muted-foreground';
  if (grc <= 3) return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  if (grc <= 6) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
  return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
};

const mitigationLabels: Record<string, string> = {
  m1a_sheltering: 'M1(A) Skjerming',
  m1b_operational_restrictions: 'M1(B) Operasjonelle restriksjoner',
  m1c_ground_observation: 'M1(C) Bakkeobservasjon',
  m2_impact_reduction: 'M2 Redusert treffenergi',
};

const formatNumber = (value: number, decimals = 0) =>
  value.toLocaleString("nb-NO", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

export const GroundRiskAnalysisSection = ({ data }: GroundRiskAnalysisSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!data || (data.igrc == null && data.fgrc == null)) return null;

  const grcChanged = data.igrc != null && data.fgrc != null && data.igrc !== data.fgrc;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-3 rounded-lg bg-card border overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm">Bakkerisikoanalyse (iGRC/fGRC)</span>
            {data.fgrc != null && (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.fgrc))}>
                fGRC: {data.fgrc}
              </span>
            )}
            {data.controlled_ground_area && (
              <Badge variant="outline" className="text-[10px]">Kontrollert</Badge>
            )}
            {data.grc_calculation_method && (
              <Badge variant="secondary" className="text-[10px]">Systemberegnet</Badge>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Drone specs & population */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {data.characteristic_dimension && (
              <div>
                <span className="text-muted-foreground">Dimensjon:</span>{' '}
                <span className="font-medium">{data.characteristic_dimension}</span>
              </div>
            )}
            {data.max_speed_category && (
              <div>
                <span className="text-muted-foreground">Maks hastighet:</span>{' '}
                <span className="font-medium">{data.max_speed_category}</span>
              </div>
            )}
            {data.drone_weight_kg != null && (
              <div>
                <span className="text-muted-foreground">MTOW:</span>{' '}
                <span className="font-medium">{data.drone_weight_kg} kg</span>
              </div>
            )}
            {data.population_density_value != null && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Befolkning:</span>{' '}
                <span className="font-medium">{formatNumber(data.population_density_value)} /km²</span>
              </div>
            )}
          </div>

          {data.population_density_band && (
            <p className="text-xs text-muted-foreground italic">{data.population_density_band}{data.population_density_description ? ` — ${data.population_density_description}` : ''}</p>
          )}

          {(data.population_density_calculation || data.population_density_source || data.population_density_driver) && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1">
              <p className="font-medium text-foreground">SSB befolkningstetthet – beregning</p>
              {data.population_density_source && <p className="text-muted-foreground">Datakilde: {data.population_density_source}</p>}
              {data.population_density_footprint && <p className="text-muted-foreground">Fotavtrykk: {data.population_density_footprint}</p>}
              {data.population_density_calculation && <p className="text-foreground">Beregning: {data.population_density_calculation}</p>}
              {data.population_density_average != null && <p className="text-muted-foreground">Gjennomsnitt i fotavtrykk: {formatNumber(data.population_density_average, 1)} pers/km²</p>}
              {data.population_density_driver && <p className="text-muted-foreground">Dimensjonerende del av ruten: {data.population_density_driver}</p>}
            </div>
          )}

          {/* iGRC → fGRC progression */}
          {data.igrc != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ground Risk Class (GRC)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.igrc))}>
                  iGRC: {data.igrc}
                </span>
                {grcChanged && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.fgrc))}>
                      fGRC: {data.fgrc}
                    </span>
                    {data.total_reduction != null && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">({data.total_reduction})</span>
                    )}
                  </>
                )}
                {!grcChanged && (
                  <span className="text-xs text-muted-foreground">(ingen reduksjon)</span>
                )}
              </div>
              {data.igrc_reasoning && (
                <p className="text-xs text-muted-foreground mt-1">{data.igrc_reasoning}</p>
              )}
              {(data.grc_calculation_method || data.igrc_table_basis) && (
                <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1 mt-2">
                  {data.grc_calculation_method && <p className="font-medium text-foreground">{data.grc_calculation_method}</p>}
                  {data.igrc_table_basis && <p className="text-muted-foreground">Tabellgrunnlag: {data.igrc_table_basis}</p>}
                  {data.total_reduction != null && <p className="text-muted-foreground">Dokumentert reduksjon: {data.total_reduction}</p>}
                  {data.fgrc != null && <p className="text-muted-foreground">Endelig fGRC: {data.fgrc}</p>}
                </div>
              )}
            </div>
          )}

          {/* Mitigations table */}
          {data.mitigations && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mitigeringer</p>
              <div className="space-y-1.5">
                {Object.entries(data.mitigations).map(([key, m]) => {
                  if (!m) return null;
                  return (
                    <div key={key} className="flex items-start gap-1.5 text-xs">
                      {m.applicable ? (
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <span className={cn("font-medium", m.applicable ? "text-foreground" : "text-muted-foreground")}>
                          {mitigationLabels[key] || key}
                        </span>
                        {m.applicable && m.robustness && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] py-0">{m.robustness}</Badge>
                        )}
                        {m.applicable && m.reduction !== 0 && (
                          <span className="ml-1.5 text-green-600 dark:text-green-400 font-medium">({m.reduction})</span>
                        )}
                        {m.reasoning && (
                          <p className="text-muted-foreground mt-0.5 break-words">{m.reasoning}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* fGRC reasoning */}
          {data.fgrc_reasoning && grcChanged && (
            <p className="text-xs text-muted-foreground italic">{data.fgrc_reasoning}</p>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
