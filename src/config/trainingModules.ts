export const TRAINING_MODULES = [
  { key: "missions", label: "Oppdrag", route: "/oppdrag", dashboardComponents: ["missions"] },
  { key: "map", label: "Kart", route: "/kart", dashboardComponents: [] },
  { key: "documents", label: "Dokumenter", route: "/dokumenter", dashboardComponents: ["documents"] },
  { key: "calendar", label: "Kalender", route: "/kalender", dashboardComponents: ["calendar"] },
  { key: "incidents", label: "Hendelser", route: "/hendelser", dashboardComponents: ["incidents"] },
  { key: "status", label: "Status", route: "/status", dashboardComponents: ["status", "kpi"] },
  { key: "resources", label: "Ressurser", route: "/ressurser", dashboardComponents: ["kpi"] },
] as const;

export type TrainingModuleKey = (typeof TRAINING_MODULES)[number]["key"];

export const TRAINING_MODULE_KEYS = TRAINING_MODULES.map((module) => module.key) as TrainingModuleKey[];

export const isTrainingModuleKey = (value: string): value is TrainingModuleKey =>
  (TRAINING_MODULE_KEYS as readonly string[]).includes(value);

export const normalizeTrainingModules = (modules: unknown): TrainingModuleKey[] => {
  if (!Array.isArray(modules)) return [];
  return Array.from(new Set(modules.filter((module): module is TrainingModuleKey => typeof module === "string" && isTrainingModuleKey(module))));
};

export const dashboardComponentToModule = (component: string): TrainingModuleKey | null => {
  const match = TRAINING_MODULES.find((module) => (module.dashboardComponents as readonly string[]).includes(component));
  return match?.key ?? null;
};