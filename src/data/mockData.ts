import { Document, Person, Equipment, Drone, Mission, Incident, IncidentFollowUp, News } from "@/types";

const now = new Date();
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const mockDocuments: Document[] = [
  {
    id: "doc-1",
    tittel: "Operasjonshåndbok Drone DJI Mavic 3",
    kategori: "Manualer",
    versjon: "v2.1",
    utsteder: "DJI",
    gyldig_til: addDays(now, 10),
    varsel_dager_for_utløp: 30,
    merknader: "Oppdatert med nye prosedyrer for nattflyvning",
    synlighet: "Alle",
    sist_endret: addDays(now, -5),
  },
  {
    id: "doc-2",
    tittel: "A1/A3 Sertifikat - Pilot Compliance",
    kategori: "Sertifikater",
    versjon: "v1.0",
    utsteder: "Luftfartstilsynet",
    gyldig_til: addDays(now, -10),
    varsel_dager_for_utløp: 30,
    merknader: "Må fornyes umiddelbart",
    synlighet: "Internt",
    sist_endret: addDays(now, -365),
  },
  {
    id: "doc-3",
    tittel: "Pre-flight Sjekkliste",
    kategori: "Sjekklister",
    versjon: "v3.0",
    utsteder: "Intern",
    varsel_dager_for_utløp: 90,
    merknader: "Standard sjekkliste før alle flyvninger",
    synlighet: "Alle",
    sist_endret: addDays(now, -15),
  },
];

export const mockPersonnel: Person[] = [
  {
    id: "per-1",
    navn: "Ole Hansen",
    rolle: "Pilot",
    telefon: "+47 900 12 345",
    epost: "ole.hansen@example.no",
    kompetanse: ["A1/A3", "Nattflyvning", "Termisk kamera"],
    status: "Grønn",
    merknader: "Erfaren pilot med over 500 flytimer",
    aktiv: true,
  },
  {
    id: "per-2",
    navn: "Kari Nordmann",
    rolle: "Tekniker",
    telefon: "+47 900 23 456",
    epost: "kari.nordmann@example.no",
    kompetanse: ["Vedlikehold drone", "Elektronikk", "Firmware-oppdatering"],
    status: "Grønn",
    merknader: "",
    aktiv: true,
  },
  {
    id: "per-3",
    navn: "Per Johansen",
    rolle: "Operativ leder",
    telefon: "+47 900 34 567",
    epost: "per.johansen@example.no",
    kompetanse: ["Flyledelse", "Risikohåndtering", "EASA-regelverk"],
    status: "Rød",
    tilgjengelig_fra: addDays(now, 7),
    merknader: "Sykmeldt til 15. desember",
    aktiv: true,
  },
];

export const mockEquipment: Equipment[] = [
  {
    id: "eq-1",
    navn: "Radio Taranis X9D",
    type: "Radio",
    serienummer: "TRX-2023-001",
    neste_vedlikehold: addDays(now, 60),
    status: "Grønn",
    tilgjengelig: true,
    merknader: "",
    aktiv: true,
  },
  {
    id: "eq-2",
    navn: "Vernehjelm med visir",
    type: "Verneutstyr",
    serienummer: "VH-2024-12",
    status: "Grønn",
    tilgjengelig: true,
    merknader: "",
    aktiv: true,
  },
  {
    id: "eq-3",
    navn: "LiPo Batteri 6S 5000mAh",
    type: "Batteri",
    serienummer: "BAT-5000-033",
    neste_vedlikehold: addDays(now, 5),
    sist_vedlikeholdt: addDays(now, -85),
    status: "Rød",
    tilgjengelig: false,
    merknader: "Defekt cell detektert, må erstattes",
    aktiv: true,
  },
];

export const mockDrones: Drone[] = [
  {
    id: "dr-1",
    modell: "DJI Mavic 3 Enterprise",
    registreringsnummer: "NO-DRN-001",
    flytimer: 234,
    neste_inspeksjon: addDays(now, 20),
    sist_inspeksjon: addDays(now, -70),
    status: "Gul",
    tilgjengelig: true,
    merknader: "Nærmer seg neste 90-dagers inspeksjon",
  },
  {
    id: "dr-2",
    modell: "DJI Matrice 300 RTK",
    registreringsnummer: "NO-DRN-002",
    flytimer: 87,
    neste_inspeksjon: addDays(now, 75),
    sist_inspeksjon: addDays(now, -15),
    status: "Grønn",
    tilgjengelig: true,
    merknader: "Nylig inspisert og klargjort",
  },
];

export const mockMissions: Mission[] = [
  {
    id: "mis-1",
    tittel: "Inspeksjon kraftlinje Øst",
    lokasjon: "Østmarka, Lørenskog",
    beskrivelse: "Visuell inspeksjon av høyspentledninger for Hafslund",
    start: addDays(now, 2),
    slutt: addDays(now, 2),
    status: "Tildelt",
    kunde: "Hafslund E-CO",
    risk_nivå: "Middels",
    merknader: "Værforhold må være gunstige",
  },
  {
    id: "mis-2",
    tittel: "Byggesaksundersøkelse Bjørvika",
    lokasjon: "Bjørvika, Oslo sentrum",
    beskrivelse: "Fotogrammetri og 3D-modellering av byggeplass",
    start: addDays(now, 5),
    slutt: addDays(now, 5),
    status: "Planlagt",
    kunde: "Oslo Kommune",
    risk_nivå: "Høy",
    merknader: "Flyvning i OSLO CTR - tillatelse innhentet",
  },
];

export const mockIncidents: Incident[] = [
  {
    id: "inc-1",
    tidspunkt: addDays(now, -15),
    kategori: "Nestenulykke",
    alvorlighet: "Middels",
    tittel: "Nesten kollisjon med fugl",
    beskrivelse: "Under oppdrag i Østmarka kom en rovfugl svært nær dronen i 45 meters høyde. Pilot utførte unnamanøver.",
    sted: "Østmarka",
    rapportert_av: "Ole Hansen",
    status: "Tiltak iverksatt",
  },
  {
    id: "inc-2",
    tidspunkt: addDays(now, -7),
    kategori: "Avvik",
    alvorlighet: "Lav",
    tittel: "Pre-flight sjekkliste ikke fullført",
    beskrivelse: "Piloten startet oppdraget uten å signere pre-flight sjekkliste.",
    sted: "Base",
    rapportert_av: "Per Johansen",
    status: "Under utredning",
  },
  {
    id: "inc-3",
    tidspunkt: addDays(now, -45),
    kategori: "Uønsket hendelse",
    alvorlighet: "Høy",
    tittel: "Batteri-feil under flyvning",
    beskrivelse: "Dronen opplevde plutselig strømtap i ett batteri. RTH (Return to Home) ble aktivert automatisk.",
    sted: "Lillestrøm industriområde",
    rapportert_av: "Ole Hansen",
    status: "Lukket",
  },
  {
    id: "inc-4",
    tidspunkt: addDays(now, -60),
    kategori: "Observasjon",
    alvorlighet: "Lav",
    tittel: "GPS-svakhet i område",
    beskrivelse: "GPS-signal svekket nær høyspentlinjer. Anbefaler ekstra forsiktighet.",
    sted: "Østmarka kraftlinje",
    rapportert_av: "Kari Nordmann",
    status: "Lukket",
  },
  {
    id: "inc-5",
    tidspunkt: addDays(now, -80),
    kategori: "Avvik",
    alvorlighet: "Middels",
    tittel: "Manglende dokumentasjon etter oppdrag",
    beskrivelse: "Oppdragsrapport ble ikke levert innen 24 timer som prosedyre krever.",
    sted: "N/A",
    rapportert_av: "Per Johansen",
    status: "Lukket",
  },
];

export const mockFollowUps: IncidentFollowUp[] = [
  {
    id: "fol-1",
    hendelse_id: "inc-1",
    dato: addDays(now, -14),
    tiltak: "Implementere fugleskremmer i område. Gjennomføre risikovurdering for fremtidige oppdrag.",
    ansvarlig: "Per Johansen",
    frist: addDays(now, 10),
    status: "Pågår",
  },
  {
    id: "fol-2",
    hendelse_id: "inc-2",
    dato: addDays(now, -6),
    tiltak: "Gjennomføre sikkerhetsmøte med alle piloter om viktighet av sjekklister.",
    ansvarlig: "Per Johansen",
    frist: addDays(now, -2),
    status: "Forsinket",
  },
];

export const mockNews: News[] = [
  {
    id: "new-1",
    tittel: "Nye regler for droneflyvning i 2025",
    innhold: `Luftfartstilsynet har publisert oppdaterte regler for droneoperasjoner som trer i kraft 1. januar 2025. 
    
Viktigste endringer:
- Nye krav til dokumentasjon av opplæring
- Strengere krav til vedlikehold av utstyr over 4 kg
- Oppdaterte geofence-soner rundt flyplasser

Les mer på luftfartstilsynet.no`,
    publisert: addDays(now, -3),
    forfatter: "Per Johansen",
    synlighet: "Alle",
    pin_on_top: true,
  },
  {
    id: "new-2",
    tittel: "Velkomstmøte nye medarbeidere",
    innhold: "Vi ønsker velkommen til to nye teknikere som begynner mandag 9. desember. Møte kl. 09:00 i hovedkontoret.",
    publisert: addDays(now, -1),
    forfatter: "Kari Nordmann",
    synlighet: "Internt",
    pin_on_top: false,
  },
];
