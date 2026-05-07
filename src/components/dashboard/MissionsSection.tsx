import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Plus, FileText, Brain, Building2, Radio, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { AddMissionDialog } from "./AddMissionDialog";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskAssessmentTypeDialog } from "./RiskAssessmentTypeDialog";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { MissionStatusDropdown } from "./MissionStatusDropdown";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { NotamDialog } from "./NotamDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  statusColors,
  getAIRiskBadgeColor,
  getApprovalStatusColor,
  getApprovalStatusLabel,
  getNotamBadgeColor,
  getSoraBadgeColor,
  canSubmitForApproval,
  shouldShowAIRiskBadge,
  shouldShowApprovalBadge,
  shouldShowSoraBadge,
} from "@/lib/oppdragHelpers";

type Mission = any;
type MissionSora = any;
type MissionAIRisk = { overall_score: number; recommendation: string };


export const MissionsSection = ({ abortSignal }: { abortSignal?: AbortSignal }) => {
  const { t, i18n } = useTranslation();
  const { companyId, departmentsEnabled } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const companySettings = useCompanySettings();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const showApproval = companySettings.require_mission_approval || soraApprovalEnabled;
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionSoras, setMissionSoras] = useState<Record<string, MissionSora>>({});
  const [missionDocumentCounts, setMissionDocumentCounts] = useState<Record<string, number>>({});
  const [missionAIRisks, setMissionAIRisks] = useState<Record<string, MissionAIRisk>>({});
  
  // Risk assessment states
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskDialogInitialTab, setRiskDialogInitialTab] = useState<'input' | 'result' | 'history' | 'sora' | 'manual-sora'>('input');
  const [selectedAIRiskMission, setSelectedAIRiskMission] = useState<Mission | null>(null);
  const [approvalConfirmMissionId, setApprovalConfirmMissionId] = useState<string | null>(null);
  const [checklistMission, setChecklistMission] = useState<Mission | null>(null);
  const [notamMission, setNotamMission] = useState<Mission | null>(null);
  // For SORA badge click - open RiskAssessmentDialog with manual-sora tab
  const [soraMissionForDialog, setSoraMissionForDialog] = useState<Mission | null>(null);

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;

  useEffect(() => {
    if (navigator.onLine) {
      supabase.functions.invoke('auto-complete-missions').catch(console.error);
    }
    fetchMissions();
  }, [companyId]);

  useEffect(() => {
    const unregister = registerMain('missions', () => {
      if (!navigator.onLine) return;
      fetchMissions();
    });
    return unregister;
  }, [registerMain]);

  const fetchMissions = async () => {
    if (companyId) {
      const cached = getCachedData<any[]>(`offline_dashboard_missions_${companyId}`);
      if (cached) setMissions(cached);
    }
    if (!navigator.onLine) return;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    try {
      if (abortSignal?.aborted) return;
      const query = (supabase as any)
        .from("missions")
        .select("*, companies:company_id(id, navn)")
        .neq("status", "Fullført")
        .neq("status", "Avlyst")
        .gte("tidspunkt", oneDayAgo.toISOString())
        .order("tidspunkt", { ascending: true });
      if (abortSignal) query.abortSignal(abortSignal);
      const { data, error } = await query;

      if (error) throw error;

      const enriched = (data || []).map((m: any) => ({ ...m, company_name: m.companies?.navn || null }));
      setMissions(enriched);
      if (companyId) setCachedData(`offline_dashboard_missions_${companyId}`, data || []);
      if (data && data.length > 0) {
        const missionIds = data.map((m: any) => m.id);
        fetchMissionSoras(missionIds);
        fetchMissionDocumentCounts(missionIds);
        fetchMissionAIRisks(missionIds);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || abortSignal?.aborted) return;
      console.error("Error fetching missions:", error);
    }
  };

  const fetchMissionDocumentCounts = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_documents")
      .select("mission_id")
      .in("mission_id", missionIds);

    if (error) {
      console.error("Error fetching mission documents:", error);
    } else if (data) {
      const counts: Record<string, number> = {};
      data.forEach((doc: any) => {
        counts[doc.mission_id] = (counts[doc.mission_id] || 0) + 1;
      });
      setMissionDocumentCounts(counts);
    }
  };

  const fetchMissionSoras = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_sora")
      .select("*")
      .in("mission_id", missionIds);

    if (error) {
      console.error("Error fetching mission SORAs:", error);
    } else if (data) {
      const soraMap: Record<string, MissionSora> = {};
      data.forEach((sora: any) => {
        soraMap[sora.mission_id] = sora;
      });
      setMissionSoras(soraMap);
    }
  };

  const fetchMissionAIRisks = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_risk_assessments")
      .select("mission_id, overall_score, recommendation")
      .in("mission_id", missionIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching mission AI risks:", error);
    } else if (data) {
      const riskMap: Record<string, MissionAIRisk> = {};
      data.forEach((risk: any) => {
        if (!riskMap[risk.mission_id]) {
          riskMap[risk.mission_id] = {
            overall_score: risk.overall_score,
            recommendation: risk.recommendation,
          };
        }
      });
      setMissionAIRisks(riskMap);
    }
  };

  const handleMissionClick = (mission: Mission) => {
    const missionWithRisk = {
      ...mission,
      aiRisk: missionAIRisks[mission.id] || null
    };
    setSelectedMission(missionWithRisk);
    setDialogOpen(true);
  };

  const handleSoraClick = (mission: Mission, e: React.MouseEvent) => {
    e.stopPropagation();
    setSoraMissionForDialog(mission);
    setRiskDialogInitialTab('manual-sora');
    setRiskDialogOpen(true);
  };

  const handleNewRiskAssessment = () => {
    setRiskTypeDialogOpen(true);
  };

  const handleSelectAI = () => {
    setRiskDialogInitialTab('input');
    setRiskDialogOpen(true);
  };

  const handleSelectManualSORA = () => {
    setRiskDialogInitialTab('manual-sora');
    setRiskDialogOpen(true);
  };

  const handleRiskAssessmentSaved = () => {
    fetchMissions();
  };

  const handleChecklistCompleted = async (checklistId: string) => {
    if (!checklistMission?.id) return;
    const existing: string[] = checklistMission.checklist_completed_ids || [];
    const completed = existing.includes(checklistId) ? existing : [...existing, checklistId];
    await supabase.from('missions').update({ checklist_completed_ids: completed }).eq('id', checklistMission.id);
    setChecklistMission(prev => prev ? { ...prev, checklist_completed_ids: completed } : prev);
    fetchMissions();
  };

  const submitMissionForApproval = async (missionId: string) => {
    const missionToApprove = missions.find((m: any) => m.id === missionId);

    if (companySettings.require_sora_on_missions && !soraApprovalEnabled) {
      const { count } = await supabase
        .from('mission_risk_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('mission_id', missionId);
      const requiredSteps = companySettings.require_sora_steps ?? 1;
      if ((count ?? 0) < requiredSteps) {
        toast.error('Gjennomfør SORA først');
        return;
      }
    }
    
    const { data: approvers, error: approverError } = await supabase
      .rpc('get_mission_approvers', { target_company_id: companyId! });

    if (approverError) {
      console.error('Error checking approvers:', approverError);
      toast.error('Kunne ikke sjekke godkjennere');
      return;
    }
    
    if (!approvers || approvers.length === 0) {
      toast.error('Ingen i selskapet har rollen som godkjenner. Tildel rollen under Admin-panelet først.');
      return;
    }
    
    const { error } = await supabase
      .from('missions')
      .update({ approval_status: 'pending_approval', submitted_for_approval_at: new Date().toISOString() })
      .eq('id', missionId);

    if (error) {
      toast.error('Kunne ikke sende til godkjenning');
      return;
    }

    fetchMissions();
    if (missionToApprove && companyId) {
      try {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_mission_approval',
            companyId,
            mission: {
              tittel: missionToApprove.tittel,
              lokasjon: missionToApprove.lokasjon,
              tidspunkt: missionToApprove.tidspunkt,
              beskrivelse: missionToApprove.beskrivelse || '',
            }
          }
        });
      } catch (emailError) {
        console.error('Error sending approval notification:', emailError);
      }
    }
  };

  return (
    <>
      <GlassCard className="h-[400px] flex flex-col overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.missions.title')}</h2>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={handleNewRiskAssessment} title={t('dashboard.missions.newRiskAssessment', 'Ny risikovurdering')}>
              <FileText className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2 flex-1 overflow-y-auto">
          {missions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('dashboard.missions.noMissions')}</p>
          ) : (
            missions.map((mission) => (
              <div
                key={mission.id}
                onClick={() => handleMissionClick(mission)}
                className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
              >
                <div className="mb-1 sm:mb-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h3 className="font-semibold text-xs sm:text-sm truncate">{mission.tittel}</h3>
                    {departmentsEnabled && mission.company_id !== companyId && mission.company_name && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 whitespace-nowrap shrink-0 gap-0.5 border-primary/30 text-primary">
                        <Building2 className="h-2.5 w-2.5" />
                        {mission.company_name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">
                    <MissionStatusDropdown
                      missionId={mission.id}
                      currentStatus={mission.status}
                      onStatusChanged={fetchMissions}
                      statusColors={statusColors}
                      className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap"
                      latitude={mission.latitude}
                      longitude={mission.longitude}
                    />
                    {shouldShowApprovalBadge(showApproval, mission.approval_status) && (() => {
                      const approvalStatus = mission.approval_status || 'not_approved';
                      const isClickable = canSubmitForApproval(mission.approval_status);
                      return (
                        <Badge 
                          variant="outline"
                          className={`${getApprovalStatusColor(approvalStatus)} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                          onClick={isClickable ? (e: React.MouseEvent) => {
                            e.stopPropagation();
                            setApprovalConfirmMissionId(mission.id);
                          } : undefined}
                        >
                          {getApprovalStatusLabel(approvalStatus, true)}
                        </Badge>
                      );
                    })()}
                    {shouldShowSoraBadge(missionSoras[mission.id]) && (
                      <Badge 
                        variant="outline"
                        onClick={(e) => handleSoraClick({ ...mission, sora: missionSoras[mission.id] }, e)}
                        className={`${getSoraBadgeColor(missionSoras[mission.id]?.sora_status)} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80`}
                      >
                        {t('dashboard.missions.soraStatus', { status: missionSoras[mission.id].sora_status })}
                      </Badge>
                    )}
                    <Badge 
                      variant="outline"
                      className={`${missionAIRisks[mission.id] ? getAIRiskBadgeColor(missionAIRisks[mission.id].recommendation) : 'bg-gray-500/20 text-gray-900 border-gray-500/30'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAIRiskMission({ ...mission, aiRisk: missionAIRisks[mission.id] || null });
                        setRiskDialogInitialTab(missionAIRisks[mission.id] ? 'history' : 'input');
                        setRiskDialogOpen(true);
                      }}
                    >
                      <Brain className="w-3 h-3 mr-1" />
                      {missionAIRisks[mission.id] ? missionAIRisks[mission.id].overall_score.toFixed(1) : 'Risiko'}
                    </Badge>
                    {mission.checklist_ids?.length > 0 && (
                      <Badge
                        variant="outline"
                        className={`${mission.checklist_ids.every((id: string) => mission.checklist_completed_ids?.includes(id)) ? 'bg-green-500/20 text-green-900 border-green-500/30' : 'bg-gray-500/20 text-gray-700 border-gray-500/30'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setChecklistMission(mission);
                        }}
                      >
                        <ClipboardCheck className="w-3 h-3 mr-1" />
                        Sjekkliste
                      </Badge>
                    )}
                    {mission.notam_text && (
                      <Badge
                        variant="outline"
                        className={`${getNotamBadgeColor(!!mission.notam_submitted_at)} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotamMission(mission);
                        }}
                      >
                        <Radio className="w-3 h-3 mr-1" />
                        NOTAM
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-1.5">
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">{mission.lokasjon}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                    {format(new Date(mission.tidspunkt), "dd. MMM HH:mm", { locale: dateLocale })}
                  </Badge>
                  {missionDocumentCounts[mission.id] > 0 && (
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                      <FileText className="w-3 h-3 mr-1" />
                      {missionDocumentCounts[mission.id]}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
    </GlassCard>
    
      <MissionDetailDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mission={selectedMission}
        onMissionUpdated={fetchMissions}
      />
      
      <AddMissionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onMissionAdded={fetchMissions}
      />

      <RiskAssessmentTypeDialog
        open={riskTypeDialogOpen}
        onOpenChange={setRiskTypeDialogOpen}
        onSelectAI={handleSelectAI}
        onSelectManualSORA={handleSelectManualSORA}
      />
      
      <RiskAssessmentDialog
        open={riskDialogOpen}
        onOpenChange={(open) => {
          setRiskDialogOpen(open);
          if (!open) {
            setSelectedAIRiskMission(null);
            setSoraMissionForDialog(null);
            handleRiskAssessmentSaved();
          }
        }}
        mission={selectedAIRiskMission || soraMissionForDialog}
        initialTab={riskDialogInitialTab}
        onSoraSaved={fetchMissions}
      />

      <ChecklistExecutionDialog
        open={!!checklistMission}
        onOpenChange={(open) => !open && setChecklistMission(null)}
        checklistIds={checklistMission?.checklist_ids || []}
        completedIds={checklistMission?.checklist_completed_ids || []}
        itemName={checklistMission?.tittel || 'Oppdrag'}
        onComplete={handleChecklistCompleted}
      />

      <NotamDialog
        open={!!notamMission}
        onOpenChange={(open) => !open && setNotamMission(null)}
        mission={notamMission}
        onSaved={fetchMissions}
      />

      <AlertDialog open={!!approvalConfirmMissionId} onOpenChange={(open) => !open && setApprovalConfirmMissionId(null)}>
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
              if (!approvalConfirmMissionId) return;
              await submitMissionForApproval(approvalConfirmMissionId);
              setApprovalConfirmMissionId(null);
            }}>
              Send til godkjenning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
