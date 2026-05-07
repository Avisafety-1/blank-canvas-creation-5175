export type PlanId = 'starter' | 'grower' | 'professional';
export type AddonId = 'sora_admin' | 'dji' | 'eccairs';

export type GatedFeature = 'incidents' | 'status' | 'ai_search' | 'sora' | 'access_control';

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number; // NOK per seat/month
  priceId: string;
  productId: string;
  features: string[];
  highlighted?: boolean;
  maxDrones: number;
  maxDronesPerSeat: boolean; // true = maxDrones * seatCount, false = maxDrones total
  gatedFeatures: GatedFeature[];
}

export interface AddonConfig {
  id: AddonId;
  name: string;
  description: string;
  price: number; // NOK per month (flat)
  priceId: string;
  productId: string;
}

export const PLANS: PlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    priceId: 'price_1TB9TARrLM8xOFbkzV267Soh',
    productId: 'prod_U9SNyTk1R28VOf',
    maxDrones: 1,
    maxDronesPerSeat: true,
    gatedFeatures: [],
    features: [
      '1 drone per bruker',
      'Ressursstyring med vedlikeholdsmodul',
      'Kompetanseoversikt med varsling',
      'Oppdrag med vær- og luftromskontroll',
      'Dokumenter med ubegrensede sjekklister',
      'Kart med SafeSky, luftrom, vær, ruter, SSB ++',
    ],
  },
  {
    id: 'grower',
    name: 'Grower',
    price: 199,
    priceId: 'price_1TB9TfRrLM8xOFbkV1ac0aY5',
    productId: 'prod_U9SOzBZAWkFv4m',
    maxDrones: 5,
    maxDronesPerSeat: false,
    gatedFeatures: ['incidents', 'status', 'ai_search', 'sora'],
    features: [
      'Alt i Starter',
      'Opptil 5 droner totalt',
      'Hendelsesrapportering',
      'Statuspanel',
      'AI-søk',
      'Kalender & varsler',
    ],
    highlighted: true,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 299,
    priceId: 'price_1TB9DARrLM8xOFbkVWT7zgGW',
    productId: 'prod_U9S7NAHDDleuNG',
    maxDrones: 15,
    maxDronesPerSeat: false,
    gatedFeatures: ['incidents', 'status', 'ai_search', 'sora', 'access_control'],
    features: [
      'Alt i Grower',
      'Opptil 15 droner totalt',
      'Risikoanalyse (SORA)',
      'Tilgangsstyring / roller',
      'Prioritert support',
    ],
  },
];

export const ADDONS: AddonConfig[] = [
  {
    id: 'sora_admin',
    name: 'SORA Admin',
    description: 'Avansert SORA risikoanalyse for droneoperasjoner',
    price: 199,
    priceId: 'price_1TBuBDRrLM8xOFbk8RA3Ypgs',
    productId: 'prod_U9RnvT5JMaB4V5',
  },
  {
    id: 'dji',
    name: 'DJI-integrasjon',
    description: 'Automatisk import av DJI-flightlogs',
    price: 199,
    priceId: 'price_1TBuAiRrLM8xOFbkBbf8sL2H',
    productId: 'prod_U9SCO6vjcZPjBb',
  },
  {
    id: 'eccairs',
    name: 'ECCAIRS-integrasjon',
    description: 'ECCAIRS E2-rapportering til Luftfartstilsynet',
    price: 199,
    priceId: 'price_1TBu9ARrLM8xOFbkj393UO2H',
    productId: 'prod_U9SD6lFn3EcEYa',
  },
];

export const getPlanByProductId = (productId: string): PlanConfig | undefined =>
  PLANS.find(p => p.productId === productId);

export const getPlanById = (planId: PlanId): PlanConfig | undefined =>
  PLANS.find(p => p.id === planId);

export const getAddonById = (addonId: AddonId): AddonConfig | undefined =>
  ADDONS.find(a => a.id === addonId);

// Price ID to plan mapping for edge functions
export const PRICE_TO_PLAN: Record<string, PlanId> = {
  'price_1TB9TARrLM8xOFbkzV267Soh': 'starter',
  'price_1TB9TfRrLM8xOFbkV1ac0aY5': 'grower',
  'price_1TB9DARrLM8xOFbkVWT7zgGW': 'professional',
  // Legacy
  'price_1TAvyMRrLM8xOFbkg986ibK4': 'professional',
};

export const ADDON_PRICE_IDS: Record<string, AddonId> = {
  'price_1TBuBDRrLM8xOFbk8RA3Ypgs': 'sora_admin',
  'price_1TBuAiRrLM8xOFbkBbf8sL2H': 'dji',
  'price_1TBu9ARrLM8xOFbkj393UO2H': 'eccairs',
  // Legacy
  'price_1TB8tURrLM8xOFbk2fX9o05U': 'sora_admin',
  'price_1TB9IBRrLM8xOFbkijdJUsL7': 'dji',
  'price_1TB9JCRrLM8xOFbklvsgEyiV': 'eccairs',
};
