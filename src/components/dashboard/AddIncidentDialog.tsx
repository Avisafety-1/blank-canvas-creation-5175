import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addToQueue } from "@/lib/offlineQueue";
import { ImagePlus, X, Check, ChevronsUpDown, ChevronDown, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useAuth } from "@/contexts/AuthContext";
import { usePlanGating } from "@/hooks/usePlanGating";
import type { Tables } from "@/integrations/supabase/types";

interface AddIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  incidentToEdit?: any | null;
  defaultMissionId?: string;
}

export const AddIncidentDialog = ({ open, onOpenChange, defaultDate, incidentToEdit, defaultMissionId }: AddIncidentDialogProps) => {
  const { companyId } = useAuth();
  const companySettings = useCompanySettings();
  const { canAccess } = usePlanGating();
  const globalAnonymous = companySettings.hide_reporter_identity;

  // Block opening if plan doesn't include incidents
  useEffect(() => {
    if (open && !canAccess('incidents')) {
      onOpenChange(false);
      toast.error('Hendelsesrapportering krever Grower-planen eller høyere.');
    }
  }, [open, canAccess, onOpenChange]);
  const [submitting, setSubmitting] = useState(false);
  const [missions, setMissions] = useState<Array<{ id: string; tittel: string; status: string; tidspunkt: string; lokasjon: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [causeTypes, setCauseTypes] = useState<Array<{ id: string; navn: string }>>([]);
  const [contributingCauses, setContributingCauses] = useState<Array<{ id: string; navn: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resource fields
  const [pilotId, setPilotId] = useState<string | null>(null);
  const [droneId, setDroneId] = useState<string | null>(null);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [reportAnonymously, setReportAnonymously] = useState(false);

  // Resource data
  const [companyProfiles, setCompanyProfiles] = useState<Array<{ id: string; full_name?: string | null }>>([]);
  const [companyDrones, setCompanyDrones] = useState<Array<{ id: string; modell: string; serienummer: string }>>([]);
  const [companyEquipment, setCompanyEquipment] = useState<Array<{ id: string; navn: string; type: string }>>([]);

  const [formData, setFormData] = useState({
    tittel: "",
    beskrivelse: "",
    hendelsestidspunkt: "",
    alvorlighetsgrad: "Middels",
    status: "Åpen",
    kategori: "",
    lokasjon: "",
    mission_id: "",
    oppfolgingsansvarlig_id: "",
    hovedaarsak: "",
    medvirkende_aarsak: "",
  });

  useEffect(() => {
    if (open) {
      fetchMissions();
      fetchUsers();
      fetchCauseTypes();
      fetchResourceData();
      
      // Hvis vi redigerer, forhåndsutfyll skjemaet
      if (incidentToEdit) {
        const dt = new Date(incidentToEdit.hendelsestidspunkt);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        const dateTimeStr = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        setFormData({
          tittel: incidentToEdit.tittel || "",
          beskrivelse: incidentToEdit.beskrivelse || "",
          hendelsestidspunkt: dateTimeStr,
          alvorlighetsgrad: incidentToEdit.alvorlighetsgrad || "Middels",
          status: incidentToEdit.status || "Åpen",
          kategori: incidentToEdit.kategori || "",
          lokasjon: incidentToEdit.lokasjon || "",
          mission_id: incidentToEdit.mission_id || "",
          oppfolgingsansvarlig_id: incidentToEdit.oppfolgingsansvarlig_id || "",
          hovedaarsak: incidentToEdit.hovedaarsak || "",
          medvirkende_aarsak: incidentToEdit.medvirkende_aarsak || "",
        });

        // Pre-fill resource fields from existing incident
        setPilotId(incidentToEdit.pilot_id || null);
        setDroneId(incidentToEdit.drone_id || null);
        setEquipmentIds((incidentToEdit.equipment_ids as string[]) || []);
        setReportAnonymously(!!incidentToEdit.reported_anonymously);
        if (incidentToEdit.pilot_id || incidentToEdit.drone_id || ((incidentToEdit.equipment_ids as string[])?.length > 0)) {
          setResourcesOpen(true);
        }
        
        // Show existing image if available
        if ((incidentToEdit as any).bilde_url) {
          setPreviewUrl((incidentToEdit as any).bilde_url);
        }
      } else {
        // Set defaults for new incident
        const updates: Partial<typeof formData> = {};
        if (defaultDate) {
          const year = defaultDate.getFullYear();
          const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
          const day = String(defaultDate.getDate()).padStart(2, '0');
          updates.hendelsestidspunkt = `${year}-${month}-${day}T09:00`;
        }
        if (defaultMissionId) {
          updates.mission_id = defaultMissionId;
        }
        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
        }
      }
    } else {
      // Reset form when dialog closes
      setFormData({
        tittel: "",
        beskrivelse: "",
        hendelsestidspunkt: "",
        alvorlighetsgrad: "Middels",
        status: "Åpen",
        kategori: "",
        lokasjon: "",
        mission_id: "",
        oppfolgingsansvarlig_id: "",
        hovedaarsak: "",
        medvirkende_aarsak: "",
      });
      setSelectedFile(null);
      setPreviewUrl(null);
      setPilotId(null);
      setDroneId(null);
      setEquipmentIds([]);
      setResourcesOpen(false);
      setReportAnonymously(false);
    }
  }, [open, defaultDate, incidentToEdit, defaultMissionId]);

  const fetchResourceData = async () => {
    if (!companyId) return;
    try {
      const [profilesRes, dronesRes, equipRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("company_id", companyId),
        supabase.from("drones").select("id, modell, serienummer").eq("company_id", companyId).eq("aktiv", true),
        supabase.from("equipment").select("id, navn, type").eq("company_id", companyId).eq("aktiv", true),
      ]);
      setCompanyProfiles(profilesRes.data || []);
      setCompanyDrones(dronesRes.data || []);
      setCompanyEquipment(equipRes.data || []);
    } catch (e) {
      console.error("Error fetching resource data:", e);
    }
  };

  const fetchMissions = async () => {
    try {
      const { data, error } = await supabase
        .from('missions')
        .select('id, tittel, status, tidspunkt, lokasjon')
        .order('tidspunkt', { ascending: false });

      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error('Error fetching missions:', error);
    }
  };

  const fetchUsers = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.rpc('get_incident_responsible_users', {
        target_company_id: companyId
      });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchCauseTypes = async () => {
    try {
      const { data: causes, error: causesError } = await supabase
        .from('incident_cause_types')
        .select('id, navn')
        .eq('aktiv', true)
        .order('rekkefolge');

      if (causesError) throw causesError;
      setCauseTypes(causes || []);

      const { data: contributing, error: contributingError } = await supabase
        .from('incident_contributing_causes')
        .select('id, navn')
        .eq('aktiv', true)
        .order('rekkefolge');

      if (contributingError) throw contributingError;
      setContributingCauses(contributing || []);
    } catch (error) {
      console.error('Error fetching cause types:', error);
    }
  };

  const handleMissionSelect = async (missionId: string) => {
    const selectedMission = missions.find(m => m.id === missionId);
    
    if (selectedMission) {
      const missionDate = new Date(selectedMission.tidspunkt);
      const year = missionDate.getFullYear();
      const month = String(missionDate.getMonth() + 1).padStart(2, '0');
      const day = String(missionDate.getDate()).padStart(2, '0');
      const hours = String(missionDate.getHours()).padStart(2, '0');
      const minutes = String(missionDate.getMinutes()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day}T${hours}:${minutes}`;
      
      setFormData(prev => ({
        ...prev,
        mission_id: missionId,
        hendelsestidspunkt: dateTimeStr,
        lokasjon: selectedMission.lokasjon,
      }));

      // Auto-fill resources from mission
      try {
        const [pRes, dRes, eRes] = await Promise.all([
          supabase.from("mission_personnel").select("profile_id").eq("mission_id", missionId),
          supabase.from("mission_drones").select("drone_id").eq("mission_id", missionId),
          supabase.from("mission_equipment").select("equipment_id").eq("mission_id", missionId),
        ]);

        if (pRes.data?.length) {
          setPilotId(pRes.data[0].profile_id);
        }
        if (dRes.data?.length) {
          setDroneId(dRes.data[0].drone_id);
        }
        if (eRes.data?.length) {
          setEquipmentIds(eRes.data.map(e => e.equipment_id));
        }

        if (pRes.data?.length || dRes.data?.length || eRes.data?.length) {
          setResourcesOpen(true);
        }
      } catch (e) {
        console.error("Error fetching mission resources:", e);
      }
    } else {
      setFormData(prev => ({ ...prev, mission_id: missionId }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createLogbookEntries = async (incidentTitle: string, incidentId?: string) => {
    if (!companyId) return;
    const { data: { user } } = await supabase.auth.getUser();

    const today = new Date().toISOString().split("T")[0];
    const description = incidentId ? `incident_id:${incidentId}` : undefined;

    if (droneId) {
      await supabase.from("drone_log_entries").insert({
        company_id: companyId,
        drone_id: droneId,
        entry_date: today,
        entry_type: "hendelse",
        title: `Hendelse: ${incidentTitle}`,
        description,
        user_id: user?.id || null,
      });
    }

    if (equipmentIds.length > 0) {
      const entries = equipmentIds.map(eqId => ({
        company_id: companyId,
        equipment_id: eqId,
        entry_date: today,
        entry_type: "hendelse",
        title: `Hendelse: ${incidentTitle}`,
        description,
        user_id: user?.id || null,
      }));
      await supabase.from("equipment_log_entries").insert(entries);
    }
  };

  const handleSubmit = async () => {
    if (!formData.tittel || !formData.hendelsestidspunkt) {
      toast.error("Vennligst fyll ut alle påkrevde felt");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !companyId) {
        toast.error("Du må være logget inn for å rapportere hendelser");
        setSubmitting(false);
        return;
      }

      // Upload image if selected
      let bilde_url: string | null = previewUrl && !selectedFile ? previewUrl : null;
      
      if (selectedFile) {
        const timestamp = Date.now();
        const filePath = `${companyId}/${timestamp}-${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('incident-images')
          .upload(filePath, selectedFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error("Kunne ikke laste opp bilde");
          setSubmitting(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from('incident-images')
          .getPublicUrl(filePath);

        bilde_url = publicUrlData.publicUrl;
      }

      // If user removed existing image
      if (!previewUrl && !selectedFile) {
        bilde_url = null;
      }

      const incidentData = {
        tittel: formData.tittel,
        beskrivelse: formData.beskrivelse || null,
        hendelsestidspunkt: new Date(formData.hendelsestidspunkt).toISOString(),
        alvorlighetsgrad: formData.alvorlighetsgrad,
        status: formData.status,
        kategori: formData.kategori || null,
        lokasjon: formData.lokasjon || null,
        mission_id: formData.mission_id || null,
        oppfolgingsansvarlig_id: formData.oppfolgingsansvarlig_id || null,
        hovedaarsak: formData.hovedaarsak || null,
        medvirkende_aarsak: formData.medvirkende_aarsak || null,
        oppdatert_dato: new Date().toISOString(),
        bilde_url,
        pilot_id: pilotId || null,
        drone_id: droneId || null,
        equipment_ids: equipmentIds.length > 0 ? equipmentIds : null,
        reported_anonymously: globalAnonymous || reportAnonymously,
      };

      // === OFFLINE PATH ===
      if (!navigator.onLine && !incidentToEdit) {
        addToQueue({
          table: 'incidents',
          operation: 'insert',
          data: {
            ...incidentData,
            company_id: companyId,
            user_id: user.id,
            rapportert_av: user.email || 'Ukjent',
          },
          description: `Hendelse: ${formData.tittel} (offline)`,
        });

        toast.success("Hendelse lagret lokalt – synkroniseres når nett er tilbake");
        onOpenChange(false);
        return;
      }

      // === ONLINE PATH ===
      if (incidentToEdit) {
        // UPDATE eksisterende hendelse
        const { error } = await supabase
          .from('incidents')
          .update(incidentData)
          .eq('id', incidentToEdit.id);

        if (error) throw error;

        // Create logbook entries on update too (if resources changed)
        await createLogbookEntries(formData.tittel, incidentToEdit.id);

        toast.success("Hendelse oppdatert!");
      } else {
        // Generer incident_number basert på dato
        const eventDate = new Date(formData.hendelsestidspunkt);
        const dateStr = `${eventDate.getFullYear()}${String(eventDate.getMonth() + 1).padStart(2, '0')}${String(eventDate.getDate()).padStart(2, '0')}`;
        
        // Finn antall hendelser med samme dato-prefiks
        const { count, error: countError } = await supabase
          .from('incidents')
          .select('id', { count: 'exact', head: true })
          .like('incident_number', `${dateStr}%`);
        
        if (countError) {
          console.error('Error counting incidents:', countError);
        }
        
        const nextNumber = String((count || 0) + 1).padStart(2, '0');
        const incidentNumber = `${dateStr}${nextNumber}`;

        // INSERT ny hendelse
        const { data: insertedIncident, error } = await supabase
          .from('incidents')
          .insert({
            ...incidentData,
            company_id: companyId,
            user_id: user.id,
            rapportert_av: user.email || 'Ukjent',
            incident_number: incidentNumber,
          })
          .select('id')
          .single();

        if (error) throw error;

        // Create logbook entries for linked resources
        await createLogbookEntries(formData.tittel, insertedIncident?.id);

        // Send email notification for new incident (kun ved ny hendelse)
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_new_incident',
              companyId: companyId,
              incident: {
                tittel: formData.tittel,
                beskrivelse: formData.beskrivelse,
                alvorlighetsgrad: formData.alvorlighetsgrad,
                lokasjon: formData.lokasjon
              },
              excludeUserIds: formData.oppfolgingsansvarlig_id ? [formData.oppfolgingsansvarlig_id] : []
            }
          });
        } catch (emailError) {
          console.error('Error sending new incident notification:', emailError);
        }

        // Send email notification to follow-up responsible (kun ved ny hendelse)
        if (formData.oppfolgingsansvarlig_id) {
          const recipientUser = users.find(u => u.id === formData.oppfolgingsansvarlig_id);
          
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_followup_assigned',
              companyId: companyId,
              followupAssigned: {
                recipientId: formData.oppfolgingsansvarlig_id,
                recipientName: recipientUser?.full_name || 'Bruker',
                incidentTitle: formData.tittel,
                incidentSeverity: formData.alvorlighetsgrad,
                incidentLocation: formData.lokasjon,
                incidentDescription: formData.beskrivelse
              }
            }
          });
        }

        toast.success("Hendelse rapportert!");
      }
      
      onOpenChange(false);
      
    } catch (error: any) {
      console.error('Submit error:', error);
      toast.error(`Feil ved lagring: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const isEditing = !!incidentToEdit;

  const toggleEquipment = (eqId: string) => {
    setEquipmentIds(prev =>
      prev.includes(eqId) ? prev.filter(id => id !== eqId) : [...prev, eqId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Rediger hendelse" : "Rapporter hendelse"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Oppdater informasjon om hendelsen" : "Fyll ut informasjon om hendelsen"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Knytt til oppdrag (valgfritt)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {formData.mission_id
                    ? missions.find(m => m.id === formData.mission_id)?.tittel || "Velg oppdrag..."
                    : "Velg oppdrag..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Søk i oppdrag..." />
                  <CommandList>
                    <CommandEmpty>Ingen oppdrag funnet.</CommandEmpty>
                    <CommandGroup>
                      {missions.map((mission) => (
                        <CommandItem
                          key={mission.id}
                          value={`${mission.tittel} ${mission.status}`}
                          onSelect={() => handleMissionSelect(mission.id)}
                        >
                          <Check className={cn("mr-2 h-4 w-4", formData.mission_id === mission.id ? "opacity-100" : "opacity-0")} />
                          {mission.tittel} ({mission.status})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tittel">Tittel *</Label>
            <Input
              id="tittel"
              value={formData.tittel}
              onChange={(e) => setFormData({ ...formData, tittel: e.target.value })}
              placeholder="Kort beskrivelse av hendelsen"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="beskrivelse">Beskrivelse</Label>
            <Textarea
              id="beskrivelse"
              value={formData.beskrivelse}
              onChange={(e) => setFormData({ ...formData, beskrivelse: e.target.value })}
              placeholder="Detaljert beskrivelse av hendelsen..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hendelsestidspunkt">Hendelsestidspunkt *</Label>
            <Input
              id="hendelsestidspunkt"
              type="datetime-local"
              value={formData.hendelsestidspunkt}
              onChange={(e) => setFormData({ ...formData, hendelsestidspunkt: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alvorlighetsgrad">Alvorlighetsgrad</Label>
            <Select
              value={formData.alvorlighetsgrad}
              onValueChange={(value) => setFormData({ ...formData, alvorlighetsgrad: value })}
            >
              <SelectTrigger id="alvorlighetsgrad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Lav">Lav</SelectItem>
                <SelectItem value="Middels">Middels</SelectItem>
                <SelectItem value="Høy">Høy</SelectItem>
                <SelectItem value="Kritisk">Kritisk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Åpen">Åpen</SelectItem>
                <SelectItem value="Under behandling">Under behandling</SelectItem>
                <SelectItem value="Ferdigbehandlet">Ferdigbehandlet</SelectItem>
                <SelectItem value="Lukket">Lukket</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kategori">Kategori (valgfritt)</Label>
            <Select
              value={formData.kategori}
              onValueChange={(value) => setFormData({ ...formData, kategori: value })}
            >
              <SelectTrigger id="kategori">
                <SelectValue placeholder="Velg kategori..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Luft">Luft</SelectItem>
                <SelectItem value="Bakke">Bakke</SelectItem>
                <SelectItem value="Luftrom">Luftrom</SelectItem>
                <SelectItem value="Teknisk">Teknisk</SelectItem>
                <SelectItem value="Operativ">Operativ</SelectItem>
                <SelectItem value="Miljø">Miljø</SelectItem>
                <SelectItem value="Sikkerhet">Sikkerhet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hovedaarsak">Hovedårsak (valgfritt)</Label>
            <Select
              value={formData.hovedaarsak}
              onValueChange={(value) => setFormData({ ...formData, hovedaarsak: value })}
            >
              <SelectTrigger id="hovedaarsak">
                <SelectValue placeholder="Velg hovedårsak..." />
              </SelectTrigger>
              <SelectContent>
                {causeTypes.map((cause) => (
                  <SelectItem key={cause.id} value={cause.navn}>
                    {cause.navn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Medvirkende årsak (valgfritt)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {formData.medvirkende_aarsak
                      ? formData.medvirkende_aarsak.split(", ").length + " valgt"
                      : "Velg medvirkende årsaker..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {contributingCauses.map((cause) => {
                    const selected = formData.medvirkende_aarsak
                      ? formData.medvirkende_aarsak.split(", ").includes(cause.navn)
                      : false;
                    return (
                      <label
                        key={cause.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const current = formData.medvirkende_aarsak
                              ? formData.medvirkende_aarsak.split(", ").filter(Boolean)
                              : [];
                            const next = checked
                              ? [...current, cause.navn]
                              : current.filter((c) => c !== cause.navn);
                            setFormData({ ...formData, medvirkende_aarsak: next.join(", ") });
                          }}
                        />
                        {cause.navn}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {formData.medvirkende_aarsak && (
              <div className="flex flex-wrap gap-1 mt-1">
                {formData.medvirkende_aarsak.split(", ").map((cause) => (
                  <span key={cause} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                    {cause}
                    <button
                      type="button"
                      onClick={() => {
                        const next = formData.medvirkende_aarsak
                          .split(", ")
                          .filter((c) => c !== cause)
                          .join(", ");
                        setFormData({ ...formData, medvirkende_aarsak: next });
                      }}
                      className="hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lokasjon">Lokasjon (valgfritt)</Label>
            <Input
              id="lokasjon"
              value={formData.lokasjon}
              onChange={(e) => setFormData({ ...formData, lokasjon: e.target.value })}
              placeholder="F.eks. Oslo, Hangar A, etc."
            />
          </div>

          {/* Ressurser – sammenleggbar seksjon */}
          <Collapsible open={resourcesOpen} onOpenChange={setResourcesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 py-1.5 h-auto text-sm font-medium text-muted-foreground hover:text-foreground">
                Ressurser (valgfritt)
                <ChevronDown className={cn("h-4 w-4 transition-transform", resourcesOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {/* Pilot */}
              <div className="space-y-1">
                <Label className="text-sm">Pilot</Label>
                <SearchablePersonSelect
                  persons={companyProfiles}
                  value={pilotId}
                  onValueChange={setPilotId}
                  placeholder="Velg pilot..."
                  searchPlaceholder="Søk pilot..."
                  allowNone
                  noneLabel="Ingen"
                />
              </div>

              {/* Drone */}
              <div className="space-y-1">
                <Label className="text-sm">Drone</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">
                        {droneId
                          ? companyDrones.find(d => d.id === droneId)?.modell || "Ukjent drone"
                          : "Velg drone..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Søk drone..." />
                      <CommandList>
                        <CommandEmpty>Ingen droner funnet.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__none__" onSelect={() => setDroneId(null)}>
                            <Check className={cn("mr-2 h-4 w-4", !droneId ? "opacity-100" : "opacity-0")} />
                            Ingen
                          </CommandItem>
                          {companyDrones.map((drone) => (
                            <CommandItem
                              key={drone.id}
                              value={`${drone.modell} ${drone.serienummer}`}
                              onSelect={() => setDroneId(drone.id)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", droneId === drone.id ? "opacity-100" : "opacity-0")} />
                              {drone.modell} <span className="text-muted-foreground ml-1 text-xs">({drone.serienummer})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Utstyr – multi-select */}
              <div className="space-y-1">
                <Label className="text-sm">Utstyr</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">
                        {equipmentIds.length > 0
                          ? `${equipmentIds.length} valgt`
                          : "Velg utstyr..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {companyEquipment.map((eq) => (
                        <label
                          key={eq.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={equipmentIds.includes(eq.id)}
                            onCheckedChange={() => toggleEquipment(eq.id)}
                          />
                          {eq.navn} <span className="text-muted-foreground text-xs">({eq.type})</span>
                        </label>
                      ))}
                      {companyEquipment.length === 0 && (
                        <p className="text-sm text-muted-foreground px-2 py-1">Ingen utstyr registrert.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {equipmentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {equipmentIds.map((eqId) => {
                      const eq = companyEquipment.find(e => e.id === eqId);
                      return (
                        <span key={eqId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                          {eq?.navn || "Ukjent"}
                          <button type="button" onClick={() => toggleEquipment(eqId)} className="hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Bildeopplasting */}
          <div className="space-y-2">
            <Label>Bilde (valgfritt)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Forhåndsvisning"
                  className="w-full max-h-48 object-cover rounded-md border border-border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={handleRemoveImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                Legg til bilde
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="oppfolgingsansvarlig">Oppfølgingsansvarlig (valgfritt)</Label>
            <SearchablePersonSelect
              persons={users}
              value={formData.oppfolgingsansvarlig_id || null}
              onValueChange={(val) => setFormData({ ...formData, oppfolgingsansvarlig_id: val || "" })}
              placeholder="Velg ansvarlig..."
              searchPlaceholder="Søk person..."
              allowNone
              noneLabel="Ingen ansvarlig"
            />
          </div>

          {/* Anonymitet */}
          {globalAnonymous ? (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
              <EyeOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Denne rapporten sendes inn anonymt (selskapsinnstilling).
              </p>
            </div>
          ) : (
            <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <Checkbox
                checked={reportAnonymously}
                onCheckedChange={(checked) => setReportAnonymously(!!checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Rapporter anonymt</p>
                <p className="text-xs text-muted-foreground">
                  Navnet ditt vil ikke vises på rapporten.
                </p>
              </div>
            </label>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Avbryt
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !formData.tittel || !formData.hendelsestidspunkt}
              className="flex-1"
            >
              {submitting 
                ? (isEditing ? "Lagrer..." : "Rapporterer...") 
                : (isEditing ? "Lagre endringer" : "Rapporter")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};