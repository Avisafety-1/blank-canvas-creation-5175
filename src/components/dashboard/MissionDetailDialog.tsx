import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Calendar, AlertTriangle, Pencil, ShieldCheck, Brain, Clock, CheckCircle2, Maximize2, Route, BarChart3, Radio } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AddMissionDialog } from "./AddMissionDialog";
import { AirspaceWarnings } from "./AirspaceWarnings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { MissionMapPreview } from "./MissionMapPreview";
import { ExpandedMapDialog } from "./ExpandedMapDialog";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionResourceSections } from "./MissionResourceSections";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskAssessmentTypeDialog } from "./RiskAssessmentTypeDialog";
import { MissionStatusDropdown } from "./MissionStatusDropdown";
import { FlightAnalysisDialog } from "./FlightAnalysisDialog";
import { NotamDialog } from "./NotamDialog";
import { DeviationReportsSection } from "./DeviationReportsSection";
import { MissionSoraRouteDocumentation } from "./MissionSoraRouteDocumentation";
import { MissionNotesDialog } from "./MissionNotesDialog";
import {
  statusColors,
  getAIRiskBadgeColor,
  getAIRiskLabel,
  formatAIRiskScore,
  getApprovalStatusColor,
  getSoraBadgeColor,
  canSubmitForApproval,
  shouldShowAIRiskBadge,
  shouldShowApprovalBadge,
  shouldShowSoraBadge,
} from "@/lib/oppdragHelpers";

type Mission = any;

interface MissionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onMissionUpdated?: () => void;
  onEditRoute?: (mission: any) => void;
}

export const MissionDetailDialog = ({ open, onOpenChange, mission, onMissionUpdated, onEditRoute }: MissionDetailDialogProps) => {
  const { companyId } = useAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskDialogInitialTab, setRiskDialogInitialTab] = useState<'input' | 'result' | 'history' | 'sora' | 'manual-sora'>('input');
  const [expandedMapOpen, setExpandedMapOpen] = useState(false);
  const [flightLogs, setFlightLogs] = useState<any[] | null>(null);
  const [liveMission, setLiveMission] = useState<any>(null);
  const [soraStatus, setSoraStatus] = useState<string | null>(null);
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false);
  const [has5kmZone, setHas5kmZone] = useState(false);
  const [ninoxConfirmOpen, setNinoxConfirmOpen] = useState(false);
  const [ninoxApproved, setNinoxApproved] = useState(false);
  const [cachedAirspaceWarnings, setCachedAirspaceWarnings] = useState<any[] | null>(
    mission?.airspaceWarnings ?? null
  );
  const [analysisTrack, setAnalysisTrack] = useState<any>(null);
  const companySettings = useCompanySettings();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const showApproval = companySettings.require_mission_approval || soraApprovalEnabled;
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [missionFlightLogs, setMissionFlightLogs] = useState<any[] | null>(null);
  const [notamDialogOpen, setNotamDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);

  // Reset cached warnings when mission changes
  useEffect(() => {
    setCachedAirspaceWarnings(mission?.airspaceWarnings ?? null);
  }, [mission?.id]);

  // Re-fetch mission data and SORA status when dialog opens
  useEffect(() => {
    if (!open || !mission?.id) {
      setLiveMission(null);
      setSoraStatus(null);
      setMissionFlightLogs(null);
      return;
    }
    const fetchLatest = async () => {
      const [missionRes, soraRes, logsRes] = await Promise.all([
        supabase.from("missions").select("*").eq("id", mission.id).single(),
        supabase.from("mission_sora").select("sora_status").eq("mission_id", mission.id).maybeSingle(),
        supabase.from("flight_logs").select("id, flight_date, flight_track, flight_duration_minutes, departure_location, landing_location")
          .eq("mission_id", mission.id).not("flight_track", "is", null).order("flight_date", { ascending: false }),
      ]);
      if (missionRes.data) {
        setLiveMission(missionRes.data);
        setNinoxApproved(!!(missionRes.data as any).ninox_approved);
      }
      setSoraStatus(soraRes.data?.sora_status ?? null);
      setMissionFlightLogs(logsRes.data || []);
    };
    fetchLatest();
  }, [open, mission?.id]);

  // Fetch flight logs when expanded map opens
  useEffect(() => {
    if (!expandedMapOpen || !mission?.id) return;
    if (mission.flightLogs) {
      setFlightLogs(mission.flightLogs);
      return;
    }
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("flight_logs")
        .select("id, flight_date, flight_track, flight_duration_minutes")
        .eq("mission_id", mission.id)
        .not("flight_track", "is", null);
      setFlightLogs(data || []);
    };
    fetchLogs();
  }, [expandedMapOpen, mission?.id, mission?.flightLogs]);

  const currentMission = liveMission ? { ...mission, ...liveMission } : mission;

  const memoizedFlightTracks = useMemo(() => {
    if (!flightLogs || flightLogs.length === 0) return null;
    const tracks = flightLogs
      .filter((log: any) => log.flight_track?.positions?.length > 0)
      .map((log: any) => ({
        positions: log.flight_track.positions,
        flightLogId: log.id,
        flightDate: log.flight_date,
      }));
    return tracks.length > 0 ? tracks : null;
  }, [flightLogs]);

  if (!mission) return null;

  const handleEditClick = () => {
    setEditDialogOpen(true);
  };

  const handleMissionUpdated = () => {
    if (onMissionUpdated) {
      onMissionUpdated();
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between gap-2 pr-8">
              <DialogTitle className="text-lg sm:text-xl">{currentMission.tittel}</DialogTitle>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onEditRoute && (
                  <Button size="sm" variant="outline" onClick={() => onEditRoute(currentMission)}>
                    <Route className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Rediger rute</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleEditClick}>
                  <Pencil className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Rediger</span>
                </Button>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setRiskTypeDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Risikovurdering
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setNotamDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <Radio className="w-4 h-4 mr-2" />
              NOTAM
            </Button>
          </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <MissionStatusDropdown
              missionId={currentMission.id}
              currentStatus={currentMission.status}
              onStatusChanged={() => {
                onMissionUpdated?.();
                supabase.from("missions").select("*").eq("id", currentMission.id).single().then(({ data }) => {
                  if (data) setLiveMission(data);
                });
              }}
              statusColors={statusColors}
              className="border"
              latitude={currentMission.latitude}
              longitude={currentMission.longitude}
            />
            {shouldShowApprovalBadge(showApproval, currentMission.approval_status) && (() => {
              const approvalStatus = currentMission.approval_status || 'not_approved';
              const approvalClickable = canSubmitForApproval(currentMission.approval_status);
              return (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getApprovalStatusColor(approvalStatus)} ${approvalClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  onClick={approvalClickable ? () => setApprovalConfirmOpen(true) : undefined}
                >
                  {approvalStatus === 'pending_approval' && <Clock className="h-3 w-3 mr-1" />}
                  {approvalStatus === 'approved' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {approvalStatus === 'pending_approval' ? 'Venter godkjenning' : approvalStatus === 'approved' ? 'Godkjent' : 'Ikke godkjent'}
                </Badge>
              );
            })()}
            {shouldShowAIRiskBadge(currentMission.aiRisk) && (
              <Badge 
                className={`${getAIRiskBadgeColor(currentMission.aiRisk.recommendation)} border cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={() => {
                  setRiskDialogInitialTab('history');
                  setRiskDialogOpen(true);
                }}
              >
                <Brain className="w-3 h-3 mr-1" />
                AI: {getAIRiskLabel(currentMission.aiRisk.recommendation)} ({formatAIRiskScore(currentMission.aiRisk.overall_score)})
              </Badge>
            )}
            {shouldShowSoraBadge(soraStatus) && (
              <Badge 
                variant="outline"
                className={`cursor-pointer hover:opacity-80 transition-opacity ${getSoraBadgeColor(soraStatus)}`}
                onClick={() => {
                  setRiskDialogInitialTab('manual-sora');
                  setRiskDialogOpen(true);
                }}
              >
                <ShieldCheck className="w-3 h-3 mr-1" />
                SORA: {soraStatus}
              </Badge>
            )}
            {has5kmZone && (
              <Badge
                className={`border cursor-pointer hover:opacity-80 transition-opacity ${
                  ninoxApproved
                    ? 'bg-green-500/20 text-green-900 border-green-500/30'
                    : 'bg-red-500/20 text-red-900 border-red-500/30'
                }`}
                onClick={() => { if (!ninoxApproved) setNinoxConfirmOpen(true); }}
              >
                <ShieldCheck className="w-3 h-3 mr-1" />
                {ninoxApproved ? 'Godkjent i Ninox' : 'Ikke godkjent i Ninox'}
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
                <p className="text-base break-all">{currentMission.lokasjon}</p>
              </div>
            </div>

          {(() => {
              const routeCoords = (currentMission.route as any)?.coordinates;
              const effectiveLat = currentMission.latitude ?? routeCoords?.[0]?.lat;
              const effectiveLng = currentMission.longitude ?? routeCoords?.[0]?.lng;
              const isCompleted = currentMission.status === "Fullført";
              const hasWeatherSnapshot = currentMission.weather_data_snapshot;
              
              if (!effectiveLat || !effectiveLng) return null;
              
              return (
                <>
                  <AirspaceWarnings 
                    latitude={effectiveLat} 
                    longitude={effectiveLng}
                    routePoints={routeCoords}
                    cachedWarnings={cachedAirspaceWarnings ?? undefined}
                    showAll={companySettings.show_all_airspace_warnings}
                    onAirspaceResult={(warnings) => {
                      setHas5kmZone(warnings.some(w => w.zone_type === '5KM'));
                      if (!cachedAirspaceWarnings && warnings.length > 0) {
                        setCachedAirspaceWarnings(warnings);
                        if (mission) {
                          mission.airspaceWarnings = warnings;
                        }
                      }
                    }}
                  />
                  <DroneWeatherPanel 
                    latitude={effectiveLat} 
                    longitude={effectiveLng}
                    savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
                  />
                </>
              );
            })()}

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tidspunkt</p>
                <p className="text-base">
                  {format(new Date(currentMission.tidspunkt), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
          </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-muted-foreground">Merknader</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Legg til merknad"
                aria-label="Legg til merknad"
                className="h-8 w-8 shrink-0"
                onClick={() => setNotesDialogOpen(true)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
            {currentMission.merknader ? (
              <p className="text-sm whitespace-pre-wrap">{currentMission.merknader}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen merknader</p>
            )}
          </div>

          <MissionResourceSections mission={currentMission} open={open} />

          <DeviationReportsSection missionId={currentMission?.id} open={open} />

          {/* Flight log analysis */}
          {missionFlightLogs && missionFlightLogs.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Flylogger ({missionFlightLogs.length})</p>
              <div className="space-y-1.5">
                {missionFlightLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium">
                        {new Date(log.flight_date).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {log.flight_duration_minutes} min
                        {log.departure_location && ` · ${log.departure_location}`}
                      </span>
                    </div>
                    {log.flight_track?.positions?.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setAnalysisTrack(log.flight_track);
                          setAnalysisOpen(true);
                        }}
                      >
                        <BarChart3 className="w-3.5 h-3.5 mr-1" />
                        Analyser
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentMission.latitude && currentMission.longitude && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Kartvisning</p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpandedMapOpen(true)}>
                  <Maximize2 className="w-3.5 h-3.5 mr-1" />
                  Utvid
                </Button>
              </div>
              <div 
                className="h-[200px] relative overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => setExpandedMapOpen(true)}
              >
                <MissionMapPreview
                  latitude={currentMission.latitude}
                  longitude={currentMission.longitude}
                  route={currentMission.route as any}
                  notam={currentMission.notam_text ? {
                    lat: currentMission.notam_center_lat_wgs84 ?? currentMission.latitude,
                    lng: currentMission.notam_center_lon_wgs84 ?? currentMission.longitude,
                    radiusNm: currentMission.notam_radius_nm ?? 0.5,
                    text: currentMission.notam_text,
                  } : null}
                />
              </div>
            </div>
          )}

          {currentMission.beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{currentMission.beskrivelse}</p>
            </div>
          )}

          {currentMission.merknader && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                  <p className="text-sm mt-1 text-amber-900 dark:text-amber-100">{currentMission.merknader}</p>
                </div>
              </div>
            </div>
          )}

          {/* Approver Comments */}
          {Array.isArray(currentMission.approver_comments) && currentMission.approver_comments.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Kommentarer fra godkjenner</p>
              <div className="space-y-2">
                {currentMission.approver_comments.map((c: any, i: number) => (
                  <div key={i} className="text-sm bg-muted/50 rounded-md p-2">
                    <span className="font-medium">Kommentar fra godkjenner {c.author_name}:</span>{' '}
                    {c.comment}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({new Date(c.created_at).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <MissionSoraRouteDocumentation route={currentMission.route} className="pt-4" />
        </div>
      </DialogContent>
    </Dialog>

    <AddMissionDialog
      open={editDialogOpen}
      onOpenChange={setEditDialogOpen}
      onMissionAdded={handleMissionUpdated}
      mission={currentMission}
    />

    <RiskAssessmentTypeDialog
      open={riskTypeDialogOpen}
      onOpenChange={setRiskTypeDialogOpen}
      onSelectAI={() => {
        setRiskTypeDialogOpen(false);
        setRiskDialogInitialTab('input');
        setRiskDialogOpen(true);
      }}
      onSelectManualSORA={() => {
        setRiskTypeDialogOpen(false);
        setRiskDialogInitialTab('manual-sora');
        setRiskDialogOpen(true);
      }}
    />

    <RiskAssessmentDialog
      open={riskDialogOpen}
      onOpenChange={(open) => {
        setRiskDialogOpen(open);
        if (!open) {
          setRiskDialogInitialTab('input');
          onMissionUpdated?.();
        }
      }}
      mission={currentMission}
      initialTab={riskDialogInitialTab}
      onSoraSaved={onMissionUpdated}
    />

    {currentMission.latitude && currentMission.longitude && (
      <ExpandedMapDialog
        open={expandedMapOpen}
        onOpenChange={setExpandedMapOpen}
        latitude={currentMission.latitude}
        longitude={currentMission.longitude}
        route={currentMission.route as any}
        flightTracks={memoizedFlightTracks}
        missionTitle={currentMission.tittel}
        missionId={currentMission.id}
        onSoraUpdated={onMissionUpdated}
        notam={currentMission.notam_text ? {
          lat: currentMission.notam_center_lat_wgs84 ?? currentMission.latitude,
          lng: currentMission.notam_center_lon_wgs84 ?? currentMission.longitude,
          radiusNm: currentMission.notam_radius_nm ?? 0.5,
          text: currentMission.notam_text,
        } : null}
      />
    )}

    {/* Approval Confirmation */}
    <AlertDialog open={approvalConfirmOpen} onOpenChange={setApprovalConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send til godkjenning?</AlertDialogTitle>
          <AlertDialogDescription>
            Er du sikker på at du vil sende dette oppdraget til godkjenning?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={async () => {
            // SORA-sjekk: krev SORA før godkjenning
            if (companySettings.require_sora_on_missions && !soraApprovalEnabled) {
              const { count } = await supabase
                .from('mission_risk_assessments')
                .select('id', { count: 'exact', head: true })
                .eq('mission_id', currentMission.id);
              const requiredSteps = companySettings.require_sora_steps ?? 1;
              if ((count ?? 0) < requiredSteps) {
                toast.error('Gjennomfør SORA først');
                setApprovalConfirmOpen(false);
                return;
              }
            }

            // Check if anyone can approve missions
            const { data: approvers, error: approverError } = await supabase
              .rpc('get_mission_approvers', { target_company_id: companyId! });

            if (approverError) {
              console.error('Error checking approvers:', approverError);
              toast.error('Kunne ikke sjekke godkjennere');
              setApprovalConfirmOpen(false);
              return;
            }
            
            if (!approvers || approvers.length === 0) {
              toast.error('Ingen i selskapet har rollen som godkjenner. Tildel rollen under Admin-panelet først.');
              setApprovalConfirmOpen(false);
              return;
            }
            
            await supabase
              .from('missions')
              .update({ approval_status: 'pending_approval', submitted_for_approval_at: new Date().toISOString() })
              .eq('id', currentMission.id);
            setApprovalConfirmOpen(false);
            onMissionUpdated?.();
            if (companyId) {
              try {
                await supabase.functions.invoke('send-notification-email', {
                  body: {
                    type: 'notify_mission_approval',
                    companyId,
                    mission: {
                      tittel: currentMission.tittel,
                      lokasjon: currentMission.lokasjon,
                      tidspunkt: currentMission.tidspunkt,
                      beskrivelse: currentMission.beskrivelse || '',
                    }
                  }
                });
              } catch (emailError) {
                console.error('Error sending approval notification:', emailError);
              }
            }
          }}>
            Send til godkjenning
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Ninox Confirmation */}
    <AlertDialog open={ninoxConfirmOpen} onOpenChange={setNinoxConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Godkjenn i Ninox?</AlertDialogTitle>
          <AlertDialogDescription>
            Bekreft at oppdraget er godkjent i Ninox.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={async () => {
            await supabase
              .from('missions')
              .update({ ninox_approved: true } as any)
              .eq('id', currentMission.id);
            setNinoxApproved(true);
            setNinoxConfirmOpen(false);
            onMissionUpdated?.();
          }}>
            Godkjenn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <FlightAnalysisDialog
      open={analysisOpen}
      onOpenChange={setAnalysisOpen}
      flightTrack={analysisTrack}
      flightDate={undefined}
      droneName={currentMission?.tittel}
    />

    <NotamDialog
      open={notamDialogOpen}
      onOpenChange={setNotamDialogOpen}
      mission={currentMission}
      onSaved={() => {
        onMissionUpdated?.();
        // Re-fetch live mission
        supabase.from("missions").select("*").eq("id", currentMission.id).single().then(({ data }) => {
          if (data) setLiveMission(data);
        });
      }}
    />

    <MissionNotesDialog
      open={notesDialogOpen}
      onOpenChange={setNotesDialogOpen}
      mission={currentMission}
      onSaved={() => {
        onMissionUpdated?.();
        supabase.from("missions").select("*").eq("id", currentMission.id).single().then(({ data }) => {
          if (data) setLiveMission(data);
        });
      }}
    />
    </>
  );
};
