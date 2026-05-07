import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect, useMemo, useRef } from "react";

/** Convert a Date to the local `YYYY-MM-DDTHH:mm` format expected by datetime-local inputs */
function toLocalDatetimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, ChevronsUpDown, Plus, X, Route, MapPin, Ruler, Navigation, FileText, AlertTriangle } from "lucide-react";
import { useResourceConflicts } from "@/hooks/useResourceConflicts";
import { ResourceConflictWarning, ResourceConflictIndicator } from "@/components/dashboard/ResourceConflictWarning";
import { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { useTerminology } from "@/hooks/useTerminology";
import { useTranslation } from "react-i18next";

export interface RouteData {
  coordinates: { lat: number; lng: number }[];
  totalDistance: number;
  soraSettings?: any;
  adjacentAreaDocumentation?: any;
}

interface AddMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMissionAdded: () => void;
  onMissionAddedWithData?: (mission: any) => void;
  mission?: any;
  initialRouteData?: RouteData | null;
  initialFormData?: any;
  initialSelectedPersonnel?: string[];
  initialSelectedEquipment?: string[];
  initialSelectedDrones?: string[];
  initialSelectedCustomer?: string;
  initialSelectedDocuments?: string[];
}

type Document = {
  id: string;
  tittel: string;
  kategori: string;
};

type Profile = Tables<"profiles">;
type Equipment = any;
type Customer = any;
type Drone = any;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractMentionedProfileIds = (text: string, profiles: Profile[]) => {
  const mentioned = new Set<string>();
  profiles.forEach((profile) => {
    const name = profile.full_name?.trim();
    if (!name) return;
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:)\\]])`, 'i');
    if (pattern.test(text)) mentioned.add(profile.id);
  });
  return mentioned;
};

export const AddMissionDialog = ({ 
  open, 
  onOpenChange, 
  onMissionAdded, 
  onMissionAddedWithData,
  mission,
  initialRouteData,
  initialFormData,
  initialSelectedPersonnel,
  initialSelectedEquipment,
  initialSelectedDrones,
  initialSelectedCustomer,
  initialSelectedDocuments
}: AddMissionDialogProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const companySettings = useCompanySettings();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>(initialSelectedPersonnel || []);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(initialSelectedEquipment || []);
  const [selectedDrones, setSelectedDrones] = useState<string[]>(initialSelectedDrones || []);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>(initialSelectedDocuments || []);
  const [selectedCustomer, setSelectedCustomer] = useState<string>(initialSelectedCustomer || "");
  const [personnelRoles, setPersonnelRoles] = useState<Record<string, string | null>>({});
  const [companyMissionRoles, setCompanyMissionRoles] = useState<{id: string; name: string}[]>([]);
  const [openPersonnelPopover, setOpenPersonnelPopover] = useState(false);
  const [openEquipmentPopover, setOpenEquipmentPopover] = useState(false);
  const [openDronePopover, setOpenDronePopover] = useState(false);
  const [openCustomerPopover, setOpenCustomerPopover] = useState(false);
  const [openDocumentPopover, setOpenDocumentPopover] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [showNewCustomerInput, setShowNewCustomerInput] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(initialRouteData || null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const terminology = useTerminology();
  
  const [formData, setFormData] = useState({
    tittel: initialFormData?.tittel || "",
    lokasjon: initialFormData?.lokasjon || "",
    tidspunkt: initialFormData?.tidspunkt || "",
    beskrivelse: initialFormData?.beskrivelse || "",
    merknader: initialFormData?.merknader || "",
    status: initialFormData?.status || "Planlagt",
    risk_nivå: initialFormData?.risk_nivå || "Lav",
    latitude: initialFormData?.latitude || null as number | null,
    longitude: initialFormData?.longitude || null as number | null,
  });

  // Resource conflict detection
  const { conflicts: resourceConflicts } = useResourceConflicts(
    mission?.id,
    formData.tidspunkt,
    undefined, // slutt_tidspunkt not in formData yet
    selectedDrones,
    selectedEquipment,
    selectedPersonnel
  );

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.trim().toLowerCase();
    return profiles
      .filter((profile) => {
        const name = profile.full_name?.trim();
        return name && (!query || name.toLowerCase().includes(query));
      })
      .slice(0, 6);
  }, [mentionQuery, profiles]);

  useEffect(() => {
    if (open) {
      fetchProfiles();
      fetchEquipment();
      fetchDrones();
      fetchCustomers();
      fetchDocuments();
      fetchCompanyMissionRoles();
      
      // Pre-fylle skjemaet hvis vi redigerer
      if (mission) {
        setFormData({
          tittel: mission.tittel || "",
          lokasjon: mission.lokasjon || "",
          tidspunkt: mission.tidspunkt ? toLocalDatetimeString(new Date(mission.tidspunkt)) : "",
          beskrivelse: mission.beskrivelse || "",
          merknader: mission.merknader || "",
          status: mission.status || "Planlagt",
          risk_nivå: mission.risk_nivå || "Lav",
          latitude: mission.latitude || null,
          longitude: mission.longitude || null,
        });
        setSelectedCustomer(mission.customer_id || "");
        // Prioritize initialRouteData (from route planner) over mission.route (from DB)
        if (initialRouteData) {
          setRouteData(initialRouteData);
        } else if (mission.route) {
          setRouteData(mission.route as RouteData);
        } else {
          setRouteData(null);
        }
        fetchMissionPersonnel(mission.id);
        fetchMissionEquipment(mission.id);
        fetchMissionDrones(mission.id);
        fetchMissionDocuments(mission.id);
      } else if (initialFormData || initialRouteData) {
        // Restore form data from navigation state (returning from route planner)
        const firstCoord = initialRouteData?.coordinates?.[0];
        const autoLat = initialFormData?.latitude || firstCoord?.lat || null;
        const autoLng = initialFormData?.longitude || firstCoord?.lng || null;
        const autoLokasjon = initialFormData?.lokasjon || "";

        setFormData({
          tittel: initialFormData?.tittel || "",
          lokasjon: autoLokasjon,
          tidspunkt: initialFormData?.tidspunkt || "",
          beskrivelse: initialFormData?.beskrivelse || "",
          merknader: initialFormData?.merknader || "",
          status: initialFormData?.status || "Planlagt",
          risk_nivå: initialFormData?.risk_nivå || "Lav",
          latitude: autoLat,
          longitude: autoLng,
        });
        setRouteData(initialRouteData || null);
        if (initialSelectedPersonnel) setSelectedPersonnel(initialSelectedPersonnel);
        if (initialSelectedEquipment) setSelectedEquipment(initialSelectedEquipment);
        if (initialSelectedDrones) setSelectedDrones(initialSelectedDrones);
        if (initialSelectedCustomer) setSelectedCustomer(initialSelectedCustomer);
        if (initialSelectedDocuments) setSelectedDocuments(initialSelectedDocuments);

        // Auto-fill location from first route point via reverse geocoding
        if (!autoLokasjon && firstCoord) {
          fetch(`https://ws.geonorge.no/adresser/v1/punktsok?lat=${firstCoord.lat}&lon=${firstCoord.lng}&radius=500&treffPerSide=1`)
            .then(res => res.json())
            .then(data => {
              const addr = data?.adresser?.[0];
              if (addr) {
                const lokasjon = `${addr.adressetekst}, ${addr.poststed || addr.kommunenavn || ''}`.replace(/, $/, '');
                setFormData(prev => ({ ...prev, lokasjon }));
              } else {
                setFormData(prev => ({ ...prev, lokasjon: `${firstCoord.lat.toFixed(5)}, ${firstCoord.lng.toFixed(5)}` }));
              }
            })
            .catch(() => {
              setFormData(prev => ({ ...prev, lokasjon: `${firstCoord.lat.toFixed(5)}, ${firstCoord.lng.toFixed(5)}` }));
            });
        }
      } else {
        // Reset form når vi oppretter nytt oppdrag
        setFormData({
          tittel: "",
          lokasjon: "",
          tidspunkt: "",
          beskrivelse: "",
          merknader: "",
          status: "Planlagt",
          risk_nivå: "Lav",
          latitude: null,
          longitude: null,
        });
        setSelectedPersonnel([]);
        setSelectedEquipment([]);
        setSelectedDrones([]);
        setSelectedDocuments([]);
        setSelectedCustomer("");
        setRouteData(null);
      }
    }
  }, [open, mission, initialFormData, initialRouteData, initialSelectedPersonnel, initialSelectedEquipment, initialSelectedDrones, initialSelectedCustomer]);

  const fetchProfiles = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("approved", true)
      .eq("company_id", currentProfile?.company_id || '');
    
    if (error) {
      toast.error(t('missions.couldNotLoadPersonnel'));
      console.error(error);
    } else {
      setProfiles(data || []);
    }
  };

  const fetchEquipment = async () => {
    const { data, error } = await (supabase as any)
      .from("equipment")
      .select("*")
      .eq("aktiv", true);
    
    if (error) {
      toast.error(t('missions.couldNotLoadEquipment'));
      console.error(error);
    } else {
      setEquipment(data || []);
    }
  };

  const fetchDrones = async () => {
    const { data, error } = await (supabase as any)
      .from("drones")
      .select("*")
      .eq("aktiv", true);
    
    if (error) {
      toast.error(t('missions.couldNotLoadDrones'));
      console.error(error);
    } else {
      setDrones(data || []);
    }
  };

  const fetchCustomers = async () => {
    const { data, error } = await (supabase as any)
      .from("customers")
      .select("*")
      .eq("aktiv", true)
      .order("navn");
    
    if (error) {
      toast.error(t('missions.couldNotLoadCustomers'));
      console.error(error);
    } else {
      setCustomers(data || []);
    }
  };

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("id, tittel, kategori")
      .order("tittel");
    
    if (error) {
      console.error("Error fetching documents:", error);
    } else {
      setDocuments(data || []);
    }
  };

  const fetchMissionDocuments = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_documents")
      .select("document_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission documents:", error);
    } else {
      setSelectedDocuments(data?.map(d => d.document_id) || []);
    }
  };

  const fetchMissionPersonnel = async (missionId: string) => {
    const { data, error } = await (supabase as any)
      .from("mission_personnel")
      .select("profile_id, role_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission personnel:", error);
    } else {
      setSelectedPersonnel(data?.map((p: any) => p.profile_id) || []);
      const roles: Record<string, string | null> = {};
      (data || []).forEach((p: any) => { roles[p.profile_id] = p.role_id || null; });
      setPersonnelRoles(roles);
    }
  };

  const fetchCompanyMissionRoles = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
    if (!profile?.company_id) return;
    const { data } = await (supabase as any)
      .from("company_mission_roles")
      .select("id, name")
      .eq("company_id", profile.company_id)
      .order("name");
    setCompanyMissionRoles(data || []);
  };

  const fetchMissionEquipment = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_equipment")
      .select("equipment_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission equipment:", error);
    } else {
      setSelectedEquipment(data?.map(e => e.equipment_id) || []);
    }
  };

  const fetchMissionDrones = async (missionId: string) => {
    const { data, error } = await supabase
      .from("mission_drones")
      .select("drone_id")
      .eq("mission_id", missionId);
    
    if (error) {
      console.error("Error fetching mission drones:", error);
    } else {
      setSelectedDrones(data?.map(d => d.drone_id) || []);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error(t('missions.customerName') + ' ' + t('forms.required').toLowerCase());
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke innlogget");

      // Get user's company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("Kunne ikke hente brukerinformasjon");
      }

      const { data, error } = await (supabase as any)
        .from("customers")
        .insert({
          navn: newCustomerName.trim(),
          user_id: user.id,
          company_id: profile.company_id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(t('missions.customerCreated'));
      setCustomers([...customers, data]);
      setSelectedCustomer(data.id);
      setNewCustomerName("");
      setShowNewCustomerInput(false);
      setOpenCustomerPopover(false);
    } catch (error) {
      console.error("Error creating customer:", error);
      toast.error(t('missions.couldNotCreateCustomer'));
    }
  };

  const updateMentionState = (value: string, cursorPosition: number) => {
    const beforeCursor = value.slice(0, cursorPosition);
    const match = beforeCursor.match(/(^|\s)@([^@\s]*)$/);
    if (match) {
      setMentionStart(cursorPosition - match[2].length - 1);
      setMentionQuery(match[2]);
    } else {
      setMentionStart(null);
      setMentionQuery(null);
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, merknader: value });
    updateMentionState(value, e.target.selectionStart);
  };

  const insertMention = (profile: Profile) => {
    const name = profile.full_name?.trim();
    if (!name || mentionStart === null) return;
    const textarea = notesTextareaRef.current;
    const cursor = textarea?.selectionStart ?? formData.merknader.length;
    const nextValue = `${formData.merknader.slice(0, mentionStart)}@${name} ${formData.merknader.slice(cursor)}`;
    const nextCursor = mentionStart + name.length + 2;
    setFormData({ ...formData, merknader: nextValue });
    setMentionStart(null);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      notesTextareaRef.current?.focus();
      notesTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const sendMentionNotifications = async ({ missionId, previousNotes, currentNotes, companyId, senderId }: { missionId: string; previousNotes?: string; currentNotes: string; companyId: string; senderId: string }) => {
    const currentMentions = extractMentionedProfileIds(currentNotes, profiles);
    const previousMentions = extractMentionedProfileIds(previousNotes || '', profiles);
    const newMentionIds = [...currentMentions].filter((id) => id !== senderId && !previousMentions.has(id));
    if (!newMentionIds.length) return;

    const senderProfile = profiles.find((p) => p.id === senderId);
    const missionDate = formData.tidspunkt ? new Date(formData.tidspunkt).toISOString() : new Date().toISOString();

    await Promise.all(newMentionIds.map((recipientId) => supabase.functions.invoke('send-notification-email', {
      body: {
        type: 'notify_mission_mention',
        companyId,
        missionId,
        missionMention: {
          recipientId,
          senderId,
          senderName: senderProfile?.full_name || 'En kollega',
          missionTitle: formData.tittel || 'Oppdrag uten tittel',
          missionLocation: formData.lokasjon || 'Ikke oppgitt',
          missionDate,
          missionNote: currentNotes,
        }
      }
    })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.lokasjon?.trim()) {
      toast.error(t('missions.locationRequired'));
      return;
    }
    
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke innlogget");

      // Get user's company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("Kunne ikke hente brukerinformasjon");
      }

      const routeForStorage = routeData;

      if (mission) {
        // UPDATE mode
        // Sjekk om status endres til Fullført - da henter vi og lagrer værdata
        let weatherSnapshot = null;
        const statusChangingToFullført = formData.status === "Fullført" && mission.status !== "Fullført";
        
        if (statusChangingToFullført && (formData.latitude || formData.longitude)) {
          const lat = formData.latitude || (routeData?.coordinates?.[0]?.lat);
          const lng = formData.longitude || (routeData?.coordinates?.[0]?.lng);
          
          if (lat && lng) {
            // Sjekk om oppdragets tidspunkt er mer enn 24 timer gammelt
            const missionTime = new Date(formData.tidspunkt);
            const hoursAgo = (Date.now() - missionTime.getTime()) / (1000 * 60 * 60);
            
            if (hoursAgo > 24) {
              // Historisk oppdrag – ikke hent nåværende vær
              weatherSnapshot = {
                captured_at: new Date().toISOString(),
                unavailable: true,
                reason: 'historical',
              };
            } else {
              try {
                const { data: weatherData } = await supabase.functions.invoke('drone-weather', {
                  body: { lat, lon: lng }
                });
                
                if (weatherData) {
                  weatherSnapshot = {
                    captured_at: new Date().toISOString(),
                    current: weatherData.current,
                    warnings: weatherData.warnings || [],
                    drone_flight_recommendation: weatherData.drone_flight_recommendation
                  };
                }
              } catch (weatherErr) {
                console.error('Could not fetch weather for snapshot:', weatherErr);
              }
            }
          }
        }

        const updateData: any = {
          tittel: formData.tittel,
          lokasjon: formData.lokasjon,
          tidspunkt: formData.tidspunkt ? new Date(formData.tidspunkt).toISOString() : formData.tidspunkt,
          beskrivelse: formData.beskrivelse,
          merknader: formData.merknader,
          status: formData.status,
          risk_nivå: formData.risk_nivå,
          customer_id: selectedCustomer || null,
          latitude: formData.latitude,
          longitude: formData.longitude,
          route: routeForStorage,
          oppdatert_dato: new Date().toISOString(),
        };

        // Legg til værdata-snapshot hvis vi nettopp fullførte oppdraget
        if (weatherSnapshot) {
          updateData.weather_data_snapshot = weatherSnapshot;
        }

        const { error: missionError } = await (supabase as any)
          .from("missions")
          .update(updateData)
          .eq("id", mission.id);

        if (missionError) throw missionError;

        // Delete existing personnel, equipment, drones, and documents
        await supabase.from("mission_personnel").delete().eq("mission_id", mission.id);
        await supabase.from("mission_equipment").delete().eq("mission_id", mission.id);
        await supabase.from("mission_drones").delete().eq("mission_id", mission.id);
        await supabase.from("mission_documents").delete().eq("mission_id", mission.id);

        // Insert new personnel
        if (selectedPersonnel.length > 0) {
          const personnelData = selectedPersonnel.map(profileId => ({
            mission_id: mission.id,
            profile_id: profileId,
            role_id: personnelRoles[profileId] || null,
          }));
          
          const { error: personnelError } = await supabase
            .from("mission_personnel")
            .insert(personnelData);
          
          if (personnelError) throw personnelError;
        }

        // Insert new equipment
        if (selectedEquipment.length > 0) {
          const equipmentData = selectedEquipment.map(equipmentId => ({
            mission_id: mission.id,
            equipment_id: equipmentId,
          }));
          
          const { error: equipmentError } = await supabase
            .from("mission_equipment")
            .insert(equipmentData);
          
          if (equipmentError) throw equipmentError;
        }

        // Insert new drones
        if (selectedDrones.length > 0) {
          const dronesData = selectedDrones.map(droneId => ({
            mission_id: mission.id,
            drone_id: droneId,
          }));
          
          const { error: dronesError } = await supabase
            .from("mission_drones")
            .insert(dronesData);
          
        if (dronesError) throw dronesError;
        }

        // Insert new documents
        if (selectedDocuments.length > 0) {
          const documentsData = selectedDocuments.map(documentId => ({
            mission_id: mission.id,
            document_id: documentId,
          }));
          
          const { error: documentsError } = await supabase
            .from("mission_documents")
            .insert(documentsData);
          
          if (documentsError) throw documentsError;
        }

        // Auto-sync checklist_ids based on attached checklist documents + drone operations checklists
        {
          const checklistDocIds = selectedDocuments.filter(id => {
            const doc = documents.find(d => d.id === id);
            return doc?.kategori === "sjekklister";
          });

          // Get all document IDs that are checklists (to know which to remove)
          const allChecklistDocIds = documents
            .filter(d => d.kategori === "sjekklister")
            .map(d => d.id);

          // Fetch operations_checklist_ids from selected drones
          let droneOpsChecklistIds: string[] = [];
          if (selectedDrones.length > 0) {
            const { data: droneRows } = await (supabase as any)
              .from("drones")
              .select("operations_checklist_ids")
              .in("id", selectedDrones)
              .not("operations_checklist_ids", "is", null);
            droneOpsChecklistIds = (droneRows || []).flatMap((d: any) => d.operations_checklist_ids || []);
          }

          // Fetch current checklist_ids from mission
          const { data: currentMission } = await (supabase as any)
            .from("missions")
            .select("checklist_ids")
            .eq("id", mission.id)
            .single();

          const currentIds: string[] = currentMission?.checklist_ids || [];

          // Remove any checklist doc IDs that were un-selected, keep manually-linked ones
          const withoutRemoved = currentIds.filter(
            id => !allChecklistDocIds.includes(id) || checklistDocIds.includes(id)
          );

          // Merge in newly selected checklist doc IDs + drone ops checklists (deduplicated)
          const merged = [...new Set([...withoutRemoved, ...checklistDocIds, ...droneOpsChecklistIds])];

          await (supabase as any)
            .from("missions")
            .update({ checklist_ids: merged })
            .eq("id", mission.id);
        }

        try {
          await sendMentionNotifications({
            missionId: mission.id,
            previousNotes: mission.merknader || '',
            currentNotes: formData.merknader,
            companyId: profile.company_id,
            senderId: user.id,
          });
        } catch (mentionError) {
          console.error('Error sending mission mention notifications:', mentionError);
        }

        toast.success(t('missions.missionUpdated'));
        onMissionAdded();
      } else {
        // INSERT mode
        const { data: createdMission, error: missionError } = await (supabase as any)
          .from("missions")
          .insert({
            tittel: formData.tittel,
            lokasjon: formData.lokasjon,
            tidspunkt: formData.tidspunkt ? new Date(formData.tidspunkt).toISOString() : formData.tidspunkt,
            beskrivelse: formData.beskrivelse,
            merknader: formData.merknader,
            status: formData.status,
            risk_nivå: formData.risk_nivå,
            customer_id: selectedCustomer || null,
            user_id: user.id,
            company_id: profile.company_id,
            latitude: formData.latitude,
            longitude: formData.longitude,
            route: routeForStorage,
          })
          .select()
          .single();

        if (missionError) throw missionError;

        // Insert mission personnel
        if (selectedPersonnel.length > 0) {
          const personnelData = selectedPersonnel.map(profileId => ({
            mission_id: createdMission.id,
            profile_id: profileId,
            role_id: personnelRoles[profileId] || null,
          }));
          
          const { error: personnelError } = await (supabase as any)
            .from("mission_personnel")
            .insert(personnelData);
          
          if (personnelError) throw personnelError;
        }

        // Insert mission equipment
        if (selectedEquipment.length > 0) {
          const equipmentData = selectedEquipment.map(equipmentId => ({
            mission_id: createdMission.id,
            equipment_id: equipmentId,
          }));
          
          const { error: equipmentError } = await (supabase as any)
            .from("mission_equipment")
            .insert(equipmentData);
          
          if (equipmentError) throw equipmentError;
        }

        // Insert mission drones
        if (selectedDrones.length > 0) {
          const dronesData = selectedDrones.map(droneId => ({
            mission_id: createdMission.id,
            drone_id: droneId,
          }));
          
          const { error: dronesError } = await (supabase as any)
            .from("mission_drones")
            .insert(dronesData);
          
          if (dronesError) throw dronesError;
        }

        // Insert mission documents
        if (selectedDocuments.length > 0) {
          const documentsData = selectedDocuments.map(documentId => ({
            mission_id: createdMission.id,
            document_id: documentId,
          }));
          
          const { error: documentsError } = await supabase
            .from("mission_documents")
            .insert(documentsData);
          
          if (documentsError) throw documentsError;
        }

        // Auto-sync checklist_ids based on attached checklist documents + drone operations checklists
        {
          const checklistDocIds = selectedDocuments.filter(id => {
            const doc = documents.find(d => d.id === id);
            return doc?.kategori === "sjekklister";
          });

          // Fetch operations_checklist_ids from selected drones
          let droneOpsChecklistIds: string[] = [];
          if (selectedDrones.length > 0) {
            const { data: droneRows } = await (supabase as any)
              .from("drones")
              .select("operations_checklist_ids")
              .in("id", selectedDrones)
              .not("operations_checklist_ids", "is", null);
            droneOpsChecklistIds = (droneRows || []).flatMap((d: any) => d.operations_checklist_ids || []);
          }

          const allChecklistIds = [...new Set([...checklistDocIds, ...droneOpsChecklistIds])];

          if (allChecklistIds.length > 0) {
            await (supabase as any)
              .from("missions")
              .update({ checklist_ids: allChecklistIds })
              .eq("id", createdMission.id);
          }
        }

        // Send email notification for new mission
        try {
          // Gather names for notification
          const customerName = selectedCustomer 
            ? customers.find(c => c.id === selectedCustomer)?.navn 
            : undefined;
          
          const personnelNames = selectedPersonnel
            .map(id => profiles.find(p => p.id === id)?.full_name)
            .filter(Boolean) as string[];
          
          const droneModels = selectedDrones
            .map(id => {
              const drone = drones.find(d => d.id === id);
              return drone ? `${drone.modell} (SN: ${drone.serienummer})` : null;
            })
            .filter(Boolean) as string[];
          
          const equipmentNames = selectedEquipment
            .map(id => equipment.find(e => e.id === id)?.navn)
            .filter(Boolean) as string[];

          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_new_mission',
              companyId: profile.company_id,
              mission: {
                tittel: formData.tittel,
                lokasjon: formData.lokasjon,
                tidspunkt: formData.tidspunkt,
                beskrivelse: formData.beskrivelse,
                status: formData.status,
                riskNiva: formData.risk_nivå,
                merknader: formData.merknader,
                kunde: customerName,
                personell: personnelNames,
                droner: droneModels,
                utstyr: equipmentNames,
                ruteLengde: routeData?.totalDistance
              }
            }
          });
        } catch (emailError) {
          console.error('Error sending new mission notification:', emailError);
        }

        try {
          await sendMentionNotifications({
            missionId: createdMission.id,
            currentNotes: formData.merknader,
            companyId: profile.company_id,
            senderId: user.id,
          });
        } catch (mentionError) {
          console.error('Error sending mission mention notifications:', mentionError);
        }

        toast.success(t('missions.missionCreated'));

        if (onMissionAddedWithData && createdMission) {
          onMissionAddedWithData(createdMission);
        } else {
          onMissionAdded();
        }
      }
      onOpenChange(false);
      
      // Reset form
      setFormData({
        tittel: "",
        lokasjon: "",
        tidspunkt: "",
        beskrivelse: "",
        merknader: "",
        status: "Planlagt",
        risk_nivå: "Lav",
        latitude: null,
        longitude: null,
      });
      setSelectedPersonnel([]);
      setSelectedEquipment([]);
      setSelectedDrones([]);
      setSelectedDocuments([]);
      setSelectedCustomer("");
      setNewCustomerName("");
      setShowNewCustomerInput(false);
    } catch (error) {
      console.error("Error saving mission:", error);
      toast.error(mission ? t('missions.couldNotUpdateMission') : t('missions.couldNotCreateMission'));
    } finally {
      setLoading(false);
    }
  };

  const togglePersonnel = (profileId: string) => {
    setSelectedPersonnel(prev =>
      prev.includes(profileId)
        ? prev.filter(id => id !== profileId)
        : [...prev, profileId]
    );
  };

  const removePersonnel = (profileId: string) => {
    setSelectedPersonnel(prev => prev.filter(id => id !== profileId));
  };

  const toggleEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev =>
      prev.includes(equipmentId)
        ? prev.filter(id => id !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const removeEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev => prev.filter(id => id !== equipmentId));
  };

  const toggleDrone = (droneId: string) => {
    setSelectedDrones(prev =>
      prev.includes(droneId)
        ? prev.filter(id => id !== droneId)
        : [...prev, droneId]
    );
  };

  const removeDrone = (droneId: string) => {
    setSelectedDrones(prev => prev.filter(id => id !== droneId));
  };

  const toggleDocument = (documentId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const removeDocument = (documentId: string) => {
    setSelectedDocuments(prev => prev.filter(id => id !== documentId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{mission ? t('missions.editMission') : t('missions.addMission')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tittel">{t('forms.title')} *</Label>
            <Input
              id="tittel"
              value={formData.tittel}
              onChange={(e) => setFormData({ ...formData, tittel: e.target.value })}
              required
            />
          </div>

          <div>
            <AddressAutocomplete
              label={t('missions.addressLocation') + " *"}
              value={formData.lokasjon}
              onChange={(value) => setFormData({ ...formData, lokasjon: value })}
              onSelectLocation={(location) => {
                setFormData({ 
                  ...formData, 
                  lokasjon: location.address,
                  latitude: location.lat,
                  longitude: location.lon
                });
              }}
              placeholder={t('missions.searchAddress')}
              required={true}
            />
            
            <AirspaceWarnings 
              latitude={formData.latitude} 
              longitude={formData.longitude}
              routePoints={routeData?.coordinates}
              showAll={companySettings.show_all_airspace_warnings}
            />
            
            <DroneWeatherPanel 
              latitude={formData.latitude} 
              longitude={formData.longitude}
              compact={true}
            />
          </div>

          {/* Route Planning */}
          <div>
            <Label>{t('missions.flightRoute')}</Label>
            <div className="mt-1.5">
              {routeData ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm bg-secondary/50 px-3 py-2 rounded-md">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{routeData.coordinates.length} {t('missions.points')}</span>
                    <span className="text-muted-foreground">•</span>
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{routeData.totalDistance.toFixed(2)} km</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (routeData.coordinates.length > 0) {
                        const startPoint = routeData.coordinates[0];
                        // Reverse geocode to get address
                        try {
                          const response = await fetch(
                            `https://ws.geonorge.no/adresser/v1/punktsok?lat=${startPoint.lat}&lon=${startPoint.lng}&radius=100&treffPerSide=1`
                          );
                          const data = await response.json();
                          let address = `${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)}`;
                          if (data.adresser && data.adresser.length > 0) {
                            const addr = data.adresser[0];
                            address = `${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`;
                          }
                          setFormData({
                            ...formData,
                            lokasjon: address,
                            latitude: startPoint.lat,
                            longitude: startPoint.lng
                          });
                        } catch (error) {
                          // Fallback to coordinates if geocoding fails
                          setFormData({
                            ...formData,
                            lokasjon: `${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)}`,
                            latitude: startPoint.lat,
                            longitude: startPoint.lng
                          });
                        }
                      }
                    }}
                  >
                    <Navigation className="h-4 w-4 mr-1" />
                    {t('missions.useStartPoint')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                  onClick={() => {
                      navigate('/kart', {
                        state: {
                          mode: 'routePlanning',
                          returnTo: '/oppdrag',
                          existingRoute: routeData,
                          formData,
                          selectedPersonnel,
                          selectedEquipment,
                          selectedDrones,
                          selectedCustomer,
                          missionId: mission?.id,
                          initialCenter: formData.latitude && formData.longitude 
                            ? [formData.latitude, formData.longitude] as [number, number]
                            : undefined
                        }
                      });
                      onOpenChange(false);
                    }}
                  >
                    <Route className="h-4 w-4 mr-1" />
                    {t('actions.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRouteData(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/kart', {
                      state: {
                        mode: 'routePlanning',
                        returnTo: '/oppdrag',
                        existingRoute: null,
                        formData,
                        selectedPersonnel,
                        selectedEquipment,
                        selectedDrones,
                        selectedCustomer,
                        missionId: mission?.id,
                        initialCenter: formData.latitude && formData.longitude 
                          ? [formData.latitude, formData.longitude] as [number, number]
                          : undefined
                      }
                    });
                    onOpenChange(false);
                  }}
                >
                  <Route className="h-4 w-4 mr-2" />
                  {t('missions.planRouteOnMap')}
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="tidspunkt">{t('missions.time')} *</Label>
            <Input
              id="tidspunkt"
              type="datetime-local"
              value={formData.tidspunkt}
              onChange={(e) => setFormData({ ...formData, tidspunkt: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="beskrivelse">{t('missions.description')}</Label>
            <Textarea
              id="beskrivelse"
              value={formData.beskrivelse}
              onChange={(e) => setFormData({ ...formData, beskrivelse: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="merknader">{t('missions.notes')}</Label>
            <div className="relative">
              <Textarea
                ref={notesTextareaRef}
                id="merknader"
                value={formData.merknader}
                onChange={handleNotesChange}
                onKeyUp={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
                onClick={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
                rows={2}
                placeholder="Skriv merknad... Bruk @ for å tagge personer"
              />
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  {mentionSuggestions.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(profile);
                      }}
                    >
                      <span className="truncate">{profile.full_name || 'Ukjent bruker'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">{t('missions.status')}</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planlagt">{t('missions.planned')}</SelectItem>
                  <SelectItem value="Pågående">{t('missions.ongoing')}</SelectItem>
                  <SelectItem value="Fullført">{t('missions.completed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <div>
            <Label htmlFor="kunde">{t('missions.customer')}</Label>
            <Popover open={openCustomerPopover} onOpenChange={setOpenCustomerPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCustomerPopover}
                  className="w-full justify-between"
                >
                  {selectedCustomer
                    ? customers.find((c) => c.id === selectedCustomer)?.navn
                    : t('missions.selectCustomer')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder={t('missions.searchCustomer')} />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-2">
                        {showNewCustomerInput ? (
                          <div className="space-y-2">
                            <Input
                              placeholder={t('missions.customerName')}
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCreateCustomer();
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleCreateCustomer}>
                                {t('actions.create')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowNewCustomerInput(false);
                                  setNewCustomerName("");
                                }}
                              >
                                {t('actions.cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => setShowNewCustomerInput(true)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('missions.addNewCustomer')}
                          </Button>
                        )}
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {customers.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={customer.navn}
                          onSelect={() => {
                            setSelectedCustomer(customer.id);
                            setOpenCustomerPopover(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCustomer === customer.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {customer.navn}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Personell</Label>
            <Popover open={openPersonnelPopover} onOpenChange={setOpenPersonnelPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openPersonnelPopover}
                  className="w-full justify-between"
                >
                  Velg personell...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Søk personell..." />
                  <CommandList>
                    <CommandEmpty>Ingen personell funnet.</CommandEmpty>
                    <CommandGroup>
                      {profiles.map((profile) => (
                        <CommandItem
                          key={profile.id}
                          value={profile.full_name || "Ukjent"}
                          onSelect={() => togglePersonnel(profile.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPersonnel.includes(profile.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {profile.full_name || "Ukjent"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedPersonnel.length > 0 && (
              <div className="mt-2 space-y-2">
                {selectedPersonnel.map((id) => {
                  const profile = profiles.find((p) => p.id === id);
                  const conflicts = resourceConflicts.filter(
                    (c) => c.resourceId === id && c.resourceType === 'personnel'
                  );
                  return (
                    <div key={id}>
                      <div className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm w-fit flex-wrap">
                        <span>{profile?.full_name || t('missions.unknown')}</span>
                        {companyMissionRoles.length > 0 && (
                          <Select
                            value={personnelRoles[id] || "none"}
                            onValueChange={(val) => setPersonnelRoles(prev => ({ ...prev, [id]: val === "none" ? null : val }))}
                          >
                            <SelectTrigger className="h-6 w-auto min-w-[100px] text-xs border-none bg-background/50 px-1.5 py-0">
                              <SelectValue placeholder="Rolle" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Ingen rolle</SelectItem>
                              {companyMissionRoles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <ResourceConflictIndicator conflicts={conflicts} />
                        <button
                          type="button"
                          onClick={() => removePersonnel(id)}
                          className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <ResourceConflictWarning conflicts={conflicts} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>{t('missions.equipment')}</Label>
            <Popover open={openEquipmentPopover} onOpenChange={setOpenEquipmentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openEquipmentPopover}
                  className="w-full justify-between"
                >
                  {t('missions.selectEquipment')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder={t('missions.searchEquipment')} />
                  <CommandList>
                    <CommandEmpty>{t('missions.noEquipmentFound')}</CommandEmpty>
                    <CommandGroup>
                      {equipment.map((eq) => (
                        <CommandItem
                          key={eq.id}
                          value={`${eq.navn} ${eq.type}`}
                          onSelect={() => toggleEquipment(eq.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedEquipment.includes(eq.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {eq.navn} ({eq.type})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedEquipment.length > 0 && (
              <div className="mt-2 space-y-2">
                {selectedEquipment.map((id) => {
                  const eq = equipment.find((e) => e.id === id);
                  const conflicts = resourceConflicts.filter(
                    (c) => c.resourceId === id && c.resourceType === 'equipment'
                  );
                  return (
                    <div key={id}>
                      <div className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm w-fit">
                        <span>{eq?.navn} ({eq?.type})</span>
                        <ResourceConflictIndicator conflicts={conflicts} />
                        <button
                          type="button"
                          onClick={() => removeEquipment(id)}
                          className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <ResourceConflictWarning conflicts={conflicts} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>{terminology.vehicles}</Label>
            <Popover open={openDronePopover} onOpenChange={setOpenDronePopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDronePopover}
                  className="w-full justify-between"
                >
                  {terminology.selectVehicle}...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder={`Søk ${terminology.vehicleLower}...`} />
                  <CommandList>
                    <CommandEmpty>{terminology.noVehicles}.</CommandEmpty>
                    <CommandGroup>
                      {drones.map((drone) => (
                        <CommandItem
                          key={drone.id}
                          value={`${drone.modell} ${drone.registration_number || ''}`}
                          onSelect={() => toggleDrone(drone.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDrones.includes(drone.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {drone.modell}{drone.registration_number ? ` (${drone.registration_number})` : ''}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedDrones.length > 0 && (
              <div className="mt-2 space-y-2">
                {selectedDrones.map((id) => {
                  const drone = drones.find((d) => d.id === id);
                  const conflicts = resourceConflicts.filter(
                    (c) => c.resourceId === id && c.resourceType === 'drone'
                  );
                  return (
                    <div key={id}>
                      <div className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm w-fit">
                        <span>{drone?.modell}{drone?.registration_number ? ` (${drone.registration_number})` : ''}</span>
                        <ResourceConflictIndicator conflicts={conflicts} />
                        <button
                          type="button"
                          onClick={() => removeDrone(id)}
                          className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <ResourceConflictWarning conflicts={conflicts} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Documents */}
          <div>
            <Label>Dokumenter</Label>
            <Popover open={openDocumentPopover} onOpenChange={setOpenDocumentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDocumentPopover}
                  className="w-full justify-between"
                >
                  Knytt dokument...
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Søk dokumenter..." />
                  <CommandList>
                    <CommandEmpty>Ingen dokumenter funnet.</CommandEmpty>
                    <CommandGroup>
                      {documents.map((doc) => (
                        <CommandItem
                          key={doc.id}
                          value={`${doc.tittel} ${doc.kategori}`}
                          onSelect={() => toggleDocument(doc.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDocuments.includes(doc.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span>{doc.tittel}</span>
                            <span className="text-xs text-muted-foreground">{doc.kategori}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedDocuments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedDocuments.map((id) => {
                  const doc = documents.find((d) => d.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm"
                    >
                      <FileText className="h-3 w-3" />
                      <span>{doc?.tittel}</span>
                      <button
                        type="button"
                        onClick={() => removeDocument(id)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mission ? t('missions.saveChanges') : t('missions.createMission')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
