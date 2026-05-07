import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { syncSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { invalidateCompanySettingsCache } from "@/hooks/useCompanySettings";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Wind,
  Eye,
  Mountain,
  BatteryCharging,
  UserCheck,
  FileText,
  BookOpen,
  AlertTriangle,
  Loader2,
  Save,
  X,
  Info,
  Thermometer,
  Plane,
  Moon,
  Clock,
  Users,
  Building2,
  Sunrise,
  Lock,
} from "lucide-react";

interface Document {
  id: string;
  tittel: string;
  kategori: string;
  beskrivelse: string | null;
}

interface SoraConfig {
  max_wind_speed_ms: number;
  max_wind_gust_ms: number;
  max_visibility_km: number;
  max_flight_altitude_m: number;
  require_backup_battery: boolean;
  require_observer: boolean;
  min_temp_c: number;
  max_temp_c: number;
  allow_bvlos: boolean;
  allow_night_flight: boolean;
  require_civil_twilight: boolean;
  max_pilot_inactivity_days: number | null;
  max_population_density_per_km2: number | null;
  operative_restrictions: string;
  policy_notes: string;
  linked_document_ids: string[];
  sora_based_approval: boolean;
  sora_approval_threshold: number;
  sora_hardstop_requires_approval: boolean;
}

const DEFAULT_CONFIG: SoraConfig = {
  max_wind_speed_ms: 10,
  max_wind_gust_ms: 15,
  max_visibility_km: 1,
  max_flight_altitude_m: 120,
  require_backup_battery: false,
  require_observer: false,
  min_temp_c: -10,
  max_temp_c: 40,
  allow_bvlos: false,
  allow_night_flight: false,
  require_civil_twilight: false,
  max_pilot_inactivity_days: null,
  max_population_density_per_km2: null,
  operative_restrictions: "",
  policy_notes: "",
  linked_document_ids: [],
  sora_based_approval: false,
  sora_approval_threshold: 7.0,
  sora_hardstop_requires_approval: true,
};

export const CompanySoraConfigSection = () => {
  const { companyId } = useAuth();
  const [config, setConfig] = useState<SoraConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [inherited, setInherited] = useState(false);
  const [parentName, setParentName] = useState<string | null>(null);
  const [hasOwnConfig, setHasOwnConfig] = useState(false);
  const [isChild, setIsChild] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lockedByParent, setLockedByParent] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [propagateToChildren, setPropagateToChildren] = useState(false);
  const [savingPropagate, setSavingPropagate] = useState(false);
  const [propagateApproval, setPropagateApproval] = useState(false);
  const [savingPropagateApproval, setSavingPropagateApproval] = useState(false);
  const [approvalLockedByParent, setApprovalLockedByParent] = useState(false);

  const [approvalOpen, setApprovalOpen] = useState(true);
  const [hardstopOpen, setHardstopOpen] = useState(false);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchConfig();
      fetchDocuments();
    }
  }, [companyId]);

  const applyConfigData = (d: any) => {
    setConfig({
      max_wind_speed_ms: Number(d.max_wind_speed_ms) || DEFAULT_CONFIG.max_wind_speed_ms,
      max_wind_gust_ms: Number(d.max_wind_gust_ms) || DEFAULT_CONFIG.max_wind_gust_ms,
      max_visibility_km: Number(d.max_visibility_km) || DEFAULT_CONFIG.max_visibility_km,
      max_flight_altitude_m: Number(d.max_flight_altitude_m) || DEFAULT_CONFIG.max_flight_altitude_m,
      require_backup_battery: Boolean(d.require_backup_battery),
      require_observer: Boolean(d.require_observer),
      min_temp_c: d.min_temp_c != null ? Number(d.min_temp_c) : DEFAULT_CONFIG.min_temp_c,
      max_temp_c: d.max_temp_c != null ? Number(d.max_temp_c) : DEFAULT_CONFIG.max_temp_c,
      allow_bvlos: Boolean(d.allow_bvlos),
      allow_night_flight: Boolean(d.allow_night_flight),
      require_civil_twilight: Boolean(d.require_civil_twilight),
      max_pilot_inactivity_days: d.max_pilot_inactivity_days != null ? Number(d.max_pilot_inactivity_days) : null,
      max_population_density_per_km2: d.max_population_density_per_km2 != null ? Number(d.max_population_density_per_km2) : null,
      operative_restrictions: d.operative_restrictions || "",
      policy_notes: d.policy_notes || "",
      linked_document_ids: (d.linked_document_ids as string[]) || [],
      sora_based_approval: Boolean(d.sora_based_approval),
      sora_approval_threshold: d.sora_approval_threshold != null ? Number(d.sora_approval_threshold) : DEFAULT_CONFIG.sora_approval_threshold,
      sora_hardstop_requires_approval: d.sora_hardstop_requires_approval != null ? Boolean(d.sora_hardstop_requires_approval) : DEFAULT_CONFIG.sora_hardstop_requires_approval,
    });
  };

  const fetchConfig = async () => {
    setLoading(true);
    setInherited(false);
    setParentName(null);
    setHasOwnConfig(false);
    setIsChild(false);
    setLockedByParent(false);
    try {
      // Always check if this company is a child
      const { data: company } = await (supabase as any)
        .from("companies")
        .select("parent_company_id, propagate_sora_config, propagate_sora_approval")
        .eq("id", companyId!)
        .maybeSingle();

      const parentId = company?.parent_company_id || null;
      setIsChild(!!parentId);
      setPropagateToChildren(!!company?.propagate_sora_config);
      setPropagateApproval(!!company?.propagate_sora_approval);

      // Check if this company has children (for propagation toggle)
      if (!parentId) {
        const { count } = await supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("parent_company_id", companyId!);
        setHasChildren((count || 0) > 0);
      }

      // Fetch parent name + check parent propagation flags
      let parentPropagatesApproval = false;
      if (parentId) {
        const { data: parentCompany } = await (supabase as any)
          .from("companies")
          .select("navn, propagate_sora_config, propagate_sora_approval")
          .eq("id", parentId)
          .maybeSingle();
        setParentName(parentCompany?.navn || "Morselskap");
        if (parentCompany?.propagate_sora_config) {
          setLockedByParent(true);
        }
        if (parentCompany?.propagate_sora_approval) {
          setApprovalLockedByParent(true);
          parentPropagatesApproval = true;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("company_sora_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        applyConfigData(data);
        if (parentId) {
          setHasOwnConfig(true);
        }
      } else if (parentId) {
        // Fallback: use parent company config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parentConfig } = await (supabase as any)
          .from("company_sora_config")
          .select("*")
          .eq("company_id", parentId)
          .maybeSingle();

        if (parentConfig) {
          applyConfigData(parentConfig);
          setInherited(true);
        }
      }

      // If parent propagates SORA-approval, override approval-related fields with parent's values
      if (parentPropagatesApproval && parentId) {
        const { data: parentConfig } = await (supabase as any)
          .from("company_sora_config")
          .select("sora_based_approval, sora_approval_threshold, sora_hardstop_requires_approval")
          .eq("company_id", parentId)
          .maybeSingle();
        if (parentConfig) {
          setConfig((prev) => ({
            ...prev,
            sora_based_approval: !!parentConfig.sora_based_approval,
            sora_approval_threshold: parentConfig.sora_approval_threshold != null ? Number(parentConfig.sora_approval_threshold) : prev.sora_approval_threshold,
            sora_hardstop_requires_approval: parentConfig.sora_hardstop_requires_approval != null ? Boolean(parentConfig.sora_hardstop_requires_approval) : prev.sora_hardstop_requires_approval,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching SORA config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToParent = async () => {
    if (!companyId || !hasOwnConfig) return;
    setResetting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_sora_config")
        .delete()
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success("Tilbakestilt til morselskapets innstillinger");
      await fetchConfig();
      await fetchDocuments();
    } catch (error) {
      console.error("Error resetting config:", error);
      toast.error("Kunne ikke tilbakestille");
    } finally {
      setResetting(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      // Fetch own documents
      const { data: ownDocs, error } = await supabase
        .from("documents")
        .select("id, tittel, kategori, beskrivelse")
        .eq("company_id", companyId!)
        .order("tittel");

      if (error) throw error;

      // Also fetch parent company documents visible to children
      const { data: company } = await supabase
        .from("companies")
        .select("parent_company_id")
        .eq("id", companyId!)
        .maybeSingle();

      let allDocs = ownDocs || [];

      if (company?.parent_company_id) {
        const { data: parentDocs } = await supabase
          .from("documents")
          .select("id, tittel, kategori, beskrivelse")
          .eq("company_id", company.parent_company_id)
          .eq("visible_to_children", true)
          .order("tittel");

        if (parentDocs?.length) {
          // Merge, avoiding duplicates
          const ownIds = new Set(allDocs.map((d) => d.id));
          const uniqueParentDocs = parentDocs.filter((d) => !ownIds.has(d.id));
          allDocs = [...allDocs, ...uniqueParentDocs];
        }
      }

      setDocuments(allDocs);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_sora_config")
        .upsert(
          {
            company_id: companyId,
            max_wind_speed_ms: config.max_wind_speed_ms,
            max_wind_gust_ms: config.max_wind_gust_ms,
            max_visibility_km: config.max_visibility_km,
            max_flight_altitude_m: config.max_flight_altitude_m,
            require_backup_battery: config.require_backup_battery,
            require_observer: config.require_observer,
            min_temp_c: config.min_temp_c,
            max_temp_c: config.max_temp_c,
            allow_bvlos: config.allow_bvlos,
            allow_night_flight: config.allow_night_flight,
            require_civil_twilight: config.require_civil_twilight,
            max_pilot_inactivity_days: config.max_pilot_inactivity_days,
            max_population_density_per_km2: config.max_population_density_per_km2,
            operative_restrictions: config.operative_restrictions || null,
            policy_notes: config.policy_notes || null,
            linked_document_ids: config.linked_document_ids,
            sora_based_approval: config.sora_based_approval,
            sora_approval_threshold: config.sora_approval_threshold,
            sora_hardstop_requires_approval: config.sora_hardstop_requires_approval,
          },
          { onConflict: "company_id" }
        );

      if (error) throw error;
      toast.success("SORA-innstillinger lagret");
    } catch (error) {
      console.error("Error saving SORA config:", error);
      toast.error("Kunne ikke lagre innstillinger");
    } finally {
      setSaving(false);
    }
  };

  const toggleDocument = (docId: string) => {
    setConfig((prev) => ({
      ...prev,
      linked_document_ids: prev.linked_document_ids.includes(docId)
        ? prev.linked_document_ids.filter((id) => id !== docId)
        : [...prev.linked_document_ids, docId],
    }));
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.tittel.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
      doc.kategori.toLowerCase().includes(docSearchQuery.toLowerCase())
  );

  const linkedDocs = documents.filter((d) =>
    config.linked_document_ids.includes(d.id)
  );

  const getCategoryLabel = (kategori: string) => {
    const labels: Record<string, string> = {
      operasjonsmanual: "Operasjonsmanual",
      sikkerhet: "Sikkerhet",
      vedlikehold: "Vedlikehold",
      sertifikater: "Sertifikater",
      forsikring: "Forsikring",
      kontrakter: "Kontrakter",
      prosedyrer: "Prosedyrer",
      sjekklister: "Sjekklister",
      rapporter: "Rapporter",
      annet: "Annet",
    };
    return labels[kategori] || kategori;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Locked by parent banner */}
      {lockedByParent && parentName && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/40 bg-primary/5">
          <Lock className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">🔒 SORA-innstillingene styres av {parentName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Kontakt morselskapets administrator for å endre disse innstillingene.
            </p>
          </div>
        </div>
      )}

      {/* Inherited banner (soft, editable) */}
      {inherited && parentName && !lockedByParent && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <Building2 className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Arvet fra {parentName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Disse innstillingene er arvet fra morselskapet. Endringer du gjør her lagres som egne innstillinger for denne avdelingen.
            </p>
          </div>
        </div>
      )}

      {/* Reset to parent button */}
      {hasOwnConfig && isChild && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Egne SORA-innstillinger</p>
            <p className="text-xs text-muted-foreground mt-1">
              Denne avdelingen har egne innstillinger som overstyrer morselskapet.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToParent}
            disabled={resetting}
            className="flex-shrink-0"
          >
            {resetting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Tilbakestill til morselskap
          </Button>
        </div>
      )}

      {/* Header info */}
      {!inherited && !hasOwnConfig && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Selskapsspesifikke SORA-innstillinger</p>
            <p className="text-xs text-muted-foreground mt-1">
              Disse innstillingene overstyrer systemets standardverdier og sendes automatisk til AI-risikovurderingen for alle oppdrag i selskapet. Hardstop-grenser er absolutte og vil alltid utløse NO-GO uavhengig av andre scores.
            </p>
          </div>
        </div>
      )}

      <fieldset disabled={lockedByParent} className={lockedByParent ? "opacity-60 [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_button[role=switch]]:pointer-events-none [&_[role=slider]]:pointer-events-none" : ""}>
      {/* Kort 0: SORA-basert godkjenning */}
      <Collapsible open={approvalOpen} onOpenChange={setApprovalOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Godkjenning basert på SORA
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Automatisk godkjenning av oppdrag basert på AI SORA-resultater
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${approvalOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {approvalLockedByParent && parentName && (
                <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/40 bg-primary/5">
                  <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Arvet fra {parentName} — kun lesetilgang</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      «Godkjenning basert på SORA» og tilhørende terskler styres av morselskapet.
                    </p>
                  </div>
                </div>
              )}

              <fieldset disabled={approvalLockedByParent} className={approvalLockedByParent ? "opacity-60 space-y-6 [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_button[role=switch]]:pointer-events-none [&_[role=slider]]:pointer-events-none" : "space-y-6"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-medium">Godkjenning av oppdrag basert på SORA</p>
                    <p className="text-xs text-muted-foreground">
                      Når aktivert vil oppdrag automatisk godkjennes hvis AI SORA-score er over terskelen og ingen hardstop er utløst
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.sora_based_approval}
                  onCheckedChange={async (v) => {
                    setConfig((p) => ({ ...p, sora_based_approval: v }));
                    if (companyId) {
                      syncSoraApprovalEnabled(companyId, v);
                    }

                    // Auto-save this toggle immediately
                    try {
                      const { error } = await (supabase as any)
                        .from("company_sora_config")
                        .upsert(
                          { company_id: companyId, sora_based_approval: v },
                          { onConflict: "company_id" }
                        );
                      if (error) throw error;

                      // When enabling SORA-based approval, auto-disable require_sora_on_missions
                      if (v && companyId) {
                        await supabase
                          .from("companies")
                          .update({ require_sora_on_missions: false } as any)
                          .eq("id", companyId);
                        invalidateCompanySettingsCache();
                      }

                      toast.success(v ? "SORA-basert godkjenning aktivert" : "SORA-basert godkjenning deaktivert");
                    } catch (err) {
                      console.error("Error saving sora_based_approval:", err);
                      toast.error("Kunne ikke lagre innstillingen");
                      setConfig((p) => ({ ...p, sora_based_approval: !v }));
                      if (companyId) {
                        syncSoraApprovalEnabled(companyId, !v);
                      }
                    }
                  }}
                />
              </div>

              {/* Propagate-to-children toggle (only for parent companies with children) */}
              {!isChild && hasChildren && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Gjelder for alle underavdelinger</p>
                      <p className="text-xs text-muted-foreground">
                        Avdelingene arver «Godkjenning basert på SORA», terskel og hardstop-innstilling fra dette selskapet
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={propagateApproval}
                    disabled={savingPropagateApproval}
                    onCheckedChange={async (v) => {
                      if (!companyId) return;
                      setSavingPropagateApproval(true);
                      const prev = propagateApproval;
                      setPropagateApproval(v);
                      try {
                        const { error } = await (supabase as any)
                          .from("companies")
                          .update({ propagate_sora_approval: v })
                          .eq("id", companyId);
                        if (error) throw error;
                        toast.success(v ? "Propagering aktivert" : "Propagering deaktivert");
                      } catch (err) {
                        console.error("Error saving propagate_sora_approval:", err);
                        toast.error("Kunne ikke lagre propagering");
                        setPropagateApproval(prev);
                      } finally {
                        setSavingPropagateApproval(false);
                      }
                    }}
                  />
                </div>
              )}

              {config.sora_based_approval && (
                <div className="space-y-6 pt-2 border-t border-border">
                  {/* Threshold slider */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        AI SORA-terskel for automatisk godkjenning
                      </Label>
                      <Badge variant="outline" className="text-sm font-mono">
                        {config.sora_approval_threshold.toFixed(1)}
                      </Badge>
                    </div>
                    <Slider
                      value={[config.sora_approval_threshold]}
                      onValueChange={([v]) =>
                        setConfig((p) => ({ ...p, sora_approval_threshold: v }))
                      }
                      min={0}
                      max={10}
                      step={0.5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0 — Alltid godkjenning</span>
                      <span>10 — Krever perfekt score</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Oppdrag med AI-score ≥ {config.sora_approval_threshold.toFixed(1)} godkjennes automatisk. Lavere score krever manuell godkjenning.
                    </p>
                  </div>

                  {/* Hardstop toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <div>
                        <p className="text-sm font-medium">Krev godkjenning ved hardstop</p>
                        <p className="text-xs text-muted-foreground">
                          Uansett score — hvis en hardstop utløses kreves alltid manuell godkjenning
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={config.sora_hardstop_requires_approval}
                      onCheckedChange={(v) =>
                        setConfig((p) => ({ ...p, sora_hardstop_requires_approval: v }))
                      }
                    />
                  </div>
                </div>
              )}
              </fieldset>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kort 1: Hardstop-grenser */}
      <Collapsible open={hardstopOpen} onOpenChange={setHardstopOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Hardstop-grenser
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Absolutte terskler som alltid utløser NO-GO — overstyrer alle andre scores
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${hardstopOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-6">
              {/* Vindstyrke */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Wind className="h-4 w-4 text-blue-500" />
                    Maks vindstyrke (middelvind)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={config.max_wind_speed_ms}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, max_wind_speed_ms: Number(e.target.value) }))
                      }
                      className="w-20 h-8 text-center"
                      min={1}
                      max={30}
                    />
                    <span className="text-xs text-muted-foreground w-6">m/s</span>
                  </div>
                </div>
                <Slider
                  value={[config.max_wind_speed_ms]}
                  onValueChange={([v]) => setConfig((p) => ({ ...p, max_wind_speed_ms: v }))}
                  min={1}
                  max={30}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 m/s</span>
                  <span className="text-xs text-muted-foreground">Standard: 10 m/s</span>
                  <span>30 m/s</span>
                </div>
              </div>

              {/* Vindkast */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Wind className="h-4 w-4 text-cyan-500" />
                    Maks vindkast
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={config.max_wind_gust_ms}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, max_wind_gust_ms: Number(e.target.value) }))
                      }
                      className="w-20 h-8 text-center"
                      min={1}
                      max={40}
                    />
                    <span className="text-xs text-muted-foreground w-6">m/s</span>
                  </div>
                </div>
                <Slider
                  value={[config.max_wind_gust_ms]}
                  onValueChange={([v]) => setConfig((p) => ({ ...p, max_wind_gust_ms: v }))}
                  min={1}
                  max={40}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 m/s</span>
                  <span>Standard: 15 m/s</span>
                  <span>40 m/s</span>
                </div>
              </div>

              {/* Sikt */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4 text-green-500" />
                  Minimum sikt (km)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={config.max_visibility_km}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, max_visibility_km: Number(e.target.value) }))
                    }
                    className="w-28 h-9"
                    min={0.1}
                    max={20}
                    step={0.1}
                  />
                  <span className="text-sm text-muted-foreground">km sikt (standard: 1 km)</span>
                </div>
              </div>

              {/* Flyhøyde */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Mountain className="h-4 w-4 text-orange-500" />
                  Maks flyhøyde
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={config.max_flight_altitude_m}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, max_flight_altitude_m: Number(e.target.value) }))
                    }
                    className="w-28 h-9"
                    min={10}
                    max={500}
                    step={10}
                  />
                  <span className="text-sm text-muted-foreground">meter AGL (standard: 120 m)</span>
                </div>
              </div>

              {/* Bryterfelter */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Krev reservebatteri</p>
                      <p className="text-xs text-muted-foreground">Oppdrag krever alltid reservebatteri om bord</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.require_backup_battery}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, require_backup_battery: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Krev observatør</p>
                      <p className="text-xs text-muted-foreground">Alle oppdrag krever dedikert observatør</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.require_observer}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, require_observer: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Tillat BVLOS</p>
                      <p className="text-xs text-muted-foreground">Flyging utenfor visuell rekkevidde er tillatt. Hvis av → HARD STOP ved BVLOS-oppdrag</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.allow_bvlos}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, allow_bvlos: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium">Tillat nattflyging</p>
                      <p className="text-xs text-muted-foreground">Flyging i mørket er tillatt. Hvis av → HARD STOP ved nattoppdrag</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.allow_night_flight}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, allow_night_flight: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunrise className="h-4 w-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">Krev sivil skumring</p>
                      <p className="text-xs text-muted-foreground">Oppdrag må gjennomføres innenfor sivil skumring (dawn–dusk). HARD STOP hvis utenfor.</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.require_civil_twilight}
                    onCheckedChange={(v) =>
                      setConfig((p) => ({ ...p, require_civil_twilight: v }))
                    }
                  />
                </div>
              </div>

              {/* Temperaturgrenser */}
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Thermometer className="h-4 w-4 text-red-500" />
                  Temperaturgrenser (°C)
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Minimum temperatur</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={config.min_temp_c}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, min_temp_c: Number(e.target.value) }))
                        }
                        className="w-24 h-9"
                        min={-40}
                        max={0}
                      />
                      <span className="text-xs text-muted-foreground">°C (std: -10)</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Maksimum temperatur</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={config.max_temp_c}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, max_temp_c: Number(e.target.value) }))
                        }
                        className="w-24 h-9"
                        min={20}
                        max={55}
                      />
                      <span className="text-xs text-muted-foreground">°C (std: 40)</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Kritisk for LiPo-batterier. Fyring utenfor disse grensene utløser HARD STOP.</p>
              </div>

              {/* Pilotinaktivitet og befolkningstetthet */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-orange-500" />
                    Maks pilotinaktivitet (dager)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={config.max_pilot_inactivity_days ?? ""}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          max_pilot_inactivity_days: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="Ingen grense"
                      className="w-36 h-9"
                      min={1}
                      max={365}
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.max_pilot_inactivity_days
                        ? `HARD STOP hvis pilot ikke har flydd på >${config.max_pilot_inactivity_days} dager`
                        : "La stå tomt for ingen grense"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-teal-500" />
                    Maks befolkningstetthet (pers/km²)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={config.max_population_density_per_km2 ?? ""}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          max_population_density_per_km2: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="Ingen grense"
                      className="w-36 h-9"
                      min={1}
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.max_population_density_per_km2
                        ? `HARD STOP over ${config.max_population_density_per_km2} pers/km²`
                        : "La stå tomt for ingen grense"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">SORA-referanse: 500/km² = befolket, 1500/km² = tett bybebyggelse.</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kort 2: Operative begrensninger */}
      <Collapsible open={restrictionsOpen} onOpenChange={setRestrictionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Operative begrensninger
                    {config.operative_restrictions && (
                      <Badge variant="secondary" className="ml-1 text-xs">Satt</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Fritekst som sendes direkte til AI-en ved risikovurdering
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${restrictionsOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <Textarea
                value={config.operative_restrictions}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, operative_restrictions: e.target.value }))
                }
                placeholder="Skriv inn selskapets operative begrensninger som AI-en skal ta hensyn til i risikovurderingen...&#10;&#10;Eksempel:&#10;- Selskapet tillater ikke flyging over folkemengder uten skriftlig tillatelse&#10;- Alltid krever grunneierklarering for private eiendommer&#10;- Maksimalt 2 oppdrag per pilot per dag&#10;- Nattflyging krever spesiell godkjenning fra operativ leder"
                className="min-h-[200px] text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Denne teksten legges direkte inn i AI-prompten og overstyrer/supplerer selskapets operasjonsmanual.
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Kort 3: Policydokumenter */}
      <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Operasjonsmanual / Policydokumenter
                    {config.linked_document_ids.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {config.linked_document_ids.length} tilknyttet
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Lenk dokumenter fra biblioteket og legg inn nøkkelpunkter AI-en kan lese
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${documentsOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-5">
              {/* Dokumentvelger */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tilknyttede dokumenter (for referanse)</Label>
                <Input
                  placeholder="Søk etter dokumenter..."
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-border">
                  {filteredDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Ingen dokumenter funnet
                    </p>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const isLinked = config.linked_document_ids.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition-colors ${
                            isLinked ? "bg-primary/5" : ""
                          }`}
                          onClick={() => toggleDocument(doc.id)}
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${
                              isLinked
                                ? "bg-primary border-primary"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isLinked && (
                              <svg
                                className="w-3 h-3 text-primary-foreground m-auto"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.tittel}</p>
                            <p className="text-xs text-muted-foreground">
                              {getCategoryLabel(doc.kategori)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {linkedDocs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {linkedDocs.map((doc) => (
                      <Badge
                        key={doc.id}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs pr-1"
                      >
                        {doc.tittel}
                        <button
                          onClick={() => toggleDocument(doc.id)}
                          className="ml-1 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Policy notes - klartekst for AI */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Nøkkelpunkter fra operasjonsmanualen (AI-lesbar tekst)
                </Label>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    AI kan ikke lese PDF-filer direkte. Bruk dette feltet til å lime inn eller skrive de viktigste reglene fra operasjonsmanualen i klartekst — dette er det AI faktisk leser og bruker aktivt.
                  </p>
                </div>
                <Textarea
                  value={config.policy_notes}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, policy_notes: e.target.value }))
                  }
                  placeholder="Lim inn eller skriv nøkkelpunkter fra operasjonsmanualen som AI-en skal bruke aktivt ved risikovurdering...&#10;&#10;Eksempel:&#10;- Seksjon 4.2: Operatøren skal alltid kontrollere NOTAMs minst 2 timer før planlagt flyging&#10;- Seksjon 5.1: Minimum 2 batterier med full kapasitet for oppdrag over 15 min&#10;- Seksjon 6.3: Alle oppdrag i befolkede områder krever skriftlig grunneierklarering&#10;- Seksjon 7.1: Observatør obligatorisk ved sikt under 3 km"
                  className="min-h-[200px] text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  AI vil vurdere om oppdraget er i tråd med disse reglene og nevne avvik i risikovurderingen.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      </fieldset>
      {!isChild && hasChildren && (
        <div className="rounded-lg border border-primary/30 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="propagate-sora-config" className="flex-1 cursor-pointer pr-4">
              <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Når aktivert låses SORA-innstillingene for alle avdelinger og verdiene pushes fra morselskapet
              </div>
            </Label>
            <Switch
              id="propagate-sora-config"
              checked={propagateToChildren}
              onCheckedChange={async (checked) => {
                if (!companyId) return;
                setSavingPropagate(true);
                setPropagateToChildren(checked);
                await (supabase as any)
                  .from("companies")
                  .update({ propagate_sora_config: checked })
                  .eq("id", companyId);
                if (checked) {
                  // Push current config to all children
                  const { data: childCompanies } = await supabase
                    .from("companies")
                    .select("id")
                    .eq("parent_company_id", companyId);
                  if (childCompanies && childCompanies.length > 0) {
                    for (const child of childCompanies) {
                      await (supabase as any)
                        .from("company_sora_config")
                        .upsert({
                          company_id: child.id,
                          max_wind_speed_ms: config.max_wind_speed_ms,
                          max_wind_gust_ms: config.max_wind_gust_ms,
                          max_visibility_km: config.max_visibility_km,
                          max_flight_altitude_m: config.max_flight_altitude_m,
                          require_backup_battery: config.require_backup_battery,
                          require_observer: config.require_observer,
                          min_temp_c: config.min_temp_c,
                          max_temp_c: config.max_temp_c,
                          allow_bvlos: config.allow_bvlos,
                          allow_night_flight: config.allow_night_flight,
                          require_civil_twilight: config.require_civil_twilight,
                          max_pilot_inactivity_days: config.max_pilot_inactivity_days,
                          max_population_density_per_km2: config.max_population_density_per_km2,
                          operative_restrictions: config.operative_restrictions || null,
                          policy_notes: config.policy_notes || null,
                          linked_document_ids: config.linked_document_ids,
                          sora_based_approval: config.sora_based_approval,
                          sora_approval_threshold: config.sora_approval_threshold,
                          sora_hardstop_requires_approval: config.sora_hardstop_requires_approval,
                        }, { onConflict: "company_id" });
                    }
                  }
                  toast.success("SORA-innstillinger låst og pushet til alle avdelinger");
                } else {
                  toast.success("Avdelinger kan nå redigere SORA-innstillinger selv");
                }
                setSavingPropagate(false);
              }}
              disabled={savingPropagate}
            />
          </div>
        </div>
      )}

      {/* Lagre-knapp */}
      {!lockedByParent && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Lagrer..." : "Lagre SORA-innstillinger"}
          </Button>
        </div>
      )}
    </div>
  );
};
