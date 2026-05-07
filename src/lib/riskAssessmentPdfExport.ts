import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  createPdfDocument,
  setFontStyle,
  sanitizeForPdf,
  sanitizeFilenameForPdf,
  formatDateForPdf,
  addPdfHeader,
  addSectionHeader,
  checkPageBreak,
  arePdfFontsLoaded,
} from "./pdfUtils";

interface RiskExportOptions {
  assessment: any;
  missionTitle: string;
  categoryComments: Record<string, string>;
  companyId: string;
  userId: string;
  createdAt?: string;
  soraOutput?: any;
  exportType?: 'ai' | 'sora';
}

const CATEGORY_LABELS: Record<string, string> = {
  weather: "Vær",
  airspace: "Luftrom",
  pilot_experience: "Piloterfaring",
  mission_complexity: "Oppdragskompleksitet",
  equipment: "Utstyr",
  regulatory: "Regelverk",
  environment: "Miljø",
  population: "Befolkning",
  terrain: "Terreng",
  communications: "Kommunikasjon",
};

const GO_LABELS: Record<string, string> = {
  GO: "GO",
  BETINGET: "BETINGET GO",
  "NO-GO": "NO-GO",
  go: "GO",
  caution: "BETINGET GO",
  "no-go": "NO-GO",
};

function getCategoryLabel(key: string): string {
  return CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getGoLabel(decision: any): string {
  if (typeof decision === "boolean") return decision ? "GO" : "IKKE GO";
  if (typeof decision === "string") return GO_LABELS[decision] || decision;
  return "N/A";
}

function getCategoryEntries(categories: any): [string, any][] {
  if (!categories) return [];
  if (Array.isArray(categories)) {
    return categories.map((cat: any) => [cat.name || cat.category || "", cat]);
  }
  return Object.entries(categories);
}

const MITIGATION_LABELS: Record<string, string> = {
  m1a_sheltering: "M1(A) Skjerming",
  m1b_operational_restrictions: "M1(B) Operasjonelle restriksjoner",
  m1c_ground_observation: "M1(C) Bakkeobservasjon",
  m2_impact_reduction: "M2 Konsekvensreduksjon",
};

function addOperationClassification(doc: any, data: any, yPos: number, pageWidth: number): number {
  if (!data || (!data.category && data.requires_sora === undefined)) return yPos;
  
  yPos = checkPageBreak(doc, yPos, 40);
  yPos = addSectionHeader(doc, "OPERASJONSKATEGORISERING (STEG 0)", yPos);
  doc.setFontSize(10);

  const fields: [string, string][] = [];
  if (data.category) fields.push(["Kategori", `${sanitizeForPdf(data.category)}${data.subcategory ? ` - ${sanitizeForPdf(data.subcategory)}` : ''}`]);
  if (data.requires_sora !== undefined) fields.push(["Krever SORA", data.requires_sora ? "Ja" : "Nei"]);
  if (data.alos_max_m != null) fields.push(["ALOS maks (m)", String(data.alos_max_m)]);
  if (data.alos_calculation) fields.push(["ALOS beregning", sanitizeForPdf(data.alos_calculation)]);
  if (data.sts_applicable) fields.push(["STS", sanitizeForPdf(data.sts_applicable)]);
  if (data.sora_buffers_calculated !== undefined) fields.push(["SORA-buffere beregnet", data.sora_buffers_calculated ? "Ja" : "Nei"]);

  for (const [label, value] of fields) {
    yPos = checkPageBreak(doc, yPos, 8);
    setFontStyle(doc, "bold");
    doc.text(`${label}:`, 14, yPos);
    setFontStyle(doc, "normal");
    doc.text(value, 60, yPos);
    yPos += 6;
  }

  if (data.reasoning) {
    yPos += 2;
    yPos = checkPageBreak(doc, yPos, 15);
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(data.reasoning), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  return yPos + 5;
}

function addGroundRiskAnalysis(doc: any, data: any, yPos: number, pageWidth: number, fontName: string): number {
  if (!data) return yPos;

  yPos = checkPageBreak(doc, yPos, 50);
  yPos = addSectionHeader(doc, "BAKKEBASERT RISIKO (GRC)", yPos);
  doc.setFontSize(10);

  const fields: [string, string][] = [];
  if (data.characteristic_dimension) fields.push(["Karakteristisk dimensjon", sanitizeForPdf(data.characteristic_dimension)]);
  if (data.max_speed_category) fields.push(["Hastighetskategori", sanitizeForPdf(data.max_speed_category)]);
  if (data.drone_weight_kg != null) fields.push(["Dronevekt (kg)", String(data.drone_weight_kg)]);
  if (data.population_density_band) fields.push(["Befolkningstetthet", sanitizeForPdf(data.population_density_band)]);
  if (data.population_density_value != null) fields.push(["Befolkningstetthet (per km2)", String(data.population_density_value)]);
  if (data.population_density_average != null) fields.push(["Gj.snitt tetthet (per km2)", String(data.population_density_average)]);
  if (data.ssb_grid_population != null) fields.push(["Dimensjonerende SSB-rute", `${data.ssb_grid_population} personer (${data.ssb_grid_resolution_m || 250} m)`]);
  if (data.grc_calculation_method) fields.push(["GRC-metode", sanitizeForPdf(data.grc_calculation_method)]);
  if (data.igrc_table_basis) fields.push(["Tabellgrunnlag", sanitizeForPdf(data.igrc_table_basis)]);
  if (data.igrc != null) fields.push(["iGRC", String(data.igrc)]);
  if (data.total_reduction != null) fields.push(["Dokumentert reduksjon", String(data.total_reduction)]);
  if (data.fgrc != null) fields.push(["fGRC (endelig)", String(data.fgrc)]);

  for (const [label, value] of fields) {
    yPos = checkPageBreak(doc, yPos, 8);
    setFontStyle(doc, "bold");
    doc.text(`${label}:`, 14, yPos);
    setFontStyle(doc, "normal");
    doc.text(value, 65, yPos);
    yPos += 6;
  }

  if (data.igrc_reasoning) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("iGRC begrunnelse:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(data.igrc_reasoning), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  if (data.population_density_calculation || data.population_density_driver || data.population_density_source) {
    yPos = checkPageBreak(doc, yPos, 28);
    setFontStyle(doc, "bold");
    doc.text("SSB-beregning (befolkningstetthet):", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const ssbText = [
      data.population_density_source ? `Datakilde: ${data.population_density_source}` : null,
      data.population_density_footprint ? `Fotavtrykk: ${data.population_density_footprint}` : null,
      data.population_density_calculation ? `Beregning: ${data.population_density_calculation}` : null,
      data.population_density_average != null ? `Gjennomsnitt i fotavtrykk: ${Number(data.population_density_average).toLocaleString("nb-NO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} personer/km2` : null,
      data.population_density_driver ? `Dimensjonerende del av ruten: ${data.population_density_driver}` : null,
    ].filter(Boolean).join("\n");
    const lines = doc.splitTextToSize(sanitizeForPdf(ssbText), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  // Mitigations table
  if (data.mitigations) {
    yPos = checkPageBreak(doc, yPos, 40);
    const mitigationBody: string[][] = [];
    for (const [key, mit] of Object.entries(data.mitigations) as [string, any][]) {
      if (!mit) continue;
      mitigationBody.push([
        sanitizeForPdf(MITIGATION_LABELS[key] || key),
        mit.applicable ? "Ja" : "Nei",
        mit.robustness || "—",
        String(mit.reduction || 0),
        sanitizeForPdf(mit.reasoning || ""),
      ]);
    }

    if (mitigationBody.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [["Mitigering", "Anvendt", "Robusthet", "Reduksjon", "Begrunnelse"]],
        body: mitigationBody,
        styles: { fontSize: 8, font: fontName },
        headStyles: { fillColor: [59, 130, 246], font: fontName },
        columnStyles: { 0: { cellWidth: 45 }, 4: { cellWidth: 'auto' } },
      });
      yPos = (doc as any).lastAutoTable?.finalY + 8 || yPos + 40;
    }
  }

  if (data.fgrc_reasoning) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("fGRC begrunnelse:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(data.fgrc_reasoning), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  return yPos + 5;
}

function addAirRiskAnalysis(doc: any, data: any, yPos: number, pageWidth: number): number {
  if (!data) return yPos;

  yPos = checkPageBreak(doc, yPos, 50);
  yPos = addSectionHeader(doc, "LUFTROMSRISIKO (ARC)", yPos);
  doc.setFontSize(10);

  const fields: [string, string][] = [];
  if (data.aec) fields.push(["AEC (Air Encounter Category)", sanitizeForPdf(data.aec)]);
  if (data.initial_arc) fields.push(["Initial ARC", sanitizeForPdf(data.initial_arc)]);
  if (data.residual_arc) fields.push(["Residual ARC", sanitizeForPdf(data.residual_arc)]);
  if (data.tmpr_level) fields.push(["TMPR nivå", sanitizeForPdf(data.tmpr_level)]);
  if (data.vlos_exemption !== undefined) fields.push(["VLOS unntak", data.vlos_exemption ? "Ja" : "Nei"]);

  for (const [label, value] of fields) {
    yPos = checkPageBreak(doc, yPos, 8);
    setFontStyle(doc, "bold");
    doc.text(`${label}:`, 14, yPos);
    setFontStyle(doc, "normal");
    doc.text(value, 70, yPos);
    yPos += 6;
  }

  if (data.aec_reasoning) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("AEC begrunnelse:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(data.aec_reasoning), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  if (data.arc_reduction_reasoning) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("ARC-reduksjon begrunnelse:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(data.arc_reduction_reasoning), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  // Strategic mitigations
  if (data.strategic_mitigations_applied?.length > 0) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("Strategiske mitigeringer (anvendt):", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    for (const m of data.strategic_mitigations_applied) {
      yPos = checkPageBreak(doc, yPos, 6);
      doc.text(`+ ${sanitizeForPdf(m)}`, 18, yPos);
      yPos += 5;
    }
  }

  if (data.strategic_mitigations_not_applied?.length > 0) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("Strategiske mitigeringer (ikke anvendt):", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    for (const m of data.strategic_mitigations_not_applied) {
      yPos = checkPageBreak(doc, yPos, 6);
      doc.text(`- ${sanitizeForPdf(m)}`, 18, yPos);
      yPos += 5;
    }
  }

  // TMPR requirements
  if (data.tmpr_requirements) {
    yPos = checkPageBreak(doc, yPos, 20);
    setFontStyle(doc, "bold");
    doc.text("TMPR-krav:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const tmprFields = ["detect", "decide", "command", "execute", "feedback_loop"];
    const tmprLabels: Record<string, string> = { detect: "Deteksjon", decide: "Beslutning", command: "Kommando", execute: "Utførelse", feedback_loop: "Tilbakemelding" };
    for (const key of tmprFields) {
      if (data.tmpr_requirements[key]) {
        yPos = checkPageBreak(doc, yPos, 8);
        setFontStyle(doc, "bold");
        doc.text(`${tmprLabels[key]}:`, 18, yPos);
        setFontStyle(doc, "normal");
        const lines = doc.splitTextToSize(sanitizeForPdf(data.tmpr_requirements[key]), pageWidth - 40);
        doc.text(lines, 50, yPos);
        yPos += lines.length * 5;
      }
    }
  }

  return yPos + 5;
}

function addSoraOutputSection(doc: any, sora: any, yPos: number, pageWidth: number, fontName: string): number {
  if (!sora) return yPos;

  // SORA header
  yPos = checkPageBreak(doc, yPos, 40);
  yPos = addSectionHeader(doc, "SORA-ANALYSE (STEG 2 - RE-VURDERING)", yPos);
  doc.setFontSize(10);

  // Summary
  if (sora.summary) {
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.summary), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  // Key metrics
  const soraFields: [string, string][] = [];
  if (sora.environment) soraFields.push(["Miljø", sanitizeForPdf(sora.environment)]);
  if (sora.igrc != null) soraFields.push(["iGRC", String(sora.igrc)]);
  if (sora.fgrc != null) soraFields.push(["fGRC", String(sora.fgrc)]);
  if (sora.arc_initial) soraFields.push(["Initial ARC", sanitizeForPdf(sora.arc_initial)]);
  if (sora.arc_residual) soraFields.push(["Residual ARC", sanitizeForPdf(sora.arc_residual)]);
  if (sora.sail) soraFields.push(["SAIL", sanitizeForPdf(sora.sail)]);
  if (sora.residual_risk_level) soraFields.push(["Rest-risiko", sanitizeForPdf(sora.residual_risk_level)]);
  if (sora.recommendation) soraFields.push(["Anbefaling", getGoLabel(sora.recommendation)]);

  for (const [label, value] of soraFields) {
    yPos = checkPageBreak(doc, yPos, 8);
    setFontStyle(doc, "bold");
    doc.text(`${label}:`, 14, yPos);
    setFontStyle(doc, "normal");
    doc.text(value, 55, yPos);
    yPos += 6;
  }

  // ConOps
  if (sora.conops_summary) {
    yPos += 3;
    yPos = checkPageBreak(doc, yPos, 15);
    setFontStyle(doc, "bold");
    doc.text("ConOps:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.conops_summary), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  // Ground mitigations
  if (sora.ground_mitigations) {
    yPos = checkPageBreak(doc, yPos, 15);
    setFontStyle(doc, "bold");
    doc.text("Bakkemitigeringer:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.ground_mitigations), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  // Airspace mitigations
  if (sora.airspace_mitigations) {
    yPos = checkPageBreak(doc, yPos, 15);
    setFontStyle(doc, "bold");
    doc.text("Luftromsmitigeringer:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.airspace_mitigations), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 5;
  }

  // SAIL Lookup
  if (sora.sail_lookup) {
    yPos = checkPageBreak(doc, yPos, 60);
    yPos = addSectionHeader(doc, "STEG 7: SAIL-OPPSLAG", yPos);

    // Draw SAIL matrix
    const fgrcRows = ["<=2", "3", "4", "5", "6", "7"];
    const arcCols = ["a", "b", "c", "d"];
    const SAIL_MATRIX: Record<string, Record<string, string>> = {
      "<=2": { a: "I", b: "II", c: "IV", d: "VI" },
      "3": { a: "II", b: "II", c: "IV", d: "VI" },
      "4": { a: "III", b: "III", c: "IV", d: "VI" },
      "5": { a: "IV", b: "IV", c: "IV", d: "VI" },
      "6": { a: "V", b: "V", c: "V", d: "VI" },
      "7": { a: "VI", b: "VI", c: "VI", d: "VI" },
    };

    const activeRow = sora.sail_lookup.fgrc_used <= 2 ? "<=2" : String(Math.min(sora.sail_lookup.fgrc_used, 7));
    const activeCol = sora.sail_lookup.arc_used?.toLowerCase().replace("arc-", "") || null;

    const matrixBody = fgrcRows.map(row => {
      return [row, ...arcCols.map(col => {
        const val = SAIL_MATRIX[row]?.[col] || "";
        const isActive = activeRow === row && activeCol === col;
        return isActive ? `>> ${val} <<` : val;
      })];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["fGRC \\ ARC", "a", "b", "c", "d"]],
      body: matrixBody,
      styles: { fontSize: 8, font: fontName, halign: 'center' },
      headStyles: { fillColor: [59, 130, 246], font: fontName },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    });
    yPos = (doc as any).lastAutoTable?.finalY + 5 || yPos + 40;

    const lookupFields: [string, string][] = [];
    lookupFields.push(["fGRC brukt", String(sora.sail_lookup.fgrc_used)]);
    lookupFields.push(["ARC brukt", sora.sail_lookup.arc_used?.toUpperCase() || "—"]);
    lookupFields.push(["SAIL-resultat", sora.sail_lookup.result || "—"]);
    if (sora.sail_lookup.fgrc_adjustments) lookupFields.push(["Justeringer", sanitizeForPdf(sora.sail_lookup.fgrc_adjustments)]);

    for (const [label, value] of lookupFields) {
      yPos = checkPageBreak(doc, yPos, 8);
      setFontStyle(doc, "bold");
      doc.text(`${label}:`, 14, yPos);
      setFontStyle(doc, "normal");
      doc.text(value, 55, yPos);
      yPos += 6;
    }
    yPos += 3;
  }

  // Residual risk and operational limits
  if (sora.residual_risk_comment) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("Rest-risiko kommentar:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.residual_risk_comment), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  if (sora.operational_limits) {
    yPos = checkPageBreak(doc, yPos, 12);
    setFontStyle(doc, "bold");
    doc.text("Operative begrensninger:", 14, yPos);
    yPos += 5;
    setFontStyle(doc, "normal");
    const lines = doc.splitTextToSize(sanitizeForPdf(sora.operational_limits), pageWidth - 28);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5 + 3;
  }

  // Containment (Step 8)
  if (sora.containment) {
    yPos = checkPageBreak(doc, yPos, 40);
    yPos = addSectionHeader(doc, "STEG 8: CONTAINMENT", yPos);
    doc.setFontSize(10);

    setFontStyle(doc, "bold");
    doc.text(`Robusthetsnivå: ${sanitizeForPdf(sora.containment.robustness_level)}`, 14, yPos);
    yPos += 6;

    if (sora.containment.reasoning) {
      setFontStyle(doc, "normal");
      const lines = doc.splitTextToSize(sanitizeForPdf(sora.containment.reasoning), pageWidth - 28);
      doc.text(lines, 14, yPos);
      yPos += lines.length * 5 + 3;
    }

    if (sora.containment.fts_required) {
      yPos = checkPageBreak(doc, yPos, 10);
      doc.setTextColor(200, 100, 0);
      setFontStyle(doc, "bold");
      doc.text("FTS påkrevd", 14, yPos);
      yPos += 5;
      if (sora.containment.fts_note) {
        setFontStyle(doc, "normal");
        const lines = doc.splitTextToSize(sanitizeForPdf(sora.containment.fts_note), pageWidth - 28);
        doc.text(lines, 14, yPos);
        yPos += lines.length * 5;
      }
      doc.setTextColor(0);
      yPos += 3;
    }

    // Containment criteria table
    if (sora.containment.criteria?.length > 0) {
      yPos = checkPageBreak(doc, yPos, 30);
      autoTable(doc, {
        startY: yPos,
        head: [["Kriterium", "Krav", "Dokumentasjon"]],
        body: sora.containment.criteria.map((c: any) => [
          sanitizeForPdf(c.criterion),
          sanitizeForPdf(c.requirement),
          sanitizeForPdf(c.assurance),
        ]),
        styles: { fontSize: 8, font: fontName },
        headStyles: { fillColor: [59, 130, 246], font: fontName },
      });
      yPos = (doc as any).lastAutoTable?.finalY + 8 || yPos + 30;
    }
  }

  // OSO Requirements (Step 9)
  if (sora.oso_requirements?.length > 0) {
    yPos = checkPageBreak(doc, yPos, 40);
    yPos = addSectionHeader(doc, "STEG 9: OSO-KRAV", yPos);

    autoTable(doc, {
      startY: yPos,
      head: [["OSO", "Beskrivelse", "Robusthet"]],
      body: sora.oso_requirements.map((oso: any) => [
        sanitizeForPdf(oso.oso),
        sanitizeForPdf(oso.description),
        oso.robustness || "—",
      ]),
      styles: { fontSize: 8, font: fontName },
      headStyles: { fillColor: [59, 130, 246], font: fontName },
      columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 22, halign: 'center' } },
    });
    yPos = (doc as any).lastAutoTable?.finalY + 8 || yPos + 40;
  }

  return yPos;
}

export const exportRiskAssessmentPDF = async ({
  assessment,
  missionTitle,
  categoryComments,
  companyId,
  userId,
  createdAt,
  soraOutput,
  exportType = 'ai',
}: RiskExportOptions): Promise<boolean> => {
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
    const fontName = arePdfFontsLoaded() ? "Roboto" : "helvetica";

    const isSoraExport = exportType === 'sora';
    const title = isSoraExport ? "SORA-ANALYSE" : "RISIKOVURDERING";

    // Header
    let yPos = addPdfHeader(doc, title, sanitizeForPdf(missionTitle), companyName);

    if (createdAt) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Vurdert: ${formatDateForPdf(createdAt, "dd.MM.yyyy 'kl.' HH:mm")}`,
        pageWidth / 2,
        yPos - 5,
        { align: "center" }
      );
      doc.setTextColor(0);
      yPos += 3;
    }

    if (isSoraExport && soraOutput) {
      // ---- SORA EXPORT (Step 2) ----
      yPos = addSoraOutputSection(doc, soraOutput, yPos, pageWidth, fontName);
    } else {
      // ---- AI ANALYSIS EXPORT (Step 1) ----

      // Operation Classification
      if (assessment.operation_classification) {
        yPos = addOperationClassification(doc, assessment.operation_classification, yPos, pageWidth);
      }

      // Mission overview
      if (assessment.mission_overview) {
        yPos = addSectionHeader(doc, "OPPDRAGSOVERSIKT", yPos);
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        const overviewLines = doc.splitTextToSize(sanitizeForPdf(assessment.mission_overview), pageWidth - 28);
        doc.text(overviewLines, 14, yPos);
        yPos += overviewLines.length * 5 + 8;
      }

      // Assessment method
      if (assessment.assessment_method) {
        yPos = checkPageBreak(doc, yPos, 30);
        yPos = addSectionHeader(doc, "VURDERINGSMETODE", yPos);
        doc.setFontSize(10);
        setFontStyle(doc, "normal");
        const methodLines = doc.splitTextToSize(sanitizeForPdf(assessment.assessment_method), pageWidth - 28);
        doc.text(methodLines, 14, yPos);
        yPos += methodLines.length * 5 + 8;
      }

      // Overall score
      yPos = checkPageBreak(doc, yPos, 30);
      yPos = addSectionHeader(doc, "SAMLET VURDERING", yPos);
      doc.setFontSize(10);
      setFontStyle(doc, "bold");
      const recLabel = getGoLabel(assessment.recommendation);
      doc.text(`Score: ${assessment.overall_score?.toFixed(1) || "N/A"}/10 - ${recLabel}`, 14, yPos);
      yPos += 8;

      if (assessment.hard_stop_triggered && assessment.hard_stop_reason) {
        setFontStyle(doc, "normal");
        doc.setTextColor(200, 0, 0);
        const stopLines = doc.splitTextToSize(`HARD STOP: ${sanitizeForPdf(assessment.hard_stop_reason)}`, pageWidth - 28);
        doc.text(stopLines, 14, yPos);
        doc.setTextColor(0);
        yPos += stopLines.length * 5 + 5;
      }

      // Summary
      if (assessment.summary) {
        yPos = checkPageBreak(doc, yPos, 30);
        setFontStyle(doc, "normal");
        doc.setFontSize(10);
        const summaryLines = doc.splitTextToSize(sanitizeForPdf(assessment.summary), pageWidth - 28);
        doc.text(summaryLines, 14, yPos);
        yPos += summaryLines.length * 5 + 10;
      }

      // Ground Risk Analysis
      if (assessment.ground_risk_analysis) {
        yPos = addGroundRiskAnalysis(doc, assessment.ground_risk_analysis, yPos, pageWidth, fontName);
      }

      // Air Risk Analysis
      if (assessment.air_risk_analysis) {
        yPos = addAirRiskAnalysis(doc, assessment.air_risk_analysis, yPos, pageWidth);
      }

      // Category scores table
      const catEntries = getCategoryEntries(assessment.categories);
      if (catEntries.length > 0) {
        yPos = checkPageBreak(doc, yPos, 50);
        yPos = addSectionHeader(doc, "KATEGORISCORER", yPos);

        const tableBody = catEntries.map(([key, cat]: [string, any]) => [
          sanitizeForPdf(getCategoryLabel(key)),
          `${cat.score?.toFixed(1) || "N/A"}/10`,
          getGoLabel(cat.go_decision),
          sanitizeForPdf(categoryComments[key] || ""),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Kategori", "Score", "Beslutning", "Pilotkommentar"]],
          body: tableBody,
          styles: { fontSize: 9, font: fontName },
          headStyles: { fillColor: [59, 130, 246], font: fontName },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 22 },
            2: { cellWidth: 25 },
            3: { cellWidth: "auto" },
          },
        });

        yPos = (doc as any).lastAutoTable?.finalY + 10 || yPos + 40;

        // Category details
        for (const [key, cat] of catEntries) {
          const catName = getCategoryLabel(key);
          const hasContent =
            cat.factors?.length > 0 ||
            cat.positive_factors?.length > 0 ||
            cat.concerns?.length > 0 ||
            cat.actual_conditions ||
            cat.drone_status ||
            cat.experience_summary ||
            cat.complexity_factors;

          if (!hasContent) continue;

          yPos = checkPageBreak(doc, yPos, 30);
          doc.setFontSize(10);
          setFontStyle(doc, "bold");
          doc.text(sanitizeForPdf(catName), 14, yPos);
          yPos += 6;

          setFontStyle(doc, "normal");
          doc.setFontSize(9);

          const detailFields: [string, string | undefined][] = [
            ["Faktiske forhold", cat.actual_conditions],
            ["Dronestatus", cat.drone_status],
            ["Erfaringssammendrag", cat.experience_summary],
            ["Kompleksitetsfaktorer", cat.complexity_factors],
          ];

          for (const [label, value] of detailFields) {
            if (!value) continue;
            yPos = checkPageBreak(doc, yPos, 12);
            setFontStyle(doc, "bold");
            doc.text(`${label}:`, 18, yPos);
            yPos += 5;
            setFontStyle(doc, "normal");
            const lines = doc.splitTextToSize(sanitizeForPdf(value), pageWidth - 36);
            doc.text(lines, 22, yPos);
            yPos += lines.length * 5 + 3;
          }

          const factors = cat.factors || cat.positive_factors || [];
          if (factors.length > 0) {
            yPos = checkPageBreak(doc, yPos, 10);
            setFontStyle(doc, "bold");
            doc.text("Positive faktorer:", 18, yPos);
            yPos += 5;
            setFontStyle(doc, "normal");
            for (const factor of factors) {
              yPos = checkPageBreak(doc, yPos, 8);
              const lines = doc.splitTextToSize(`+ ${sanitizeForPdf(factor)}`, pageWidth - 36);
              doc.text(lines, 22, yPos);
              yPos += lines.length * 5;
            }
          }

          if (cat.concerns?.length > 0) {
            yPos = checkPageBreak(doc, yPos, 10);
            setFontStyle(doc, "bold");
            doc.text("Bekymringer:", 18, yPos);
            yPos += 5;
            setFontStyle(doc, "normal");
            for (const concern of cat.concerns) {
              yPos = checkPageBreak(doc, yPos, 8);
              const lines = doc.splitTextToSize(`- ${sanitizeForPdf(concern)}`, pageWidth - 36);
              doc.text(lines, 22, yPos);
              yPos += lines.length * 5;
            }
          }

          yPos += 4;
        }
      }

      // Recommendations
      if (assessment.recommendations?.length > 0) {
        yPos = checkPageBreak(doc, yPos, 40);
        yPos = addSectionHeader(doc, "ANBEFALTE TILTAK", yPos);
        doc.setFontSize(9);
        setFontStyle(doc, "normal");

        const priorityOrder = ["high", "medium", "low"];
        const priorityLabels: Record<string, string> = { high: "Høy", medium: "Medium", low: "Lav" };

        for (const priority of priorityOrder) {
          const items = assessment.recommendations.filter((r: any) => r.priority === priority);
          if (items.length === 0) continue;

          yPos = checkPageBreak(doc, yPos, 15);
          setFontStyle(doc, "bold");
          doc.text(`${priorityLabels[priority] || priority} prioritet:`, 14, yPos);
          yPos += 6;
          setFontStyle(doc, "normal");

          for (const item of items) {
            yPos = checkPageBreak(doc, yPos, 15);
            const actionText = item.action || item.text || (typeof item === "string" ? item : "");
            const lines = doc.splitTextToSize(`- ${sanitizeForPdf(actionText)}`, pageWidth - 32);
            doc.text(lines, 18, yPos);
            yPos += lines.length * 5;

            if (item.reason) {
              doc.setTextColor(80);
              const reasonLines = doc.splitTextToSize(`Begrunnelse: ${sanitizeForPdf(item.reason)}`, pageWidth - 40);
              doc.text(reasonLines, 22, yPos);
              yPos += reasonLines.length * 5;
              doc.setTextColor(0);
            }

            if (item.risk_addressed) {
              doc.setTextColor(80);
              const riskLines = doc.splitTextToSize(`Adresserer risiko: ${sanitizeForPdf(item.risk_addressed)}`, pageWidth - 40);
              doc.text(riskLines, 22, yPos);
              yPos += riskLines.length * 5;
              doc.setTextColor(0);
            }

            yPos += 2;
          }
          yPos += 3;
        }
      }

      // Prerequisites / go conditions
      if (assessment.prerequisites?.length > 0 || assessment.go_conditions?.length > 0) {
        yPos = checkPageBreak(doc, yPos, 30);
        yPos = addSectionHeader(doc, "FORUTSETNINGER", yPos);
        doc.setFontSize(9);
        setFontStyle(doc, "normal");

        const items = [...(assessment.prerequisites || []), ...(assessment.go_conditions || [])];
        for (const item of items) {
          yPos = checkPageBreak(doc, yPos, 8);
          const text = typeof item === "string" ? item : item.text || item.condition || "";
          const lines = doc.splitTextToSize(`- ${sanitizeForPdf(text)}`, pageWidth - 32);
          doc.text(lines, 18, yPos);
          yPos += lines.length * 5;
        }
        yPos += 5;
      }
    }

    // AI disclaimer
    yPos = checkPageBreak(doc, yPos, 30);
    doc.setFontSize(8);
    doc.setTextColor(100);
    setFontStyle(doc, "normal");
    const disclaimer =
      assessment.ai_disclaimer ||
      (isSoraExport
        ? "Denne SORA-analysen er generert som beslutningsstøtte. Pilot-in-command er ansvarlig for å vurdere risiko knyttet til oppdraget."
        : "AI risikovurdering kan brukes som beslutningsstøtte. Det er alltid pilot-in-command som selv må vurdere risikoen knyttet til oppdraget.");
    const disclaimerLines = doc.splitTextToSize(sanitizeForPdf(disclaimer), pageWidth - 28);
    doc.text(disclaimerLines, 14, yPos);
    doc.setTextColor(0);

    // Generate and upload
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const safeTitle = sanitizeFilenameForPdf(missionTitle).substring(0, 30);
    const prefix = isSoraExport ? "sora-analyse" : "risikovurdering";
    const fileName = `${prefix}-${safeTitle}-${dateStr}.pdf`;
    const pdfBlob = doc.output("blob");
    const filePath = `${companyId}/${fileName}`;

    const { data: userProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    const opprettetAv = userProfile?.full_name || "Ukjent";

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const docTitle = isSoraExport
      ? `SORA-analyse - ${sanitizeForPdf(missionTitle)} - ${formatDateForPdf(new Date(), "dd.MM.yyyy")}`
      : `Risikovurdering - ${sanitizeForPdf(missionTitle)} - ${formatDateForPdf(new Date(), "dd.MM.yyyy")}`;

    const { error: docError } = await supabase.from("documents").insert({
      tittel: docTitle,
      kategori: "risikovurderinger",
      fil_url: filePath,
      fil_navn: fileName,
      company_id: companyId,
      user_id: userId,
      opprettet_av: opprettetAv,
      beskrivelse: isSoraExport
        ? `Automatisk generert SORA-analyse for oppdrag: ${sanitizeForPdf(missionTitle)}`
        : `Automatisk generert risikovurdering for oppdrag: ${sanitizeForPdf(missionTitle)}`,
    });

    if (docError) throw docError;

    return true;
  } catch (error) {
    console.error("Error exporting risk assessment PDF:", error);
    return false;
  }
};
