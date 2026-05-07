import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCompanySettingsCache } from "@/hooks/useCompanySettings";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { FH2DevicesSection } from "./FH2DevicesSection";
import { Plus, Pencil, Building2, Settings, Hash, ChevronDown, ChevronUp, Trash2, UserCog, Info, X, Bell, Send, AlertTriangle, Lock } from "lucide-react";
import { DeviationCategoryTreeEditor } from "./DeviationCategoryTreeEditor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSoraApprovalEnabled } from "@/hooks/useSoraApprovalEnabled";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";

interface ChildCompany {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  adresse_lat?: number | null;
  adresse_lon?: number | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype: string | null;
  stripe_exempt?: boolean;
  parent_company_id?: string | null;
}

interface ChildCompaniesSectionProps {
  departmentsEnabled: boolean;
}

export const ChildCompaniesSection = ({ departmentsEnabled }: ChildCompaniesSectionProps) => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const soraApprovalEnabled = useSoraApprovalEnabled();
  const [children, setChildren] = useState<ChildCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<ChildCompany | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<ChildCompany | null>(null);
  const [parentCompanyName, setParentCompanyName] = useState<string>("");
  const [showAllAirspaceWarnings, setShowAllAirspaceWarnings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hideReporterIdentity, setHideReporterIdentity] = useState(false);
  const [incidentReportsVisibleToAllCompanies, setIncidentReportsVisibleToAllCompanies] = useState(false);
  const [requireMissionApproval, setRequireMissionApproval] = useState(false);
  const [preventSelfApproval, setPreventSelfApproval] = useState(false);
  const [allUsersCanAcknowledgeMaintenance, setAllUsersCanAcknowledgeMaintenance] = useState(false);
  const [requireSoraOnMissions, setRequireSoraOnMissions] = useState(false);
  const [requireSoraSteps, setRequireSoraSteps] = useState(1);
  const [deviationReportEnabled, setDeviationReportEnabled] = useState(false);
  const [parentDeviationCompanyId, setParentDeviationCompanyId] = useState<string | null>(null);
  // Inheritance: when current company has a parent that propagates a setting,
  // the field is locked and shows the parent's value.
  const [isChildDept, setIsChildDept] = useState(false);
  const [parentNavn, setParentNavn] = useState<string>("");
  const [inherited, setInherited] = useState<{
    show_all_airspace_warnings: boolean;
    hide_reporter_identity: boolean;
    incident_reports_visible_to_all_companies: boolean;
    require_mission_approval: boolean;
    prevent_self_approval: boolean;
    all_users_can_acknowledge_maintenance: boolean;
    require_sora_on_missions: boolean;
    require_sora_steps: number;
    deviation_report_enabled: boolean;
    propagate_airspace_warnings: boolean;
    propagate_hide_reporter: boolean;
    propagate_mission_approval: boolean;
    propagate_prevent_self_approval: boolean;
    propagate_all_users_can_acknowledge_maintenance: boolean;
    propagate_sora_required: boolean;
    propagate_deviation_report: boolean;
    propagate_sora_buffer_mode: boolean;
    propagate_mission_roles: boolean;
    propagate_flight_alerts: boolean;
    propagate_fh2_credentials: boolean;
    safesky_callsign_propagate: boolean;
    safesky_callsign_prefix: string | null;
    safesky_callsign_variable: 'counter' | 'drone_registration';
    // parent SORA defaults
    default_buffer_mode: "corridor" | "convexHull";
    default_flight_geography_m: number;
    default_flight_altitude_m: number;
    // parent mission roles
    mission_roles: { id: string; name: string }[];
    // parent flight alerts
    flight_alerts: Record<string, { enabled: boolean; threshold_value: number | null }>;
    alert_recipients: { id: string; profile_id: string; full_name: string | null }[];
  } | null>(null);
  const [defaultBufferMode, setDefaultBufferMode] = useState<"corridor" | "convexHull">("corridor");
  const [defaultFlightGeographyM, setDefaultFlightGeographyM] = useState(0);
  const [defaultFlightAltitudeM, setDefaultFlightAltitudeM] = useState(30);
  const [applySettingsToChildren, setApplySettingsToChildren] = useState(false);
  const [applyRolesToChildren, setApplyRolesToChildren] = useState(false);
  const [applyAlertsToChildren, setApplyAlertsToChildren] = useState(false);
  const [applySoraDefaultsToChildren, setApplySoraDefaultsToChildren] = useState(false);
  const [applyFh2ToChildren, setApplyFh2ToChildren] = useState(false);
  const [missionRoles, setMissionRoles] = useState<{id: string; name: string}[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  // SafeSky callsign state
  const [callsignPrefix, setCallsignPrefix] = useState("");
  const [callsignVariable, setCallsignVariable] = useState<'counter' | 'drone_registration'>('counter');
  const [callsignPropagate, setCallsignPropagate] = useState(false);
  const [savingCallsign, setSavingCallsign] = useState(false);
  const callsignEditing = useRef(false);

  // ── Flight alerts state ──
  const ALERT_TYPES = [
    { key: 'low_battery', label: 'Batteri under', unit: '%', defaultValue: 20, hasThreshold: true },
    { key: 'rth_triggered', label: 'RTH ble trigget', unit: '', defaultValue: null, hasThreshold: false },
    { key: 'max_height', label: 'Høyde over', unit: 'm AGL', defaultValue: 120, hasThreshold: true },
    { key: 'max_speed', label: 'Maks hastighet over', unit: 'm/s', defaultValue: 20, hasThreshold: true },
    { key: 'low_gps_sats', label: 'GPS-satellitter under', unit: 'stk', defaultValue: 6, hasThreshold: true },
    { key: 'battery_cell_deviation', label: 'Battericelleavvik over', unit: 'V', defaultValue: 0.3, hasThreshold: true },
    { key: 'battery_temp_high', label: 'Batteritemperatur over', unit: '°C', defaultValue: 50, hasThreshold: true },
    { key: 'high_vibration', label: 'Høy vibrasjon (ArduPilot)', unit: '', defaultValue: null, hasThreshold: false },
  ];

  const [flightAlerts, setFlightAlerts] = useState<Record<string, { enabled: boolean; threshold_value: number | null }>>({});
  const [alertRecipients, setAlertRecipients] = useState<{ id: string; profile_id: string; full_name: string | null }[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // FlightHub 2 state
  const [fh2Token, setFh2Token] = useState("");
  const fh2Editing = useRef(false);
  const [fh2BaseUrl, setFh2BaseUrl] = useState("");
  const [savingFh2, setSavingFh2] = useState(false);
  const [testingFh2, setTestingFh2] = useState(false);
  const [fh2ShowToken, setFh2ShowToken] = useState(false);
  const [fh2Connected, setFh2Connected] = useState(false);
  const [fh2Projects, setFh2Projects] = useState<string[]>([]);
  const [fh2Inherited, setFh2Inherited] = useState(false);
  const fh2Locked = isChildDept && !!inherited?.propagate_fh2_credentials;

  const fetchFlightAlerts = useCallback(async () => {
    if (!companyId) return;
    setLoadingAlerts(true);
    const { data: alerts } = await (supabase as any)
      .from("company_flight_alerts")
      .select("alert_type, enabled, threshold_value")
      .eq("company_id", companyId);
    const map: Record<string, { enabled: boolean; threshold_value: number | null }> = {};
    (alerts || []).forEach((a: any) => { map[a.alert_type] = { enabled: a.enabled, threshold_value: a.threshold_value }; });
    setFlightAlerts(map);

    const { data: recipients } = await (supabase as any)
      .from("company_flight_alert_recipients")
      .select("id, profile_id")
      .eq("company_id", companyId);
    
    // Fetch names for recipients
    const profileIds = (recipients || []).map((r: any) => r.profile_id);
    let profileMap: Record<string, string | null> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
    }
    setAlertRecipients((recipients || []).map((r: any) => ({
      id: r.id, profile_id: r.profile_id, full_name: profileMap[r.profile_id] || null,
    })));

    // Fetch company profiles for the recipient selector
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .order("full_name");
    setCompanyProfiles(allProfiles || []);
    setLoadingAlerts(false);
  }, [companyId]);

  const handleToggleAlert = async (alertType: string, enabled: boolean) => {
    if (!companyId) return;
    const defaultVal = ALERT_TYPES.find(a => a.key === alertType)?.defaultValue ?? null;
    const current = flightAlerts[alertType];
    await (supabase as any).from("company_flight_alerts").upsert({
      company_id: companyId,
      alert_type: alertType,
      enabled,
      threshold_value: current?.threshold_value ?? defaultVal,
    }, { onConflict: 'company_id,alert_type' });
    setFlightAlerts(prev => ({ ...prev, [alertType]: { enabled, threshold_value: current?.threshold_value ?? defaultVal } }));
  };

  const handleChangeThreshold = async (alertType: string, value: number) => {
    if (!companyId) return;
    const current = flightAlerts[alertType];
    await (supabase as any).from("company_flight_alerts").upsert({
      company_id: companyId,
      alert_type: alertType,
      enabled: current?.enabled ?? true,
      threshold_value: value,
    }, { onConflict: 'company_id,alert_type' });
    setFlightAlerts(prev => ({ ...prev, [alertType]: { enabled: current?.enabled ?? true, threshold_value: value } }));
  };

  const handleAddRecipient = async (profileId: string | null) => {
    if (!companyId || !profileId) return;
    if (alertRecipients.some(r => r.profile_id === profileId)) return;
    const { data, error } = await (supabase as any).from("company_flight_alert_recipients")
      .insert({ company_id: companyId, profile_id: profileId })
      .select("id")
      .single();
    if (error) {
      if (error.code === '23505') toast.error("Mottaker finnes allerede");
      else toast.error("Kunne ikke legge til mottaker");
      return;
    }
    const profile = companyProfiles.find(p => p.id === profileId);
    setAlertRecipients(prev => [...prev, { id: data.id, profile_id: profileId, full_name: profile?.full_name || null }]);
    toast.success("Mottaker lagt til");
  };

  const handleRemoveRecipient = async (recipientId: string) => {
    await (supabase as any).from("company_flight_alert_recipients").delete().eq("id", recipientId);
    setAlertRecipients(prev => prev.filter(r => r.id !== recipientId));
    toast.success("Mottaker fjernet");
  };

  const fetchMissionRoles = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from("company_mission_roles")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name");
    setMissionRoles(data || []);
  }, [companyId]);

  const handleAddRole = async () => {
    if (!companyId || !newRoleName.trim()) return;
    setSavingRole(true);
    const { error } = await (supabase as any)
      .from("company_mission_roles")
      .insert({ company_id: companyId, name: newRoleName.trim() });
    setSavingRole(false);
    if (error) {
      if (error.code === '23505') toast.error("Rollen finnes allerede");
      else toast.error("Kunne ikke legge til rolle");
      return;
    }
    setNewRoleName("");
    toast.success("Rolle lagt til");
    fetchMissionRoles();
  };

  const handleDeleteRole = async (roleId: string) => {
    const { error } = await (supabase as any)
      .from("company_mission_roles")
      .delete()
      .eq("id", roleId);
    if (error) {
      toast.error("Kunne ikke slette rolle");
      return;
    }
    toast.success("Rolle slettet");
    fetchMissionRoles();
  };

  const fetchChildren = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, navn, org_nummer, adresse, adresse_lat, adresse_lon, kontakt_epost, kontakt_telefon, aktiv, selskapstype, stripe_exempt, parent_company_id")
        .eq("parent_company_id", companyId)
        .order("navn");

      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error("Error fetching child companies:", error);
      toast.error("Kunne ikke laste avdelinger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
    fetchParentSettings();
    fetchMissionRoles();
    fetchFlightAlerts();

    if (!companyId) return;
    const channel = supabase
      .channel(`company-settings-${companyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${companyId}` },
        () => {
          fetchParentSettings();
          invalidateCompanySettingsCache();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchParentSettings = async () => {
    if (!companyId) return;
    const { data } = await (supabase as any)
      .from("companies")
      .select("navn, parent_company_id, show_all_airspace_warnings, hide_reporter_identity, incident_reports_visible_to_all_companies, require_mission_approval, prevent_self_approval, all_users_can_acknowledge_maintenance, require_sora_on_missions, require_sora_steps, deviation_report_enabled, flighthub2_base_url, safesky_callsign_prefix, safesky_callsign_variable, safesky_callsign_propagate, propagate_airspace_warnings, propagate_hide_reporter, propagate_mission_approval, propagate_prevent_self_approval, propagate_all_users_can_acknowledge_maintenance, propagate_sora_required, propagate_deviation_report, propagate_sora_buffer_mode, propagate_mission_roles, propagate_flight_alerts, propagate_fh2_credentials")
      .eq("id", companyId)
      .single();
    if (data) {
      setParentCompanyName(data.navn);
      setShowAllAirspaceWarnings((data as any).show_all_airspace_warnings ?? false);
      setHideReporterIdentity((data as any).hide_reporter_identity ?? false);
      setIncidentReportsVisibleToAllCompanies((data as any).incident_reports_visible_to_all_companies ?? false);
      setRequireMissionApproval((data as any).require_mission_approval ?? false);
      setPreventSelfApproval((data as any).prevent_self_approval ?? false);
      setAllUsersCanAcknowledgeMaintenance((data as any).all_users_can_acknowledge_maintenance ?? false);
      setRequireSoraOnMissions((data as any).require_sora_on_missions ?? false);
      setRequireSoraSteps((data as any).require_sora_steps ?? 1);
      const parentId = (data as any).parent_company_id as string | null;
      setParentDeviationCompanyId(parentId);
      setIsChildDept(!!parentId);
      // Reflect own propagation state for parent company
      const ownPropagate = !!(
        (data as any).propagate_airspace_warnings ||
        (data as any).propagate_hide_reporter ||
        (data as any).propagate_mission_approval ||
        (data as any).propagate_prevent_self_approval ||
        (data as any).propagate_all_users_can_acknowledge_maintenance ||
        (data as any).propagate_sora_required ||
        (data as any).propagate_deviation_report
      );
      setApplySettingsToChildren(ownPropagate);
      setApplyRolesToChildren(!!(data as any).propagate_mission_roles);
      setApplyAlertsToChildren(!!(data as any).propagate_flight_alerts);
      setApplySoraDefaultsToChildren(!!(data as any).propagate_sora_buffer_mode);
      setApplyFh2ToChildren(!!(data as any).propagate_fh2_credentials);

      let parentPropagatesFh2 = false;
      // Load parent inheritance data (propagation flags + values)
      if (parentId) {
        const [{ data: parent }, { data: parentSora }, { data: parentRoles }, { data: parentAlerts }, { data: parentRecipients }] = await Promise.all([
          (supabase as any)
            .from("companies")
            .select("navn, show_all_airspace_warnings, hide_reporter_identity, incident_reports_visible_to_all_companies, require_mission_approval, prevent_self_approval, all_users_can_acknowledge_maintenance, require_sora_on_missions, require_sora_steps, deviation_report_enabled, propagate_airspace_warnings, propagate_hide_reporter, propagate_mission_approval, propagate_prevent_self_approval, propagate_all_users_can_acknowledge_maintenance, propagate_sora_required, propagate_deviation_report, propagate_sora_buffer_mode, propagate_mission_roles, propagate_flight_alerts, propagate_fh2_credentials, safesky_callsign_prefix, safesky_callsign_variable, safesky_callsign_propagate")
            .eq("id", parentId)
            .maybeSingle(),
          (supabase as any)
            .from("company_sora_config")
            .select("default_buffer_mode, default_flight_geography_m, default_flight_altitude_m")
            .eq("company_id", parentId)
            .maybeSingle(),
          (supabase as any)
            .from("company_mission_roles")
            .select("id, name")
            .eq("company_id", parentId)
            .order("name"),
          (supabase as any)
            .from("company_flight_alerts")
            .select("alert_type, enabled, threshold_value")
            .eq("company_id", parentId),
          (supabase as any)
            .from("company_flight_alert_recipients")
            .select("id, profile_id")
            .eq("company_id", parentId),
        ]);

        // Build alert map
        const alertMap: Record<string, { enabled: boolean; threshold_value: number | null }> = {};
        (parentAlerts || []).forEach((a: any) => { alertMap[a.alert_type] = { enabled: a.enabled, threshold_value: a.threshold_value }; });

        // Recipients with names
        const recProfileIds = (parentRecipients || []).map((r: any) => r.profile_id);
        let recProfileMap: Record<string, string | null> = {};
        if (recProfileIds.length > 0) {
          const { data: recProfiles } = await supabase.from("profiles").select("id, full_name").in("id", recProfileIds);
          (recProfiles || []).forEach((p: any) => { recProfileMap[p.id] = p.full_name; });
        }
        const recList = (parentRecipients || []).map((r: any) => ({
          id: r.id, profile_id: r.profile_id, full_name: recProfileMap[r.profile_id] || null,
        }));

        if (parent) {
          parentPropagatesFh2 = !!parent.propagate_fh2_credentials;
          setParentNavn(parent.navn || "");
          setInherited({
            show_all_airspace_warnings: parent.show_all_airspace_warnings ?? false,
            hide_reporter_identity: parent.hide_reporter_identity ?? false,
            incident_reports_visible_to_all_companies: parent.incident_reports_visible_to_all_companies ?? false,
            require_mission_approval: parent.require_mission_approval ?? false,
            prevent_self_approval: parent.prevent_self_approval ?? false,
            all_users_can_acknowledge_maintenance: parent.all_users_can_acknowledge_maintenance ?? false,
            require_sora_on_missions: parent.require_sora_on_missions ?? false,
            require_sora_steps: parent.require_sora_steps ?? 1,
            deviation_report_enabled: parent.deviation_report_enabled ?? false,
            propagate_airspace_warnings: parent.propagate_airspace_warnings ?? false,
            propagate_hide_reporter: parent.propagate_hide_reporter ?? false,
            propagate_mission_approval: parent.propagate_mission_approval ?? false,
            propagate_prevent_self_approval: parent.propagate_prevent_self_approval ?? false,
            propagate_all_users_can_acknowledge_maintenance: parent.propagate_all_users_can_acknowledge_maintenance ?? false,
            propagate_sora_required: parent.propagate_sora_required ?? false,
            propagate_deviation_report: parent.propagate_deviation_report ?? false,
            propagate_sora_buffer_mode: parent.propagate_sora_buffer_mode ?? false,
            propagate_mission_roles: parent.propagate_mission_roles ?? false,
            propagate_flight_alerts: parent.propagate_flight_alerts ?? false,
            propagate_fh2_credentials: parent.propagate_fh2_credentials ?? false,
            safesky_callsign_propagate: parent.safesky_callsign_propagate ?? false,
            safesky_callsign_prefix: parent.safesky_callsign_prefix ?? null,
            safesky_callsign_variable: ((parent.safesky_callsign_variable as 'counter' | 'drone_registration') || 'counter'),
            default_buffer_mode: (parentSora?.default_buffer_mode as "corridor" | "convexHull") || "corridor",
            default_flight_geography_m: parentSora?.default_flight_geography_m ?? 0,
            default_flight_altitude_m: parentSora?.default_flight_altitude_m ?? 30,
            mission_roles: parentRoles || [],
            flight_alerts: alertMap,
            alert_recipients: recList,
          });
          setDeviationReportEnabled(parent.deviation_report_enabled ?? false);
        }
      } else {
        setInherited(null);
        setParentNavn("");
        setDeviationReportEnabled((data as any).deviation_report_enabled ?? false);
      }
      setFh2BaseUrl((data as any).flighthub2_base_url || "");
      if (!callsignEditing.current) {
        setCallsignPrefix((data as any).safesky_callsign_prefix ?? "");
        setCallsignVariable(((data as any).safesky_callsign_variable as 'counter' | 'drone_registration') || 'counter');
        setCallsignPropagate((data as any).safesky_callsign_propagate ?? false);
      }

      // Check if FH2 credentials exist (own or inherited via parent)
      const { data: cred } = await (supabase as any)
        .from("company_fh2_credentials")
        .select("company_id")
        .eq("company_id", companyId)
        .maybeSingle();

      const hasOwnCred = !!cred;
      if (hasOwnCred && !fh2Editing.current) setFh2Token("••••••••");
      if (!hasOwnCred && !fh2Editing.current) setFh2Token("");

      // Always try test-connection — edge function handles parent fallback
      try {
        const { data: testData } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "test-connection" },
        });
        if (testData?.token_ok) {
          setFh2Connected(true);
          setFh2Projects(testData.project_names || []);
          setFh2Inherited(parentId ? parentPropagatesFh2 : false);
        } else {
          setFh2Connected(false);
          setFh2Inherited(false);
        }
      } catch {
        setFh2Inherited(false);
      }
    }
    // Fetch default buffer mode from sora config
    const { data: soraData } = await (supabase as any)
      .from("company_sora_config")
      .select("default_buffer_mode, default_flight_geography_m, default_flight_altitude_m")
      .eq("company_id", companyId)
      .maybeSingle();
    if (soraData?.default_buffer_mode) {
      setDefaultBufferMode(soraData.default_buffer_mode);
    }
    if (soraData?.default_flight_geography_m != null) {
      setDefaultFlightGeographyM(soraData.default_flight_geography_m);
    }
    if (soraData?.default_flight_altitude_m != null) {
      setDefaultFlightAltitudeM(soraData.default_flight_altitude_m);
    }
  };

  const handleToggleAirspaceWarnings = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ show_all_airspace_warnings: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setShowAllAirspaceWarnings(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleHideReporter = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ hide_reporter_identity: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ hide_reporter_identity: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setHideReporterIdentity(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleIncidentReportsVisibleToAllCompanies = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ incident_reports_visible_to_all_companies: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    setSavingSettings(false);
    setIncidentReportsVisibleToAllCompanies(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleRequireMissionApproval = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_mission_approval: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_mission_approval: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireMissionApproval(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleTogglePreventSelfApproval = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ prevent_self_approval: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ prevent_self_approval: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setPreventSelfApproval(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleAllUsersCanAcknowledgeMaintenance = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await (supabase as any)
      .from("companies")
      .update({ all_users_can_acknowledge_maintenance: checked })
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await (supabase as any)
        .from("companies")
        .update({ all_users_can_acknowledge_maintenance: checked })
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setAllUsersCanAcknowledgeMaintenance(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleRequireSora = async (checked: boolean) => {
    if (!companyId) return;

    if (checked) {
      const { data: soraConfig } = await supabase
        .from("company_sora_config")
        .select("sora_based_approval")
        .eq("company_id", companyId)
        .maybeSingle();

      if (soraApprovalEnabled || !!soraConfig?.sora_based_approval) {
        toast.error("Kan ikke aktiveres når SORA-basert godkjenning er på");
        return;
      }
    }

    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_sora_on_missions: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_sora_on_missions: checked } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireSoraOnMissions(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleToggleDeviationReport = async (checked: boolean) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ deviation_report_enabled: checked } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }
    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ deviation_report_enabled: checked } as any)
        .eq("parent_company_id", companyId);
    }
    setSavingSettings(false);
    setDeviationReportEnabled(checked);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
    if (checked) {
      const { count } = await (supabase as any)
        .from("deviation_report_categories")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if ((count || 0) === 0) {
        toast.info("Husk å definere kategorier nedenfor – ellers vises ingen pop-up til pilotene.");
      }
    }
  };

  const handleChangeSoraSteps = async (steps: number) => {
    if (!companyId) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update({ require_sora_steps: steps } as any)
      .eq("id", companyId);
    if (error) {
      setSavingSettings(false);
      toast.error("Kunne ikke lagre innstilling");
      return;
    }

    if (applySettingsToChildren) {
      await supabase
        .from("companies")
        .update({ require_sora_steps: steps } as any)
        .eq("parent_company_id", companyId);
    }

    setSavingSettings(false);
    setRequireSoraSteps(steps);
    invalidateCompanySettingsCache();
    toast.success("Innstilling lagret");
  };

  const handleChangeBufferMode = async (mode: "corridor" | "convexHull") => {
    if (!companyId) return;
    setSavingSettings(true);
    await (supabase as any)
      .from("company_sora_config")
      .upsert({ company_id: companyId, default_buffer_mode: mode }, { onConflict: 'company_id' });
    setSavingSettings(false);
    setDefaultBufferMode(mode);
    invalidateCompanySettingsCache();
    toast.success("Buffermodus lagret");
  };

  const handleChangeDefaultFlightGeography = async (value: number) => {
    if (!companyId) return;
    setDefaultFlightGeographyM(value);
    setSavingSettings(true);
    await (supabase as any)
      .from("company_sora_config")
      .upsert({ company_id: companyId, default_flight_geography_m: value }, { onConflict: 'company_id' });
    setSavingSettings(false);
    invalidateCompanySettingsCache();
    toast.success("Standard Flight Geography lagret");
  };

  const handleChangeDefaultFlightAltitude = async (value: number) => {
    if (!companyId) return;
    setDefaultFlightAltitudeM(value);
    setSavingSettings(true);
    await (supabase as any)
      .from("company_sora_config")
      .upsert({ company_id: companyId, default_flight_altitude_m: value }, { onConflict: 'company_id' });
    setSavingSettings(false);
    invalidateCompanySettingsCache();
    toast.success("Standard flyhøyde lagret");
  };

  const handleSaveCallsign = async () => {
    if (!companyId) return;
    setSavingCallsign(true);
    const payload: any = {
      safesky_callsign_prefix: callsignPrefix.trim() || null,
      safesky_callsign_variable: callsignVariable,
      safesky_callsign_propagate: callsignPropagate,
    };
    const { error } = await supabase.from("companies").update(payload).eq("id", companyId);
    if (error) {
      setSavingCallsign(false);
      toast.error("Kunne ikke lagre SafeSky-callsign");
      return;
    }
    if (callsignPropagate) {
      await supabase
        .from("companies")
        .update({
          safesky_callsign_prefix: payload.safesky_callsign_prefix,
          safesky_callsign_variable: payload.safesky_callsign_variable,
        } as any)
        .eq("parent_company_id", companyId);
    }
    setSavingCallsign(false);
    callsignEditing.current = false;
    invalidateCompanySettingsCache();
    toast.success("SafeSky-callsign lagret");
  };

  const FH2_MASK = "••••••••";

  const handleSaveFh2 = async () => {
    if (!companyId) return;
    const cleanToken = (fh2Token || "").trim().replace(/^bearer\s+/i, "");
    if (cleanToken === FH2_MASK) {
      toast("Nøkkelen er allerede lagret");
      return;
    }
    if (!cleanToken) {
      toast.error("Fyll inn en nøkkel først");
      return;
    }
    setSavingFh2(true);
    try {
      if (cleanToken) {
        const { error } = await supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "save-token", token: cleanToken },
        });
        if (error) throw error;
      } else {
        await (supabase as any).from("company_fh2_credentials").delete().eq("company_id", companyId);
      }
      setFh2Token(cleanToken ? FH2_MASK : "");
      fh2Editing.current = false;
      toast.success(cleanToken ? "FlightHub 2-nøkkel lagret (kryptert)" : "FlightHub 2-nøkkel fjernet");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke lagre");
    } finally {
      setSavingFh2(false);
    }
  };

  const handleDeleteFh2 = async () => {
    if (!companyId) return;
    setSavingFh2(true);
    try {
      await (supabase as any).from("company_fh2_credentials").delete().eq("company_id", companyId);
      setFh2Token("");
      setFh2Connected(false);
      setFh2Projects([]);
      toast.success("FlightHub 2-nøkkel slettet");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke slette");
    } finally {
      setSavingFh2(false);
    }
  };

  const handleTestFh2 = async () => {
    setTestingFh2(true);
    setFh2Connected(false);
    setFh2Projects([]);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "test-connection" },
      });
      if (error) throw error;

      if (data?.token_ok) {
        if (data.working_base_url && !fh2Locked) {
          await supabase
            .from("companies")
            .update({ flighthub2_base_url: data.working_base_url } as any)
            .eq("id", companyId);
          setFh2BaseUrl(data.working_base_url);
        }

        const projectNames: string[] = data.project_names || [];
        setFh2Projects(projectNames);
        setFh2Connected(true);
        toast.success(`Gratulerer! Du er tilkoblet din FH2-konto med ${data.project_count || 0} prosjekter`);
      } else if (data?.server_ok && !data?.token_ok) {
        toast.error("Server svarer, men nøkkelen ble avvist. Sjekk at nøkkelen er korrekt og ikke utløpt.", { duration: 10000 });
      } else if (data?.error) {
        toast.error(`FlightHub 2 feil: ${data.error}`, { duration: 10000 });
      } else {
        toast.error("Kunne ikke nå FlightHub 2-serveren.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Tilkobling feilet");
    } finally {
      setTestingFh2(false);
    }
  };

  const handleToggleApplyFh2ToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyFh2ToChildren(checked);
    setSavingSettings(true);
    try {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ propagate_fh2_credentials: checked })
        .eq("id", companyId);
      if (error) throw error;
      toast.success(checked
        ? "FlightHub 2-tilkobling gjelder nå for alle underavdelinger"
        : "Underavdelinger kan nå bruke egen FlightHub 2-tilkobling"
      );
    } catch (err: any) {
      setApplyFh2ToChildren(!checked);
      toast.error(err?.message || "Kunne ikke lagre FlightHub 2-innstilling");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleApplySettingsToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplySettingsToChildren(checked);
    setSavingSettings(true);
    // Persist propagation flags on this company so child departments know which fields are locked
    await (supabase as any)
      .from("companies")
      .update({
        propagate_airspace_warnings: checked,
        propagate_hide_reporter: checked,
        propagate_mission_approval: checked,
        propagate_prevent_self_approval: checked,
        propagate_all_users_can_acknowledge_maintenance: checked,
        propagate_sora_required: checked,
        propagate_deviation_report: checked,
      })
      .eq("id", companyId);
    if (checked) {
      await supabase
        .from("companies")
        .update({ show_all_airspace_warnings: showAllAirspaceWarnings, hide_reporter_identity: hideReporterIdentity, require_mission_approval: requireMissionApproval, prevent_self_approval: preventSelfApproval, all_users_can_acknowledge_maintenance: allUsersCanAcknowledgeMaintenance, require_sora_on_missions: requireSoraOnMissions, require_sora_steps: requireSoraSteps, deviation_report_enabled: deviationReportEnabled } as any)
        .eq("parent_company_id", companyId);
      toast.success("Selskapsinnstillinger anvendt på alle avdelinger og låst");
    } else {
      toast.success("Avdelinger kan nå overstyre innstillingene selv");
    }
    setSavingSettings(false);
    invalidateCompanySettingsCache();
  };

  const handleToggleApplyRolesToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyRolesToChildren(checked);
    setSavingSettings(true);
    await (supabase as any)
      .from("companies")
      .update({ propagate_mission_roles: checked })
      .eq("id", companyId);
    if (checked) {
      const { data: childCompanies } = await supabase
        .from("companies")
        .select("id")
        .eq("parent_company_id", companyId);
      if (childCompanies && childCompanies.length > 0) {
        for (const child of childCompanies) {
          const { data: existingRoles } = await (supabase as any)
            .from("company_mission_roles")
            .select("name")
            .eq("company_id", child.id);
          const existingNames = new Set((existingRoles || []).map((r: any) => r.name));
          const rolesToInsert = missionRoles
            .filter(r => !existingNames.has(r.name))
            .map(r => ({ company_id: child.id, name: r.name }));
          if (rolesToInsert.length > 0) {
            await (supabase as any).from("company_mission_roles").insert(rolesToInsert);
          }
        }
      }
      toast.success("Roller anvendt på alle avdelinger og låst");
    } else {
      toast.success("Avdelinger kan nå redigere roller selv");
    }
    setSavingSettings(false);
  };

  const handleToggleApplyAlertsToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplyAlertsToChildren(checked);
    setSavingSettings(true);
    await (supabase as any)
      .from("companies")
      .update({ propagate_flight_alerts: checked })
      .eq("id", companyId);
    if (checked) {
      const { data: childCompanies } = await supabase
        .from("companies")
        .select("id")
        .eq("parent_company_id", companyId);
      if (childCompanies && childCompanies.length > 0) {
        for (const child of childCompanies) {
          for (const alertType of ALERT_TYPES) {
            const current = flightAlerts[alertType.key];
            if (current) {
              await (supabase as any).from("company_flight_alerts").upsert({
                company_id: child.id,
                alert_type: alertType.key,
                enabled: current.enabled,
                threshold_value: current.threshold_value,
              }, { onConflict: 'company_id,alert_type' });
            }
          }
          await (supabase as any).from("company_flight_alert_recipients").delete().eq("company_id", child.id);
          if (alertRecipients.length > 0) {
            const recipientInserts = alertRecipients.map(r => ({
              company_id: child.id,
              profile_id: r.profile_id,
            }));
            await (supabase as any).from("company_flight_alert_recipients").insert(recipientInserts);
          }
        }
      }
      toast.success("Flylogg-varsler anvendt på alle avdelinger og låst");
    } else {
      toast.success("Avdelinger kan nå redigere varsler selv");
    }
    setSavingSettings(false);
  };

  // Toggle for SORA-defaults (buffer mode + flight geography + altitude)
  const handleToggleApplySoraDefaultsToChildren = async (checked: boolean) => {
    if (!companyId) return;
    setApplySoraDefaultsToChildren(checked);
    setSavingSettings(true);
    await (supabase as any)
      .from("companies")
      .update({ propagate_sora_buffer_mode: checked })
      .eq("id", companyId);
    if (checked) {
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
              default_buffer_mode: defaultBufferMode,
              default_flight_geography_m: defaultFlightGeographyM,
              default_flight_altitude_m: defaultFlightAltitudeM,
            }, { onConflict: 'company_id' });
        }
      }
      toast.success("SORA-standardverdier anvendt og låst");
    } else {
      toast.success("Avdelinger kan nå redigere SORA-standardverdier");
    }
    setSavingSettings(false);
    invalidateCompanySettingsCache();
  };

  const handleAdd = () => {
    setSelectedCompany(null);
    setDialogOpen(true);
  };

  const handleEdit = (company: ChildCompany) => {
    setSelectedCompany(company);
    setDialogOpen(true);
  };

  const handleDeleteClick = (company: ChildCompany) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;
    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyToDelete.id);

      if (error) throw error;
      toast.success("Avdeling slettet");
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
      fetchChildren();
    } catch (error: any) {
      console.error("Error deleting child company:", error);
      toast.error("Kunne ikke slette avdeling: " + error.message);
    }
  };

  // Build the company object passed to dialog, with parent_company_id pre-set
  const dialogCompany = selectedCompany || undefined;
  const preventSelfApprovalLocked = isChildDept && !!inherited?.propagate_prevent_self_approval;
  const preventSelfApprovalValue = preventSelfApprovalLocked ? inherited!.prevent_self_approval : preventSelfApproval;
  const allUsersCanAcknowledgeMaintenanceLocked = isChildDept && !!inherited?.propagate_all_users_can_acknowledge_maintenance;
  const allUsersCanAcknowledgeMaintenanceValue = allUsersCanAcknowledgeMaintenanceLocked
    ? inherited!.all_users_can_acknowledge_maintenance
    : allUsersCanAcknowledgeMaintenance;

  return (
    <div className="space-y-4">
      <Collapsible defaultOpen>
        <GlassCard>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Selskapsinnstillinger — {parentCompanyName}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Innstillinger som gjelder for ditt selskap
                </p>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              {isChildDept && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <div className="font-medium text-foreground">Du ser innstillinger for {parentCompanyName}</div>
                    <div className="text-muted-foreground mt-0.5">
                      Felt merket med <Lock className="w-3 h-3 inline align-text-bottom" /> «Arvet fra {parentNavn}» styres av morselskapet og kan ikke endres her. Andre felt kan du overstyre selv.
                    </div>
                  </div>
                </div>
              )}

              {/* Vis alle luftromsadvarsler */}
              {(() => {
                const locked = isChildDept && !!inherited?.propagate_airspace_warnings;
                const value = locked ? inherited!.show_all_airspace_warnings : showAllAirspaceWarnings;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                    <Label htmlFor="show-all-airspace" className="flex-1 cursor-pointer pr-4">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        Vis alle luftromsadvarsler på oppdragskortene
                        {locked && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Når aktivert vises alle advarsler direkte i stedet for kun den viktigste med resten i en ekspanderbar liste
                      </div>
                    </Label>
                    <Switch
                      id="show-all-airspace"
                      checked={value}
                      onCheckedChange={handleToggleAirspaceWarnings}
                      disabled={savingSettings || locked}
                    />
                  </div>
                );
              })()}

              {/* Skjul rapportør */}
              {(() => {
                const locked = isChildDept && !!inherited?.propagate_hide_reporter;
                const value = locked ? inherited!.hide_reporter_identity : hideReporterIdentity;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                    <Label htmlFor="hide-reporter" className="flex-1 cursor-pointer pr-4">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        Skjul identitet til rapportør av hendelser
                        {locked && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Når aktivert vises ikke navnet på den som rapporterte hendelsen. Administratorer i moderselskapet kan fortsatt se rapportørens identitet.
                      </div>
                    </Label>
                    <Switch
                      id="hide-reporter"
                      checked={value}
                      onCheckedChange={handleToggleHideReporter}
                      disabled={savingSettings || locked}
                    />
                  </div>
                );
              })()}

              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="incident-reports-visible-all" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    Hendelsesrapporter synlig for alle selskaper
                    {isChildDept && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Lock className="w-2.5 h-2.5" /> Styres av {parentNavn}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert kan morselskapet og alle avdelinger se hendelsesrapporter fra hverandre.
                  </div>
                </Label>
                <Switch
                  id="incident-reports-visible-all"
                  checked={isChildDept ? !!inherited?.incident_reports_visible_to_all_companies : incidentReportsVisibleToAllCompanies}
                  onCheckedChange={handleToggleIncidentReportsVisibleToAllCompanies}
                  disabled={savingSettings || isChildDept}
                />
              </div>

              {/* Krev godkjenning */}
              {(() => {
                const locked = isChildDept && !!inherited?.propagate_mission_approval;
                const value = locked ? inherited!.require_mission_approval : requireMissionApproval;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                    <Label htmlFor="require-approval" className="flex-1 cursor-pointer pr-4">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        Oppdrag krever godkjenning
                        {locked && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        SORA-spesifikk godkjenningslogikk overstyrer dette valget
                      </div>
                    </Label>
                    <Switch
                      id="require-approval"
                      checked={value}
                      onCheckedChange={handleToggleRequireMissionApproval}
                      disabled={savingSettings || locked}
                    />
                  </div>
                );
              })()}

              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="prevent-self-approval" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    Kan ikke godkjenne egne oppdrag
                    {preventSelfApprovalLocked && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når oppdrag sendes til godkjenning kan flyger/personell på oppdraget ikke godkjenne det selv.
                  </div>
                </Label>
                <Switch
                  id="prevent-self-approval"
                  checked={preventSelfApprovalValue}
                  onCheckedChange={handleTogglePreventSelfApproval}
                  disabled={savingSettings || preventSelfApprovalLocked}
                />
              </div>

              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                <Label htmlFor="all-users-maintenance-ack" className="flex-1 cursor-pointer pr-4">
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    Alle brukere kan kvittere ut vedlikehold på ressurser
                    {allUsersCanAcknowledgeMaintenanceLocked && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Når aktivert kan alle brukere med tilgang til ressursen utføre vedlikehold/inspeksjon selv om teknisk ansvarlig er satt. Teknisk ansvarlig styrer fortsatt hvem i avdelingen som får vedlikeholdsvarsel.
                  </div>
                </Label>
                <Switch
                  id="all-users-maintenance-ack"
                  checked={allUsersCanAcknowledgeMaintenanceValue}
                  onCheckedChange={handleToggleAllUsersCanAcknowledgeMaintenance}
                  disabled={savingSettings || allUsersCanAcknowledgeMaintenanceLocked}
                />
              </div>

              {/* Krev SORA */}
              {(() => {
                const locked = isChildDept && !!inherited?.propagate_sora_required;
                const value = locked ? inherited!.require_sora_on_missions : requireSoraOnMissions;
                const stepsValue = locked ? inherited!.require_sora_steps : requireSoraSteps;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="require-sora" className="flex-1 cursor-pointer pr-4">
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          Krev SORA på alle oppdrag
                          {locked && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Alle oppdrag må ha gjennomført SORA-analyse for å kunne startes eller godkjennes. Gjelder ikke når SORA-basert godkjenning er aktivert.
                        </div>
                      </Label>
                      <Switch
                        id="require-sora"
                        checked={value}
                        onCheckedChange={handleToggleRequireSora}
                        disabled={savingSettings || soraApprovalEnabled || locked}
                      />
                    </div>
                    {value && (
                      <div className="pl-1 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Antall påkrevde steg:</p>
                        <RadioGroup
                          value={String(stepsValue)}
                          onValueChange={(v) => handleChangeSoraSteps(Number(v))}
                          className="flex gap-4"
                          disabled={locked}
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="1" id="sora-step-1" disabled={locked} />
                            <Label htmlFor="sora-step-1" className="text-xs cursor-pointer">1 steg (AI-vurdering)</Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="2" id="sora-step-2" disabled={locked} />
                            <Label htmlFor="sora-step-2" className="text-xs cursor-pointer">2 steg (+ revurdering)</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Settings propagation toggle — only for parent companies */}
              {!isChildDept && (
                <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                  <Label htmlFor="apply-settings-children" className="flex-1 cursor-pointer pr-4">
                    <div className="font-medium text-sm">Disse innstillingene gjelder for alle underavdelinger</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Når aktivert settes innstillingene over på alle avdelinger og avdelingene kan ikke overstyre dem
                    </div>
                  </Label>
                  <Switch
                    id="apply-settings-children"
                    checked={applySettingsToChildren}
                    onCheckedChange={handleToggleApplySettingsToChildren}
                    disabled={savingSettings}
                  />
                </div>
              )}

              {/* Avviksrapport */}
              {(() => {
                const locked = isChildDept && !!inherited?.propagate_deviation_report;
                const value = locked ? inherited!.deviation_report_enabled : deviationReportEnabled;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="deviation-report" className="flex-1 cursor-pointer pr-4">
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          Avviksrapport ved flytur
                          {locked && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {locked
                            ? "Avdelingen arver innstillinger og kategorier fra morselskapet og kan ikke endres her."
                            : "Når aktivert får piloten en pop-up etter avsluttet flytur med mulighet til å rapportere avvik via en hierarkisk valgliste."}
                        </div>
                      </Label>
                      <Switch
                        id="deviation-report"
                        checked={value}
                        onCheckedChange={handleToggleDeviationReport}
                        disabled={savingSettings || locked}
                      />
                    </div>
                    {value && companyId && !locked && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Kategorier (ubegrenset antall nivåer):
                        </p>
                        <DeviationCategoryTreeEditor companyId={companyId} />
                      </div>
                    )}
                    {value && locked && parentDeviationCompanyId && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Kategorier (arvet — kun lesetilgang):
                        </p>
                        <DeviationCategoryTreeEditor companyId={companyId} readOnly />
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const soraLocked = isChildDept && !!inherited?.propagate_sora_buffer_mode;
                const bufMode = soraLocked ? inherited!.default_buffer_mode : defaultBufferMode;
                const fgVal = soraLocked ? inherited!.default_flight_geography_m : defaultFlightGeographyM;
                const altVal = soraLocked ? inherited!.default_flight_altitude_m : defaultFlightAltitudeM;
                const ownPropagateSora = applySettingsToChildren; // fallback - not used; use separate state via fetch instead
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                    <Label className="flex-1">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        Standard SORA-buffersone
                        {soraLocked && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Velg standard buffermodus for nye oppdrag og ruteplanlegger
                      </div>
                    </Label>
                    <RadioGroup
                      value={bufMode}
                      onValueChange={(v) => handleChangeBufferMode(v as "corridor" | "convexHull")}
                      className="flex gap-4"
                      disabled={savingSettings || soraLocked}
                    >
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="corridor" id="buffer-corridor" disabled={soraLocked} />
                        <Label htmlFor="buffer-corridor" className="text-xs cursor-pointer">Rute-korridor</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="convexHull" id="buffer-convex" disabled={soraLocked} />
                        <Label htmlFor="buffer-convex" className="text-xs cursor-pointer">Konveks (convex hull)</Label>
                      </div>
                    </RadioGroup>
                    <div className="space-y-1.5 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Standard Flight Geography Area (m)</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="inline-flex">
                                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="max-w-[250px] text-xs p-2">
                              Avstanden legges på hver side av ruten. F.eks. 30m betyr 30m ut fra ruten på begge sider (totalt 60m bredde).
                            </PopoverContent>
                          </Popover>
                        </div>
                        <span className="text-xs font-mono text-green-600 dark:text-green-400">{fgVal}m</span>
                      </div>
                      <Slider
                        min={0}
                        max={200}
                        step={1}
                        value={[fgVal]}
                        onValueChange={([v]) => handleChangeDefaultFlightGeography(v)}
                        disabled={savingSettings || soraLocked}
                        className="[&_[role=slider]]:bg-green-600"
                      />
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Standard flyhøyde (m AGL)</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className="inline-flex">
                                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="max-w-[250px] text-xs p-2">
                              Planlagt flyhøyde over bakken (AGL). Bufferhøyden (contingency volume) kommer i tillegg oppå denne verdien.
                            </PopoverContent>
                          </Popover>
                        </div>
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{altVal}m</span>
                      </div>
                      <Slider
                        min={0}
                        max={120}
                        step={1}
                        value={[altVal]}
                        onValueChange={([v]) => handleChangeDefaultFlightAltitude(v)}
                        disabled={savingSettings || soraLocked}
                        className="[&_[role=slider]]:bg-blue-600"
                      />
                    </div>
                    {!isChildDept && (
                      <div className="border-t pt-2 flex items-center justify-between">
                        <Label htmlFor="apply-sora-defaults-children" className="flex-1 cursor-pointer pr-4">
                          <div className="font-medium text-sm">SORA-standardverdier gjelder for alle underavdelinger</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Når aktivert kopieres SORA-standardverdier til alle avdelinger og låses
                          </div>
                        </Label>
                        <Switch
                          id="apply-sora-defaults-children"
                          checked={applySoraDefaultsToChildren}
                          onCheckedChange={handleToggleApplySoraDefaultsToChildren}
                          disabled={savingSettings}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* SafeSky callsign */}
              {(() => {
                const callsignLocked = isChildDept && !!inherited?.safesky_callsign_propagate;
                const csPrefix = callsignLocked ? (inherited!.safesky_callsign_prefix ?? "") : callsignPrefix;
                const csVariable = callsignLocked ? inherited!.safesky_callsign_variable : callsignVariable;
                return (
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-sm">SafeSky callsign</div>
                        {callsignLocked && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Bestem hvilket callsign som publiseres til SafeSky for dette selskapets oppdrag.
                      </div>
                    </div>
                    {callsignLocked && (
                      <div className="rounded-md border border-primary/40 bg-primary/5 p-2 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs text-primary">Styres av morselskapet ({parentNavn})</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="callsign-prefix" className="text-xs text-muted-foreground">Callsign-prefix</Label>
                      <Input
                        id="callsign-prefix"
                        value={csPrefix}
                        onChange={(e) => { callsignEditing.current = true; setCallsignPrefix(e.target.value); }}
                        placeholder="f.eks. nordavind (tomt = bruk selskapsnavn)"
                        maxLength={50}
                        className="h-8 text-sm"
                        disabled={callsignLocked}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Variabel (suffiks)</Label>
                      <RadioGroup
                        value={csVariable}
                        onValueChange={(v) => { callsignEditing.current = true; setCallsignVariable(v as 'counter' | 'drone_registration'); }}
                        className="flex flex-col sm:flex-row gap-2"
                        disabled={callsignLocked}
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="counter" id="cs-counter" disabled={callsignLocked} />
                          <Label htmlFor="cs-counter" className="text-xs cursor-pointer">Teller (01, 02, …)</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="drone_registration" id="cs-drone" disabled={callsignLocked} />
                          <Label htmlFor="cs-drone" className="text-xs cursor-pointer">Drone-registreringsnummer</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Forhåndsvisning: <span className="font-mono text-foreground">
                        {((csPrefix.trim() || parentCompanyName || 'avisafe').toLowerCase().replace(/[^a-z0-9]/g, '') || 'avisafe')
                          + (csVariable === 'drone_registration' ? 'LNABCD' : '01')}
                      </span>
                    </div>
                    {!isChildDept && (
                      <div className="border-t pt-2 flex items-center justify-between">
                        <Label htmlFor="callsign-propagate" className="flex-1 cursor-pointer pr-4">
                          <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Propager prefix og variabel til alle avdelinger
                          </div>
                        </Label>
                        <Switch
                          id="callsign-propagate"
                          checked={callsignPropagate}
                          onCheckedChange={(c) => { callsignEditing.current = true; setCallsignPropagate(c); }}
                          disabled={savingCallsign}
                        />
                      </div>
                    )}
                    {!callsignLocked && (
                      <div className="flex justify-end">
                        <Button size="sm" onClick={handleSaveCallsign} disabled={savingCallsign}>
                          {savingCallsign ? "Lagrer…" : "Lagre callsign-innstillinger"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium text-sm">Roller</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">Roller kan tildeles personell ved planlegging av oppdrag</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {/* Locked banner for child departments */}
                {isChildDept && !!inherited?.propagate_mission_roles && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-primary/40 bg-primary/5">
                    <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs text-primary">Styres av morselskapet ({parentNavn})</span>
                  </div>
                )}
                {!(isChildDept && !!inherited?.propagate_mission_roles) && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ny rolle (f.eks. Ansvarlig pilot)"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                      className="h-8 text-sm"
                    />
                    <Button size="sm" onClick={handleAddRole} disabled={savingRole || !newRoleName.trim()} className="h-8">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Legg til
                    </Button>
                  </div>
                )}
                {(() => {
                  const rolesLocked = isChildDept && !!inherited?.propagate_mission_roles;
                  const displayRoles = rolesLocked ? (inherited?.mission_roles || []) : missionRoles;
                  return displayRoles.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {displayRoles.map((role) => (
                        <div key={role.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs">
                          <span>{role.name}</span>
                          {!rolesLocked && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(role.id)}
                              className="hover:bg-destructive/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
                {/* Roles propagation toggle - only for parent */}
                {!isChildDept && (
                  <div className="border-t pt-2 flex items-center justify-between">
                    <Label htmlFor="apply-roles-children" className="flex-1 cursor-pointer pr-4">
                      <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Når aktivert kopieres rollene til alle avdelinger i selskapet
                      </div>
                    </Label>
                    <Switch
                      id="apply-roles-children"
                      checked={applyRolesToChildren}
                      onCheckedChange={handleToggleApplyRolesToChildren}
                      disabled={savingSettings}
                    />
                  </div>
                )}
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium text-sm">Flylogg-varsler</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[220px]">Motta e-postvarsler når kritiske terskelverdier nås under flyging (DJI/ArduPilot)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {/* Locked banner for child departments */}
                {isChildDept && !!inherited?.propagate_flight_alerts && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-primary/40 bg-primary/5">
                    <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs text-primary">Styres av morselskapet ({parentNavn})</span>
                  </div>
                )}
                {(() => {
                  const alertsLocked = isChildDept && !!inherited?.propagate_flight_alerts;
                  const displayAlerts = alertsLocked ? inherited!.flight_alerts : flightAlerts;
                  const displayRecipients = alertsLocked ? inherited!.alert_recipients : alertRecipients;
                  return (
                    <>
                      <div className="space-y-2">
                        {ALERT_TYPES.map((alert) => {
                          const current = displayAlerts[alert.key];
                          const enabled = current?.enabled ?? false;
                          const thresholdValue = current?.threshold_value ?? alert.defaultValue;
                          return (
                            <div key={alert.key} className="flex items-center gap-2 flex-wrap">
                              <Switch
                                checked={enabled}
                                onCheckedChange={(checked) => handleToggleAlert(alert.key, checked)}
                                className="shrink-0"
                                disabled={alertsLocked}
                              />
                              <span className="text-sm min-w-0">{alert.label}</span>
                              {alert.hasThreshold && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={thresholdValue ?? ''}
                                    onChange={(e) => handleChangeThreshold(alert.key, parseFloat(e.target.value) || 0)}
                                    className="h-7 w-16 text-xs"
                                    step={alert.key === 'battery_cell_deviation' ? 0.1 : 1}
                                    disabled={!enabled || alertsLocked}
                                  />
                                  <span className="text-xs text-muted-foreground">{alert.unit}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t pt-2 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Mottakere av varsler:</p>
                        {!alertsLocked && (
                          <SearchablePersonSelect
                            persons={companyProfiles.filter(p => !alertRecipients.some(r => r.profile_id === p.id))}
                            value={null}
                            onValueChange={handleAddRecipient}
                            placeholder="Legg til mottaker..."
                            searchPlaceholder="Søk person..."
                            emptyText="Ingen tilgjengelige personer."
                          />
                        )}
                        {displayRecipients.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {displayRecipients.map((r) => (
                              <div key={r.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs">
                                <span>{r.full_name || 'Ukjent bruker'}</span>
                                {!alertsLocked && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRecipient(r.id)}
                                    className="hover:bg-destructive/20 rounded-full p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
                {/* Alerts propagation toggle - only for parent */}
                {!isChildDept && (
                  <div className="border-t pt-2 flex items-center justify-between">
                    <Label htmlFor="apply-alerts-children" className="flex-1 cursor-pointer pr-4">
                      <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Når aktivert kopieres varsler og mottakere til alle avdelinger
                      </div>
                    </Label>
                    <Switch
                      id="apply-alerts-children"
                      checked={applyAlertsToChildren}
                      onCheckedChange={handleToggleApplyAlertsToChildren}
                      disabled={savingSettings}
                    />
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>

      {/* FlightHub 2 Integration */}
      <Collapsible>
        <GlassCard>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  DJI FlightHub 2
                </h3>
                <p className="text-sm text-muted-foreground">
                  Send rutefiler og SORA-korridorer til DJI FlightHub 2
                </p>
              </div>
              <div className="flex items-center gap-2">
                {fh2Connected && (
                  <Badge variant="default" className="text-xs">
                    {fh2Inherited ? "Arvet tilkobling" : "Tilkoblet"}
                  </Badge>
                )}
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  Organisasjonsnøkkel (FlightHub Sync)
                  {fh2Locked && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Lock className="w-2.5 h-2.5" /> Arvet fra {parentNavn}
                    </Badge>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={fh2ShowToken ? "text" : "password"}
                    value={fh2Token}
                    onChange={(e) => setFh2Token(e.target.value)}
                    onFocus={() => { if (fh2Token === FH2_MASK) { fh2Editing.current = true; setFh2Token(""); } }}
                    placeholder={fh2Locked ? "Arves fra morselskapet" : "Lim inn FlightHub Sync-nøkkel..."}
                    className="h-8 text-sm font-mono"
                    disabled={fh2Locked}
                  />
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFh2ShowToken(!fh2ShowToken)} disabled={fh2Locked}>
                    {fh2ShowToken ? "Skjul" : "Vis"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Bruk nøkkelen fra FlightHub 2 → Organisasjonsinnstillinger → FlightHub Sync → Organisasjonsnøkkel.
                </p>
              </div>

              <div className="flex gap-2">
                {!fh2Locked && fh2Token && fh2Token !== FH2_MASK && (
                  <Button size="sm" onClick={handleSaveFh2} disabled={savingFh2} className="h-8">
                    {savingFh2 ? "Lagrer..." : "Lagre"}
                  </Button>
                )}
                {(fh2Token === FH2_MASK || fh2Locked) && (
                  <Button variant="outline" size="sm" onClick={handleTestFh2} disabled={testingFh2} className="h-8">
                    {testingFh2 ? "Tester..." : "Test tilkobling"}
                  </Button>
                )}
                {!fh2Locked && fh2Connected && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteFh2} disabled={savingFh2} className="h-8">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Slett
                  </Button>
                )}
              </div>

              {!isChildDept && departmentsEnabled && (
                <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3 flex items-center justify-between">
                  <Label htmlFor="apply-fh2-children" className="flex-1 cursor-pointer pr-4">
                    <div className="font-medium text-sm">Gjelder for alle underavdelinger</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Når aktivert arver underavdelinger FlightHub 2-nøkkelen fra morselskapet og kan ikke overstyre den.
                    </div>
                  </Label>
                  <Switch
                    id="apply-fh2-children"
                    checked={applyFh2ToChildren}
                    onCheckedChange={handleToggleApplyFh2ToChildren}
                    disabled={savingSettings}
                  />
                </div>
              )}

              {fh2Connected && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      ✅ {fh2Inherited
                        ? `Tilkoblet via morselskapet med ${fh2Projects.length} prosjekter`
                        : `Gratulerer! Du er tilkoblet din FH2-konto med ${fh2Projects.length} prosjekter`}
                    </p>
                    {fh2Projects.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {fh2Projects.map((name, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* FH2 Devices Section */}
                  <FH2DevicesSection fh2Projects={fh2Projects} />
                </div>
              )}
            </div>
          </CollapsibleContent>
        </GlassCard>
      </Collapsible>

      {departmentsEnabled && (
      <>
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Avdelinger
            </h3>
            <p className="text-sm text-muted-foreground">
              Opprett og administrer avdelinger tilknyttet ditt selskap
            </p>
          </div>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Ny avdeling
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Laster...</p>
        ) : children.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Ingen avdelinger opprettet ennå.
          </p>
        ) : isMobile ? (
          <div className="space-y-2">
            {children.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.navn}</span>
                  <Badge variant={c.aktiv ? "default" : "secondary"} className="text-xs">
                    {c.aktiv ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                {c.org_nummer && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" /> {c.org_nummer}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> Rediger
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteClick(c)}>
                    Slett
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Org.nr</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.navn}</TableCell>
                  <TableCell>{c.org_nummer || "–"}</TableCell>
                  <TableCell>{c.kontakt_epost || "–"}</TableCell>
                  <TableCell>{c.kontakt_telefon || "–"}</TableCell>
                  <TableCell>
                    <Badge variant={c.aktiv ? "default" : "secondary"}>
                      {c.aktiv ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                      <Pencil className="h-3 w-3 mr-1" /> Rediger
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(c)}>
                      Slett
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GlassCard>

      <CompanyManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={dialogCompany ? dialogCompany : null}
        onSuccess={fetchChildren}
        forceParentCompanyId={companyId || undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett avdeling</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette «{companyToDelete?.navn}»? Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}
    </div>
  );
};
