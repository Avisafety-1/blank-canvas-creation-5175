import { Status } from "@/types";

/**
 * Calculates maintenance/inspection status based on the next maintenance date.
 * 
 * @param nextMaintenanceDate - The next scheduled maintenance/inspection date
 * @param warningDays - Number of days before the date to show "Gul" status (default: 14)
 * @returns "Grønn" | "Gul" | "Rød"
 * 
 * Logic:
 * - Rød: Date has passed (overdue)
 * - Gul: Within warningDays of the date (approaching)
 * - Grønn: More than warningDays away or no date set
 */
export const calculateMaintenanceStatus = (
  nextMaintenanceDate: Date | string | null | undefined,
  warningDays: number = 14
): Status => {
  if (!nextMaintenanceDate) return "Grønn"; // No date set = OK
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextDate = new Date(nextMaintenanceDate);
  nextDate.setHours(0, 0, 0, 0);
  
  const daysUntil = Math.floor((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return "Rød";           // Overdue
  if (daysUntil <= warningDays) return "Gul"; // Approaching
  return "Grønn";                             // OK
};

/**
 * Gets status color classes based on calculated status
 */
export const getStatusColorClasses = (status: Status): string => {
  const colors: Record<Status, string> = {
    Grønn: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
    Gul: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
    Rød: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
  };
  return colors[status] || "";
};

/**
 * Status priority for comparison
 */
export const STATUS_PRIORITY: Record<Status, number> = {
  "Rød": 2,
  "Gul": 1,
  "Grønn": 0,
};

/**
 * Returns the worst (highest priority) of two statuses.
 */
export const worstStatus = (a: Status, b: Status): Status => {
  return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
};

/**
 * Interface for competencies with expiry dates and status flag
 */
interface CompetencyItem {
  utloper_dato?: string | null;
  påvirker_status?: boolean;
  varsel_dager?: number | null;
}

/**
 * Calculates aggregated status for a person based on their competencies.
 * Only considers competencies where påvirker_status is true.
 * 
 * @param competencies - Array of competencies with expiry dates and påvirker_status flag
 * @param warningDays - Number of days before expiry to show "Gul" status (default: 30)
 * @returns Status ("Grønn" | "Gul" | "Rød")
 */
export const calculatePersonnelAggregatedStatus = (
  competencies: CompetencyItem[],
  warningDays: number = 30
): Status => {
  // Filter only competencies that affect status
  const relevantCompetencies = competencies.filter(c => c.påvirker_status !== false);
  
  if (relevantCompetencies.length === 0) {
    return "Grønn"; // No relevant competencies = OK
  }
  
  let worstPriority = 0;
  
  for (const comp of relevantCompetencies) {
    if (!comp.utloper_dato) continue; // No expiry date = OK for this competency
    
    const effectiveWarningDays = comp.varsel_dager ?? warningDays;
    const status = calculateMaintenanceStatus(comp.utloper_dato, effectiveWarningDays);
    const priority = STATUS_PRIORITY[status];
    worstPriority = Math.max(worstPriority, priority);
  }
  
  // Find the status with matching priority
  const status = (Object.entries(STATUS_PRIORITY).find(
    ([_, priority]) => priority === worstPriority
  )?.[0] || "Grønn") as Status;
  
  return status;
};

/**
 * Calculates status based on a usage-based interval (hours or missions).
 * Rød: usage >= limit, Gul: usage >= limit * warningRatio, Grønn: otherwise.
 */
export const calculateUsageStatus = (
  currentUsage: number,
  limit: number | null | undefined,
  warningMargin?: number | null
): Status => {
  if (!limit || limit <= 0) return "Grønn";
  if (currentUsage >= limit) return "Rød";
  // Use absolute margin if provided, otherwise fall back to 80% ratio
  const threshold = (warningMargin != null && warningMargin > 0)
    ? limit - warningMargin
    : limit * 0.8;
  if (currentUsage >= threshold) return "Gul";
  return "Grønn";
};

/**
 * Calculates combined drone inspection status from date, hours, and missions.
 * Returns worst of all three criteria.
 */
export const calculateDroneInspectionStatus = (params: {
  neste_inspeksjon?: string | null;
  varsel_dager?: number | null;
  flyvetimer: number;
  hours_at_last_inspection: number;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_inspection: number;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}): Status => {
  const dateStatus = calculateMaintenanceStatus(
    params.neste_inspeksjon,
    params.varsel_dager ?? 14
  );

  const hoursSinceInspection = params.flyvetimer - params.hours_at_last_inspection;
  const hoursStatus = calculateUsageStatus(
    hoursSinceInspection,
    params.inspection_interval_hours,
    params.varsel_timer
  );

  const missionsStatus = calculateUsageStatus(
    params.missions_since_inspection,
    params.inspection_interval_missions,
    params.varsel_oppdrag
  );

  return [dateStatus, hoursStatus, missionsStatus].reduce(
    (worst, s) => worstStatus(worst, s),
    "Grønn" as Status
  );
};

/**
 * Calculates combined equipment maintenance status from date, hours, and missions.
 * Returns worst of all three criteria — mirrors calculateDroneInspectionStatus.
 */
export const calculateEquipmentMaintenanceStatus = (params: {
  neste_vedlikehold?: string | null;
  varsel_dager?: number | null;
  flyvetimer: number;
  hours_at_last_maintenance: number;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_maintenance: number;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}): Status => {
  const dateStatus = calculateMaintenanceStatus(
    params.neste_vedlikehold,
    params.varsel_dager ?? 14
  );

  const hoursSinceMaintenance = params.flyvetimer - params.hours_at_last_maintenance;
  const hoursStatus = calculateUsageStatus(
    hoursSinceMaintenance,
    params.inspection_interval_hours,
    params.varsel_timer
  );

  const missionsStatus = calculateUsageStatus(
    params.missions_since_maintenance,
    params.inspection_interval_missions,
    params.varsel_oppdrag
  );

  return [dateStatus, hoursStatus, missionsStatus].reduce(
    (worst, s) => worstStatus(worst, s),
    "Grønn" as Status
  );
};

/**
 * Interface for items with maintenance/inspection dates
 */
interface MaintenanceItem {
  neste_inspeksjon?: string | null;
  neste_vedlikehold?: string | null;
  varsel_dager?: number | null;
}

/**
 * Extended interface for drones with hours/missions inspection criteria
 */
interface DroneMaintenanceItem extends MaintenanceItem {
  flyvetimer?: number;
  hours_at_last_inspection?: number;
  inspection_interval_hours?: number | null;
  varsel_timer?: number | null;
  missions_since_inspection?: number;
  inspection_interval_missions?: number | null;
  varsel_oppdrag?: number | null;
}

/**
 * Calculates aggregated status for a drone based on:
 * - The drone's own inspection status (date + hours + missions)
 * - All linked accessories
 * - All linked equipment
 * 
 * Returns the "worst" status (Rød > Gul > Grønn)
 */
export const calculateDroneAggregatedStatus = (
  drone: DroneMaintenanceItem,
  accessories: MaintenanceItem[],
  linkedEquipment: MaintenanceItem[]
): { status: Status; affectedItems: string[] } => {
  const affectedItems: string[] = [];
  let worstPriority = 0;
  
  // Calculate drone's own status (date + hours + missions)
  const droneStatus = calculateDroneInspectionStatus({
    neste_inspeksjon: drone.neste_inspeksjon,
    varsel_dager: drone.varsel_dager,
    flyvetimer: drone.flyvetimer ?? 0,
    hours_at_last_inspection: drone.hours_at_last_inspection ?? 0,
    inspection_interval_hours: drone.inspection_interval_hours,
    varsel_timer: drone.varsel_timer,
    missions_since_inspection: drone.missions_since_inspection ?? 0,
    inspection_interval_missions: drone.inspection_interval_missions,
    varsel_oppdrag: drone.varsel_oppdrag,
  });
  worstPriority = STATUS_PRIORITY[droneStatus];
  
  // Check all accessories
  for (const acc of accessories) {
    const accStatus = calculateMaintenanceStatus(
      acc.neste_vedlikehold,
      acc.varsel_dager ?? 14
    );
    const accPriority = STATUS_PRIORITY[accStatus];
    if (accPriority > 0) {
      affectedItems.push((acc as any).navn || "Tilbehør");
    }
    worstPriority = Math.max(worstPriority, accPriority);
  }
  
  // Check all linked equipment
  for (const eq of linkedEquipment) {
    const eqStatus = calculateMaintenanceStatus(
      eq.neste_vedlikehold,
      eq.varsel_dager ?? 14
    );
    const eqPriority = STATUS_PRIORITY[eqStatus];
    if (eqPriority > 0) {
      affectedItems.push((eq as any).navn || "Utstyr");
    }
    worstPriority = Math.max(worstPriority, eqPriority);
  }
  
  // Find the status with matching priority
  const status = (Object.entries(STATUS_PRIORITY).find(
    ([_, priority]) => priority === worstPriority
  )?.[0] || "Grønn") as Status;
  
  return { status, affectedItems };
};
