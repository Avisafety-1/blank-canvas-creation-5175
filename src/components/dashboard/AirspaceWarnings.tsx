import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, AlertCircle, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface AirspaceWarningRaw {
  z_id: string;
  z_type: string;
  z_name: string;
  min_distance: number;
  route_inside: boolean;
  severity: string;
}

interface AirspaceWarning {
  zone_type: string;
  zone_name: string;
  distance_meters: number;
  is_inside: boolean;
  level: "warning" | "caution" | "note";
  message: string;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

interface AirspaceWarningsProps {
  latitude: number | null;
  longitude: number | null;
  routePoints?: RoutePoint[];
  cachedWarnings?: AirspaceWarning[];
  onAirspaceResult?: (warnings: AirspaceWarning[]) => void;
  showAll?: boolean;
}

export const AirspaceWarnings = ({ latitude, longitude, routePoints, cachedWarnings, onAirspaceResult, showAll }: AirspaceWarningsProps) => {
  const [warnings, setWarnings] = useState<AirspaceWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeWarning = (warning: AirspaceWarning): AirspaceWarning => {
    if (warning.zone_type === '5KM' && warning.is_inside) {
      return { ...warning, level: 'warning' };
    }
    return warning;
  };

  // Use cached warnings if available — skip RPC entirely
  useEffect(() => {
    if (cachedWarnings && cachedWarnings.length > 0) {
      const normalizedWarnings = cachedWarnings.map(normalizeWarning);
      setWarnings(normalizedWarnings);
      onAirspaceResult?.(normalizedWarnings);
      setLoading(false);
      return;
    }
  }, [cachedWarnings]);

  useEffect(() => {
    // Skip RPC if cached warnings are provided
    if (cachedWarnings) return;

    if (!latitude || !longitude) {
      setWarnings([]);
      return;
    }

    const checkAirspace = async () => {
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId2 = setTimeout(() => controller.abort(), 8000);
      try {
        const { data, error } = await supabase.rpc("check_mission_airspace", {
          p_lat: latitude,
          p_lng: longitude,
          p_route: routePoints && routePoints.length > 0 ? JSON.parse(JSON.stringify(routePoints)) : null,
        }, { signal: controller.signal } as any);

        clearTimeout(timeoutId2);

        if (error) {
          if (error.message?.includes('AbortError') || controller.signal.aborted) {
            setError("Luftromssjekk tok for lang tid. Prøv igjen.");
            return;
          }
          console.error("Error checking airspace:", error);
          return;
        }

        // Map raw RPC response to expected format
        const rawArray = (data as unknown as AirspaceWarningRaw[]) || [];
        const warningsArray: AirspaceWarning[] = rawArray.map((r) => {
          // Severity hierarchy: inside a zone is more severe, nearby is one step less
          const baseSeverity = r.severity; // WARNING, CAUTION, or INFO from DB
          const isCtrOrTiz = r.z_type === 'CTR' || r.z_type === 'TIZ';
          const is5km = r.z_type === '5KM';
          let level: AirspaceWarning["level"];
          
          if (is5km && r.route_inside) {
            // Inside a 5 km RPAS/Ninox approval zone must always be a red warning.
            level = "warning";
          } else if (r.route_inside) {
            // Inside: WARNING stays warning, CAUTION stays caution, INFO→caution
            level = baseSeverity === "WARNING" ? "warning" : "caution";
          } else {
            // Nearby (not inside) → downgrade one step
            level = baseSeverity === "WARNING" ? "caution" : baseSeverity === "CAUTION" ? "note" : "note";
          }
          const distMeters = Math.round(r.min_distance);
          let message: string;

          if (isCtrOrTiz) {
            if (r.route_inside) {
              message = `I kontrollert luftrom (${r.z_type} «${r.z_name}»). Maks høyde 120 meter AGL.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til kontrollert luftrom (${r.z_type} «${r.z_name}»), ${distStr} unna. Kontakt tårn ved høyere operasjoner.`;
            }
          } else if (is5km) {
            if (r.route_inside) {
              message = `Inne i 5 km-sonen rundt «${r.z_name}». Kontrollert luftrom — maks 120 m AGL. Søk godkjenning i Ninox.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til 5 km-sonen rundt «${r.z_name}», ${distStr} unna. Kontrollert luftrom — maks 120 m AGL. Søk godkjenning i Ninox.`;
            }
          } else if (r.z_type === 'NOTAM') {
            // z_name is now "A1234/26: UNMANNED ACFT (BLOS) WILL ..."
            const cleanName = (r.z_name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (r.route_inside) {
              message = `Aktiv NOTAM i operasjonsområdet: ${cleanName}. Sjekk restriksjoner.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Aktiv NOTAM ${distStr} unna: ${cleanName}`;
            }
          } else if (r.z_type === 'NATURVERN') {
            if (r.route_inside) {
              message = `Ruten går gjennom naturvernområde «${r.z_name}». Sjekk verneforskriften for eventuelle restriksjoner.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til naturvernområde «${r.z_name}», ${distStr} unna.`;
            }
          } else if (r.z_type === 'FERDSELSFORBUD') {
            if (r.route_inside) {
              message = `Ruten går gjennom område med ferdselsforbud «${r.z_name}». Droneflyvning kan være forbudt.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til område med ferdselsforbud «${r.z_name}», ${distStr} unna.`;
            }
          } else if (r.z_type === 'LANDINGSFORBUD') {
            if (r.route_inside) {
              message = `Ruten går gjennom område med landingsforbud «${r.z_name}». Landing/start forbudt.`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til område med landingsforbud «${r.z_name}», ${distStr} unna.`;
            }
          } else if (r.z_type === 'LAVFLYVING') {
            if (r.route_inside) {
              message = `Ruten går gjennom område med lavflyvingsforbud under 300m «${r.z_name}».`;
            } else {
              const distStr = distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km";
              message = `Nærhet til område med lavflyvingsforbud «${r.z_name}», ${distStr} unna.`;
            }
          } else if (r.route_inside) {
            message = `Ruten går gjennom ${r.z_type}-sone «${r.z_name}».`;
          } else {
            message = `Ruten er ${distMeters < 1000 ? distMeters + " m" : (distMeters / 1000).toFixed(1) + " km"} fra ${r.z_type}-sone «${r.z_name}».`;
          }

          return {
            zone_type: r.z_type,
            zone_name: r.z_name,
            distance_meters: distMeters,
            is_inside: r.route_inside,
            level,
            message,
          };
        });
        const severityOrder = { warning: 0, caution: 1, note: 2 };
        const sortedWarnings = warningsArray.sort(
          (a, b) => severityOrder[a.level] - severityOrder[b.level]
        );

        setWarnings(sortedWarnings);
        onAirspaceResult?.(sortedWarnings);
      } catch (err: any) {
        clearTimeout(timeoutId2);
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          setError("Luftromssjekk tok for lang tid. Prøv igjen.");
        } else {
          console.error("Error checking airspace:", err);
          setError("Kunne ikke sjekke luftrom. Prøv igjen.");
        }
      } finally {
        setLoading(false);
      }
    };

    // Debounce to avoid too many calls
    const timeoutId = setTimeout(checkAirspace, 500);
    return () => clearTimeout(timeoutId);
  }, [latitude, longitude, routePoints]);

  if (!latitude || !longitude) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Sjekker luftrom...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="default" className="border-amber-500 bg-amber-500/20 text-foreground [&>svg]:text-foreground mt-3">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle className="font-semibold text-foreground">Luftromssjekk feilet</AlertTitle>
        <AlertDescription className="text-sm mt-1 text-foreground">{error}</AlertDescription>
      </Alert>
    );
  }

  if (warnings.length === 0) {
    return null;
  }

  const firstWarning = warnings[0];
  const remainingWarnings = warnings.slice(1);
  const remainingCount = remainingWarnings.length;

  const renderAlert = (warning: AirspaceWarning, index: number) => {
    const isWarning = warning.level === "warning";
    const isCaution = warning.level === "caution";
    const isNote = warning.level === "note";

    return (
      <Alert
        key={index}
        variant="default"
        className={
          isWarning
            ? "border-destructive bg-destructive/20 text-foreground [&>svg]:text-foreground"
            : isCaution
            ? "border-amber-500 bg-amber-500/20 text-foreground [&>svg]:text-foreground"
            : "border-blue-500 bg-blue-500/20 text-foreground [&>svg]:text-foreground"
        }
      >
        {isWarning && <AlertTriangle className="h-5 w-5" />}
        {isCaution && <AlertCircle className="h-5 w-5" />}
        {isNote && <Info className="h-5 w-5" />}
        <AlertTitle className="font-semibold text-foreground">
          {isWarning && "ADVARSEL"}
          {isCaution && "FORSIKTIGHET"}
          {isNote && "INFORMASJON"}
        </AlertTitle>
        <AlertDescription className="text-sm mt-1 text-foreground">{warning.message}</AlertDescription>
      </Alert>
    );
  };

  // If showAll is true, render all warnings without collapsible
  if (showAll) {
    return (
      <div className="space-y-2 mt-3">
        {warnings.map((warning, index) => renderAlert(warning, index))}
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      {renderAlert(firstWarning, 0)}
      
      {remainingCount > 0 && (
        <Collapsible 
          key={`collapsible-${warnings.length}`}
          open={isExpanded} 
          onOpenChange={setIsExpanded}
        >
          <CollapsibleTrigger asChild>
            <button 
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2 cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>+{remainingCount} {remainingCount === 1 ? 'annen advarsel' : 'andre advarsler'}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            {remainingWarnings.map((warning, index) => renderAlert(warning, index + 1))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
