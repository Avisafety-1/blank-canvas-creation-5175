import L from "leaflet";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon as ClipMultiPolygon, Polygon as ClipPolygon, Ring as ClipRing } from "polygon-clipping";

interface RoutePoint {
  lat: number;
  lng: number;
}

export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  flightGeographyDistance: number;
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
  droneId?: string;
}

/**
 * Builds a rounded corridor polygon around a polyline.
 * Uses a local metric projection for accurate meter-based offsets.
 */
export function bufferPolyline(
  points: RoutePoint[],
  distanceMeters: number,
  numCapSegments = 16,
  refPointOverride?: RoutePoint,
  avgLatOverride?: number
): RoutePoint[] {
  if (points.length === 0 || distanceMeters <= 0) return points;
  if (points.some(p => !isFinite(p.lat) || !isFinite(p.lng))) return points;

  const avgLat = avgLatOverride ?? points.reduce((s, p) => s + p.lat, 0) / points.length;
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(avgLat * Math.PI / 180);
  const ref = refPointOverride ?? points[0];

  // Convert to local metric coords
  const pts = points.map(p => ({
    x: (p.lng - ref.lng) * lngScale,
    y: (p.lat - ref.lat) * latScale,
  }));

  // Handle single point → circle
  if (pts.length === 1) {
    const result: RoutePoint[] = [];
    const segs = numCapSegments * 2;
    for (let i = 0; i < segs; i++) {
      const angle = (2 * Math.PI * i) / segs;
      result.push({
        lat: ref.lat + (pts[0].y + Math.sin(angle) * distanceMeters) / latScale,
        lng: ref.lng + (pts[0].x + Math.cos(angle) * distanceMeters) / lngScale,
      });
    }
    return result;
  }

  // Compute per-segment normal vectors (pointing left = outward for right-hand side)
  const segNormals: { nx: number; ny: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) {
      segNormals.push(segNormals.length > 0 ? segNormals[segNormals.length - 1] : { nx: 0, ny: 1 });
    } else {
      // Perpendicular (rotate 90° CCW): left side
      segNormals.push({ nx: -dy / len, ny: dx / len });
    }
  }

  // Helper: add a semicircular arc around a center point,
  // sweeping from startAngle to endAngle (CCW)
  function addArc(
    cx: number, cy: number,
    startAngle: number, endAngle: number,
    out: { x: number; y: number }[]
  ) {
    // Normalize sweep to go CCW (positive direction)
    let sweep = endAngle - startAngle;
    while (sweep < 0) sweep += 2 * Math.PI;
    if (sweep > 2 * Math.PI) sweep = 2 * Math.PI;
    const steps = Math.max(2, Math.round((numCapSegments * sweep) / Math.PI));
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (sweep * i) / steps;
      out.push({ x: cx + Math.cos(a) * distanceMeters, y: cy + Math.sin(a) * distanceMeters });
    }
  }

  const rightSide: { x: number; y: number }[] = [];
  const leftSide: { x: number; y: number }[] = [];

  // Build right side (forward, normal pointing outward right = -normal)
  // and left side (reversed, normal pointing outward left = +normal)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];

    if (i === 0) {
      // Start: use first segment normal only
      const n = segNormals[0];
      rightSide.push({ x: p.x - n.nx * distanceMeters, y: p.y - n.ny * distanceMeters });
      leftSide.push({ x: p.x + n.nx * distanceMeters, y: p.y + n.ny * distanceMeters });
    } else if (i === pts.length - 1) {
      // End: use last segment normal only
      const n = segNormals[segNormals.length - 1];
      rightSide.push({ x: p.x - n.nx * distanceMeters, y: p.y - n.ny * distanceMeters });
      leftSide.push({ x: p.x + n.nx * distanceMeters, y: p.y + n.ny * distanceMeters });
    } else {
      // Interior join: average adjacent normals (bisecting)
      const n1 = segNormals[i - 1];
      const n2 = segNormals[i];
      const bx = n1.nx + n2.nx;
      const by = n1.ny + n2.ny;
      const blen = Math.sqrt(bx * bx + by * by);
      if (blen < 1e-6) {
        // Parallel segments — just use one normal
        rightSide.push({ x: p.x - n1.nx * distanceMeters, y: p.y - n1.ny * distanceMeters });
        leftSide.push({ x: p.x + n1.nx * distanceMeters, y: p.y + n1.ny * distanceMeters });
      } else {
        // Scale bisector so perpendicular distance = distanceMeters
        const cos_half = (n1.nx * n2.nx + n1.ny * n2.ny + 1) / 2;
        const scale = cos_half > 0.05 ? distanceMeters / Math.sqrt(cos_half * 2) : distanceMeters * 3;
        const nbx = (bx / blen) * Math.min(scale, distanceMeters * 3);
        const nby = (by / blen) * Math.min(scale, distanceMeters * 3);
        rightSide.push({ x: p.x - nbx, y: p.y - nby });
        leftSide.push({ x: p.x + nbx, y: p.y + nby });
      }
    }
  }

  // Build the final polygon:
  // 1. Right side forward (p0 → pn)
  // 2. End cap semicircle around last point
  // 3. Left side backward (pn → p0)
  // 4. Start cap semicircle around first point

  const polygon: { x: number; y: number }[] = [];

  // Right side forward
  for (const p of rightSide) polygon.push(p);

  // End cap: from right-side last point sweeping CCW to left-side last point
  const lastN = segNormals[segNormals.length - 1];
  const endAngleRight = Math.atan2(-lastN.ny, -lastN.nx); // angle of right offset from last pt
  const endAngleLeft = Math.atan2(lastN.ny, lastN.nx);   // angle of left offset
  addArc(pts[pts.length - 1].x, pts[pts.length - 1].y, endAngleRight, endAngleLeft, polygon);

  // Left side backward
  for (let i = leftSide.length - 1; i >= 0; i--) polygon.push(leftSide[i]);

  // Start cap: from left-side first point sweeping CCW to right-side first point
  const firstN = segNormals[0];
  const startAngleLeft = Math.atan2(firstN.ny, firstN.nx);
  const startAngleRight = Math.atan2(-firstN.ny, -firstN.nx);
  addArc(pts[0].x, pts[0].y, startAngleLeft, startAngleRight, polygon);

  // Convert back to lat/lng
  return polygon.map(p => ({
    lat: ref.lat + p.y / latScale,
    lng: ref.lng + p.x / lngScale,
  }));
}

export function computeConvexHull(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 3) return points;
  let start = points[0];
  for (const p of points) {
    if (p.lat < start.lat || (p.lat === start.lat && p.lng < start.lng)) {
      start = p;
    }
  }
  const sorted = points.slice().sort((a, b) => {
    if (a === start) return -1;
    if (b === start) return 1;
    const angleA = Math.atan2(a.lng - start.lng, a.lat - start.lat);
    const angleB = Math.atan2(b.lng - start.lng, b.lat - start.lat);
    return angleA - angleB;
  });
  const hull: RoutePoint[] = [];
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.lat - a.lat) * (p.lng - b.lng) - (b.lng - a.lng) * (p.lat - b.lat);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}

function intersectLines(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function bufferPolygon(hull: RoutePoint[], distanceMeters: number, refPointOverride?: RoutePoint, avgLatOverride?: number): RoutePoint[] {
  if (hull.length < 3 || distanceMeters <= 0) return hull;
  if (hull.some(p => !isFinite(p.lat) || !isFinite(p.lng))) return hull;
  const avgLat = avgLatOverride ?? hull.reduce((s, p) => s + p.lat, 0) / hull.length;
  const latScale = 111320;
  const lngScale = 111320 * Math.cos(avgLat * Math.PI / 180);
  const ref = refPointOverride ?? hull[0];
  const pts = hull.map(p => ({
    x: (p.lng - ref.lng) * lngScale,
    y: (p.lat - ref.lat) * latScale,
  }));
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  if (signedArea < 0) pts.reverse();
  const n = pts.length;
  const offsetEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const nx = dy / len;
    const ny = -dx / len;
    offsetEdges.push({
      x1: pts[i].x + nx * distanceMeters,
      y1: pts[i].y + ny * distanceMeters,
      x2: pts[j].x + nx * distanceMeters,
      y2: pts[j].y + ny * distanceMeters,
    });
  }
  const result: RoutePoint[] = [];
  for (let i = 0; i < offsetEdges.length; i++) {
    const j = (i + 1) % offsetEdges.length;
    const e1 = offsetEdges[i];
    const e2 = offsetEdges[j];
    const ix = intersectLines(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2);
    if (ix) {
      result.push({
        lat: ref.lat + ix.y / latScale,
        lng: ref.lng + ix.x / lngScale,
      });
    }
  }
  return result.length >= 3 ? result : hull;
}

function closeClipRing(points: RoutePoint[]): ClipRing {
  const ring = points.map(p => [p.lng, p.lat] as [number, number]);
  if (ring.length === 0) return ring;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }
  return ring;
}

function fromClipMultiPolygon(multiPolygon: ClipMultiPolygon): RoutePoint[][] {
  return multiPolygon
    .map(polygon => polygon[0] ?? [])
    .map(ring => {
      const normalizedRing =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;

      return normalizedRing.map(([lng, lat]) => ({ lat, lng }));
    })
    .filter(polygon => polygon.length >= 3);
}

export function mergeBufferedCorridorPolygons(
  points: RoutePoint[],
  distanceMeters: number,
  numCapSegments = 16,
  refPointOverride?: RoutePoint,
  avgLatOverride?: number
): RoutePoint[][] {
  if (points.length === 0 || distanceMeters <= 0) return [];
  if (points.some(p => !isFinite(p.lat) || !isFinite(p.lng))) return [];

  const refPoint = refPointOverride ?? points[0];
  const avgLat = avgLatOverride ?? points.reduce((s, p) => s + p.lat, 0) / points.length;
  const clipPolygons: ClipPolygon[] = [];

  for (const point of points) {
    const circle = bufferPolyline([point], distanceMeters, numCapSegments, refPoint, avgLat);
    if (circle.length >= 3) {
      clipPolygons.push([closeClipRing(circle)]);
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start.lat === end.lat && start.lng === end.lng) continue;

    const segmentBuffer = bufferPolyline([start, end], distanceMeters, numCapSegments, refPoint, avgLat);
    if (segmentBuffer.length >= 3) {
      clipPolygons.push([closeClipRing(segmentBuffer)]);
    }
  }

  if (clipPolygons.length === 0) return [];

  let merged: ClipMultiPolygon = [clipPolygons[0]];
  for (let i = 1; i < clipPolygons.length; i++) {
    merged = polygonClipping.union(merged, clipPolygons[i]);
  }

  return fromClipMultiPolygon(merged);
}

export function renderSoraZones(
  coordinates: RoutePoint[],
  sora: SoraSettings,
  layer: L.LayerGroup
) {
  if (!sora.enabled || coordinates.length < 1) return;
  if (coordinates.some(p => !p || !isFinite(p.lat) || !isFinite(p.lng))) return;

  // Filter out null-island (0,0) coordinates which produce meaningless buffers
  const validCoords = coordinates.filter(
    p => p && isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
  );
  if (validCoords.length < 1) return;

  // Shared projection reference for all buffer calculations — prevents zone shift when switching modes
  const refPoint = validCoords[0];
  const avgLat = validCoords.reduce((s, p) => s + p.lat, 0) / validCoords.length;

  // Helper: filter NaN coordinates from buffered output before passing to Leaflet
  function safeLatLngs(zone: RoutePoint[]): [number, number][] {
    return zone
      .map(p => [p.lat, p.lng] as [number, number])
      .filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
  }

  // Use line buffer (corridor) for open polylines, polygon buffer for closed routes
  const isClosedRoute =
    validCoords.length >= 3 &&
    validCoords[0].lat === validCoords[validCoords.length - 1].lat &&
    validCoords[0].lng === validCoords[validCoords.length - 1].lng;

  function toMergedLeafletLatLngs(multiPolygon: ClipMultiPolygon): [number, number][][][] {
    return multiPolygon
      .map(polygon =>
        polygon
          .map(ring => {
            const normalizedRing =
              ring.length > 1 &&
              ring[0][0] === ring[ring.length - 1][0] &&
              ring[0][1] === ring[ring.length - 1][1]
                ? ring.slice(0, -1)
                : ring;

            return normalizedRing
              .map(([lng, lat]) => [lat, lng] as [number, number])
              .filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
          })
          .filter(ring => ring.length >= 3)
      )
      .filter(polygon => polygon.length > 0);
  }

  function makeMergedBufferLatLngs(dist: number): [number, number][][][] {
    if (dist <= 0) {
      const latLngs = safeLatLngs(validCoords);
      return latLngs.length >= 3 ? [[latLngs]] : [];
    }

    const mode = sora.bufferMode ?? "corridor";
    if (mode === "convexHull" || isClosedRoute) {
      const hull = computeConvexHull(validCoords);
      const latLngs = safeLatLngs(bufferPolygon(hull, dist, refPoint, avgLat));
      return latLngs.length >= 3 ? [[latLngs]] : [];
    }

    const clipPolygons: ClipPolygon[] = [];

    if (validCoords.length === 1) {
      const circle = bufferPolyline([validCoords[0]], dist, 16, refPoint, avgLat);
      if (circle.length >= 3) {
        clipPolygons.push([closeClipRing(circle)]);
      }
    } else {
      for (let i = 0; i < validCoords.length - 1; i++) {
        const start = validCoords[i];
        const end = validCoords[i + 1];
        if (start.lat === end.lat && start.lng === end.lng) continue;

        const segmentBuffer = bufferPolyline([start, end], dist, 16, refPoint, avgLat);
        if (segmentBuffer.length >= 3) {
          clipPolygons.push([closeClipRing(segmentBuffer)]);
        }
      }
    }

    if (clipPolygons.length === 0) return [];

    const merged = clipPolygons.slice(1).reduce<ClipMultiPolygon>(
      (acc, polygon) => polygonClipping.union(acc, polygon),
      [clipPolygons[0]]
    );
    return toMergedLeafletLatLngs(merged);
  }

  function addMergedZone(
    zoneLatLngs: [number, number][][][],
    style: L.PolylineOptions,
    popupHtml: string
  ) {
    if (zoneLatLngs.length > 0) {
      L.polygon(zoneLatLngs, style).bindPopup(popupHtml).addTo(layer);
    }
  }

  // Flight Geography Area (innermost layer, only when > 0)
  if (sora.flightGeographyDistance > 0) {
    addMergedZone(
      makeMergedBufferLatLngs(sora.flightGeographyDistance),
      { color: '#16a34a', weight: 2, fillColor: '#22c55e', fillOpacity: 0.25 },
      `<strong>Flight Geography Area</strong><br/>${sora.flightGeographyDistance}m`
    );
  }

  // Flight geography: the minimal corridor (just the route itself, with 1m buffer for fill)
  addMergedZone(
    makeMergedBufferLatLngs(1),
    { color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.10 },
    `<strong>Flight Geography</strong><br/>Høyde: ${sora.flightAltitude}m`
  );

  // Yellow contingency area
  addMergedZone(
    makeMergedBufferLatLngs(sora.flightGeographyDistance + sora.contingencyDistance),
    { color: '#eab308', weight: 2, fillColor: '#eab308', fillOpacity: 0.15, dashArray: '6, 4' },
    `<strong>Contingency Area</strong><br/>${sora.contingencyDistance}m`
  );

  // Red ground risk buffer
  addMergedZone(
    makeMergedBufferLatLngs(sora.flightGeographyDistance + sora.contingencyDistance + sora.groundRiskDistance),
    { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.12, dashArray: '6, 4' },
    `<strong>Ground Risk Buffer</strong><br/>${sora.groundRiskDistance}m`
  );
}

/**
 * Render the SORA 2.5 adjacent area boundary on the map.
 * Draws a buffered polygon that follows the ground risk buffer contour.
 */
export function renderAdjacentAreaZone(
  coordinates: RoutePoint[],
  adjacentRadiusM: number,
  layer: L.LayerGroup,
  sora?: SoraSettings
) {
  if (coordinates.length < 1 || adjacentRadiusM <= 0) return;

  const validCoords = coordinates.filter(
    p => p && isFinite(p.lat) && isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
  );
  if (validCoords.length < 1) return;

  const refPoint = validCoords[0];
  const avgLat = validCoords.reduce((s, p) => s + p.lat, 0) / validCoords.length;

  const isClosedRoute =
    validCoords.length >= 3 &&
    validCoords[0].lat === validCoords[validCoords.length - 1].lat &&
    validCoords[0].lng === validCoords[validCoords.length - 1].lng;

  function makeAdjacentBuffer(dist: number): RoutePoint[][] {
    if (dist <= 0) return [validCoords];
    const mode = sora?.bufferMode ?? "corridor";
    if (mode === "convexHull" || isClosedRoute) {
      const hull = computeConvexHull(validCoords);
      return [bufferPolygon(hull, dist, refPoint, avgLat)];
    }
    return mergeBufferedCorridorPolygons(validCoords, dist, 16, refPoint, avgLat);
  }

  function safeLatLngs(zone: RoutePoint[]): [number, number][] {
    return zone
      .map(p => [p.lat, p.lng] as [number, number])
      .filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
  }

  // Total offset = all SORA buffer layers + adjacent area radius
  const fgDist = sora?.flightGeographyDistance ?? 0;
  const cDist = sora?.contingencyDistance ?? 0;
  const grDist = sora?.groundRiskDistance ?? 0;
  const totalOffset = fgDist + cDist + grDist + adjacentRadiusM;

  const adjacentZones = makeAdjacentBuffer(totalOffset);
  for (const adjacentZone of adjacentZones) {
    const adjacentLatLngs = safeLatLngs(adjacentZone);
    if (adjacentLatLngs.length < 3) continue;

    L.polygon(adjacentLatLngs, {
      color: '#8b5cf6',
      weight: 2,
      fillColor: '#8b5cf6',
      fillOpacity: 0.15,
      dashArray: '10, 6',
    })
      .bindPopup(`<strong>Tilstøtende område</strong><br/>Radius: ${(adjacentRadiusM / 1000).toFixed(1)} km`)
      .addTo(layer);
  }
}
