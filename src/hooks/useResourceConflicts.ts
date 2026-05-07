import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isSameDay } from "date-fns";

export interface ResourceConflict {
  resourceId: string;
  resourceType: 'drone' | 'equipment' | 'personnel';
  resourceName: string;
  conflictType: 'overlap' | 'same_day';
  conflictingMission: {
    id: string;
    tittel: string;
    tidspunkt: string;
    slutt_tidspunkt?: string;
  };
}

interface MissionWithResources {
  id: string;
  tittel: string;
  tidspunkt: string;
  slutt_tidspunkt?: string;
  status: string;
  personnel: { profile_id: string; profiles?: { full_name: string } }[];
  drones: { drone_id: string; drones?: { modell: string; serienummer: string } }[];
  equipment: { equipment_id: string; equipment?: { navn: string; type: string } }[];
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours default

const checkTimeOverlap = (
  mission1Start: Date,
  mission1End: Date | null,
  mission2Start: Date,
  mission2End: Date | null
): 'overlap' | 'same_day' | null => {
  const m1Start = mission1Start;
  const m1End = mission1End || new Date(m1Start.getTime() + DEFAULT_DURATION_MS);
  const m2Start = mission2Start;
  const m2End = mission2End || new Date(m2Start.getTime() + DEFAULT_DURATION_MS);

  // Check overlap
  if (m1Start < m2End && m1End > m2Start) {
    return 'overlap';
  }

  // Check same day
  if (isSameDay(m1Start, m2Start)) {
    return 'same_day';
  }

  return null;
};

export const useResourceConflicts = (
  missionId: string | undefined,
  missionTime: string | undefined,
  missionEndTime: string | undefined,
  selectedDrones: string[],
  selectedEquipment: string[],
  selectedPersonnel: string[]
) => {
  const [allMissions, setAllMissions] = useState<MissionWithResources[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMissionsWithResources = useCallback(async () => {
    if (!missionTime) return;
    
    setLoading(true);
    try {
      // Fetch all active missions (not completed/cancelled)
      const { data: missions, error } = await supabase
        .from("missions")
        .select("id, tittel, tidspunkt, slutt_tidspunkt, status")
        .in("status", ["Planlagt", "Pågående"]);

      if (error) throw error;

      // Fetch resources for each mission
      const missionsWithDetails = await Promise.all(
        (missions || []).map(async (mission) => {
          const [personnel, drones, equipment] = await Promise.all([
            supabase
              .from("mission_personnel")
              .select("profile_id, profiles(full_name)")
              .eq("mission_id", mission.id),
            supabase
              .from("mission_drones")
              .select("drone_id, drones(modell, serienummer)")
              .eq("mission_id", mission.id),
            supabase
              .from("mission_equipment")
              .select("equipment_id, equipment(navn, type)")
              .eq("mission_id", mission.id),
          ]);

          return {
            ...mission,
            personnel: personnel.data || [],
            drones: drones.data || [],
            equipment: equipment.data || [],
          };
        })
      );

      setAllMissions(missionsWithDetails);
    } catch (error) {
      console.error("Error fetching missions for conflict check:", error);
    } finally {
      setLoading(false);
    }
  }, [missionTime]);

  useEffect(() => {
    fetchMissionsWithResources();
  }, [fetchMissionsWithResources]);

  const conflicts = useMemo((): ResourceConflict[] => {
    if (!missionTime || allMissions.length === 0) return [];

    const currentStart = new Date(missionTime);
    const currentEnd = missionEndTime ? new Date(missionEndTime) : null;
    const result: ResourceConflict[] = [];

    // Filter out current mission if editing
    const otherMissions = allMissions.filter((m) => m.id !== missionId);

    for (const mission of otherMissions) {
      if (!mission.tidspunkt) continue;
      const mStart = new Date(mission.tidspunkt);
      const mEnd = mission.slutt_tidspunkt ? new Date(mission.slutt_tidspunkt) : null;
      const conflictType = checkTimeOverlap(currentStart, currentEnd, mStart, mEnd);

      if (!conflictType) continue;

      // Check drone conflicts
      for (const droneId of selectedDrones) {
        const missionDrone = mission.drones.find((d: any) => d.drone_id === droneId);
        if (missionDrone) {
          result.push({
            resourceId: droneId,
            resourceType: 'drone',
            resourceName: missionDrone.drones?.modell || 'Ukjent drone',
            conflictType,
            conflictingMission: {
              id: mission.id,
              tittel: mission.tittel,
              tidspunkt: mission.tidspunkt,
              slutt_tidspunkt: mission.slutt_tidspunkt,
            },
          });
        }
      }

      // Check equipment conflicts
      for (const equipmentId of selectedEquipment) {
        const missionEquipment = mission.equipment.find((e: any) => e.equipment_id === equipmentId);
        if (missionEquipment) {
          result.push({
            resourceId: equipmentId,
            resourceType: 'equipment',
            resourceName: missionEquipment.equipment?.navn || 'Ukjent utstyr',
            conflictType,
            conflictingMission: {
              id: mission.id,
              tittel: mission.tittel,
              tidspunkt: mission.tidspunkt,
              slutt_tidspunkt: mission.slutt_tidspunkt,
            },
          });
        }
      }

      // Check personnel conflicts
      for (const personnelId of selectedPersonnel) {
        const missionPersonnel = mission.personnel.find((p: any) => p.profile_id === personnelId);
        if (missionPersonnel) {
          result.push({
            resourceId: personnelId,
            resourceType: 'personnel',
            resourceName: missionPersonnel.profiles?.full_name || 'Ukjent person',
            conflictType,
            conflictingMission: {
              id: mission.id,
              tittel: mission.tittel,
              tidspunkt: mission.tidspunkt,
              slutt_tidspunkt: mission.slutt_tidspunkt,
            },
          });
        }
      }
    }

    return result;
  }, [allMissions, missionId, missionTime, missionEndTime, selectedDrones, selectedEquipment, selectedPersonnel]);

  return { conflicts, loading, allMissions };
};

// Utility function for checking conflicts in Oppdrag.tsx
export const getResourceConflictsForMission = (
  missionId: string,
  missionTime: string,
  missionEndTime: string | undefined,
  resourceId: string,
  resourceType: 'drone' | 'equipment' | 'personnel',
  allMissions: MissionWithResources[]
): ResourceConflict[] => {
  if (!missionTime || allMissions.length === 0) return [];

  const currentStart = new Date(missionTime);
  const currentEnd = missionEndTime ? new Date(missionEndTime) : null;
  const result: ResourceConflict[] = [];

  const otherMissions = allMissions.filter((m) => m.id !== missionId);

  for (const mission of otherMissions) {
    if (!mission.tidspunkt) continue;
    const mStart = new Date(mission.tidspunkt);
    const mEnd = mission.slutt_tidspunkt ? new Date(mission.slutt_tidspunkt) : null;
    const conflictType = checkTimeOverlap(currentStart, currentEnd, mStart, mEnd);

    if (!conflictType) continue;

    if (resourceType === 'drone') {
      const missionDrone = mission.drones.find((d: any) => d.drone_id === resourceId);
      if (missionDrone) {
        result.push({
          resourceId,
          resourceType,
          resourceName: missionDrone.drones?.modell || 'Ukjent drone',
          conflictType,
          conflictingMission: {
            id: mission.id,
            tittel: mission.tittel,
            tidspunkt: mission.tidspunkt,
            slutt_tidspunkt: mission.slutt_tidspunkt,
          },
        });
      }
    } else if (resourceType === 'equipment') {
      const missionEquipment = mission.equipment.find((e: any) => e.equipment_id === resourceId);
      if (missionEquipment) {
        result.push({
          resourceId,
          resourceType,
          resourceName: missionEquipment.equipment?.navn || 'Ukjent utstyr',
          conflictType,
          conflictingMission: {
            id: mission.id,
            tittel: mission.tittel,
            tidspunkt: mission.tidspunkt,
            slutt_tidspunkt: mission.slutt_tidspunkt,
          },
        });
      }
    } else if (resourceType === 'personnel') {
      const missionPersonnel = mission.personnel.find((p: any) => p.profile_id === resourceId);
      if (missionPersonnel) {
        result.push({
          resourceId,
          resourceType,
          resourceName: missionPersonnel.profiles?.full_name || 'Ukjent person',
          conflictType,
          conflictingMission: {
            id: mission.id,
            tittel: mission.tittel,
            tidspunkt: mission.tidspunkt,
            slutt_tidspunkt: mission.slutt_tidspunkt,
          },
        });
      }
    }
  }

  return result;
};
