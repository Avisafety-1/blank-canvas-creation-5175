// Splits manual text into chunks. Prefers heading boundaries; falls back to a
// sliding word window with overlap.

export interface ManualChunk {
  index: number;
  text: string;
  heading?: string;
}

const HEADING_RE = /\n\s*((?:\d+(?:\.\d+)*\.?\s+|CHAPTER\s+\d+|SECTION\s+\d+|KAPITTEL\s+\d+|DEL\s+\d+)[^\n]{2,120})\n/gi;
const TARGET_WORDS = 1000;
const MIN_WORDS = 200;
const OVERLAP_WORDS = 100;

function wordWindow(text: string, baseIndex: number, baseHeading?: string): ManualChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= TARGET_WORDS) {
    return [{ index: baseIndex, text: words.join(" "), heading: baseHeading }];
  }
  const chunks: ManualChunk[] = [];
  let i = 0;
  let idx = baseIndex;
  while (i < words.length) {
    const slice = words.slice(i, i + TARGET_WORDS).join(" ");
    chunks.push({ index: idx++, text: slice, heading: baseHeading });
    if (i + TARGET_WORDS >= words.length) break;
    i += TARGET_WORDS - OVERLAP_WORDS;
  }
  return chunks;
}

export function chunkManualText(rawText: string): ManualChunk[] {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  // Find heading positions
  const sections: { heading: string; start: number; end: number }[] = [];
  const matches = Array.from(text.matchAll(HEADING_RE));
  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
      sections.push({ heading: m[1].trim(), start, end });
    }
  }

  let chunks: ManualChunk[] = [];
  if (sections.length > 0) {
    let idx = 0;
    for (const s of sections) {
      const sectionText = text.slice(s.start, s.end).trim();
      if (sectionText.split(/\s+/).length < MIN_WORDS) {
        // merge tiny sections via word-window fallback later
      }
      const sub = wordWindow(sectionText, idx, s.heading);
      chunks = chunks.concat(sub);
      idx = chunks.length;
    }
  } else {
    chunks = wordWindow(text, 0);
  }

  // Filter empties
  return chunks.filter((c) => c.text && c.text.trim().length > 50);
}
