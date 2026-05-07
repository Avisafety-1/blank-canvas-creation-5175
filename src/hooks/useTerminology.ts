import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

export type CompanyType = 'droneoperator' | 'flyselskap' | null;

interface Terminology {
  // Nouns (singular/plural)
  vehicle: string;
  vehicles: string;
  vehicleLower: string;
  vehiclesLower: string;
  
  // Compound words
  vehicleWeather: string;
  flightHours: string;
  
  // Actions
  addVehicle: string;
  noVehicles: string;
  selectVehicle: string;
  vehicleModel: string;
  vehicleRegistration: string;
  
  // Status related
  vehicleStatus: string;
  
  // Inspection
  lastInspection: string;
  nextInspection: string;
  
  // Labels
  assignedVehicles: string;
}

export const useTerminology = (): Terminology => {
  const { companyType } = useAuth();
  const { t } = useTranslation();
  
  const isAirline = companyType === 'flyselskap';
  
  return {
    // Nouns (singular/plural)
    vehicle: isAirline ? t('terminology.aircraft') : t('terminology.drone'),
    vehicles: isAirline ? t('terminology.aircraftPlural') : t('terminology.drones'),
    vehicleLower: isAirline ? t('terminology.aircraftLower') : t('terminology.droneLower'),
    vehiclesLower: isAirline ? t('terminology.aircraftPluralLower') : t('terminology.dronesLower'),
    
    // Compound words
    vehicleWeather: isAirline ? t('terminology.aircraftWeather') : t('terminology.droneWeather'),
    flightHours: t('terminology.flightHours'),
    
    // Actions
    addVehicle: isAirline ? t('terminology.addAircraft') : t('terminology.addDrone'),
    noVehicles: isAirline ? t('terminology.noAircraft') : t('terminology.noDrones'),
    selectVehicle: isAirline ? t('terminology.selectAircraft') : t('terminology.selectDrone'),
    vehicleModel: isAirline ? t('terminology.aircraftModel') : t('terminology.droneModel'),
    vehicleRegistration: isAirline ? t('terminology.aircraftRegistration') : t('terminology.droneRegistration'),
    
    // Status related
    vehicleStatus: isAirline ? t('terminology.aircraftStatus') : t('terminology.droneStatus'),
    
    // Inspection
    lastInspection: t('terminology.lastInspection'),
    nextInspection: t('terminology.nextInspection'),
    
    // Labels
    assignedVehicles: isAirline ? t('terminology.assignedAircraft') : t('terminology.assignedDrones'),
  };
};
