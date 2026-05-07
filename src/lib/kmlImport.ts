import JSZip from 'jszip';

interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface RouteData {
  coordinates: RouteCoordinate[];
  totalDistance: number;
  importedFileName?: string;
}

function haversineDistance(a: RouteCoordinate, b: RouteCoordinate): number {
  const R = 6371000; // metres
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function calcTotalDistance(coords: RouteCoordinate[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }
  return total;
}

/** Parse a coordinate string "lng,lat[,alt]" into {lat, lng} */
function parseCoordPair(raw: string): RouteCoordinate | null {
  const parts = raw.trim().split(',').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  return { lng: parts[0], lat: parts[1] };
}

/** Extract all coordinate pairs from a KML coordinates text node */
function parseCoordsText(text: string): RouteCoordinate[] {
  return text
    .trim()
    .split(/\s+/)
    .map(parseCoordPair)
    .filter((c): c is RouteCoordinate => c !== null);
}

function parseKmlString(kmlText: string, fileName: string): RouteData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Ugyldig KML-fil');

  let coords: RouteCoordinate[] = [];

  // 1. LineString (most common for routes)
  const lineStrings = doc.querySelectorAll('LineString coordinates');
  if (lineStrings.length > 0) {
    for (const node of lineStrings) {
      const parsed = parseCoordsText(node.textContent || '');
      if (parsed.length > coords.length) coords = parsed;
    }
  }

  // 2. DJI WPML format: Placemarks with wpml:index + Point/coordinates
  if (coords.length === 0) {
    const placemarks = Array.from(doc.querySelectorAll('Placemark')).filter(
      (pm) => pm.querySelector('wpml\\:index, [localName="index"]')
    );
    if (placemarks.length > 0) {
      // Sort by wpml:index
      const sorted = placemarks.sort((a, b) => {
        const ai = parseInt(
          a.querySelector('wpml\\:index, [localName="index"]')?.textContent || '0'
        );
        const bi = parseInt(
          b.querySelector('wpml\\:index, [localName="index"]')?.textContent || '0'
        );
        return ai - bi;
      });
      for (const pm of sorted) {
        const coordNode = pm.querySelector('Point coordinates');
        if (coordNode?.textContent) {
          const c = parseCoordPair(coordNode.textContent);
          if (c) coords.push(c);
        }
      }
    }
  }

  // 3. Polygon outer boundary
  if (coords.length === 0) {
    const ringNodes = doc.querySelectorAll(
      'Polygon outerBoundaryIs LinearRing coordinates, outerBoundaryIs LinearRing coordinates'
    );
    for (const node of ringNodes) {
      const parsed = parseCoordsText(node.textContent || '');
      if (parsed.length > coords.length) coords = parsed;
    }
  }

  // 4. Individual Point Placemarks
  if (coords.length === 0) {
    const pointNodes = doc.querySelectorAll('Placemark Point coordinates');
    for (const node of pointNodes) {
      const c = parseCoordPair(node.textContent || '');
      if (c) coords.push(c);
    }
  }

  if (coords.length === 0) {
    throw new Error('Ingen koordinater funnet i filen');
  }

  return {
    coordinates: coords,
    totalDistance: calcTotalDistance(coords),
    importedFileName: fileName,
  };
}

export async function parseKmlOrKmz(file: File): Promise<RouteData> {
  const isKmz =
    file.name.toLowerCase().endsWith('.kmz') ||
    file.type === 'application/vnd.google-earth.kmz';

  if (isKmz) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    // Try common KML file locations inside a KMZ
    const candidates = [
      'doc.kml',
      'wpmz/template.kml',
      'wpmz/waylines.wpml',
    ];

    let kmlText: string | null = null;
    for (const candidate of candidates) {
      const entry = zip.file(candidate);
      if (entry) {
        kmlText = await entry.async('text');
        break;
      }
    }

    // Fallback: first .kml or .wpml file found
    if (!kmlText) {
      zip.forEach((relativePath, zipEntry) => {
        if (!kmlText && (relativePath.endsWith('.kml') || relativePath.endsWith('.wpml'))) {
          // We'll resolve this async outside forEach
        }
      });
      const kmlFile = Object.values(zip.files).find(
        (f) => f.name.endsWith('.kml') || f.name.endsWith('.wpml')
      );
      if (kmlFile) {
        kmlText = await kmlFile.async('text');
      }
    }

    if (!kmlText) {
      throw new Error('Fant ingen KML-fil i arkivet');
    }

    return parseKmlString(kmlText, file.name);
  }

  // Plain KML
  const text = await file.text();
  return parseKmlString(text, file.name);
}
