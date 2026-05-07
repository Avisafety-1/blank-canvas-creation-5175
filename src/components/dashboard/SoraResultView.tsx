import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContainmentCriterion {
  criterion: string;
  requirement: string;
  assurance: string;
}

interface OsoRequirement {
  oso: string;
  description: string;
  robustness: string;
  category: string;
}

interface SailLookup {
  fgrc_used: number;
  arc_used: string;
  fgrc_adjustments?: string;
  result: string;
}

interface ContainmentData {
  robustness_level: string;
  reasoning: string;
  criteria: ContainmentCriterion[];
  fts_required: boolean;
  fts_note?: string;
  tethered?: boolean;
}

interface SoraData {
  environment?: string;
  conops_summary?: string;
  igrc?: number;
  ground_mitigations?: string;
  fgrc?: number;
  arc_initial?: string;
  airspace_mitigations?: string;
  arc_residual?: string;
  sail?: string;
  sail_lookup?: SailLookup;
  containment?: ContainmentData;
  oso_requirements?: OsoRequirement[];
  residual_risk_level?: string;
  residual_risk_comment?: string;
  operational_limits?: string;
  overall_score?: number;
  recommendation?: string;
  summary?: string;
}

interface SoraResultViewProps {
  data: SoraData;
}

const riskColor = (level?: string) => {
  if (!level) return "secondary";
  const l = level.toLowerCase();
  if (l === "lav" || l === "low") return "default";
  if (l === "moderat" || l === "moderate") return "secondary";
  return "destructive";
};

const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-sm">{value ?? "—"}</p>
  </div>
);

const robustnessColor = (level: string) => {
  switch (level) {
    case "NR": return "bg-muted text-muted-foreground";
    case "L": return "bg-green-500/20 text-green-700 dark:text-green-300";
    case "M": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
    case "H": return "bg-red-500/20 text-red-700 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const robustnessLabel = (level: string) => {
  switch (level) {
    case "NR": return "Ikke påkrevd";
    case "L": return "Lav";
    case "M": return "Medium";
    case "H": return "Høy";
    default: return level;
  }
};

const containmentRobustnessColor = (level: string) => {
  const l = level.toLowerCase();
  if (l === "low") return "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30";
  if (l === "medium") return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
  if (l === "high") return "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30";
  return "bg-muted text-muted-foreground";
};

// SAIL matrix for visual highlight
const SAIL_MATRIX: Record<string, Record<string, string>> = {
  "≤2": { a: "I", b: "II", c: "IV", d: "VI" },
  "3": { a: "II", b: "II", c: "IV", d: "VI" },
  "4": { a: "III", b: "III", c: "IV", d: "VI" },
  "5": { a: "IV", b: "IV", c: "IV", d: "VI" },
  "6": { a: "V", b: "V", c: "V", d: "VI" },
  "7": { a: "VI", b: "VI", c: "VI", d: "VI" },
};

const SailMatrixTable = ({ lookup }: { lookup?: SailLookup }) => {
  const fgrcRows = ["≤2", "3", "4", "5", "6", "7"];
  const arcCols = ["a", "b", "c", "d"];

  const activeRow = lookup ? (lookup.fgrc_used <= 2 ? "≤2" : String(Math.min(lookup.fgrc_used, 7))) : null;
  const activeCol = lookup?.arc_used?.toLowerCase().replace("arc-", "") || null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="border border-border p-1.5 bg-muted text-left">fGRC \ ARC</th>
            {arcCols.map(c => (
              <th key={c} className={cn("border border-border p-1.5 text-center uppercase", activeCol === c && "bg-primary/10 font-bold")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fgrcRows.map(row => (
            <tr key={row}>
              <td className={cn("border border-border p-1.5 font-medium bg-muted", activeRow === row && "bg-primary/10 font-bold")}>
                {row}
              </td>
              {arcCols.map(col => {
                const isActive = activeRow === row && activeCol === col;
                return (
                  <td key={col} className={cn(
                    "border border-border p-1.5 text-center",
                    isActive && "bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-offset-1"
                  )}>
                    {SAIL_MATRIX[row][col]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const SoraResultView = ({ data }: SoraResultViewProps) => {
  return (
    <div className="space-y-4">
      {data.summary && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm">{data.summary}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {data.sail && <Badge variant="outline">{data.sail}</Badge>}
        {data.residual_risk_level && (
          <Badge variant={riskColor(data.residual_risk_level)}>
            Rest-risiko: {data.residual_risk_level}
          </Badge>
        )}
        {data.recommendation && (
          <Badge variant={data.recommendation === "go" ? "default" : data.recommendation === "caution" ? "secondary" : "destructive"}>
            {data.recommendation.toUpperCase()}
          </Badge>
        )}
        {data.containment && (
          <Badge className={cn("border", containmentRobustnessColor(data.containment.robustness_level))}>
            Containment: {data.containment.robustness_level}
          </Badge>
        )}
      </div>

      <Accordion type="multiple" defaultValue={["env", "grc", "arc", "sail"]} className="w-full">
        <AccordionItem value="env">
          <AccordionTrigger>Operasjonsmiljø og ConOps</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <Field label="Miljø" value={data.environment} />
            <Field label="ConOps-beskrivelse" value={data.conops_summary} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="grc">
          <AccordionTrigger>Bakkebasert risiko (GRC)</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="iGRC (grunnrisiko)" value={data.igrc} />
              <Field label="fGRC (endelig)" value={data.fgrc} />
            </div>
            <Field label="Bakkemitigeringer" value={data.ground_mitigations} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="arc">
          <AccordionTrigger>Luftromsrisiko (ARC)</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Initial ARC" value={data.arc_initial} />
              <Field label="Residual ARC" value={data.arc_residual} />
            </div>
            <Field label="Luftromsmitigeringer" value={data.airspace_mitigations} />
          </AccordionContent>
        </AccordionItem>

        {/* SAIL Lookup - Step 7 */}
        <AccordionItem value="sail">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              Steg 7: SAIL-oppslag
              {data.sail && <Badge variant="outline" className="text-[10px]">{data.sail}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <SailMatrixTable lookup={data.sail_lookup} />
            {data.sail_lookup && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="fGRC brukt" value={data.sail_lookup.fgrc_used} />
                  <Field label="ARC brukt" value={data.sail_lookup.arc_used?.toUpperCase()} />
                </div>
                {data.sail_lookup.fgrc_adjustments && (
                  <Field label="Justeringer fra kommentarer" value={data.sail_lookup.fgrc_adjustments} />
                )}
                <Field label="SAIL-resultat" value={data.sail_lookup.result} />
              </div>
            )}
            {!data.sail_lookup && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="SAIL-nivå" value={data.sail} />
                <Field label="Rest-risiko" value={data.residual_risk_level} />
              </div>
            )}
            <Field label="Rest-risiko kommentar" value={data.residual_risk_comment} />
            <Field label="Operative begrensninger" value={data.operational_limits} />
          </AccordionContent>
        </AccordionItem>

        {/* Containment - Step 8 */}
        {data.containment && (
          <AccordionItem value="containment">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Steg 8: Containment
                <Badge className={cn("text-[10px] border", containmentRobustnessColor(data.containment.robustness_level))}>
                  {data.containment.robustness_level}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <Field label="Begrunnelse" value={data.containment.reasoning} />

              {data.containment.criteria && data.containment.criteria.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Kriterier</p>
                  <div className="space-y-3">
                    {data.containment.criteria.map((c, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/30 border space-y-1">
                        <p className="text-xs font-semibold">{c.criterion}</p>
                        <p className="text-xs">{c.requirement}</p>
                        <p className="text-[10px] text-muted-foreground italic">Dokumentasjon: {c.assurance}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.containment.fts_required && (
                <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300">FTS påkrevd</p>
                      {data.containment.fts_note && (
                        <p className="text-[10px] text-muted-foreground mt-1">{data.containment.fts_note}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {data.containment.tethered && (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-700 dark:text-blue-300">Forankret drone (tethered) — forenklede containment-kriterier gjelder</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* OSO Requirements - Step 9 */}
        {data.oso_requirements && data.oso_requirements.length > 0 && (
          <AccordionItem value="oso">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                Steg 9: OSO-krav
                <Badge variant="outline" className="text-[10px]">{data.oso_requirements.length} krav</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-border p-1.5 bg-muted text-left">OSO</th>
                      <th className="border border-border p-1.5 bg-muted text-left">Beskrivelse</th>
                      <th className="border border-border p-1.5 bg-muted text-center">Robusthet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.oso_requirements.map((oso, i) => (
                      <tr key={i}>
                        <td className="border border-border p-1.5 font-medium whitespace-nowrap">{oso.oso}</td>
                        <td className="border border-border p-1.5">{oso.description}</td>
                        <td className="border border-border p-1.5 text-center">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", robustnessColor(oso.robustness))}>
                            {oso.robustness} — {robustnessLabel(oso.robustness)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};
