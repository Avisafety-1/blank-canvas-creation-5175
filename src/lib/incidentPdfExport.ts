import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { createPdfDocument, setFontStyle, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, addPdfHeader, addSectionHeader, checkPageBreak, arePdfFontsLoaded } from "./pdfUtils";
import { getIncidentReporterDisplayName } from "./incidentVisibility";

type Incident = {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  hendelsestidspunkt: string;
  alvorlighetsgrad: string;
  status: string;
  kategori: string | null;
  lokasjon: string | null;
  rapportert_av: string | null;
  reported_anonymously?: boolean | null;
  hovedaarsak: string | null;
  medvirkende_aarsak: string | null;
  bilde_url: string | null;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

type IncidentComment = {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
};

interface ExportOptions {
  incident: Incident;
  comments: IncidentComment[];
  oppfolgingsansvarligName: string | null;
  relatedMissionTitle: string | null;
  companyId: string;
  userId: string;
  hideReporterIdentity?: boolean;
  isAdmin?: boolean;
  isParentCompany?: boolean;
  departmentsEnabled?: boolean;
}

export const exportIncidentPDF = async ({
  incident,
  comments,
  oppfolgingsansvarligName,
  relatedMissionTitle,
  companyId,
  userId,
  hideReporterIdentity = false,
  isAdmin = false,
  isParentCompany = false,
  departmentsEnabled = false,
}: ExportOptions): Promise<boolean> => {
  try {
    // Fetch company name
    const { data: companyData } = await supabase
      .from('companies')
      .select('navn')
      .eq('id', companyId)
      .single();
    const companyName = companyData?.navn || undefined;

    const doc = await createPdfDocument();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    let yPos = addPdfHeader(doc, "HENDELSESRAPPORT", incident.tittel, companyName);

    // Detaljer
    yPos = addSectionHeader(doc, "DETALJER", yPos);

    doc.setFontSize(10);
    setFontStyle(doc, "normal");

    const reporterName = getIncidentReporterDisplayName({ incident, hideReporterIdentity, isAdmin, isParentCompany, departmentsEnabled });
    const details: [string, string][] = [
      ["Status", sanitizeForPdf(incident.status)],
      ["Alvorlighetsgrad", sanitizeForPdf(incident.alvorlighetsgrad)],
      ["Kategori", sanitizeForPdf(incident.kategori) || "Ikke spesifisert"],
      ["Hovedarsak", sanitizeForPdf(incident.hovedaarsak) || "Ikke spesifisert"],
      ["Medvirkende arsak", sanitizeForPdf(incident.medvirkende_aarsak) || "Ikke spesifisert"],
      ["Hendelsestidspunkt", formatDateForPdf(incident.hendelsestidspunkt)],
      ["Lokasjon", sanitizeForPdf(incident.lokasjon) || "Ikke spesifisert"],
      ["Rapportert av", sanitizeForPdf(reporterName) || "Ikke spesifisert"],
      ["Oppfolgingsansvarlig", sanitizeForPdf(oppfolgingsansvarligName) || "Ikke tildelt"],
    ];

    if (relatedMissionTitle) {
      details.push(["Knyttet oppdrag", sanitizeForPdf(relatedMissionTitle)]);
    }

    details.forEach(([label, value]) => {
      setFontStyle(doc, "bold");
      doc.text(`${label}:`, 14, yPos);
      setFontStyle(doc, "normal");
      doc.text(value, 60, yPos);
      yPos += 6;
    });

    yPos += 10;

    // Beskrivelse
    if (incident.beskrivelse) {
      yPos = checkPageBreak(doc, yPos, 40);
      yPos = addSectionHeader(doc, "BESKRIVELSE", yPos);

      doc.setFontSize(10);
      setFontStyle(doc, "normal");
      const sanitizedDescription = sanitizeForPdf(incident.beskrivelse);
      const splitDescription = doc.splitTextToSize(sanitizedDescription, pageWidth - 28);
      doc.text(splitDescription, 14, yPos);
      yPos += splitDescription.length * 5 + 10;
    }

    // Kommentarer
    if (comments.length > 0) {
      yPos = checkPageBreak(doc, yPos, 50);
      yPos = addSectionHeader(doc, "KOMMENTARER", yPos);

      const fontName = arePdfFontsLoaded() ? 'Roboto' : 'helvetica';
      autoTable(doc, {
        startY: yPos,
        head: [["Dato", "Av", "Kommentar"]],
        body: comments.map(c => [
          formatDateForPdf(c.created_at),
          sanitizeForPdf(c.created_by_name),
          sanitizeForPdf(c.comment_text)
        ]),
        styles: { fontSize: 9, font: fontName },
        headStyles: { fillColor: [59, 130, 246], font: fontName },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 35 },
          2: { cellWidth: 'auto' }
        }
      });
    }

    // Vedlagt bilde
    if (incident.bilde_url) {
      try {
        const response = await fetch(incident.bilde_url);
        const blob = await response.blob();
        const imgData = await blobToBase64(blob);

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = imgData;
        });

        const maxWidth = pageWidth - 28;
        const ratio = maxWidth / img.width;
        const imgHeight = img.height * ratio;

        const finalY = (doc as any).lastAutoTable?.finalY;
        if (finalY) yPos = finalY + 10;

        yPos = checkPageBreak(doc, yPos, imgHeight + 20);
        yPos = addSectionHeader(doc, "VEDLEGG", yPos);

        doc.addImage(imgData, 'JPEG', 14, yPos, maxWidth, imgHeight);
        yPos += imgHeight + 10;
      } catch (imgErr) {
        console.warn("Could not add image to PDF:", imgErr);
      }
    }

    // Generer filnavn og blob
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const safeTitle = sanitizeFilenameForPdf(incident.tittel).substring(0, 30);
    const fileName = `hendelsesrapport-${safeTitle}-${dateStr}.pdf`;
    
    const pdfBlob = doc.output('blob');
    const filePath = `${companyId}/${fileName}`;

    // Hent brukerens navn for opprettet_av
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    const opprettetAv = userProfile?.full_name || 'Ukjent';

    // Last opp til Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Opprett dokumentoppføring
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        tittel: `Hendelsesrapport - ${sanitizeForPdf(incident.tittel)} - ${formatDateForPdf(new Date(), "dd.MM.yyyy")}`,
        kategori: 'rapporter',
        fil_url: filePath,
        fil_navn: fileName,
        company_id: companyId,
        user_id: userId,
        opprettet_av: opprettetAv,
        beskrivelse: `Automatisk generert rapport for hendelse: ${sanitizeForPdf(incident.tittel)}`
      });

    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error("Error exporting PDF:", error);
    return false;
  }
};
