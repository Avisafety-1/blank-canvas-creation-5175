export interface EquipmentCategory {
  id: string;
  label: string;
  isBattery?: boolean;
}

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  { id: "Batteri", label: "Batteri", isBattery: true },
  { id: "Sensor", label: "Sensor" },
  { id: "Kamera", label: "Kamera" },
  { id: "Radio", label: "Radio" },
  { id: "Lader", label: "Lader" },
  { id: "Propell", label: "Propell" },
  { id: "Verneutstyr", label: "Verneutstyr" },
  { id: "Verktøy", label: "Verktøy" },
  { id: "Bæresystem", label: "Bæresystem" },
];

const BATTERY_ALIASES = ["batteri", "battery", "batteries", "batterier"];

export const isBatteryType = (type: string | null | undefined): boolean => {
  if (!type) return false;
  return BATTERY_ALIASES.includes(type.toLowerCase().trim());
};
