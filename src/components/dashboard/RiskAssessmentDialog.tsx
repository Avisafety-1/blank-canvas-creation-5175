import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { usePlanGating } from "@/hooks/usePlanGating";
import { Loader2, ShieldCheck, AlertTriangle, History, AlertOctagon, Save, FileDown, BarChart3, FileText } from "lucide-react";
import { exportRiskAssessmentPDF } from "@/lib/riskAssessmentPdfExport";
import { RiskScoreCard } from "./RiskScoreCard";
import { RiskRecommendations } from "./RiskRecommendations";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { SoraResultView } from "./SoraResultView";

interface RiskAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission?: any;
  droneId?: string;
  initialTab?: 'input' | 'result' | 'history' | 'sora' | 'manual-sora';
  onSoraSaved?: () => void;
}

interface PilotInputs {
  flightHeight: number;
  operationType: string;
  isVlos: boolean;
  observerCount: number;
  atcRequired: boolean;
  proximityToPeople: string;
  criticalInfrastructure: boolean;
  backupLandingAvailable: boolean;
  skipWeatherEvaluation: boolean;
}

interface Assessment {
  id: string;
  created_at: string;
  overall_score: number;
  recommendation: string;
  ai_analysis: any;
  pilot_comments?: any;
  sora_output?: any;
}

export const RiskAssessmentDialog = ({ open, onOpenChange, mission, droneId, initialTab = 'input', onSoraSaved }: RiskAssessmentDialogProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [etaMs, setEtaMs] = useState<number>(45000);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [currentAssessment, setCurrentAssessment] = useState<any>(null);
  const [previousAssessments, setPreviousAssessments] = useState<Assessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [categoryComments, setCategoryComments] = useState<Record<string, string>>({});
  const [savingComments, setSavingComments] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(null);
  const [soraOutput, setSoraOutput] = useState<any>(null);
  const [runningSora, setRunningSora] = useState(false);
  // Mission selector states
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | undefined>(mission?.id);
  const [loadingMissions, setLoadingMissions] = useState(false);

  // Manual SORA states
  const [soraFormData, setSoraFormData] = useState({
    environment: "",
    conops_summary: "",
    igrc: "",
    ground_mitigations: "",
    fgrc: "",
    arc_initial: "",
    airspace_mitigations: "",
    arc_residual: "",
    sail: "",
    residual_risk_level: "",
    residual_risk_comment: "",
    operational_limits: "",
    sora_status: "Ikke startet",
    approved_by: "",
  });
  const [existingSora, setExistingSora] = useState<any>(null);
  const [soraProfiles, setSoraProfiles] = useState<any[]>([]);
  const [preparedByProfile, setPreparedByProfile] = useState<{ email?: string; full_name?: string } | null>(null);
  const [soraSaving, setSoraSaving] = useState(false);
  const [soraMissionDetails, setSoraMissionDetails] = useState<any>(null);

  const [pilotInputs, setPilotInputs] = useState<PilotInputs>({
    flightHeight: 120,
    operationType: 'inspection',
    isVlos: true,
    observerCount: 0,
    atcRequired: false,
    proximityToPeople: 'ssb_data',
    criticalInfrastructure: false,
    backupLandingAvailable: true,
    skipWeatherEvaluation: false,
  });

  // Determine current mission ID (from prop or selected)
  const currentMissionId = mission?.id || selectedMissionId;

  const allCommentsComplete = ['weather', 'airspace', 'pilot_experience', 'mission_complexity', 'equipment']
    .every(k => categoryComments[k]?.trim());

  const { canAccess } = usePlanGating();

  const runSoraReassessment = async () => {
    if (!canAccess('sora')) {
      toast.error('SORA re-vurdering krever Grower-planen eller høyere.');
      return;
    }
    if (!currentMissionId || !currentAssessment) return;
    setRunningSora(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Du må være logget inn');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-risk-assessment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            missionId: currentMissionId,
            soraReassessment: true,
            previousAnalysis: currentAssessment,
            pilotComments: categoryComments,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Unknown error');
      }

      const result = await response.json();
      setSoraOutput(result.soraAnalysis);
      if (result.assessment?.id) {
        setCurrentAssessmentId(result.assessment.id);
      }
      setActiveTab('sora');
      toast.success('SORA re-vurdering fullført');
      loadPreviousAssessments();
    } catch (error) {
      console.error('SORA reassessment error:', error);
      toast.error('Kunne ikke utføre SORA re-vurdering');
    } finally {
      setRunningSora(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      if (!mission && companyId) {
        fetchMissions();
      }
      if (currentMissionId) {
        loadPreviousAssessments();
      }
      // Fetch SORA data when opening with manual-sora tab or always
      fetchSoraProfiles();
      if (currentMissionId) {
        fetchExistingSora();
        fetchSoraMissionDetails();
      }
    }
  }, [open, mission?.id, companyId, currentMissionId, initialTab]);

  // Update selectedMissionId when mission prop changes
  useEffect(() => {
    if (mission?.id) {
      setSelectedMissionId(mission.id);
    }
  }, [mission?.id]);

  // Fetch SORA data when mission selection changes
  useEffect(() => {
    if (currentMissionId && open) {
      fetchExistingSora();
      fetchSoraMissionDetails();
    }
  }, [currentMissionId]);

  const fetchMissions = async () => {
    setLoadingMissions(true);
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data, error } = await supabase
        .from("missions")
        .select("id, tittel, lokasjon, tidspunkt")
        .neq("status", "Fullført")
        .neq("status", "Avlyst")
        .gte("tidspunkt", oneDayAgo.toISOString())
        .order("tidspunkt", { ascending: true });

      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error("Error fetching missions:", error);
    } finally {
      setLoadingMissions(false);
    }
  };

  // Manual SORA functions
  const fetchSoraProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("approved", true);
    if (!error) setSoraProfiles(data || []);
  };

  const fetchSoraMissionDetails = async () => {
    if (!currentMissionId) return;
    const { data } = await supabase
      .from("missions")
      .select("*")
      .eq("id", currentMissionId)
      .single();
    if (data) setSoraMissionDetails(data);
  };

  const fetchExistingSora = async () => {
    if (!currentMissionId) return;
    const { data, error } = await supabase
      .from("mission_sora")
      .select("*")
      .eq("mission_id", currentMissionId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching existing SORA:", error);
    } else if (data) {
      setExistingSora(data);
      setSoraFormData({
        environment: data.environment || "",
        conops_summary: data.conops_summary || "",
        igrc: data.igrc?.toString() || "",
        ground_mitigations: data.ground_mitigations || "",
        fgrc: data.fgrc?.toString() || "",
        arc_initial: data.arc_initial || "",
        airspace_mitigations: data.airspace_mitigations || "",
        arc_residual: data.arc_residual || "",
        sail: data.sail || "",
        residual_risk_level: data.residual_risk_level || "",
        residual_risk_comment: data.residual_risk_comment || "",
        operational_limits: data.operational_limits || "",
        sora_status: data.sora_status || "Ikke startet",
        approved_by: data.approved_by || "",
      });
      if (data.prepared_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", data.prepared_by)
          .maybeSingle();
        setPreparedByProfile(profile);
      } else {
        setPreparedByProfile(null);
      }
    } else {
      setExistingSora(null);
      setPreparedByProfile(null);
      setSoraFormData({
        environment: "",
        conops_summary: "",
        igrc: "",
        ground_mitigations: "",
        fgrc: "",
        arc_initial: "",
        airspace_mitigations: "",
        arc_residual: "",
        sail: "",
        residual_risk_level: "",
        residual_risk_comment: "",
        operational_limits: "",
        sora_status: "Ikke startet",
        approved_by: "",
      });
    }
  };

  const handleSoraSave = async () => {
    if (!currentMissionId) {
      toast.error("Vennligst velg et oppdrag");
      return;
    }
    if (!companyId) {
      toast.error("Kunne ikke finne selskaps-ID");
      return;
    }
    if (!user?.id) {
      toast.error("Kunne ikke finne bruker-ID");
      return;
    }

    setSoraSaving(true);

    let effectiveStatus = soraFormData.sora_status;
    if (effectiveStatus === "Ikke startet") {
      const hasData = soraFormData.environment || soraFormData.conops_summary || soraFormData.igrc ||
        soraFormData.ground_mitigations || soraFormData.fgrc || soraFormData.arc_initial ||
        soraFormData.airspace_mitigations || soraFormData.arc_residual || soraFormData.sail ||
        soraFormData.residual_risk_level || soraFormData.residual_risk_comment || soraFormData.operational_limits;
      if (hasData) {
        effectiveStatus = "Under arbeid";
        setSoraFormData(prev => ({ ...prev, sora_status: "Under arbeid" }));
      }
    }

    const soraData = {
      mission_id: currentMissionId,
      company_id: companyId,
      environment: soraFormData.environment || null,
      conops_summary: soraFormData.conops_summary || null,
      igrc: soraFormData.igrc ? parseInt(soraFormData.igrc) : null,
      ground_mitigations: soraFormData.ground_mitigations || null,
      fgrc: soraFormData.fgrc ? parseInt(soraFormData.fgrc) : null,
      arc_initial: soraFormData.arc_initial || null,
      airspace_mitigations: soraFormData.airspace_mitigations || null,
      arc_residual: soraFormData.arc_residual || null,
      sail: soraFormData.sail || null,
      residual_risk_level: soraFormData.residual_risk_level || null,
      residual_risk_comment: soraFormData.residual_risk_comment || null,
      operational_limits: soraFormData.operational_limits || null,
      sora_status: effectiveStatus,
      approved_by: soraFormData.approved_by || null,
      approved_at: effectiveStatus === "Ferdig" && !existingSora?.approved_at
        ? new Date().toISOString()
        : existingSora?.approved_at || null,
      prepared_by: existingSora?.prepared_by || user.id,
      prepared_at: existingSora?.prepared_at || new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from("mission_sora")
        .upsert(soraData, {
          onConflict: 'mission_id',
          ignoreDuplicates: false
        });

      if (error) throw error;

      toast.success(existingSora ? "SORA-analyse oppdatert" : "SORA-analyse opprettet");
      onSoraSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving SORA:", error);
      toast.error("Kunne ikke lagre SORA-analyse: " + error.message);
    } finally {
      setSoraSaving(false);
    }
  };

  const loadPreviousAssessments = async () => {
    if (!currentMissionId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('mission_risk_assessments')
        .select('id, created_at, overall_score, recommendation, ai_analysis, pilot_comments, sora_output')
        .eq('mission_id', currentMissionId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPreviousAssessments(data || []);
      
      if (data && data.length > 0 && currentAssessmentId) {
        const match = data.find((a: any) => a.id === currentAssessmentId);
        if (match?.pilot_comments) {
          setCategoryComments(match.pilot_comments as Record<string, string>);
        }
      } else if (data && data.length > 0 && !currentAssessmentId && initialTab === 'result') {
        const latest = data[0];
        setCurrentAssessment(latest.ai_analysis);
        setCurrentAssessmentId(latest.id);
        setCategoryComments((latest.pilot_comments as Record<string, string>) || {});
        setSoraOutput((latest as any).sora_output || null);
      }
    } catch (error) {
      console.error('Error loading assessments:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const runAssessment = async () => {
    if (!currentMissionId) {
      toast.error(t('riskAssessment.selectMissionFirst', 'Velg et oppdrag først'));
      return;
    }

    setLoading(true);
    setProgress(0);

    // Fetch ETA estimate from DB (p95 of last 100 jobs)
    let etaForRun = 45000;
    try {
      const { data: etaData } = await supabase.rpc('get_ai_risk_eta_ms');
      if (typeof etaData === 'number' && etaData > 0) etaForRun = etaData;
    } catch (_) { /* ignore */ }
    setEtaMs(etaForRun);

    // Animate progress from 0 → 95% over etaForRun
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(95, (elapsed / etaForRun) * 95);
      setProgress(pct);
    }, 250);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('errors.notLoggedIn', 'Du må være logget inn'));
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-risk-assessment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            missionId: currentMissionId,
            pilotInputs,
            droneId,
            pilotComments: categoryComments,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 429) {
          if (error?.status === 'queued') {
            const waitSec = Math.ceil((error.retryAfterMs ?? 30000) / 1000);
            toast.warning(`AI er opptatt (3 vurderinger kjører nå). Prøv igjen om ca. ${waitSec} sekunder.`);
          } else {
            toast.error(t('riskAssessment.rateLimitError', 'For mange forespørsler, prøv igjen senere'));
          }
        } else if (response.status === 402) {
          toast.error(t('riskAssessment.creditsError', 'AI-kreditter oppbrukt'));
        } else {
          throw new Error(error.error || 'Unknown error');
        }
        return;
      }

      const result = await response.json();
      setProgress(100);
      setCurrentAssessment({
        ...result.aiAnalysis,
        _approvalStatus: result.approvalStatus || null,
        _approvalReason: result.approvalReason || null,
        _approvalThreshold: result.approvalThreshold || null,
      });
      setCurrentAssessmentId(result.assessment?.id || null);
      setActiveTab('result');
      if (result.autoApproved) {
        toast.success('Oppdraget ble automatisk godkjent basert på SORA-vurderingen');
      } else {
        toast.success(t('riskAssessment.completed', 'Risikovurdering fullført'));
      }
      loadPreviousAssessments();
    } catch (error) {
      console.error('Risk assessment error:', error);
      toast.error(t('riskAssessment.error', 'Kunne ikke utføre risikovurdering'));
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  };

  const viewPreviousAssessment = (assessment: any) => {
    setCurrentAssessment(assessment.ai_analysis);
    setCurrentAssessmentId(assessment.id);
    setCategoryComments(assessment.pilot_comments || {});
    setSoraOutput(assessment.sora_output || null);
    setActiveTab(assessment.sora_output ? 'sora' : 'result');
  };

  const saveComments = async () => {
    if (!currentAssessmentId) return;
    setSavingComments(true);
    try {
      const { error } = await supabase
        .from('mission_risk_assessments')
        .update({ pilot_comments: categoryComments } as any)
        .eq('id', currentAssessmentId);
      if (error) throw error;
      toast.success(t('riskAssessment.commentsSaved', 'Kommentarer lagret'));
      loadPreviousAssessments();
    } catch (error) {
      console.error('Error saving comments:', error);
      toast.error(t('riskAssessment.commentsSaveError', 'Kunne ikke lagre kommentarer'));
    } finally {
      setSavingComments(false);
    }
  };

  const exportToPdf = async (assessmentData: any, comments: Record<string, string>, assessmentCreatedAt?: string, exportType: 'ai' | 'sora' = 'ai', soraData?: any) => {
    if (!companyId) return;
    setExportingPdf(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Du må være logget inn');
        return;
      }
      const mTitle = mission?.tittel || missions.find(m => m.id === selectedMissionId)?.tittel || 'Oppdrag';
      const success = await exportRiskAssessmentPDF({
        assessment: assessmentData,
        missionTitle: mTitle,
        categoryComments: comments,
        companyId,
        userId: user.id,
        createdAt: assessmentCreatedAt,
        soraOutput: soraData,
        exportType,
      });
      if (success) {
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        const label = exportType === 'sora' ? 'SORA-analyse' : 'Risikovurdering';
        toast.success(`${label} eksportert til PDF og lagret i Dokumenter`);
      } else {
        toast.error('Kunne ikke eksportere til PDF');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Kunne ikke eksportere til PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const isManualSoraActive = activeTab === 'manual-sora';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`w-[95vw] ${isManualSoraActive ? 'max-w-4xl' : 'max-w-2xl'} max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col transition-all`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            {t('riskAssessment.title', 'Risikovurdering')}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className={cn("grid w-full", soraOutput ? "grid-cols-5" : "grid-cols-4")}>
            <TabsTrigger value="input" className="text-xs sm:text-sm">
              {t('riskAssessment.inputTab', 'Input')}
            </TabsTrigger>
            {soraOutput && (
              <TabsTrigger value="sora" className="text-xs sm:text-sm">
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                AI SORA
              </TabsTrigger>
            )}
            <TabsTrigger value="manual-sora" className="text-xs sm:text-sm">
              <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              <span className="hidden sm:inline">Manuell SORA</span>
              <span className="sm:hidden">SORA</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">
              <History className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              <span className="hidden sm:inline">{t('riskAssessment.historyTab', 'Historikk')}</span>
              <span className="sm:hidden">Hist.</span>
            </TabsTrigger>
            <TabsTrigger value="result" disabled={!currentAssessment} className="text-xs sm:text-sm">
              {t('riskAssessment.resultTab', 'Resultat')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4">
            <TabsContent value="input" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="space-y-6 pr-4">
                  {/* Mission Selector - only show when no mission prop */}
                  {!mission && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {t('riskAssessment.selectMission', 'Velg oppdrag')}
                      </h3>
                      <Select
                        value={selectedMissionId || ""}
                        onValueChange={(v) => {
                          setSelectedMissionId(v);
                          setPreviousAssessments([]);
                          setCurrentAssessment(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            loadingMissions 
                              ? t('common.loading', 'Laster...') 
                              : t('riskAssessment.selectMissionPlaceholder', 'Velg et oppdrag')
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {missions.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.tittel} - {m.lokasjon}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Flight Parameters */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t('riskAssessment.flightParameters', 'Flygeparametere')}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('riskAssessment.flightHeight', 'Flyhøyde (m AGL)')}</Label>
                        <Input
                          type="number"
                          value={pilotInputs.flightHeight === 0 ? '' : pilotInputs.flightHeight}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            flightHeight: e.target.value === '' ? 0 : parseInt(e.target.value) 
                          }))}
                        />
                      </div>

                      <div>
                        <Label>{t('riskAssessment.operationType', 'Operasjonstype')}</Label>
                        <Select
                          value={pilotInputs.operationType}
                          onValueChange={(v) => setPilotInputs(prev => ({ ...prev, operationType: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inspection">{t('riskAssessment.types.inspection', 'Inspeksjon')}</SelectItem>
                            <SelectItem value="mapping">{t('riskAssessment.types.mapping', 'Kartlegging')}</SelectItem>
                            <SelectItem value="filming">{t('riskAssessment.types.filming', 'Filming')}</SelectItem>
                            <SelectItem value="photography">{t('riskAssessment.types.photography', 'Fotografering')}</SelectItem>
                            <SelectItem value="delivery">{t('riskAssessment.types.delivery', 'Levering')}</SelectItem>
                            <SelectItem value="other">{t('common.other', 'Annet')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('riskAssessment.flightMode', 'Flygemodus')}</Label>
                      <RadioGroup
                        value={pilotInputs.isVlos ? "vlos" : "bvlos"}
                        onValueChange={(v) => setPilotInputs(prev => ({ ...prev, isVlos: v === "vlos" }))}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="vlos" id="vlos" />
                          <Label htmlFor="vlos" className="font-normal cursor-pointer">VLOS</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="bvlos" id="bvlos" />
                          <Label htmlFor="bvlos" className="font-normal cursor-pointer">BVLOS</Label>
                        </div>
                      </RadioGroup>
                      <p className="text-xs text-muted-foreground">
                        {pilotInputs.isVlos
                          ? t('riskAssessment.vlosDesc', 'Visuell kontakt med dronen gjennom hele flygingen')
                          : t('riskAssessment.bvlosDesc', 'Flyging utenfor visuell rekkevidde — krever SORA, C2-link og DAA')}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('riskAssessment.observers', 'Antall observatører')}</Label>
                        <Input
                          type="number"
                          min="0"
                          value={pilotInputs.observerCount === 0 ? '' : pilotInputs.observerCount}
                          onChange={(e) => setPilotInputs(prev => ({ 
                            ...prev, 
                            observerCount: e.target.value === '' ? 0 : parseInt(e.target.value) 
                          }))}
                        />
                      </div>

                      <div>
                        <Label>{t('riskAssessment.proximityLabel', 'Nærhet til mennesker')}</Label>
                        <Select
                          value={pilotInputs.proximityToPeople}
                          onValueChange={(v) => setPilotInputs(prev => ({ ...prev, proximityToPeople: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ssb_data">{t('riskAssessment.proximity.ssbData', 'SSB data (automatisk)')}</SelectItem>
                            <SelectItem value="none">{t('riskAssessment.proximity.none', 'Ingen')}</SelectItem>
                            <SelectItem value="few">{t('riskAssessment.proximity.few', 'Få')}</SelectItem>
                            <SelectItem value="many">{t('riskAssessment.proximity.many', 'Mange')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.atcRequired', 'ATC-kontakt nødvendig')}</Label>
                      <Switch
                        checked={pilotInputs.atcRequired}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, atcRequired: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.criticalInfrastructure', 'Kritisk infrastruktur i nærheten')}</Label>
                      <Switch
                        checked={pilotInputs.criticalInfrastructure}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, criticalInfrastructure: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.backupLanding', 'Backup-landingsplass tilgjengelig')}</Label>
                      <Switch
                        checked={pilotInputs.backupLandingAvailable}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, backupLandingAvailable: v }))}
                      />
                    </div>
                  </div>

                  {/* Weather Options */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {t('riskAssessment.weatherOptions', 'Væralternativer')}
                    </h3>

                    <div className="flex items-center justify-between">
                      <Label>{t('riskAssessment.skipWeather', 'Ikke vurder vær')}</Label>
                      <Switch
                        checked={pilotInputs.skipWeatherEvaluation}
                        onCheckedChange={(v) => setPilotInputs(prev => ({ ...prev, skipWeatherEvaluation: v }))}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={runAssessment} 
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('riskAssessment.analyzing', 'Analyserer...')}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        {t('riskAssessment.runAssessment', 'Kjør risikovurdering')}
                      </>
                    )}
                  </Button>
                  {loading && (
                    <div className="space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{Math.round(progress)}%</span>
                        <span>
                          Estimert tid: ~{Math.ceil(etaMs / 1000)}s
                          {progress >= 95 && ' (sluttfører…)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="result" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                {currentAssessment && (
                  <div className="space-y-6 pr-4">
                    {/* AI Disclaimer */}
                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-foreground">
                          AI risikovurdering kan brukes som beslutningsstøtte. Det er alltid «pilot-in-command» som selv må vurdere risikoen knyttet til oppdraget. Vurderingen er basert på tilgjengelige data på vurderingstidspunktet. Endringer i data kan påvirke resultatet.
                        </p>
                      </div>
                    </div>

                    {/* Summary */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Foreslått konklusjon</h3>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm">{currentAssessment.summary}</p>
                      </div>
                    </div>

                    {/* Score Card with new SMS fields */}
                    <RiskScoreCard
                      overallScore={currentAssessment.overall_score}
                      recommendation={currentAssessment.recommendation}
                      categories={currentAssessment.categories}
                      hardStopTriggered={currentAssessment.hard_stop_triggered}
                      hardStopReason={currentAssessment.hard_stop_reason}
                      missionOverview={currentAssessment.mission_overview}
                      assessmentMethod={currentAssessment.assessment_method}
                      categoryComments={categoryComments}
                      onCategoryCommentChange={(category, comment) => 
                        setCategoryComments(prev => ({ ...prev, [category]: comment }))
                      }
                      approvalStatus={currentAssessment._approvalStatus}
                      approvalReason={currentAssessment._approvalReason}
                      approvalThreshold={currentAssessment._approvalThreshold}
                      airRiskAnalysis={currentAssessment.air_risk_analysis}
                      groundRiskAnalysis={currentAssessment.ground_risk_analysis}
                      operationClassification={currentAssessment.operation_classification}
                    />

                    {/* Save comments button */}
                    {currentAssessmentId && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={saveComments}
                          disabled={savingComments}
                          variant="outline"
                          className="flex-1 min-w-0"
                          size="sm"
                        >
                          {savingComments ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className="truncate">{t('riskAssessment.saveComments', 'Lagre kommentarer')}</span>
                        </Button>
                        <Button
                          onClick={() => exportToPdf(currentAssessment, categoryComments)}
                          disabled={exportingPdf}
                          variant="outline"
                          className="flex-1 min-w-0"
                          size="sm"
                        >
                          {exportingPdf ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className="truncate">Eksporter til PDF</span>
                        </Button>
                      </div>
                    )}

                    {/* SORA re-assessment button */}
                    {currentAssessmentId && (
                      <div className="space-y-1">
                        <Button
                          onClick={runSoraReassessment}
                          disabled={runningSora || !allCommentsComplete}
                          className="w-full"
                        >
                          {runningSora ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Kjører SORA re-vurdering...
                            </>
                          ) : (
                            <>
                              <BarChart3 className="w-4 h-4 mr-2" />
                              Kjør SORA-basert re-vurdering
                            </>
                          )}
                        </Button>
                        {!allCommentsComplete && (
                          <p className="text-xs text-muted-foreground text-center">
                            Kreves at alle manuelle felt er fylt inn
                          </p>
                        )}
                      </div>
                    )}

                    {/* Recommendations with new SMS fields */}
                    <RiskRecommendations
                      recommendations={currentAssessment.recommendations || []}
                      goConditions={currentAssessment.go_conditions || []}
                      prerequisites={currentAssessment.prerequisites || []}
                      aiDisclaimer={currentAssessment.ai_disclaimer}
                    />
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sora" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                {soraOutput ? (
                  <div className="pr-4 space-y-4">
                    <SoraResultView data={soraOutput} />
                    <Button
                      onClick={() => exportToPdf(currentAssessment || {}, categoryComments, undefined, 'sora', soraOutput)}
                      disabled={exportingPdf}
                      variant="outline"
                      className="w-full"
                      size="sm"
                    >
                      {exportingPdf ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4 mr-2" />
                      )}
                      Eksporter SORA-analyse til PDF
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Ingen SORA-analyse tilgjengelig
                  </p>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Manual SORA Tab */}
            <TabsContent value="manual-sora" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="space-y-6 pr-4">
                  {/* Mission Selector - only show when no mission prop */}
                  {!mission && (
                    <div className="space-y-2">
                      <Label>Oppdrag *</Label>
                      <Select
                        value={currentMissionId || ""}
                        onValueChange={(v) => setSelectedMissionId(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Velg et oppdrag" />
                        </SelectTrigger>
                        <SelectContent>
                          {missions.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.tittel} - {m.lokasjon}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Mission Info Card */}
                  {soraMissionDetails && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-semibold">Oppdrag:</span> {soraMissionDetails.tittel}
                          </div>
                          <div>
                            <span className="font-semibold">Dato/tid:</span>{" "}
                            {format(new Date(soraMissionDetails.tidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                            {soraMissionDetails.slutt_tidspunkt &&
                              ` - ${format(new Date(soraMissionDetails.slutt_tidspunkt), "HH:mm", { locale: nb })}`
                            }
                          </div>
                          <div>
                            <span className="font-semibold">Sted:</span> {soraMissionDetails.lokasjon}
                          </div>
                          <div>
                            <span className="font-semibold">Risk-nivå:</span> {soraMissionDetails.risk_nivå}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* SORA Form Sections */}
                  <Accordion type="multiple" defaultValue={["section1", "section2", "section3", "section4", "section5"]} className="w-full">
                    {/* Section 1: Operasjonsmiljø og ConOps */}
                    <AccordionItem value="section1">
                      <AccordionTrigger>Operasjonsmiljø og ConOps</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Miljø</Label>
                          <Select value={soraFormData.environment} onValueChange={(value) => setSoraFormData({ ...soraFormData, environment: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg miljø" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Tettbygd">Tettbygd</SelectItem>
                              <SelectItem value="Landlig">Landlig</SelectItem>
                              <SelectItem value="Sjø">Sjø</SelectItem>
                              <SelectItem value="Industriområde">Industriområde</SelectItem>
                              <SelectItem value="Annet">Annet</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Kort ConOps-beskrivelse</Label>
                          <Textarea
                            value={soraFormData.conops_summary}
                            onChange={(e) => setSoraFormData({ ...soraFormData, conops_summary: e.target.value })}
                            placeholder="Kort beskrivelse av hva som skal gjøres, hvor og hvordan (3–5 linjer)."
                            rows={4}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Section 2: Bakkebasert risiko (GRC) */}
                    <AccordionItem value="section2">
                      <AccordionTrigger>Bakkebasert risiko (GRC)</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>iGRC (grunnrisiko på bakken)</Label>
                          <Select value={soraFormData.igrc} onValueChange={(value) => setSoraFormData({ ...soraFormData, igrc: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg iGRC" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                                <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Tiltak for bakkebasert risiko</Label>
                          <Textarea
                            value={soraFormData.ground_mitigations}
                            onChange={(e) => setSoraFormData({ ...soraFormData, ground_mitigations: e.target.value })}
                            placeholder="Beskriv sperringer, buffersoner, fallskjerm, ERP osv."
                            rows={4}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>fGRC (endelig risiko på bakken)</Label>
                          <Select value={soraFormData.fgrc} onValueChange={(value) => setSoraFormData({ ...soraFormData, fgrc: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg fGRC" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                                <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Section 3: Luftromsrisiko (ARC) */}
                    <AccordionItem value="section3">
                      <AccordionTrigger>Luftromsrisiko (ARC)</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Initial ARC</Label>
                          <Select value={soraFormData.arc_initial} onValueChange={(value) => setSoraFormData({ ...soraFormData, arc_initial: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg initial ARC" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ARC-A">ARC-A</SelectItem>
                              <SelectItem value="ARC-B">ARC-B</SelectItem>
                              <SelectItem value="ARC-C">ARC-C</SelectItem>
                              <SelectItem value="ARC-D">ARC-D</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Tiltak for luftromsrisiko</Label>
                          <Textarea
                            value={soraFormData.airspace_mitigations}
                            onChange={(e) => setSoraFormData({ ...soraFormData, airspace_mitigations: e.target.value })}
                            placeholder="Beskriv strategiske og taktiske tiltak (NOTAM, ATC-koordinering, observatører osv.)."
                            rows={4}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Residual ARC</Label>
                          <Select value={soraFormData.arc_residual} onValueChange={(value) => setSoraFormData({ ...soraFormData, arc_residual: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg residual ARC" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ARC-A">ARC-A</SelectItem>
                              <SelectItem value="ARC-B">ARC-B</SelectItem>
                              <SelectItem value="ARC-C">ARC-C</SelectItem>
                              <SelectItem value="ARC-D">ARC-D</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Section 4: SAIL og rest-risiko */}
                    <AccordionItem value="section4">
                      <AccordionTrigger>SAIL og rest-risiko</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>SAIL-nivå</Label>
                          <Select value={soraFormData.sail} onValueChange={(value) => setSoraFormData({ ...soraFormData, sail: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg SAIL-nivå" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SAIL I">SAIL I</SelectItem>
                              <SelectItem value="SAIL II">SAIL II</SelectItem>
                              <SelectItem value="SAIL III">SAIL III</SelectItem>
                              <SelectItem value="SAIL IV">SAIL IV</SelectItem>
                              <SelectItem value="SAIL V">SAIL V</SelectItem>
                              <SelectItem value="SAIL VI">SAIL VI</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Vurdering av rest-risiko</Label>
                          <Select value={soraFormData.residual_risk_level} onValueChange={(value) => setSoraFormData({ ...soraFormData, residual_risk_level: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Velg rest-risiko" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Lav">Lav</SelectItem>
                              <SelectItem value="Moderat">Moderat</SelectItem>
                              <SelectItem value="Høy">Høy</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Begrunnelse for rest-risiko</Label>
                          <Textarea
                            value={soraFormData.residual_risk_comment}
                            onChange={(e) => setSoraFormData({ ...soraFormData, residual_risk_comment: e.target.value })}
                            rows={3}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Operative begrensninger</Label>
                          <Textarea
                            value={soraFormData.operational_limits}
                            onChange={(e) => setSoraFormData({ ...soraFormData, operational_limits: e.target.value })}
                            placeholder="F.eks. maks vind, min. sikt, min. avstand til folk, bare dagslys osv."
                            rows={3}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Section 5: Status og godkjenning */}
                    <AccordionItem value="section5">
                      <AccordionTrigger>Status og godkjenning</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>SORA-status *</Label>
                          <Select value={soraFormData.sora_status} onValueChange={(value) => setSoraFormData({ ...soraFormData, sora_status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Ikke startet">Ikke startet</SelectItem>
                              <SelectItem value="Under arbeid">Under arbeid</SelectItem>
                              <SelectItem value="Ferdig">Ferdig</SelectItem>
                              <SelectItem value="Revidert">Revidert</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Utført av</Label>
                          <Input
                            value={
                              existingSora?.prepared_by
                                ? (preparedByProfile?.full_name || preparedByProfile?.email || "Ukjent")
                                : (user?.email || "")
                            }
                            disabled
                          />
                          {!existingSora?.prepared_by && (
                            <p className="text-xs text-muted-foreground">Dette feltet settes automatisk til innlogget bruker</p>
                          )}
                        </div>

                        {existingSora?.prepared_at && (
                          <div className="space-y-2">
                            <Label>Dato utført</Label>
                            <Input
                              value={format(new Date(existingSora.prepared_at), "d. MMM yyyy HH:mm", { locale: nb })}
                              disabled
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Godkjent av</Label>
                          <SearchablePersonSelect
                            persons={soraProfiles}
                            value={soraFormData.approved_by || null}
                            onValueChange={(val) => setSoraFormData({ ...soraFormData, approved_by: val || "" })}
                            placeholder="Velg godkjenner (valgfritt)"
                            searchPlaceholder="Søk person..."
                          />
                        </div>

                        {existingSora?.approved_at && (
                          <div className="space-y-2">
                            <Label>Dato godkjent</Label>
                            <Input
                              value={format(new Date(existingSora.approved_at), "d. MMM yyyy HH:mm", { locale: nb })}
                              disabled
                            />
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Avbryt
                    </Button>
                    <Button onClick={handleSoraSave} disabled={soraSaving}>
                      {soraSaving ? "Lagrer..." : "Lagre"}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="h-full m-0">
              <ScrollArea className="h-[calc(90vh-220px)]">
                <div className="space-y-3 pr-4">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : previousAssessments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t('riskAssessment.noHistory', 'Ingen tidligere vurderinger')}
                    </p>
                  ) : (
                    previousAssessments.map((assessment) => (
                      <button
                        key={assessment.id}
                        onClick={() => viewPreviousAssessment(assessment)}
                        className="w-full p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {assessment.ai_analysis?.hard_stop_triggered && (
                              <AlertOctagon className="w-4 h-4 text-destructive" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                  {format(new Date(assessment.created_at), "dd. MMM yyyy, HH:mm", { locale: nb })}
                                </p>
                                {assessment.sora_output && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
                                    SORA
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {t('riskAssessment.score', 'Score')}: {assessment.overall_score.toFixed(1)}/10
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="hover:bg-primary/20"
                              onClick={(e) => {
                                e.stopPropagation();
                                exportToPdf(
                                  assessment.ai_analysis,
                                  (assessment.pilot_comments as Record<string, string>) || {},
                                  assessment.created_at,
                                  assessment.sora_output ? 'sora' : 'ai',
                                  assessment.sora_output || undefined
                                );
                              }}
                              disabled={exportingPdf}
                            >
                              {exportingPdf ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileDown className="w-4 h-4" />
                              )}
                            </Button>
                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                              assessment.recommendation === 'go' 
                                ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                                : assessment.recommendation === 'caution'
                                ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                                : 'bg-red-500/20 text-red-700 dark:text-red-300'
                            }`}>
                              {assessment.recommendation.toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
