export interface DroneProfile {
  aircraft_type: "multirotor" | "fixed_wing" | "vtol" | "helicopter";
  mtow_kg: number;
  max_speed_mps?: number;
  max_wind_mps?: number;
  characteristic_dimension_m?: number;
  has_parachute_support: boolean;
  has_fts_support: boolean;
}

export type ContingencyMethod = "standard" | "parachute";
export type GroundRiskBufferMethod = "off" | "1to1" | "ballistic" | "glide" | "drift";

export interface MissionParams {
  planned_altitude_m_agl: number;
  planned_speed_mps?: number;
  operation_profile: "vlos" | "bvlos";
  containment_level: "low" | "medium" | "high";
  parachute_enabled: boolean;
  fts_enabled: boolean;
  wind_override_mps?: number;
  characteristic_dimension_m?: number;
  ground_speed_mps?: number;
  reaction_time_s?: number;
  pitch_bank_angle_deg?: number;
  altimetry_error_m?: number;
  gnss_error_m?: number;
  position_hold_error_m?: number;
  map_error_m?: number;
  contingency_method?: ContingencyMethod;
  deployment_time_s?: number;
  ground_risk_buffer_method?: GroundRiskBufferMethod;
  glide_ratio?: number;
  descent_speed_mps?: number;
}

export interface SoraBufferSuggestion {
  suggested_contingency_buffer_m: number;
  suggested_ground_risk_buffer_m: number;
  suggested_flight_geography_m: number;
  suggested_total_buffer_m: number;
  suggested_contingency_height_m: number;
  total_ceiling_m: number;
  calculation_summary: string;
  warnings: string[];
  details: {
    reaction_distance_m: number;
    maneuver_distance_m: number;
    vertical_reaction_m: number;
    vertical_maneuver_m: number;
    cv_buffer_m: number;
    cv_height_margin_m: number;
    total_ceiling_m: number;
    ground_risk_buffer_m: number;
  };
}

const G = 9.81;
const DEFAULT_GROUND_SPEED_MPS = 15;
const DEFAULT_REACTION_TIME_S = 1.5;
const DEFAULT_ANGLE_DEG = 30;
const DEFAULT_ALTIMETRY_ERROR_M = 1;
const DEFAULT_GNSS_ERROR_M = 5;
const DEFAULT_POSITION_HOLD_ERROR_M = 2;
const DEFAULT_MAP_ERROR_M = 0;
const DEFAULT_CHARACTERISTIC_DIMENSION_M = 1;
const DEFAULT_DEPLOYMENT_TIME_S = 3;
const DEFAULT_GLIDE_RATIO = 15;
const DEFAULT_DESCENT_SPEED_MPS = 3.5;

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function calculateSoraBuffer(
  drone: DroneProfile,
  mission: MissionParams
): SoraBufferSuggestion {
  const warnings: string[] = [];
  const aircraftType = drone.aircraft_type === "fixed_wing" ? "fixed_wing" : "multirotor";
  const hfg = Math.max(0, mission.planned_altitude_m_agl || 0);
  const cd = Math.max(0, mission.characteristic_dimension_m ?? drone.characteristic_dimension_m ?? DEFAULT_CHARACTERISTIC_DIMENSION_M);
  const v0 = Math.max(0, mission.ground_speed_mps ?? mission.planned_speed_mps ?? drone.max_speed_mps ?? DEFAULT_GROUND_SPEED_MPS);
  const tr = Math.max(0, mission.reaction_time_s ?? DEFAULT_REACTION_TIME_S);
  const angleDeg = Math.max(1, mission.pitch_bank_angle_deg ?? DEFAULT_ANGLE_DEG);
  const angleRad = toRad(angleDeg);
  const hAm = Math.max(0, mission.altimetry_error_m ?? DEFAULT_ALTIMETRY_ERROR_M);
  const sGnss = Math.max(0, mission.gnss_error_m ?? DEFAULT_GNSS_ERROR_M);
  const sPos = Math.max(0, mission.position_hold_error_m ?? DEFAULT_POSITION_HOLD_ERROR_M);
  const sMap = Math.max(0, mission.map_error_m ?? DEFAULT_MAP_ERROR_M);
  const contingencyMethod = mission.contingency_method ?? (mission.parachute_enabled || mission.fts_enabled ? "parachute" : "standard");

  const reactionDistance = v0 * tr;
  const verticalReaction = v0 * 0.707 * tr;
  let maneuverDistance = 0;
  let verticalManeuver = 0;

  if (contingencyMethod === "parachute") {
    const tp = Math.max(0, mission.deployment_time_s ?? DEFAULT_DEPLOYMENT_TIME_S);
    maneuverDistance = v0 * tp;
    verticalManeuver = v0 * 0.707 * tp;
  } else if (aircraftType === "multirotor") {
    maneuverDistance = (v0 * v0) / (2 * G * Math.tan(angleRad));
    verticalManeuver = (v0 * v0) / (2 * G);
  } else {
    maneuverDistance = (v0 * v0) / (G * Math.tan(angleRad));
    verticalManeuver = ((v0 * v0) / G) * 0.3;
  }

  const cvBuffer = sGnss + sPos + sMap + reactionDistance + maneuverDistance;
  const cvHeightMargin = hAm + verticalReaction + verticalManeuver;
  const totalCeiling = hfg + cvHeightMargin;

  const grbMethod = mission.ground_risk_buffer_method ?? "1to1";
  let groundRiskBuffer = 0;
  if (grbMethod !== "off") {
    const halfCd = cd / 2;
    if (grbMethod === "1to1") {
      groundRiskBuffer = totalCeiling + halfCd;
    } else if (grbMethod === "ballistic") {
      groundRiskBuffer = v0 * Math.sqrt((2 * totalCeiling) / G) + halfCd;
    } else if (grbMethod === "glide") {
      const glideRatio = Math.max(1, mission.glide_ratio ?? DEFAULT_GLIDE_RATIO);
      groundRiskBuffer = totalCeiling * glideRatio + halfCd;
    } else if (grbMethod === "drift") {
      const wind = Math.max(0, mission.wind_override_mps ?? drone.max_wind_mps ?? 0);
      const descent = Math.max(0.1, mission.descent_speed_mps ?? DEFAULT_DESCENT_SPEED_MPS);
      groundRiskBuffer = (totalCeiling / descent) * wind + halfCd;
      if (wind < 3) warnings.push("Vind under 3 m/s er normalt lite konservativt for drift/parachute-beregning.");
    }
  }

  if (cd > 0 && hfg < 3 * cd) {
    warnings.push(`Flight Geography bør være minst 3 × CD (${round1(3 * cd)} m).`);
  }
  if (mission.ground_speed_mps === undefined && mission.planned_speed_mps === undefined && drone.max_speed_mps === undefined) {
    warnings.push("Maks bakkehastighet V0 er satt til standard 15 m/s. Verifiser at vind er inkludert.");
  }
  if (aircraftType === "fixed_wing" && grbMethod === "ballistic") {
    warnings.push("Ballistic GRB brukes normalt ikke for fixed wing i CAA-kalkulatoren; vurder glide eller 1:1.");
  }
  if (aircraftType === "multirotor" && grbMethod === "glide") {
    warnings.push("Glide GRB brukes normalt ikke for multirotor i CAA-kalkulatoren; vurder ballistic, drift eller 1:1.");
  }

  const roundedCv = round1(cvBuffer);
  const roundedHeight = round1(cvHeightMargin);
  const roundedGrb = round1(groundRiskBuffer);
  const roundedCeiling = round1(totalCeiling);

  return {
    suggested_contingency_buffer_m: roundedCv,
    suggested_ground_risk_buffer_m: roundedGrb,
    suggested_flight_geography_m: Math.max(round1(3 * cd), 0),
    suggested_total_buffer_m: round1(roundedCv + roundedGrb),
    suggested_contingency_height_m: roundedHeight,
    total_ceiling_m: roundedCeiling,
    calculation_summary: `SORA 2.5 CV · ${aircraftType === "fixed_wing" ? "Fixed wing" : "Multirotor"} · V0 ${v0} m/s · tR ${tr}s · ${angleDeg}°`,
    warnings,
    details: {
      reaction_distance_m: round1(reactionDistance),
      maneuver_distance_m: round1(maneuverDistance),
      vertical_reaction_m: round1(verticalReaction),
      vertical_maneuver_m: round1(verticalManeuver),
      cv_buffer_m: roundedCv,
      cv_height_margin_m: roundedHeight,
      total_ceiling_m: roundedCeiling,
      ground_risk_buffer_m: roundedGrb,
    },
  };
}

/**
 * Map drone_models category string to aircraft_type for buffer calculation.
 */
export function categoryToAircraftType(
  category: string | null,
  modelName: string
): DroneProfile["aircraft_type"] {
  const lower = (category ?? "").toLowerCase();
  const nameLower = modelName.toLowerCase();

  if (lower.includes("vtol") || nameLower.includes("vtol")) return "vtol";
  if (
    lower.includes("fixed") ||
    lower.includes("wing") ||
    nameLower.includes("wing") ||
    nameLower.includes("trinity") ||
    nameLower.includes("ebee")
  )
    return "fixed_wing";
  if (lower.includes("helicopter") || nameLower.includes("helicopter")) return "helicopter";
  return "multirotor";
}
