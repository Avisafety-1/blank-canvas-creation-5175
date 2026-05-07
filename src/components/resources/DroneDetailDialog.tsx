import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { format } from "date-fns";

import { Plane, Calendar, AlertTriangle, Trash2, Plus, X, Package, User, Weight, Wrench, Book, Radio, ChevronDown, FileText, ExternalLink, ShieldCheck } from "lucide-react";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AddEquipmentToDroneDialog } from "./AddEquipmentToDroneDialog";
import { AddPersonnelToDroneDialog } from "./AddPersonnelToDroneDialog";
import { DroneLogbookDialog } from "./DroneLogbookDialog";
import { ChecklistExecutionDialog } from "./ChecklistExecutionDialog";
import { AttachmentPickerDialog } from "@/components/admin/AttachmentPickerDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { useAuth } from "@/contexts/AuthContext";
import { useChecklists } from "@/hooks/useChecklists";
import { useDepartmentVisibility } from "@/hooks/useDepartmentVisibility";
import { checkDroneResourceVisibility, type MissingVisibility } from "@/lib/droneVisibilityCheck";
import { ResourceVisibilityWarningDialog } from "./ResourceVisibilityWarningDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { calculateMaintenanceStatus, getStatusColorClasses, calculateDroneAggregatedStatus, calculateDroneInspectionStatus, calculateUsageStatus, worstStatus, STATUS_PRIORITY } from "@/lib/maintenanceStatus";
import { Status } from "@/types";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";

interface Drone {
  id: string;
  company_id?: string;
  companies?: { navn?: string | null } | null;
  modell: string;
  serienummer: string;
  internal_serial: string | null;
  registration_number: string | null;
  status: string;
  flyvetimer: number;
  merknader: string | null;
  sist_inspeksjon: string | null;
  neste_inspeksjon: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
  kjøpsdato: string | null;
  klasse: string | null;
  vekt: number | null;
  payload: number | null;
  inspection_start_date: string | null;
  inspection_interval_days: number | null;
  inspection_interval_hours: number | null;
  inspection_interval_missions: number | null;
  hours_at_last_inspection: number;
  missions_at_last_inspection: number;
  varsel_dager: number | null;
  varsel_timer: number | null;
  varsel_oppdrag: number | null;
  sjekkliste_id: string | null;
  operations_checklist_ids: string[] | null;
  post_flight_checklist_id: string | null;
  technical_responsible_id: string | null;
}

interface Accessory {
  id: string;
  navn: string;
  vedlikeholdsintervall_dager: number | null;
  sist_vedlikehold: string | null;
  neste_vedlikehold: string | null;
  varsel_dager: number | null;
}

interface DroneDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drone: Drone | null;
  onDroneUpdated: () => void;
}

export const DroneDetailDialog = ({ open, onOpenChange, drone: initialDrone, onDroneUpdated }: DroneDetailDialogProps) => {
  const { user, companyId, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const terminology = useTerminology();
  const { checklists } = useChecklists();
  const deptVis = useDepartmentVisibility("drone", initialDrone?.id, companyId || undefined, open);
  const [drone, setDrone] = useState<Drone | null>(initialDrone);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedEquipment, setLinkedEquipment] = useState<any[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<any[]>([]);
  const [linkedDronetags, setLinkedDronetags] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [catalogModel, setCatalogModel] = useState<any>(null);
  const [droneModels, setDroneModels] = useState<{id: string; name: string; eu_class: string; weight_kg: number; payload_kg: number; comment: string | null}[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [addEquipmentDialogOpen, setAddEquipmentDialogOpen] = useState(false);
  const [addPersonnelDialogOpen, setAddPersonnelDialogOpen] = useState(false);
  const [logbookOpen, setLogbookOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [linkedDocuments, setLinkedDocuments] = useState<any[]>([]);
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false);
  const [confirmInspectionOpen, setConfirmInspectionOpen] = useState(false);
  const [showAddAccessory, setShowAddAccessory] = useState(false);
  const [newAccessory, setNewAccessory] = useState({
    navn: "",
    vedlikeholdsintervall_dager: "",
    sist_vedlikehold: "",
  });
  const [missionsSinceInspection, setMissionsSinceInspection] = useState(0);
  const [lastFlown, setLastFlown] = useState<string | null>(null);
  const [technicalResponsiblePersons, setTechnicalResponsiblePersons] = useState<{id: string; full_name: string | null}[]>([]);
  const [technicalResponsibleName, setTechnicalResponsibleName] = useState<string | null>(null);
  const [allUsersCanAcknowledgeMaintenance, setAllUsersCanAcknowledgeMaintenance] = useState(false);
  const [formTechnicalResponsibleId, setFormTechnicalResponsibleId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    modell: "",
    serienummer: "",
    internal_serial: "",
    registration_number: "",
    status: "Grønn",
    flyvetimer: 0,
    merknader: "",
    sist_inspeksjon: "",
    neste_inspeksjon: "",
    kjøpsdato: "",
    klasse: "",
    vekt: "",
    payload: "",
    inspection_start_date: "",
    inspection_interval_days: "",
    inspection_interval_hours: "",
    inspection_interval_missions: "",
    varsel_dager: "14",
    varsel_timer: "",
    varsel_oppdrag: "",
    sjekkliste_id: "",
    operations_checklist_ids: [] as string[],
    post_flight_checklist_id: "",
  });

  const [selectedChecklistId, setSelectedChecklistId] = useState<string>("");
  const [accessoryToMaintain, setAccessoryToMaintain] = useState<Accessory | null>(null);
  const [latestWarning, setLatestWarning] = useState<{ title: string; entry_date: string } | null>(null);
  const [visibilityWarning, setVisibilityWarning] = useState<{
    missing: MissingVisibility[];
    onContinue: () => void | Promise<void>;
    onCancel: () => void;
  } | null>(null);

  // Resolve the target department list for visibility checks
  const getTargetDeptIds = (): string[] => {
    if (!deptVis.hasDepartments) return [];
    return deptVis.allSelected
      ? deptVis.childDepartments.map((d) => d.id)
      : deptVis.selectedDeptIds;
  };

  // Get currently-saved visibility (from DB) for post-add checks
  const getCurrentDroneVisibilityDeptIds = async (): Promise<string[]> => {
    if (!drone) return [];
    const { data } = await (supabase as any)
      .from("drone_department_visibility")
      .select("company_id")
      .eq("drone_id", drone.id);
    return (data || []).map((r: any) => r.company_id);
  };

  // After adding a resource on an already-shared drone, check if visibility gap exists
  const checkVisibilityAfterAdd = async () => {
    if (!drone) return;
    const targetDepts = await getCurrentDroneVisibilityDeptIds();
    if (targetDepts.length === 0) return;
    const missing = await checkDroneResourceVisibility(drone.id, targetDepts, {
      droneCompanyId: drone.company_id,
      technicalResponsibleId: drone.technical_responsible_id,
    });
    if (missing.length === 0) return;
    setVisibilityWarning({
      missing,
      onContinue: () => {},
      onCancel: () => {},
    });
  };

  // Update local drone state when prop changes
  useEffect(() => {
    setDrone(initialDrone);
  }, [initialDrone]);

  // Real-time subscription for drone updates
  useEffect(() => {
    if (!drone?.id || !open) return;

    const channel = supabase
      .channel(`drone-detail-${drone.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drones',
          filter: `id=eq.${drone.id}`,
        },
        (payload) => {
          console.log('Drone updated via realtime:', payload.new);
          setDrone(payload.new as Drone);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [drone?.id, open]);

  useEffect(() => {
    if (drone) {
      setFormData({
        modell: drone.modell,
        serienummer: drone.serienummer,
        internal_serial: drone.internal_serial || "",
        registration_number: (drone as any).registration_number || "",
        status: drone.status,
        flyvetimer: drone.flyvetimer,
        merknader: drone.merknader || "",
        sist_inspeksjon: drone.sist_inspeksjon || "",
        neste_inspeksjon: drone.neste_inspeksjon ? new Date(drone.neste_inspeksjon).toISOString().split('T')[0] : "",
        kjøpsdato: drone.kjøpsdato ? new Date(drone.kjøpsdato).toISOString().split('T')[0] : "",
        klasse: drone.klasse || "",
        vekt: drone.vekt !== null ? String(drone.vekt) : "",
        payload: drone.payload !== null ? String(drone.payload) : "",
        inspection_start_date: drone.inspection_start_date ? new Date(drone.inspection_start_date).toISOString().split('T')[0] : "",
        inspection_interval_days: drone.inspection_interval_days !== null ? String(drone.inspection_interval_days) : "",
        inspection_interval_hours: drone.inspection_interval_hours !== null ? String(drone.inspection_interval_hours) : "",
        inspection_interval_missions: drone.inspection_interval_missions !== null ? String(drone.inspection_interval_missions) : "",
        varsel_dager: drone.varsel_dager !== null ? String(drone.varsel_dager) : "14",
        varsel_timer: drone.varsel_timer !== null ? String(drone.varsel_timer) : "",
        varsel_oppdrag: drone.varsel_oppdrag !== null ? String(drone.varsel_oppdrag) : "",
    sjekkliste_id: drone.sjekkliste_id || "",
    operations_checklist_ids: (drone as any).operations_checklist_ids || [],
    post_flight_checklist_id: (drone as any).post_flight_checklist_id || "",
  });
  setFormTechnicalResponsibleId(drone.technical_responsible_id || null);
      setSelectedChecklistId(drone.sjekkliste_id || "");
      setIsEditing(false);
      setShowAddAccessory(false);
      setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
      fetchLinkedEquipment();
      fetchLinkedPersonnel();
      fetchLinkedDronetags();
      fetchAccessories();
      fetchLinkedDocuments();
      fetchMissionsSinceInspection();
      fetchLatestWarning();
      fetchTechnicalResponsibleName();
      fetchMaintenanceAcknowledgementSetting();
      fetchLastFlown();
    }
  }, [drone]);

  // Fetch drone models catalog when editing
  useEffect(() => {
    if (!isEditing) return;
    const fetchDroneModels = async () => {
      const { data } = await supabase
        .from("drone_models")
        .select("id, name, eu_class, weight_kg, payload_kg, comment")
        .order("name");
      if (data) setDroneModels(data);
    };
    fetchDroneModels();
  }, [isEditing]);

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    if (modelId && modelId !== "manual") {
      const model = droneModels.find(m => m.id === modelId);
      if (model) {
        setFormData(prev => ({
          ...prev,
          modell: model.name,
          klasse: model.eu_class,
          vekt: model.weight_kg.toString(),
          payload: model.payload_kg.toString(),
          merknader: model.comment || prev.merknader,
        }));
      }
    }
  };

  // Fetch technical responsible persons for the dropdown — includes drone owner company
  // AND all departments the drone is shared with (drone_department_visibility)
  useEffect(() => {
    if (!companyId) return;
    const fetchTechPersons = async () => {
      const companyIds = new Set<string>([companyId]);
      if (drone?.company_id) companyIds.add(drone.company_id);
      if (drone?.id) {
        const { data: visRows } = await (supabase as any)
          .from("drone_department_visibility")
          .select("company_id")
          .eq("drone_id", drone.id);
        for (const r of visRows || []) companyIds.add(r.company_id);
      }
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name")
        .in("company_id", Array.from(companyIds))
        .eq("is_technical_responsible", true)
        .eq("approved", true);
      // Deduplicate by id
      const map = new Map<string, { id: string; full_name: string | null }>();
      for (const p of data || []) map.set(p.id, p);
      setTechnicalResponsiblePersons(Array.from(map.values()));
    };
    fetchTechPersons();
  }, [companyId, drone?.id, drone?.company_id]);

  const fetchTechnicalResponsibleName = async () => {
    if (!drone?.technical_responsible_id) { setTechnicalResponsibleName(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", drone.technical_responsible_id)
      .single();
    setTechnicalResponsibleName(data?.full_name || "Ukjent");
  };

  const fetchMaintenanceAcknowledgementSetting = async () => {
    const targetCompanyId = drone?.company_id || companyId;
    if (!targetCompanyId) { setAllUsersCanAcknowledgeMaintenance(false); return; }
    const { data } = await (supabase as any)
      .from("companies")
      .select("all_users_can_acknowledge_maintenance")
      .eq("id", targetCompanyId)
      .maybeSingle();
    setAllUsersCanAcknowledgeMaintenance((data as any)?.all_users_can_acknowledge_maintenance === true);
  };

  const fetchLatestWarning = async () => {
    if (!drone) { setLatestWarning(null); return; }
    const { data } = await supabase
      .from("drone_log_entries")
      .select("title, entry_date")
      .eq("drone_id", drone.id)
      .eq("entry_type", "Advarsel")
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestWarning(data || null);
  };

  const fetchLastFlown = async () => {
    if (!drone) { setLastFlown(null); return; }
    const { data } = await supabase
      .from("flight_logs")
      .select("flight_date")
      .eq("drone_id", drone.id)
      .order("flight_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastFlown(data?.flight_date || null);
  };

  // Fetch matching catalog model for extra specs
  useEffect(() => {
    if (!drone?.modell) { setCatalogModel(null); return; }
    const fetchCatalogModel = async () => {
      const { data } = await supabase
        .from("drone_models")
        .select("*")
        .ilike("name", drone.modell)
        .maybeSingle();
      setCatalogModel(data);
    };
    fetchCatalogModel();
  }, [drone?.modell]);

  const fetchMissionsSinceInspection = async () => {
    if (!drone) return;
    const { countUniqueMissionsSinceInspection } = await import("@/lib/droneInspection");
    const count = await countUniqueMissionsSinceInspection(drone.id, drone.sist_inspeksjon);
    setMissionsSinceInspection(count || 0);
  };

  // Calculate next inspection when start date, interval, or sist_inspeksjon changes
  useEffect(() => {
    if (formData.inspection_start_date && formData.inspection_interval_days) {
      const days = parseInt(formData.inspection_interval_days);
      if (!isNaN(days) && days > 0) {
        // Use sist_inspeksjon if it's after start date, otherwise use start date
        let baseDate = new Date(formData.inspection_start_date);
        if (formData.sist_inspeksjon) {
          const sistInspDate = new Date(formData.sist_inspeksjon);
          if (sistInspDate > baseDate) {
            baseDate = sistInspDate;
          }
        }
        const nextDate = new Date(baseDate);
        nextDate.setDate(nextDate.getDate() + days);
        const calculatedDate = nextDate.toISOString().split('T')[0];
        if (calculatedDate !== formData.neste_inspeksjon) {
          setFormData(prev => ({ ...prev, neste_inspeksjon: calculatedDate }));
        }
      }
    }
  }, [formData.inspection_start_date, formData.inspection_interval_days, formData.sist_inspeksjon]);

  const fetchLinkedEquipment = async () => {
    if (!drone) return;

    const { data, error } = await supabase
      .from("drone_equipment")
      .select(`
        id,
        equipment:equipment_id (
          id,
          navn,
          type,
          serienummer,
          status,
          neste_vedlikehold,
          varsel_dager,
          vekt
        )
      `)
      .eq("drone_id", drone.id);

    if (error) {
      console.error("Error fetching linked equipment:", error);
    } else {
      setLinkedEquipment(data || []);
    }
  };

  const fetchLinkedPersonnel = async () => {
    if (!drone) return;

    const { data, error } = await (supabase as any)
      .from("drone_personnel")
      .select(`
        id,
        profile:profile_id (
          id,
          full_name,
          email,
          tittel
        )
      `)
      .eq("drone_id", drone.id);

    if (error) {
      console.error("Error fetching linked personnel:", error);
    } else {
      setLinkedPersonnel(data || []);
    }
  };

  const fetchAccessories = async () => {
    if (!drone) return;

    const { data, error } = await supabase
      .from("drone_accessories")
      .select("*")
      .eq("drone_id", drone.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching accessories:", error);
    } else {
      setAccessories(data || []);
    }
  };

  const fetchLinkedDronetags = async () => {
    if (!drone) return;

    const { data, error } = await supabase
      .from("dronetag_devices")
      .select("id, name, device_id, callsign, description")
      .eq("drone_id", drone.id)
      .order("name");

    if (error) {
      console.error("Error fetching linked dronetags:", error);
    } else {
      setLinkedDronetags(data || []);
    }
  };

  const fetchLinkedDocuments = async () => {
    if (!drone) return;
    const { data, error } = await (supabase as any)
      .from("drone_documents")
      .select(`
        id,
        document:document_id (
          id,
          tittel,
          kategori,
          fil_url,
          fil_navn
        )
      `)
      .eq("drone_id", drone.id);
    if (error) {
      console.error("Error fetching linked documents:", error);
    } else {
      setLinkedDocuments(data || []);
    }
  };

  const handleAddDocuments = async (documents: any[]) => {
    if (!drone || !companyId) return;
    const existingIds = linkedDocuments.map((ld: any) => ld.document?.id);
    const newDocs = documents.filter(d => !existingIds.includes(d.id));
    if (newDocs.length === 0) return;
    const rows = newDocs.map(d => ({
      drone_id: drone.id,
      document_id: d.id,
      company_id: companyId,
    }));
    const { error } = await (supabase as any)
      .from("drone_documents")
      .insert(rows);
    if (error) {
      console.error("Error linking documents:", error);
      toast.error("Kunne ikke legge til dokumenter");
    } else {
      toast.success(`${newDocs.length} dokument(er) tilknyttet`);
      fetchLinkedDocuments();
      checkVisibilityAfterAdd();
    }
  };

  const handleRemoveDocument = async (linkId: string, docTitle: string) => {
    const { error } = await (supabase as any)
      .from("drone_documents")
      .delete()
      .eq("id", linkId);
    if (error) {
      console.error("Error removing document link:", error);
      toast.error("Kunne ikke fjerne dokument");
    } else {
      toast.success(`${docTitle} fjernet`);
      fetchLinkedDocuments();
    }
  };

  const handleOpenDocument = async (filUrl: string) => {
    if (!filUrl) return;
    // Open window immediately to preserve user gesture context (mobile popup blocker)
    const newWindow = window.open("about:blank", "_blank");
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(filUrl, 300);
    if (data?.signedUrl && newWindow) {
      newWindow.location.href = data.signedUrl;
    } else {
      newWindow?.close();
      toast.error("Kunne ikke åpne dokument");
    }
  };

  const logEquipmentHistory = async (action: 'added' | 'removed', itemType: 'equipment' | 'accessory' | 'dronetag', itemId: string | null, itemName: string) => {
    if (!user || !companyId || !drone) return;
    try {
      await supabase.from("drone_equipment_history").insert({
        drone_id: drone.id,
        company_id: companyId,
        user_id: user.id,
        action,
        item_type: itemType,
        item_id: itemId,
        item_name: itemName,
      });
    } catch (error) {
      console.error("Error logging equipment history:", error);
    }
  };

  const handleAddAccessory = async () => {
    if (!drone || !user || !companyId || !newAccessory.navn.trim()) {
      toast.error("Fyll inn navn på utstyret");
      return;
    }

    try {
      let neste_vedlikehold: string | null = null;
      if (newAccessory.vedlikeholdsintervall_dager && newAccessory.sist_vedlikehold) {
        const days = parseInt(newAccessory.vedlikeholdsintervall_dager);
        if (!isNaN(days) && days > 0) {
          const nextDate = new Date(newAccessory.sist_vedlikehold);
          nextDate.setDate(nextDate.getDate() + days);
          neste_vedlikehold = nextDate.toISOString().split('T')[0];
        }
      }

      const { data, error } = await supabase.from("drone_accessories").insert({
        drone_id: drone.id,
        company_id: companyId,
        user_id: user.id,
        navn: newAccessory.navn.trim(),
        vedlikeholdsintervall_dager: newAccessory.vedlikeholdsintervall_dager ? parseInt(newAccessory.vedlikeholdsintervall_dager) : null,
        sist_vedlikehold: newAccessory.sist_vedlikehold || null,
        neste_vedlikehold,
      }).select().single();

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('added', 'accessory', data?.id || null, newAccessory.navn.trim());

      toast.success("Utstyr lagt til");
      setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
      setShowAddAccessory(false);
      fetchAccessories();
    } catch (error: any) {
      console.error("Error adding accessory:", error);
      toast.error(`Kunne ikke legge til utstyr: ${error.message}`);
    }
  };

  const handleDeleteAccessory = async (accessory: Accessory) => {
    try {
      const { error } = await supabase
        .from("drone_accessories")
        .delete()
        .eq("id", accessory.id);

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('removed', 'accessory', accessory.id, accessory.navn);

      toast.success(`${accessory.navn} slettet`);
      fetchAccessories();
    } catch (error: any) {
      console.error("Error deleting accessory:", error);
      toast.error(`Kunne ikke slette utstyr: ${error.message}`);
    }
  };

  const handleAccessoryInspection = async (accessory: Accessory) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      let neste_vedlikehold: string | null = null;
      
      if (accessory.vedlikeholdsintervall_dager) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + accessory.vedlikeholdsintervall_dager);
        neste_vedlikehold = nextDate.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from("drone_accessories")
        .update({
          sist_vedlikehold: today,
          neste_vedlikehold,
        })
        .eq("id", accessory.id);

      if (error) throw error;

      toast.success(`Vedlikehold utført for ${accessory.navn}`);
      fetchAccessories();
    } catch (error: any) {
      console.error("Error updating accessory inspection:", error);
      toast.error(`Kunne ikke oppdatere vedlikehold: ${error.message}`);
    }
  };

  const getMaintenanceStatusColor = (neste_vedlikehold: string | null) => {
    if (!neste_vedlikehold) return "";
    const today = new Date();
    const nextDate = new Date(neste_vedlikehold);
    const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) return "text-red-600 dark:text-red-400";
    if (daysUntil <= 14) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
  };

  const handleRemovePersonnel = async (linkId: string, personName: string) => {
    try {
      const { error } = await (supabase as any)
        .from("drone_personnel")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast.success(`${personName} fjernet`);
      fetchLinkedPersonnel();
    } catch (error: any) {
      console.error("Error removing personnel:", error);
      toast.error(`Kunne ikke fjerne personell: ${error.message}`);
    }
  };

  const handleRemoveEquipment = async (linkId: string, equipmentName: string, equipmentId?: string) => {
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('removed', 'equipment', equipmentId || null, equipmentName);

      toast.success(`${equipmentName} fjernet`);
      fetchLinkedEquipment();
    } catch (error: any) {
      console.error("Error removing equipment:", error);
      toast.error(`Kunne ikke fjerne utstyr: ${error.message}`);
    }
  };

  const handleRemoveDronetag = async (dronetagId: string, dronetagName: string) => {
    try {
      const { error } = await supabase
        .from("dronetag_devices")
        .update({ drone_id: null })
        .eq("id", dronetagId);

      if (error) throw error;

      // Log to equipment history
      await logEquipmentHistory('removed', 'dronetag', dronetagId, dronetagName);

      toast.success(`${dronetagName} fjernet`);
      fetchLinkedDronetags();
    } catch (error: any) {
      console.error("Error removing dronetag:", error);
      toast.error(`Kunne ikke fjerne DroneTag: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!drone || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("drones")
        .update({
          modell: formData.modell,
          serienummer: formData.serienummer,
          internal_serial: formData.internal_serial || null,
          registration_number: formData.registration_number || null,
          status: formData.status,
          flyvetimer: formData.flyvetimer,
          merknader: formData.merknader || null,
          sist_inspeksjon: formData.sist_inspeksjon
            ? (formData.sist_inspeksjon.includes('T') ? formData.sist_inspeksjon : formData.sist_inspeksjon || null)
            : null,
          neste_inspeksjon: formData.neste_inspeksjon || null,
          kjøpsdato: formData.kjøpsdato || null,
          klasse: formData.klasse || null,
          vekt: formData.vekt ? parseFloat(formData.vekt) : null,
          payload: formData.payload ? parseFloat(formData.payload) : null,
          inspection_start_date: formData.inspection_start_date || null,
          inspection_interval_days: formData.inspection_interval_days ? parseInt(formData.inspection_interval_days) : null,
          inspection_interval_hours: formData.inspection_interval_hours ? parseFloat(formData.inspection_interval_hours) : null,
          inspection_interval_missions: formData.inspection_interval_missions ? parseInt(formData.inspection_interval_missions) : null,
          varsel_dager: formData.varsel_dager ? parseInt(formData.varsel_dager) : 14,
          varsel_timer: formData.varsel_timer ? parseFloat(formData.varsel_timer) : null,
          varsel_oppdrag: formData.varsel_oppdrag ? parseInt(formData.varsel_oppdrag) : null,
          sjekkliste_id: formData.sjekkliste_id && formData.sjekkliste_id !== "none" ? formData.sjekkliste_id : null,
          operations_checklist_ids: formData.operations_checklist_ids.length > 0 ? formData.operations_checklist_ids : null,
          post_flight_checklist_id: formData.post_flight_checklist_id && formData.post_flight_checklist_id !== "none" ? formData.post_flight_checklist_id : null,
          technical_responsible_id: formTechnicalResponsibleId || null,
        })
        .eq("id", drone.id);

      if (error) throw error;

      // Check resource visibility before persisting department-visibility changes
      const targetDepts = getTargetDeptIds();
      if (targetDepts.length > 0) {
        const missing = await checkDroneResourceVisibility(drone.id, targetDepts, {
          droneCompanyId: drone.company_id,
          technicalResponsibleId: formTechnicalResponsibleId,
        });
        if (missing.length > 0) {
          // Pause save and let user decide
          await new Promise<void>((resolve) => {
            setVisibilityWarning({
              missing,
              onContinue: async () => {
                await deptVis.saveVisibility();
                resolve();
              },
              onCancel: () => {
                // Skip visibility save but keep drone update
                resolve();
              },
            });
          });
        } else {
          await deptVis.saveVisibility();
        }
      } else {
        await deptVis.saveVisibility();
      }

      toast.success(`${terminology.vehicle} oppdatert`);
      setIsEditing(false);
      onDroneUpdated();
    } catch (error: any) {
      console.error("Error updating drone:", error);
      toast.error(`Kunne ikke oppdatere ${terminology.vehicleLower}: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!drone || !isAdmin) return;

    try {
      const { error } = await supabase
        .from("drones")
        .delete()
        .eq("id", drone.id);

      if (error) throw error;

      toast.success(`${terminology.vehicle} slettet`);
      onOpenChange(false);
      onDroneUpdated();
    } catch (error: any) {
      console.error("Error deleting drone:", error);
      toast.error(`Kunne ikke slette ${terminology.vehicleLower}: ${error.message}`);
    }
  };

  if (!drone) return null;

  // Calculate aggregated status based on drone + accessories + linked equipment
  const linkedEquipmentData = linkedEquipment.map((link: any) => link.equipment).filter(Boolean);
  const { status: maintenanceAggregated, affectedItems } = calculateDroneAggregatedStatus(
    {
      neste_inspeksjon: drone.neste_inspeksjon,
      varsel_dager: drone.varsel_dager,
      flyvetimer: drone.flyvetimer,
      hours_at_last_inspection: drone.hours_at_last_inspection ?? 0,
      inspection_interval_hours: drone.inspection_interval_hours,
      varsel_timer: drone.varsel_timer,
      missions_since_inspection: missionsSinceInspection,
      inspection_interval_missions: drone.inspection_interval_missions,
      varsel_oppdrag: drone.varsel_oppdrag,
    },
    accessories,
    linkedEquipmentData
  );
  const dbStatus = (drone.status as Status) || "Grønn";
  const aggregatedStatus = worstStatus(maintenanceAggregated, dbStatus);
  const droneOwnStatus = calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14);

  // Calculate payload status
  const totalEquipmentWeight = linkedEquipmentData.reduce((sum: number, eq: any) => sum + (eq?.vekt || 0), 0);
  const payloadStatus = drone.payload !== null && totalEquipmentWeight > 0
    ? totalEquipmentWeight > drone.payload
      ? "exceeded"
      : totalEquipmentWeight > drone.payload - 0.1
        ? "warning"
        : "ok"
    : "ok";

  const isSharedFromParent = !!drone.company_id && !!companyId && drone.company_id !== companyId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="truncate">{isEditing ? `Rediger ${terminology.vehicleLower}` : drone.modell}</span>
          </DialogTitle>
          {!isEditing && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLogbookOpen(true)}
              className="w-full mt-2"
            >
              <Book className="w-4 h-4 mr-2" />
              Loggbok
            </Button>
          )}
          {!isEditing && affectedItems.length > 0 && aggregatedStatus !== "Grønn" && (
            <p className="text-xs text-muted-foreground mt-1">
              ⚠️ Status påvirket av: {affectedItems.join(", ")}
            </p>
          )}
          {!isEditing && payloadStatus !== "ok" && drone.payload !== null && (
            <p className={`text-xs mt-1 ${payloadStatus === "exceeded" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
              {payloadStatus === "exceeded" 
                ? `⚠️ Payload overskredet! Utstyrsvekt: ${totalEquipmentWeight.toFixed(2)} kg / Payload: ${drone.payload} kg`
                : `⚠️ Nær payload-grense. Utstyrsvekt: ${totalEquipmentWeight.toFixed(2)} kg / Payload: ${drone.payload} kg`
              }
            </p>
          )}
          {isSharedFromParent && (
            <p className="text-xs text-muted-foreground mt-1 rounded-md bg-muted px-2 py-1.5">
              🔒 Denne {terminology.vehicleLower} er delt fra {drone.companies?.navn ? `mor-selskapet «${drone.companies.navn}»` : "mor-selskapet"} og kan kun redigeres derfra.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Modell</p>
                  <p className="text-sm sm:text-base">{drone.modell}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Serienummer</p>
                  <p className="text-sm sm:text-base">{drone.serienummer}</p>
                </div>
              </div>

              {drone.internal_serial && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Internt serienummer</p>
                  <p className="text-sm sm:text-base">{drone.internal_serial}</p>
                </div>
              )}

              {(drone as any).registration_number && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Registreringsnummer</p>
                  <p className="text-sm sm:text-base">{(drone as any).registration_number}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Klasse</p>
                  <p className="text-sm sm:text-base">{drone.klasse || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kjøpsdato</p>
                  <p className="text-sm sm:text-base">{drone.kjøpsdato ? new Date(drone.kjøpsdato).toLocaleDateString('nb-NO') : "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Vekt MTOM</p>
                  <p className="text-sm sm:text-base">{drone.vekt !== null ? `${drone.vekt} kg` : "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Payload</p>
                  <p className="text-sm sm:text-base">{drone.payload !== null ? `${drone.payload} kg` : "-"}</p>
                </div>
              </div>

              {catalogModel && (catalogModel.endurance_min || catalogModel.max_wind_mps || catalogModel.sensor_type || catalogModel.category || catalogModel.weight_without_payload_kg || catalogModel.standard_takeoff_weight_kg) && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  {catalogModel.weight_without_payload_kg != null && (
                    <div>
                      <span className="font-medium">Vekt uten payload:</span> {catalogModel.weight_without_payload_kg} kg
                    </div>
                  )}
                  {catalogModel.standard_takeoff_weight_kg != null && (
                    <div>
                      <span className="font-medium">Standard takeoff:</span> {catalogModel.standard_takeoff_weight_kg} kg
                    </div>
                  )}
                  {catalogModel.endurance_min != null && (
                    <div>
                      <span className="font-medium">Flygetid:</span> {catalogModel.endurance_min} min
                    </div>
                  )}
                  {catalogModel.max_wind_mps != null && (
                    <div>
                      <span className="font-medium">Maks vind:</span> {catalogModel.max_wind_mps} m/s
                    </div>
                  )}
                  {catalogModel.sensor_type && (
                    <div>
                      <span className="font-medium">Sensor:</span> {catalogModel.sensor_type}
                    </div>
                  )}
                  {catalogModel.category && (
                    <div>
                      <span className="font-medium">Kategori:</span> {catalogModel.category}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-sm sm:text-base">{Number(drone.flyvetimer).toFixed(2)} timer</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sist flydd</p>
                  <p className="text-sm sm:text-base">{lastFlown ? format(new Date(lastFlown), "dd.MM.yyyy") : "–"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${getStatusColorClasses(aggregatedStatus)} border`}>
                      {aggregatedStatus}
                    </Badge>
                  </div>
                  {/* Status explanation */}
                  {aggregatedStatus !== "Grønn" && (
                    <div className="mt-1.5 space-y-1">
                      {maintenanceAggregated !== "Grønn" && (
                        <p className="text-xs text-muted-foreground">
                          🔧 Vedlikehold {maintenanceAggregated === "Rød" ? "forfalt" : "nærmer seg"}
                        </p>
                      )}
                      {dbStatus !== "Grønn" && (
                        <p className="text-xs text-muted-foreground">
                          ⚠️ {latestWarning ? `Advarsel: ${latestWarning.title}` : "Advarsel fra flylogg"}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Show acknowledge button only when DB warning is actually driving the status */}
                  {dbStatus !== "Grønn" && STATUS_PRIORITY[dbStatus] > STATUS_PRIORITY[maintenanceAggregated] && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-6 px-2 mt-2">
                          Kvitter ut advarsel
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Kvitter ut advarsel</AlertDialogTitle>
                          <AlertDialogDescription>
                            {latestWarning
                              ? `Advarsel: «${latestWarning.title}» (${new Date(latestWarning.entry_date).toLocaleDateString('nb-NO')}). Vil du kvittere ut og sette status tilbake til Grønn?`
                              : "Er du sikker på at du vil kvittere ut advarselen og sette status tilbake til Grønn?"
                            }
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction onClick={async () => {
                            if (!user || !companyId) return;
                            const { error } = await supabase.from('drones').update({ status: 'Grønn' }).eq('id', drone.id);
                            if (error) {
                              toast.error(`Kunne ikke kvittere ut: ${error.message}`);
                              return;
                            }
                            await supabase.from('drone_log_entries').insert({
                              drone_id: drone.id,
                              company_id: companyId,
                              user_id: user.id,
                              entry_date: new Date().toISOString().split('T')[0],
                              entry_type: 'Kvittering',
                              title: 'Advarsel kvittert ut',
                              description: `Status endret fra ${drone.status} til Grønn${latestWarning ? ` (${latestWarning.title})` : ''}`,
                            });
                            queryClient.invalidateQueries({ queryKey: ['drones'] });
                            onDroneUpdated();
                            toast.success('Advarsel kvittert ut — status satt til Grønn');
                          }}>
                            Kvitter ut
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {/* If DB warning exists but maintenance is already worse or equal */}
                  {dbStatus !== "Grønn" && STATUS_PRIORITY[dbStatus] <= STATUS_PRIORITY[maintenanceAggregated] && (
                    <p className="text-xs text-muted-foreground mt-1.5 italic">
                      Advarsel fra flylogg kan kvitteres ut etter at vedlikehold er utført
                    </p>
                  )}
                </div>
              </div>

              {/* Technical responsible display */}
              {drone.technical_responsible_id && (
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Teknisk ansvarlig</p>
                    <p className="text-sm">{technicalResponsibleName || "Laster..."}</p>
                  </div>
                </div>
              )}

              {(drone.sist_inspeksjon || drone.neste_inspeksjon || drone.inspection_interval_days || drone.inspection_interval_hours || drone.inspection_interval_missions) && (
                <div className="border-t border-border pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Inspeksjon
                    </p>
                    {(() => {
                      const isTechRestricted = drone.technical_responsible_id && !allUsersCanAcknowledgeMaintenance && user?.id !== drone.technical_responsible_id;
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="w-full sm:w-auto">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto"
                                  disabled={!!isTechRestricted}
                                  onClick={() => {
                                    if (!user || !companyId) return;
                                    if (drone.sjekkliste_id) {
                                      setChecklistDialogOpen(true);
                                      return;
                                    }
                                    setConfirmInspectionOpen(true);
                                  }}
                                >
                                  <Wrench className="w-4 h-4 mr-1" />
                                  Utfør inspeksjon
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {isTechRestricted && (
                              <TooltipContent>
                                <p>Kun teknisk ansvarlig ({technicalResponsibleName}) kan utføre inspeksjon</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {drone.sist_inspeksjon && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Sist inspeksjon</p>
                          <p className="text-base">{new Date(drone.sist_inspeksjon).toLocaleDateString('nb-NO')} {new Date(drone.sist_inspeksjon).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    )}
                    {drone.neste_inspeksjon && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Neste inspeksjon</p>
                          <p className="text-base">{new Date(drone.neste_inspeksjon).toLocaleDateString('nb-NO')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {drone.inspection_interval_days && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Inspeksjonsintervall: {drone.inspection_interval_days} dager
                    </p>
                  )}

                  {/* Hours-based progress */}
                  {drone.inspection_interval_hours && (
                    <div className="mt-3">
                      {(() => {
                        const hoursSince = drone.flyvetimer - (drone.hours_at_last_inspection ?? 0);
                        const limit = drone.inspection_interval_hours;
                        const pct = Math.min((hoursSince / limit) * 100, 100);
                        const status = calculateUsageStatus(hoursSince, limit, drone.varsel_timer);
                        return (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Flytimer siden inspeksjon</span>
                              <span className={`font-medium ${getStatusColorClasses(status).split(' ').find(c => c.startsWith('text-')) || ''}`}>
                                {hoursSince.toFixed(1)} / {limit} t
                              </span>
                            </div>
                            <Progress value={pct} className={`h-2 ${status === 'Rød' ? '[&>div]:bg-destructive' : status === 'Gul' ? '[&>div]:bg-yellow-500' : ''}`} />
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Missions-based progress */}
                  {drone.inspection_interval_missions && (
                    <div className="mt-3">
                      {(() => {
                        const limit = drone.inspection_interval_missions;
                        const pct = Math.min((missionsSinceInspection / limit) * 100, 100);
                        const status = calculateUsageStatus(missionsSinceInspection, limit, drone.varsel_oppdrag);
                        return (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Oppdrag siden inspeksjon</span>
                              <span className={`font-medium ${getStatusColorClasses(status).split(' ').find(c => c.startsWith('text-')) || ''}`}>
                                {missionsSinceInspection} / {limit}
                              </span>
                            </div>
                            <Progress value={pct} className={`h-2 ${status === 'Rød' ? '[&>div]:bg-destructive' : status === 'Gul' ? '[&>div]:bg-yellow-500' : ''}`} />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {drone.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                      <p className="text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{drone.merknader}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Equipment Section */}
              <div className="border-t border-border pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttet utstyr</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddEquipmentDialogOpen(true)}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>
                
                {linkedEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen utstyr tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedEquipment.map((link: any) => {
                      const eq = link.equipment;
                      if (!eq) return null;
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{eq.navn}</p>
                              <Badge className={`${getStatusColorClasses(calculateMaintenanceStatus(eq.neste_vedlikehold, eq.varsel_dager ?? 14))} border text-xs`}>
                                {calculateMaintenanceStatus(eq.neste_vedlikehold, eq.varsel_dager ?? 14)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{eq.type} • SN: {eq.serienummer}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveEquipment(link.id, eq.navn, eq.id)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked DroneTag Section */}
              <div className="border-t border-border pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttet DroneTag</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddEquipmentDialogOpen(true)}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>
                
                {linkedDronetags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen DroneTag tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedDronetags.map((dt: any) => (
                      <div
                        key={dt.id}
                        className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">{dt.name || dt.device_id}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Device: {dt.device_id}
                            {dt.callsign && ` • Callsign: ${dt.callsign}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveDronetag(dt.id, dt.name || dt.device_id)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttet personell</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddPersonnelDialogOpen(true)}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>
                
                {linkedPersonnel.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen personell tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedPersonnel.map((link: any) => {
                      const person = link.profile;
                      if (!person) return null;
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{person.full_name || "Ukjent"}</p>
                            <p className="text-xs text-muted-foreground">
                              {person.tittel || person.email || ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemovePersonnel(link.id, person.full_name)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tilknyttede dokumenter Section */}
              <div className="border-t border-border pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Tilknyttede dokumenter</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDocumentPickerOpen(true)}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>

                {linkedDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen dokumenter tilknyttet
                  </p>
                ) : (
                  <div className="space-y-2 w-full max-w-full overflow-x-hidden">
                    {linkedDocuments.map((link: any) => {
                      const doc = link.document;
                      if (!doc) return null;
                      return (
                        <div
                          key={link.id}
                          className="w-full max-w-full min-w-0 flex items-start gap-2 p-2 bg-background/50 rounded border border-border overflow-hidden"
                        >
                          <div
                            className="flex-1 w-0 min-w-0 cursor-pointer overflow-hidden"
                            onClick={() => doc.fil_url && handleOpenDocument(doc.fil_url)}
                          >
                            <p className="text-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">{doc.tittel}</p>
                            <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                              {doc.kategori}{doc.fil_navn ? ` · ${doc.fil_navn}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc.fil_url && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenDocument(doc.fil_url)}
                                className="h-8 w-8 p-0"
                                title="Åpne dokument"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveDocument(link.id, doc.tittel)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Valgfritt utstyr Section */}
              <div className="border-t border-border pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Valgfritt utstyr</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowAddAccessory(true)}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Legg til
                  </Button>
                </div>

                {showAddAccessory && (
                  <div className="p-3 border border-border rounded-lg bg-background/50 mb-3 space-y-3">
                    <div>
                      <Label htmlFor="acc-navn" className="text-xs">Navn</Label>
                      <Input
                        id="acc-navn"
                        placeholder="f.eks. ND-filter, Ekstra propeller"
                        value={newAccessory.navn}
                        onChange={(e) => setNewAccessory({ ...newAccessory, navn: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <Label htmlFor="acc-interval" className="text-xs">Vedlikeholdsintervall (dager)</Label>
                        <Input
                          id="acc-interval"
                          type="number"
                          className="block w-full max-w-full min-w-0"
                          placeholder="f.eks. 90"
                          value={newAccessory.vedlikeholdsintervall_dager}
                          onChange={(e) => setNewAccessory({ ...newAccessory, vedlikeholdsintervall_dager: e.target.value })}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label htmlFor="acc-sist" className="text-xs">Sist vedlikehold</Label>
                        <Input
                          id="acc-sist"
                          type="date"
                          className="block w-full max-w-full min-w-0"
                          value={newAccessory.sist_vedlikehold}
                          onChange={(e) => setNewAccessory({ ...newAccessory, sist_vedlikehold: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setShowAddAccessory(false);
                        setNewAccessory({ navn: "", vedlikeholdsintervall_dager: "", sist_vedlikehold: "" });
                      }}>
                        Avbryt
                      </Button>
                      <Button size="sm" onClick={handleAddAccessory}>
                        Legg til
                      </Button>
                    </div>
                  </div>
                )}
                
                {accessories.length === 0 && !showAddAccessory ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen valgfritt utstyr lagt til
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accessories.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between p-2 bg-background/50 rounded border border-border"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{acc.navn}</p>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {acc.vedlikeholdsintervall_dager && (
                              <span>Intervall: {acc.vedlikeholdsintervall_dager} dager</span>
                            )}
                            {acc.neste_vedlikehold && (
                              <span className={getMaintenanceStatusColor(acc.neste_vedlikehold)}>
                                Neste: {new Date(acc.neste_vedlikehold).toLocaleDateString('nb-NO')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {acc.vedlikeholdsintervall_dager && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAccessoryToMaintain(acc)}
                              className="h-8 text-xs px-2"
                            >
                              <Wrench className="w-3 h-3 mr-1" />
                              Utfør
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteAccessory(acc)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
           ) : (
            <>
              {/* Drone catalog selector */}
              <div className="border-b pb-4 mb-4">
                <Label>Velg fra katalog (valgfritt)</Label>
                <Select value={selectedModelId} onValueChange={handleModelSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Velg dronemodell eller angi manuelt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Angi manuelt</SelectItem>
                    {droneModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} ({model.eu_class})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Velg en modell for å auto-fylle vekt, payload og klasse
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modell">Modell</Label>
                  <Input
                    id="modell"
                    value={formData.modell}
                    onChange={(e) => setFormData({ ...formData, modell: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="serienummer">Serienummer</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="internal_serial">Internt serienummer</Label>
                <Input
                  id="internal_serial"
                  value={formData.internal_serial}
                  onChange={(e) => setFormData({ ...formData, internal_serial: e.target.value })}
                  placeholder="Valgfritt"
                />
              </div>
              <div>
                <Label htmlFor="registration_number">Registreringsnummer</Label>
                <Input
                  id="registration_number"
                  value={formData.registration_number}
                  onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                  placeholder="Valgfritt"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="klasse">Klasse</Label>
                  <Select value={formData.klasse || ""} onValueChange={(value) => setFormData({ ...formData, klasse: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg klasse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="C0">C0</SelectItem>
                      <SelectItem value="C1">C1</SelectItem>
                      <SelectItem value="C2">C2</SelectItem>
                      <SelectItem value="C3">C3</SelectItem>
                      <SelectItem value="C4">C4</SelectItem>
                      <SelectItem value="C5">C5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="kjøpsdato">Kjøpsdato</Label>
                  <Input
                    id="kjøpsdato"
                    type="date"
                    value={formData.kjøpsdato}
                    onChange={(e) => setFormData({ ...formData, kjøpsdato: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vekt">Vekt MTOM (kg)</Label>
                  <Input
                    id="vekt"
                    type="number"
                    step="0.01"
                    value={formData.vekt}
                    onChange={(e) => setFormData({ ...formData, vekt: e.target.value })}
                    placeholder="f.eks. 0.9"
                  />
                </div>
                <div>
                  <Label htmlFor="payload">Payload (kg)</Label>
                  <Input
                    id="payload"
                    type="number"
                    step="0.01"
                    value={formData.payload}
                    onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                    placeholder="f.eks. 0.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="flyvetimer">Flyvetimer</Label>
                  <Input
                    id="flyvetimer"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.flyvetimer === 0 ? '' : formData.flyvetimer}
                    onChange={(e) => setFormData({ ...formData, flyvetimer: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Grønn">Grønn</SelectItem>
                      <SelectItem value="Gul">Gul</SelectItem>
                      <SelectItem value="Rød">Rød</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Collapsible inspection section */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex items-center gap-2 w-full border-t pt-4 mt-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <Calendar className="w-4 h-4" />
                    Inspeksjon og vedlikeholdsintervall
                    <ChevronDown className="w-4 h-4 ml-auto transition-transform [[data-state=open]>&]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sist_inspeksjon">Sist inspeksjon</Label>
                      <Input
                        id="sist_inspeksjon"
                        type="date"
                        value={formData.sist_inspeksjon}
                        onChange={(e) => setFormData({ ...formData, sist_inspeksjon: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="neste_inspeksjon">Neste inspeksjon</Label>
                      <Input
                        id="neste_inspeksjon"
                        type="date"
                        value={formData.neste_inspeksjon}
                        onChange={(e) => setFormData({ ...formData, neste_inspeksjon: e.target.value })}
                        disabled={!!formData.inspection_interval_days}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="inspection_start_date">Startdato</Label>
                      <Input 
                        id="inspection_start_date" 
                        type="date" 
                        value={formData.inspection_start_date}
                        onChange={(e) => setFormData({ ...formData, inspection_start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="inspection_interval_days">Intervall (dager)</Label>
                      <Input 
                        id="inspection_interval_days" 
                        type="number" 
                        placeholder="f.eks. 90"
                        value={formData.inspection_interval_days}
                        onChange={(e) => setFormData({ ...formData, inspection_interval_days: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="inspection_interval_hours">Flytimer mellom inspeksjoner</Label>
                      <Input 
                        id="inspection_interval_hours" 
                        type="number" 
                        step="0.1"
                        placeholder="f.eks. 50"
                        value={formData.inspection_interval_hours}
                        onChange={(e) => setFormData({ ...formData, inspection_interval_hours: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="inspection_interval_missions">Oppdrag mellom inspeksjoner</Label>
                      <Input 
                        id="inspection_interval_missions" 
                        type="number" 
                        placeholder="f.eks. 100"
                        value={formData.inspection_interval_missions}
                        onChange={(e) => setFormData({ ...formData, inspection_interval_missions: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="varsel_dager">Varsel dager før gul</Label>
                      <Input 
                        id="varsel_dager" 
                        type="number" 
                        placeholder="14"
                        value={formData.varsel_dager}
                        onChange={(e) => setFormData({ ...formData, varsel_dager: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="varsel_timer">Varsel timer før gul</Label>
                      <Input 
                        id="varsel_timer" 
                        type="number" 
                        step="0.1"
                        placeholder="f.eks. 10"
                        value={formData.varsel_timer}
                        onChange={(e) => setFormData({ ...formData, varsel_timer: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="varsel_oppdrag">Varsel oppdrag før gul</Label>
                      <Input 
                        id="varsel_oppdrag" 
                        type="number" 
                        placeholder="f.eks. 20"
                        value={formData.varsel_oppdrag}
                        onChange={(e) => setFormData({ ...formData, varsel_oppdrag: e.target.value })}
                      />
                    </div>
                  </div>
                  {formData.inspection_start_date && formData.inspection_interval_days && (
                    <p className="text-sm text-muted-foreground">
                      Neste inspeksjon beregnes automatisk basert på dagsintervall
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Status trigges av det som kommer først av dager, flytimer eller oppdrag
                  </p>
                </CollapsibleContent>
              </Collapsible>

              {/* Checklist selection in edit mode */}
               {isEditing && checklists.length > 0 && (
                <>
                  <div className="border-t pt-4">
                    <Label htmlFor="sjekkliste">Sjekkliste for inspeksjon</Label>
                    <Select value={formData.sjekkliste_id} onValueChange={(value) => setFormData({ ...formData, sjekkliste_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg sjekkliste (valgfritt)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen sjekkliste</SelectItem>
                        {checklists.map((checklist) => (
                          <SelectItem key={checklist.id} value={checklist.id}>
                            {checklist.tittel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hvis valgt, må sjekklisten fullføres før inspeksjon registreres
                    </p>
                  </div>
                  <div className="border-t pt-4">
                    <Label>Operasjonssjekklister</Label>
                    {isMobile ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="mt-1 flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal" disabled={!isEditing}>
                            <span className="min-w-0 flex-1 truncate text-left">
                              {(formData.operations_checklist_ids || []).length > 0
                                ? `${(formData.operations_checklist_ids || []).length} sjekkliste(r) valgt`
                                : "Velg sjekklister (valgfritt)"}
                            </span>
                            <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] max-w-md p-0 gap-0">
                          <DialogHeader className="px-4 py-3 border-b">
                            <DialogTitle className="text-base">Operasjonssjekklister</DialogTitle>
                          </DialogHeader>
                          <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-2 py-2" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>
                            {checklists.map((checklist) => (
                              <label key={checklist.id} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                                <Checkbox
                                  checked={(formData.operations_checklist_ids || []).includes(checklist.id)}
                                  onCheckedChange={(checked) => {
                                    const current = formData.operations_checklist_ids || [];
                                    if (checked) {
                                      setFormData({ ...formData, operations_checklist_ids: [...current, checklist.id] });
                                    } else {
                                      setFormData({ ...formData, operations_checklist_ids: current.filter((id: string) => id !== checklist.id) });
                                    }
                                  }}
                                />
                                <span className="min-w-0 flex-1 break-words">{checklist.tittel}</span>
                              </label>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="mt-1 flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal" disabled={!isEditing}>
                            <span className="min-w-0 flex-1 truncate text-left">
                              {(formData.operations_checklist_ids || []).length > 0
                                ? `${(formData.operations_checklist_ids || []).length} sjekkliste(r) valgt`
                                : "Velg sjekklister (valgfritt)"}
                            </span>
                            <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-2" align="start">
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {checklists.map((checklist) => (
                              <label key={checklist.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                                <Checkbox
                                  checked={(formData.operations_checklist_ids || []).includes(checklist.id)}
                                  onCheckedChange={(checked) => {
                                    const current = formData.operations_checklist_ids || [];
                                    if (checked) {
                                      setFormData({ ...formData, operations_checklist_ids: [...current, checklist.id] });
                                    } else {
                                      setFormData({ ...formData, operations_checklist_ids: current.filter((id: string) => id !== checklist.id) });
                                    }
                                  }}
                                />
                                {checklist.tittel}
                              </label>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Kobles automatisk til oppdrag når dronen legges til
                    </p>
                  </div>
                  <div className="border-t pt-4">
                    <Label htmlFor="post_flight_checklist">Post flight sjekkliste</Label>
                    <Select value={formData.post_flight_checklist_id} onValueChange={(value) => setFormData({ ...formData, post_flight_checklist_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg post flight sjekkliste (valgfritt)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen sjekkliste</SelectItem>
                        {checklists.map((checklist) => (
                          <SelectItem key={checklist.id} value={checklist.id}>
                            {checklist.tittel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vises som bekreftelsesdialog når oppdrag fullføres
                    </p>
                  </div>
                </>
              )}

              {/* Technical responsible dropdown in edit mode */}
              <div className="border-t pt-4">
                <Label>Teknisk ansvarlig</Label>
                <SearchablePersonSelect
                  persons={technicalResponsiblePersons}
                  value={formTechnicalResponsibleId}
                  onValueChange={setFormTechnicalResponsibleId}
                  placeholder="Velg teknisk ansvarlig..."
                  searchPlaceholder="Søk teknisk ansvarlig..."
                  emptyText="Ingen med rollen «Teknisk ansvarlig» funnet."
                  allowNone
                  noneLabel="Ingen"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Denne personen mottar vedlikeholdsvarsel. Kvittering kan begrenses til teknisk ansvarlig eller åpnes for alle via selskapsinnstillinger.
                </p>
              </div>

              <div>
                <Label htmlFor="merknader">Merknader</Label>
                <Textarea
                  id="merknader"
                  value={formData.merknader}
                  onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        {isEditing && isAdmin && deptVis.hasDepartments && (
          <div className="border-t border-border pt-3">
            <Label className="text-sm font-medium mb-2 block">Synlig for avdelinger</Label>
            <DepartmentChecklist
              departments={deptVis.childDepartments}
              selectedIds={deptVis.selectedDeptIds}
              onToggle={deptVis.handleToggle}
              allSelected={deptVis.allSelected}
              onToggleAll={deptVis.handleToggleAll}
              allLabel="Alle avdelinger"
            />
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {isAdmin && !isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Slett
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dette vil permanent slette dronen "{drone.modell}". Denne handlingen kan ikke angres.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Slett
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          
          <div className="flex gap-2 ml-auto">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} disabled={isSharedFromParent}>Rediger</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                  Avbryt
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                  {isSubmitting ? "Lagrer..." : "Lagre"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      <AttachmentPickerDialog
        open={documentPickerOpen}
        onOpenChange={setDocumentPickerOpen}
        selectedDocumentIds={linkedDocuments.map((ld: any) => ld.document?.id).filter(Boolean)}
        onSelect={handleAddDocuments}
        companyId={companyId || undefined}
      />

      <AddEquipmentToDroneDialog
        open={addEquipmentDialogOpen}
        onOpenChange={setAddEquipmentDialogOpen}
        droneId={drone?.id || ""}
        existingEquipmentIds={linkedEquipment.map((link) => link.equipment?.id).filter(Boolean)}
        existingDronetagIds={linkedDronetags.map((dt) => dt.id)}
        onEquipmentAdded={() => {
          fetchLinkedEquipment();
          fetchLinkedDronetags();
          checkVisibilityAfterAdd();
        }}
        dronePayload={drone?.payload ?? null}
        currentEquipmentWeight={linkedEquipment.reduce((sum, link) => sum + (link.equipment?.vekt || 0), 0)}
      />

      <AddPersonnelToDroneDialog
        open={addPersonnelDialogOpen}
        onOpenChange={setAddPersonnelDialogOpen}
        droneId={drone?.id || ""}
        droneCompanyId={companyId || ""}
        existingPersonnelIds={linkedPersonnel.map((link) => link.profile?.id).filter(Boolean)}
        onPersonnelAdded={() => {
          fetchLinkedPersonnel();
          checkVisibilityAfterAdd();
        }}
        onVisibilityChanged={() => {
          // Re-fetch department visibility state
          if (drone?.id && companyId) {
            deptVis.handleToggleAll(false);
            // Trigger re-fetch by toggling open state effect
            window.dispatchEvent(new CustomEvent('drone-visibility-changed', { detail: { droneId: drone.id } }));
          }
        }}
      />

      <DroneLogbookDialog
        open={logbookOpen}
        onOpenChange={setLogbookOpen}
        droneId={drone?.id || ""}
        droneModell={drone?.modell || ""}
        flyvetimer={drone?.flyvetimer || 0}
      />

      {drone?.sjekkliste_id && (
        <ChecklistExecutionDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          checklistId={drone.sjekkliste_id}
          itemName={`${drone.modell} (${drone.serienummer})`}
          onComplete={async () => {
            if (!user || !companyId) return;
            
            const { performDroneInspection } = await import("@/lib/droneInspection");
            await performDroneInspection({
              droneId: drone.id,
              companyId,
              userId: user.id,
              currentFlyvetimer: drone.flyvetimer,
              inspectionIntervalDays: drone.inspection_interval_days,
              inspectionType: 'Manuell inspeksjon',
              notes: 'Utført via sjekkliste fra dronekort',
            });
            
            toast.success('Inspeksjon fullført');
            setMissionsSinceInspection(0);
            queryClient.invalidateQueries({ queryKey: ['drones'] });
            onDroneUpdated();
          }}
        />
      )}

      {/* Accessory maintenance confirmation dialog */}
      <AlertDialog open={!!accessoryToMaintain} onOpenChange={(open) => !open && setAccessoryToMaintain(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft vedlikehold</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil markere vedlikehold som utført for "{accessoryToMaintain?.navn}"?
              {accessoryToMaintain?.vedlikeholdsintervall_dager && (
                <span className="block mt-2">
                  Neste vedlikehold vil bli satt til om {accessoryToMaintain.vedlikeholdsintervall_dager} dager.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (accessoryToMaintain) {
                  handleAccessoryInspection(accessoryToMaintain);
                  setAccessoryToMaintain(null);
                }
              }}
            >
              Bekreft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmInspectionOpen} onOpenChange={setConfirmInspectionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft inspeksjon</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil registrere inspeksjon for {drone.modell}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const { performDroneInspection } = await import("@/lib/droneInspection");
                  await performDroneInspection({
                    droneId: drone.id,
                    companyId: companyId!,
                    userId: user!.id,
                    currentFlyvetimer: drone.flyvetimer,
                    inspectionIntervalDays: drone.inspection_interval_days,
                    inspectionType: 'Manuell inspeksjon',
                    notes: 'Utført fra dronekort',
                  });
                  toast.success('Inspeksjon registrert');
                  setMissionsSinceInspection(0);
                  queryClient.invalidateQueries({ queryKey: ['drones'] });
                  onDroneUpdated();
                } catch (error: any) {
                  toast.error(`Kunne ikke registrere inspeksjon: ${error.message}`);
                }
              }}
            >
              Bekreft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {visibilityWarning && (
        <ResourceVisibilityWarningDialog
          open={!!visibilityWarning}
          onOpenChange={(o) => { if (!o) setVisibilityWarning(null); }}
          missing={visibilityWarning.missing}
          departments={deptVis.childDepartments}
          onContinue={async () => {
            await visibilityWarning.onContinue();
            setVisibilityWarning(null);
          }}
          onCancel={() => {
            visibilityWarning.onCancel();
            setVisibilityWarning(null);
          }}
        />
      )}
    </Dialog>
  );
};
