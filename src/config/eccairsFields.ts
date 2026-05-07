export type EccairsFormat = 
  | 'code_and_additional_text'
  | 'value_list_int_array' 
  | 'content_object_array'
  | 'text_content_array' 
  | 'string_array'
  | 'raw_json' 
  | 'local_date'
  | 'local_time'
  | 'utc_date';

export type EccairsFieldGroup = 
  | 'identification'
  | 'classification'
  | 'location'
  | 'aircraft'
  | 'airspace'
  | 'damage'
  | 'narrative'
  | 'reporting'
  | 'analysis'
  | 'birdstrike';

export const ECCAIRS_FIELD_GROUP_LABELS: Record<EccairsFieldGroup, string> = {
  identification: 'Grunnleggende identifikasjon',
  classification: 'Hendelsesklassifisering',
  location: 'Lokasjon og geografi',
  aircraft: 'Luftfartøy (RPAS/UAS)',
  airspace: 'Luftrom',
  damage: 'Skade og konsekvenser',
  narrative: 'Narrativ og beskrivelse',
  reporting: 'Rapportering',
  analysis: 'Analyse og oppfølging',
  birdstrike: 'Fuglekollisjon (Birdstrike)',
};

export const ECCAIRS_FIELD_GROUP_ICONS: Record<EccairsFieldGroup, string> = {
  identification: '📋',
  classification: '⚠️',
  location: '📍',
  aircraft: '🚁',
  airspace: '🌐',
  damage: '💥',
  narrative: '📝',
  reporting: '📨',
  analysis: '🔍',
  birdstrike: '🐦',
};

export interface EccairsFieldConfig {
  code: number;
  label: string;
  taxonomyCode: string;
  format: EccairsFormat;
  type: 'select' | 'text' | 'textarea' | 'date' | 'time' | 'hidden' | 'code_and_text';
  additionalTextField?: string; // Label for the additional text input (used with code_and_text type)
  group: EccairsFieldGroup;
  deriveFrom?: number; // Attribute code to derive value from
  entityPath?: string | null; // null = top-level, "4" = Aircraft entity, etc.
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  helpText?: string;
  autoFromField?: string; // Field from incident to auto-populate
  valueIdPrefix?: string; // Filter value_id by prefix (e.g. '1' for 1000000-series)
  fixedLabel?: string; // Override displayed label for selected value (when DB description is ambiguous)
  maxValues?: number; // Max number of values allowed (for multi-select fields)
}

// Fields ordered logically by group
export const ECCAIRS_FIELDS: EccairsFieldConfig[] = [
  // ===== IDENTIFICATION GROUP =====
  { 
    code: 438, 
    label: 'Lokalt hendelsesnummer (File Number)', 
    taxonomyCode: '24',
    entityPath: '53',
    format: 'string_array',
    type: 'text',
    group: 'identification',
    maxLength: 50,
    helpText: 'Lokalt referansenummer for hendelsen (autogenerert)',
    autoFromField: 'incident_number'
  },
  { 
    code: 601, 
    label: 'Overskrift (Headline)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'string_array',
    type: 'text',
    group: 'identification',
    required: true,
    maxLength: 500,
    helpText: 'Kort beskrivelse av hendelsen på engelsk (fylles automatisk fra tittel)',
    autoFromField: 'tittel'
  },
  { 
    code: 433, 
    label: 'Lokal dato', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_date',
    type: 'date',
    group: 'identification',
    required: true,
    helpText: 'Lokal dato for hendelsen (YYYY-MM-DD)',
    autoFromField: 'hendelsestidspunkt',
  },
  { 
    code: 477, 
    label: 'UTC dato', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_date',
    type: 'hidden',
    group: 'identification',
    deriveFrom: 433,
    helpText: 'UTC-dato beregnet fra lokal dato',
  },
  { 
    code: 457, 
    label: 'Lokal tid', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'local_time',
    type: 'time',
    group: 'identification',
    helpText: 'Klokkeslett for hendelsen (HH:MM)',
    autoFromField: 'hendelsestidspunkt',
  },

  // ===== LOCATION GROUP =====
  { 
    code: 440, 
    label: 'Stedsnavn (Location Name)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'string_array',
    type: 'text',
    group: 'location',
    maxLength: 200,
    helpText: 'Navn på stedet hvor hendelsen skjedde',
    autoFromField: 'lokasjon'
  },
  { 
    code: 454, 
    label: 'Stat/område for hendelse', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'content_object_array',
    type: 'select',
    group: 'location',
    helpText: 'Land/region hvor hendelsen skjedde (VL454)'
  },
  { 
    code: 453, 
    label: 'Ansvarlig enhet (Responsible Entity)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'location',
    defaultValue: '2133',
    fixedLabel: 'CAA Norway',
    helpText: 'Myndighet ansvarlig for hendelsesoppfølging (2133 = Norway CAA)'
  },

  // ===== CLASSIFICATION GROUP =====
  { 
    code: 431, 
    label: 'Hendelsesklasse', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    required: true,
    helpText: 'Obligatorisk for alle ECCAIRS-rapporter'
  },
  { 
    code: 430, 
    label: 'Hendelseskategori (CICTT)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'CICTT-kategori som CFIT, LOC-I, MAC, etc. (VL430)'
  },
  { 
    code: 390, 
    label: 'Hendelsestype', 
    taxonomyCode: '24',
    entityPath: '14',
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'Velg hendelsestype fra ECCAIRS VL390-liste (Events entity)'
  },
  {
    code: 1072, 
    label: 'Deteksjonsfase', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'content_object_array',
    type: 'select',
    group: 'classification',
    helpText: 'Fase da hendelsen ble oppdaget',
    maxValues: 1
  },
  {
    code: 1088,
    label: 'Luftfartssektor (Aviation Sector)',
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'Relatert luftfartssektor (VL1088)'
  },
  {
    code: 455,
    label: 'Hendelsesstatus (Occurrence Status)',
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'classification',
    helpText: 'Status på hendelsen (VL455)'
  },

  // ===== AIRCRAFT GROUP =====
  { 
    code: 32,
    label: 'Luftfartøykategori', 
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '6',
    helpText: 'Kategori luftfartøy (VL32)'
  },
  { 
    code: 244,
    label: 'Serienummer (Aircraft Serial Number)', 
    taxonomyCode: '24',
    entityPath: '4',
    format: 'string_array',
    type: 'text',
    group: 'aircraft',
    maxLength: 11,
    helpText: 'ECCAIRS krever numerisk serienummer, maks 11 siffer. Hentes fra tilknyttet drone når mulig, ellers settes en numerisk standardverdi.',
    autoFromField: 'drone_serial_number'
  },
  {
    code: 1376,
    label: 'UAS driftstillatelsestype (Operation Authorization)',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    helpText: 'Type driftstillatelse for UAS-operasjonen (VL1376)'
  },
  {
    code: 1388,
    label: 'Kontrollmodus RPAS/UAS (Control Mode)',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '4',
    helpText: 'Kontrollmodus for RPAS/UAS under hendelsen (VL1388)'
  },
  {
    code: 1238,
    label: 'RPAS/UAS karakteristisk dimensjon',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '1',
    helpText: 'Karakteristisk dimensjon på RPAS/UAS (VL1238)'
  },
  {
    code: 1243,
    label: 'RPAS/UAS driftskategori (Operations Category)',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '2',
    helpText: 'EU-driftskategori: Open, Specific, Certified (VL1243)'
  },
  {
    code: 1246,
    label: 'RPAS/UAS operasjonstype (Type of Operation)',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'aircraft',
    defaultValue: '1',
    helpText: 'Type operasjon: VLOS, BVLOS, EVLOS, FPV (VL1246)'
  },
  {
    code: 215,
    label: 'Operatør (Operator)',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'code_and_additional_text',
    type: 'code_and_text',
    group: 'aircraft',
    defaultValue: '1799998',
    additionalTextField: 'Operatørnavn',
    fixedLabel: 'Norway → Other',
    helpText: 'Operatør (VL215) — standard: Norway → Other. Skriv inn operatørens navn i tekstfeltet.'
  },

  // ===== AIRSPACE GROUP =====
  { 
    code: 13,
    label: 'Luftromsklasse (Airspace Class)', 
    taxonomyCode: '24',
    entityPath: '3',
    format: 'value_list_int_array',
    type: 'select',
    group: 'airspace',
    defaultValue: '7',
    helpText: 'Luftromsklasse - G (ukontrollert) er standard. Bruk C for hendelser innenfor TIZ/CTR.'
  },
  { 
    code: 15,
    label: 'Luftromstype (Airspace Type)', 
    taxonomyCode: '24',
    entityPath: '3',
    format: 'value_list_int_array',
    type: 'select',
    group: 'airspace',
    helpText: 'Type luftrom (TMA, CTA, ATZ, RMZ, TMZ, etc.)'
  },
  { 
    code: 1241,
    label: 'RPAS/UAS luftromstype', 
    taxonomyCode: '24',
    entityPath: '3',
    format: 'value_list_int_array',
    type: 'select',
    group: 'airspace',
    defaultValue: '12',
    helpText: 'Type luftrom for RPAS/UAS-operasjon (VL1241)'
  },

  // ===== DAMAGE GROUP =====
  { 
    code: 432, 
    label: 'Skade på luftfartøy (Damage to Aircraft)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    defaultValue: '98',
    helpText: 'Skadegrad på luftfartøyet (Destroyed, Substantial, Minor, None, Unknown)'
  },
  { 
    code: 448, 
    label: 'Skade på tredjepart (3rd Party Damage)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    defaultValue: '97',
    helpText: 'Skade på tredjepart (Substantial, Minor, None)'
  },
  { 
    code: 456, 
    label: 'Tredjepart berørt',
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    helpText: 'Om tredjepart ble berørt av hendelsen (VL456)'
  },
  { 
    code: 451, 
    label: 'Skadegrad (Injury Level)', 
    taxonomyCode: '24',
    entityPath: null,
    format: 'value_list_int_array',
    type: 'select',
    group: 'damage',
    helpText: 'Alvorlighetsgrad på personskade (VL451)'
  },

  // ===== NARRATIVE GROUP =====
  { 
    code: 424, 
    label: 'Narrativspråk', 
    taxonomyCode: '24',
    entityPath: '22',
    format: 'value_list_int_array',
    type: 'select',
    group: 'narrative',
    defaultValue: '43',
    helpText: 'Språket narrativet er skrevet på (VL424) - Norwegian = 43'
  },
  { 
    code: 425, 
    label: 'Narrativ (beskrivelse)', 
    taxonomyCode: '24',
    entityPath: '22',
    format: 'text_content_array',
    type: 'textarea',
    group: 'narrative',
    helpText: 'Detaljert beskrivelse av hendelsen',
    autoFromField: 'beskrivelse'
  },
  {
    code: 1091,
    label: 'Rapportørens språk',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'value_list_int_array',
    type: 'select',
    group: 'narrative',
    defaultValue: '43',
    helpText: 'Språket rapportørens beskrivelse er skrevet på (VL1091)'
  },
  {
    code: 1092,
    label: 'Rapportørens beskrivelse',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'text_content_array',
    type: 'textarea',
    group: 'narrative',
    helpText: 'Rapportørens egen beskrivelse av hendelsen',
    autoFromField: 'beskrivelse'
  },

  // ===== REPORTING GROUP (Entity 53) =====
  {
    code: 447,
    label: 'Rapporteringsenhet (Reporting Entity)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'code_and_additional_text',
    type: 'code_and_text',
    group: 'reporting',
    helpText: 'Organisasjon/enhet som rapporterer hendelsen (VL447) — Operatøren som sender rapporten. Skriv inn selskapsnavn i tekstfeltet.',
    defaultValue: '6133',
    additionalTextField: 'Selskapsnavn',
    fixedLabel: 'Aircraft operator',
  },
  {
    code: 476,
    label: 'Rapportkilde (Report Source)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'value_list_int_array',
    type: 'select',
    group: 'reporting',
    helpText: 'Kilde for rapporten (VL476)'
  },
  {
    code: 495,
    label: 'Rapportskjematype (Reporting Form Type)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'content_object_array',
    type: 'select',
    group: 'reporting',
    helpText: 'Type rapporteringsskjema (VL495)'
  },
  {
    code: 800,
    label: 'Rapportstatus (Report Status)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'value_list_int_array',
    type: 'select',
    group: 'reporting',
    defaultValue: '7',
    helpText: 'Status på rapporten (VL800) - Draft = 7'
  },
  {
    code: 801,
    label: 'Rapporteringsdato (Reporting Date)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'local_date',
    type: 'date',
    group: 'reporting',
    helpText: 'Dato for rapportering',
    autoFromField: 'hendelsestidspunkt'
  },
  {
    code: 802,
    label: 'Rapport (vedlegg)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'raw_json',
    type: 'hidden',
    group: 'reporting',
    helpText: 'Vedlegg/ressurslenker til rapporten (Eccairs Resource Locator)'
  },
  {
    code: 1064,
    label: 'Parter informert (Parties Informed)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'content_object_array',
    type: 'select',
    group: 'reporting',
    helpText: 'Parter som er informert om hendelsen (VL1064)'
  },

  // ===== ANALYSIS GROUP =====
  {
    code: 391,
    label: 'Risikoklassifisering (Risk Classification)',
    taxonomyCode: '24',
    entityPath: '14',
    format: 'value_list_int_array',
    type: 'select',
    group: 'analysis',
    valueIdPrefix: '1000000-1999999',
    helpText: 'Risikoklassifisering av hendelsen — kun RPAS-relevante verdier (VL391)'
  },
  {
    code: 1065,
    label: 'Risikoklassifisering (intern)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'string_array',
    type: 'text',
    group: 'analysis',
    maxLength: 200,
    helpText: 'Intern risikoklassifisering fra rapporterende organisasjon (maks 200 tegn)'
  },
  {
    code: 1068,
    label: 'Risikovurdering (Risk Assessment)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'text_content_array',
    type: 'textarea',
    group: 'analysis',
    helpText: 'Detaljert risikovurdering av hendelsen'
  },
  {
    code: 1070,
    label: 'Konklusjoner (Conclusions)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'text_content_array',
    type: 'textarea',
    group: 'analysis',
    helpText: 'Konklusjoner fra organisasjonen'
  },
  {
    code: 1069,
    label: 'Risikoreduserende tiltak (Risk Mitigation Action)',
    taxonomyCode: '24',
    entityPath: '53',
    format: 'text_content_array',
    type: 'textarea',
    group: 'analysis',
    helpText: 'Forebyggende, korrigerende eller utbedrende tiltak for å redusere risiko'
  },

  // ===== BIRDSTRIKE GROUP (Entity 4 - Aircraft) =====
  {
    code: 646,
    label: 'Birds/wildlife seen',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'birdstrike',
    helpText: 'Antall fugler/dyr observert (VL646)'
  },
  {
    code: 647,
    label: 'Birds/wildlife struck',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'birdstrike',
    helpText: 'Antall fugler/dyr truffet (VL647)'
  },
  {
    code: 648,
    label: 'Bird size',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'birdstrike',
    helpText: 'Estimert størrelse på fugl (VL648)'
  },
  {
    code: 649,
    label: 'Pilot advised of birds',
    taxonomyCode: '24',
    entityPath: '4',
    format: 'value_list_int_array',
    type: 'select',
    group: 'birdstrike',
    helpText: 'Om piloten ble varslet om fugler (VL649)'
  },
];

export function getFieldByCode(code: number): EccairsFieldConfig | undefined {
  return ECCAIRS_FIELDS.find(f => f.code === code);
}

export function getRequiredFields(): EccairsFieldConfig[] {
  return ECCAIRS_FIELDS.filter(f => f.required);
}

export function getAttributeLabel(code: number): string {
  const field = getFieldByCode(code);
  return field?.label || `Attributt ${code}`;
}

export function getFieldsByGroup(group: EccairsFieldGroup): EccairsFieldConfig[] {
  return ECCAIRS_FIELDS.filter(f => f.group === group);
}

export function getOrderedGroups(): EccairsFieldGroup[] {
  return ['identification', 'classification', 'location', 'aircraft', 'airspace', 'damage', 'narrative', 'reporting', 'analysis', 'birdstrike'];
}

/** Groups that should be rendered as collapsible sections */
export const COLLAPSIBLE_GROUPS: Set<EccairsFieldGroup> = new Set(['birdstrike']);
