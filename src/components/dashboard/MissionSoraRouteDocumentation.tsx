import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  OUTDOOR_ASSEMBLIES_LABELS,
  POPULATION_DENSITY_LABELS,
  UA_SIZE_LABELS,
} from "@/lib/adjacentAreaCalculator";

interface MissionSoraRouteDocumentationProps {
  route: any;
  compact?: boolean;
  className?: string;
}

const fmt = (value: unknown, decimals = 0, unit = "") => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${unit}`;
};

const fmtDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
};

export const hasSoraRouteDocumentation = (route: any) =>
  !!route?.soraSettings?.enabled || !!route?.adjacentAreaDocumentation?.enabled;

export const MissionSoraRouteDocumentation = ({ route, compact = false, className }: MissionSoraRouteDocumentationProps) => {
  const sora = route?.soraSettings;
  const adjacent = route?.adjacentAreaDocumentation;

  if (!hasSoraRouteDocumentation(route)) return null;

  const rows: Array<{ section?: string; label: string; value: string }> = [];

  if (sora?.enabled) {
    rows.push(
      { section: "SORA volum", label: "Flight Geography", value: fmt(sora.flightGeographyDistance, 0, " m") },
      { label: "Contingency buffer", value: fmt(sora.contingencyDistance, 0, " m") },
      { label: "Contingency høyde", value: fmt(sora.contingencyHeight, 0, " m") },
      { label: "Ground Risk Buffer", value: fmt(sora.groundRiskDistance, 0, " m") },
      { label: "Flyhøyde", value: fmt(sora.flightAltitude, 0, " m AGL") },
      { label: "Buffermodus", value: sora.bufferMode === "convexHull" ? "Konveks" : "Rute-korridor" },
      { label: "Drone", value: sora.droneName || (sora.droneId ? "Valgt i ruteplanlegger" : "Ikke valgt") },
      { label: "CD", value: fmt(sora.characteristicDimensionM, 2, " m") },
      { label: "V0 / bakkehastighet", value: fmt(sora.groundSpeedMps, 1, " m/s") },
    );
  }

  if (adjacent?.enabled) {
    rows.push(
      { section: "Tilstøtende områder", label: "Tilstøtende radius", value: fmt((adjacent.adjacentRadiusM ?? 0) / 1000, 1, " km") },
      { label: "Areal", value: fmt(adjacent.adjacentAreaKm2, 1, " km²") },
      { label: "Innbyggere funnet", value: fmt(adjacent.totalPopulation, 0) },
      { label: "Gj.snitt tetthet", value: fmt(adjacent.avgDensity, 1, " pers/km²") },
      { label: "Datagrunnlag", value: adjacent.dataSource || (adjacent.gridResolutionM ? `SSB ${adjacent.gridResolutionM} m` : "SSB 250 m") },
      { label: "Beregning", value: adjacent.calculation || adjacent.method || "-" },
      { label: "Grense/kategori", value: POPULATION_DENSITY_LABELS[adjacent.populationDensityCategory as keyof typeof POPULATION_DENSITY_LABELS] ?? adjacent.populationDensityCategory ?? "-" },
      { label: "UA Size", value: UA_SIZE_LABELS[adjacent.uaSize as keyof typeof UA_SIZE_LABELS] ?? adjacent.uaSize ?? "-" },
      { label: "SAIL", value: adjacent.sail ? `SAIL ${adjacent.sail}` : "-" },
      { label: "Outdoor assemblies", value: OUTDOOR_ASSEMBLIES_LABELS[adjacent.outdoorAssemblies as keyof typeof OUTDOOR_ASSEMBLIES_LABELS] ?? adjacent.outdoorAssemblies ?? "-" },
      { label: "Required containment", value: adjacent.requiredContainment ?? "-" },
      { label: "Resultat", value: adjacent.statusText || (adjacent.pass ? "Innenfor beregningsgrunnlaget" : "Krever nærmere vurdering") },
      { label: "Beregnet", value: fmtDate(adjacent.calculatedAt) },
    );
  }

  return (
    <Collapsible className={cn("border-t border-border pt-2", className)}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 text-left text-muted-foreground hover:text-foreground",
          compact ? "text-[11px]" : "text-sm font-medium",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span>SORA buffer og tilstøtende områder</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent onClick={(e) => e.stopPropagation()}>
        <div className={cn("grid gap-x-3 gap-y-1 pt-2", compact ? "grid-cols-[minmax(0,1fr)_auto] text-[11px]" : "grid-cols-[minmax(0,220px)_1fr] text-sm")}>
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="contents">
              {row.section && <div className="col-span-2 pt-2 first:pt-0 text-xs font-semibold text-foreground">{row.section}</div>}
              <div className="text-muted-foreground">{row.label}</div>
              <div className="font-medium text-foreground text-right sm:text-left">{row.value}</div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};