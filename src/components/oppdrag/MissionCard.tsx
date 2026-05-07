import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MapPin, Calendar, Users, Plane, Package, FileText, Download,
  Edit, AlertTriangle, Route, Ruler, Navigation, Clock, Radio,
  ClipboardCheck, Trash2, ShieldCheck, Brain, ChevronDown, Info,
  Send, CheckCircle2, Upload, Building2, BarChart3, Radio as RadioIcon
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getResourceConflictsForMission, ResourceConflict } from "@/hooks/useResourceConflicts";
import { ResourceConflictWarning } from "@/components/dashboard/ResourceConflictWarning";
import { MissionStatusDropdown } from "@/components/dashboard/MissionStatusDropdown";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionMapPreview } from "@/components/dashboard/MissionMapPreview";
import { ExpandedMapDialog } from "@/components/dashboard/ExpandedMapDialog";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { MissionNotesDialog } from "@/components/dashboard/MissionNotesDialog";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { ChecklistBadges } from "@/components/oppdrag/ChecklistBadges";
import { FlightAnalysisDialog } from "@/components/dashboard/FlightAnalysisDialog";
import { DeviationReportsSection } from "@/components/dashboard/DeviationReportsSection";
import { MissionSoraRouteDocumentation } from "@/components/dashboard/MissionSoraRouteDocumentation";
import {
  statusColors,
  incidentSeverityColors,
  incidentStatusColors,
  getAIRiskBadgeColor,
  getAIRiskLabel,
  formatAIRiskScore,
  getApprovalStatusColor,
  getSoraBadgeColor,
  getNotamBadgeColor,
  canSubmitForApproval,
  shouldShowAIRiskBadge,
  shouldShowApprovalBadge,
  shouldShowSoraBadge,
} from "@/lib/oppdragHelpers";

type Mission = any;

export interface MissionCardProps {
  mission: Mission;
  missions: Mission[];
  isAdmin: boolean;
  importingKml: boolean;
  kmlImportMissionId: string | null;
  onEdit: (mission: Mission) => void;
  onDelete: (mission: Mission) => void;
  onNewRiskAssessment: (mission: Mission) => void;
  onNotam?: (mission: Mission) => void;
  onSubmitForApproval: (mission: Mission) => void;
  onExportPdf: (mission: Mission) => void;
  onExportKmz: (mission: Mission) => void;
  onImportKml: (missionId: string) => void;
  onOpenSora: (missionId: string) => void;
  onExpandMap?: (mission: Mission) => void;
  onIncidentClick: (incident: any) => void;
  onDocumentClick: (doc: any) => void;
  onChecklistPicker: (mission: Mission) => void;
  onExecuteChecklist: (missionId: string) => void;
  onReportIncident: (mission: Mission) => void;
  fetchMissions: () => void;
  onRiskBadgeClick: (mission: Mission) => void;
  hasFh2Connection?: boolean;
  onSendToFH2?: (mission: Mission) => void;
}

export const MissionCard = ({
  mission,
  missions,
  isAdmin,
  importingKml,
  kmlImportMissionId,
  onEdit,
  onDelete,
  onNewRiskAssessment,
  onNotam,
  onSubmitForApproval,
  onExportPdf,
  onExportKmz,
  onImportKml,
  onOpenSora,
  onExpandMap,
  onIncidentClick,
  onDocumentClick,
  onChecklistPicker,
  onExecuteChecklist,
  onReportIncident,
  fetchMissions,
  onRiskBadgeClick,
  hasFh2Connection,
  onSendToFH2,
}: MissionCardProps) => {
  const navigate = useNavigate();
  const { companyId, departmentsEnabled } = useAuth();
  const [has5kmZone, setHas5kmZone] = useState(false);
  const [ninoxConfirmOpen, setNinoxConfirmOpen] = useState(false);
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false);
  const [ninoxApproved, setNinoxApproved] = useState(!!mission.ninox_approved);
  const [expandedMapOpen, setExpandedMapOpen] = useState(false);
  const [analysisTrack, setAnalysisTrack] = useState<any>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const companySettings = useCompanySettings();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const showApproval = companySettings.require_mission_approval || soraApprovalEnabled;
  const approvalStatus = mission.approval_status || 'not_approved';
  const approvalClickable = canSubmitForApproval(mission.approval_status);

  const handleNinoxConfirm = async () => {
    const { error } = await supabase
      .from('missions')
      .update({ ninox_approved: true } as any)
      .eq('id', mission.id);
    if (!error) {
      setNinoxApproved(true);
      fetchMissions();
      toast.success('Ninox-godkjenning bekreftet');
    }
    setNinoxConfirmOpen(false);
  };

  const handleSubmitForApproval = () => {
    setApprovalConfirmOpen(false);
    onSubmitForApproval(mission);
  };

  return (
    <>
    <GlassCard id={`mission-${mission.id}`} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
        <div className="space-y-2 flex-1 w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg sm:text-xl font-semibold text-foreground">{mission.tittel}</h3>
            {departmentsEnabled && mission.company_id !== companyId && mission.company_name && (
              <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                <Building2 className="h-3 w-3" />
                {mission.company_name}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MissionStatusDropdown
              missionId={mission.id}
              currentStatus={mission.status}
              onStatusChanged={fetchMissions}
              statusColors={statusColors}
              className="text-xs"
              latitude={mission.latitude}
              longitude={mission.longitude}
            />
            {shouldShowApprovalBadge(showApproval, mission.approval_status) && (
              <Badge
                variant="outline"
                className={`text-xs ${getApprovalStatusColor(approvalStatus)} ${approvalClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={approvalClickable ? (e) => {
                  e.stopPropagation();
                  setApprovalConfirmOpen(true);
                } : undefined}
              >
                {approvalStatus === 'pending_approval' && <Clock className="h-3 w-3 mr-1" />}
                {approvalStatus === 'approved' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {approvalStatus === 'pending_approval' ? 'Venter på godkjenning' : approvalStatus === 'approved' ? 'Godkjent' : 'Ikke godkjent'}
              </Badge>
            )}
            {shouldShowAIRiskBadge(mission.aiRisk) && (
              <Badge 
                variant="outline" 
                className={`text-xs ${getAIRiskBadgeColor(mission.aiRisk.recommendation)} cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRiskBadgeClick(mission);
                }}
              >
                <Brain className="h-3 w-3 mr-1" />
                AI: {getAIRiskLabel(mission.aiRisk.recommendation)} ({formatAIRiskScore(mission.aiRisk.overall_score)})
              </Badge>
            )}
            {shouldShowSoraBadge(mission.sora) && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                SORA: {mission.sora.sora_status}
              </Badge>
            )}
            {(mission.checklist_ids?.length > 0) && (
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                  mission.checklist_ids.every((id: string) =>
                    mission.checklist_completed_ids?.includes(id)
                  )
                    ? 'bg-green-500/20 text-green-900 border-green-500/30'
                    : 'bg-gray-500/20 text-gray-700 border-gray-500/30'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onExecuteChecklist(mission.id);
                }}
              >
                <ClipboardCheck className="h-3 w-3 mr-1" />
                {mission.checklist_ids.every((id: string) =>
                  mission.checklist_completed_ids?.includes(id)
                )
                  ? 'Sjekkliste utført'
                  : 'Utfør sjekkliste/r'}
              </Badge>
            )}
            {mission.notam_text && (
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                  mission.notam_submitted_at
                    ? getNotamBadgeColor(true)
                    : getNotamBadgeColor(false)
                }`}
                onClick={(e) => { e.stopPropagation(); onNotam?.(mission); }}
              >
                <RadioIcon className="h-3 w-3 mr-1" />
                NOTAM
              </Badge>
            )}
            {has5kmZone && (
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                  ninoxApproved
                    ? 'bg-green-500/20 text-green-900 border-green-500/30'
                    : 'bg-red-500/20 text-red-900 border-red-500/30'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!ninoxApproved) setNinoxConfirmOpen(true);
                }}
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                {ninoxApproved ? 'Godkjent i Ninox' : 'Ikke godkjent i Ninox'}
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="w-full sm:w-auto">
              <span>Flere valg</span>
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
            <DropdownMenuItem onClick={() => onEdit(mission)}>
              <Edit className="h-4 w-4 mr-2" />
              Rediger
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNewRiskAssessment(mission)}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Ny risikovurdering
            </DropdownMenuItem>
            {onNotam && (
              <DropdownMenuItem onClick={() => onNotam(mission)}>
                <RadioIcon className="h-4 w-4 mr-2" />
                NOTAM
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onChecklistPicker(mission)}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Tilknytt sjekkliste
            </DropdownMenuItem>
            {showApproval && canSubmitForApproval(mission.approval_status) && (
              <DropdownMenuItem onClick={() => setApprovalConfirmOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Send til godkjenning
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExportPdf(mission)}>
              <Download className="h-4 w-4 mr-2" />
              Eksporter PDF
            </DropdownMenuItem>
            {(mission.route as { coordinates?: any[] } | null)?.coordinates?.length > 0 && (
              <>
                <DropdownMenuItem onClick={() => onExportKmz(mission)}>
                  <Navigation className="h-4 w-4 mr-2" />
                  Eksporter KMZ
                </DropdownMenuItem>
                {hasFh2Connection && onSendToFH2 && (
                  <DropdownMenuItem onClick={() => onSendToFH2(mission)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Send til FlightHub 2
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuItem onClick={() => onImportKml(mission.id)} disabled={importingKml}>
              <Upload className="h-4 w-4 mr-2" />
              {importingKml && kmlImportMissionId === mission.id ? 'Importerer…' : 'Importer KML/KMZ'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReportIncident(mission)}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Rapporter hendelse
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(mission)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Slett
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">Lokasjon</p>
            <p className="text-foreground">{mission.lokasjon}</p>
            {mission.latitude && mission.longitude && (
              <p className="text-xs text-muted-foreground">
                {mission.latitude.toFixed(5)}, {mission.longitude.toFixed(5)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">Tidspunkt</p>
            <p className="text-foreground">
              {mission.tidspunkt ? format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb }) : "Ikke angitt"}
            </p>
            {mission.slutt_tidspunkt && (() => {
              try {
                return <p className="text-xs text-muted-foreground">
                  til {format(new Date(mission.slutt_tidspunkt), "dd. MMMM HH:mm", { locale: nb })}
                </p>;
              } catch { return null; }
            })()}
          </div>
        </div>
      </div>

      {/* Created By */}
      {mission.created_by_name && (
        <div className="text-sm">
          <span className="text-muted-foreground">Opprettet av: </span>
          <span className="text-foreground">{mission.created_by_name}</span>
        </div>
      )}

      {/* Customer Info */}
      {mission.customers && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">KUNDE</p>
          <div className="space-y-1">
            <p className="text-sm text-foreground">{mission.customers.navn}</p>
            {mission.customers.kontaktperson && (
              <p className="text-xs text-muted-foreground">
                Kontakt: {mission.customers.kontaktperson}
              </p>
            )}
            {(mission.customers.telefon || mission.customers.epost) && (
              <p className="text-xs text-muted-foreground">
                {[mission.customers.telefon, mission.customers.epost].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/50">
        {/* Personnel */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">PERSONELL</p>
          </div>
          {mission.personnel?.length > 0 ? (
            <ul className="space-y-2">
              {mission.personnel.map((p: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  p.profile_id, 'personnel', allMissionsForConflict
                );
                return (
                  <li key={p.profile_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {p.profiles?.full_name || "Ukjent"}
                      {p.company_mission_roles?.name && (
                        <span className="text-xs text-muted-foreground">({p.company_mission_roles.name})</span>
                      )}
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>

        {/* Drones */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Plane className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">DRONER</p>
          </div>
          {mission.drones?.length > 0 ? (
            <ul className="space-y-2">
              {mission.drones.map((d: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  d.drone_id, 'drone', allMissionsForConflict
                );
                return (
                  <li key={d.drone_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {d.drones?.modell} (SN: {d.drones?.serienummer})
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>

        {/* Equipment */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">UTSTYR</p>
          </div>
          {mission.equipment?.length > 0 ? (
            <ul className="space-y-2">
              {mission.equipment.map((e: any) => {
                const allMissionsForConflict = missions.map((m: any) => ({
                  id: m.id, tittel: m.tittel, tidspunkt: m.tidspunkt,
                  slutt_tidspunkt: m.slutt_tidspunkt, status: m.status,
                  personnel: m.personnel || [], drones: m.drones || [], equipment: m.equipment || [],
                }));
                const conflicts = getResourceConflictsForMission(
                  mission.id, mission.tidspunkt, mission.slutt_tidspunkt,
                  e.equipment_id, 'equipment', allMissionsForConflict
                );
                return (
                  <li key={e.equipment_id} className="space-y-0.5">
                    <span className="text-sm text-foreground flex items-center gap-1">
                      {e.equipment?.navn} ({e.equipment?.type})
                      {conflicts.length > 0 && (
                        conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                          ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                          : <Info className="h-3 w-3 text-blue-500" />
                      )}
                    </span>
                    <ResourceConflictWarning conflicts={conflicts} compact />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
          )}
        </div>
      </div>

      {/* Documents */}
      {mission.documents?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">DOKUMENTER</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mission.documents.map((d: any) => {
              const doc = d.documents;
              return (
                <button
                  key={d.document_id}
                  onClick={() => onDocumentClick(doc)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {doc?.tittel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Route Info */}
      {mission.route && (mission.route as any).coordinates?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Route className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">PLANLAGT RUTE</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>{(mission.route as any).coordinates.length} punkter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{((mission.route as any).totalDistance || 0).toFixed(2)} km</span>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {mission.beskrivelse && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">BESKRIVELSE</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{mission.beskrivelse}</p>
        </div>
      )}

      {/* Weather and Map Data */}
      {(() => {
        const routeCoords = (mission.route as any)?.coordinates;
        const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
        const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
        const isCompleted = mission.status === "Fullført";
        const hasWeatherSnapshot = mission.weather_data_snapshot;
        
        if (!effectiveLat || !effectiveLng) return null;
        
        return (
          <div className="pt-2 border-t border-border/50 space-y-3 sm:space-y-4">
            <DroneWeatherPanel
              latitude={effectiveLat}
              longitude={effectiveLng}
              savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
            />
            <AirspaceWarnings
              latitude={effectiveLat}
              longitude={effectiveLng}
              routePoints={routeCoords}
              showAll={companySettings.show_all_airspace_warnings}
              onAirspaceResult={(warnings) => {
                const found = warnings.some(w => w.zone_type === '5KM');
                setHas5kmZone(found);
              }}
            />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">KART</p>
              <div 
                className="h-[150px] sm:h-[200px] relative overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => setExpandedMapOpen(true)}
              >
                <MissionMapPreview
                  latitude={effectiveLat}
                  longitude={effectiveLng}
                  route={mission.route as any}
                  flightTracks={
                    mission.flightLogs
                      ?.filter((log: any) => log.flight_track?.positions?.length > 0)
                      .map((log: any) => ({
                        positions: log.flight_track.positions,
                        flightLogId: log.id,
                        flightDate: log.flight_date,
                      })) || null
                  }
                  notam={mission.notam_text ? {
                    lat: mission.notam_center_lat_wgs84 ?? effectiveLat,
                    lng: mission.notam_center_lon_wgs84 ?? effectiveLng,
                    radiusNm: mission.notam_radius_nm ?? 0.5,
                    text: mission.notam_text,
                  } : null}
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="bg-background/90 px-2 py-1 rounded text-xs font-medium">Klikk for å forstørre</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SORA Analysis */}
      {mission.sora && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">SORA-ANALYSE</p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => onOpenSora(mission.id)}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Rediger
              </Button>
              <Badge variant="outline" className={getSoraBadgeColor(mission.sora.sora_status)}>
                {mission.sora.sora_status}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {mission.sora.sail && (
              <div>
                <p className="text-xs text-muted-foreground">SAIL</p>
                <p className="font-medium text-foreground">{mission.sora.sail}</p>
              </div>
            )}
            {mission.sora.igrc && (
              <div>
                <p className="text-xs text-muted-foreground">Initial GRC</p>
                <p className="font-medium text-foreground">{mission.sora.igrc}</p>
              </div>
            )}
            {mission.sora.fgrc && (
              <div>
                <p className="text-xs text-muted-foreground">Final GRC</p>
                <p className="font-medium text-foreground">{mission.sora.fgrc}</p>
              </div>
            )}
            {mission.sora.residual_risk_level && (
              <div>
                <p className="text-xs text-muted-foreground">Residual Risk</p>
                <p className="font-medium text-foreground">{mission.sora.residual_risk_level}</p>
              </div>
            )}
          </div>
          {mission.sora.residual_risk_comment && (
            <p className="text-xs text-muted-foreground mt-2">
              {mission.sora.residual_risk_comment}
            </p>
          )}
        </div>
      )}

      {/* Incidents Section */}
      {mission.incidents?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-xs font-semibold text-muted-foreground">
              TILKNYTTEDE HENDELSER ({mission.incidents.length})
            </p>
          </div>
          <div className="space-y-2">
            {mission.incidents.map((incident: any) => (
              <div
                key={incident.id}
                onClick={() => onIncidentClick(incident)}
                className="p-2 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{incident.tittel}</h4>
                    <div className="flex flex-wrap items-center gap-1 text-xs mt-1">
                      <Badge className={incidentSeverityColors[incident.alvorlighetsgrad] || ""}>
                        {incident.alvorlighetsgrad}
                      </Badge>
                      {incident.hovedaarsak && (
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-900 border-amber-500/30">
                          {incident.hovedaarsak}
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {incident.hendelsestidspunkt ? format(new Date(incident.hendelsestidspunkt), "dd. MMM yyyy", { locale: nb }) : "—"}
                      </span>
                    </div>
                  </div>
                  <Badge className={incidentStatusColors[incident.status] || ""}>
                    {incident.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deviation Reports Section */}
      <DeviationReportsSection missionId={mission.id} open={true} />

      {/* Flight Logs Section */}
      {mission.flightLogs?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground">
              FLYTURER ({mission.flightLogs.length})
            </p>
          </div>
          <div className="space-y-2">
            {mission.flightLogs.map((log: any) => (
              <div
                key={log.id}
                className="p-3 bg-card/30 rounded border border-border/30"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{log.flight_date ? format(new Date(log.flight_date), "dd. MMMM yyyy HH:mm", { locale: nb }) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{log.flight_duration_minutes} min</span>
                  </div>
                  {log.pilot && (
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{log.pilot.full_name}</span>
                    </div>
                  )}
                  {log.drones && (
                    <div className="flex items-center gap-2">
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{log.drones.modell}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {log.flight_track?.positions?.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setAnalysisTrack(log.flight_track);
                        setAnalysisOpen(true);
                      }}
                    >
                      <BarChart3 className="h-3 w-3" />
                      Analyser
                    </Button>
                  )}
                  {log.safesky_mode && log.safesky_mode !== 'none' && (
                    <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-900 border-blue-500/30">
                      <Radio className="h-3 w-3 mr-1" />
                      SafeSky: {log.safesky_mode === 'advisory' ? 'Advisory' : 'Live UAV'}
                    </Badge>
                  )}
                  {log.completed_checklists && log.completed_checklists.length > 0 && (
                    <ChecklistBadges checklistIds={log.completed_checklists} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-muted-foreground">MERKNADER</p>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Legg til merknad"
            aria-label="Legg til merknad"
            className="h-8 w-8 shrink-0"
            onClick={() => setNotesDialogOpen(true)}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
        {mission.merknader ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{mission.merknader}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen merknader</p>
        )}
      </div>

      {/* Approver Comments */}
      {Array.isArray(mission.approver_comments) && mission.approver_comments.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">KOMMENTARER</p>
          <div className="space-y-1.5">
            {mission.approver_comments.map((c: any, i: number) => (
              <div key={i} className="text-sm bg-muted/50 rounded-md p-2">
                <span className="font-medium">Kommentar fra godkjenner {c.author_name}:</span>{' '}
                {c.comment}
                {c.created_at && <span className="ml-1 text-xs text-muted-foreground">
                  ({new Date(c.created_at).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })})
                </span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <MissionSoraRouteDocumentation route={mission.route} />
    </GlassCard>

    <AlertDialog open={ninoxConfirmOpen} onOpenChange={setNinoxConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Ninox-godkjenning påkrevd
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ditt oppdrag krever godkjenning i Ninox. Bekreft at du har innhentet dette.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={handleNinoxConfirm}>
            Bekreft godkjenning
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
          <AlertDialogAction onClick={handleSubmitForApproval}>
            Send til godkjenning
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <FlightAnalysisDialog
      open={analysisOpen}
      onOpenChange={setAnalysisOpen}
      flightTrack={analysisTrack}
      droneName={mission.tittel}
    />
    <MissionNotesDialog
      open={notesDialogOpen}
      onOpenChange={setNotesDialogOpen}
      mission={mission}
      onSaved={fetchMissions}
    />
    <ExpandedMapDialog
      open={expandedMapOpen}
      onOpenChange={setExpandedMapOpen}
      latitude={mission.latitude ?? (mission.route as any)?.coordinates?.[0]?.lat ?? 0}
      longitude={mission.longitude ?? (mission.route as any)?.coordinates?.[0]?.lng ?? 0}
      route={mission.route as any}
      flightTracks={
        mission.flightLogs
          ?.filter((log: any) => log.flight_track?.positions?.length > 0)
          .map((log: any) => ({
            positions: log.flight_track.positions,
            flightLogId: log.id,
            flightDate: log.flight_date,
          })) || null
      }
      missionTitle={mission.tittel}
      missionId={mission.id}
      onSoraUpdated={fetchMissions}
      notam={mission.notam_text ? {
        lat: mission.notam_center_lat_wgs84 ?? mission.latitude,
        lng: mission.notam_center_lon_wgs84 ?? mission.longitude,
        radiusNm: mission.notam_radius_nm ?? 0.5,
        text: mission.notam_text,
      } : null}
    />
    </>
  );
};
