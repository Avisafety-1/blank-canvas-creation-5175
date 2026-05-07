import { getCachedData, setCachedData } from "@/lib/offlineCache";
import droneBackground from "@/assets/drone-background.png";
import { Plane, Plus, Gauge, Users, Search, Radio, Filter, Paperclip, Building2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassCard } from "@/components/GlassCard";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { AddDroneDialog } from "@/components/resources/AddDroneDialog";
import { AddEquipmentDialog } from "@/components/resources/AddEquipmentDialog";
import { AddCompetencyDialog } from "@/components/resources/AddCompetencyDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { AddDronetagDialog } from "@/components/resources/AddDronetagDialog";
import { DronetagDetailDialog } from "@/components/resources/DronetagDetailDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { calculateMaintenanceStatus, calculateDroneAggregatedStatus, calculateEquipmentMaintenanceStatus, worstStatus } from "@/lib/maintenanceStatus";
import { Status } from "@/types";
import { usePresence } from "@/hooks/usePresence";
import { OnlineIndicator } from "@/components/OnlineIndicator";

const Resources = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading, companyId } = useAuth();
  const terminology = useTerminology();
  const { isOnline } = usePresence();
  const [drones, setDrones] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [dronetags, setDronetags] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [droneDialogOpen, setDroneDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [dronetagDialogOpen, setDronetagDialogOpen] = useState(false);
  const [personnelDialogOpen, setPersonnelDialogOpen] = useState(false);
  const [personCompetencyDialogOpen, setPersonCompetencyDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<typeof personnel[0] | null>(null);
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [droneDetailOpen, setDroneDetailOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [equipmentDetailOpen, setEquipmentDetailOpen] = useState(false);
  const [selectedDronetag, setSelectedDronetag] = useState<any>(null);
  const [dronetagDetailOpen, setDronetagDetailOpen] = useState(false);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [droneSearch, setDroneSearch] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [droneStatusFilter, setDroneStatusFilter] = useState("alle");
  const [droneModelFilter, setDroneModelFilter] = useState("alle");
  const [equipmentStatusFilter, setEquipmentStatusFilter] = useState("alle");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("alle");
  const [personnelStatusFilter, setPersonnelStatusFilter] = useState("alle");
  const [personnelRoleFilter, setPersonnelRoleFilter] = useState("alle");
  const [droneSortBy, setDroneSortBy] = useState<"default" | "last_flown">("default");
  const [pendingCourseCounts, setPendingCourseCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDrones();
      fetchEquipment();
      fetchDronetags();
      fetchPersonnel();
      fetchPendingCourses();
    }

    // Real-time subscriptions — single consolidated channel
    const guardedFetch = (fn: () => void) => () => { if (navigator.onLine) fn(); };

    const channel = supabase
      .channel('ressurser-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drones' }, guardedFetch(fetchDrones))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, guardedFetch(fetchEquipment))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dronetag_devices' }, guardedFetch(fetchDronetags))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, guardedFetch(fetchPersonnel))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel_competencies' }, guardedFetch(fetchPersonnel))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_assignments' }, guardedFetch(fetchPendingCourses))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, companyId]);

  // Sync selectedDrone with updated drones data
  useEffect(() => {
    if (selectedDrone && drones.length > 0) {
      const updatedDrone = drones.find(d => d.id === selectedDrone.id);
      if (updatedDrone) {
        setSelectedDrone(updatedDrone);
      }
    }
  }, [drones]);

  // Sync selectedEquipment with updated equipment data
  useEffect(() => {
    if (selectedEquipment && equipment.length > 0) {
      const updatedEquipment = equipment.find(e => e.id === selectedEquipment.id);
      if (updatedEquipment) {
        setSelectedEquipment(updatedEquipment);
      }
    }
  }, [equipment]);

  // Sync selectedPerson with updated personnel data
  useEffect(() => {
    if (selectedPerson && personnel.length > 0) {
      const updatedPerson = personnel.find(p => p.id === selectedPerson.id);
      if (updatedPerson) {
        setSelectedPerson(updatedPerson);
      }
    }
  }, [personnel]);

  const fetchDrones = async (skipCache = false) => {
    // 1. Load cache first (unless skipping after mutation)
    if (!skipCache && companyId) {
      const cached = getCachedData<any[]>(`offline_drones_${companyId}`);
      if (cached) setDrones(cached);
    }
    // 2. Skip network if offline
    if (!navigator.onLine) return;
    // 3. Fetch fresh data with nested accessories + equipment for aggregated status
    try {
      const { data, error } = await (supabase as any)
        .from("drones")
        .select(`
          *,
          companies(navn),
          drone_accessories(drone_id, neste_vedlikehold, varsel_dager),
          drone_equipment(drone_id, equipment:equipment_id(id, neste_vedlikehold, varsel_dager)),
          drone_personnel(id, profile:profile_id(id, full_name, tittel))
        `)
        .eq("aktiv", true)
        .order("opprettet_dato", { ascending: false });
      
      if (error) throw error;

      // Calculate aggregated status for each drone (including unique missions since inspection)
      const { countUniqueMissionsSinceInspection } = await import("@/lib/droneInspection");
      // Fetch last flown dates from flight_logs
      const droneIds = (data || []).map((d: any) => d.id);
      let lastFlownMap: Record<string, string> = {};
      if (droneIds.length > 0) {
        const { data: flightData } = await supabase
          .from("flight_logs")
          .select("drone_id, flight_date")
          .in("drone_id", droneIds)
          .order("flight_date", { ascending: false });
        if (flightData) {
          for (const row of flightData) {
            if (row.drone_id && !lastFlownMap[row.drone_id]) {
              lastFlownMap[row.drone_id] = row.flight_date;
            }
          }
        }
      }

      const dronesWithStatus = await Promise.all((data || []).map(async (drone: any) => {
        const accessories = drone.drone_accessories || [];
        const linkedEquipment = (drone.drone_equipment || [])
          .map((link: any) => link.equipment)
          .filter(Boolean);

        // Count unique missions since last inspection if interval is configured
        let missionsSinceInspection = 0;
        if (drone.inspection_interval_missions) {
          missionsSinceInspection = await countUniqueMissionsSinceInspection(drone.id, drone.sist_inspeksjon);
        }

        const { status } = calculateDroneAggregatedStatus(
          {
            neste_inspeksjon: drone.neste_inspeksjon,
            varsel_dager: drone.varsel_dager,
            flyvetimer: drone.flyvetimer ?? 0,
            hours_at_last_inspection: drone.hours_at_last_inspection ?? 0,
            inspection_interval_hours: drone.inspection_interval_hours,
            varsel_timer: drone.varsel_timer,
            missions_since_inspection: missionsSinceInspection,
            inspection_interval_missions: drone.inspection_interval_missions,
            varsel_oppdrag: drone.varsel_oppdrag,
          },
          accessories,
          linkedEquipment
        );
        const dbStatus = (drone.status as Status) || "Grønn";
        const finalStatus = worstStatus(status, dbStatus);
        return { ...drone, _aggregatedStatus: finalStatus, last_flown: lastFlownMap[drone.id] || null };
      }));
      setDrones(dronesWithStatus);
      if (companyId) setCachedData(`offline_drones_${companyId}`, dronesWithStatus);
    } catch (err) {
      console.error("Error fetching drones:", err);
      toast.error(t('resources.couldNotLoadDrones'));
    }
  };

  const fetchEquipment = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<any[]>(`offline_equipment_${companyId}`);
      if (cached) setEquipment(cached);
    }
    // 2. Skip network if offline
    if (!navigator.onLine) return;
    // 3. Fetch fresh data
    try {
      const { data, error } = await (supabase as any)
        .from("equipment")
        .select("*, companies(navn)")
        .eq("aktiv", true)
        .order("opprettet_dato", { ascending: false });
      
      if (error) throw error;

      // Count missions for equipment with mission-based intervals
      const equipmentWithMissions = await Promise.all((data || []).map(async (item: any) => {
        let _missionsSinceMaintenance = 0;
        if (item.inspection_interval_missions) {
          const { data: meData } = await supabase
            .from("mission_equipment")
            .select("mission_id")
            .eq("equipment_id", item.id);
          if (meData) {
            const totalMissions = new Set(meData.map((r: any) => r.mission_id)).size;
            _missionsSinceMaintenance = Math.max(0, totalMissions - (item.missions_at_last_maintenance ?? 0));
          }
        }
        return { ...item, _missionsSinceMaintenance };
      }));

      setEquipment(equipmentWithMissions);
      if (companyId) setCachedData(`offline_equipment_${companyId}`, equipmentWithMissions);
    } catch (err) {
      console.error("Error fetching equipment:", err);
      toast.error(t('resources.couldNotLoadEquipment'));
    }
  };

  const fetchDronetags = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<any[]>(`offline_dronetags_${companyId}`);
      if (cached) setDronetags(cached);
    }
    // 2. Skip network if offline
    if (!navigator.onLine) return;
    // 3. Fetch fresh data
    try {
      const { data, error } = await supabase
        .from("dronetag_devices")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setDronetags(data || []);
      if (companyId) setCachedData(`offline_dronetags_${companyId}`, data || []);
    } catch (err) {
      console.error("Error fetching dronetags:", err);
    }
  };

  const fetchPersonnel = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<any[]>(`offline_personnel_${companyId}`);
      if (cached) setPersonnel(cached);
    }
    // 2. Skip network if offline
    if (!navigator.onLine) return;
    // 3. Fetch fresh data
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, personnel_competencies(*), companies(navn)")
        .eq("approved", true)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setPersonnel(data || []);
      if (companyId) setCachedData(`offline_personnel_${companyId}`, data || []);
    } catch (err) {
      console.error("Error fetching personnel:", err);
      toast.error(t('resources.couldNotLoadPersonnel'));
    }
  };
  const fetchPendingCourses = async () => {
    if (!navigator.onLine) return;
    try {
      // Get all published available_to_all courses
      const { data: allCourses } = await supabase
        .from("training_courses")
        .select("id")
        .eq("status", "published")
        .eq("available_to_all", true);
      const allCourseIds = (allCourses || []).map((c: any) => c.id);

      // Get all assignments (pending + completed)
      const { data: assignments } = await supabase
        .from("training_assignments")
        .select("profile_id, course_id, completed_at, passed");

      // Build counts per person
      const counts: Record<string, number> = {};
      
      // Count pending assignments per person
      (assignments || []).forEach((a: any) => {
        if (!a.completed_at) {
          counts[a.profile_id] = (counts[a.profile_id] || 0) + 1;
        }
      });

      // Count available_to_all courses not yet completed by each person in personnel
      if (allCourseIds.length > 0) {
        const completedByPerson: Record<string, Set<string>> = {};
        (assignments || []).forEach((a: any) => {
          if (a.passed) {
            if (!completedByPerson[a.profile_id]) completedByPerson[a.profile_id] = new Set();
            completedByPerson[a.profile_id].add(a.course_id);
          }
        });
        
        personnel.forEach((p: any) => {
          const completed = completedByPerson[p.id] || new Set();
          const pending = allCourseIds.filter((id: string) => !completed.has(id)).length;
          // Add to existing count (avoiding double-counting assigned ones)
          const assignedPending = (assignments || []).filter((a: any) => a.profile_id === p.id && !a.completed_at).map((a: any) => a.course_id);
          const additionalFromAll = allCourseIds.filter((id: string) => !completed.has(id) && !assignedPending.includes(id)).length;
          counts[p.id] = (counts[p.id] || 0) + additionalFromAll;
        });
      }

      setPendingCourseCounts(counts);
    } catch (err) {
      console.error("Error fetching pending courses:", err);
    }
  };



  // Compute unique categories for filters
  const uniqueDroneModels = [...new Set(drones.map(d => d.modell).filter(Boolean))].sort();
  const uniqueEquipmentTypes = [...new Set(equipment.map(e => e.type).filter(Boolean))].sort();
  const uniquePersonnelRoles = [...new Set(personnel.map(p => p.tittel).filter(Boolean))].sort();

  const getDronePersonnelNames = (drone: any): string[] =>
    (drone.drone_personnel || [])
      .map((link: any) => link.profile?.full_name)
      .filter(Boolean);

  const getDronePilotLabel = (drone: any): string | null => {
    const names = getDronePersonnelNames(drone);
    if (names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  };

  const matchesDroneSearch = (drone: any, searchLower: string): boolean => {
    const personnelNames = getDronePersonnelNames(drone).join(" ").toLowerCase();
    return Boolean(
      drone.modell?.toLowerCase().includes(searchLower) ||
      drone.registrering?.toLowerCase().includes(searchLower) ||
      drone.registration_number?.toLowerCase().includes(searchLower) ||
      drone.merknader?.toLowerCase().includes(searchLower) ||
      personnelNames.includes(searchLower)
    );
  };

  // Helper to get person's worst competency status
  const getPersonStatus = (person: any): string => {
    if (!person.personnel_competencies || person.personnel_competencies.length === 0) return "Grønn";
    let worst = "Grønn";
    for (const comp of person.personnel_competencies) {
      if (!comp.utloper_dato) continue;
      const expiry = new Date(comp.utloper_dato);
      const now = new Date();
      if (expiry < now) return "Rød";
      const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (expiry < warningDate) worst = "Gul";
    }
    return worst;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-4 sm:py-6 flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0 lg:flex-1 lg:items-stretch lg:overflow-hidden">
            {/* Droner/Fly Section */}
            <GlassCard className="lg:flex lg:flex-col lg:h-full lg:overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{terminology.vehicles}</h2>
                </div>
                <Button onClick={() => setDroneDialogOpen(true)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  {t('actions.add')}
                </Button>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Søk etter ${terminology.vehicleLower}modell eller registrering...`}
                  value={droneSearch}
                  onChange={(e) => setDroneSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 mb-4">
                <Select value={droneModelFilter} onValueChange={setDroneModelFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Modell" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle modeller</SelectItem>
                    {uniqueDroneModels.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={droneStatusFilter} onValueChange={setDroneStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-[100px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle</SelectItem>
                    <SelectItem value="Grønn">🟢 Grønn</SelectItem>
                    <SelectItem value="Gul">🟡 Gul</SelectItem>
                    <SelectItem value="Rød">🔴 Rød</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={droneSortBy} onValueChange={(v) => setDroneSortBy(v as "default" | "last_flown")}>
                  <SelectTrigger className="h-8 text-xs w-[120px]">
                    <SelectValue placeholder="Sortering" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Standard</SelectItem>
                    <SelectItem value="last_flown">Sist flydd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3 max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto pr-1">
                {drones
                  .filter((drone) => {
                    if (droneSearch) {
                      const searchLower = droneSearch.toLowerCase();
                      if (!matchesDroneSearch(drone, searchLower)) return false;
                    }
                    if (droneModelFilter !== "alle" && drone.modell !== droneModelFilter) return false;
                    if (droneStatusFilter !== "alle") {
                      const status = drone._aggregatedStatus || calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14);
                      if (status !== droneStatusFilter) return false;
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    if (droneSortBy === "last_flown") {
                      if (!a.last_flown && !b.last_flown) return 0;
                      if (!a.last_flown) return 1;
                      if (!b.last_flown) return -1;
                      return new Date(b.last_flown).getTime() - new Date(a.last_flown).getTime();
                    }
                    return 0;
                  })
                  .map((drone) => (
                  <div 
                    key={drone.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 hover:bg-background/70"
                    onClick={() => {
                      setSelectedDrone(drone);
                      setDroneDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <h3 className="font-semibold">{drone.modell}</h3>
                        {getDronePilotLabel(drone) && (
                          <p className="text-sm text-muted-foreground truncate">Pilot: {getDronePilotLabel(drone)}</p>
                        )}
                        {drone.registration_number && (
                          <p className="text-sm text-muted-foreground">Reg.nr: {drone.registration_number}</p>
                        )}
                        {drone.company_id !== companyId && drone.companies?.navn && (
                          <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                            <Building2 className="w-3 h-3" />
                            {drone.companies.navn}
                          </Badge>
                        )}
                      </div>
                      <StatusBadge status={(drone._aggregatedStatus || calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14)) as Status} />
                    </div>
                    <div className="text-sm space-y-1">
                      <p>Sist flydd: {drone.last_flown ? format(new Date(drone.last_flown), "dd.MM.yyyy") : "–"}</p>
                      <p>{t('flight.flightHours')}: {drone.flyvetimer}</p>
                      {drone.neste_inspeksjon && (
                        <p>{t('flight.nextInspection')}: {format(new Date(drone.neste_inspeksjon), "dd.MM.yyyy")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {drones.filter((drone) => {
                    if (droneSearch) {
                      const searchLower = droneSearch.toLowerCase();
                      if (!matchesDroneSearch(drone, searchLower)) return false;
                    }
                    if (droneModelFilter !== "alle" && drone.modell !== droneModelFilter) return false;
                    if (droneStatusFilter !== "alle" && (drone._aggregatedStatus || calculateMaintenanceStatus(drone.neste_inspeksjon, drone.varsel_dager ?? 14)) !== droneStatusFilter) return false;
                    return true;
                }).length === 0 && (droneSearch || droneModelFilter !== "alle" || droneStatusFilter !== "alle") && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff med valgte filtre
                  </p>
                )}
                {drones.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {terminology.noVehicles}
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Utstyr Section */}
            <GlassCard className="lg:flex lg:flex-col lg:h-full lg:overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('resources.equipment')}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setEquipmentDialogOpen(true)} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    {t('actions.add')}
                  </Button>
                  <Button onClick={() => setDronetagDialogOpen(true)} size="sm" variant="outline" className="gap-1">
                    <Radio className="w-4 h-4" />
                    DroneTag
                  </Button>
                </div>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('resources.searchEquipment')}
                  value={equipmentSearch}
                  onChange={(e) => setEquipmentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 mb-4">
                <Select value={equipmentTypeFilter} onValueChange={setEquipmentTypeFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle kategorier</SelectItem>
                    {uniqueEquipmentTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    {dronetags.length > 0 && <SelectItem value="__dronetag__">DroneTag</SelectItem>}
                  </SelectContent>
                </Select>
                <Select value={equipmentStatusFilter} onValueChange={setEquipmentStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-[100px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle</SelectItem>
                    <SelectItem value="Grønn">🟢 Grønn</SelectItem>
                    <SelectItem value="Gul">🟡 Gul</SelectItem>
                    <SelectItem value="Rød">🔴 Rød</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3 max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto pr-1">
                {equipmentTypeFilter !== "__dronetag__" && equipment
                  .filter((item) => {
                    if (equipmentSearch) {
                      const searchLower = equipmentSearch.toLowerCase();
                      if (!(
                        item.navn?.toLowerCase().includes(searchLower) ||
                        item.type?.toLowerCase().includes(searchLower) ||
                        item.serienummer?.toLowerCase().includes(searchLower) ||
                        item.merknader?.toLowerCase().includes(searchLower)
                      )) return false;
                    }
                    if (equipmentTypeFilter !== "alle" && item.type !== equipmentTypeFilter) return false;
                    if (equipmentStatusFilter !== "alle") {
                      const eqStatus = calculateEquipmentMaintenanceStatus({
                        neste_vedlikehold: item.neste_vedlikehold,
                        varsel_dager: item.varsel_dager,
                        flyvetimer: item.flyvetimer ?? 0,
                        hours_at_last_maintenance: item.hours_at_last_maintenance ?? 0,
                        inspection_interval_hours: item.inspection_interval_hours,
                        varsel_timer: item.varsel_timer,
                        missions_since_maintenance: item._missionsSinceMaintenance ?? 0,
                        inspection_interval_missions: item.inspection_interval_missions,
                        varsel_oppdrag: item.varsel_oppdrag,
                      });
                      const status = worstStatus(eqStatus, (item.status as Status) || "Grønn");
                      if (status !== equipmentStatusFilter) return false;
                    }
                    return true;
                  })
                  .map((item) => (
                  <div 
                    key={item.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 hover:bg-background/70"
                    onClick={() => {
                      setSelectedEquipment(item);
                      setEquipmentDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{item.navn}</h3>
                        <p className="text-sm text-muted-foreground">{item.type}</p>
                        {item.company_id !== companyId && item.companies?.navn && (
                          <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                            <Building2 className="w-3 h-3" />
                            {item.companies.navn}
                          </Badge>
                        )}
                      </div>
                      <StatusBadge status={worstStatus(calculateEquipmentMaintenanceStatus({
                        neste_vedlikehold: item.neste_vedlikehold,
                        varsel_dager: item.varsel_dager,
                        flyvetimer: item.flyvetimer ?? 0,
                        hours_at_last_maintenance: item.hours_at_last_maintenance ?? 0,
                        inspection_interval_hours: item.inspection_interval_hours,
                        varsel_timer: item.varsel_timer,
                        missions_since_maintenance: item._missionsSinceMaintenance ?? 0,
                        inspection_interval_missions: item.inspection_interval_missions,
                        varsel_oppdrag: item.varsel_oppdrag,
                      }), (item.status as Status) || "Grønn")} />
                    </div>
                    <div className="text-sm space-y-1">
                      <p>SN: {item.serienummer}</p>
                      {item.neste_vedlikehold && (
                        <p>{t('flight.nextMaintenance')}: {format(new Date(item.neste_vedlikehold), "dd.MM.yyyy")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {equipment.filter((item) => {
                    if (equipmentSearch) {
                      const searchLower = equipmentSearch.toLowerCase();
                      if (!(item.navn?.toLowerCase().includes(searchLower) || item.type?.toLowerCase().includes(searchLower) || item.serienummer?.toLowerCase().includes(searchLower) || item.merknader?.toLowerCase().includes(searchLower))) return false;
                    }
                    if (equipmentTypeFilter !== "alle" && item.type !== equipmentTypeFilter) return false;
                    if (equipmentStatusFilter !== "alle" && worstStatus(calculateEquipmentMaintenanceStatus({
                      neste_vedlikehold: item.neste_vedlikehold,
                      varsel_dager: item.varsel_dager,
                      flyvetimer: item.flyvetimer ?? 0,
                      hours_at_last_maintenance: item.hours_at_last_maintenance ?? 0,
                      inspection_interval_hours: item.inspection_interval_hours,
                      varsel_timer: item.varsel_timer,
                      missions_since_maintenance: item._missionsSinceMaintenance ?? 0,
                      inspection_interval_missions: item.inspection_interval_missions,
                      varsel_oppdrag: item.varsel_oppdrag,
                    }), (item.status as Status) || "Grønn") !== equipmentStatusFilter) return false;
                    return true;
                }).length === 0 && (equipmentSearch || equipmentTypeFilter !== "alle" || equipmentStatusFilter !== "alle") && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff med valgte filtre
                  </p>
                )}
                {equipment.length === 0 && dronetags.length === 0 && !equipmentSearch && equipmentTypeFilter === "alle" && equipmentStatusFilter === "alle" && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('resources.noEquipment')}
                  </p>
                )}

                {/* DroneTag devices - hidden when filtering by other category or status */}
                {(equipmentTypeFilter === "alle" || equipmentTypeFilter === "__dronetag__") && equipmentStatusFilter === "alle" && dronetags
                  .filter((item) => {
                    if (!equipmentSearch) return true;
                    const searchLower = equipmentSearch.toLowerCase();
                    return (
                      item.name?.toLowerCase().includes(searchLower) ||
                      item.callsign?.toLowerCase().includes(searchLower) ||
                      item.device_id?.toLowerCase().includes(searchLower)
                    );
                  })
                  .map((item) => (
                  <div 
                    key={`dronetag-${item.id}`}
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 hover:bg-background/70"
                    onClick={() => {
                      setSelectedDronetag(item);
                      setDronetagDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {item.name || item.device_id}
                          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">DroneTag</span>
                        </h3>
                        {item.callsign && (
                          <p className="text-sm text-muted-foreground">Callsign: {item.callsign}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>SN: {item.device_id}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Personell Section */}
            <GlassCard className="lg:flex lg:flex-col lg:h-full lg:overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('resources.personnel')}</h2>
                </div>
                <Button
                  onClick={() => setPersonnelDialogOpen(true)}
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t('resources.addCompetency')}
                </Button>
              </div>
              
              {/* Search field */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('resources.searchPersonnel')}
                  value={personnelSearch}
                  onChange={(e) => setPersonnelSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 mb-4">
                <Select value={personnelRoleFilter} onValueChange={setPersonnelRoleFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Rolle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle roller</SelectItem>
                    {uniquePersonnelRoles.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={personnelStatusFilter} onValueChange={setPersonnelStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-[100px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle</SelectItem>
                    <SelectItem value="Grønn">🟢 Grønn</SelectItem>
                    <SelectItem value="Gul">🟡 Gul</SelectItem>
                    <SelectItem value="Rød">🔴 Rød</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3 max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto pr-1">
                {personnel
                  .filter((person) => {
                    if (personnelSearch) {
                      const searchLower = personnelSearch.toLowerCase();
                      const nameMatch = person.full_name?.toLowerCase().includes(searchLower);
                      const competencyMatch = person.personnel_competencies?.some((comp: any) =>
                        comp.navn?.toLowerCase().includes(searchLower) ||
                        comp.type?.toLowerCase().includes(searchLower)
                      );
                      if (!nameMatch && !competencyMatch) return false;
                    }
                    if (personnelRoleFilter !== "alle" && person.tittel !== personnelRoleFilter) return false;
                    if (personnelStatusFilter !== "alle" && getPersonStatus(person) !== personnelStatusFilter) return false;
                    return true;
                  })
                  .map((person) => (
                  <div 
                    key={person.id} 
                    className="p-3 bg-background/50 rounded-lg border border-border cursor-pointer hover:bg-accent/20 hover:border-accent transition-all duration-200 min-w-0 overflow-hidden"
                    onClick={() => {
                      setSelectedPerson(person);
                      setPersonCompetencyDialogOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={person.avatar_url || ""} />
                          <AvatarFallback>
                            {person.full_name?.charAt(0) || person.email?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <OnlineIndicator 
                          isOnline={isOnline(person.id)} 
                          className="absolute -bottom-0.5 -right-0.5"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {person.full_name || t('common.unknownName')}
                        </h3>
                        {person.tittel && (
                          <p className="text-xs text-muted-foreground truncate">{person.tittel}</p>
                        )}
                        {person.company_id !== companyId && person.companies?.navn && (
                          <Badge variant="secondary" className="mt-0.5 gap-1 text-xs">
                            <Building2 className="w-3 h-3" />
                            {person.companies.navn}
                          </Badge>
                        )}
                        {(pendingCourseCounts[person.id] || 0) > 0 && (
                          <Badge variant="outline" className="mt-0.5 gap-1 text-xs border-primary/50 text-primary">
                            <GraduationCap className="w-3 h-3" />
                            {pendingCourseCounts[person.id]} kurs
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Competencies - compact mobile layout */}
                    {person.personnel_competencies && person.personnel_competencies.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="flex flex-wrap gap-1.5">
                          {person.personnel_competencies.slice(0, 3).map((comp: any) => {
                            const isExpired = comp.utloper_dato && new Date(comp.utloper_dato) < new Date();
                            const isExpiringSoon = comp.utloper_dato && 
                              new Date(comp.utloper_dato) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                              !isExpired;
                            
                            return (
                              <span 
                                key={comp.id} 
                                className={`text-xs px-2 py-0.5 rounded-full truncate max-w-[140px] inline-flex items-center gap-1 ${
                                  isExpired 
                                    ? 'bg-destructive/20 text-destructive' 
                                    : isExpiringSoon
                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                    : 'bg-primary/10 text-primary'
                                }`}
                              >
                                {comp.fil_url && <Paperclip className="h-3 w-3 shrink-0" />}
                                {comp.navn}
                              </span>
                            );
                          })}
                          {person.personnel_competencies.length > 3 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              +{person.personnel_competencies.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {(!person.personnel_competencies || person.personnel_competencies.length === 0) && (
                      <p className="text-xs text-muted-foreground mt-2">{t('resources.noCompetencies')}</p>
                    )}
                  </div>
                ))}
                {personnel.filter((person) => {
                    if (personnelSearch) {
                      const searchLower = personnelSearch.toLowerCase();
                      const nameMatch = person.full_name?.toLowerCase().includes(searchLower);
                      const competencyMatch = person.personnel_competencies?.some((comp: any) =>
                        comp.navn?.toLowerCase().includes(searchLower) || comp.type?.toLowerCase().includes(searchLower)
                      );
                      if (!nameMatch && !competencyMatch) return false;
                    }
                    if (personnelRoleFilter !== "alle" && person.tittel !== personnelRoleFilter) return false;
                    if (personnelStatusFilter !== "alle" && getPersonStatus(person) !== personnelStatusFilter) return false;
                    return true;
                }).length === 0 && (personnelSearch || personnelRoleFilter !== "alle" || personnelStatusFilter !== "alle") && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen treff med valgte filtre
                  </p>
                )}
                {personnel.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('resources.noPersonnel')}
                  </p>
                )}
              </div>
            </GlassCard>
          </div>
        </main>
      </div>

      <AddDroneDialog 
        open={droneDialogOpen} 
        onOpenChange={setDroneDialogOpen}
        onDroneAdded={fetchDrones}
        userId={user?.id!}
      />

      <AddEquipmentDialog
        open={equipmentDialogOpen}
        onOpenChange={setEquipmentDialogOpen}
        onEquipmentAdded={fetchEquipment}
        userId={user?.id!}
      />

      <AddCompetencyDialog
        open={personnelDialogOpen}
        onOpenChange={setPersonnelDialogOpen}
        onCompetencyAdded={fetchPersonnel}
        personnel={personnel}
      />

      <PersonCompetencyDialog
        open={personCompetencyDialogOpen}
        onOpenChange={setPersonCompetencyDialogOpen}
        person={selectedPerson}
        onCompetencyUpdated={fetchPersonnel}
      />

      <DroneDetailDialog
        open={droneDetailOpen}
        onOpenChange={setDroneDetailOpen}
        drone={selectedDrone}
        onDroneUpdated={() => fetchDrones(true)}
      />

      <EquipmentDetailDialog
        open={equipmentDetailOpen}
        onOpenChange={setEquipmentDetailOpen}
        equipment={selectedEquipment}
        onEquipmentUpdated={fetchEquipment}
      />

      <AddDronetagDialog
        open={dronetagDialogOpen}
        onOpenChange={setDronetagDialogOpen}
        onDronetagCreated={fetchDronetags}
      />

      <DronetagDetailDialog
        open={dronetagDetailOpen}
        onOpenChange={setDronetagDetailOpen}
        dronetag={selectedDronetag}
        onDronetagUpdated={fetchDronetags}
      />
    </div>
  );
};

export default Resources;
