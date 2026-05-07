import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RouteData, SoraSettings } from "@/types/map";
import { generateDJIKMZ, type DJIExportOptions, DJI_DRONE_MODELS, matchDjiDroneModel } from "@/lib/kmzExport";
import { bufferPolyline, bufferPolygon, computeConvexHull } from "@/lib/soraGeometry";

interface FlightHub2SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: RouteData;
  soraSettings?: SoraSettings;
  droneModelName?: string;
  pilotPosition?: { lat: number; lng: number };
  initialRouteName?: string;
}

interface FH2Project {
  uuid: string;
  name: string;
}

const SORA_ZONES = [
  { key: "flightGeo", label: "Flight Geography", color: "#3B82F6" },
  { key: "contingency", label: "Contingency Volume", color: "#F59E0B" },
  { key: "groundRisk", label: "Ground Risk Buffer", color: "#EF4444" },
] as const;

const DJI_MODEL_OPTIONS = Object.entries(DJI_DRONE_MODELS).map(([key, val]) => ({
  key,
  label: val.label,
  enumValue: val.enumValue,
  subEnumValue: val.subEnumValue,
}));

export const FlightHub2SendDialog = ({
  open,
  onOpenChange,
  route,
  soraSettings,
  droneModelName,
  pilotPosition,
  initialRouteName,
}: FlightHub2SendDialogProps) => {
  const [projects, setProjects] = useState<FH2Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [routeName, setRouteName] = useState(initialRouteName || "Avisafe Route");
  const [routeMode, setRouteMode] = useState<"annotation" | "kmz" | "none">("annotation");
  const [sendAnnotation, setSendAnnotation] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [takeOffHeight, setTakeOffHeight] = useState(20);
  const [heightMode, setHeightMode] = useState<'relativeToStartPoint' | 'EGM96'>('relativeToStartPoint');
  const [speed, setSpeed] = useState(5);
  const [turnMode, setTurnMode] = useState<'toPointAndStopWithDiscontinuityCurvature' | 'toPointAndPassWithContinuityCurvature'>('toPointAndStopWithDiscontinuityCurvature');

  const autoMatch = droneModelName ? matchDjiDroneModel(droneModelName) : undefined;
  const [manualDjiModel, setManualDjiModel] = useState<string>("");

  const activeDjiModel = manualDjiModel
    ? DJI_MODEL_OPTIONS.find(m => m.key === manualDjiModel)
    : autoMatch
      ? { key: '', label: autoMatch.label, enumValue: autoMatch.enumValue, subEnumValue: autoMatch.subEnumValue }
      : undefined;

  // Compute three separate SORA buffer zones internally
  const soraZones = useMemo(() => {
    if (!soraSettings?.enabled || !route.coordinates?.length) return null;
    const coords = route.coordinates.filter(
      (p: any) => p && isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
    );
    if (coords.length < 1) return null;

    const refPoint = coords[0];
    const avgLat = coords.reduce((s: number, p: any) => s + p.lat, 0) / coords.length;
    const mode = soraSettings.bufferMode ?? "corridor";
    const isClosedRoute = coords.length >= 3 &&
      coords[0].lat === coords[coords.length - 1].lat &&
      coords[0].lng === coords[coords.length - 1].lng;

    const makeBuffer = (dist: number) => {
      if (dist <= 0) return null;
      if (mode === "convexHull" || isClosedRoute) {
        const hull = computeConvexHull(coords);
        return bufferPolygon(hull, dist, refPoint, avgLat);
      }
      return bufferPolyline(coords, dist, 16, refPoint, avgLat);
    };

    const fgDist = soraSettings.flightGeographyDistance;
    const contDist = fgDist + soraSettings.contingencyDistance;
    const grDist = contDist + soraSettings.groundRiskDistance;

    const flightGeo = makeBuffer(fgDist);
    const contingency = makeBuffer(contDist);
    const groundRisk = makeBuffer(grDist);

    const zones: Array<{ key: string; label: string; color: string; coords: Array<{ lat: number; lng: number }> }> = [];
    if (flightGeo && flightGeo.length >= 3) zones.push({ ...SORA_ZONES[0], coords: flightGeo });
    if (contingency && contingency.length >= 3) zones.push({ ...SORA_ZONES[1], coords: contingency });
    if (groundRisk && groundRisk.length >= 3) zones.push({ ...SORA_ZONES[2], coords: groundRisk });

    return zones.length > 0 ? zones : null;
  }, [route.coordinates, soraSettings]);

  useEffect(() => {
    if (open) {
      fetchProjects();
      setManualDjiModel("");
      setRouteName(initialRouteName || "Avisafe Route");
    }
  }, [open]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "list-projects" },
      });
      if (error) throw error;
      if (data?.code === 0 && data?.data?.list) {
        setProjects(data.data.list);
        if (data.data.list.length > 0 && !selectedProject) {
          setSelectedProject(data.data.list[0].uuid);
        }
        if (data.data.list.length === 0) {
          toast.info("Ingen prosjekter finnes under denne organisasjonen i FlightHub 2.");
        }
      } else if (data?.code === 200401) {
        toast.error("Ugyldig eller ikke-autorisert organisasjonsnøkkel. Sjekk nøkkelen under Admin → Mitt selskap.");
      } else {
        toast.error(data?.error || data?.message || "Kunne ikke hente prosjekter fra FlightHub 2");
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved tilkobling til FlightHub 2");
    } finally {
      setLoadingProjects(false);
    }
  };

  const generateKmzBase64 = async (): Promise<string> => {
    const flightHeight = soraSettings?.flightAltitude || 120;
    const opts: DJIExportOptions = {
      takeOffHeight,
      heightMode,
      speed,
      turnMode,
      droneEnumValue: activeDjiModel?.enumValue ?? 67,
      droneSubEnumValue: activeDjiModel?.subEnumValue ?? 0,
      takeOffPoint: route.coordinates.length > 0 ? route.coordinates[0] : undefined,
    };
    const blob = await generateDJIKMZ(routeName || "Avisafe Route", route, flightHeight, opts);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const buildZoneGeoJson = (zoneCoords: Array<{ lat: number; lng: number }>, color: string) => {
    const coords = zoneCoords.map((c) => [c.lng, c.lat, 0]);
    if (coords.length > 0) coords.push(coords[0]);
    return {
      type: "Feature",
      properties: { color, clampToGround: true },
      geometry: { type: "Polygon", coordinates: [coords] },
    };
  };

  const buildRouteLineGeoJson = (coords: Array<{ lat: number; lng: number }>, color: string) => {
    const lineCoords = coords.map((c) => [c.lng, c.lat, 0]);
    return {
      type: "Feature",
      properties: { color, clampToGround: true },
      geometry: { type: "LineString", coordinates: lineCoords },
    };
  };

  const handleSend = async () => {
    if (!selectedProject) { toast.error("Velg et prosjekt"); return; }
    setLoading(true);
    let routeKmzSuccess = false;
    let routeAnnotationSuccess = false;
    let annotationCount = 0;

    try {
      if (routeMode === "kmz" && route.coordinates.length >= 2) {
        const kmzBase64 = await generateKmzBase64();
        const droneEnum = activeDjiModel?.enumValue ?? 67;
        const droneSubEnum = activeDjiModel?.subEnumValue ?? 0;
        const deviceModelKey = `0-${droneEnum}-${droneSubEnum}`;
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "upload-route", projectUuid: selectedProject, kmzBase64, routeName, deviceModelKey },
        });
        if (error) throw error;
        if (data?.code === 0) {
          routeKmzSuccess = true;
        } else {
          const detail = data?.message || data?.raw || JSON.stringify(data);
          toast.error(`Rutefil: ${detail}`);
          console.error("[FH2] finish-upload response:", data);
        }
      } else if (routeMode === "annotation" && route.coordinates.length >= 2) {
        const geoJson = buildRouteLineGeoJson(route.coordinates, "#10B981");
        const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: {
            action: "create-annotation",
            projectUuid: selectedProject,
            name: routeName,
            desc: "Planlagt rute generert av Avisafe",
            geoJson,
            annotationType: 1,
          },
        });
        if (error) {
          console.error("[FH2] route annotation error:", error);
          toast.error(`Rute-annotasjon: ${error.message}`);
        } else if (data?.code === 0) {
          routeAnnotationSuccess = true;
        } else {
          toast.error(`Rute-annotasjon: ${data?.message || "Feil"}`);
        }
      }

      if (sendAnnotation && soraZones) {
        for (const zone of soraZones) {
          const geoJson = buildZoneGeoJson(zone.coords, zone.color);
          const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
            body: {
              action: "create-annotation",
              projectUuid: selectedProject,
              name: `${routeName} – ${zone.label}`,
              desc: `${zone.label} generert av Avisafe. Høyde: ${soraSettings?.flightAltitude || 120}m`,
              geoJson,
              annotationType: 2,
            },
          });
          if (error) {
            console.error(`[FH2] annotation error (${zone.label}):`, error);
            toast.error(`Annotasjon (${zone.label}): ${error.message}`);
          } else if (data?.code === 0) {
            annotationCount++;
          } else {
            toast.error(`Annotasjon (${zone.label}): ${data?.message || "Feil"}`);
          }
        }
      }

      if (routeKmzSuccess || routeAnnotationSuccess || annotationCount > 0) {
        const parts = [];
        if (routeKmzSuccess) parts.push("rutefil (KMZ)");
        if (routeAnnotationSuccess) parts.push("rute som annotasjon");
        if (annotationCount > 0) parts.push(`${annotationCount} SORA-soner`);
        toast.success(`Sendt til FlightHub 2: ${parts.join(" og ")}`);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved sending");
    } finally {
      setLoading(false);
    }
  };

  const hasAnnotation = !!soraZones;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Send til FlightHub 2
          </DialogTitle>
          <DialogDescription>
            Send rutefil og SORA-korridor til DJI FlightHub 2
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>FlightHub 2-prosjekt</Label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Henter prosjekter...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-destructive">Ingen prosjekter funnet. Sjekk at organisasjonsnøkkelen er gyldig.</p>
            ) : (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg prosjekt" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.uuid} value={p.uuid}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Navn på rute</Label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Skriv inn navn..." />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">DJI-dronemodell</Label>
            {autoMatch && !manualDjiModel ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <span>Automatisk gjenkjent: <strong className="text-foreground">{autoMatch.label}</strong></span>
                  <span className="text-xs">(fra {droneModelName})</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setManualDjiModel(Object.keys(DJI_DRONE_MODELS).find(k =>
                    DJI_DRONE_MODELS[k].enumValue === autoMatch.enumValue &&
                    DJI_DRONE_MODELS[k].subEnumValue === autoMatch.subEnumValue
                  ) || Object.keys(DJI_DRONE_MODELS)[0])}
                >
                  Velg annen modell manuelt
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {!droneModelName && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Ingen drone valgt i SORA-panelet. Velg DJI-modell manuelt – dette påvirker hvordan FlightHub 2 viser ruten.</span>
                  </div>
                )}
                {droneModelName && !autoMatch && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Kunne ikke matche «{droneModelName}» til en kjent DJI-modell. Velg manuelt.</span>
                  </div>
                )}
                <Select value={manualDjiModel || "__default"} onValueChange={(v) => setManualDjiModel(v === "__default" ? "" : v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Velg DJI-modell" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">Matrice 30 (standard)</SelectItem>
                    {DJI_MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoMatch && (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => setManualDjiModel("")}
                  >
                    Bruk automatisk gjenkjent modell
                  </button>
                )}
              </div>
            )}
          </div>

          {routeMode === "kmz" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">Flyparametre</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Flyhastighet (m/s)</Label>
                  <Input type="number" min={1} max={15} value={speed} onChange={(e) => setSpeed(Math.max(1, Math.min(15, Number(e.target.value))))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Takeoff-høyde (m)</Label>
                  <Input type="number" min={1.2} max={1500} step={0.1} value={takeOffHeight} onChange={(e) => setTakeOffHeight(Math.max(1.2, Math.min(1500, Number(e.target.value))))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Høydemodus</Label>
                  <Select value={heightMode} onValueChange={(v) => setHeightMode(v as any)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relativeToStartPoint">Relativ til startpunkt</SelectItem>
                      <SelectItem value="EGM96">EGM96 (havnivå)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Svingmodus</Label>
                  <Select value={turnMode} onValueChange={(v) => setTurnMode(v as any)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toPointAndStopWithDiscontinuityCurvature">Stopp i punkt</SelectItem>
                      <SelectItem value="toPointAndPassWithContinuityCurvature">Fly gjennom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sending av rute</Label>
              <RadioGroup
                value={routeMode}
                onValueChange={(v) => setRouteMode(v as "annotation" | "kmz" | "none")}
                className="space-y-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="annotation" id="mode-annotation" disabled={route.coordinates.length < 2} className="mt-0.5" />
                  <Label htmlFor="mode-annotation" className="text-sm cursor-pointer font-normal">
                    Send rute som kart-annotasjon (visuell linje)
                    <span className="text-muted-foreground ml-1">– anbefalt</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="kmz" id="mode-kmz" disabled={route.coordinates.length < 2} className="mt-0.5" />
                  <Label htmlFor="mode-kmz" className="text-sm cursor-pointer font-normal">
                    Send rutefil (KMZ for autopilot)
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="none" id="mode-none" className="mt-0.5" />
                  <Label htmlFor="mode-none" className="text-sm cursor-pointer font-normal">
                    Ikke send rute
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="send-annotation" checked={sendAnnotation && !!hasAnnotation} onCheckedChange={(c) => setSendAnnotation(!!c)} disabled={!hasAnnotation} />
              <Label htmlFor="send-annotation" className="text-sm cursor-pointer">
                Send SORA-soner som kartannotasjoner
                {hasAnnotation && <span className="text-muted-foreground ml-1">({soraZones!.length} soner)</span>}
                {!hasAnnotation && <span className="text-muted-foreground ml-1">(ikke tilgjengelig)</span>}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSend} disabled={loading || !selectedProject || (routeMode === "none" && !sendAnnotation)}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};