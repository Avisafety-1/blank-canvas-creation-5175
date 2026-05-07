// Auto-mapping fra AviSafe alvorlighetsgrad → ECCAIRS Occurrence Class (VL431)
const SEVERITY_TO_OCCURRENCE_CLASS: Record<string, string> = {
  'Kritisk': '100',    // Accident
  'Høy': '200',        // Serious incident
  'Alvorlig': '200',   // Serious incident
  'Middels': '300',    // Incident
  'Moderat': '300',    // Incident
  'Lav': '400',        // Occurrence without safety effect
  'Ubetydelig': '500', // Not determined
};

// Mapping fra AviSafe hovedårsak → ECCAIRS VL390 Event Type (hovedkategorier)
// VL390 IDs: Equipment=1000000, Operational=99010158, Personnel=99010159, 
//            Organisational=99010164, Consequential=3000000, Unknown=99000000, Any Other=99012035
const HOVEDAARSAK_TO_EVENT_TYPE: Record<string, string> = {
  'Menneskelig feil/svikt': '99010159',    // Personnel
  'Materiellsvikt': '1000000',             // Equipment
  'Metode eller systemfeil': '99010164',   // Organisational
  'Management/ledelse': '99010164',        // Organisational
  'Ytre miljøpåvirkning': '99012035',      // Any Other Events
};

// Mapping fra AviSafe medvirkende årsak → ECCAIRS VL390 Event Type
// Brukes som fallback hvis hovedårsak ikke er satt
const MEDVIRKENDE_TO_EVENT_TYPE: Record<string, string> = {
  'Uhell': '99012035',                     // Any Other Events
  'Brukerfeil': '99010159',                // Personnel
  'Brudd på prosedyre': '99010158',        // Operational
  'Mangelfull prosedyre': '99010164',      // Organisational
  'Mangelfull opplæring': '99010164',      // Organisational
  'Annen menneskelig feil/svikt': '99010159', // Personnel
  'Stress/høy belastning': '99010159',     // Personnel
  'Forandring i rutiner': '99010164',      // Organisational
  'Sykdom': '99010159',                    // Personnel
  'Mangelfull årvåkenhet': '99010159',     // Personnel
  'Teknisk svikt': '1000000',              // Equipment
  'Uegnet teknisk løsning': '1000000',     // Equipment
  'Værforhold': '99012035',                // Any Other Events
  'Fugler/dyr': '99012035',                // Any Other Events
  'ATC-klarering': '99010158',             // Operational
  'Nærpassering': '99010158',              // Operational
  'Annet': '99012035',                     // Any Other Events
  'Ukjent': '99000000',                    // Unknown
};

// Mapping fra AviSafe kategori → ECCAIRS VL390 Event Type (backup)
const KATEGORI_TO_EVENT_TYPE: Record<string, string> = {
  'Luft': '99010158',      // Operational
  'Bakke': '99010158',     // Operational
  'Luftrom': '99010158',   // Operational
  'Teknisk': '1000000',    // Equipment
  'Operativ': '99010158',  // Operational
  'Miljø': '99012035',     // Any Other Events
  'Sikkerhet': '99010158', // Operational
};

// Postnummer-til-ECCAIRS fylke mapping (basert på gamle fylkesnavn pre-2020)
// VL454: State/Area of Occurrence
const POSTCODE_TO_COUNTY: Record<string, string> = {
  '0': '1113',   // Oslo
  '1': '1103',   // Akershus (nå Viken)
  '2': '1107',   // Hedmark (nå Innlandet)
  '3': '1105',   // Buskerud (nå Viken)
  '4': '1121',   // Vest-Agder (nå Agder)
  '5': '1108',   // Hordaland (nå Vestland)
  '6': '1109',   // Møre og Romsdal
  '7': '1116',   // Sør-Trøndelag (nå Trøndelag)
  '8': '1110',   // Nordland
  '9': '1119',   // Troms (default for 9xxx)
};

// Ekstraher 4-sifret norsk postnummer fra adresse
function extractPostcode(location: string): string | null {
  const match = location.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

// Finn fylke-ID fra postnummer
function getCountyFromPostcode(postcode: string): string | null {
  if (!postcode || postcode.length !== 4) return null;
  
  // Finnmark: 9500-9999
  const postcodeNum = parseInt(postcode, 10);
  if (postcodeNum >= 9500 && postcodeNum <= 9999) {
    return '1106'; // Finnmark
  }
  
  // Østfold (nå Viken): 1500-1899
  if (postcodeNum >= 1500 && postcodeNum <= 1899) {
    return '1122'; // Østfold
  }
  
  // Oppland (nå Innlandet): 2600-2999
  if (postcodeNum >= 2600 && postcodeNum <= 2999) {
    return '1111'; // Oppland
  }
  
  // Telemark (nå Vestfold og Telemark): 3800-3999
  if (postcodeNum >= 3800 && postcodeNum <= 3999) {
    return '1118'; // Telemark
  }
  
  // Aust-Agder (nå Agder): 4800-4999
  if (postcodeNum >= 4800 && postcodeNum <= 4999) {
    return '1104'; // Aust-Agder
  }
  
  // Sogn og Fjordane (nå Vestland): 5700-6899
  if (postcodeNum >= 5700 && postcodeNum <= 6899) {
    return '1115'; // Sogn og Fjordane
  }
  
  // Nord-Trøndelag (nå Trøndelag): 7700-7999
  if (postcodeNum >= 7700 && postcodeNum <= 7999) {
    return '1111'; // Nord-Trøndelag (bruker 1111 for enkelhets skyld)
  }
  
  // Default: bruk første siffer
  const firstDigit = postcode[0];
  return POSTCODE_TO_COUNTY[firstDigit] || null;
}

// Bestem VL390 Event Type basert på hovedårsak, medvirkende årsak, eller kategori
function suggestEventType(
  hovedaarsak: string | null, 
  medvirkendeAarsak: string | null, 
  kategori: string | null
): string | null {
  // Prioritet 1: Hovedårsak
  if (hovedaarsak && HOVEDAARSAK_TO_EVENT_TYPE[hovedaarsak]) {
    return HOVEDAARSAK_TO_EVENT_TYPE[hovedaarsak];
  }
  
  // Prioritet 2: Medvirkende årsak
  if (medvirkendeAarsak && MEDVIRKENDE_TO_EVENT_TYPE[medvirkendeAarsak]) {
    return MEDVIRKENDE_TO_EVENT_TYPE[medvirkendeAarsak];
  }
  
  // Prioritet 3: Kategori
  if (kategori && KATEGORI_TO_EVENT_TYPE[kategori]) {
    return KATEGORI_TO_EVENT_TYPE[kategori];
  }
  
  return null;
}

interface Incident {
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  kategori: string | null;
  hendelsestidspunkt?: string;
  hovedaarsak?: string | null;
  medvirkende_aarsak?: string | null;
}

export interface SuggestedMapping {
  occurrence_class: string | null;
  aircraft_category: string;  // VL32 value (6 = RPAS)
  headline: string | null;
  narrative: string | null;
  location_name: string | null;
  occurrence_date: string | null;
  state_area: string[] | null;  // VL454: [country, county?]
  event_type: string | null;    // VL390: Event Type
  rpas_airspace_type: string | null; // VL1241: RPAS/UAS Airspace Type
  reporter_language: string | null;    // VL1091: Reporter's language
  reporter_description: string | null; // 1092: Reporter's description
  report_status: string | null;        // VL800: Report status
  reporting_date: string | null;       // 801: Reporting date
  uas_operation_authorization: string | null; // VL1376: UAS operation authorization type
  control_mode: string | null;         // VL1388: Control mode of RPAS/UAS
  characteristic_dimension: string | null; // VL1238: RPAS/UAS Characteristic Dimension
}

export function suggestEccairsMapping(incident: Incident): SuggestedMapping {
  // Beregn state_area basert på lokasjon
  let stateArea: string[] = ['179']; // Default: Norway
  
  if (incident.lokasjon) {
    const postcode = extractPostcode(incident.lokasjon);
    const countyId = postcode ? getCountyFromPostcode(postcode) : null;
    if (countyId) {
      stateArea = ['179', countyId]; // Norway + fylke
    }
  }
  
  return {
    occurrence_class: SEVERITY_TO_OCCURRENCE_CLASS[incident.alvorlighetsgrad] || '500', // Not determined
    aircraft_category: '6', // VL32: RPAS (changed from VL17:104)
    headline: incident.tittel?.slice(0, 500) || null,
    narrative: incident.beskrivelse || null,
    location_name: incident.lokasjon || null,
    occurrence_date: incident.hendelsestidspunkt 
      ? new Date(incident.hendelsestidspunkt).toISOString().slice(0, 10)
      : null,
    state_area: stateArea,
    event_type: suggestEventType(
      incident.hovedaarsak || null, 
      incident.medvirkende_aarsak || null, 
      incident.kategori
    ),
    rpas_airspace_type: incident.kategori === 'Luftrom' ? '11' : '12',
    reporter_language: '43', // Norwegian
    reporter_description: incident.beskrivelse || null,
    report_status: '7', // Draft
    reporting_date: incident.hendelsestidspunkt 
      ? new Date(incident.hendelsestidspunkt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    uas_operation_authorization: '3', // Not applicable (default)
    control_mode: '4', // Manual control (default)
    characteristic_dimension: '1', // less than 1m (default for typical drones)
  };
}

// Labels for occurrence class values
export const OCCURRENCE_CLASS_LABELS: Record<string, string> = {
  '100': 'Accident',
  '200': 'Serious incident',
  '300': 'Incident',
  '301': 'Major incident',
  '302': 'Significant incident',
  '400': 'Occurrence without safety effect',
  '500': 'Not determined',
  '501': 'Observation',
  '502': 'Occurrence with No Flight Intended',
};

// Labels for VL390 Event Type categories
export const EVENT_TYPE_LABELS: Record<string, string> = {
  '99012035': 'Any Other Events',
  '3000000': 'Consequential Events',
  '1000000': 'Equipment',
  '99010158': 'Operational',
  '99010164': 'Organisational',
  '99010159': 'Personnel',
  '99000000': 'Unknown',
};
