import { OpenAIPMap, RouteData, RoutePoint, SoraSettings } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { SoraSettingsPanel } from "@/components/SoraSettingsPanel";
import { AdjacentAreaPanel } from "@/components/AdjacentAreaPanel";
import { calculateAdjacentRadius, computeSoraVolumePopulationDensity, type AdjacentAreaResult, type SoraPopulationDensityResult } from "@/lib/adjacentAreaCalculator";
import { calculateAlos } from "@/lib/alosCalculator";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
// soraGeometry imports removed — buffer computation moved to FlightHub2SendDialog
import { useAppHeartbeat } from "@/hooks/useAppHeartbeat";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Save, Undo, Trash2, Route, CheckCircle2, AlertTriangle, XCircle, MapPin, ExternalLink, Upload, Send, ChevronDown, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import safeskyLogo from "@/assets/safesky-logo.png";
import { parseKmlOrKmz } from "@/lib/kmlImport";
import { FlightHub2SendDialog } from "@/components/FlightHub2SendDialog";
import { pickBestDroneCatalogMatch } from "@/lib/droneCatalog";

interface RoutePlanningState {
  mode: "routePlanning";
  returnTo: string;
  existingRoute?: RouteData;
  formData?: any;
  selectedPersonnel?: string[];
  selectedEquipment?: string[];
  selectedDrones?: string[];
  selectedCustomer?: string | null;
  initialCenter?: [number, number];
  missionId?: string;
}

export default function KartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, companyId } = useAuth();
  useAppHeartbeat();
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [focusFlightId, setFocusFlightId] = useState<string | null>(null);
  
  
  // Route planning state
  const [isRoutePlanning, setIsRoutePlanning] = useState(false);
  const [routePlanningState, setRoutePlanningState] = useState<RoutePlanningState | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData>({ coordinates: [], totalDistance: 0 });
  
  // Pilot position state for VLOS measurement
  const [pilotPosition, setPilotPosition] = useState<RoutePoint | undefined>(undefined);
  const [isPlacingPilot, setIsPlacingPilot] = useState(false);
  
  // Editing existing mission route
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  
  // KML import
  const kmlInputRef = useRef<HTMLInputElement>(null);
  const [importingKml, setImportingKml] = useState(false);
  
  // SORA settings - company defaults loaded from company config
  const [companyBufferMode, setCompanyBufferMode] = useState<"corridor" | "convexHull">("corridor");
  const [companyFlightAltitude, setCompanyFlightAltitude] = useState(120);
  const [companyFlightGeography, setCompanyFlightGeography] = useState(0);
  const defaultSoraSettings = useMemo<SoraSettings>(() => ({
    enabled: false,
    flightAltitude: companyFlightAltitude,
    flightGeographyDistance: companyFlightGeography,
    contingencyDistance: 50,
    contingencyHeight: 30,
    groundRiskDistance: 100,
    bufferMode: companyBufferMode,
  }), [companyBufferMode, companyFlightAltitude, companyFlightGeography]);
  const [soraSettings, setSoraSettings] = useState<SoraSettings>(defaultSoraSettings);
  const [soraDroneId, setSoraDroneId] = useState<string | null>(null);
  const [soraDroneModel, setSoraDroneModel] = useState<string | undefined>(undefined);
  const [soraDroneMaxSpeed, setSoraDroneMaxSpeed] = useState<number | undefined>(undefined);
  const [showAdjacentArea, setShowAdjacentArea] = useState(false);
  const [showPopulationDensity, setShowPopulationDensity] = useState(true);
  const [adjacentResult, setAdjacentResult] = useState<AdjacentAreaResult | null>(null);
  const [soraDensityResult, setSoraDensityResult] = useState<SoraPopulationDensityResult | null>(null);
  const [soraDensityLoading, setSoraDensityLoading] = useState(false);
  const soraDensityCacheRef = useRef<Map<string, SoraPopulationDensityResult>>(new Map());
  const [soraOpen, setSoraOpen] = useState(false);
  const [adjacentOpen, setAdjacentOpen] = useState(false);

  // Fetch drone model name when soraDroneId changes
  useEffect(() => {
    if (!soraDroneId) { setSoraDroneModel(undefined); setSoraDroneMaxSpeed(undefined); return; }
    supabase.from('drones').select('modell').eq('id', soraDroneId).single().then(({ data }) => {
      setSoraDroneModel(data?.modell || undefined);
      // Also fetch max speed from drone_models catalog
      if (data?.modell) {
        (supabase as any).from('drone_models').select('name, max_wind_mps, max_speed_mps, characteristic_dimension_m').or(`name.ilike.%${data.modell}%,name.ilike.%${data.modell.replace(/^DJI\s+/i, "")}%`).limit(20).then(({ data: models }: any) => {
          const model = pickBestDroneCatalogMatch<{
            name: string;
            max_wind_mps: number | null;
            max_speed_mps: number | null;
            characteristic_dimension_m: number | null;
          }>((models ?? []) as any[], data.modell);
          const catalogSpeed = model?.max_speed_mps ?? (model?.max_wind_mps ? model.max_wind_mps * 2 : undefined);
          setSoraDroneMaxSpeed(catalogSpeed);
          setSoraSettings(prev => prev.droneId === soraDroneId ? {
            ...prev,
            droneName: data.modell,
            characteristicDimensionM: model?.characteristic_dimension_m ?? prev.characteristicDimensionM,
            groundSpeedMps: catalogSpeed ?? prev.groundSpeedMps,
          } : prev);
        });
      }
    });
  }, [soraDroneId]);

  useEffect(() => {
    if (soraSettings.droneId && soraSettings.droneId !== soraDroneId) {
      setSoraDroneId(soraSettings.droneId);
    }
  }, [soraSettings.droneId, soraDroneId]);

  // FlightHub 2 state
  const [hasFH2Token, setHasFH2Token] = useState(false);
  const [fh2DialogOpen, setFh2DialogOpen] = useState(false);

  // SORA buffer zones are now computed inside FlightHub2SendDialog

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Fetch company default buffer mode + FH2 token status
  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from("company_sora_config")
      .select("default_buffer_mode, default_flight_geography_m, default_flight_altitude_m")
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.default_buffer_mode) {
          const mode = data.default_buffer_mode as "corridor" | "convexHull";
          setCompanyBufferMode(mode);
          setSoraSettings(prev => prev.bufferMode === "corridor" ? { ...prev, bufferMode: mode } : prev);
        }
        if (data?.default_flight_geography_m != null && data.default_flight_geography_m > 0) {
          setCompanyFlightGeography(data.default_flight_geography_m);
          setSoraSettings(prev => prev.flightGeographyDistance === 0 ? { ...prev, flightGeographyDistance: data.default_flight_geography_m } : prev);
        }
        if (data?.default_flight_altitude_m != null && data.default_flight_altitude_m > 0) {
          setCompanyFlightAltitude(data.default_flight_altitude_m);
          setSoraSettings(prev => prev.flightAltitude === 120 ? { ...prev, flightAltitude: data.default_flight_altitude_m } : prev);
        }
      });
    // Check if FlightHub 2 is configured (edge function handles parent fallback)
    (async () => {
      const { data: cred } = await supabase
        .from("company_fh2_credentials")
        .select("company_id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cred) {
        setHasFH2Token(true);
        return;
      }
      // No own cred — ask edge function (it checks parent automatically)
      try {
        const { data: testData } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "test-connection" },
        });
        setHasFH2Token(!!testData?.token_ok);
      } catch {
        setHasFH2Token(false);
      }
    })();
  }, [companyId]);

  // Check for route planning mode or viewMission from navigation state
  useEffect(() => {
    const state = location.state as (RoutePlanningState & { focusFlightId?: string; viewMission?: any }) | null;
    if (state?.mode === "routePlanning") {
      setIsRoutePlanning(true);
      setRoutePlanningState(state);
      if (state.existingRoute) {
        setCurrentRoute(state.existingRoute);
        if (state.existingRoute.soraSettings) {
          setSoraSettings(state.existingRoute.soraSettings);
        }
          setShowAdjacentArea(!!state.existingRoute.adjacentAreaDocumentation?.enabled);
          setAdjacentResult((state.existingRoute.adjacentAreaDocumentation as any) || null);
      }
    }
    if (state?.focusFlightId) {
      setFocusFlightId(state.focusFlightId);
    }
    // Clear the navigation state to prevent re-triggering
    if (state) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleMissionClick = useCallback((mission: any) => {
    if (isRoutePlanning) return; // Don't open missions in route planning mode
    setSelectedMission(mission);
    setMissionDialogOpen(true);
  }, [isRoutePlanning]);

  const handleRouteChange = useCallback((route: RouteData) => {
    setCurrentRoute(route);
  }, []);

  const soraDensityCacheKey = useMemo(() => JSON.stringify({
    coordinates: currentRoute.coordinates.map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
    sora: {
      enabled: soraSettings.enabled,
      flightGeographyDistance: soraSettings.flightGeographyDistance,
      contingencyDistance: soraSettings.contingencyDistance,
      groundRiskDistance: soraSettings.groundRiskDistance,
      bufferMode: soraSettings.bufferMode ?? "corridor",
      groundSpeedMps: soraSettings.groundSpeedMps ?? soraDroneMaxSpeed ?? null,
    },
    adjacentRadiusM: showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : 0,
  }), [currentRoute.coordinates, soraSettings, showAdjacentArea, soraDroneMaxSpeed]);

  useEffect(() => {
    if (!soraSettings.enabled || !showPopulationDensity || currentRoute.coordinates.length < 2) {
      setSoraDensityResult(null);
      setSoraDensityLoading(false);
      return;
    }

    const cached = soraDensityCacheRef.current.get(soraDensityCacheKey);
    if (cached) {
      setSoraDensityResult(cached);
      setSoraDensityLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setSoraDensityLoading(true);
    computeSoraVolumePopulationDensity(
      currentRoute.coordinates,
      soraSettings,
      showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : undefined,
      ctrl.signal
    )
      .then((result) => {
        if (!ctrl.signal.aborted) {
          soraDensityCacheRef.current.set(soraDensityCacheKey, result);
          setSoraDensityResult(result);
          setSoraDensityLoading(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setSoraDensityResult(null);
          setSoraDensityLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [currentRoute.coordinates, soraSettings, showPopulationDensity, showAdjacentArea, soraDroneMaxSpeed, soraDensityCacheKey]);

  // KML import handler
  const handleKmlImport = async (file: File) => {
    setImportingKml(true);
    try {
      const parsed = await parseKmlOrKmz(file);
      setCurrentRoute(parsed);
      toast.success(`KML importert: ${parsed.coordinates.length} punkter · ${(parsed.totalDistance / 1000).toFixed(2)} km`);
    } catch (err: any) {
      toast.error(err?.message || 'Import feilet');
    } finally {
      setImportingKml(false);
      if (kmlInputRef.current) kmlInputRef.current.value = '';
    }
  };

  // Start route planning directly from /kart
  const handleStartRoutePlanning = () => {
    setIsRoutePlanning(true);
    setRoutePlanningState(null); // No state means started from /kart
    setCurrentRoute({ coordinates: [], totalDistance: 0 });
  };

  const handleSaveRoute = async () => {
    // Attach SORA settings to route data before saving
    const routeToSave: RouteData = {
      ...currentRoute,
      soraSettings: soraSettings.enabled ? soraSettings : undefined,
      adjacentAreaDocumentation: showAdjacentArea && adjacentResult ? {
        enabled: true,
        calculatedAt: new Date().toISOString(),
        adjacentRadiusM: adjacentResult.adjacentRadiusM,
        adjacentAreaKm2: adjacentResult.adjacentAreaKm2,
        totalPopulation: adjacentResult.totalPopulation,
        avgDensity: adjacentResult.avgDensity,
        threshold: adjacentResult.threshold,
        pass: adjacentResult.pass,
        uaSize: adjacentResult.uaSize,
        sail: adjacentResult.sail,
        populationDensityCategory: adjacentResult.populationDensityCategory,
        outdoorAssemblies: adjacentResult.outdoorAssemblies,
        requiredContainment: adjacentResult.requiredContainment,
        containmentLevel: adjacentResult.containmentLevel,
        statusText: adjacentResult.statusText,
        dataSource: adjacentResult.dataSource,
        method: adjacentResult.method,
        calculation: adjacentResult.calculation,
        driver: adjacentResult.driver,
        maxCellPopulation: adjacentResult.maxCellPopulation,
        gridResolutionM: adjacentResult.gridResolutionM,
      } : undefined,
    };

    if (editingMissionId) {
      // Direct save to existing mission
      const { error } = await supabase
        .from("missions")
        .update({ route: routeToSave as any })
        .eq("id", editingMissionId);
      
      if (error) {
        toast.error("Kunne ikke oppdatere ruten");
        console.error("Route update error:", error);
        return;
      }
      
      toast.success("Rute og SORA-grunnlag oppdatert");
      setIsRoutePlanning(false);
      setEditingMissionId(null);
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
      setPilotPosition(undefined);
      setSoraSettings(defaultSoraSettings);
      return;
    }

    if (routePlanningState) {
      // Coming from mission edit - go back there
      navigate(routePlanningState.returnTo, {
        state: {
          routeData: routeToSave,
          formData: routePlanningState.formData,
          selectedPersonnel: routePlanningState.selectedPersonnel,
          selectedEquipment: routePlanningState.selectedEquipment,
          selectedDrones: soraDroneId
            ? [...new Set([...(routePlanningState.selectedDrones || []), soraDroneId])]
            : routePlanningState.selectedDrones,
          selectedCustomer: routePlanningState.selectedCustomer,
          missionId: routePlanningState.missionId,
        }
      });
    } else {
      // Started from /kart - go to new mission dialog
      navigate('/oppdrag', {
        state: {
          routeData: routeToSave,
          openDialog: true,
          selectedDrones: soraDroneId ? [soraDroneId] : [],
        }
      });
    }
  };

  // Edit route for an existing mission
  const handleEditMissionRoute = useCallback((mission: any) => {
    const route = mission.route as RouteData | null;
    setEditingMissionId(mission.id);
    setIsRoutePlanning(true);
    setRoutePlanningState(null);
    setMissionDialogOpen(false);
    
    if (route?.coordinates?.length) {
      setCurrentRoute(route);
    } else {
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
    }
    
    if (route?.soraSettings) {
      setSoraSettings(route.soraSettings);
    } else {
      setSoraSettings(defaultSoraSettings);
    }
    setShowAdjacentArea(!!route?.adjacentAreaDocumentation?.enabled);
    setAdjacentResult((route?.adjacentAreaDocumentation as any) || null);
  }, [defaultSoraSettings]);

  const handleCancelRoute = () => {
    if (routePlanningState) {
      // Coming from mission edit - go back without saving
      navigate(routePlanningState.returnTo, {
        state: {
          formData: routePlanningState.formData,
          selectedPersonnel: routePlanningState.selectedPersonnel,
          selectedEquipment: routePlanningState.selectedEquipment,
          selectedDrones: routePlanningState.selectedDrones,
          selectedCustomer: routePlanningState.selectedCustomer,
        }
      });
    } else {
      // Started from /kart - just exit route planning mode
      setIsRoutePlanning(false);
      setCurrentRoute({ coordinates: [], totalDistance: 0 });
    }
  };

  const handleClearRoute = () => {
    setCurrentRoute({ coordinates: [], totalDistance: 0 });
    setPilotPosition(undefined);
  };

  const handleUndoPoint = () => {
    if (currentRoute.coordinates.length > 0) {
      const newCoords = currentRoute.coordinates.slice(0, -1);
      let totalDistance = 0;
      for (let i = 1; i < newCoords.length; i++) {
        const R = 6371;
        const dLat = (newCoords[i].lat - newCoords[i-1].lat) * Math.PI / 180;
        const dLng = (newCoords[i].lng - newCoords[i-1].lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(newCoords[i-1].lat * Math.PI / 180) * Math.cos(newCoords[i].lat * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        totalDistance += R * c;
      }
      setCurrentRoute({ coordinates: newCoords, totalDistance });
    }
  };

  const handleTogglePilotPlacement = () => {
    if (isPlacingPilot) {
      setIsPlacingPilot(false);
    } else {
      setIsPlacingPilot(true);
      toast.info("Klikk på kartet for å plassere pilotposisjon");
    }
  };

  const handlePilotPositionChange = useCallback((position: RoutePoint | undefined) => {
    setPilotPosition(position);
    setIsPlacingPilot(false);
    if (position) {
      toast.success("Pilotposisjon satt");
    }
  }, []);

  const handleRemovePilot = () => {
    setPilotPosition(undefined);
  };

  const handleOpenNotam = () => {
    window.open('https://www.ippc.no/ippc/index.jsp', '_blank');
  };

  // ALOS-based VLOS radius (falls back to 120 m when no drone selected)
  const alosInfo = useMemo(() => {
    if (!soraSettings.enabled) return null;
    return calculateAlos(soraSettings.characteristicDimensionM, soraDroneModel);
  }, [soraSettings.enabled, soraSettings.characteristicDimensionM, soraDroneModel]);

  const vlosRadiusM = alosInfo?.alosMaxM ?? 120;

  // Calculate VLOS distances
  const vlisInfo = useMemo(() => {
    if (!pilotPosition || currentRoute.coordinates.length === 0) {
      return null;
    }
    
    const VLOS_LIMIT = vlosRadiusM / 1000; // km
    let maxDistance = 0;
    let pointsOutside = 0;
    
    for (const point of currentRoute.coordinates) {
      const R = 6371; // Earth's radius in km
      const dLat = (point.lat - pilotPosition.lat) * Math.PI / 180;
      const dLng = (point.lng - pilotPosition.lng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(pilotPosition.lat * Math.PI / 180) * Math.cos(point.lat * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = R * c;
      
      if (dist > maxDistance) maxDistance = dist;
      if (dist > VLOS_LIMIT) pointsOutside++;
    }
    
    return {
      maxDistance,
      maxDistanceMeters: Math.round(maxDistance * 1000),
      pointsOutside,
      isWithinVLOS: pointsOutside === 0,
      vlosLimitMeters: vlosRadiusM,
    };
  }, [pilotPosition, currentRoute.coordinates, vlosRadiusM]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* Route Planning Controls - shown below header when active */}
      {isRoutePlanning && (
        <div className="bg-background border-b border-border px-3 pt-2 pb-1 sm:px-4 sm:pt-3 sm:pb-4 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          <div className="flex flex-col gap-2">
            <input
              ref={kmlInputRef}
              type="file"
              accept=".kml,.kmz"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleKmlImport(file);
              }}
            />

            <div className="sm:hidden">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-1.5">
                  <Route className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold text-foreground">Planlegg flyrute</h1>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentRoute.coordinates.length} punkt{currentRoute.coordinates.length !== 1 ? 'er' : ''}
                      {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => kmlInputRef.current?.click()}
                    disabled={importingKml}
                    className="h-8 px-2"
                    title="Importer KML/KMZ-fil"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenNotam}
                    className="h-8 px-1.5 text-[10px]"
                    title="Sjekk NOTAM (åpner ippc.no)"
                  >
                    IPPC
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://registrering.sensor.nsm.cloudgis.no/', '_blank')}
                    className="h-8 px-1.5 text-[10px]"
                    title="Søknad om flyging med sensor i sensorforbudssoner (NSM)"
                  >
                    Sensor
                  </Button>
                  {hasFH2Token && currentRoute.coordinates.length >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFh2DialogOpen(true)}
                      className="h-8 px-1.5 text-[10px]"
                      title="Send rute og SORA-korridor til DJI FlightHub 2"
                    >
                      <Send className="mr-0.5 h-3 w-3" />
                      FH2
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-0.5 flex items-center gap-2">
                <div className="min-w-0 flex flex-1 flex-wrap items-center gap-1.5">
                  {currentRoute.coordinates.length >= 3 && currentRoute.areaKm2 !== undefined && (
                    <div
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium",
                        currentRoute.areaKm2 <= 50
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : currentRoute.areaKm2 <= 150
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {currentRoute.areaKm2 <= 50 ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : currentRoute.areaKm2 <= 150 ? (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="leading-tight break-words">
                        <span>{currentRoute.areaKm2.toFixed(2)} km²</span>
                        {currentRoute.areaKm2 > 150 && <span> – for stort for SafeSky</span>}
                        {currentRoute.areaKm2 > 50 && currentRoute.areaKm2 <= 150 && " (stort)"}
                      </span>
                    </div>
                  )}
                  {vlisInfo && (
                    <div
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium shrink-0",
                        vlisInfo.isWithinVLOS
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {vlisInfo.isWithinVLOS ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="leading-tight break-words">
                        {vlisInfo.maxDistanceMeters}m
                        {!vlisInfo.isWithinVLOS && ` (${vlisInfo.pointsOutside} utenfor)`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 self-center">
                  <Button
                    variant={isPlacingPilot ? "default" : pilotPosition ? "secondary" : "outline"}
                    size="sm"
                    onClick={pilotPosition ? handleRemovePilot : handleTogglePilotPlacement}
                    className={cn("h-8 px-2", isPlacingPilot && "animate-pulse")}
                    title={pilotPosition ? "Fjern pilotposisjon" : isPlacingPilot ? "Klikk på kartet..." : "Plasser pilot"}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUndoPoint}
                    disabled={currentRoute.coordinates.length === 0}
                    className="h-8 px-2"
                    title="Angre siste punkt"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearRoute}
                    disabled={currentRoute.coordinates.length === 0}
                    className="h-8 px-2"
                    title="Nullstill rute"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelRoute}
                    className="h-8 px-2"
                    title="Avbryt"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveRoute}
                    disabled={currentRoute.coordinates.length < 2}
                    className="h-8 px-2"
                    title="Lagre rute"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 mr-auto">
                <Route className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">Planlegg flyrute</h1>
                  <p className="text-xs text-muted-foreground">
                    {currentRoute.coordinates.length} punkt{currentRoute.coordinates.length !== 1 ? 'er' : ''}
                    {currentRoute.totalDistance > 0 && ` • ${currentRoute.totalDistance.toFixed(2)} km`}
                  </p>
                </div>
              </div>

              {currentRoute.coordinates.length >= 3 && currentRoute.areaKm2 !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium",
                  currentRoute.areaKm2 <= 50
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : currentRoute.areaKm2 <= 150
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {currentRoute.areaKm2 <= 50 ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : currentRoute.areaKm2 <= 150 ? (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="leading-tight">
                    <span>{currentRoute.areaKm2.toFixed(2)} km²</span>
                    {currentRoute.areaKm2 > 150 && (
                      <>
                        <span className="hidden sm:inline"> – </span>
                        <span>for stort for SafeSky</span>
                      </>
                    )}
                    {currentRoute.areaKm2 > 50 && currentRoute.areaKm2 <= 150 && " (stort)"}
                  </span>
                </div>
              )}
              {vlisInfo && (
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium shrink-0",
                  vlisInfo.isWithinVLOS
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vlisInfo.isWithinVLOS ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="leading-tight whitespace-nowrap">
                    {vlisInfo.maxDistanceMeters}m
                    {!vlisInfo.isWithinVLOS && ` (${vlisInfo.pointsOutside} utenfor)`}
                  </span>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => kmlInputRef.current?.click()}
                disabled={importingKml}
                className="h-8 px-2 sm:px-3"
                title="Importer KML/KMZ-fil"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{importingKml ? 'Importerer…' : 'KML'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenNotam}
                className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                title="Sjekk NOTAM (åpner ippc.no)"
              >
                IPPC
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://registrering.sensor.nsm.cloudgis.no/', '_blank')}
                className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                title="Søknad om flyging med sensor i sensorforbudssoner (NSM)"
              >
                Sensor
              </Button>
              {hasFH2Token && currentRoute.coordinates.length >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFh2DialogOpen(true)}
                  className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs"
                  title="Send rute og SORA-korridor til DJI FlightHub 2"
                >
                  <Send className="h-3 w-3 mr-0.5 sm:mr-1" />
                  FH2
                </Button>
              )}
              <Button
                variant={isPlacingPilot ? "default" : pilotPosition ? "secondary" : "outline"}
                size="sm"
                onClick={pilotPosition ? handleRemovePilot : handleTogglePilotPlacement}
                className={cn(
                  "h-8 px-2 sm:px-3",
                  isPlacingPilot && "animate-pulse"
                )}
                title={pilotPosition ? "Fjern pilotposisjon" : isPlacingPilot ? "Klikk på kartet..." : "Plasser pilot"}
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">
                  {pilotPosition ? "Fjern pilot" : isPlacingPilot ? "Klikk..." : "Pilot"}
                </span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndoPoint}
                disabled={currentRoute.coordinates.length === 0}
                className="h-8 px-2 sm:px-3"
                title="Angre siste punkt"
              >
                <Undo className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Angre</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearRoute}
                disabled={currentRoute.coordinates.length === 0}
                className="h-8 px-2 sm:px-3"
                title="Nullstill rute"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Nullstill</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelRoute}
                className="h-8 px-2 sm:px-3"
                title="Avbryt"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Avbryt</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSaveRoute}
                disabled={currentRoute.coordinates.length < 2}
                className="h-8 px-2 sm:px-3"
                title="Lagre rute"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Lagre</span>
              </Button>
            </div>
          </div>
          
          {/* SORA shared header row */}
          <div className="border-t border-border">
            <div className="flex items-center justify-end gap-2 sm:gap-4 px-3 py-0.5 sm:py-2 sm:px-4">
              {/* Left: SORA volum trigger */}
              <button
                onClick={() => setSoraOpen((o) => !o)}
                className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="text-sm font-medium text-foreground"><span className="sm:hidden">Buffer</span><span className="hidden sm:inline">SORA volum</span></span>
                <Switch
                  checked={soraSettings.enabled}
                  onCheckedChange={(checked) => {
                    setSoraSettings((s) => ({ ...s, enabled: checked }));
                    if (checked) setShowPopulationDensity(true);
                    if (!checked) {
                      setShowAdjacentArea(false);
                      setSoraDensityResult(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-90"
                />
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", soraOpen && "rotate-180")} />
              </button>

              {/* Right: Adjacent area trigger (visible but greyed out when SORA disabled) */}
              <button
                onClick={() => soraSettings.enabled && setAdjacentOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-1.5 transition-opacity",
                  soraSettings.enabled ? "hover:opacity-80 cursor-pointer" : "opacity-40 cursor-not-allowed"
                )}
                disabled={!soraSettings.enabled}
              >
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <span className={cn(
                  "text-xs font-medium",
                  adjacentResult == null
                    ? "text-foreground"
                    : adjacentResult.requiredContainment === "Low"
                      ? "text-green-600 dark:text-green-400"
                      : adjacentResult.requiredContainment === "Medium"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                )}>Tilstøtende</span>
                <Switch
                  checked={showAdjacentArea}
                  onCheckedChange={(checked) => {
                    setShowAdjacentArea(checked);
                    if (checked) setAdjacentOpen(true);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-90"
                  disabled={!soraSettings.enabled}
                />
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", adjacentOpen && soraSettings.enabled && "rotate-180")} />
              </button>
            </div>

            {/* SORA Settings content */}
            <SoraSettingsPanel
              settings={soraSettings}
              onChange={setSoraSettings}
              onDroneSelected={setSoraDroneId}
              initialDroneId={soraSettings.droneId}
              open={soraOpen}
              onOpenChange={setSoraOpen}
              showPopulationDensity={showPopulationDensity}
              onShowPopulationDensityChange={setShowPopulationDensity}
              populationDensityResult={soraDensityResult}
              populationDensityLoading={soraDensityLoading}
            />

            {/* Adjacent Area content */}
            {soraSettings.enabled && (
              <AdjacentAreaPanel
                coordinates={currentRoute.coordinates}
                soraSettings={soraSettings}
                maxSpeedMps={soraSettings.groundSpeedMps ?? soraDroneMaxSpeed}
                active={showAdjacentArea}
                onShowAdjacentArea={setShowAdjacentArea}
                onResultChange={setAdjacentResult}
                open={adjacentOpen}
                onOpenChange={setAdjacentOpen}
                missionId={editingMissionId ?? routePlanningState?.missionId ?? null}
              />
            )}
          </div>
        </div>
      )}

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Back to mission button */}
        {/* SafeSky Attribution */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Traffic data provided by</span>
          <a href="https://www.safesky.app" target="_blank" rel="noopener noreferrer">
            <img src={safeskyLogo} alt="SafeSky" className="h-5 dark:invert" />
          </a>
        </div>
        
        <OpenAIPMap 
          onMissionClick={handleMissionClick}
          mode={isRoutePlanning ? "routePlanning" : "view"}
          existingRoute={routePlanningState?.existingRoute}
          onRouteChange={handleRouteChange}
          initialCenter={routePlanningState?.initialCenter}
          controlledRoute={currentRoute}
          onStartRoutePlanning={handleStartRoutePlanning}
          onPilotPositionChange={handlePilotPositionChange}
          pilotPosition={pilotPosition}
          pilotVlosRadiusM={vlosRadiusM}
          pilotAlosCalculation={alosInfo?.alosCalculation}
          isPlacingPilot={isPlacingPilot}
          focusFlightId={focusFlightId}
          onFocusFlightHandled={() => setFocusFlightId(null)}
          soraSettings={soraSettings}
          adjacentAreaRadiusM={showAdjacentArea ? calculateAdjacentRadius(soraSettings.groundSpeedMps ?? soraDroneMaxSpeed) : undefined}
          populationDensityCells={soraSettings.enabled && showPopulationDensity ? soraDensityResult?.cells : undefined}
          populationDensityCoveragePolygons={soraSettings.enabled && showPopulationDensity ? soraDensityResult?.coveragePolygons : undefined}
        />
      </div>

      {/* Mission Detail Dialog */}
      {!isRoutePlanning && (
        <MissionDetailDialog
          open={missionDialogOpen}
          onOpenChange={setMissionDialogOpen}
          mission={selectedMission}
          onEditRoute={handleEditMissionRoute}
        />
      )}

      {/* FlightHub 2 Send Dialog */}
      <FlightHub2SendDialog
        open={fh2DialogOpen}
        onOpenChange={setFh2DialogOpen}
        route={currentRoute}
        soraSettings={soraSettings.enabled ? soraSettings : undefined}
        droneModelName={soraDroneModel}
        pilotPosition={pilotPosition}
      />
    </div>
  );
}
