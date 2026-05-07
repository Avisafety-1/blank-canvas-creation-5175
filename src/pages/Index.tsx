import droneBackground from "@/assets/drone-background.png";

import { DocumentSection } from "@/components/dashboard/DocumentSection";
import { AISearchBar } from "@/components/dashboard/AISearchBar";
import { StatusPanel } from "@/components/dashboard/StatusPanel";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { IncidentsSection } from "@/components/dashboard/IncidentsSection";
import { MissionsSection } from "@/components/dashboard/MissionsSection";
import { KPIChart } from "@/components/dashboard/KPIChart";
import { NewsSection } from "@/components/dashboard/NewsSection";
import { DraggableSection } from "@/components/dashboard/DraggableSection";
import { ActiveFlightsSection } from "@/components/dashboard/ActiveFlightsSection";
import { Shield, Clock, Play, Square, Radio, MapPin, AlertTriangle, Upload, ChevronDown, Loader2 } from "lucide-react";
import { LogFlightTimeDialog } from "@/components/LogFlightTimeDialog";
import { UploadDroneLogDialog } from "@/components/UploadDroneLogDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { DashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { useFlightTimer } from "@/hooks/useFlightTimer";
import { StartFlightDialog } from "@/components/StartFlightDialog";
import { PasskeyPromptDialog } from "@/components/PasskeyPromptDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { dashboardComponentToModule } from "@/config/trainingModules";

const STORAGE_KEY = "dashboard-layout";

const defaultLayout = [
  { id: "documents", component: "documents" },
  { id: "news", component: "news" },
  { id: "calendar", component: "calendar" },
  { id: "status", component: "status" },
  { id: "missions", component: "missions" },
  { id: "incidents", component: "incidents" },
  { id: "kpi", component: "kpi" },
];

const Index = () => {
  const { t } = useTranslation();
  const { user, loading, isApproved, profileLoaded, djiFlightlogEnabled, ardupilotFlightlogEnabled, checkSubscription, authRefreshing, authInitialized, refetchUserInfo, underTraining, hasTrainingModuleAccess } = useAuth();
  const hasFlightLogUpload = djiFlightlogEnabled || ardupilotFlightlogEnabled;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Handle checkout redirect
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Abonnement aktivert! Velkommen til AviSafe.');
      checkSubscription();
      setSearchParams({}, { replace: true });
    } else if (checkout === 'cancelled') {
      toast.info('Betaling ble avbrutt.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);
  const dashboardRealtime = useDashboardRealtime();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, permission: pushPermission, subscribe: pushSubscribe } = usePushNotifications();

  // Defer dashboard data fetching to avoid saturating connection pool
  const [readyToFetch, setReadyToFetch] = useState(false);
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    const timer = setTimeout(() => setReadyToFetch(true), 300);
    return () => {
      clearTimeout(timer);
      abortControllerRef.current.abort();
    };
  }, []);

  // Auto-enable push notifications for PWA users (one-time prompt)
  useEffect(() => {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches 
               || (window.navigator as any).standalone === true;
    
    if (!isPWA || !pushSupported || pushSubscribed || pushLoading || pushPermission === 'denied') return;
    if (localStorage.getItem('pwa-push-auto-prompted')) return;
    
    localStorage.setItem('pwa-push-auto-prompted', 'true');
    pushSubscribe();
  }, [pushSupported, pushSubscribed, pushLoading, pushPermission, pushSubscribe]);
  const [layout, setLayout] = useState(defaultLayout);
  const [logFlightDialogOpen, setLogFlightDialogOpen] = useState(false);
  const [uploadDroneLogOpen, setUploadDroneLogOpen] = useState(false);
  const [prefilledDuration, setPrefilledDuration] = useState<number | undefined>(undefined);
  const [approvalRetried, setApprovalRetried] = useState(false);

  // Auto-retry once when approval status seems wrong (transient query failure)
  useEffect(() => {
    if (profileLoaded && !isApproved && !authRefreshing && !approvalRetried && user) {
      const timer = setTimeout(() => {
        setApprovalRetried(true);
        refetchUserInfo();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [profileLoaded, isApproved, authRefreshing, approvalRetried, user, refetchUserInfo]);
  const [startFlightConfirmOpen, setStartFlightConfirmOpen] = useState(false);
  const [pendingFlightData, setPendingFlightData] = useState<{
    missionId: string | null;
    flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }>;
    dronetagDeviceId: string | null;
    startPosition: { lat: number; lng: number } | null;
    pilotName: string | null;
    startTime: Date | null;
    publishMode: 'none' | 'advisory' | 'live_uav';
    completedChecklistIds: string[];
  } | null>(null);
  
  const { isActive, startTime, elapsedSeconds, missionId: activeMissionId, publishMode, completedChecklistIds, dronetagDeviceId: activeFlightDronetagId, startFlight, prepareEndFlight, endFlight, formatElapsedTime } = useFlightTimer();
  
  // Track if DroneTag positions are being recorded
  const [trackingStatus, setTrackingStatus] = useState<'checking' | 'recording' | 'not_recording'>('checking');
  const [hasActiveFlights, setHasActiveFlights] = useState(false);
  // Check for recent DroneTag positions when flight is active with real-time updates
  useEffect(() => {
    if (!isActive || !activeFlightDronetagId || !startTime) {
      setTrackingStatus('checking');
      return;
    }

    let resolvedDeviceId: string | null = null;

    const checkTrackingStatus = async () => {
      try {
        const { data: device } = await supabase
          .from('dronetag_devices')
          .select('device_id')
          .eq('id', activeFlightDronetagId)
          .single();

        if (!device) {
          setTrackingStatus('not_recording');
          return null;
        }

        resolvedDeviceId = device.device_id;

        const { data: positions, error } = await supabase
          .from('dronetag_positions')
          .select('id')
          .eq('device_id', device.device_id)
          .gte('timestamp', startTime.toISOString())
          .limit(1);

        if (error) {
          console.error('Error checking tracking status:', error);
          setTrackingStatus('not_recording');
          return device.device_id;
        }

        setTrackingStatus(positions && positions.length > 0 ? 'recording' : 'not_recording');
        return device.device_id;
      } catch (err) {
        console.error('Error checking tracking status:', err);
        setTrackingStatus('not_recording');
        return null;
      }
    };

    checkTrackingStatus();

    // Use the shared flights channel for dronetag_positions updates
    const unregister = dashboardRealtime.registerFlights('dronetag_positions', (payload) => {
      if (resolvedDeviceId && payload?.new?.device_id === resolvedDeviceId) {
        setTrackingStatus('recording');
      }
    });

    return () => {
      unregister();
    };
  }, [isActive, activeFlightDronetagId, startTime, dashboardRealtime]);

  const handleStartFlight = () => {
    setStartFlightConfirmOpen(true);
  };

  const confirmStartFlight = async (
    missionId?: string, 
    selectedPublishMode?: 'none' | 'advisory' | 'live_uav', 
    checklistIds?: string[],
    startPosition?: { lat: number; lng: number },
    pilotName?: string,
    dronetagDeviceId?: string
  ) => {
    setStartFlightConfirmOpen(false);
    const success = await startFlight(missionId, selectedPublishMode || 'none', checklistIds || [], startPosition, pilotName, dronetagDeviceId);
    if (success) {
      const modeMessages = {
        none: t('flight.flightStarted'),
        advisory: t('flight.flightStartedAdvisory'),
        live_uav: t('flight.flightStartedLiveUav'),
      };
      toast.success(modeMessages[selectedPublishMode || 'none']);
    }
  };

  const handleEndFlight = async () => {
    if (!isActive) {
      toast.error(t('flight.noActiveFlightError'));
      return;
    }
    
    // Prepare data WITHOUT ending the flight - flight continues running
    const result = await prepareEndFlight();
    if (result) {
      setPrefilledDuration(result.elapsedMinutes);
      setPendingFlightData({
        missionId: result.missionId,
        flightTrack: result.flightTrack,
        dronetagDeviceId: result.dronetagDeviceId,
        startPosition: result.startPosition,
        pilotName: result.pilotName,
        startTime: result.startTime,
        publishMode: result.publishMode,
        completedChecklistIds: result.completedChecklistIds,
      });
      setLogFlightDialogOpen(true);
    }
  };

  const handleFlightLogged = async () => {
    // NOW actually end the flight when user confirms logging
    await endFlight();
    setPrefilledDuration(undefined);
    setPendingFlightData(null);
    toast.success(t('flight.flightEnded'));
  };

  const handleLogFlightDialogClose = (open: boolean) => {
    setLogFlightDialogOpen(open);
    if (!open && !isActive) {
      // Only clear pending data if flight has been ended (user confirmed logging)
      setPrefilledDuration(undefined);
      setPendingFlightData(null);
    }
    // If flight is still active (user cancelled dialog), keep pending data for next attempt
  };

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  useEffect(() => {
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        setLayout(JSON.parse(savedLayout));
      } catch (e) {
        console.error("Failed to parse saved layout:", e);
      }
    }
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newLayout = [...items];
        const [movedItem] = newLayout.splice(oldIndex, 1);
        newLayout.splice(newIndex, 0, movedItem);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
        toast.success(t('common.layoutUpdated'));

        return newLayout;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img 
            src="/avisafe-logo-text.png" 
            alt="AviSafe" 
            className="h-20 w-auto mx-auto mb-4 animate-pulse" 
          />
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const isOfflineWithCachedSession = !navigator.onLine && user;

  // Don't show "pending approval" until profile has actually loaded
  if (!user || (!profileLoaded && !isOfflineWithCachedSession)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img src="/avisafe-logo-text.png" alt="AviSafe" className="h-16 w-auto mx-auto mb-4 animate-pulse" />
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isApproved && !isOfflineWithCachedSession && !authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img src="/avisafe-logo-text.png" alt="AviSafe" className="h-16 w-auto mx-auto mb-4 animate-pulse" />
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isApproved && !isOfflineWithCachedSession && !authRefreshing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <img 
            src="/avisafe-logo-text.png" 
            alt="AviSafe" 
            className="h-20 w-auto mx-auto mb-4" 
          />
          <h2 className="text-2xl font-bold mb-2">{t('auth.pendingApproval')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('auth.pendingDescription')}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => refetchUserInfo()}>
              {t('common.tryAgain', 'Prøv igjen')}
            </Button>
            <Button onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}>{t('auth.backToLogin')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const abortSignal = abortControllerRef.current.signal;

  const renderSection = (component: string) => {
    if (component === "kpi" && !hasTrainingModuleAccess("status") && !hasTrainingModuleAccess("resources")) return null;
    const moduleKey = dashboardComponentToModule(component);
    if (moduleKey && component !== "kpi" && !hasTrainingModuleAccess(moduleKey)) return null;

    // Defer heavy data-fetching sections until readyToFetch is true
    const isDeferred = ["documents", "missions", "incidents", "status", "kpi"].includes(component);
    if (isDeferred && !readyToFetch) return null;

    switch (component) {
      case "documents":
        return <DocumentSection abortSignal={abortSignal} />;
      case "news":
        return <NewsSection />;
      case "status":
        return <StatusPanel />;
      case "missions":
        return <MissionsSection abortSignal={abortSignal} />;
      case "calendar":
        return <CalendarWidget />;
      case "incidents":
        return <IncidentsSection abortSignal={abortSignal} />;
      case "kpi":
        return <KPIChart />;
      default:
        return null;
    }
  };

  const canRenderDashboardComponent = (component: string) => {
    if (component === "kpi") return hasTrainingModuleAccess("status") || hasTrainingModuleAccess("resources");
    const moduleKey = dashboardComponentToModule(component);
    return !moduleKey || hasTrainingModuleAccess(moduleKey);
  };

  return (
    <DashboardRealtimeContext.Provider value={dashboardRealtime}>
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.3)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">

        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          {/* Mobile-only flight buttons */}
          {!underTraining && <div className="flex flex-col gap-2 mb-3 lg:hidden">
            {/* Mobile-only: log flight / upload dropdown */}
            {hasFlightLogUpload ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full gap-2 justify-center" variant="secondary">
                    <Clock className="w-4 h-4" />
                    {t('dronelog.logOrUpload', 'Logg flytid / Last opp flylogg')}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1.5">
                  <DropdownMenuItem onClick={() => setLogFlightDialogOpen(true)} className="py-2.5 px-3 text-sm gap-2.5">
                    <Clock className="w-4 h-4" />
                    {t('dronelog.logManually', 'Logg flytid manuelt')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setUploadDroneLogOpen(true)} className="py-2.5 px-3 text-sm gap-2.5">
                    <Upload className="w-4 h-4" />
                    {t('dronelog.uploadDjiLog', 'Last opp flylogg')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                onClick={() => setLogFlightDialogOpen(true)}
                className="w-full gap-2"
                variant="secondary"
              >
                <Clock className="w-4 h-4" />
                {t('actions.logFlightTime')}
              </Button>
            )}
            
            {/* Active flight timer indicator */}
            {isActive && (
              <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 text-center flex flex-col gap-1">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-foreground" />
                  <span className="text-foreground font-mono text-sm">
                    {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                  </span>
                  {publishMode !== 'none' && (
                    <Radio className="w-4 h-4 text-primary animate-pulse" />
                  )}
                </div>
                {/* DroneTag tracking status */}
                {activeFlightDronetagId && (
                  <div className={`flex items-center justify-center gap-1 text-xs ${
                    trackingStatus === 'recording' 
                      ? 'text-green-700 dark:text-green-400' 
                      : trackingStatus === 'not_recording'
                      ? 'text-yellow-700 dark:text-yellow-400'
                      : 'text-muted-foreground'
                  }`}>
                    {trackingStatus === 'recording' ? (
                      <>
                        <MapPin className="w-3 h-3" />
                        <span>{t('flight.trackRecording', 'Spor registreres')}</span>
                      </>
                    ) : trackingStatus === 'not_recording' ? (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('flight.trackNotRecording', 'Ingen DroneTag-data')}</span>
                      </>
                    ) : (
                      <span>{t('common.checking', 'Sjekker...')}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={handleStartFlight}
                disabled={isActive}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-1" />
                {t('actions.startFlight')}
              </Button>
              <Button 
                onClick={handleEndFlight}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <Square className="w-4 h-4 mr-1" />
                {t('actions.endFlight')}
              </Button>
            </div>
          </div>}

            {/* Mobile: Active flights */}
            {hasTrainingModuleAccess("missions") && <div className="lg:hidden mb-3 sm:mb-4">
              <ActiveFlightsSection onHasFlightsChange={setHasActiveFlights} />
            </div>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={layout.map((item) => item.id)} strategy={rectSortingStrategy}>
              <div className="space-y-3 sm:space-y-4">
                {/* Top Row - News and Status */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:items-stretch">
                  <div className="lg:col-span-9 flex flex-col">
                    {layout
                      .filter((item) => item.component === "news")
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id} className="flex-1 flex flex-col">
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                    {/* Mobile: AI Search Bar between News and Status */}
                    <div className="lg:hidden mt-3 sm:mt-4">
                      <AISearchBar />
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    {layout
                      .filter((item) => item.component === "status" && canRenderDashboardComponent(item.component))
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>
                </div>

                {/* Mobile/Tablet: Missions right after Status */}
                <div className="lg:hidden">
                  {layout
                    .filter((item) => item.component === "missions" && canRenderDashboardComponent(item.component))
                    .map((item) => (
                      <DraggableSection key={`mobile-${item.id}`} id={item.id}>
                        {renderSection(item.component)}
                      </DraggableSection>
                    ))}
                </div>

                {/* Main Row - Sidebars with center content */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:items-stretch">
                  {/* Left Column */}
                  <div className="lg:col-span-3 flex flex-col gap-3 sm:gap-4">
                    {layout
                      .filter((item) => ["documents", "calendar"].includes(item.component) && canRenderDashboardComponent(item.component))
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id} className={item.component === "calendar" ? "flex-1 flex flex-col" : ""}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>

                  {/* Center Column - Drone space and missions */}
                  <div className="lg:col-span-6 flex flex-col gap-3 sm:gap-4 h-full">
                    {/* Flight Log buttons */}
                    {!underTraining && <div className="flex flex-col gap-2">
                      {hasFlightLogUpload ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button className="w-full gap-2 hidden lg:flex justify-center" variant="secondary">
                              <Clock className="w-4 h-4" />
                              {t('dronelog.logOrUpload', 'Logg flytid / Last opp flylogg')}
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-1.5">
                            <DropdownMenuItem onClick={() => setLogFlightDialogOpen(true)} className="py-2.5 px-3 text-sm gap-2.5">
                              <Clock className="w-4 h-4" />
                              {t('dronelog.logManually', 'Logg flytid manuelt')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setUploadDroneLogOpen(true)} className="py-2.5 px-3 text-sm gap-2.5">
                              <Upload className="w-4 h-4" />
                              {t('dronelog.uploadDjiLog', 'Last opp flylogg')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button 
                          onClick={() => setLogFlightDialogOpen(true)}
                          className="w-full gap-2 hidden lg:flex"
                          variant="secondary"
                        >
                          <Clock className="w-4 h-4" />
                          {t('actions.logFlightTime')}
                        </Button>
                      )}
                      
                      {/* Active flight timer indicator - Desktop */}
                      {isActive && (
                        <div className="hidden lg:flex flex-col p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <Clock className="w-4 h-4 text-foreground" />
                            <span className="text-foreground font-mono text-sm">
                              {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                            </span>
                            {publishMode !== 'none' && (
                              <Radio className="w-4 h-4 text-primary animate-pulse" />
                            )}
                          </div>
                          {/* DroneTag tracking status */}
                          {activeFlightDronetagId && (
                            <div className={`flex items-center justify-center gap-1 text-xs ${
                              trackingStatus === 'recording' 
                                ? 'text-green-700 dark:text-green-400' 
                                : trackingStatus === 'not_recording'
                                ? 'text-yellow-700 dark:text-yellow-400'
                                : 'text-muted-foreground'
                            }`}>
                              {trackingStatus === 'recording' ? (
                                <>
                                  <MapPin className="w-3 h-3" />
                                  <span>{t('flight.trackRecording', 'Spor registreres')}</span>
                                </>
                              ) : trackingStatus === 'not_recording' ? (
                                <>
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{t('flight.trackNotRecording', 'Ingen DroneTag-data')}</span>
                                </>
                              ) : (
                                <span>{t('common.checking', 'Sjekker...')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Start/End flight buttons - Desktop */}
                      <div className="hidden lg:flex gap-2">
                        <Button 
                          onClick={handleStartFlight}
                          disabled={isActive}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        >
                          <Play className="w-4 h-4 mr-1" />
                          {t('actions.startFlight')}
                        </Button>
                        <Button 
                          onClick={handleEndFlight}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Square className="w-4 h-4 mr-1" />
                          {t('actions.endFlight')}
                        </Button>
                      </div>
                    </div>}

                    {/* Active flights - Desktop */}
                    {hasTrainingModuleAccess("missions") && <div className="hidden lg:block">
                      <ActiveFlightsSection onHasFlightsChange={setHasActiveFlights} />
                    </div>}

                    {/* AI Search Bar - Desktop */}
                    <div className="hidden lg:block">
                      <AISearchBar />
                    </div>

                    {/* Missions - Desktop only (mobile shows after status) */}
                    <div className="mt-auto hidden lg:block">
                      {layout &&
                        layout.length > 0 &&
                        layout
                          .filter((item) => item.component === "missions" && canRenderDashboardComponent(item.component))
                          .map((item) => (
                            <DraggableSection key={item.id} id={item.id}>
                              {renderSection(item.component)}
                            </DraggableSection>
                          ))}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="lg:col-span-3 flex flex-col gap-3 sm:gap-4">
                    {layout
                      .filter((item) => item.component === "incidents" && canRenderDashboardComponent(item.component))
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id} className="flex-1">
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                    {layout
                      .filter((item) => item.component === "kpi" && canRenderDashboardComponent(item.component))
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </main>
      </div>

      {/* Log Flight Time Dialog */}
      <LogFlightTimeDialog 
        open={logFlightDialogOpen} 
        onOpenChange={handleLogFlightDialogClose}
        prefilledDuration={prefilledDuration}
        safeskyMode={pendingFlightData?.publishMode || publishMode}
        completedChecklistIds={pendingFlightData?.completedChecklistIds || completedChecklistIds}
        prefilledMissionId={pendingFlightData?.missionId || activeMissionId || undefined}
        flightTrack={pendingFlightData?.flightTrack}
        dronetagDeviceId={pendingFlightData?.dronetagDeviceId || undefined}
        startPosition={pendingFlightData?.startPosition || undefined}
        pilotName={pendingFlightData?.pilotName || undefined}
        flightStartTime={pendingFlightData?.startTime || undefined}
        onFlightLogged={handleFlightLogged}
        onStopTimer={async () => {
          // End flight without logging - user cancelled
          await endFlight();
          setPrefilledDuration(undefined);
          setPendingFlightData(null);
          toast.info(t('flight.flightEndedWithoutLog', 'Flytur avsluttet uten logging'));
        }}
      />

      {/* Upload DJI DroneLog Dialog */}
      <UploadDroneLogDialog
        open={uploadDroneLogOpen}
        onOpenChange={setUploadDroneLogOpen}
      />

      {/* Start Flight Dialog */}
      <StartFlightDialog 
        open={startFlightConfirmOpen} 
        onOpenChange={setStartFlightConfirmOpen}
        onStartFlight={confirmStartFlight}
      />

      {/* Passkey prompt after first login */}
      <PasskeyPromptDialog />
    </div>
    </DashboardRealtimeContext.Provider>
  );
};

export default Index;
