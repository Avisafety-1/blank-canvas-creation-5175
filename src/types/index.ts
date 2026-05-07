export type Status = "Grønn" | "Gul" | "Rød";

export type DocumentCategory = "Prosedyrer" | "Sjekklister" | "Manualer" | "Sertifikater" | "Annet";

export type DocumentVisibility = "Alle" | "Internt" | "Kun Admin/Operativ";

export interface Document {
  id: string;
  tittel: string;
  kategori: DocumentCategory;
  fil?: string;
  url?: string;
  versjon: string;
  utsteder?: string;
  gyldig_til?: Date;
  varsel_dager_for_utløp: number;
  beskrivelse?: string | null;
  merknader?: string;
  synlighet: DocumentVisibility;
  sist_endret: Date;
  fil_url?: string;
  fil_navn?: string;
  nettside_url?: string;
  company_id?: string | null;
  company_name?: string | null;
  visible_to_children?: boolean | null;
  global_visibility?: boolean | null;
}

export type PersonRole = "Pilot" | "Tekniker" | "Operativ leder" | "Observatør" | "Annet";

export interface Person {
  id: string;
  navn: string;
  rolle: PersonRole;
  telefon: string;
  epost: string;
  kompetanse: string[];
  status: Status;
  tilgjengelig_fra?: Date;
  tilgjengelig_til?: Date;
  merknader: string;
  aktiv: boolean;
}

export type EquipmentType = "Drone" | "Sensor" | "Batteri" | "Radio" | "Verneutstyr" | "Kamera" | "Lader" | "Propell" | "Verktøy" | "Bæresystem" | "Annet" | string;

export interface Equipment {
  id: string;
  navn: string;
  type: EquipmentType;
  serienummer: string;
  neste_vedlikehold?: Date;
  sist_vedlikeholdt?: Date;
  status: Status;
  tilgjengelig: boolean;
  merknader: string;
  aktiv: boolean;
}

export interface Drone {
  id: string;
  modell: string;
  registreringsnummer: string;
  flytimer: number;
  neste_inspeksjon?: Date;
  sist_inspeksjon?: Date;
  status: Status;
  tilgjengelig: boolean;
  merknader: string;
}

export type MissionStatus = "Planlagt" | "Tildelt" | "Pågår" | "Fullført" | "Avlyst";
export type RiskLevel = "Lav" | "Middels" | "Høy";

export interface Mission {
  id: string;
  tittel: string;
  lokasjon: string;
  beskrivelse: string;
  start: Date;
  slutt: Date;
  status: MissionStatus;
  kunde: string;
  risk_nivå: RiskLevel;
  merknader: string;
}

export type ResourceType = "Person" | "Utstyr" | "Drone";

export interface Assignment {
  id: string;
  oppdrag_id: string;
  ressurs_type: ResourceType;
  ressurs_id: string;
  fra: Date;
  til: Date;
  kommentar: string;
}

export type IncidentCategory = "Uønsket hendelse" | "Avvik" | "Nestenulykke" | "Observasjon";
export type Severity = "Lav" | "Middels" | "Høy" | "Kritisk";
export type IncidentStatus = "Ny" | "Under utredning" | "Tiltak iverksatt" | "Lukket";

export interface Incident {
  id: string;
  tidspunkt: Date;
  kategori: IncidentCategory;
  alvorlighet: Severity;
  tittel: string;
  beskrivelse: string;
  sted: string;
  rapportert_av: string;
  relatert_oppdrag_id?: string;
  status: IncidentStatus;
}

export type FollowUpStatus = "Åpen" | "Pågår" | "Utført" | "Forsinket";

export interface IncidentFollowUp {
  id: string;
  hendelse_id: string;
  dato: Date;
  tiltak: string;
  ansvarlig?: string;
  frist: Date;
  status: FollowUpStatus;
}

export interface News {
  id: string;
  tittel: string;
  innhold: string;
  publisert: Date;
  forfatter: string;
  synlighet: DocumentVisibility;
  pin_on_top: boolean;
}

export type CalendarItemType = "Dokument" | "Oppdrag" | "Hendelse" | "Vedlikehold" | "Annet";

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  tittel: string;
  start: Date;
  slutt?: Date;
  link: string;
  farge: string;
}
