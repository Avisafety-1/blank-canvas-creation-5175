import jsPDF from "jspdf";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

// Import fonts as base64
import robotoRegularUrl from "@/assets/fonts/Roboto-Regular.ttf";
import robotoBoldUrl from "@/assets/fonts/Roboto-Bold.ttf";

let fontsLoaded = false;
export const arePdfFontsLoaded = () => fontsLoaded;
export const getPdfFontName = () => fontsLoaded ? 'Roboto' : 'helvetica';
let robotoRegularBase64: string | null = null;
let robotoBoldBase64: string | null = null;

/**
 * Loads the custom fonts as base64 strings for embedding in PDFs.
 * This is called once and cached for subsequent PDF generations.
 */
const loadFonts = async (): Promise<void> => {
  if (fontsLoaded) return;

  try {
    const [regularResponse, boldResponse] = await Promise.all([
      fetch(robotoRegularUrl),
      fetch(robotoBoldUrl),
    ]);

    const [regularBuffer, boldBuffer] = await Promise.all([
      regularResponse.arrayBuffer(),
      boldResponse.arrayBuffer(),
    ]);

    // Convert ArrayBuffer to base64
    robotoRegularBase64 = btoa(
      String.fromCharCode(...new Uint8Array(regularBuffer))
    );
    robotoBoldBase64 = btoa(
      String.fromCharCode(...new Uint8Array(boldBuffer))
    );

    fontsLoaded = true;
    console.log("PDF fonts loaded successfully");
  } catch (err) {
    console.warn("Could not load custom fonts for PDF, falling back to default:", err);
  }
};

/**
 * Registers custom fonts with the jsPDF document for Norwegian character support.
 */
const registerFonts = (doc: jsPDF): void => {
  if (robotoRegularBase64) {
    doc.addFileToVFS("Roboto-Regular.ttf", robotoRegularBase64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  }
  if (robotoBoldBase64) {
    doc.addFileToVFS("Roboto-Bold.ttf", robotoBoldBase64);
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  }
};

/**
 * Creates a new jsPDF document with Norwegian character support.
 * Use this instead of `new jsPDF()` directly.
 */
export const createPdfDocument = async (
  options?: ConstructorParameters<typeof jsPDF>[0]
): Promise<jsPDF> => {
  await loadFonts();
  const doc = new jsPDF(options);
  
  if (fontsLoaded) {
    registerFonts(doc);
    doc.setFont("Roboto", "normal");
  }
  
  return doc;
};

/**
 * Sets font style on a PDF document.
 * Use this instead of doc.setFont() directly when using custom fonts.
 */
export const setFontStyle = (doc: jsPDF, style: "normal" | "bold"): void => {
  if (fontsLoaded) {
    doc.setFont("Roboto", style);
  } else {
    doc.setFont("helvetica", style);
  }
};

/**
 * Sanitizes text for PDF output. With custom fonts that support Norwegian characters,
 * this now only handles special punctuation that can cause issues.
 * Norwegian characters (æøå) are preserved.
 */
export const sanitizeForPdf = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    // Special punctuation that can cause issues
    .replace(/→/g, '->').replace(/←/g, '<-')
    .replace(/–/g, '-').replace(/—/g, '-')
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '-');
};

/**
 * Creates a safe filename for PDF export by removing special characters
 * and Norwegian characters.
 */
export const sanitizeFilenameForPdf = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
};

/**
 * Formats a date for display in PDFs using Norwegian locale.
 */
export const formatDateForPdf = (date: Date | string, formatStr: string = "dd.MM.yyyy HH:mm"): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return sanitizeForPdf(format(dateObj, formatStr, { locale: nb }));
};

/**
 * Adds a signature image to a PDF document.
 * @returns The new Y position after adding the signature.
 */
export const addSignatureToPdf = async (
  doc: jsPDF,
  signatureUrl: string,
  yPos: number,
  label: string = "Signatur:"
): Promise<number> => {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load signature"));
      img.src = signatureUrl;
    });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(sanitizeForPdf(label), 14, yPos);
    
    // Calculate proportional dimensions
    const maxWidth = 60;
    const maxHeight = 30;
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    const width = img.width * ratio;
    const height = img.height * ratio;
    
    doc.addImage(img, "PNG", 14, yPos + 5, width, height);
    doc.setTextColor(0);
    
    return yPos + 5 + height + 10;
  } catch (err) {
    console.warn("Could not add signature to PDF:", err);
    return yPos;
  }
};

/**
 * Formats a duration in minutes to a human-readable string.
 */
export const formatDurationForPdf = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} t`;
  return `${hours} t ${mins} min`;
};

/**
 * Creates a standard PDF header with title and export date.
 * @returns The Y position after the header.
 */
export const addPdfHeader = (
  doc: jsPDF,
  title: string,
  subtitle?: string,
  companyName?: string
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 16;

  // Company name at top
  if (companyName) {
    doc.setFontSize(10);
    setFontStyle(doc, "normal");
    doc.setTextColor(100);
    doc.text(sanitizeForPdf(companyName), pageWidth / 2, yPos, { align: "center" });
    doc.setTextColor(0);
    yPos += 8;
  }
  
  doc.setFontSize(18);
  setFontStyle(doc, "bold");
  doc.text(sanitizeForPdf(title), pageWidth / 2, yPos, { align: "center" });
  yPos += 10;
  
  if (subtitle) {
    doc.setFontSize(14);
    setFontStyle(doc, "normal");
    doc.text(sanitizeForPdf(subtitle), pageWidth / 2, yPos, { align: "center" });
    yPos += 10;
  }
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Eksportert: ${formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`, pageWidth / 2, yPos, { align: "center" });
  doc.setTextColor(0);
  yPos += 15;
  
  return yPos;
};

/**
 * Adds a section header to the PDF.
 * @returns The new Y position after the header.
 */
export const addSectionHeader = (
  doc: jsPDF,
  title: string,
  yPos: number
): number => {
  doc.setFontSize(12);
  setFontStyle(doc, "bold");
  doc.text(sanitizeForPdf(title), 14, yPos);
  return yPos + 8;
};

/**
 * Checks if we need a new page and adds one if necessary.
 * @returns The adjusted Y position (either same or reset to top of new page).
 */
export const checkPageBreak = (
  doc: jsPDF,
  yPos: number,
  requiredSpace: number = 50
): number => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (yPos + requiredSpace > pageHeight - 20) {
    doc.addPage();
    return 20;
  }
  return yPos;
};
