import { isBatteryType } from "@/config/equipmentCategories";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useChecklists } from "@/hooks/useChecklists";
import { useDepartmentVisibility } from "@/hooks/useDepartmentVisibility";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { Gauge, Calendar, AlertTriangle, Trash2, Wrench, Book, ClipboardList, ShieldCheck, ChevronDown, Battery, Heart, Zap, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EquipmentLogbookDialog } from "./EquipmentLogbookDialog";
import { ChecklistExecutionDialog } from "./ChecklistExecutionDialog";
import { useEquipmentTypes } from "@/hooks/useEquipmentTypes";
import { getStatusColorClasses, calculateUsageStatus, calculateEquipmentMaintenanceStatus, STATUS_PRIORITY } from "@/lib/maintenanceStatus";
import { Status } from "@/types";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  internal_serial: string | null;
  status: string;
  merknader: string | null;
  sist_vedlikeholdt: string | null;
  neste_vedlikehold: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
  flyvetimer?: number;
  varsel_dager?: number | null;
  vekt?: number | null;
  vedlikeholdsintervall_dager?: number | null;
  sjekkliste_id?: string | null;
  inspection_interval_hours?: number | null;
  inspection_interval_missions?: number | null;
  hours_at_last_maintenance?: number;
  missions_at_last_maintenance?: number;
  varsel_timer?: number | null;
  varsel_oppdrag?: number | null;
  battery_cycles?: number | null;
  battery_health_pct?: number | null;
  battery_full_capacity_mah?: number | null;
  battery_max_cell_deviation_v?: number | null;
}

interface EquipmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onEquipmentUpdated: () => void;
}

export const EquipmentDetailDialog = ({ open, onOpenChange, equipment: initialEquipment, onEquipmentUpdated }: EquipmentDetailDialogProps) => {
  const { user, companyId, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { checklists } = useChecklists();
  const deptVis = useDepartmentVisibility("equipment", initialEquipment?.id, companyId || undefined, open);
  const [equipment, setEquipment] = useState<Equipment | null>(initialEquipment);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLogbook, setShowLogbook] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = useState(false);
  const [customType, setCustomType] = useState("");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [latestWarning, setLatestWarning] = useState<{ title: string; entry_date: string } | null>(null);
  const [missionsSinceMaintenance, setMissionsSinceMaintenance] = useState(0);
  const equipmentTypes = useEquipmentTypes(companyId || "", open);
  const [formData, setFormData] = useState({
    navn: "",
    type: "",
    serienummer: "",
    internal_serial: "",
    merknader: "",
    sist_vedlikeholdt: "",
    neste_vedlikehold: "",
    flyvetimer: 0,
    varsel_dager: "14",
    vekt: "",
    vedlikeholdsintervall_dager: "",
    sjekkliste_id: "",
    inspection_interval_hours: "",
    inspection_interval_missions: "",
    varsel_timer: "",
    varsel_oppdrag: "",
  });

  // Update local equipment state when prop changes
  useEffect(() => {
    setEquipment(initialEquipment);
  }, [initialEquipment]);

  // Real-time subscription for equipment updates
  useEffect(() => {
    if (!equipment?.id || !open) return;

    const channel = supabase
      .channel(`equipment-detail-${equipment.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'equipment',
          filter: `id=eq.${equipment.id}`,
        },
        (payload) => {
          console.log('Equipment updated via realtime:', payload.new);
          setEquipment(payload.new as Equipment);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [equipment?.id, open]);

  useEffect(() => {
    if (equipment) {
      setFormData({
        navn: equipment.navn,
        type: equipment.type,
        serienummer: equipment.serienummer,
        internal_serial: equipment.internal_serial || "",
        merknader: equipment.merknader || "",
        sist_vedlikeholdt: equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toISOString().split('T')[0] : "",
        neste_vedlikehold: equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toISOString().split('T')[0] : "",
        flyvetimer: equipment.flyvetimer || 0,
        varsel_dager: equipment.varsel_dager !== null && equipment.varsel_dager !== undefined ? String(equipment.varsel_dager) : "14",
        vekt: equipment.vekt !== null && equipment.vekt !== undefined ? String(equipment.vekt) : "",
        vedlikeholdsintervall_dager: equipment.vedlikeholdsintervall_dager !== null && equipment.vedlikeholdsintervall_dager !== undefined ? String(equipment.vedlikeholdsintervall_dager) : "",
        sjekkliste_id: equipment.sjekkliste_id || "",
        inspection_interval_hours: equipment.inspection_interval_hours != null ? String(equipment.inspection_interval_hours) : "",
        inspection_interval_missions: equipment.inspection_interval_missions != null ? String(equipment.inspection_interval_missions) : "",
        varsel_timer: equipment.varsel_timer != null ? String(equipment.varsel_timer) : "",
        varsel_oppdrag: equipment.varsel_oppdrag != null ? String(equipment.varsel_oppdrag) : "",
      });
      setIsEditing(false);
      fetchLatestWarning();
      fetchMissionsSinceMaintenance();
    }
  }, [equipment]);

  const fetchLatestWarning = async () => {
    if (!equipment) { setLatestWarning(null); return; }
    const { data } = await supabase
      .from("equipment_log_entries")
      .select("title, entry_date")
      .eq("equipment_id", equipment.id)
      .eq("entry_type", "Advarsel")
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestWarning(data || null);
  };

  const fetchMissionsSinceMaintenance = async () => {
    if (!equipment) return;
    const { data } = await supabase
      .from("mission_equipment")
      .select("mission_id")
      .eq("equipment_id", equipment.id);
    if (!data) { setMissionsSinceMaintenance(0); return; }
    const totalMissions = new Set(data.map((r: any) => r.mission_id)).size;
    setMissionsSinceMaintenance(totalMissions - (equipment.missions_at_last_maintenance || 0));
  };

  // Calculate next maintenance when last maintenance or interval changes
  useEffect(() => {
    if (isEditing && formData.sist_vedlikeholdt && formData.vedlikeholdsintervall_dager) {
      const days = parseInt(formData.vedlikeholdsintervall_dager);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(formData.sist_vedlikeholdt);
        nextDate.setDate(nextDate.getDate() + days);
        const calculatedDate = nextDate.toISOString().split('T')[0];
        if (calculatedDate !== formData.neste_vedlikehold) {
          setFormData(prev => ({ ...prev, neste_vedlikehold: calculatedDate }));
        }
      }
    }
  }, [isEditing, formData.sist_vedlikeholdt, formData.vedlikeholdsintervall_dager]);

  /** Count unique missions for this equipment via mission_equipment */
  const countEquipmentMissions = async (): Promise<number> => {
    const { data } = await supabase
      .from("mission_equipment")
      .select("mission_id")
      .eq("equipment_id", equipment!.id);
    if (!data) return 0;
    return new Set(data.map((r: any) => r.mission_id)).size;
  };

  const performMaintenanceUpdate = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let neste_vedlikehold: string | null = null;
      
      if (equipment.vedlikeholdsintervall_dager) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + equipment.vedlikeholdsintervall_dager);
        neste_vedlikehold = nextDate.toISOString().split('T')[0];
      }

      // Count actual total missions for this equipment
      const totalMissions = await countEquipmentMissions();

      const { error } = await supabase
        .from("equipment")
        .update({
          sist_vedlikeholdt: today,
          neste_vedlikehold,
          hours_at_last_maintenance: equipment.flyvetimer || 0,
          missions_at_last_maintenance: totalMissions,
        })
        .eq("id", equipment.id);

      if (error) throw error;

      // Log maintenance to equipment_log_entries
      if (user && companyId) {
        await supabase.from("equipment_log_entries").insert({
          equipment_id: equipment.id,
          company_id: companyId,
          user_id: user.id,
          entry_date: today,
          entry_type: "vedlikehold",
          title: "Vedlikehold utført",
          description: "Utført via utstyrskort",
        });
      }

      toast.success(`Vedlikehold utført for ${equipment.navn}`);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error performing maintenance:", error);
      toast.error(`Kunne ikke oppdatere vedlikehold: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePerformMaintenance = async () => {
    if (!equipment || isSubmitting) return;
    
    // If equipment has a checklist, open checklist dialog first
    if (equipment.sjekkliste_id) {
      setChecklistDialogOpen(true);
      return;
    }
    
    // Otherwise show confirmation dialog
    setConfirmMaintenanceOpen(true);
  };

  const handleChecklistComplete = async () => {
    setChecklistDialogOpen(false);
    await performMaintenanceUpdate();
  };

  const handleSave = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("equipment")
        .update({
          navn: formData.navn,
          type: formData.type === "__other__" ? customType : formData.type,
          serienummer: formData.serienummer,
          internal_serial: formData.internal_serial || null,
          merknader: formData.merknader || null,
          sist_vedlikeholdt: formData.sist_vedlikeholdt || null,
          neste_vedlikehold: formData.neste_vedlikehold || null,
          flyvetimer: formData.flyvetimer,
          varsel_dager: formData.varsel_dager ? parseInt(formData.varsel_dager) : 14,
          vekt: formData.vekt ? parseFloat(formData.vekt) : null,
          vedlikeholdsintervall_dager: formData.vedlikeholdsintervall_dager ? parseInt(formData.vedlikeholdsintervall_dager) : null,
          sjekkliste_id: formData.sjekkliste_id || null,
          inspection_interval_hours: formData.inspection_interval_hours ? parseFloat(formData.inspection_interval_hours) : null,
          inspection_interval_missions: formData.inspection_interval_missions ? parseInt(formData.inspection_interval_missions) : null,
          varsel_timer: formData.varsel_timer ? parseFloat(formData.varsel_timer) : null,
          varsel_oppdrag: formData.varsel_oppdrag ? parseInt(formData.varsel_oppdrag) : null,
        })
        .eq("id", equipment.id);

      if (error) throw error;

      // Save department visibility
      await deptVis.saveVisibility();

      toast.success("Utstyr oppdatert");
      setIsEditing(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error updating equipment:", error);
      toast.error(`Kunne ikke oppdatere utstyr: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!equipment || !isAdmin) return;

    try {
      const { error } = await supabase
        .from("equipment")
        .delete()
        .eq("id", equipment.id);

      if (error) throw error;

      toast.success("Utstyr slettet");
      onOpenChange(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error deleting equipment:", error);
      toast.error(`Kunne ikke slette utstyr: ${error.message}`);
    }
  };

  // Get linked checklist name for display
  const linkedChecklist = equipment?.sjekkliste_id 
    ? checklists.find(c => c.id === equipment.sjekkliste_id) 
    : null;

  if (!equipment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="truncate">{isEditing ? "Rediger utstyr" : equipment.navn}</span>
          </DialogTitle>
          {!isEditing && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowLogbook(true)}
              className="w-full mt-2"
            >
              <Book className="w-4 h-4 mr-2" />
              Loggbok
            </Button>
          )}
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Navn</p>
                  <p className="text-sm sm:text-base">{equipment.navn}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Type</p>
                  <p className="text-sm sm:text-base">{equipment.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Serienummer</p>
                  <p className="text-sm sm:text-base">{equipment.serienummer}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Internt SN</p>
                  <p className="text-sm sm:text-base">{equipment.internal_serial || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vekt</p>
                  <p className="text-sm sm:text-base">{equipment.vekt ? `${equipment.vekt} kg` : "Ikke angitt"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Flyvetimer</p>
                  <p className="text-sm sm:text-base">{Number(equipment.flyvetimer || 0).toFixed(2)} timer</p>
                </div>
                {(() => {
                  const maintenanceOnlyStatus = calculateEquipmentMaintenanceStatus({
                    neste_vedlikehold: equipment.neste_vedlikehold,
                    varsel_dager: equipment.varsel_dager,
                    flyvetimer: equipment.flyvetimer || 0,
                    hours_at_last_maintenance: equipment.hours_at_last_maintenance || 0,
                    inspection_interval_hours: equipment.inspection_interval_hours,
                    varsel_timer: equipment.varsel_timer,
                    missions_since_maintenance: missionsSinceMaintenance,
                    inspection_interval_missions: equipment.inspection_interval_missions,
                    varsel_oppdrag: equipment.varsel_oppdrag,
                  });
                  const dbStatus = (equipment.status as Status) || "Grønn";
                  const aggregatedStatus = STATUS_PRIORITY[dbStatus] >= STATUS_PRIORITY[maintenanceOnlyStatus] ? dbStatus : maintenanceOnlyStatus;
                  const dbDriving = dbStatus !== "Grønn" && STATUS_PRIORITY[dbStatus] > STATUS_PRIORITY[maintenanceOnlyStatus];

                  return (
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Status</p>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${getStatusColorClasses(aggregatedStatus)} border`}>
                            {aggregatedStatus}
                          </Badge>
                        </div>
                        {aggregatedStatus !== "Grønn" && (
                          <div className="mt-1.5 space-y-1">
                            {maintenanceOnlyStatus !== "Grønn" && (
                              <p className="text-xs text-muted-foreground">
                                🔧 Vedlikehold {maintenanceOnlyStatus === "Rød" ? "forfalt" : "nærmer seg"}
                              </p>
                            )}
                            {dbStatus !== "Grønn" && (
                              <p className="text-xs text-muted-foreground">
                                ⚠️ {latestWarning ? `Advarsel: ${latestWarning.title}` : "Advarsel fra logg"}
                              </p>
                            )}
                          </div>
                        )}
                        {dbDriving && (
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
                                  const { error } = await supabase.from('equipment').update({ status: 'Grønn' }).eq('id', equipment.id);
                                  if (error) {
                                    toast.error(`Kunne ikke kvittere ut: ${error.message}`);
                                    return;
                                  }
                                  await supabase.from('equipment_log_entries').insert({
                                    equipment_id: equipment.id,
                                    company_id: companyId,
                                    user_id: user.id,
                                    entry_date: new Date().toISOString().split('T')[0],
                                    entry_type: 'Kvittering',
                                    title: 'Advarsel kvittert ut',
                                    description: `Status endret fra ${equipment.status} til Grønn${latestWarning ? ` (${latestWarning.title})` : ''}`,
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['equipment'] });
                                  onEquipmentUpdated();
                                  toast.success('Advarsel kvittert ut — status satt til Grønn');
                                }}>
                                  Kvitter ut
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {dbStatus !== "Grønn" && !dbDriving && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">
                            Advarsel fra logg kan kvitteres ut etter at vedlikehold er utført
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Battery info section — only for batteries with data */}
              {isBatteryType(equipment.type) && (equipment.battery_cycles != null || equipment.battery_health_pct != null || equipment.battery_full_capacity_mah != null || equipment.battery_max_cell_deviation_v != null) && (
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Battery className="w-4 h-4 text-primary" />
                    Batteristatus
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {equipment.battery_cycles != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sykluser</p>
                        <p className={`text-sm font-medium ${equipment.battery_cycles > 300 ? 'text-destructive' : equipment.battery_cycles > 200 ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
                          {equipment.battery_cycles}
                        </p>
                      </div>
                    )}
                    {equipment.battery_health_pct != null && (
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3" /> Helse</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${equipment.battery_health_pct < 60 ? 'text-destructive' : equipment.battery_health_pct < 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {equipment.battery_health_pct}%
                          </p>
                          <div className="flex-1 h-2 rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full transition-all ${equipment.battery_health_pct < 60 ? 'bg-destructive' : equipment.battery_health_pct < 80 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, equipment.battery_health_pct)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {equipment.battery_full_capacity_mah != null && (
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Kapasitet</p>
                        <p className="text-sm">{equipment.battery_full_capacity_mah} mAh</p>
                      </div>
                    )}
                    {equipment.battery_max_cell_deviation_v != null && (
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Maks celleavvik</p>
                        <p className={`text-sm font-medium ${equipment.battery_max_cell_deviation_v > 0.1 ? 'text-destructive' : ''}`}>
                          {equipment.battery_max_cell_deviation_v.toFixed(3)} V
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hours progress */}
              {equipment.inspection_interval_hours != null && equipment.inspection_interval_hours > 0 && (() => {
                const hoursSince = (equipment.flyvetimer || 0) - (equipment.hours_at_last_maintenance || 0);
                const pct = Math.min(100, (hoursSince / equipment.inspection_interval_hours) * 100);
                const status = calculateUsageStatus(hoursSince, equipment.inspection_interval_hours, equipment.varsel_timer);
                const barColor = status === "Rød" ? "bg-destructive" : status === "Gul" ? "bg-yellow-500" : "bg-primary";
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Timer siden vedlikehold: {hoursSince.toFixed(1)} / {equipment.inspection_interval_hours}</p>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Missions progress */}
              {equipment.inspection_interval_missions != null && equipment.inspection_interval_missions > 0 && (() => {
                const missionsSince = (equipment as any)._missionsSinceMaintenance || 0;
                const pct = Math.min(100, (missionsSince / equipment.inspection_interval_missions) * 100);
                const status = calculateUsageStatus(missionsSince, equipment.inspection_interval_missions, equipment.varsel_oppdrag);
                const barColor = status === "Rød" ? "bg-destructive" : status === "Gul" ? "bg-yellow-500" : "bg-primary";
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Oppdrag siden vedlikehold: {missionsSince} / {equipment.inspection_interval_missions}</p>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Maintenance details in collapsible */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                  <ChevronDown className="w-4 h-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  Vedlikeholdsdetaljer
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vedl.intervall (dager)</p>
                      <p className="text-sm sm:text-base">{equipment.vedlikeholdsintervall_dager ? `${equipment.vedlikeholdsintervall_dager} dager` : "Ikke angitt"}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vedl.intervall (timer)</p>
                      <p className="text-sm sm:text-base">{equipment.inspection_interval_hours ? `${equipment.inspection_interval_hours} timer` : "Ikke angitt"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Vedl.intervall (oppdrag)</p>
                      <p className="text-sm sm:text-base">{equipment.inspection_interval_missions ? `${equipment.inspection_interval_missions} oppdrag` : "Ikke angitt"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Varsel dager</p>
                      <p className="text-sm sm:text-base">{equipment.varsel_dager ?? 14} dager før gul</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Sjekkliste</p>
                      <p className="text-sm sm:text-base flex items-center gap-1">
                        {linkedChecklist ? (
                          <>
                            <ClipboardList className="w-3 h-3 text-primary" />
                            {linkedChecklist.tittel}
                          </>
                        ) : (
                          "Ingen"
                        )}
                      </p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="border-t border-border pt-3 sm:pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <p className="text-sm font-medium">Vedlikehold</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePerformMaintenance}
                    disabled={isSubmitting}
                    className="text-xs gap-1 w-full sm:w-auto"
                  >
                    <Wrench className="w-3 h-3" />
                    Utfør vedlikehold
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Sist vedl.</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toLocaleDateString('nb-NO') : "Ikke utført"}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">Neste vedl.</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toLocaleDateString('nb-NO') : "Ikke satt"}</p>
                  </div>
                </div>
              </div>

              {equipment.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                      <p className="text-xs sm:text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words">{equipment.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="navn" className="text-xs sm:text-sm">Navn</Label>
                  <Input
                    id="navn"
                    value={formData.navn}
                    onChange={(e) => setFormData({ ...formData, navn: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="type" className="text-xs sm:text-sm">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) => {
                      setFormData({ ...formData, type: val });
                      if (val !== "__other__") setCustomType("");
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Velg type" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipmentTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Annet...</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.type === "__other__" && (
                    <Input
                      className="mt-2 text-sm"
                      placeholder="Skriv inn ny type"
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="serienummer" className="text-xs sm:text-sm">Serienummer</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="internal_serial" className="text-xs sm:text-sm">Internt serienummer</Label>
                  <Input
                    id="internal_serial"
                    value={formData.internal_serial}
                    onChange={(e) => setFormData({ ...formData, internal_serial: e.target.value })}
                    className="text-sm"
                    placeholder="Valgfritt"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="vekt" className="text-xs sm:text-sm">Vekt (kg)</Label>
                  <Input
                    id="vekt"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.vekt}
                    onChange={(e) => setFormData({ ...formData, vekt: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="flyvetimer" className="text-xs sm:text-sm">Flyvetimer</Label>
                  <Input
                    id="flyvetimer"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.flyvetimer === 0 ? '' : formData.flyvetimer}
                    onChange={(e) => setFormData({ ...formData, flyvetimer: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Collapsible maintenance settings */}
              <Collapsible open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full border-t border-border pt-3">
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${maintenanceOpen ? 'rotate-180' : ''}`} />
                  <span className="text-sm font-medium">Vedlikeholdsintervall</span>
                </CollapsibleTrigger>
                <p className="text-xs text-muted-foreground mt-1 ml-6">Status trigges av det som kommer først av dager, timer eller oppdrag</p>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="vedlikeholdsintervall_dager" className="text-xs sm:text-sm">Intervall (dager)</Label>
                      <Input
                        id="vedlikeholdsintervall_dager"
                        type="number"
                        min="1"
                        placeholder="30"
                        value={formData.vedlikeholdsintervall_dager}
                        onChange={(e) => setFormData({ ...formData, vedlikeholdsintervall_dager: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="varsel_dager" className="text-xs sm:text-sm">Varsel dager før gul</Label>
                      <Input
                        id="varsel_dager"
                        type="number"
                        min="1"
                        placeholder="14"
                        value={formData.varsel_dager}
                        onChange={(e) => setFormData({ ...formData, varsel_dager: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="inspection_interval_hours" className="text-xs sm:text-sm">Intervall (timer)</Label>
                      <Input
                        id="inspection_interval_hours"
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="F.eks. 50"
                        value={formData.inspection_interval_hours}
                        onChange={(e) => setFormData({ ...formData, inspection_interval_hours: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="varsel_timer" className="text-xs sm:text-sm">Varsel timer før gul</Label>
                      <Input
                        id="varsel_timer"
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="F.eks. 5"
                        value={formData.varsel_timer}
                        onChange={(e) => setFormData({ ...formData, varsel_timer: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="inspection_interval_missions" className="text-xs sm:text-sm">Intervall (oppdrag)</Label>
                      <Input
                        id="inspection_interval_missions"
                        type="number"
                        min="1"
                        placeholder="F.eks. 100"
                        value={formData.inspection_interval_missions}
                        onChange={(e) => setFormData({ ...formData, inspection_interval_missions: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="varsel_oppdrag" className="text-xs sm:text-sm">Varsel oppdrag før gul</Label>
                      <Input
                        id="varsel_oppdrag"
                        type="number"
                        min="1"
                        placeholder="F.eks. 10"
                        value={formData.varsel_oppdrag}
                        onChange={(e) => setFormData({ ...formData, varsel_oppdrag: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="sist_vedlikeholdt" className="text-xs sm:text-sm">Sist vedlikeholdt</Label>
                      <Input
                        id="sist_vedlikeholdt"
                        type="date"
                        value={formData.sist_vedlikeholdt}
                        onChange={(e) => setFormData({ ...formData, sist_vedlikeholdt: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="neste_vedlikehold" className="text-xs sm:text-sm">Neste vedlikehold</Label>
                      <Input
                        id="neste_vedlikehold"
                        type="date"
                        value={formData.neste_vedlikehold}
                        onChange={(e) => setFormData({ ...formData, neste_vedlikehold: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs sm:text-sm">Sjekkliste for vedlikehold</Label>
                    <Select
                      value={formData.sjekkliste_id}
                      onValueChange={(value) => setFormData({ ...formData, sjekkliste_id: value === "none" ? "" : value })}
                    >
                      <SelectTrigger className="text-sm">
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
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div>
                <Label htmlFor="merknader" className="text-xs sm:text-sm">Merknader</Label>
                <Textarea
                  id="merknader"
                  value={formData.merknader}
                  onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
                  rows={3}
                  className="text-sm"
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
                    Dette vil permanent slette utstyret "{equipment.navn}". Denne handlingen kan ikke angres.
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
              <Button onClick={() => setIsEditing(true)}>Rediger</Button>
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

      <EquipmentLogbookDialog
        open={showLogbook}
        onOpenChange={setShowLogbook}
        equipmentId={equipment.id}
        equipmentNavn={equipment.navn}
        flyvetimer={equipment.flyvetimer || 0}
        equipmentType={equipment.type}
        equipmentSerienummer={equipment.serienummer}
      />

      {equipment.sjekkliste_id && (
        <ChecklistExecutionDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          checklistId={equipment.sjekkliste_id}
          itemName={`${equipment.navn} (${equipment.serienummer})`}
          onComplete={handleChecklistComplete}
        />
      )}
      <AlertDialog open={confirmMaintenanceOpen} onOpenChange={setConfirmMaintenanceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft vedlikehold</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil registrere vedlikehold for {equipment.navn}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await performMaintenanceUpdate();
              }}
            >
              Bekreft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
