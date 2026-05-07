import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, checkPageBreak, getPdfFontName } from "./pdfUtils";

interface Section {
  title: string;
  content: ContentItem[];
}

type ContentItem = 
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'numbered-list'; items: string[] };

const sections: Section[] = [
  {
    title: "1. Introduksjon til AviSafe",
    content: [
      { type: 'paragraph', text: "AviSafe er et komplett styringssystem for droneoperatorer som dekker hele operasjonssyklusen - fra planlegging og gjennomforing av oppdrag til hendelsesrapportering og dokumenthandtering. Systemet er bygget for a oppfylle kravene i droneforskriftene og stotter ECCAIRS-rapportering til Luftfartstilsynet." },
    ]
  },
  {
    title: "2. Innlogging og Brukerregistrering",
    content: [
      { type: 'heading', text: "Forste gangs registrering" },
      { type: 'numbered-list', items: [
        "Ga til innloggingssiden",
        "Klikk \"Opprett konto\"",
        "Fyll inn: E-postadresse, Passord, Fullt navn, Registreringskode (6-tegns kode fra din bedrift/administrator)",
        "Klikk \"Registrer\"",
        "Viktig: Kontoen ma godkjennes av administrator for du far tilgang"
      ]},
      { type: 'heading', text: "Innlogging" },
      { type: 'list', items: [
        "Bruk e-post og passord",
        "Hvis du har glemt passord, klikk \"Glemt passord\" for a fa tilsendt tilbakestillingslenke"
      ]}
    ]
  },
  {
    title: "3. Dashbordet (Hovedsiden)",
    content: [
      { type: 'paragraph', text: "Nar du logger inn kommer du til dashbordet - din sentrale oversikt over hele operasjonen." },
      { type: 'heading', text: "Widgets pa dashbordet" },
      { type: 'table', headers: ['Widget', 'Beskrivelse'], rows: [
        ['Nyheter', 'Siste nyheter og oppdateringer fra organisasjonen'],
        ['Status', 'Oversikt over ressursstatus (droner, utstyr, dokumenter) med trafikklys'],
        ['Dokumenter', 'Viktige dokumenter med utlopsvarsler'],
        ['Kalender', 'Kommende oppdrag, vedlikehold og hendelser'],
        ['Oppdrag', 'Liste over kommende og pagaende oppdrag'],
        ['Hendelser', 'Siste rapporterte hendelser'],
        ['KPI-graf', 'Visualisering av nokkeltall']
      ]},
      { type: 'heading', text: "Flylogging fra dashbordet" },
      { type: 'list', items: [
        "\"Logg flyvetid\" - Registrer flyvetid manuelt",
        "\"Start flytur\" - Start aktiv flytur med timer og valgfri SafeSky-deling",
        "\"Stopp flytur\" - Avslutt pagaende flytur og logg detaljer"
      ]},
      { type: 'heading', text: "Tilpasning" },
      { type: 'paragraph', text: "Du kan dra og slippe widgets for a endre rekkefolgen. Oppsettet lagres automatisk." }
    ]
  },
  {
    title: "4. Oppdrag",
    content: [
      { type: 'heading', text: "Se alle oppdrag" },
      { type: 'paragraph', text: "Klikk \"Oppdrag\" i menyen for a se pagaende, kommende og fullforte oppdrag." },
      { type: 'heading', text: "Opprette nytt oppdrag" },
      { type: 'numbered-list', items: [
        "Klikk \"+ Legg til oppdrag\"",
        "Fyll inn: Tittel (pakrevd), Lokasjon (sok etter adresse), Tidspunkt (start og eventuell slutt), Beskrivelse, Kunde, Personell, Droner, Utstyr, Dokumenter, Status",
        "Klikk \"Lagre\""
      ]},
      { type: 'heading', text: "Ruteplanlegging" },
      { type: 'numbered-list', items: [
        "Klikk \"Planlegg rute\" i oppdragsdialogen",
        "Du sendes til kartvisningen",
        "Klikk pa kartet for a sette rutepunkter",
        "Se total distanse og VLOS-status",
        "Klikk \"Lagre rute\" for a knytte til oppdraget"
      ]},
      { type: 'heading', text: "Risikovurdering" },
      { type: 'list', items: [
        "AI-basert risikovurdering - Automatisk analyse basert pa vaerdata, luftrom, etc.",
        "Manuell SORA-analyse - Strukturert risikovurdering etter SORA-metodikken"
      ]},
      { type: 'heading', text: "Eksport" },
      { type: 'list', items: [
        "PDF-eksport - Komplett oppdragsrapport inkl. kart og SORA",
        "KMZ-eksport - Rutefil for Google Earth"
      ]}
    ]
  },
  {
    title: "5. Kartet",
    content: [
      { type: 'paragraph', text: "Interaktivt kart med flyrelevant informasjon." },
      { type: 'heading', text: "Kartlag (kan slas av/pa)" },
      { type: 'table', headers: ['Lag', 'Innhold'], rows: [
        ['Luftromsoner', 'CTR, TIZ, restriksjonsomrader fra OpenAIP'],
        ['5km-soner', 'Soner rundt flyplasser (RPAS-regelverk)'],
        ['NSM-restriksjoner', 'Nasjonale sikkerhetssoner'],
        ['Aktive fly', 'Live posisjon fra ADS-B'],
        ['Vaerstasioner', 'Lokale vaerdata']
      ]},
      { type: 'heading', text: "Ruteplanlegging i kartet" },
      { type: 'numbered-list', items: [
        "Klikk \"Planlegg rute\" (eller kom fra oppdragsdialogen)",
        "Klikk pa kartet for a legge til rutepunkter",
        "Se automatisk: Total rutelengde, Maksimal avstand fra pilot (VLOS), Varsler om luftromskonflikter",
        "Klikk \"Lagre rute\" for a fullsfore"
      ]}
    ]
  },
  {
    title: "6. Dokumenter",
    content: [
      { type: 'paragraph', text: "Sentralisert dokumenthandtering med utlopsvarsling." },
      { type: 'heading', text: "Kategorier" },
      { type: 'list', items: [
        "Regelverk", "Prosedyrer", "Sjekklister", "Rapporter", "Nettsider",
        "Oppdragsdokumenter", "Loggbok", "KML/KMZ-filer", "Dokumentstyring", "Risikovurderinger", "Annet"
      ]},
      { type: 'heading', text: "Opprette dokument" },
      { type: 'numbered-list', items: [
        "Klikk \"+ Nytt dokument\"",
        "Fyll inn: Tittel, Kategori, Beskrivelse, Gyldig til (utlopsdato), Varseldager for utlop",
        "Last opp fil ELLER angi nettside-URL"
      ]},
      { type: 'heading', text: "Opprette sjekkliste" },
      { type: 'numbered-list', items: [
        "Klikk \"Ny sjekkliste\"",
        "Legg til sjekkpunkter",
        "Sjekklister kan knyttes til: Droner (for inspeksjon), Utstyr (for vedlikehold), Flytur (for takeoff)"
      ]},
      { type: 'heading', text: "Utlopsvarsler" },
      { type: 'table', headers: ['Farge', 'Status'], rows: [
        ['Rod', 'Utlopt'],
        ['Gul', 'Utloper snart'],
        ['Gronn', 'OK']
      ]}
    ]
  },
  {
    title: "7. Hendelser (Avviksrapportering)",
    content: [
      { type: 'paragraph', text: "Komplett system for hendelsesrapportering og ECCAIRS-integrasjon." },
      { type: 'heading', text: "Rapportere hendelse" },
      { type: 'numbered-list', items: [
        "Klikk \"+ Legg til hendelse\"",
        "Fyll inn: Tittel, Hendelsestidspunkt, Alvorlighetsgrad (Lav, Middels, Hoy, Kritisk)",
        "Velg: Kategori, Lokasjon, Beskrivelse, Hovedarsak, Medvirkende arsak",
        "Koble til oppdrag (valgfritt) og velg Oppfolgingsansvarlig"
      ]},
      { type: 'heading', text: "Hendelsesbehandling - Status" },
      { type: 'numbered-list', items: [
        "Apen - Nylig rapportert",
        "Under behandling - Etterforskes",
        "Ferdigbehandlet - Tiltak identifisert",
        "Lukket - Avsluttet"
      ]},
      { type: 'heading', text: "ECCAIRS-rapportering" },
      { type: 'numbered-list', items: [
        "Klikk \"Klassifiser\" for a mappe til ECCAIRS-taksonomi",
        "Velg: Hendelsestype (VL390), Hendelsesklasse, Flyfase, Luftfartoyskategori, Narrativ",
        "Klikk \"Opprett utkast i ECCAIRS\" for a opprette i E2-systemet",
        "Nar klar: \"Send til Luftfartstilsynet\""
      ]},
      { type: 'paragraph', text: "Klikk PDF-ikonet for a generere komplett hendelsesrapport." }
    ]
  },
  {
    title: "8. Ressurser",
    content: [
      { type: 'paragraph', text: "Administrasjon av alt utstyr, droner og personell." },
      { type: 'heading', text: "Droner" },
      { type: 'list', items: [
        "Modell og serienummer",
        "Registreringsnummer",
        "Flyvetimer (akkumuleres automatisk)",
        "Vedlikeholdsintervall",
        "Neste/siste inspeksjon",
        "Tilknyttet utstyr og personell",
        "Sjekkliste for inspeksjon"
      ]},
      { type: 'paragraph', text: "Loggbok: Klikk \"Loggbok\" for a se all historikk - flyvninger, inspeksjoner, utstyrsendringer." },
      { type: 'heading', text: "Utstyr" },
      { type: 'list', items: [
        "Navn, type, serienummer",
        "Vedlikeholdsintervall",
        "Status (Gronn/Gul/Rod)",
        "Tilknyttet sjekkliste"
      ]},
      { type: 'heading', text: "DroneTag-enheter" },
      { type: 'paragraph', text: "For live-tracking og LAANC/SafeSky-integrasjon: Registrer DroneTag med callsign. Knyttes til flyvninger for automatisk posisjonssporing." },
      { type: 'heading', text: "Personell" },
      { type: 'paragraph', text: "Se alle godkjente brukere med deres kompetanser, sertifikater, utlopsdatoer og status." }
    ]
  },
  {
    title: "9. Kalender",
    content: [
      { type: 'paragraph', text: "Samlet oversikt over alle aktiviteter." },
      { type: 'heading', text: "Vises automatisk" },
      { type: 'list', items: [
        "Planlagte oppdrag",
        "Vedlikeholdsdatoer for droner og utstyr",
        "Dokumentutlop",
        "Registrerte hendelser",
        "Egendefinerte kalenderoppforinger"
      ]},
      { type: 'heading', text: "Legge til oppforing" },
      { type: 'numbered-list', items: [
        "Klikk pa en dato",
        "Velg type: Oppdrag, Hendelse, Dokument, eller egendefinert",
        "Fyll inn detaljer"
      ]},
      { type: 'heading', text: "Utfore vedlikehold fra kalender" },
      { type: 'numbered-list', items: [
        "Finn vedlikeholdsoppforing",
        "Klikk \"Marker som utfort\"",
        "Hvis sjekkliste er tilknyttet, ma denne fullfores forst",
        "Neste vedlikeholdsdato beregnes automatisk"
      ]}
    ]
  },
  {
    title: "10. Status (Statistikk)",
    content: [
      { type: 'paragraph', text: "Detaljert statistikk og KPI-er." },
      { type: 'heading', text: "Tidsperiode" },
      { type: 'list', items: [
        "Siste maned",
        "Siste kvartal",
        "Siste ar",
        "Egendefinert periode"
      ]},
      { type: 'heading', text: "Grafer og diagrammer" },
      { type: 'list', items: [
        "Oppdrag per maned",
        "Oppdrag per status og risikoniva",
        "Hendelser per maned, hovedarsak, medvirkende arsak",
        "Alvorlighetsgrad-fordeling",
        "Dager siden siste alvorlige hendelse",
        "Dronestatus og flyvetimer per drone",
        "Utstyrstatus",
        "Dokumenter som utloper (30/60/90 dager)"
      ]},
      { type: 'heading', text: "Eksport" },
      { type: 'list', items: [
        "Excel - Alle data i regneark",
        "PDF - Formatert rapport"
      ]}
    ]
  },
  {
    title: "11. Profil og Innstillinger",
    content: [
      { type: 'paragraph', text: "Klikk pa profilikon i headeren." },
      { type: 'heading', text: "Personlig informasjon" },
      { type: 'list', items: [
        "Navn, tittel, telefon, adresse",
        "Profilbilde",
        "Digital signatur (for loggboker/rapporter)"
      ]},
      { type: 'heading', text: "Kompetanser" },
      { type: 'paragraph', text: "Se dine sertifikater og kompetanser med utlopsdatoer." },
      { type: 'heading', text: "Nodkontakt" },
      { type: 'paragraph', text: "Registrer nodkontaktperson med navn og telefon." },
      { type: 'heading', text: "Varslingsinnstillinger" },
      { type: 'list', items: [
        "E-post ved nye hendelser",
        "E-post ved nye oppdrag",
        "E-post ved dokumentutlop",
        "E-post nar du tildeles oppfolgingsansvar",
        "E-post om inspeksjonspaminnelser",
        "Push-varsler (krever aktivering)"
      ]},
      { type: 'heading', text: "Min loggbok" },
      { type: 'paragraph', text: "Se din personlige flylogg med alle registrerte flyvetimer." },
      { type: 'heading', text: "Oppfolgingsoppgaver" },
      { type: 'paragraph', text: "Se hendelser du er tildelt oppfolgingsansvar for." }
    ]
  },
  {
    title: "12. Administrasjon (kun for administratorer)",
    content: [
      { type: 'heading', text: "Brukere" },
      { type: 'list', items: [
        "Godkjenn nye brukere som venter pa godkjenning",
        "Tildel roller: Operator, Saksbehandler, Admin, Superadmin",
        "Fjern roller eller slett brukere"
      ]},
      { type: 'heading', text: "Kunder" },
      { type: 'paragraph', text: "Administrer kundeliste for oppdrag." },
      { type: 'heading', text: "E-postmaler" },
      { type: 'paragraph', text: "Tilpass automatiske e-poster som sendes fra systemet." },
      { type: 'heading', text: "Bedrifter (kun superadmin)" },
      { type: 'paragraph', text: "Administrer flere bedrifter i systemet." },
      { type: 'heading', text: "Registreringskode" },
      { type: 'paragraph', text: "Vis og kopier bedriftens registreringskode for nye brukere." }
    ]
  },
  {
    title: "13. Flylogging i praksis",
    content: [
      { type: 'heading', text: "Starte flytur" },
      { type: 'numbered-list', items: [
        "Klikk \"Start flytur\" pa dashbordet",
        "Velg oppdrag (valgfritt)",
        "Gjennomfor obligatoriske sjekklister",
        "Velg publiseringsmodus: Ingen (kun intern logging), Advisory (deles via SafeSky), Live UAV (sanntidssporing via DroneTag)",
        "Klikk \"Start flytur\""
      ]},
      { type: 'heading', text: "Under flytur" },
      { type: 'list', items: [
        "Timer vises i headeren",
        "Hvis DroneTag: posisjon logges automatisk",
        "Varsler ved luftromskonflikter"
      ]},
      { type: 'heading', text: "Avslutte flytur" },
      { type: 'numbered-list', items: [
        "Klikk \"Stopp flytur\"",
        "Loggdialogen apnes automatisk",
        "Fyll inn/bekreft: Varighet, Drone, Eventuelle merknader",
        "Flyvetid legges til dronelogg og personlig logg"
      ]}
    ]
  },
  {
    title: "14. Sammenhenger i systemet",
    content: [
      { type: 'heading', text: "Hva pavirker statusindikator?" },
      { type: 'table', headers: ['Element', 'Gronn', 'Gul', 'Rod'], rows: [
        ['Drone', 'Inspeksjon OK', 'Naermer seg inspeksjon', 'Inspeksjon forfalt'],
        ['Utstyr', 'Vedlikehold OK', 'Naermer seg vedlikehold', 'Vedlikehold forfalt'],
        ['Dokument', 'Gyldig', 'Utloper snart', 'Utlopt'],
        ['Personell', 'Kompetanser OK', 'Kompetanse utloper snart', 'Kompetanse utlopt']
      ]},
      { type: 'heading', text: "Automatiske koblinger" },
      { type: 'list', items: [
        "Flylogg -> Akkumulerer timer pa drone og pilot",
        "Oppdrag -> Kan kobles til hendelser",
        "Inspeksjon -> Beregner neste basert pa intervall",
        "Vedlikehold -> Beregner neste basert pa intervall",
        "Hendelse -> Kan eksporteres til ECCAIRS"
      ]},
      { type: 'heading', text: "Varslingskjede" },
      { type: 'numbered-list', items: [
        "Dokument/kompetanse naermer seg utlop -> E-post/push",
        "Ny hendelse rapportert -> E-post til relevante",
        "Tilordnet oppfolgingsansvar -> E-post",
        "Oppdrag tildelt -> E-post"
      ]}
    ]
  },
  {
    title: "15. Sprak og Tilgjengelighet",
    content: [
      { type: 'list', items: [
        "Klikk globus-ikonet i headeren for a bytte mellom norsk og engelsk",
        "Systemet stotter morkt og lyst tema",
        "Responsivt design for mobil og desktop"
      ]}
    ]
  },
  {
    title: "16. Installasjon som app (PWA)",
    content: [
      { type: 'numbered-list', items: [
        "Klikk \"Installer app\" i menyen",
        "Folg instruksjonene for din enhet",
        "Appen fungerer offline for grunnleggende visning"
      ]}
    ]
  },
  {
    title: "17. Support",
    content: [
      { type: 'paragraph', text: "Ved sporsmål eller problemer:" },
      { type: 'numbered-list', items: [
        "Kontakt din bedriftsadministrator",
        "Sjekk dokumentasjonen i Dokumenter-seksjonen",
        "Rapporter tekniske feil som hendelse med kategori \"Teknisk\""
      ]}
    ]
  }
];

export const generateUserManualPDF = async (): Promise<Blob> => {
  const doc = await createPdfDocument();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title page
  doc.setFontSize(32);
  setFontStyle(doc, "bold");
  doc.text("AviSafe", pageWidth / 2, 60, { align: "center" });
  
  doc.setFontSize(18);
  setFontStyle(doc, "normal");
  doc.text("Bruksanvisning", pageWidth / 2, 75, { align: "center" });
  
  doc.setFontSize(14);
  doc.text("Droneoperasjoner og Flysikkerhet", pageWidth / 2, 90, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  const today = new Date();
  doc.text(`Versjon 1.0 - ${today.toLocaleDateString('nb-NO')}`, pageWidth / 2, 110, { align: "center" });
  doc.setTextColor(0);
  
  // Table of contents
  doc.addPage();
  let yPos = 20;
  
  doc.setFontSize(16);
  setFontStyle(doc, "bold");
  doc.text("Innholdsfortegnelse", 14, yPos);
  yPos += 15;
  
  doc.setFontSize(11);
  setFontStyle(doc, "normal");
  
  sections.forEach((section, index) => {
    doc.text(sanitizeForPdf(section.title), 14, yPos);
    yPos += 7;
  });
  
  // Content pages
  doc.addPage();
  yPos = 20;
  
  for (const section of sections) {
    yPos = checkPageBreak(doc, yPos, 40);
    
    // Section title
    doc.setFontSize(14);
    setFontStyle(doc, "bold");
    doc.text(sanitizeForPdf(section.title), 14, yPos);
    yPos += 10;
    
    for (const item of section.content) {
      yPos = checkPageBreak(doc, yPos, 30);
      
      if (item.type === 'paragraph') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        const lines = doc.splitTextToSize(sanitizeForPdf(item.text), pageWidth - 28);
        doc.text(lines, 14, yPos);
        yPos += lines.length * 5 + 5;
      }
      
      else if (item.type === 'heading') {
        doc.setFontSize(11);
        setFontStyle(doc, "bold");
        doc.text(sanitizeForPdf(item.text), 14, yPos);
        yPos += 8;
      }
      
      else if (item.type === 'list') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        for (const listItem of item.items) {
          yPos = checkPageBreak(doc, yPos, 8);
          const lines = doc.splitTextToSize(sanitizeForPdf(`- ${listItem}`), pageWidth - 32);
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5 + 2;
        }
        yPos += 3;
      }
      
      else if (item.type === 'numbered-list') {
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        item.items.forEach((listItem, idx) => {
          yPos = checkPageBreak(doc, yPos, 8);
          const lines = doc.splitTextToSize(sanitizeForPdf(`${idx + 1}. ${listItem}`), pageWidth - 32);
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5 + 2;
        });
        yPos += 3;
      }
      
      else if (item.type === 'table') {
        yPos = checkPageBreak(doc, yPos, 40);
        autoTable(doc, {
          startY: yPos,
          head: [item.headers.map(h => sanitizeForPdf(h))],
          body: item.rows.map(row => row.map(cell => sanitizeForPdf(cell))),
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, font: getPdfFontName() },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }
    }
    
    yPos += 10;
  }
  
  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`AviSafe Bruksanvisning - Side ${i} av ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }
  
  return doc.output("blob");
};
