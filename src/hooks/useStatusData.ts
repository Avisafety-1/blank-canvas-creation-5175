import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Status } from "@/types";
import { calculateMaintenanceStatus, calculateDroneAggregatedStatus, calculateEquipmentMaintenanceStatus, calculatePersonnelAggregatedStatus, worstStatus } from "@/lib/maintenanceStatus";

interface StatusCounts {
  Grønn: number;
  Gul: number;
  Rød: number;
}

const countByStatus = (items: { status: Status }[]): StatusCounts => {
  return items.reduce((acc, item) => {
    acc[item.status]++;
    return acc;
  }, { Grønn: 0, Gul: 0, Rød: 0 });
};

const fetchDrones = async () => {
  // Single query with nested selects — PostgREST joins server-side.
  const { data: dronesData, error } = await supabase
    .from("drones")
    .select(`
      *,
      companies(navn),
      drone_accessories(drone_id, neste_vedlikehold, varsel_dager),
      drone_equipment(drone_id, equipment:equipment_id(id, neste_vedlikehold, varsel_dager))
    `)
    .eq("aktiv", true);

  if (error || !dronesData) {
    throw error;
  }

  const { countUniqueMissionsSinceInspection } = await import("@/lib/droneInspection");

  // Fetch last flown dates
  const droneIds = (dronesData || []).map((d: any) => d.id);
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

  const dronesWithMissions = await Promise.all(dronesData.map(async (drone: any) => {
    const accessories = drone.drone_accessories || [];
    const linkedEquipment = (drone.drone_equipment || [])
      .map((link: any) => link.equipment)
      .filter(Boolean);

    let missionsSinceInspection = 0;
    if (drone.inspection_interval_missions) {
      missionsSinceInspection = await countUniqueMissionsSinceInspection(drone.id, drone.sist_inspeksjon);
    }

    const { status } = calculateDroneAggregatedStatus(
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
      linkedEquipment
    );

    const dbStatus = (drone.status as Status) || "Grønn";
    return { ...drone, status: worstStatus(status, dbStatus), last_flown: lastFlownMap[drone.id] || null };
  }));

  return dronesWithMissions;
};

const fetchEquipment = async () => {
  const { data, error } = await supabase
    .from("equipment")
    .select("*, companies(navn)")
    .eq("aktiv", true);
  
  if (error || !data) {
    throw error;
  }

  // Count missions for equipment that has mission-based intervals
  const equipmentWithMissions = await Promise.all(data.map(async (item: any) => {
    let missionsSinceMaintenance = 0;

    if (item.inspection_interval_missions) {
      // Count missions via mission_equipment since last maintenance
      const { data: meData } = await supabase
        .from("mission_equipment")
        .select("mission_id")
        .eq("equipment_id", item.id);

      if (meData) {
        const totalMissions = new Set(meData.map((r: any) => r.mission_id)).size;
        missionsSinceMaintenance = totalMissions - (item.missions_at_last_maintenance ?? 0);
        if (missionsSinceMaintenance < 0) missionsSinceMaintenance = 0;
      }
    }

    const maintenanceStatus = calculateEquipmentMaintenanceStatus({
      neste_vedlikehold: item.neste_vedlikehold,
      varsel_dager: item.varsel_dager,
      flyvetimer: item.flyvetimer ?? 0,
      hours_at_last_maintenance: item.hours_at_last_maintenance ?? 0,
      inspection_interval_hours: item.inspection_interval_hours,
      varsel_timer: item.varsel_timer,
      missions_since_maintenance: missionsSinceMaintenance,
      inspection_interval_missions: item.inspection_interval_missions,
      varsel_oppdrag: item.varsel_oppdrag,
    });

    const dbStatus = (item.status as Status) || "Grønn";
    return { ...item, status: worstStatus(maintenanceStatus, dbStatus) };
  }));

  return equipmentWithMissions;
};

const fetchPersonnel = async (companyId: string, userId: string) => {
  const { data: companyIds } = await supabase
    .rpc("get_user_visible_company_ids", { _user_id: userId });

  const visibleIds = companyIds?.length ? companyIds : [companyId];

  const { data, error } = await supabase
    .from("profiles")
    .select("*, personnel_competencies(*), companies(navn)")
    .eq("approved", true)
    .in("company_id", visibleIds);
  
  if (error || !data) {
    throw error;
  }

  return data.map(profile => ({
    ...profile,
    status: calculatePersonnelAggregatedStatus(
      profile.personnel_competencies || [],
      30
    )
  }));
};

export const useStatusData = () => {
  const { user, companyId } = useAuth();

  const results = useQueries({
    queries: [
      {
        queryKey: ['drones', companyId],
        queryFn: fetchDrones,
        enabled: !!user,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['equipment', companyId],
        queryFn: fetchEquipment,
        enabled: !!user,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['personnel', companyId, user?.id],
        queryFn: () => fetchPersonnel(companyId!, user!.id),
        enabled: !!user && !!companyId,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
    ],
  });

  const [dronesResult, equipmentResult, personnelResult] = results;

  const isLoading = dronesResult.isLoading || equipmentResult.isLoading || personnelResult.isLoading;
  const drones = dronesResult.data || [];
  const equipment = equipmentResult.data || [];
  const personnel = personnelResult.data || [];

  return {
    isLoading,
    drones,
    equipment,
    personnel,
    droneStatus: countByStatus(drones),
    equipmentStatus: countByStatus(equipment),
    personnelStatus: countByStatus(personnel),
    refetchDrones: dronesResult.refetch,
    refetchEquipment: equipmentResult.refetch,
    refetchPersonnel: personnelResult.refetch,
  };
};
