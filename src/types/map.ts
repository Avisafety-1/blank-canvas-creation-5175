export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteData {
  coordinates: RoutePoint[];
  totalDistance: number;
  areaKm2?: number;
  pilotPosition?: RoutePoint;
  maxDistanceFromPilot?: number;
  pointsOutsideVLOS?: number;
  soraSettings?: SoraSettings;
  adjacentAreaDocumentation?: AdjacentAreaDocumentation;
}

export interface AdjacentAreaDocumentation {
  enabled: boolean;
  calculatedAt: string;
  adjacentRadiusM: number;
  adjacentAreaKm2: number;
  totalPopulation: number;
  avgDensity: number;
  threshold: number;
  pass: boolean;
  uaSize: string;
  sail: string;
  populationDensityCategory: string;
  outdoorAssemblies: string;
  requiredContainment: string;
  containmentLevel: string;
  statusText: string;
  dataSource?: string;
  method?: string;
  calculation?: string;
  driver?: string;
  maxCellPopulation?: number;
  gridResolutionM?: number;
}

export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  flightGeographyDistance: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
  droneId?: string;
  droneName?: string;
  characteristicDimensionM?: number;
  groundSpeedMps?: number;
}
