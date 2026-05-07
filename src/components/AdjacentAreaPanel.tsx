import { useState, useEffect, useMemo, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Users, MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { RoutePoint, SoraSettings } from "@/types/map";
import {
  computeAdjacentAreaDensity,
  calculateAdjacentRadius,
  getDensityThreshold,
  deriveUaSizeFromSora,
  UA_SIZE_LABELS,
  POPULATION_DENSITY_LABELS,
  OUTDOOR_ASSEMBLIES_LABELS,
  type AdjacentAreaResult,
  type OutdoorAssembliesCategory,
  type SailLevel,
  type UaSizeKey,
} from "@/lib/adjacentAreaCalculator";

interface AdjacentAreaPanelProps {
  coordinates: RoutePoint[];
  soraSettings: SoraSettings;
  maxSpeedMps?: number;
  active?: boolean;
  onShowAdjacentArea?: (show: boolean) => void;
  onResultChange?: (result: AdjacentAreaResult | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  missionId?: string | null;
}

export function AdjacentAreaPanel({
  coordinates,
  soraSettings,
  maxSpeedMps,
  active = false,
  onShowAdjacentArea,
  onResultChange,
  open: controlledOpen,
  onOpenChange,
  missionId,
}: AdjacentAreaPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [shelterApplicable, setShelterApplicable] = useState(false);
  const [uaSizeOverride, setUaSizeOverride] = useState<UaSizeKey | "auto">("auto");
  const [sail, setSail] = useState<SailLevel>("II");
  const [outdoorAssemblies, setOutdoorAssemblies] = useState<OutdoorAssembliesCategory>("40k");
  const [result, setResult] = useState<AdjacentAreaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOnMap, setShowOnMap] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const adjacentMountedRef = useRef(false);
  const autoUaSize = useMemo(() => deriveUaSizeFromSora(soraSettings, shelterApplicable), [soraSettings, shelterApplicable]);
  const uaSize = uaSizeOverride === "auto" ? autoUaSize : uaSizeOverride;
  const effectiveMaxSpeed = soraSettings.groundSpeedMps ?? maxSpeedMps;

  useEffect(() => {
    if (!missionId) return;
    supabase
      .from("mission_sora")
      .select("sail")
      .eq("mission_id", missionId)
      .maybeSingle()
      .then(({ data }) => {
        const fetchedSail = data?.sail as SailLevel | null | undefined;
        if (["I", "II", "III", "IV", "V", "VI"].includes(fetchedSail ?? "")) setSail(fetchedSail!);
      });
  }, [missionId]);

  // Auto-compute when active (switch on) and inputs change.
  // Krever minst 2 rutepunkter — vi vil IKKE beregne rundt en enslig
  // start-/lokasjons-pin fra oppdraget, kun rundt selve flyruten.
  useEffect(() => {
    if (!active || !soraSettings.enabled || coordinates.length < 2) {
      if (!active) setResult(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    computeAdjacentAreaDensity(coordinates, soraSettings, effectiveMaxSpeed, { uaSize, sail, outdoorAssemblies }, ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          setResult({
            adjacentRadiusM: calculateAdjacentRadius(effectiveMaxSpeed),
            adjacentAreaKm2: 0,
            totalPopulation: 0,
            avgDensity: 0,
            threshold: getDensityThreshold("NoLimit"),
            pass: false,
            uaSize,
            sail,
            populationDensityCategory: "NoLimit",
            outdoorAssemblies,
            requiredContainment: "Error",
            containmentLevel: "Error",
            statusText: "Feil ved henting av data",
            error: err?.message ?? "Ukjent feil",
          });
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [active, coordinates, soraSettings, effectiveMaxSpeed, uaSize, sail, outdoorAssemblies]);

  useEffect(() => {
    if (!adjacentMountedRef.current) {
      adjacentMountedRef.current = true;
      return;
    }
    onShowAdjacentArea?.(showOnMap);
  }, [showOnMap, onShowAdjacentArea]);

  useEffect(() => {
    onResultChange?.(result);
  }, [result, onResultChange]);

  if (!soraSettings.enabled) return null;

  const radiusKm = (calculateAdjacentRadius(effectiveMaxSpeed) / 1000).toFixed(1);

  const contentJsx = (
    <div className="px-3 py-3 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          SORA 2.5 krever vurdering av gjennomsnittlig befolkningstetthet i tilstøtende område
          (fra bakkerisikobuffer til {radiusKm} km radius).
          Beregningen bruker SSB 250m befolkningsrutenett for høyere presisjon enn kartlagets 1 km rutenett.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">UA Size</Label>
            <Select value={uaSizeOverride} onValueChange={(v) => setUaSizeOverride(v as UaSizeKey | "auto")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto: {UA_SIZE_LABELS[autoUaSize]}</SelectItem>
                {Object.entries(UA_SIZE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">SAIL</Label>
            <Select value={sail} onValueChange={(v) => setSail(v as SailLevel)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["I", "II", "III", "IV", "V", "VI"].map((level) => (
                  <SelectItem key={level} value={level}>SAIL {level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {autoUaSize.startsWith("3m") && uaSizeOverride === "auto" && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2 sm:col-span-2">
              <Label className="text-xs">Shelter: Er personer i området beskyttet (innendørs/under robust struktur)?</Label>
              <Switch checked={shelterApplicable} onCheckedChange={setShelterApplicable} />
            </div>
          )}

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Outdoor assemblies innen 1 km av OPS volume</Label>
            <Select value={outdoorAssemblies} onValueChange={(v) => setOutdoorAssemblies(v as OutdoorAssembliesCategory)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OUTDOOR_ASSEMBLIES_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Henter SSB befolkningsdata…</span>
          </div>
        ) : result ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="text-muted-foreground">Tilstøtende radius</div>
              <div className="font-medium">{(result.adjacentRadiusM / 1000).toFixed(1)} km</div>

              <div className="text-muted-foreground">Areal (donut)</div>
              <div className="font-medium">{result.adjacentAreaKm2.toFixed(1)} km²</div>

              <div className="text-muted-foreground">Innbyggere funnet</div>
              <div className="font-medium">{result.totalPopulation.toLocaleString("nb-NO")}</div>

              <div className="text-muted-foreground">Gj.snitt tetthet</div>
              <div className="font-medium">{result.avgDensity.toFixed(1)} pers/km²</div>

              {result.gridResolutionM && (
                <>
                  <div className="text-muted-foreground">Datagrunnlag</div>
                  <div className="font-medium">SSB {result.gridResolutionM} m</div>
                </>
              )}

              <div className="text-muted-foreground">Tetthetskategori</div>
              <div className="font-medium">
                {POPULATION_DENSITY_LABELS[result.populationDensityCategory]}
              </div>

              <div className="text-muted-foreground">UA Size</div>
              <div className="font-medium">{UA_SIZE_LABELS[result.uaSize]}</div>

              <div className="text-muted-foreground">Required containment</div>
              <div className="font-medium">{result.requiredContainment}</div>

              <div className="text-muted-foreground">Outdoor assemblies</div>
              <div className="font-medium">
                {OUTDOOR_ASSEMBLIES_LABELS[result.outdoorAssemblies]}
              </div>
            </div>

            {/* Status */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                result.pass
                  ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
              )}
            >
              {result.pass ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{result.statusText}</span>
            </div>

            {result.error && (
              <p className="text-xs text-destructive">{result.error}</p>
            )}

            {result.calculation && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {result.calculation}
              </p>
            )}

          </div>
        ) : coordinates.length < 2 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Planlegg en rute (minst 2 punkter) for å beregne tilstøtende område.
            Oppdragets start-/lokasjonspunkt teller ikke som rute.
          </p>
        ) : null}
    </div>
  );

  // Export result and loading for parent trigger badge
  const badgeJsx = result && !loading ? (
    <span className={cn(
      "ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
      result.pass
        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    )}>
      {result.pass ? "OK" : "OVER"}
    </span>
  ) : null;

  // Controlled mode: render content only
  if (controlledOpen !== undefined) {
    return open ? contentJsx : null;
  }

  // Standalone mode
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-muted/60 hover:bg-muted rounded-lg text-sm font-medium transition-colors">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          <span>Tilstøtende område</span>
          {badgeJsx}
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {contentJsx}
      </CollapsibleContent>
    </Collapsible>
  );
}
