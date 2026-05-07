import { bufferPolyline, bufferPolygon, computeConvexHull } from "./soraGeometry";
import { supabase } from "@/integrations/supabase/client";

interface RoutePoint {
  lat: number;
  lng: number;
}

interface SoraSettings {
  enabled: boolean;
  contingencyDistance: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
}

interface RouteData {
  coordinates: RoutePoint[];
  soraSettings?: SoraSettings;
}

interface FlightTrack {
  positions: Array<{ lat: number; lng: number }>;
}

interface MapSnapshotInput {
  latitude?: number | null;
  longitude?: number | null;
  route?: RouteData | null;
  flightTracks?: FlightTrack[];
}

// Web Mercator helpers
function lngToX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * (256 << zoom);
}

function latToY(lat: number, zoom: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y * (256 << zoom);
}

function worldToPixel(
  lat: number,
  lng: number,
  originX: number,
  originY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: lngToX(lng, zoom) - originX,
    y: latToY(lat, zoom) - originY,
  };
}

// Choose zoom level that fits bounding box inside canvas
function chooseBestZoom(
  points: RoutePoint[],
  canvasWidth: number,
  canvasHeight: number
): number {
  if (points.length === 0) return 12;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  // Add 20% padding
  const latPad = (maxLat - minLat) * 0.2 || 0.005;
  const lngPad = (maxLng - minLng) * 0.2 || 0.005;
  minLat -= latPad; maxLat += latPad;
  minLng -= lngPad; maxLng += lngPad;

  for (let zoom = 16; zoom >= 8; zoom--) {
    const x0 = lngToX(minLng, zoom);
    const x1 = lngToX(maxLng, zoom);
    const y0 = latToY(maxLat, zoom);
    const y1 = latToY(minLat, zoom);
    if (x1 - x0 <= canvasWidth * 0.85 && y1 - y0 <= canvasHeight * 0.85) {
      return zoom;
    }
  }
  return 8;
}

// Load an OSM tile as an ImageBitmap
function loadTile(x: number, y: number, zoom: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Cycle through a/b/c subdomains for load balancing
    const sub = ["a", "b", "c"][(x + y) % 3];
    img.src = `https://${sub}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 5000);
  });
}

// Draw filled+stroked polygon on canvas
function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: RoutePoint[],
  originX: number,
  originY: number,
  zoom: number,
  fillColor: string,
  strokeColor: string,
  fillAlpha: number,
  dashPattern?: number[]
) {
  if (points.length < 3) return;
  ctx.save();
  ctx.beginPath();
  const first = worldToPixel(points[0].lat, points[0].lng, originX, originY, zoom);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToPixel(points[i].lat, points[i].lng, originX, originY, zoom);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  if (dashPattern) ctx.setLineDash(dashPattern);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}

// Draw route polyline
function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: RoutePoint[],
  originX: number,
  originY: number,
  zoom: number,
  color: string,
  lineWidth: number,
  dashPattern?: number[]
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  const first = worldToPixel(points[0].lat, points[0].lng, originX, originY, zoom);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToPixel(points[i].lat, points[i].lng, originX, originY, zoom);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashPattern) ctx.setLineDash(dashPattern);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}

// Draw a circle marker
function drawMarker(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lng: number,
  originX: number,
  originY: number,
  zoom: number,
  fillColor: string,
  label?: string
) {
  const p = worldToPixel(lat, lng, originX, originY, zoom);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, p.x, p.y);
  }
  ctx.restore();
}

// Draw numbered waypoint dot
function drawWaypoint(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lng: number,
  index: number,
  originX: number,
  originY: number,
  zoom: number
) {
  const p = worldToPixel(lat, lng, originX, originY, zoom);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#1d4ed8";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 7px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index + 1), p.x, p.y);
  ctx.restore();
}

// Airspace zone type colors
const ZONE_COLORS: Record<string, { fill: string; stroke: string }> = {
  P: { fill: "#ef4444", stroke: "#b91c1c" },      // Prohibited – red
  R: { fill: "#a855f7", stroke: "#7e22ce" },      // Restricted – purple
  D: { fill: "#f97316", stroke: "#c2410c" },      // Danger – orange
  CTR: { fill: "#3b82f6", stroke: "#1d4ed8" },    // Control zone – blue
  TIZ: { fill: "#06b6d4", stroke: "#0e7490" },    // Traffic zone – cyan
  default: { fill: "#6b7280", stroke: "#374151" },
};

function zoneColors(zoneType: string) {
  return ZONE_COLORS[zoneType] || ZONE_COLORS.default;
}

// Parse PostGIS geometry JSON to array of RoutePoint arrays (handles Polygon + MultiPolygon)
function parseGeometry(geometry: unknown): RoutePoint[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as { type: string; coordinates: unknown };
  if (g.type === "Polygon") {
    const rings = g.coordinates as number[][][];
    return rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
  }
  if (g.type === "MultiPolygon") {
    const result: RoutePoint[][] = [];
    for (const poly of g.coordinates as number[][][][]) {
      for (const ring of poly) {
        result.push(ring.map(([lng, lat]) => ({ lat, lng })));
      }
    }
    return result;
  }
  return [];
}

export async function generateMissionMapSnapshot(
  input: MapSnapshotInput
): Promise<string | null> {
  try {
    const CANVAS_W = 800;
    const CANVAS_H = 400;

    const routeCoords: RoutePoint[] =
      (input.route as any)?.coordinates || [];
    const sora: SoraSettings | undefined = (input.route as any)?.soraSettings;

    // Collect all points to determine bounds (route + SORA polygons)
    const allPoints: RoutePoint[] = [...routeCoords];

    // Compute SORA polygons ahead of zoom calc
    let soraFlightGeo: RoutePoint[] = [];
    let soraContingency: RoutePoint[] = [];
    let soraGroundRisk: RoutePoint[] = [];

    if (sora?.enabled && routeCoords.length >= 1) {
      const mode = sora.bufferMode ?? "corridor";
      const makeBuffer = (dist: number) => {
        if (dist <= 0) return routeCoords;
        const isClosedRoute =
          routeCoords.length >= 3 &&
          routeCoords[0].lat === routeCoords[routeCoords.length - 1].lat &&
          routeCoords[0].lng === routeCoords[routeCoords.length - 1].lng;
        if (mode === "convexHull" || isClosedRoute) {
          const hull = computeConvexHull(routeCoords);
          return bufferPolygon(hull, dist);
        }
        return bufferPolyline(routeCoords, dist);
      };

      soraFlightGeo = bufferPolyline(routeCoords, 1);
      soraContingency = makeBuffer(sora.contingencyDistance || 50);
      soraGroundRisk = makeBuffer(
        (sora.contingencyDistance || 50) + (sora.groundRiskDistance || 100)
      );
      allPoints.push(...soraGroundRisk);
    }

    // Include flight track points in bounds
    if (input.flightTracks) {
      for (const track of input.flightTracks) {
        for (const p of track.positions || []) {
          if (Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)) {
            allPoints.push({ lat: p.lat, lng: p.lng });
          }
        }
      }
    }

    // Fall back to single point if no route
    if (allPoints.length === 0 && input.latitude && input.longitude) {
      allPoints.push({ lat: input.latitude, lng: input.longitude });
    }
    if (allPoints.length === 0) return null;

    // Choose zoom
    const zoom = chooseBestZoom(allPoints, CANVAS_W, CANVAS_H);

    // Compute center world pixel
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allPoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const centerWorldX = lngToX(centerLng, zoom);
    const centerWorldY = latToY(centerLat, zoom);
    const originX = centerWorldX - CANVAS_W / 2;
    const originY = centerWorldY - CANVAS_H / 2;

    // Determine tile range needed
    const TILE_SIZE = 256;
    const tileX0 = Math.floor(originX / TILE_SIZE);
    const tileX1 = Math.floor((originX + CANVAS_W) / TILE_SIZE);
    const tileY0 = Math.floor(originY / TILE_SIZE);
    const tileY1 = Math.floor((originY + CANVAS_H) / TILE_SIZE);
    const maxTileIndex = (1 << zoom) - 1;

    // Load all tiles in parallel
    const tilePromises: { tx: number; ty: number; promise: Promise<HTMLImageElement | null> }[] = [];
    for (let tx = tileX0; tx <= tileX1; tx++) {
      for (let ty = tileY0; ty <= tileY1; ty++) {
        const clampedTx = ((tx % (maxTileIndex + 1)) + (maxTileIndex + 1)) % (maxTileIndex + 1);
        const clampedTy = Math.max(0, Math.min(ty, maxTileIndex));
        tilePromises.push({ tx, ty, promise: loadTile(clampedTx, clampedTy, zoom) });
      }
    }
    const tileResults = await Promise.all(tilePromises.map(t => t.promise));

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d")!;

    // Draw tile background
    ctx.fillStyle = "#e8f0e8";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    tileResults.forEach((img, i) => {
      if (!img) return;
      const { tx, ty } = tilePromises[i];
      const px = tx * TILE_SIZE - originX;
      const py = ty * TILE_SIZE - originY;
      ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
    });

    // Fetch AIP restriction zones in bounds from Supabase
    try {
      const { data: zones } = await supabase
        .from("aip_restriction_zones")
        .select("zone_type, name, geometry, properties")
        .eq("is_official", true)
        .limit(80);

      if (zones) {
        for (const zone of zones) {
          const polys = parseGeometry(zone.geometry);
          const colors = zoneColors(zone.zone_type);
          for (const ring of polys) {
            drawPolygon(
              ctx, ring, originX, originY, zoom,
              colors.fill, colors.stroke, 0.25
            );
          }
        }
      }
    } catch {
      // AIP zones are best-effort
    }

    // Draw SORA zones (outermost first so inner zones draw on top)
    if (sora?.enabled) {
      if (soraGroundRisk.length >= 3) {
        drawPolygon(ctx, soraGroundRisk, originX, originY, zoom,
          "#ef4444", "#ef4444", 0.12, [6, 4]);
      }
      if (soraContingency.length >= 3) {
        drawPolygon(ctx, soraContingency, originX, originY, zoom,
          "#eab308", "#eab308", 0.15, [6, 4]);
      }
      if (soraFlightGeo.length >= 3) {
        drawPolygon(ctx, soraFlightGeo, originX, originY, zoom,
          "#22c55e", "#22c55e", 0.20);
      }
    }

    // Draw route polyline
    if (routeCoords.length >= 2) {
      drawPolyline(ctx, routeCoords, originX, originY, zoom,
        "#1d4ed8", 3, [8, 5]);
    }

    // Draw actual flight tracks (solid orange)
    if (input.flightTracks) {
      for (const track of input.flightTracks) {
        const pts = (track.positions || []).filter(
          (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
        );
        if (pts.length >= 2) {
          drawPolyline(ctx, pts, originX, originY, zoom, "#f97316", 2.5);
        }
      }
    }

    // Draw waypoints (numbered)
    if (routeCoords.length > 0) {
      // Start marker (green)
      drawMarker(ctx, routeCoords[0].lat, routeCoords[0].lng,
        originX, originY, zoom, "#16a34a", "S");
      // End marker (red) if more than 1 point
      if (routeCoords.length > 1) {
        drawMarker(ctx, routeCoords[routeCoords.length - 1].lat,
          routeCoords[routeCoords.length - 1].lng,
          originX, originY, zoom, "#dc2626", "E");
      }
      // Intermediate waypoints
      for (let i = 1; i < routeCoords.length - 1; i++) {
        drawWaypoint(ctx, routeCoords[i].lat, routeCoords[i].lng,
          i, originX, originY, zoom);
      }
    } else if (input.latitude && input.longitude) {
      // Single point fallback
      drawMarker(ctx, input.latitude, input.longitude,
        originX, originY, zoom, "#dc2626");
    }

    // Scale bar
    drawScaleBar(ctx, zoom, centerLat, CANVAS_W, CANVAS_H);

    // Attribution
    ctx.save();
    ctx.font = "9px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.textAlign = "right";
    ctx.fillText("© OpenStreetMap contributors", CANVAS_W - 5, CANVAS_H - 5);
    ctx.restore();

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("generateMissionMapSnapshot error:", err);
    return null;
  }
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  centerLat: number,
  canvasWidth: number,
  canvasHeight: number
) {
  // meters per pixel at given zoom and latitude
  const metersPerPixel =
    (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);

  const targetBarPx = 80;
  const rawMeters = metersPerPixel * targetBarPx;
  // Round to a nice number
  const niceMeters = niceNumber(rawMeters);
  const barPx = niceMeters / metersPerPixel;
  const label = niceMeters >= 1000
    ? `${(niceMeters / 1000).toFixed(1)} km`
    : `${Math.round(niceMeters)} m`;

  const x = 15;
  const y = canvasHeight - 15;

  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#000";
  ctx.font = "10px sans-serif";

  // Bar
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + barPx, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + barPx, y - 4);
  ctx.lineTo(x + barPx, y + 4);
  ctx.stroke();
  ctx.fillText(label, x + barPx / 2, y - 6);
  ctx.restore();
}

function niceNumber(n: number): number {
  const pow10 = Math.pow(10, Math.floor(Math.log10(n)));
  const frac = n / pow10;
  if (frac < 1.5) return pow10;
  if (frac < 3.5) return 2 * pow10;
  if (frac < 7.5) return 5 * pow10;
  return 10 * pow10;
}
