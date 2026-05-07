/**
 * SORA 2.5 Adjacent Area Population Density Calculator
 *
 * Regulatory basis:
 * - JARUS SORA 2.5 (JAR-DEL-SRM-SORA-MB-2.5, May 2024)
 * - Norwegian CAA SORA 2.5 calculator: training.caa.no/SORA-2.5-calculator/containment.html
 *
 * The adjacent area extends from the outer edge of the ground risk buffer
 * to a radius determined by max(5 km, distance drone can fly in 3 minutes).
 * Population filtering uses polygon-based geometry matching the map visualization.
 */

import type { RoutePoint, SoraSettings } from "@/types/map";
import { supabase } from "@/integrations/supabase/client";
import {
  bufferPolygon,
  computeConvexHull,
  mergeBufferedCorridorPolygons,
} from "@/lib/soraGeometry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type UaSizeKey = "1m" | "3mShelterApplicable" | "3mShelterNotApplicable" | "8m" | "20m" | "40m";
export type SailLevel = "I" | "II" | "III" | "IV" | "V" | "VI";
export type PopulationDensityCategory = "50" | "500" | "5k" | "50k" | "NoLimit";
export type OutdoorAssembliesCategory = "40k" | "40kTo400k" | "400k";
export type ContainmentRequirement = "Low" | "Medium" | "High" | "Out of scope" | "Error";

export interface AdjacentAreaResult {
  /** Radius of the adjacent area from the operational volume center, in meters */
  adjacentRadiusM: number;
  /** Area of the adjacent "donut" in km² */
  adjacentAreaKm2: number;
  /** Total population found in the adjacent area */
  totalPopulation: number;
  /** Average population density in adjacent area (ppl/km²) */
  avgDensity: number;
  /** Threshold represented by the selected population density category */
  threshold: number;
  /** True when CAA containment result is not out of scope/error */
  pass: boolean;
  /** Automatically or manually selected UA size category */
  uaSize: UaSizeKey;
  /** SAIL level used for containment lookup */
  sail: SailLevel;
  /** Density category used for containment lookup */
  populationDensityCategory: PopulationDensityCategory;
  /** Outdoor assemblies category used for containment lookup */
  outdoorAssemblies: OutdoorAssembliesCategory;
  /** Required containment from CAA matrix */
  requiredContainment: ContainmentRequirement;
  /** Backward-compatible text value */
  containmentLevel: string;
  /** Human-readable status text */
  statusText: string;
  dataSource?: string;
  method?: string;
  calculation?: string;
  driver?: string;
  maxCellPopulation?: number;
  gridResolutionM?: number;
  densityCells?: SsbPopulationCell[];
  maxDensityCell?: SsbPopulationCell;
  /** Loading / error state */
  error?: string;
}

export interface SoraPopulationDensityResult {
  cells: SsbPopulationCell[];
  coveragePolygons: RouteMultiPolygon;
  maxDensityCell?: SsbPopulationCell;
  totalPopulation: number;
  maxDensityPerKm2: number;
  gridResolutionM: number;
}

export type ContainmentLevel = "low" | "low500" | "low5000" | "medium" | "high";

export interface AdjacentContainmentInput {
  uaSize: UaSizeKey;
  sail: SailLevel;
  outdoorAssemblies: OutdoorAssembliesCategory;
}

export type RouteMultiPolygon = RoutePoint[][];

type ContainmentMatrix = Record<UaSizeKey, Partial<Record<PopulationDensityCategory | "400k" | "40kTo400k", Record<OutdoorAssembliesCategory, Record<SailLevel, ContainmentRequirement>>>>>;

/* ------------------------------------------------------------------ */
/*  CAA SORA 2.5 containment matrix                                    */
/* ------------------------------------------------------------------ */

export const UA_SIZE_LABELS: Record<UaSizeKey, string> = {
  "1m": "< 1 m UA (< 25 m/s)",
  "3mShelterApplicable": "< 3 m UA (< 35 m/s) – shelter relevant",
  "3mShelterNotApplicable": "< 3 m UA (< 35 m/s) – shelter ikke relevant",
  "8m": "< 8 m UA (< 75 m/s)",
  "20m": "< 20 m UA (< 125 m/s)",
  "40m": "< 40 m UA (< 200 m/s)",
};

export const POPULATION_DENSITY_LABELS: Record<PopulationDensityCategory, string> = {
  "50": "< 50 pers/km²",
  "500": "< 500 pers/km²",
  "5k": "< 5 000 pers/km²",
  "50k": "< 50 000 pers/km²",
  "NoLimit": "No upper limit",
};

export const OUTDOOR_ASSEMBLIES_LABELS: Record<OutdoorAssembliesCategory, string> = {
  "40k": "< 40 k",
  "40kTo400k": "40 k til 400 k",
  "400k": "> 400 k",
};

const DENSITY_THRESHOLDS: Record<PopulationDensityCategory, number> = {
  "50": 50,
  "500": 500,
  "5k": 5_000,
  "50k": 50_000,
  "NoLimit": Infinity,
};

const LEGACY_CONTAINMENT_TO_DENSITY: Record<ContainmentLevel, PopulationDensityCategory> = {
  low: "50",
  low500: "500",
  low5000: "5k",
  medium: "50k",
  high: "NoLimit",
};

const CONTAINMENT_DATA = {
  "1m": {
    "NoLimit": {
      "400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "3mShelterApplicable": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "3mShelterNotApplicable": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "8m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Medium",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Low",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "20m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      },
      "40k": {
        "I": "Medium",
        "II": "Low",
        "III": "Low",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  },
  "40m": {
    "NoLimit": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      }
    },
    "50k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      }
    },
    "5k": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Medium",
        "VI": "Low"
      }
    },
    "500": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Medium",
        "V": "Low",
        "VI": "Low"
      }
    },
    "50": {
      "400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Out of scope"
      },
      "40kTo400k": {
        "I": "Out of scope",
        "II": "Out of scope",
        "III": "Out of scope",
        "IV": "Out of scope",
        "V": "Out of scope",
        "VI": "Medium"
      },
      "40k": {
        "I": "High",
        "II": "High",
        "III": "Medium",
        "IV": "Low",
        "V": "Low",
        "VI": "Low"
      }
    }
  }
} as const satisfies ContainmentMatrix;

export function getDensityThreshold(level: ContainmentLevel | PopulationDensityCategory): number {
  const densityCategory = level in LEGACY_CONTAINMENT_TO_DENSITY
    ? LEGACY_CONTAINMENT_TO_DENSITY[level as ContainmentLevel]
    : level as PopulationDensityCategory;
  return DENSITY_THRESHOLDS[densityCategory] ?? Infinity;
}

export function getPopulationDensityOptions(uaSize: UaSizeKey): PopulationDensityCategory[] {
  if (uaSize === "1m") return ["50k", "NoLimit"];
  if (uaSize === "3mShelterApplicable") return ["5k", "50k", "NoLimit"];
  if (uaSize === "3mShelterNotApplicable") return ["500", "5k", "50k", "NoLimit"];
  return ["50", "500", "5k", "50k", "NoLimit"];
}

export function getPopulationDensityCategory(avgDensity: number, uaSize: UaSizeKey): PopulationDensityCategory {
  const candidates = getPopulationDensityOptions(uaSize);
  for (const category of candidates) {
    if (avgDensity <= DENSITY_THRESHOLDS[category]) return category;
  }
  return "NoLimit";
}

export function deriveUaSizeFromSora(
  sora: Pick<SoraSettings, "characteristicDimensionM" | "groundSpeedMps">,
  shelterApplicable: boolean
): UaSizeKey {
  const cd = Math.max(0, sora.characteristicDimensionM ?? 1);
  const speed = Math.max(0, sora.groundSpeedMps ?? 15);

  if (cd < 1 && speed < 25) return "1m";
  if (cd < 3 && speed < 35) return shelterApplicable ? "3mShelterApplicable" : "3mShelterNotApplicable";
  if (cd < 8 && speed < 75) return "8m";
  if (cd < 20 && speed < 125) return "20m";
  return "40m";
}

export function calculateContainmentRequirement(
  uaSize: UaSizeKey,
  sail: SailLevel,
  populationDensity: PopulationDensityCategory,
  outdoorAssemblies: OutdoorAssembliesCategory
): ContainmentRequirement {
  let selectedColumn: PopulationDensityCategory | "400k" | "40kTo400k" = populationDensity;
  if (outdoorAssemblies !== "40k" && (outdoorAssemblies === "400k" || populationDensity === "NoLimit")) {
    selectedColumn = outdoorAssemblies === "400k" ? "400k" : "40kTo400k";
  }

  const values = CONTAINMENT_DATA[uaSize]?.[selectedColumn]?.[outdoorAssemblies]
    ?? CONTAINMENT_DATA[uaSize]?.[populationDensity]?.[outdoorAssemblies];

  return values?.[sail] ?? "Error";
}

/* ------------------------------------------------------------------ */
/*  Adjacent area radius                                               */
/* ------------------------------------------------------------------ */

export function calculateAdjacentRadius(maxSpeedMps: number | undefined): number {
  const speed = maxSpeedMps ?? 0;
  const distIn3Min = speed * 180;
  return Math.max(5000, Math.min(35000, distIn3Min));
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function pointInPolygon(point: RoutePoint, polygon: RoutePoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInMultiPolygon(point: RoutePoint, polygons: RouteMultiPolygon): boolean {
  return polygons.some(polygon => pointInPolygon(point, polygon));
}


function segmentsIntersect(a: RoutePoint, b: RoutePoint, c: RoutePoint, d: RoutePoint): boolean {
  const eps = 1e-12;
  const orient = (p: RoutePoint, q: RoutePoint, r: RoutePoint) =>
    (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const onSegment = (p: RoutePoint, q: RoutePoint, r: RoutePoint) =>
    Math.min(p.lng, r.lng) - eps <= q.lng && q.lng <= Math.max(p.lng, r.lng) + eps &&
    Math.min(p.lat, r.lat) - eps <= q.lat && q.lat <= Math.max(p.lat, r.lat) + eps;

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (Math.abs(o1) < eps && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < eps && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < eps && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < eps && onSegment(c, b, d)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function polygonsIntersect(a: RoutePoint[], b: RoutePoint[]): boolean {
  if (a.length < 3 || b.length < 3) return false;

  if (a.some(point => pointInPolygon(point, b))) return true;
  if (b.some(point => pointInPolygon(point, a))) return true;

  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}

function cellTouchesMultiPolygon(cell: SsbPopulationCell, polygons: RouteMultiPolygon): boolean {
  const pt: RoutePoint = { lat: cell.centroidLat, lng: cell.centroidLng };
  if (pointInMultiPolygon(pt, polygons)) return true;
  if (!cell.polygon || cell.polygon.length < 3) return false;
  const cellBounds = bboxFromPolygons([cell.polygon]);
  return polygons.some(polygon => {
    const polygonBounds = bboxFromPolygons([polygon]);
    if (
      cellBounds.maxLat < polygonBounds.minLat ||
      cellBounds.minLat > polygonBounds.maxLat ||
      cellBounds.maxLng < polygonBounds.minLng ||
      cellBounds.minLng > polygonBounds.maxLng
    ) {
      return false;
    }

    if (polygonsIntersect(cell.polygon!, polygon)) return true;
    return cell.polygon!.some(point => pointInPolygon(point, polygon)) || polygon.some(point => pointInPolygon(point, cell.polygon!));
  });
}


function cellInsideMultiPolygon(cell: SsbPopulationCell, polygons: RouteMultiPolygon): boolean {
  const pt: RoutePoint = { lat: cell.centroidLat, lng: cell.centroidLng };
  if (!cell.polygon || cell.polygon.length < 3) return pointInMultiPolygon(pt, polygons);
  return cell.polygon.every(point => pointInMultiPolygon(point, polygons));
}

function expandBboxMeters(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  meters: number
) {
  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const latDelta = meters / 111_320;
  const lngDelta = meters / (111_320 * Math.max(Math.cos(avgLat * Math.PI / 180), 0.1));
  return {
    minLat: bbox.minLat - latDelta,
    maxLat: bbox.maxLat + latDelta,
    minLng: bbox.minLng - lngDelta,
    maxLng: bbox.maxLng + lngDelta,
  };
}

function polygonAreaKm2(polygon: RoutePoint[]): number {
  if (polygon.length < 3) return 0;
  const avgLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const latScale = 111.320;
  const lngScale = 111.320 * Math.cos(avgLat * Math.PI / 180);

  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = polygon[i].lng * lngScale;
    const yi = polygon[i].lat * latScale;
    const xj = polygon[j].lng * lngScale;
    const yj = polygon[j].lat * latScale;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

function multiPolygonAreaKm2(polygons: RouteMultiPolygon): number {
  return polygons.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0);
}

function bboxFromPolygons(polygons: RouteMultiPolygon) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const polygon of polygons) {
    for (const point of polygon) {
      if (point.lat < minLat) minLat = point.lat;
      if (point.lat > maxLat) maxLat = point.lat;
      if (point.lng < minLng) minLng = point.lng;
      if (point.lng > maxLng) maxLng = point.lng;
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

/* ------------------------------------------------------------------ */
/*  Buffer builder (mirrors renderAdjacentAreaZone logic)              */
/* ------------------------------------------------------------------ */

function makeBuffer(
  coords: RoutePoint[],
  sora: SoraSettings,
  dist: number
): RouteMultiPolygon {
  if (dist <= 0) return [coords];

  const refPoint = coords[0];
  const avgLat = coords.reduce((s, p) => s + p.lat, 0) / coords.length;

  const isClosedRoute =
    coords.length >= 3 &&
    coords[0].lat === coords[coords.length - 1].lat &&
    coords[0].lng === coords[coords.length - 1].lng;

  const mode = sora.bufferMode ?? "corridor";
  if (mode === "convexHull" || isClosedRoute) {
    const hull = computeConvexHull(coords);
    return [bufferPolygon(hull, dist, refPoint, avgLat)];
  }

  return mergeBufferedCorridorPolygons(coords, dist, 16, refPoint, avgLat);
}

/* ------------------------------------------------------------------ */
/*  SSB WFS population data fetch                                      */
/* ------------------------------------------------------------------ */

export interface SsbPopulationCell {
  population: number;
  centroidLat: number;
  centroidLng: number;
  polygon?: RoutePoint[];
  densityPerKm2?: number;
  isDriver?: boolean;
}

export async function fetchSsbPopulationGrid(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  signal?: AbortSignal
): Promise<SsbPopulationCell[]> {
  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { data, error } = await supabase.functions.invoke("ssb-population", {
    body: { bbox: bboxStr, resolution: "250" },
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (error) {
    throw new Error(`SSB population proxy error: ${error.message}`);
  }
  const cells: SsbPopulationCell[] = [];
  if (!data?.features) return cells;

  for (const feature of data.features) {
    cells.push({
      population: feature.pop_tot,
      centroidLat: feature.centroidLat,
      centroidLng: feature.centroidLng,
      polygon: Array.isArray(feature.polygon) ? feature.polygon : undefined,
      densityPerKm2: typeof feature.densityPerKm2 === "number" ? feature.densityPerKm2 : feature.pop_tot * 16,
    });
  }

  return cells;
}

function splitBboxIntoTiles(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  maxTileKm = 4
) {
  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const latStep = maxTileKm / 111.32;
  const lngStep = maxTileKm / (111.32 * Math.max(Math.cos(avgLat * Math.PI / 180), 0.1));
  const tiles: Array<{ minLat: number; maxLat: number; minLng: number; maxLng: number }> = [];

  for (let minLat = bbox.minLat; minLat < bbox.maxLat; minLat += latStep) {
    for (let minLng = bbox.minLng; minLng < bbox.maxLng; minLng += lngStep) {
      tiles.push({
        minLat,
        maxLat: Math.min(minLat + latStep, bbox.maxLat),
        minLng,
        maxLng: Math.min(minLng + lngStep, bbox.maxLng),
      });
    }
  }

  return tiles;
}

function getCellKey(cell: SsbPopulationCell): string {
  const lat = Math.round(cell.centroidLat * 1_000_000);
  const lng = Math.round(cell.centroidLng * 1_000_000);
  return `${lat}:${lng}:${cell.population}`;
}

export async function fetchSsbPopulationGridTiled(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  signal?: AbortSignal
): Promise<SsbPopulationCell[]> {
  const tiles = splitBboxIntoTiles(bbox);
  if (tiles.length <= 1) return fetchSsbPopulationGrid(bbox, signal);

  const uniqueCells = new Map<string, SsbPopulationCell>();
  const concurrency = 4;
  for (let i = 0; i < tiles.length; i += concurrency) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = tiles.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(tile => fetchSsbPopulationGrid(tile, signal)));
    for (const cells of results) {
      for (const cell of cells) {
        uniqueCells.set(getCellKey(cell), cell);
      }
    }
  }

  return Array.from(uniqueCells.values());
}

/* ------------------------------------------------------------------ */
/*  Core computation                                                   */
/* ------------------------------------------------------------------ */

export async function computeAdjacentAreaDensity(
  coords: RoutePoint[],
  sora: SoraSettings,
  maxSpeedMps: number | undefined,
  containment: AdjacentContainmentInput,
  signal?: AbortSignal
): Promise<AdjacentAreaResult> {
  const adjacentRadiusM = calculateAdjacentRadius(maxSpeedMps ?? sora.groundSpeedMps);
  const fallbackDensityCategory = getPopulationDensityOptions(containment.uaSize)[0];
  const fallbackThreshold = getDensityThreshold(fallbackDensityCategory);

  if (coords.length < 1) {
    const requiredContainment = calculateContainmentRequirement(
      containment.uaSize,
      containment.sail,
      fallbackDensityCategory,
      containment.outdoorAssemblies
    );
    return {
      adjacentRadiusM,
      adjacentAreaKm2: 0,
      totalPopulation: 0,
      avgDensity: 0,
      threshold: fallbackThreshold,
      pass: requiredContainment !== "Out of scope" && requiredContainment !== "Error",
      uaSize: containment.uaSize,
      sail: containment.sail,
      populationDensityCategory: fallbackDensityCategory,
      outdoorAssemblies: containment.outdoorAssemblies,
      requiredContainment,
      containmentLevel: requiredContainment,
      statusText: "Ingen rute",
    };
  }

  const fgDist = sora.flightGeographyDistance;
  const cDist = sora.contingencyDistance;
  const grDist = sora.groundRiskDistance;
  const innerDist = fgDist + cDist + grDist;
  const outerDist = innerDist + adjacentRadiusM;

  const innerPolys = makeBuffer(coords, sora, innerDist);
  const outerPolys = makeBuffer(coords, sora, outerDist);
  const bbox = expandBboxMeters(bboxFromPolygons(outerPolys), 275);

  const cells = await fetchSsbPopulationGridTiled(bbox, signal);

  let totalPop = 0;
  const densityCells: SsbPopulationCell[] = [];
  let maxDensityCell: SsbPopulationCell | undefined;
  for (const cell of cells) {
    if (cellTouchesMultiPolygon(cell, outerPolys) && !cellInsideMultiPolygon(cell, innerPolys)) {
      totalPop += cell.population;
      densityCells.push(cell);
      if (!maxDensityCell || (cell.densityPerKm2 ?? 0) > (maxDensityCell.densityPerKm2 ?? 0)) {
        maxDensityCell = cell;
      }
    }
  }

  const outerAreaKm2 = multiPolygonAreaKm2(outerPolys);
  const innerAreaKm2 = multiPolygonAreaKm2(innerPolys);
  const adjacentAreaKm2 = Math.max(outerAreaKm2 - innerAreaKm2, 0.01);

  const avgDensity = totalPop / adjacentAreaKm2;
  const driverDensity = maxDensityCell?.densityPerKm2 ?? 0;
  const populationDensityCategory = getPopulationDensityCategory(avgDensity, containment.uaSize);
  const threshold = getDensityThreshold(populationDensityCategory);
  const requiredContainment = calculateContainmentRequirement(
    containment.uaSize,
    containment.sail,
    populationDensityCategory,
    containment.outdoorAssemblies
  );
  const pass = requiredContainment !== "Out of scope" && requiredContainment !== "Error";

  const statusText = `Required containment: ${requiredContainment} · gj.snitt ${avgDensity.toFixed(1)} pers/km² (${POPULATION_DENSITY_LABELS[populationDensityCategory]})`;
  const method = "SSB 250 m-ruter som berører tilstøtende donut-område summeres; containment beregnes fra gjennomsnittlig befolkningstetthet utenfor bakkerisikobufferen.";

  return {
    adjacentRadiusM,
    adjacentAreaKm2,
    totalPopulation: totalPop,
    avgDensity,
    threshold,
    pass,
    uaSize: containment.uaSize,
    sail: containment.sail,
    populationDensityCategory,
    outdoorAssemblies: containment.outdoorAssemblies,
    requiredContainment,
    containmentLevel: requiredContainment,
    statusText,
    dataSource: "SSB befolkning på rutenett 250 m (2025)",
    method,
    calculation: `Gjennomsnitt: ${totalPop.toLocaleString("nb-NO")} innbyggere / ${adjacentAreaKm2.toFixed(1)} km² = ${avgDensity.toFixed(1)} pers/km². Tetthetskategori: ${POPULATION_DENSITY_LABELS[populationDensityCategory]}. Høyeste 250 m-rute i området: ${(maxDensityCell?.population ?? 0).toLocaleString("nb-NO")} personer × 16 = ${driverDensity.toFixed(1)} pers/km² (kun kart-/pådriverinfo).`,
    gridResolutionM: 250,
    maxCellPopulation: maxDensityCell?.population,
    densityCells,
    maxDensityCell,
  };
}

export async function computeSoraVolumePopulationDensity(
  coords: RoutePoint[],
  sora: SoraSettings,
  adjacentRadiusM?: number,
  signal?: AbortSignal
): Promise<SoraPopulationDensityResult> {
  if (coords.length < 2) {
    return { cells: [], coveragePolygons: [], totalPopulation: 0, maxDensityPerKm2: 0, gridResolutionM: 250 };
  }

  const soraVolumeDist = sora.flightGeographyDistance + sora.contingencyDistance + sora.groundRiskDistance;
  const totalCoverageDist = soraVolumeDist + (adjacentRadiusM ?? 0);
  const driverPolys = makeBuffer(coords, sora, Math.max(soraVolumeDist, 1));
  const coveragePolys = makeBuffer(coords, sora, Math.max(totalCoverageDist, 1));
  const bbox = expandBboxMeters(bboxFromPolygons(coveragePolys), 275);
  const cells = await fetchSsbPopulationGridTiled(bbox, signal);

  let totalPopulation = 0;
  let maxDensityCell: SsbPopulationCell | undefined;
  const visibleCells: SsbPopulationCell[] = [];

  for (const cell of cells) {
    if (!cellTouchesMultiPolygon(cell, coveragePolys)) continue;

    totalPopulation += cell.population;
    visibleCells.push(cell);
    if (cellTouchesMultiPolygon(cell, driverPolys) && (!maxDensityCell || (cell.densityPerKm2 ?? 0) > (maxDensityCell.densityPerKm2 ?? 0))) {
      maxDensityCell = cell;
    }
  }

  const driverKey = maxDensityCell ? getCellKey(maxDensityCell) : null;
  const markedCells = visibleCells.map(cell => ({ ...cell, isDriver: driverKey === getCellKey(cell) }));

  return {
    cells: markedCells,
    coveragePolygons: coveragePolys,
    maxDensityCell: maxDensityCell ? { ...maxDensityCell, isDriver: true } : undefined,
    totalPopulation,
    maxDensityPerKm2: maxDensityCell?.densityPerKm2 ?? 0,
    gridResolutionM: 250,
  };
}
