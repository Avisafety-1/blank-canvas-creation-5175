import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PilotInput {
  flightHeight: number;
  operationType: string;
  isVlos: boolean;
  observerCount: number;
  atcRequired: boolean;
  proximityToPeople: string;
  criticalInfrastructure: boolean;
  backupLandingAvailable: boolean;
  skipWeatherEvaluation: boolean;
}

const normalizeRiskScore = (score: number | string | undefined | null): number | null => {
  if (score === undefined || score === null) return null;
  const numericScore = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numericScore)) return null;
  if (numericScore > 0 && numericScore < 1) return Math.round(numericScore * 10);
  return Math.max(1, Math.min(10, Math.round(numericScore)));
};

const deriveRiskRecommendation = (
  score: number | string | undefined | null,
  hardStopTriggered = false,
  fallback: string = 'caution'
): 'go' | 'caution' | 'no-go' => {
  if (hardStopTriggered) return 'no-go';
  const normalizedScore = normalizeRiskScore(score);
  if (normalizedScore === null) {
    const normalizedFallback = fallback?.toLowerCase();
    if (normalizedFallback === 'go' || normalizedFallback === 'caution' || normalizedFallback === 'no-go') {
      return normalizedFallback;
    }
    return 'caution';
  }
  if (normalizedScore >= 7) return 'go';
  if (normalizedScore >= 5) return 'caution';
  return 'no-go';
};

const normalizeDroneModelName = (value: string): string => value
  .toLowerCase()
  .replace(/\bdji\b|\bautel\b|\bparrot\b|\bskydio\b|\byuneec\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const pickBestDroneModelMatch = <T extends { name: string }>(models: T[], droneModelName: string): T | null => {
  const normalizedDroneName = normalizeDroneModelName(droneModelName);
  if (!normalizedDroneName) return null;

  const exact = models.find((model) => normalizeDroneModelName(model.name) === normalizedDroneName);
  if (exact) return exact;

  const candidates = models
    .map((model) => {
      const normalizedCatalogName = normalizeDroneModelName(model.name);
      const catalogTokens = normalizedCatalogName.split(' ').filter(Boolean);
      const droneTokens = normalizedDroneName.split(' ').filter(Boolean);
      const sharedTokens = catalogTokens.filter((token) => droneTokens.includes(token)).length;
      const contains = normalizedCatalogName.includes(normalizedDroneName) || normalizedDroneName.includes(normalizedCatalogName);
      return { model, score: (contains ? 100 : 0) + sharedTokens * 10 - Math.abs(catalogTokens.length - droneTokens.length) };
    })
    .filter((candidate) => candidate.score >= 18)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.model ?? null;
};

const isFixedWingDrone = (droneModel?: string | null, catalogCategory?: string | null): boolean => {
  const value = `${droneModel ?? ''} ${catalogCategory ?? ''}`.toLowerCase();
  return /fixed|wing|fastving|fly|plane|vtol/.test(value);
};

const calculateAlos = (characteristicDimensionM?: number | null, fixedWing = false) => {
  if (typeof characteristicDimensionM !== 'number' || !Number.isFinite(characteristicDimensionM) || characteristicDimensionM <= 0) {
    return null;
  }
  const multiplier = fixedWing ? 490 : 327;
  const offset = fixedWing ? 30 : 20;
  const alosMaxM = Math.round(multiplier * characteristicDimensionM + offset);
  return {
    alosMaxM,
    alosCalculation: `${multiplier} × ${characteristicDimensionM}m + ${offset}m = ${alosMaxM}m`,
    formula: fixedWing ? 'fixed-wing' : 'multirotor',
  };
};

type RouteCoord = { lat: number; lng: number };

const metersPerDegLat = 111_320;

const formatNbNumber = (value: number, maximumFractionDigits = 0): string =>
  value.toLocaleString('nb-NO', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });

const derivePopulationDensityBand = (densityPerKm2: number): string => {
  if (densityPerKm2 <= 0) return 'Kontrollert bakkeområde / ubebodd';
  if (densityPerKm2 < 100) return 'Tynt befolket (<100/km²)';
  if (densityPerKm2 < 500) return 'Befolket (<500/km²)';
  if (densityPerKm2 < 1500) return 'Tett befolket (<1500/km²)';
  return 'Folkemengder / svært tett befolket (>1500/km²)';
};

const GRC_DIMENSION_LIMITS = [1, 3, 8, 20, 40];
const GRC_SPEED_LIMITS = [25, 35, 75, 120, 200];
const GRC_MATRIX = [
  [[1, 2, 3, 4, 5], [1, 2, 3, 5, 6], [2, 3, 4, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9]],
  [[2, 3, 4, 5, 6], [2, 3, 4, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10]],
  [[3, 4, 5, 6, 7], [3, 4, 5, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10]],
  [[4, 5, 6, 7, 8], [4, 5, 6, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10], [7, 8, 9, 10, 10]],
  [[5, 6, 7, 8, 9], [5, 6, 7, 9, 10], [6, 7, 8, 10, 10], [7, 8, 9, 10, 10], [8, 9, 10, 10, 10]],
] as const;

const firstLimitIndex = (limits: number[], value: number): number => {
  const index = limits.findIndex((limit) => value <= limit);
  return index === -1 ? limits.length - 1 : index;
};

const populationClassIndex = (densityPerKm2: number): number => {
  if (densityPerKm2 <= 0) return 0;
  if (densityPerKm2 < 100) return 1;
  if (densityPerKm2 < 500) return 2;
  if (densityPerKm2 < 1500) return 3;
  return 4;
};

const buildDeterministicGroundRisk = ({
  characteristicDimensionM,
  maxSpeedMps,
  weightKg,
  populationDensityValue,
  populationDensityAverage,
  populationData,
  assignedEquipment,
}: {
  characteristicDimensionM: number;
  maxSpeedMps: number;
  weightKg: number | null;
  populationDensityValue: number;
  populationDensityAverage: number | null;
  populationData: any | null;
  assignedEquipment: any[];
}) => {
  const dimensionIndex = firstLimitIndex(GRC_DIMENSION_LIMITS, characteristicDimensionM);
  const speedIndex = firstLimitIndex(GRC_SPEED_LIMITS, maxSpeedMps);
  const popIndex = populationClassIndex(populationDensityValue);
  const igrc = weightKg !== null && weightKg <= 0.25 && maxSpeedMps <= 25 && popIndex < 4
    ? 1
    : GRC_MATRIX[dimensionIndex][speedIndex][popIndex];
  const controlledGroundMinimum = GRC_MATRIX[dimensionIndex][speedIndex][0];

  const parachuteEvidence = assignedEquipment.find((e: any) => {
    const text = `${e?.navn ?? ''} ${e?.type ?? ''} ${e?.beskrivelse ?? ''}`.toLowerCase();
    return /fallskjerm|parachute|moc\s*2512|dvr|design verification/.test(text);
  });
  const parachuteText = parachuteEvidence
    ? `${parachuteEvidence.navn ?? parachuteEvidence.type ?? 'Dokumentert energi-/fallskjermsystem'}`.toLowerCase()
    : '';
  const m2Reduction = parachuteText.includes('dvr') || parachuteText.includes('design verification')
    ? -2
    : parachuteEvidence && /fallskjerm|parachute|moc\s*2512/.test(parachuteText)
      ? -1
      : 0;
  const reductions = [m2Reduction].filter((r) => r < 0);
  const totalReduction = reductions.reduce((sum, reduction) => sum + reduction, 0);
  const fgrc = Math.max(controlledGroundMinimum, igrc + totalReduction);
  const dimensionClass = `≤${GRC_DIMENSION_LIMITS[dimensionIndex]} m`;
  const speedClass = `≤${GRC_SPEED_LIMITS[speedIndex]} m/s`;
  const populationBand = derivePopulationDensityBand(populationDensityValue);
  const outsideSoraNote = igrc > 7 ? ' iGRC er over 7 og ligger utenfor ordinær SORA-matrise; dette krever særskilt/sertifisert vurdering.' : '';

  return {
    characteristic_dimension: `${formatNbNumber(characteristicDimensionM, 2)} m (${dimensionClass})`,
    max_speed_category: `${formatNbNumber(maxSpeedMps, 1)} m/s (${speedClass})`,
    drone_weight_kg: weightKg,
    population_density_band: populationBand,
    population_density_value: populationDensityValue,
    population_density_average: populationDensityAverage,
    population_density_calculation: populationData?.calculation ?? null,
    population_density_driver: populationData?.driver ?? null,
    population_density_source: populationData?.dataSource ?? 'SSB befolkning på rutenett 250 m (2025)',
    population_density_footprint: populationData?.footprintDescription ?? 'Planlagt rute med operasjonsvolum og bakkerisikobuffer.',
    ssb_grid_population: populationData?.maxCellPopulation ?? null,
    ssb_grid_resolution_m: populationData?.gridResolutionM ?? 250,
    igrc,
    fgrc,
    total_reduction: fgrc - igrc,
    controlled_ground_area: populationDensityValue <= 0,
    grc_calculation_method: 'Systemberegnet etter fast SORA iGRC-matrise. AI-output kan ikke endre iGRC/fGRC.',
    igrc_table_basis: `Dimensjonsklasse ${dimensionClass}, hastighetsklasse ${speedClass}, befolkningsklasse ${populationBand}`,
    igrc_reasoning: `Systemberegnet iGRC=${igrc} fra SORA-tabellen basert på karakteristisk dimensjon ${formatNbNumber(characteristicDimensionM, 2)} m (${dimensionClass}), maks hastighet ${formatNbNumber(maxSpeedMps, 1)} m/s (${speedClass}) og dimensjonerende SSB 250 m-befolkningstetthet ${formatNbNumber(populationDensityValue)} personer/km² (${populationBand}).${outsideSoraNote}`,
    mitigations: {
      m1a_sheltering: { applicable: false, robustness: null, reduction: 0, reasoning: 'Ikke automatisk kreditert. Skjerming krever dokumentasjon på at eksponerte personer faktisk er beskyttet av strukturer.' },
      m1b_operational_restrictions: { applicable: false, robustness: null, reduction: 0, reasoning: 'Ikke automatisk kreditert. Tid-/stedbegrensninger må dokumentere ca. 90–99 % reduksjon av eksponerte personer.' },
      m1c_ground_observation: { applicable: false, robustness: null, reduction: 0, reasoning: 'Ikke automatisk kreditert. Vanlig VLOS, pilot eller luftromsobservatør gir ikke fGRC-reduksjon uten eksplisitt dokumentert bakkebasert observasjon av overflyst område og evne til å endre flygemønster.' },
      m2_impact_reduction: { applicable: m2Reduction < 0, robustness: m2Reduction === -2 ? 'High' : m2Reduction === -1 ? 'Medium' : null, reduction: m2Reduction, reasoning: m2Reduction < 0 ? `Reduksjon basert på dokumentert utstyr: ${parachuteEvidence?.navn ?? parachuteEvidence?.type}.` : 'Ingen dokumentert fallskjerm, MoC 2512 eller DVR-basert energi-/treffenergidemping funnet.' },
    },
    fgrc_reasoning: totalReduction < 0
      ? `fGRC=${fgrc}: iGRC ${igrc} med dokumentert reduksjon ${totalReduction}. M1-grensen er håndhevet slik at fGRC ikke kan bli lavere enn kontrollert-bakkeområde-verdien ${controlledGroundMinimum}.`
      : `fGRC=${fgrc}: Ingen dokumenterte GRC-reduserende mitigeringer er kreditert, derfor er fGRC lik iGRC. Observatør/pilot gir ikke automatisk -1 uten eksplisitt bakkebasert observasjon av overflyst område.`,
  };
};


const distanceMeters = (a: RouteCoord, b: RouteCoord): number => {
  const avgLat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const dx = (b.lng - a.lng) * metersPerDegLat * Math.cos(avgLat);
  const dy = (b.lat - a.lat) * metersPerDegLat;
  return Math.sqrt(dx * dx + dy * dy);
};

const distanceToSegmentMeters = (p: RouteCoord, a: RouteCoord, b: RouteCoord): number => {
  const avgLat = ((a.lat + b.lat + p.lat) / 3) * Math.PI / 180;
  const scaleLng = metersPerDegLat * Math.cos(avgLat);
  const px = p.lng * scaleLng, py = p.lat * metersPerDegLat;
  const ax = a.lng * scaleLng, ay = a.lat * metersPerDegLat;
  const bx = b.lng * scaleLng, by = b.lat * metersPerDegLat;
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = ax + t * vx, cy = ay + t * vy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
};

const nearestRouteDriver = (p: RouteCoord, route: RouteCoord[]): string => {
  if (route.length === 0) return 'innenfor operasjonens fotavtrykk';
  if (route.length === 1) return 'nær rutepunkt P1';
  let best = { distance: Infinity, label: 'innenfor operasjonens fotavtrykk' };
  route.forEach((point, index) => {
    const d = distanceMeters(p, point);
    if (d < best.distance) best = { distance: d, label: `nær rutepunkt P${index + 1}` };
  });
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegmentMeters(p, route[i], route[i + 1]);
    if (d < best.distance) best = { distance: d, label: `nær segment P${i + 1}–P${i + 2}` };
  }
  return `${best.label} (${Math.round(best.distance)} m fra senter av SSB-ruten)`;
};

async function computeSsb250PopulationDensity(route: RouteCoord[], footprintBufferM: number) {
  if (route.length < 2) return null;

  const avgLat = route.reduce((sum, p) => sum + p.lat, 0) / route.length;
  const degLat = footprintBufferM / metersPerDegLat;
  const degLng = footprintBufferM / (metersPerDegLat * Math.cos(avgLat * Math.PI / 180));
  let minLat = Math.min(...route.map(p => p.lat)) - degLat;
  let maxLat = Math.max(...route.map(p => p.lat)) + degLat;
  let minLng = Math.min(...route.map(p => p.lng)) - degLng;
  let maxLng = Math.max(...route.map(p => p.lng)) + degLng;

  const wfsUrl = `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett?service=WFS&version=1.1.0&request=GetFeature&typeNames=befolkning_250m_2025&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat}&maxFeatures=50000`;
  console.log(`Fetching SSB 250m population WFS for footprint: buffer=${footprintBufferM}m`);

  const resp = await fetch(wfsUrl, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`SSB 250m WFS ${resp.status}`);
  const gml = await resp.text();

  const cells: Array<{ population: number; centroid: RouteCoord }> = [];
  const memberRegex = /<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g;
  let match;
  while ((match = memberRegex.exec(gml)) !== null) {
    const block = match[1];
    const popMatch = block.match(/<ms:pop_tot>(\d+)<\/ms:pop_tot>/);
    const population = popMatch ? parseInt(popMatch[1], 10) : 0;
    if (population <= 0) continue;
    const posListMatch = block.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!posListMatch) continue;
    const coords = posListMatch[1].trim().split(/\s+/).map(Number);
    let sumLat = 0, sumLng = 0, count = 0;
    for (let i = 0; i < coords.length - 2; i += 2) {
      sumLat += coords[i];
      sumLng += coords[i + 1];
      count++;
    }
    if (count > 0) cells.push({ population, centroid: { lat: sumLat / count, lng: sumLng / count } });
  }

  const overlapping = cells.filter(cell => {
    for (let i = 0; i < route.length - 1; i++) {
      if (distanceToSegmentMeters(cell.centroid, route[i], route[i + 1]) <= footprintBufferM + 180) return true;
    }
    return false;
  });
  if (overlapping.length === 0) return null;

  const maxCell = overlapping.reduce((best, cell) => cell.population > best.population ? cell : best, overlapping[0]);
  const totalPopulation = overlapping.reduce((sum, cell) => sum + cell.population, 0);
  const maxDensity = maxCell.population * 16;
  const avgDensity = totalPopulation / Math.max(overlapping.length * 0.0625, 0.0625);
  const driver = nearestRouteDriver(maxCell.centroid, route);

  return {
    maxDensity,
    avgDensity,
    cellCount: overlapping.length,
    maxCellPopulation: maxCell.population,
    totalPopulation,
    gridResolutionM: 250,
    dataSource: 'SSB befolkning på rutenett 250 m (2025)',
    method: 'Høyeste overlappende 250 m-rute multipliseres med 16 for å beregne personer/km².',
    calculation: `${formatNbNumber(maxCell.population)} personer i dimensjonerende 250 m-rute × 16 = ${formatNbNumber(Math.round(maxDensity))} personer/km²`,
    footprintDescription: `Planlagt rute + Flight Geography + Contingency + Ground Risk Buffer (${formatNbNumber(Math.round(footprintBufferM))} m fra ruten).`,
    driver,
    driverCoordinate: maxCell.centroid,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { missionId, pilotInputs, droneId, soraReassessment, previousAnalysis, pilotComments } = await req.json();

    if (!missionId) {
      return new Response(JSON.stringify({ error: 'Mission ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- Concurrency gate + job tracking (Phase 2) ----
    const { data: gateProfile } = await supabase
      .from('profiles').select('company_id').eq('id', user.id).single();
    const gateCompanyId = gateProfile?.company_id ?? null;

    const MAX_CONCURRENT_PER_COMPANY = 3;
    let estimatedEtaMs = 45000;
    try {
      const { data: etaData } = await supabase.rpc('get_ai_risk_eta_ms');
      if (typeof etaData === 'number' && etaData > 0) estimatedEtaMs = etaData;
    } catch (_) { /* ignore */ }

    if (gateCompanyId) {
      const { count: runningCount } = await supabase
        .from('ai_risk_assessment_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', gateCompanyId)
        .eq('status', 'running')
        .gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if ((runningCount ?? 0) >= MAX_CONCURRENT_PER_COMPANY) {
        return new Response(JSON.stringify({
          error: 'Too many concurrent AI risk assessments for your company. Please wait a moment and try again.',
          retryAfterMs: estimatedEtaMs,
          estimatedEtaMs,
          status: 'queued',
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(estimatedEtaMs / 1000)) },
        });
      }
    }

    const jobStart = Date.now();
    const { data: jobRow } = await supabase
      .from('ai_risk_assessment_jobs')
      .insert({
        mission_id: missionId,
        company_id: gateCompanyId,
        user_id: user.id,
        status: 'running',
      })
      .select('id')
      .single();
    const jobId: string | null = jobRow?.id ?? null;

    const finishJob = async (status: 'done' | 'failed', errorMessage?: string) => {
      if (!jobId) return;
      try {
        await supabase.from('ai_risk_assessment_jobs').update({
          status,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - jobStart,
          error_message: errorMessage ?? null,
        }).eq('id', jobId);
      } catch (e) { console.error('finishJob error', e); }
    };
    // ---- End Phase 2 gate ----

    console.log(`Starting risk assessment for mission ${missionId}${soraReassessment ? ' (SORA re-assessment)' : ''}`);

    // Handle SORA re-assessment mode
    if (soraReassessment && previousAnalysis && pilotComments) {
      console.log('Running SORA re-assessment with pilot comments');

      const soraSystemPrompt = `Du er en SORA-spesialist (Specific Operations Risk Assessment) for UAS-operasjoner i henhold til EASA-rammeverket (SORA 2.5).

Du mottar en opprinnelig AI-risikovurdering og brukerens manuelle mitigeringer/forklaringer for 5 risikokategorier.
Din oppgave er å produsere en strukturert SORA-analyse basert på all tilgjengelig informasjon.

VIKTIG KONTEKST: Denne re-vurderingen ER selve den komplette SORA-analysen. Når den opprinnelige vurderingen sier "SORA er påkrevd" eller "manglende SORA", betyr det at DENNE outputen er løsningen på det kravet. Du skal IKKE gjenta bekymringer om "manglende SORA" eller "ufullstendig SORA" i summary eller andre felter — denne analysen MED dens SAIL, containment og OSO-output ER den fullstendige SORA-en.

VIKTIG: Brukerens manuelle kommentarer kan inneholde ytterligere mitigeringer som reduserer fGRC og/eller ARC utover det AI-en opprinnelig beregnet. Du MÅ vurdere disse kommentarene som gyldige mitigeringer og justere fGRC/ARC deretter FØR du slår opp SAIL.

### KONSISTENS MELLOM SCORE OG ANBEFALING
- overall_score 7.0-10.0 skal gi recommendation="go".
- overall_score 5.0-6.9 skal gi recommendation="caution" med forholdsregler.
- recommendation="no-go" skal kun brukes hvis overall_score er under 5.0 eller en faktisk hard stop/absolutt begrensning er identifisert.
- En score på 5.0 er forhøyet risiko som krever tiltak, men er IKKE no-go alene.

### STEG 7: SAIL-OPPSLAG (EKSAKT MATRISE)
Bruk den endelige fGRC (etter alle mitigeringer inkl. brukerkommentarer) og residual ARC for å slå opp SAIL:

fGRC\\ARC:   a      b      c      d
≤2           I      II     IV     VI
3            II     II     IV     VI
4            III    III    IV     VI
5            IV     IV     IV     VI
6            V      V      V      VI
7            VI     VI     VI     VI
>7           Sertifisert kategori (utenfor SORA)

Du SKAL bruke denne matrisen eksakt. Ikke gjett SAIL.

### STEG 8: CONTAINMENT
Bestem robusthetsnivå for containment basert på SAIL:
- SAIL I-II: Low robustness
- SAIL III-IV: Medium robustness
- SAIL V-VI: High robustness

Vurder fire kriterier:
1. Criterion #1 - Operational Volume Containment: Prosedyrer/systemer for å holde dronen innenfor operasjonsvolumet
2. Criterion #2 - End of Flight: Sikker avslutning av flyging ved tap av kontroll
3. Criterion #3 - Ground Risk Buffer: Tilstrekkelig buffersone for å beskytte utenforstående
4. Criterion #4 - Ground Risk Buffer Containment: Tiltak for å sikre at dronen ikke forlater GRB

Ved Medium/High robusthet kreves typisk et uavhengig termineringssystem (FTS).
VIKTIG: DJI sin innebygde funksjon for å stoppe motorene i lufta (RTH-knapp + stikke) oppfyller IKKE kravet til medium containment, da den bruker samme C2-link.
For High robusthet: Krever EASA Design Verification Report (DVR).
For forankrede droner (tethered): Egne forenklete kriterier gjelder.

### STEG 9: OSO-KRAV
Basert på SAIL-nivå, oppgi påkrevd robusthet (NR/L/M/H) for disse OSO-ene:

SAIL:           I    II   III  IV   V    VI
OSO#01          NR   L    M    M    H    H
OSO#02          NR   L    M    M    H    H
OSO#03          NR   L    L    M    H    H
OSO#04          NR   L    L    M    M    H
OSO#05          L    L    M    H    H    H
OSO#06          NR   L    L    M    H    H
OSO#07          L    L    M    H    H    H
OSO#08          NR   L    M    M    H    H
OSO#09          NR   L    M    M    H    H
OSO#10          NR   L    M    M    H    H
OSO#11          NR   L    L    M    M    H
OSO#12          NR   L    L    M    H    H
OSO#13          NR   L    L    L    M    H
OSO#14          NR   L    L    M    M    H
OSO#15          NR   NR   L    L    M    H
OSO#16          NR   L    L    M    M    H
OSO#17          NR   L    M    M    H    H
OSO#18          NR   L    L    M    M    H
OSO#19          NR   L    M    M    H    H
OSO#20          NR   L    L    M    H    H
OSO#21          NR   L    L    M    M    H
OSO#22          NR   NR   L    L    M    M
OSO#23          NR   L    M    M    H    H
OSO#24          NR   L    L    M    H    H

OSO-beskrivelser:
- OSO#01: Tilstrekkelig UAS-operatørkompetanse
- OSO#02: UAS vedlikeholdt av kompetent personell
- OSO#03: UAS utviklet til kjente standarder
- OSO#04: UAS utviklet i samsvar med anerkjent designstandard
- OSO#05: UAS designet under hensyn til systemsikkerhet
- OSO#06: C3-link ytelse tilstrekkelig
- OSO#07: Inspeksjon av UAS (pre-flight)
- OSO#08: Operasjonelle prosedyrer definert, validert og fulgt
- OSO#09: Fjernpilot kompetent og/eller trent
- OSO#10: Sikker utforming av UAS-kontrollstasjon
- OSO#11: Prosedyrer etablert for tap av C2-link
- OSO#12: UAS designet for håndtering av forverrede forhold
- OSO#13: Eksterne tjenester tilgjengelig og tilstrekkelig
- OSO#14: Informasjon til personell i operasjonsvolumet
- OSO#15: Informasjon til utenforstående i nærliggende område
- OSO#16: Multi-crew koordinering
- OSO#17: Prosedyrer for håndtering av nødsituasjoner
- OSO#18: Automatisk beskyttelse av flyvolumet
- OSO#19: Sikker gjenoppretting av kontroll eller sikker flyavslutning
- OSO#20: Prosedyrer og design for å redusere skade ved ukontrollert bevegelse
- OSO#21: Prosedyrer og design for å redusere skade ved bakkekollisjon
- OSO#22: Strategi for håndtering av menneskelige feil
- OSO#23: Prosedyrer for håndtering av forverrede eksterne forhold
- OSO#24: Vedlikeholdsrutiner og inspeksjoner

### RESPONS-FORMAT
Returner KUN gyldig JSON uten markdown-formatering. Svar ALLTID på norsk.

Returner denne JSON-strukturen:
{
  "environment": "<Tettbygd|Landlig|Sjø|Industriområde|Annet>",
  "conops_summary": "<ConOps-beskrivelse basert på oppdragets data og mitigeringer>",
  "igrc": <number 1-7>,
  "ground_mitigations": "<beskrivelse av bakkemitigeringer basert på brukerens kommentarer og AI-analyse>",
  "fgrc": <number 1-7>,
  "arc_initial": "<ARC-A|ARC-B|ARC-C|ARC-D>",
  "airspace_mitigations": "<beskrivelse av luftromsmitigeringer>",
  "arc_residual": "<ARC-A|ARC-B|ARC-C|ARC-D>",
  "sail": "<SAIL I|SAIL II|SAIL III|SAIL IV|SAIL V|SAIL VI>",
  "sail_lookup": {
    "fgrc_used": <number>,
    "arc_used": "<a|b|c|d>",
    "fgrc_adjustments": "<forklaring på justeringer fra brukerkommentarer>",
    "result": "<I|II|III|IV|V|VI>"
  },
  "containment": {
    "robustness_level": "<Low|Medium|High>",
    "reasoning": "<begrunnelse for valgt nivå>",
    "criteria": [
      { "criterion": "#1 Operational Volume Containment", "requirement": "<krav>", "assurance": "<dokumentasjonskrav>" },
      { "criterion": "#2 End of Flight", "requirement": "<krav>", "assurance": "<dokumentasjonskrav>" },
      { "criterion": "#3 Ground Risk Buffer", "requirement": "<krav>", "assurance": "<dokumentasjonskrav>" },
      { "criterion": "#4 Ground Risk Buffer Containment", "requirement": "<krav>", "assurance": "<dokumentasjonskrav>" }
    ],
    "fts_required": <true|false>,
    "fts_note": "<notat om FTS-krav, inkl. DJI-begrensning hvis relevant>",
    "tethered": <true|false>
  },
  "oso_requirements": [
    { "oso": "OSO#01", "description": "<beskrivelse>", "robustness": "<NR|L|M|H>", "category": "<technical|operational|crew>" },
    ...alle 24 OSO-er...
  ],
  "residual_risk_level": "<Lav|Moderat|Høy>",
  "residual_risk_comment": "<vurdering av rest-risiko etter alle mitigeringer>",
  "operational_limits": "<operative begrensninger og betingelser>",
  "overall_score": <number 1-10>,
  "recommendation": "<go|caution|no-go>",
  "summary": "<kort oppsummering av SORA-vurderingen — dette ER den komplette SORA-analysen, IKKE referer til 'manglende SORA'. Fokuser på reelle risikoer, mitigeringer og SAIL-resultat>"
}

### VURDERINGSPRINSIPPER
- iGRC bestemmes av operasjonsmiljø og dronens egenskaper (vekt, hastighet)
- fGRC = iGRC justert ned basert på bakkemitigeringer (sperringer, ERP, fallskjerm) OG brukerens kommentarer
- Brukerens kommentarer kan inneholde ytterligere mitigeringer som SKAL påvirke fGRC og/eller ARC
- ARC bestemmes av luftromstype og trafikktetthet, justert av brukerens luftromsmitigeringer
- SAIL = EKSAKT oppslag i matrisen basert på endelig fGRC og residual ARC
- Vær konservativ, men anerkjenn dokumenterte mitigeringer fra brukerens kommentarer`;

      const soraUserPrompt = `Generer en SORA-analyse basert på følgende data:

### Opprinnelig AI-risikovurdering:
${JSON.stringify(previousAnalysis, null, 2)}

### Brukerens mitigeringer/kommentarer per kategori:
${JSON.stringify(pilotComments, null, 2)}

VIKTIG: Vurder brukerens kommentarer nøye. De kan inneholde mitigeringer som reduserer fGRC og/eller ARC ytterligere utover det den opprinnelige AI-vurderingen fastsatte. Juster fGRC/ARC deretter FØR du beregner SAIL fra matrisen.

Analyser dataene og produser en komplett SORA-vurdering med SAIL-oppslag, containment-krav og OSO-tabell.`;

      const soraAiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: soraSystemPrompt },
            { role: 'user', content: soraUserPrompt },
          ],
        }),
      });

      if (!soraAiResponse.ok) {
        const errorText = await soraAiResponse.text();
        console.error('SORA AI gateway error:', soraAiResponse.status, errorText);
        if (soraAiResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (soraAiResponse.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${soraAiResponse.status}`);
      }

      const soraAiData = await soraAiResponse.json();
      let soraContent = soraAiData.choices?.[0]?.message?.content;
      if (!soraContent) throw new Error('No content in SORA AI response');

      soraContent = soraContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let soraAnalysis;
      try {
        soraAnalysis = JSON.parse(soraContent);
      } catch (e) {
        console.error('Failed to parse SORA AI response:', soraContent);
        throw new Error('Invalid SORA AI response format');
      }

      console.log('SORA analysis complete:', soraAnalysis.sail, soraAnalysis.residual_risk_level);

      const soraOverallScore = normalizeRiskScore(soraAnalysis.overall_score) ?? normalizeRiskScore(previousAnalysis.overall_score);
      if (soraOverallScore !== null) {
        soraAnalysis.overall_score = soraOverallScore;
      }
      soraAnalysis.recommendation = deriveRiskRecommendation(
        soraOverallScore,
        soraAnalysis.hard_stop_triggered === true,
        previousAnalysis.recommendation
      );

      // Get user's profile for company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      const companyId = profile?.company_id;

      // Save SORA output to mission_risk_assessments
      const { data: savedAssessment, error: saveError } = await supabase
        .from('mission_risk_assessments')
        .insert({
          mission_id: missionId,
          pilot_id: user.id,
          company_id: companyId,
          weather_score: previousAnalysis.categories?.weather?.score || null,
          airspace_score: previousAnalysis.categories?.airspace?.score || null,
          pilot_experience_score: previousAnalysis.categories?.pilot_experience?.score || null,
          mission_complexity_score: previousAnalysis.categories?.mission_complexity?.score || null,
          equipment_score: previousAnalysis.categories?.equipment?.score || null,
          overall_score: soraOverallScore ?? previousAnalysis.overall_score,
          recommendation: soraAnalysis.recommendation,
          ai_analysis: previousAnalysis,
          pilot_comments: pilotComments,
          sora_output: soraAnalysis,
        })
        .select()
        .single();

      if (saveError) {
        console.error('Save SORA assessment error:', saveError);
      }

      // Upsert to mission_sora table
      if (companyId) {
        const { error: soraUpsertError } = await supabase
          .from('mission_sora')
          .upsert({
            mission_id: missionId,
            company_id: companyId,
            environment: soraAnalysis.environment || null,
            conops_summary: soraAnalysis.conops_summary || null,
            igrc: soraAnalysis.igrc || null,
            ground_mitigations: soraAnalysis.ground_mitigations || null,
            fgrc: soraAnalysis.fgrc || null,
            arc_initial: soraAnalysis.arc_initial || null,
            airspace_mitigations: soraAnalysis.airspace_mitigations || null,
            arc_residual: soraAnalysis.arc_residual || null,
            sail: soraAnalysis.sail || null,
            residual_risk_level: soraAnalysis.residual_risk_level || null,
            residual_risk_comment: soraAnalysis.residual_risk_comment || null,
            operational_limits: soraAnalysis.operational_limits || null,
            sora_status: 'Under arbeid',
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
          }, { onConflict: 'mission_id', ignoreDuplicates: false });

        if (soraUpsertError) {
          console.error('SORA upsert error:', soraUpsertError);
        } else {
          console.log('SORA data synced to mission_sora table');
        }
      }

      await finishJob('done');
      return new Response(JSON.stringify({
        success: true,
        assessment: savedAssessment,
        soraAnalysis,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch mission data with related entities
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*, mission_sora(*), customers(*)')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      console.error('Mission fetch error:', missionError);
      return new Response(JSON.stringify({ error: 'Mission not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch assigned personnel for the mission
    // GDPR: Only fetch non-personal data needed for risk assessment (no names, email, phone)
    const { data: missionPersonnel, error: missionPersonnelError } = await supabase
      .from('mission_personnel')
      .select('profile_id, profiles(id, flyvetimer, tittel)')
      .eq('mission_id', missionId);

    if (missionPersonnelError) {
      console.error('Mission personnel fetch error:', missionPersonnelError);
    }

    const assignedPilots = missionPersonnel?.map((mp: any) => mp.profiles).filter(Boolean) || [];
    console.log(`Found ${assignedPilots.length} assigned personnel for mission`);
    if ((missionPersonnel?.length || 0) > 0 && assignedPilots.length === 0) {
      console.log('mission_personnel rows exist, but joined profiles were empty. Sample row:', missionPersonnel?.[0]);
    }
    // 3. Fetch assigned drones for the mission
    const { data: missionDrones } = await supabase
      .from('mission_drones')
      .select('drone_id, drones(*)')
      .eq('mission_id', missionId);

    const assignedDrones = missionDrones?.map(md => md.drones).filter(Boolean) || [];
    console.log(`Found ${assignedDrones.length} assigned drones for mission`);

    // 4. Fetch assigned equipment for the mission
    const { data: missionEquipment } = await supabase
      .from('mission_equipment')
      .select('equipment_id, equipment(*)')
      .eq('mission_id', missionId);

    const assignedEquipment = missionEquipment?.map(me => me.equipment).filter(Boolean) || [];
    console.log(`Found ${assignedEquipment.length} assigned equipment for mission`);

    // 5. Get current user's profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;

    // 6. Fetch competencies for all assigned pilots
    const pilotIds = assignedPilots.map((p: any) => p.id);
    let allCompetencies: any[] = [];
    if (pilotIds.length > 0) {
      const { data: competencies } = await supabase
        .from('personnel_competencies')
        .select('*')
        .in('profile_id', pilotIds);
      allCompetencies = competencies || [];
    }

    // 7. Fetch flight logs for assigned pilots
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    let allFlightLogs: any[] = [];
    if (pilotIds.length > 0) {
      const { data: flightLogs } = await supabase
        .from('flight_logs')
        .select('*')
        .in('user_id', pilotIds)
        .order('flight_date', { ascending: false });
      allFlightLogs = flightLogs || [];
    }

    // Build flight stats per pilot
    const pilotFlightStats = pilotIds.map((pilotId: string) => {
      const pilotLogs = allFlightLogs.filter(log => log.user_id === pilotId);
      return {
        pilotId,
        totalFlights: pilotLogs.length,
        totalMinutes: pilotLogs.reduce((sum, log) => sum + (log.flight_duration_minutes || 0), 0),
        last30Days: pilotLogs.filter(log => new Date(log.flight_date) >= thirtyDaysAgo).length,
        last90Days: pilotLogs.filter(log => new Date(log.flight_date) >= ninetyDaysAgo).length,
        lastFlightDate: pilotLogs[0]?.flight_date || null,
      };
    });

    // 8. Fetch weather data if coordinates available and not skipped
    let weatherData = null;
    const routeCoords = (mission.route as any)?.coordinates;
    const lat = mission.latitude ?? routeCoords?.[0]?.lat;
    const lng = mission.longitude ?? routeCoords?.[0]?.lng;
    
    const skipWeather = pilotInputs?.skipWeatherEvaluation === true;

    if (skipWeather) {
      console.log('Weather evaluation skipped by user request');
    } else {
      console.log(`Fetching weather for coordinates: lat=${lat}, lon=${lng}`);

      if (lat && lng) {
        try {
          const weatherResponse = await fetch(`${supabaseUrl}/functions/v1/drone-weather`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ lat, lon: lng }),
          });
          if (weatherResponse.ok) {
            weatherData = await weatherResponse.json();
            console.log(`Weather data fetched successfully: ${weatherData?.current?.temperature}°C, wind ${weatherData?.current?.wind_speed} m/s`);
          } else {
            console.error('Weather fetch failed:', weatherResponse.status, await weatherResponse.text());
          }
        } catch (e) {
          console.error('Weather fetch error:', e);
        }
      } else {
        console.log('No coordinates available for weather fetch');
      }
    }

    // 8b. Fetch solar/geomagnetic activity (Kp-index) from NOAA SWPC
    // Always provide an object so the AI prompt can include Kp consistently, even when unavailable.
    let solarActivity: { kpIndex: number | null; noaaScale: string; level: string } = {
      kpIndex: null,
      noaaScale: 'unknown',
      level: 'unavailable',
    };
    try {
      const kpRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (kpRes.ok) {
        const kpRaw: string[][] = await kpRes.json();
        // Format: [["time_tag","Kp","observed","noaa_scale"], ["2026-03-25 00:00:00","2.33","observed","0"], ...]
        // Find highest Kp for mission date
        // Extract date from mission.tidspunkt (ISO timestamp) or fall back to today
        const missionDateStr = mission.tidspunkt
          ? new Date(mission.tidspunkt).toISOString().substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        let maxKp = 0;
        let matchedDate = false;
        for (let i = 1; i < kpRaw.length; i++) {
          const row = kpRaw[i];
          if (!row || row.length < 2) continue;
          const rowDate = (row[0] || '').substring(0, 10);
          const kpVal = parseFloat(row[1]);
          if (rowDate === missionDateStr && !isNaN(kpVal) && kpVal > maxKp) {
            maxKp = kpVal;
            matchedDate = true;
          }
        }
        // If no data for mission date, check tomorrow as fallback (forecast)
        if (!matchedDate) {
          const tomorrow = new Date(missionDateStr);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().substring(0, 10);
          for (let i = 1; i < kpRaw.length; i++) {
            const row = kpRaw[i];
            if (!row || row.length < 2) continue;
            const rowDate = (row[0] || '').substring(0, 10);
            const kpVal = parseFloat(row[1]);
            if ((rowDate === missionDateStr || rowDate === tomorrowStr) && !isNaN(kpVal) && kpVal > maxKp) {
              maxKp = kpVal;
            }
          }
        }
        const roundedKp = Math.round(maxKp * 10) / 10;
        let noaaScale = 'G0';
        let level = 'low';
        if (roundedKp >= 9) { noaaScale = 'G5'; level = 'extreme'; }
        else if (roundedKp >= 8) { noaaScale = 'G4'; level = 'severe'; }
        else if (roundedKp >= 7) { noaaScale = 'G3'; level = 'strong'; }
        else if (roundedKp >= 6) { noaaScale = 'G2'; level = 'moderate'; }
        else if (roundedKp >= 5) { noaaScale = 'G1'; level = 'minor'; }

        solarActivity = { kpIndex: roundedKp, noaaScale, level };
        console.log(`Solar activity: Kp=${roundedKp}, scale=${noaaScale}, level=${level}`);
      }
    } catch (e) {
      console.error('Solar activity fetch error (non-blocking):', e);
    }

    // 9. Fetch airspace warnings
    let airspaceWarnings: any[] = [];
    if (lat && lng) {
      try {
        console.log(`Checking airspace for coordinates: lat=${lat}, lon=${lng}`);
        const { data: warnings, error: airspaceError } = await supabase.rpc('check_mission_airspace', {
          p_lat: lat,
          p_lng: lng,
          p_route: routeCoords ? JSON.parse(JSON.stringify(routeCoords)) : null,
        });
        if (airspaceError) {
          console.error('Airspace check RPC error:', airspaceError);
        } else {
          airspaceWarnings = warnings || [];
          console.log(`Airspace warnings found: ${airspaceWarnings.length}`, JSON.stringify(airspaceWarnings));
        }
      } catch (e) {
        console.error('Airspace check error:', e);
      }
    }

    // 9b. Fetch SSB Arealbruk (land use) data for ground risk classification
    let landUseData: { categories: string[]; groundRiskClassification: string; summary: string; featureCount: Record<string, number> } | null = null;
    if (lat && lng) {
      try {
        // Build bounding box from route coordinates or single point
        const allCoords: { lat: number; lng: number }[] = routeCoords && routeCoords.length > 0
          ? routeCoords
          : [{ lat, lng }];

        // Get SORA ground risk buffer distance if available
        const soraData = mission.mission_sora?.[0];
        const bufferMeters = soraData?.ground_risk_distance
          ? (soraData.contingency_distance || 50) + soraData.ground_risk_distance
          : allCoords.length === 1 ? 500 : 200;

        // Calculate bounding box with buffer
        const degPerMeterLat = 1 / 111320;
        const avgLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
        const degPerMeterLng = 1 / (111320 * Math.cos(avgLat * Math.PI / 180));

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of allCoords) {
          if (c.lat < minLat) minLat = c.lat;
          if (c.lat > maxLat) maxLat = c.lat;
          if (c.lng < minLng) minLng = c.lng;
          if (c.lng > maxLng) maxLng = c.lng;
        }
        minLat -= bufferMeters * degPerMeterLat;
        maxLat += bufferMeters * degPerMeterLat;
        minLng -= bufferMeters * degPerMeterLng;
        maxLng += bufferMeters * degPerMeterLng;

        const wfsUrl = `https://wfs.geonorge.no/skwms1/wfs.arealbruk?service=WFS&version=2.0.0&request=GetFeature&typeName=app:SsbArealbrukFlate&srsName=EPSG:4326&bbox=${minLng},${minLat},${maxLng},${maxLat},EPSG:4326&count=200`;
        console.log(`Fetching SSB Arealbruk WFS: bbox=${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}`);

        const wfsResponse = await fetch(wfsUrl, { signal: AbortSignal.timeout(8000) });
        if (wfsResponse.ok) {
          const xmlText = await wfsResponse.text();
          
          // Parse XML/GML response using regex to extract land use categories
          const arealbrukMatches = [...xmlText.matchAll(/<app:arealbruksomrade>(.*?)<\/app:arealbruksomrade>/g)].map(m => m[1]);
          const bebyggelseMatches = [...xmlText.matchAll(/<app:bebyggelsestype>(.*?)<\/app:bebyggelsestype>/g)].map(m => m[1]);
          const allCategories = [...arealbrukMatches, ...bebyggelseMatches];
          console.log(`SSB Arealbruk: ${arealbrukMatches.length} features returned, categories: ${[...new Set(allCategories)].join(', ')}`);

          // Count categories
          const featureCount: Record<string, number> = {};
          for (const cat of arealbrukMatches) {
            featureCount[cat] = (featureCount[cat] || 0) + 1;
          }
          for (const cat of bebyggelseMatches) {
            const key = `Bebyggelse:${cat}`;
            featureCount[key] = (featureCount[key] || 0) + 1;
          }

          // Classify ground risk based on SSB categories
          const allCatsLower = allCategories.map(c => c.toLowerCase());
          const hasBolig = allCatsLower.some(c => c === 'bolig' || c === 'beb' || c === 'frittliggende' || c === 'rekkehus' || c === 'blokk');
          const hasOffentlig = allCatsLower.some(c => c === 'offentligprivattjenesteyting' || c === 'skole' || c === 'sykehus');
          const hasNaering = allCatsLower.some(c => c === 'naering' || c === 'handel');
          const hasIndustri = allCatsLower.some(c => c === 'industri' || c === 'lager');
          const hasTransport = allCatsLower.some(c => c === 'transporttelek' || c === 'annenveg' || c === 'jernbane');
          const hasFritid = allCatsLower.some(c => c === 'fritid' || c === 'idrett' || c === 'park');

          let groundRiskClassification = 'low';
          let summary = 'Området inneholder hovedsakelig ubebygde/fritidsområder med lav befolkningstetthet.';

          if (hasBolig || hasOffentlig) {
            groundRiskClassification = 'high';
            const types: string[] = [];
            if (hasBolig) types.push('boligområder');
            if (hasOffentlig) types.push('offentlige tjenester/institusjoner');
            if (hasNaering) types.push('næringsbebyggelse');
            summary = `Området inneholder ${types.join(', ')} — høy befolkningstetthet, forhøyet ground risk.`;
          } else if (hasNaering || hasIndustri || hasTransport) {
            groundRiskClassification = 'moderate';
            const types: string[] = [];
            if (hasNaering) types.push('næringsbebyggelse');
            if (hasIndustri) types.push('industri');
            if (hasTransport) types.push('transportinfrastruktur');
            summary = `Området inneholder ${types.join(', ')} — moderat befolkningstetthet.`;
          }

          landUseData = {
            categories: Object.keys(featureCount),
            groundRiskClassification,
            summary,
            featureCount,
          };
          console.log(`Land use classification: ${groundRiskClassification}`, JSON.stringify(featureCount));
        } else {
          console.error('SSB Arealbruk WFS failed:', wfsResponse.status);
        }
      } catch (e) {
        console.error('SSB Arealbruk fetch error (continuing without land use data):', e);
      }
    }

    // 9c. Fetch SSB 250m population density for the operational footprint (route + SORA buffers)
    let populationData: {
      maxDensity: number;
      avgDensity: number;
      cellCount: number;
      grcImpact: 'none' | 'moderate' | 'high' | 'very_high';
      grcIncrement: number;
      summary: string;
      maxCellPopulation?: number;
      totalPopulation?: number;
      gridResolutionM?: number;
      dataSource?: string;
      method?: string;
      calculation?: string;
      footprintDescription?: string;
      driver?: string;
      driverCoordinate?: { lat: number; lng: number };
    } | null = null;

    // Befolkningstetthet beregnes fra selve flyruten og SORA-fotavtrykket,
    // ikke fra oppdragets start-/lokasjonspunkt. Krev minst 2 rutepunkter.
    if (routeCoords && routeCoords.length >= 2) {
      try {
        const soraData = mission.mission_sora?.[0];
        const routeSora = (mission.route as any)?.soraSettings;
        const fg = Number(routeSora?.flightGeographyDistance ?? soraData?.flight_geography_distance ?? 0) || 0;
        const contingency = Number(routeSora?.contingencyDistance ?? soraData?.contingency_distance ?? 50) || 50;
        const grb = Number(routeSora?.groundRiskDistance ?? soraData?.ground_risk_distance ?? 0) || 0;
        const footprintBufferM = Math.max(fg + contingency + grb, 250);
        const computed = await computeSsb250PopulationDensity(routeCoords, footprintBufferM);

        if (computed) {
          const maxDensity = computed.maxDensity;
          let grcImpact: 'none' | 'moderate' | 'high' | 'very_high' = 'none';
          let grcIncrement = 0;
          if (maxDensity >= 1500) {
            grcImpact = 'very_high';
            grcIncrement = 2;
          } else if (maxDensity >= 500) {
            grcImpact = 'high';
            grcIncrement = 1;
          } else if (maxDensity >= 100) {
            grcImpact = 'moderate';
          }

          const summary = `SSB 250 m: ${computed.calculation}. Gjennomsnitt i fotavtrykket er ${computed.avgDensity.toFixed(1)} personer/km² basert på ${computed.cellCount} overlappende ruter. Dimensjonerende rute ligger ${computed.driver}.`;
          populationData = { ...computed, grcImpact, grcIncrement, summary };
          console.log(`Population data 250m: max=${maxDensity}, avg=${computed.avgDensity.toFixed(1)}, cells=${computed.cellCount}, driver=${computed.driver}`);
        } else {
          console.log('SSB 250m population: no overlapping populated cells found inside operational footprint');
          populationData = {
            maxDensity: 0,
            avgDensity: 0,
            cellCount: 0,
            grcImpact: 'none',
            grcIncrement: 0,
            summary: 'Ingen befolkede SSB 250 m-ruter ble funnet innenfor operasjonens fotavtrykk.',
            gridResolutionM: 250,
            dataSource: 'SSB befolkning på rutenett 250 m (2025)',
            method: 'Høyeste overlappende 250 m-rute multipliseres med 16 for å beregne personer/km².',
          };
        }
      } catch (e) {
        console.error('SSB 250m population fetch error (continuing without data):', e);
      }
    }

    // 9d. Fetch company-specific SORA config
    let companySoraConfig: any = null;
    let linkedDocumentSummary = '';
    let companyRequireSora = false;
    if (companyId) {
      try {
        const { data: soraConfigData } = await supabase
          .from('company_sora_config' as any)
          .select('max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, require_civil_twilight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids')
          .eq('company_id', companyId)
          .maybeSingle();

        companySoraConfig = soraConfigData;

        // Fallback to parent company config if none found
        if (!companySoraConfig) {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('parent_company_id, require_sora_on_missions')
            .eq('id', companyId)
            .maybeSingle();

          companyRequireSora = !!(companyRow as any)?.require_sora_on_missions;

          if (companyRow?.parent_company_id) {
            const { data: parentConfig } = await supabase
              .from('company_sora_config' as any)
              .select('max_wind_speed_ms, max_wind_gust_ms, max_visibility_km, max_flight_altitude_m, require_backup_battery, require_observer, min_temp_c, max_temp_c, allow_bvlos, allow_night_flight, require_civil_twilight, max_pilot_inactivity_days, max_population_density_per_km2, operative_restrictions, policy_notes, linked_document_ids')
              .eq('company_id', companyRow.parent_company_id)
              .maybeSingle();
            if (parentConfig) {
              companySoraConfig = parentConfig;
              console.log(`Using parent company SORA config (parent_id=${companyRow.parent_company_id})`);
            }
          }
        } else {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('require_sora_on_missions')
            .eq('id', companyId)
            .maybeSingle();
          companyRequireSora = !!(companyRow as any)?.require_sora_on_missions;
        }

        if (companySoraConfig?.linked_document_ids?.length > 0) {
          const { data: linkedDocs } = await supabase
            .from('documents')
            .select('tittel, beskrivelse, kategori')
            .in('id', companySoraConfig.linked_document_ids);
          linkedDocumentSummary = linkedDocs
            ?.map((d: any) => `- ${d.tittel} (${d.kategori})${d.beskrivelse ? ': ' + d.beskrivelse : ''}`)
            .join('\n') || '';
        }
        if (companySoraConfig) {
          console.log(`Company SORA config loaded: maxWind=${companySoraConfig.max_wind_speed_ms}m/s, maxAlt=${companySoraConfig.max_flight_altitude_m}m, allowBvlos=${companySoraConfig.allow_bvlos}, allowNight=${companySoraConfig.allow_night_flight}`);
        }
      } catch (e) {
        console.error('Error fetching company SORA config (using defaults):', e);
      }
    }

    // 9e. Calculate civil twilight if required
    let civilTwilightInfo: { dawn: string; dusk: string } | null = null;
    let civilTwilightViolation = false;
    let civilTwilightMissionTime = '';
    let civilTwilightNoTime = false;
    if (companySoraConfig?.require_civil_twilight && lat && lng) {
      try {
        const missionDate = mission.tidspunkt ? new Date(mission.tidspunkt) : new Date();
        const DEG_TO_RAD = Math.PI / 180;
        const doy = Math.floor((missionDate.getTime() - new Date(missionDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        const gamma = ((2 * Math.PI) / 365) * (doy - 1);
        const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma));
        const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
        const zenith = 96;
        const latRad = lat * DEG_TO_RAD;
        const cosHA = (Math.cos(zenith * DEG_TO_RAD) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
        if (cosHA >= -1 && cosHA <= 1) {
          const ha = Math.acos(cosHA) * (180 / Math.PI);
          const dawnMin = 720 - 4 * (lng + ha) - eqTime;
          const duskMin = 720 - 4 * (lng - ha) - eqTime;
          const base = new Date(Date.UTC(missionDate.getFullYear(), missionDate.getMonth(), missionDate.getDate()));
          const dawnUTC = new Date(base.getTime() + dawnMin * 60000);
          const duskUTC = new Date(base.getTime() + duskMin * 60000);
          const fmt = (d: Date) => d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
          civilTwilightInfo = { dawn: fmt(dawnUTC), dusk: fmt(duskUTC) };
          console.log(`Civil twilight calculated: dawn=${civilTwilightInfo.dawn}, dusk=${civilTwilightInfo.dusk}`);

          // Deterministic comparison: check if mission time is outside twilight window
          if (mission.tidspunkt) {
            const missionTime = new Date(mission.tidspunkt);
            civilTwilightMissionTime = fmt(missionTime);
            if (missionTime < dawnUTC || missionTime > duskUTC) {
              civilTwilightViolation = true;
              console.log(`Civil twilight VIOLATION: mission at ${civilTwilightMissionTime} is outside ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            } else {
              console.log(`Civil twilight OK: mission at ${civilTwilightMissionTime} is within ${civilTwilightInfo.dawn}-${civilTwilightInfo.dusk}`);
            }
          } else {
            civilTwilightNoTime = true;
            console.log('Civil twilight: no mission time set, will warn');
          }
        } else {
          console.log('Civil twilight: polar conditions, no twilight boundary');
        }
      } catch (e) {
        console.error('Civil twilight calc error:', e);
      }
    }

    const effectiveDroneId = droneId || (assignedDrones[0] as any)?.id;
    const droneData: any = effectiveDroneId 
      ? assignedDrones.find((d: any) => d.id === effectiveDroneId) || assignedDrones[0]
      : null;

    let droneCatalogMatch: any = null;
    let primaryDroneCharacteristicDimensionM: number | null = null;
    let deterministicAlos: ReturnType<typeof calculateAlos> | null = null;
    if (droneData?.modell) {
      try {
        const { data: droneModels } = await supabase
          .from('drone_models' as any)
          .select('name, characteristic_dimension_m, max_speed_mps, max_wind_mps, weight_kg, category')
          .or(`name.ilike.%${droneData.modell}%,name.ilike.%${String(droneData.modell).replace(/^DJI\s+/i, '')}%`)
          .limit(20);

        droneCatalogMatch = pickBestDroneModelMatch((droneModels as any[]) || [], droneData.modell);
        primaryDroneCharacteristicDimensionM = droneCatalogMatch?.characteristic_dimension_m ?? null;
        deterministicAlos = calculateAlos(
          primaryDroneCharacteristicDimensionM,
          isFixedWingDrone(droneData.modell, droneCatalogMatch?.category),
        );
        if (primaryDroneCharacteristicDimensionM) {
          console.log(`Drone CD loaded for ALOS: ${droneData.modell} -> ${primaryDroneCharacteristicDimensionM}m (${droneCatalogMatch?.name})`);
        }
      } catch (e) {
        console.error('Drone model catalog fetch error (continuing without deterministic CD):', e);
      }
    }

    // 10. Build AI prompt
    const today = new Date();
    const validCompetencies = allCompetencies.filter((c: any) => 
      !c.utloper_dato || new Date(c.utloper_dato) > today
    );
    const expiredCompetencies = allCompetencies.filter((c: any) => 
      c.utloper_dato && new Date(c.utloper_dato) <= today
    );

    // Aggregate flight stats for all assigned pilots
    const aggregatedFlightStats = {
      totalFlights: pilotFlightStats.reduce((sum, s) => sum + s.totalFlights, 0),
      totalMinutes: pilotFlightStats.reduce((sum, s) => sum + s.totalMinutes, 0),
      last30Days: pilotFlightStats.reduce((sum, s) => sum + s.last30Days, 0),
      last90Days: pilotFlightStats.reduce((sum, s) => sum + s.last90Days, 0),
      lastFlightDate: pilotFlightStats.map(s => s.lastFlightDate).filter(Boolean).sort().reverse()[0] || null,
      flightsWithDrone: effectiveDroneId ? allFlightLogs.filter(log => log.drone_id === effectiveDroneId).length : 0,
    };

    const daysSinceLastFlight = aggregatedFlightStats.lastFlightDate 
      ? Math.floor((today.getTime() - new Date(aggregatedFlightStats.lastFlightDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const contextData = {
      mission: {
        title: mission.tittel,
        location: mission.lokasjon,
        description: mission.beskrivelse,
        scheduledTime: mission.tidspunkt,
        endTime: mission.slutt_tidspunkt,
        riskLevel: mission.risk_nivå,
        route: {
          ...(mission.route as any),
          soraSettings: (mission.route as any)?.soraSettings || null,
        },
        sora: mission.mission_sora?.[0],
        company_requires_sora_on_missions: companyRequireSora,
        customer: mission.customers?.navn,
      },
      weather: skipWeather ? { 
        skipped: true, 
        note: 'Værvurdering hoppet over etter brukerønske' 
      } : (weatherData ? {
        current: weatherData.current,
        warnings: weatherData.warnings,
        recommendation: weatherData.droneFlightRecommendation,
        bestWindow: weatherData.bestFlightWindow,
      } : null),
      airspace: {
        warnings: airspaceWarnings.map((w: any) => ({
          type: w.z_type,
          name: w.z_name,
          distance: Math.round(w.min_distance),
          inside: w.route_inside,
          severity: w.severity,
        })),
      },
      // GDPR: Anonymize pilot data before sending to AI - use identifiers instead of names
      assignedPilots: assignedPilots.map((p: any, index: number) => ({
        identifier: `Pilot ${index + 1}`,
        role: p.tittel || 'Pilot',
        totalFlightHours: p.flyvetimer || 0,
      })),
      pilotStats: {
        totalAssignedPilots: assignedPilots.length,
        totalFlights: aggregatedFlightStats.totalFlights,
        flightsLast30Days: aggregatedFlightStats.last30Days,
        flightsLast90Days: aggregatedFlightStats.last90Days,
        daysSinceLastFlight,
        flightsWithThisDrone: aggregatedFlightStats.flightsWithDrone,
        validCompetencies: validCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expires: c.utloper_dato })),
        expiredCompetencies: expiredCompetencies.map((c: any) => ({ name: c.navn, type: c.type, expired: c.utloper_dato })),
      },
      assignedDrones: assignedDrones.map((d: any) => ({
        model: d.modell,
        serialNumber: d.serienummer,
        status: d.status,
        flightHours: d.flyvetimer,
        lastInspection: d.sist_inspeksjon,
        nextInspection: d.neste_inspeksjon,
        available: d.tilgjengelig,
        class: d.klasse,
      })),
      assignedEquipment: assignedEquipment.map((e: any) => ({
        name: e.navn,
        type: e.type,
        status: e.status,
        serialNumber: e.serienummer,
        lastMaintenance: e.sist_vedlikeholdt,
        nextMaintenance: e.neste_vedlikehold,
        available: e.tilgjengelig,
      })),
      primaryDrone: droneData ? {
        model: droneData.modell,
        status: droneData.status,
        flightHours: droneData.flyvetimer,
        lastInspection: droneData.sist_inspeksjon,
        nextInspection: droneData.neste_inspeksjon,
        available: droneData.tilgjengelig,
        class: droneData.klasse,
        catalogModel: droneCatalogMatch?.name ?? null,
        category: droneCatalogMatch?.category ?? null,
        characteristicDimensionM: primaryDroneCharacteristicDimensionM,
        maxSpeedMps: droneCatalogMatch?.max_speed_mps ?? null,
        maxWindMps: droneCatalogMatch?.max_wind_mps ?? null,
        weightKg: droneCatalogMatch?.weight_kg ?? droneData.vekt ?? null,
        alos: deterministicAlos,
      } : null,
      pilotInputs: pilotInputs || {},
      landUse: landUseData,
      populationDensity: populationData,
      companyConfig: companySoraConfig ? {
        hardStops: {
          maxWindSpeedMs: companySoraConfig.max_wind_speed_ms,
          maxWindGustMs: companySoraConfig.max_wind_gust_ms,
          maxVisibilityKm: companySoraConfig.max_visibility_km,
          maxFlightAltitudeM: companySoraConfig.max_flight_altitude_m,
          requireBackupBattery: companySoraConfig.require_backup_battery,
          requireObserver: companySoraConfig.require_observer,
          minTempC: companySoraConfig.min_temp_c ?? -10,
          maxTempC: companySoraConfig.max_temp_c ?? 40,
          allowBvlos: companySoraConfig.allow_bvlos ?? false,
          allowNightFlight: companySoraConfig.allow_night_flight ?? false,
          requireCivilTwilight: companySoraConfig.require_civil_twilight ?? false,
          maxPilotInactivityDays: companySoraConfig.max_pilot_inactivity_days ?? null,
          maxPopulationDensityPerKm2: companySoraConfig.max_population_density_per_km2 ?? null,
        },
        operativeRestrictions: companySoraConfig.operative_restrictions || null,
        policyNotes: companySoraConfig.policy_notes || null,
        linkedDocuments: linkedDocumentSummary || null,
        civilTwilight: civilTwilightInfo ? { ...civilTwilightInfo, violation: civilTwilightViolation, missionTime: civilTwilightMissionTime, noTimeSet: civilTwilightNoTime } : null,
      } : null,
      solarActivity,
    };

    // Professional SMS System Prompt
    const systemPrompt = `Du er en profesjonell Safety Management System (SMS)-assistent for UAS-operasjoner.

Din oppgave er å gjennomføre en strukturert, revisjonsvennlig og beslutningsstøttende risikovurdering for et droneoppdrag i AviSafe, i tråd med EASA-prinsipper, god SMS-praksis og Human Factors.

### SCORE-SKALA (VIKTIG!)
Du skal vurdere 5 kategorier på en skala fra 1 til 10:
- 10 = LAV RISIKO (trygt, anbefalt å fly) - GRØNN
- 7-9 = MODERAT RISIKO (akseptabelt med forholdsregler) - GRØNN/GUL
- 5-6 = FORHØYET RISIKO (krever tiltak) - GUL
- 1-4 = HØY RISIKO (farlig, ikke anbefalt) - RØD

HØY SCORE = BRA (lav risiko, trygt)
LAV SCORE = DÅRLIG (høy risiko, farlig)

### KONSISTENS MELLOM SCORE OG ANBEFALING
- overall_score 7.0-10.0 skal gi recommendation="go".
- overall_score 5.0-6.9 skal gi recommendation="caution" med forholdsregler.
- recommendation="no-go" skal kun brukes hvis overall_score er under 5.0 eller HARD STOP er utløst.
- En score på 5.0 er forhøyet risiko som krever tiltak, men er IKKE no-go alene.

### GENERELLE KRAV
- Skill tydelig mellom:
  • Faktiske inputdata
  • Regel-/systemkrav
  • Operative antakelser
  • AI-baserte vurderinger
- Vurder risiko konservativt.
- Bruk klart og profesjonelt språk egnet for operative beslutninger og tilsyn.
- Dersom kritiske terskler overskrides, skal AI bruke "HARD STOP"-logikk som overstyrer numerisk score.

### HARD STOP-LOGIKK
Du SKAL returnere recommendation="no-go" og hard_stop_triggered=true hvis:
1. VÆR: Vindstyrke (middelvind) > ${companySoraConfig?.max_wind_speed_ms ?? 10} m/s ELLER vindkast > ${companySoraConfig?.max_wind_gust_ms ?? 15} m/s ELLER sikt < ${companySoraConfig?.max_visibility_km ?? 1} km ELLER kraftig nedbør
2. VÆR - TEMPERATUR: Temperatur < ${companySoraConfig?.min_temp_c ?? -10}°C ELLER > ${companySoraConfig?.max_temp_c ?? 40}°C (kritisk for LiPo-batterier)
3. UTSTYR: Drone eller kritisk utstyr har status "Rød" (MERK: "Gul" status utløser IKKE hard stop, men skal gi lavere score og anbefaling om forsiktighet)
4. PILOT: Ingen gyldige kompetanser eller alle påkrevde sertifikater er utløpt
${companySoraConfig?.max_pilot_inactivity_days ? `5. PILOT - INAKTIVITET: Pilot har ikke flydd på mer enn ${companySoraConfig.max_pilot_inactivity_days} dager → HARD STOP for å sikre recency.` : ''}
${companySoraConfig?.allow_bvlos === false ? `${companySoraConfig?.max_pilot_inactivity_days ? '6' : '5'}. BVLOS FORBUDT: Selskapet tillater IKKE BVLOS-flyging — oppdrag utenfor visuell rekkevidde er HARD STOP.` : ''}
${companySoraConfig?.allow_night_flight === false ? `NATTFLYGING FORBUDT: Selskapet tillater IKKE nattflyging — oppdrag i mørket er HARD STOP.` : ''}
${companySoraConfig?.max_population_density_per_km2 ? `BEFOLKNINGSTETTHET: Selskapet tillater IKKE flyging over områder med mer enn ${companySoraConfig.max_population_density_per_km2} pers/km² — HARD STOP hvis populationDensity.maxDensity overstiger denne verdien.` : ''}
${companySoraConfig?.require_backup_battery ? 'RESERVEBATTERI: Selskapet KREVER reservebatteri — mangler dette er det HARD STOP.' : ''}
${companySoraConfig?.require_observer ? 'OBSERVATØR: Selskapet KREVER dedikert observatør — mangler dette er det HARD STOP.' : ''}
${companySoraConfig?.require_civil_twilight && civilTwilightInfo ? (civilTwilightViolation ? `SIVIL SKUMRING — HARD STOP: Oppdraget er planlagt kl. ${civilTwilightMissionTime} som er UTENFOR sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}). Dette er et BRUDD og SKAL gi recommendation='no-go' og hard_stop_triggered=true. Forklar i rapporten at tidspunktet bryter selskapets krav om flyging innenfor sivil skumring.` : civilTwilightNoTime ? `SIVIL SKUMRING — ADVARSEL: Selskapet krever flyging innenfor sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}), men oppdraget har ingen planlagt tid. Gi advarsel i rapporten om at tidspunkt MÅ bekreftes innenfor skumringstidene før flyging.` : `SIVIL SKUMRING: OK — Oppdraget kl. ${civilTwilightMissionTime} er innenfor sivil skumring (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk}). Bekreft kort i rapporten at skumringstid er overholdt.`) : ''}
VIKTIG: Høy piloterfaring kan IKKE kompensere for tekniske eller meteorologiske overskridelser. HARD STOP skal utløses uavhengig av andre scores.

${companySoraConfig ? `### SELSKAPSINNSTILLINGER (OBLIGATORISK — OVERSTYRER SYSTEM-DEFAULTS)
Feltet "companyConfig" inneholder selskapets egne krav som ALLTID gjelder:

HARDSTOP-GRENSER (absolutte, ikke forhandlingsbare):
- Max vindstyrke: ${companySoraConfig.max_wind_speed_ms} m/s
- Max vindkast: ${companySoraConfig.max_wind_gust_ms} m/s
- Min sikt: ${companySoraConfig.max_visibility_km} km
- Max flyhøyde: ${companySoraConfig.max_flight_altitude_m} m AGL
- Temperaturvindu: ${companySoraConfig.min_temp_c ?? -10}°C til ${companySoraConfig.max_temp_c ?? 40}°C
- BVLOS tillatt: ${companySoraConfig.allow_bvlos ? 'Ja' : 'NEI — HARD STOP ved BVLOS'}
- Nattflyging tillatt: ${companySoraConfig.allow_night_flight ? 'Ja' : 'NEI — HARD STOP ved nattoppdrag'}
${companySoraConfig.max_pilot_inactivity_days ? `- Maks pilotinaktivitet: ${companySoraConfig.max_pilot_inactivity_days} dager` : ''}
${companySoraConfig.max_population_density_per_km2 ? `- Maks befolkningstetthet: ${companySoraConfig.max_population_density_per_km2} pers/km²` : ''}
- Krev reservebatteri: ${companySoraConfig.require_backup_battery ? 'JA — OBLIGATORISK' : 'Nei'}
- Krev observatør: ${companySoraConfig.require_observer ? 'JA — OBLIGATORISK' : 'Nei'}
${companySoraConfig.require_civil_twilight ? `- Krev sivil skumring: JA — HARD STOP utenfor dawn/dusk${civilTwilightInfo ? ` (dawn: ${civilTwilightInfo.dawn}, dusk: ${civilTwilightInfo.dusk})` : ''}` : ''}

Hvis flyhøyde i oppdraget overstiger ${companySoraConfig.max_flight_altitude_m} m AGL, SKAL recommendation="no-go" og hard_stop_triggered=true returneres.

${companySoraConfig.operative_restrictions ? `OPERATIVE BEGRENSNINGER FRA SELSKAPET:\n${companySoraConfig.operative_restrictions}` : ''}

${companySoraConfig.policy_notes ? `SELSKAPETS OPERASJONSMANUAL — NØKKELPUNKTER (les og bruk aktivt):\n${companySoraConfig.policy_notes}\n\nVurder om oppdraget er i tråd med disse reglene. Nevn avvik eksplisitt i concerns.` : ''}

${linkedDocumentSummary ? `TILKNYTTEDE POLICYDOKUMENTER (referanse for AI):\n${linkedDocumentSummary}` : ''}` : ''}

### FORUTSETNINGER
Anta alltid at piloten vil:
- Utføre pre-flight sjekk før avgang
- Programmere RTH (Return to Home)
- Gjennomføre visuell inspeksjon av dronen
Disse skal kommenteres som forutsetninger i prerequisites.

### DUGGPUNKT OG ISINGSRISIKO (VIKTIG — KORREKT LOGIKK)
Værdata kan inneholde duggpunktstemperatur (dew_point_temperature).
- LITEN differanse mellom lufttemperatur og duggpunkt = HØY risiko for kondens/ising/tåke
- STOR differanse = LAV risiko (tørr luft, trygt)
Terskler:
- Differanse < 1°C: ADVARSEL — svært høy risiko for kondens, tåke og ising på sensorer/propeller/elektronikk
- Differanse < 3°C: FORSIKTIGHET — moderat risiko, overvåk nøye
- Differanse < 5°C: MERKNAD — noe forhøyet fuktighet
- Differanse > 5°C: OK — lav isingsrisiko
ALDRI si at høy differanse øker risikoen — det er FEIL. Høy differanse betyr tørr luft og er positivt.

${skipWeather ? '### VÆR-MERKNAD\nBruker har valgt å hoppe over værvurdering. Sett weather.score til 7, weather.go_decision til "BETINGET", og noter at vær må vurderes separat før flyging.' : ''}

### VLOS / BVLOS-VURDERING
Pilotens input angir om operasjonen er VLOS eller BVLOS (isVlos-feltet i pilotInputs).

Hvis BVLOS (isVlos = false):
- Sjekk om SORA-analyse finnes (mission.sora). Hvis ingen SORA finnes:
  - IKKE skriv at "manglende SORA er en betydelig bekymring" eller lignende vage bekymringer.
  - I stedet: legg til en konkret anbefaling: "SORA-analyse påkrevd for BVLOS. Kommenter på identifiserte risikoer i denne analysen og kjør en re-vurdering — re-vurderingen vil generere den komplette SORA-analysen (SAIL, containment, OSO)."
  - Reduser overall_score med 3 og legg til NO-GO-anbefaling med samme tekst.
- Krev spesifikke BVLOS-kompetanser (STS-02, BVLOS-sertifisering e.l.). Reduser pilot_experience score med 2 hvis mangler.
- Vurder behov for C2-link (command & control), DAA (detect and avoid), og redundante systemer.
- Reduser mission_complexity score med 1-2 pga. økt operasjonell kompleksitet.
- Legg til spesifikke BVLOS-anbefalinger i recommendations (kommunikasjonsplan, nødstopp-prosedyrer, lost-link-prosedyre).

Hvis VLOS (isVlos = true):
- Standard vurdering uten ekstra BVLOS-krav.
- Observer-behov vurderes basert på observerCount.

### LUFTRISIKO — AEC, ARC OG TMPR (EASA SORA)
Du SKAL alltid utføre en strukturert luftrisikoanalyse og returnere den i feltet "air_risk_analysis".

#### Steg 1: Bestem AEC (Air Encounter Category)
Bruk følgende tabell basert på luftromsklasse, høyde og lokasjon:

| AEC | Beskrivelse | ARC |
|-----|------------|-----|
| AEC 1 | Luftrom klasse A (IFR only) | ARC-d |
| AEC 2 | Luftrom klasse B (alle separert) | ARC-d |
| AEC 3 | Luftrom klasse C, over 500 ft | ARC-d |
| AEC 4 | Luftrom klasse C, under 500 ft | ARC-c |
| AEC 5 | Luftrom klasse D, over 500 ft | ARC-d |
| AEC 6 | Luftrom klasse D, under 500 ft | ARC-c |
| AEC 7 | Luftrom klasse E/F, over 500 ft | ARC-c |
| AEC 8 | Luftrom klasse E/F, under 500 ft | ARC-b |
| AEC 9 | Luftrom klasse G, over 500 ft, Mode-S/TMZ | ARC-c |
| AEC 10 | Luftrom klasse G, over 500 ft, uten Mode-S | ARC-c |
| AEC 11 | Luftrom klasse G, under 500 ft, urbant | ARC-b |
| AEC 12 | Luftrom klasse G, under 500 ft, landlig | ARC-b |

Bruk kontekstdata:
- airspace.warnings: Sjekk om CTR/TIZ (kontrollert luftrom) er i nærheten → klasse D typisk
- pilotInputs.flightHeight: Over/under 500 ft (~150m)
- landUse/populationDensity: Urbant vs landlig
- Hvis ingen spesifikke luftromsadvarsler: Anta klasse G (ukontrollert)

#### Steg 2: Bestem initiell ARC (iARC)
Sett iARC direkte fra AEC-tabellen ovenfor.

#### Steg 3: Vurder strategiske mitigeringer (kan redusere ARC)
Strategiske mitigeringer kan redusere ARC med opptil 2 nivåer totalt:

**Operasjonelle restriksjoner (maks 2 nivåer reduksjon):**
- Avgrensning av operasjonsområdet til område med lite bemannet trafikk
- Tidspunkt valgt med lav trafikkforventning (tidlig morgen, sein kveld, vinter)
- Kort eksponering i luftrommet (kort flygetid)

**Regler og luftromsstruktur (maks 1 ekstra nivå, KUN under 500 ft):**
- NOTAM publisert 12+ timer før (obligatorisk for BVLOS uten observatør)
- Elektronisk synlighet (ADS-B/ADS-L sender, SafeSky)
- Klarering fra kontrolltårn (Ninox drone)
- Koordinering med lufttrafikktjeneste

**Luftromsanalyse:**
- For å redusere til ARC-c: Vis at operasjonsvolumet har trafikk som ARC-c luftrom
- For å redusere til ARC-b: Vis at det tilsvarer luftrom under 500 ft i landlige områder
- For å redusere til ARC-a: Vis at det tilsvarer segregert luftrom (fareområde, svært lav høyde nær hindre)

Atypisk luftrom (ARC-a) er definert som luftrom der risiko for kollisjon mellom drone og bemannet luftfart er akseptabelt lav uten taktiske mitigeringer. Eksempler: reservert luftrom, operasjoner i svært lav høyde nær objekter/bakken (under 30m over bakken, eller innenfor 30m fra hindre under 20m, eller innenfor 15m fra hindre over 20m).

#### Steg 4: Bestem residual ARC
Sett residual ARC etter å ha vurdert alle relevante mitigeringer.

#### Steg 5: Bestem TMPR-nivå og krav
Basert på residual ARC og flygemodus:

| Residual ARC | TMPR-nivå | Robusthetsnivå |
|---|---|---|
| ARC-d | High | Høy |
| ARC-c | Medium | Middels |
| ARC-b | Low | Lav |
| ARC-a | None | Ingen krav |

VLOS-operasjon eller BVLOS med luftromsobservatør anses som akseptabel taktisk mitigering for alle ARC-klasser.

For BVLOS uten observatør, angi spesifikke TMPR-krav for de 5 funksjonene:
- **Detect**: Hvordan detektere bemannet trafikk (ADS-B mottaker, SafeSky, Flightradar24, FLARM/ADS-L)
- **Decide**: Dokumentert unnvikelsesprosedyre
- **Command**: C2-link latenskrav
- **Execute**: Dronens evne til å utføre unnvikelsesmanøver
- **Feedback Loop**: Oppdateringsrate og latens for posisjonsinformasjon

#### Steg 6: Deteksjonsanbefalinger
Anbefal konkrete deteksjonssystemer basert på operasjonstype og luftrom:
- Innebygd ADS-B mottaker (1090 MHz)
- ADS-L mottaker (868 MHz, for seilfly/FLARM)
- SafeSky (app-basert posisjonsdeling)
- Flightradar24 (sjekk dekningsgrad for operasjonsområdet)
- Luftromsobservatør (maks 1-3 km fra observatør)
- Flyradio (lytte på relevant frekvens nær landingsplasser)

Hvis operasjonen er VLOS, sett vlos_exemption=true og forenkle TMPR-kravene.

### BAKKERISIKO — iGRC OG fGRC (EASA SORA Steg 2-3)
Du SKAL alltid utføre en strukturert bakkerisikoanalyse og returnere den i feltet "ground_risk_analysis".

#### Steg 1: Bestem iGRC (Inherent Ground Risk Class)
Bruk dronens karakteristiske dimensjon (diagonalt mellom propelltuppene for multirotor, vingespenn for fly) og maks hastighet.

**iGRC-tabell (karakteristisk dimensjon × befolkningstetthet):**

| Max dimensjon | ≤25 m/s | ≤35 m/s | ≤75 m/s | ≤120 m/s | ≤200 m/s |
|---|---|---|---|---|---|
| ≤1m | 1/2/3/4/5 | 1/2/3/5/6 | 2/3/4/6/7 | 3/4/5/7/8 | 4/5/6/8/9 |
| ≤3m | 2/3/4/5/6 | 2/3/4/6/7 | 3/4/5/7/8 | 4/5/6/8/9 | 5/6/7/9/10 |
| ≤8m | 3/4/5/6/7 | 3/4/5/7/8 | 4/5/6/8/9 | 5/6/7/9/10 | 6/7/8/10/10 |
| ≤20m | 4/5/6/7/8 | 4/5/6/8/9 | 5/6/7/9/10 | 6/7/8/10/10 | 7/8/9/10/10 |
| ≤40m | 5/6/7/8/9 | 5/6/7/9/10 | 6/7/8/10/10 | 7/8/9/10/10 | 8/9/10/10/10 |

De 5 tallene per celle er for: Kontrollert bakkeområde / Tynt befolket (<100/km²) / Befolket (<500/km²) / Tett befolket (<1500/km²) / Folkemengder (>1500/km²).

VIKTIG: En drone ≤250g med maks hastighet ≤25 m/s har alltid iGRC=1, uavhengig av befolkningstetthet (unntatt over folkemengder).

Bruk kontekstdata:
- primaryDrone/assignedDrones: Finn modell → estimer dimensjon og vekt
- populationDensity.maxDensity: Dimensjonerende befolkningstetthet fra SSB 250 m-rutenett. Denne verdien styrer befolkningstetthetskategorien/iGRC.
- populationDensity.avgDensity: Gjennomsnittlig tetthet i operasjonens fotavtrykk, kun som støtteinformasjon.
- landUse: Arealbruk for kvalitativ vurdering

SSB-metode for populationDensity:
- Bruk alltid populationDensity.maxDensity når den finnes; ikke erstatt den med estimat.
- Datagrunnlaget er SSB befolkning på rutenett 250 m (2025).
- Beregningen dekker droneoperasjonens fotavtrykk: planlagt rute + Flight Geography + Contingency + Ground Risk Buffer.
- Høyeste overlappende 250 m-rute er dimensjonerende: antall personer i ruten × 16 = personer/km².
- Rapporten SKAL forklare formelen, gjennomsnittlig tetthet og hvilket rutepunkt/segment som driver tallet basert på populationDensity.calculation, populationDensity.driver og populationDensity.footprintDescription.

#### Steg 2: Vurder mitigeringer (reduserer iGRC til fGRC)

**M1(A) — Skjerming (reduserer antall eksponerte personer via bygninger):**
- Low robusthet (-1): Flyr over område med strukturer som gir beskyttelse, drone <25 kg MTOM, ikke over folkemengder
- Medium robusthet (-2): I tillegg begrenset flytid og dokumentert at flertallet er skjermet. Kan IKKE kombineres med M1(B).

**M1(B) — Operasjonelle restriksjoner (tidspunkt/sted-begrensninger):**
- Medium robusthet (-1): Reduksjon av eksponerte personer med ~90% via tid/sted-begrensninger
- High robusthet (-2): Reduksjon med ~99%, validert av luftfartsmyndighet. Kan IKKE kombineres med M1(A) Medium.

**M1(C) — Bakkeobservasjon (taktisk mitigering via observatør):**
- Low robusthet (-1): Observatør overvåker overflyst område og pilot justerer flygemønster

**M2 — Redusert treffenergi (fallskjerm e.l.):**
- Medium robusthet (-1): MoC 2512 for energidempning
- High robusthet (-2): EASA Design Verification Report (DVR)

BEGRENSNINGER:
- M1 kan IKKE redusere GRC lavere enn verdien for "Kontrollert bakkeområde" i tabellen
- M1(A) Medium og M1(B) kan IKKE kombineres

#### Steg 3: Beregn fGRC
fGRC = iGRC + sum av alle mitigasjonsreduksjoner. Minimum = kontrollert-bakkeområde-verdien.

    ### KATEGORISERING — STEG 0: TRENGER OPERASJONEN SORA?
Du SKAL alltid vurdere om operasjonen krever SORA og returnere resultatet i feltet "operation_classification".

#### Åpen kategori
Operasjonen kan utføres i Åpen kategori HVIS:
- VLOS (piloten ser dronen hele tiden)
- Flyhøyde < 120 m AGL
- Drone MTOW < 25 kg
- Ingen slipp fra dronen
- Ingen transport av farlig gods

Underkategorier:
| Underkategori | C-merking | Maks vekt | Avstand fra utenforstående |
|---|---|---|---|
| A1 | C0/C1 | C0: <250g, C1: <900g | Kan overfly, ikke folkemengder |
| A2 | C2 | <4 kg | Min 30m (5m lav hastighet) |
| A3 | C3/C4 | C3: <25kg, C4: <25kg | 150m fra bolig/industri/fritid |

#### Standard Scenario (STS)
| STS | C-klasse | VLOS/BVLOS | Område | Maks avstand | Maks høyde |
|---|---|---|---|---|---|
| STS-01 | C5 | VLOS | Kontrollert, kan være tett befolket | VLOS | 120 m |
| STS-02 | C6 | BVLOS | Kontrollert, spredt befolket | 1 km (2 km med observatør) | 120 m |

Kontrollert område = operatøren sørger for at ingen utenforstående kan komme inn.

#### Spesifikk kategori (SORA påkrevd)
Hvis operasjonen IKKE kan utføres i Åpen eller STS → SORA er påkrevd.

#### ALOS-beregning
Beregn maks VLOS-avstand (ALOS = Attitude Line of Sight):
- Multirotor/helikopter: ALOS = 327 × CD + 20m (CD = karakteristisk dimensjon i meter)
- Fastvinget fly: ALOS = 490 × CD + 30m
- Bruk ALLTID primaryDrone.characteristicDimensionM når den finnes. Ikke estimer CD hvis denne verdien er oppgitt.
- Hvis primaryDrone.alos finnes, bruk nøyaktig primaryDrone.alos.alosMaxM og primaryDrone.alos.alosCalculation i operation_classification.
- Hvis CD ikke finnes i dronemodell-katalogen, skriv tydelig at CD er estimert.

#### Buffersone-sjekk
Sjekk om oppdraget har SORA-buffersoner beregnet. Se etter mission.route.soraSettings:
- Hvis soraSettings.enabled === true → buffersoner er beregnet
- Hvis soraSettings mangler eller enabled !== true → buffersoner er IKKE beregnet

Hvis SORA er påkrevd men buffersoner ikke er beregnet, anbefal at brukeren utfører SORA-bufferberegning på kartet.

#### Selskapskrav
Sjekk om selskapet krever SORA for alle oppdrag (company_requires_sora_on_missions). Hvis ja, merk at SORA er påkrevd som internkrav selv om operasjonen kan utføres uten.

    ### SOLSTORM / GEOMAGNETISK AKTIVITET (Kp-indeks) — OBLIGATORISK
Feltet "solarActivity" inneholder Kp-indeks fra NOAA Space Weather Prediction Center.
Aktuell verdi: Kp = ${solarActivity.kpIndex ?? 'ikke tilgjengelig'} (${solarActivity.noaaScale}, ${solarActivity.level}).

KRITISK: Kp-indeks MÅ ALLTID inkluderes i weather-kategoriens "factors"- eller "concerns"-liste som ETT separat punkt, uavhengig av verdi (også når Kp = 0 eller data mangler). Bruk eksakt disse malene:

- Hvis kpIndex === null (ikke tilgjengelig):
  Legg til i weather "factors": "Geomagnetisk aktivitet (Kp): data ikke tilgjengelig fra NOAA — verifiser manuelt før flygning."
  Ingen score-påvirkning.

- Hvis Kp 0–4 (G0, rolig):
  Legg til i weather "factors": "Geomagnetisk aktivitet: Kp ${solarActivity.kpIndex ?? '?'} (G0, rolig) — ingen GPS/GNSS-forstyrrelser forventet."
  Ingen score-påvirkning.

- Hvis Kp 5–6 (G1–G2, mindre/moderat storm):
  Legg til i weather "concerns": "Geomagnetisk storm: Kp ${solarActivity.kpIndex ?? '?'} (${solarActivity.noaaScale}) — mulig GPS/GNSS-degradering, økt posisjonsdrift kan forekomme."
  Reduser BÅDE weather og equipment score med 1 poeng.

- Hvis Kp ≥ 7 (G3+, sterk storm):
  Legg til i weather "concerns": "Sterk geomagnetisk storm: Kp ${solarActivity.kpIndex ?? '?'} (${solarActivity.noaaScale}) — betydelig risiko for GPS/GNSS-svikt og kompassfeil."
  Reduser BÅDE weather og equipment score med 2 poeng. Vurder caution eller no-go basert på totalbilde.

Du MÅ aldri utelate Kp-punktet fra weather-kategorien. Dette er et obligatorisk fast felt i rapporten.

### REGLER FOR SUMMARY (Foreslått konklusjon)
- Summary SKAL KUN omtale bekymringer som faktisk er reflektert i kategori-scorene og concerns-listene.
- Summary MÅ IKKE nevne risikoer som analysen selv har vurdert som tilfredsstillende/OK. Eksempel: Hvis duggpunkt-differansen er >4°C og weather-kategorien beskriver dette som "tilfredsstillende" eller "lav risiko", skal summary IKKE nevne duggpunkt som en bekymring.
- Summary MÅ IKKE nevne temaer som ikke finnes i datagrunnlaget eller som ikke er analysert (f.eks. "hviletid", "søvn", "fatigue" med mindre dette eksplisitt er vurdert i en kategori).
- Summary skal kort oppsummere: (1) hovedbeslutning (go/caution/no-go), (2) de 2-3 viktigste reelle bekymringene hentet direkte fra concerns-listene, (3) de viktigste positive faktorene.
- Summary SKAL være konsistent med recommendation-feltet, overall_score, og de individuelle kategori-vurderingene. Ingen selvmotsigelser.
- Ikke gjenta informasjon som allerede er godt dekket i kategoriene — hold summary kort og presist.

### RESPONS-FORMAT
Returner KUN gyldig JSON uten markdown-formatering. Svar ALLTID på norsk.`;

    const userPrompt = `Analyser denne droneoppdrag-risikovurderingen:

${JSON.stringify(contextData, null, 2)}

Returner en JSON-respons med denne strukturen:
{
  "mission_overview": "<kort oppsummering av oppdragets formål, lokasjon og operasjonstype>",
  "assessment_method": "<kort forklaring av vurderingsmetoden, vekting og HARD STOP-logikk>",
  "overall_score": <number 1-10>,
  "recommendation": "<go|caution|no-go>",
  "hard_stop_triggered": <boolean>,
  "hard_stop_reason": "<årsak hvis hard_stop_triggered er true, ellers null>",
  "summary": "<kort oppsummering på norsk>",
  "categories": {
    "weather": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "actual_conditions": "<beskrivelse av faktiske værdata>",
      "comparison_to_limits": "<sammenligning mot sikkerhetsgrenser>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "airspace": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "actual_conditions": "<beskrivelse av luftromsforhold>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "equipment": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "status": "<green|yellow|red>",
      "drone_status": "<beskrivelse av dronestatus og vedlikehold>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "pilot_experience": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "experience_summary": "<beskrivelse av erfaring og kompetanse>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    },
    "mission_complexity": {
      "score": <number 1-10>,
      "go_decision": "<GO|BETINGET|NO-GO>",
      "complexity_factors": "<lettlest beskrivelse av arealbruk, terreng, befolkningstetthet og operasjonelle faktorer på naturlig norsk — IKKE bruk tekniske variabelnavn>",
      "actual_conditions": "<beskrivelse av faktiske forhold i området på naturlig norsk, inkludert befolkningstetthet og arealbruk>",
      "factors": ["<positive faktorer>"],
      "concerns": ["<bekymringer>"]
    }
  },
  "air_risk_analysis": {
    "aec": "<AEC 1-12>",
    "aec_reasoning": "<kort forklaring av hvorfor denne AEC ble valgt basert på luftrom, høyde og lokasjon>",
    "initial_arc": "<ARC-a|ARC-b|ARC-c|ARC-d>",
    "strategic_mitigations_applied": ["<liste over relevante strategiske mitigeringer som er vurdert/anbefalt>"],
    "strategic_mitigations_not_applied": ["<mitigeringer som IKKE er tilgjengelig eller relevant>"],
    "residual_arc": "<ARC-a|ARC-b|ARC-c|ARC-d>",
    "tmpr_level": "<High|Medium|Low|None>",
    "tmpr_requirements": {
      "detect": "<krav til deteksjon av bemannet trafikk, eller 'Ikke påkrevd' for ARC-a/VLOS>",
      "decide": "<krav til beslutningsprosedyre>",
      "command": "<krav til C2-link>",
      "execute": "<krav til unnvikelsesevne>",
      "feedback_loop": "<krav til oppdateringsrate>"
    },
    "detection_recommendations": ["<konkrete anbefalte deteksjonssystemer>"],
    "vlos_exemption": <true hvis VLOS — forenklet TMPR>,
    "traffic_types_to_consider": ["<relevante trafikktyper å vurdere i området, f.eks. ambulansehelikopter, småfly, paraglidere>"],
    "arc_reduction_reasoning": "<kort forklaring av hvorfor/hvordan ARC ble redusert, eller 'Ingen reduksjon' hvis iARC = residual ARC>"
  },
  "ground_risk_analysis": {
    "characteristic_dimension": "<estimert største dimensjon, f.eks. '1m', '3m', '8m'>",
    "max_speed_category": "<estimert maks hastighet, f.eks. '25 m/s', '35 m/s'>",
    "drone_weight_kg": <estimert MTOW i kg>,
    "population_density_band": "<Kontrollert bakkeområde|Tynt befolket (<100/km²)|Befolket (<500/km²)|Tett befolket (<1500/km²)|Folkemengder (>1500/km²)>",
    "population_density_description": "<kort beskrivelse av området>",
    "population_density_value": <befolkningstetthet per km², bruk populationDensity.maxDensity når tilgjengelig>,
    "population_density_calculation": "<SSB 250 m-beregning, f.eks. '12 personer i 250 m-rute × 16 = 192 personer/km²'>",
    "population_density_average": <gjennomsnittlig befolkningstetthet i fotavtrykket, populationDensity.avgDensity eller null>,
    "population_density_driver": "<hvilket rutepunkt/segment som driver tallet, fra populationDensity.driver>",
    "population_density_source": "<datakilde og metode, f.eks. SSB befolkning på rutenett 250 m (2025)>",
    "population_density_footprint": "<hvilke buffere/fotavtrykk beregningen dekker>",
    "ssb_grid_population": <antall personer i dimensjonerende 250 m-rute eller null>,
    "ssb_grid_resolution_m": 250,
    "igrc": <number 1-10>,
    "igrc_reasoning": "<kort forklaring av iGRC-beregningen>",
    "mitigations": {
      "m1a_sheltering": { "applicable": <boolean>, "robustness": "<Low|Medium|null>", "reduction": <0|-1|-2>, "reasoning": "<begrunnelse>" },
      "m1b_operational_restrictions": { "applicable": <boolean>, "robustness": "<Medium|High|null>", "reduction": <0|-1|-2>, "reasoning": "<begrunnelse>" },
      "m1c_ground_observation": { "applicable": <boolean>, "robustness": "<Low|null>", "reduction": <0|-1>, "reasoning": "<begrunnelse>" },
      "m2_impact_reduction": { "applicable": <boolean>, "robustness": "<Medium|High|null>", "reduction": <0|-1|-2>, "reasoning": "<begrunnelse>" }
    },
    "total_reduction": <sum av alle reduksjoner, negativt tall>,
    "fgrc": <endelig GRC>,
    "fgrc_reasoning": "<kort forklaring av fGRC-beregningen med mitigeringer>",
    "controlled_ground_area": <boolean — true hvis operasjon er over kontrollert bakkeområde>
  },
  "operation_classification": {
    "requires_sora": <boolean — true hvis operasjonen krever SORA>,
    "category": "<Open|STS|Specific>",
    "subcategory": "<A1|A2|A3|STS-01|STS-02|SORA — underkategori>",
    "reasoning": "<kort begrunnelse for kategoriseringen>",
    "alos_max_m": <beregnet ALOS-avstand i meter, eller null>,
    "alos_calculation": "<formel brukt for ALOS, f.eks. '327 × 1m + 20m = 347m'>",
    "sora_buffers_calculated": <boolean — true hvis mission.route.soraSettings.enabled === true>,
    "sora_buffers_recommendation": "<anbefaling om bufferberegning hvis påkrevd men ikke utført, ellers null>",
    "sts_applicable": "<beskrivelse av relevant STS hvis aktuelt, ellers null>",
    "open_category_rules": ["<regler som gjelder for valgt underkategori>"],
    "company_requires_sora": <boolean — true hvis selskapet krever SORA som internkrav uavhengig av kategori>
  },
  "recommendations": [
    {
      "priority": "<high|medium|low>",
      "action": "<konkret tiltak på norsk>",
      "risk_addressed": "<hvilken risiko tiltaket reduserer>"
    }
  ],
  "prerequisites": ["<betingelser som må være oppfylt før flyging>"],
  "ai_disclaimer": "Vurderingen er basert på tilgjengelige data på vurderingstidspunktet. Endringer i input kan påvirke resultatet."
}`;

    // 9. Call AI (with retry for transient 502/503 errors)
    console.log('Calling AI for risk assessment...');
    const aiRequestBody = JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    let aiResponse: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: aiRequestBody,
      });

      if (aiResponse.ok || (aiResponse.status !== 502 && aiResponse.status !== 503)) {
        break;
      }
      console.warn(`AI gateway returned ${aiResponse.status}, retrying (attempt ${attempt + 1})...`);
      // Consume body before retry
      await aiResponse.text();
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!aiResponse!.ok) {
      const errorText = await aiResponse!.text();
      console.error('AI gateway error:', aiResponse!.status, errorText);
      
      if (aiResponse!.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse!.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted, please add funds' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse!.status === 502 || aiResponse!.status === 503) {
        return new Response(JSON.stringify({ error: 'AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om et øyeblikk.' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse!.status}`);
    }

    const aiData = await aiResponse!.json();
    let aiContent = aiData.choices?.[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from AI response (remove markdown if present)
    aiContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(aiContent);
    } catch (e) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Invalid AI response format');
    }

    // Normalize all category scores
    if (aiAnalysis.categories) {
      for (const key of Object.keys(aiAnalysis.categories)) {
        if (aiAnalysis.categories[key]?.score !== undefined) {
          aiAnalysis.categories[key].score = normalizeRiskScore(aiAnalysis.categories[key].score) ?? aiAnalysis.categories[key].score;
        }
      }
    }
    if (aiAnalysis.overall_score !== undefined) {
      aiAnalysis.overall_score = normalizeRiskScore(aiAnalysis.overall_score) ?? aiAnalysis.overall_score;
    }
    aiAnalysis.recommendation = deriveRiskRecommendation(
      aiAnalysis.overall_score,
      aiAnalysis.hard_stop_triggered === true,
      aiAnalysis.recommendation
    );

    const deterministicCharacteristicDimensionM = primaryDroneCharacteristicDimensionM
      ?? (typeof droneData?.vekt === 'number' && droneData.vekt >= 5 ? 1.2 : typeof droneData?.vekt === 'number' && droneData.vekt >= 1 ? 0.6 : 0.3);
    const deterministicMaxSpeedMps = Number(droneCatalogMatch?.max_speed_mps ?? (droneCatalogMatch?.max_wind_mps ? droneCatalogMatch.max_wind_mps * 2 : null) ?? 25);
    const deterministicWeightKg = Number.isFinite(Number(droneCatalogMatch?.weight_kg ?? droneData?.vekt)) ? Number(droneCatalogMatch?.weight_kg ?? droneData?.vekt) : null;

    if (deterministicAlos) {
      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        characteristic_dimension: `${primaryDroneCharacteristicDimensionM}m`,
        max_speed_category: droneCatalogMatch?.max_speed_mps
          ? `${droneCatalogMatch.max_speed_mps} m/s`
          : aiAnalysis.ground_risk_analysis?.max_speed_category,
        drone_weight_kg: droneCatalogMatch?.weight_kg ?? droneData?.vekt ?? aiAnalysis.ground_risk_analysis?.drone_weight_kg,
      };
      aiAnalysis.operation_classification = {
        ...(aiAnalysis.operation_classification || {}),
        alos_max_m: deterministicAlos.alosMaxM,
        alos_calculation: deterministicAlos.alosCalculation,
      };
    }

    const deterministicPopulationDensityValue = populationData ? Math.round(populationData.maxDensity) : 0;
    const deterministicPopulationDensityAverage = populationData ? Number(populationData.avgDensity.toFixed(1)) : null;
    const deterministicGroundRisk = buildDeterministicGroundRisk({
      characteristicDimensionM: deterministicCharacteristicDimensionM,
      maxSpeedMps: deterministicMaxSpeedMps,
      weightKg: deterministicWeightKg,
      populationDensityValue: deterministicPopulationDensityValue,
      populationDensityAverage: deterministicPopulationDensityAverage,
      populationData,
      assignedEquipment,
    });

    if (populationData) {
      const populationDensityValue = Math.round(populationData.maxDensity);
      const populationDensityAverage = Number(populationData.avgDensity.toFixed(1));
      const populationDensityDescription = populationData.cellCount > 0
        ? `Vi bruker befolkningstetthetsdata fra Statistisk sentralbyrå (SSB) for å fastsette befolkningstettheten innenfor droneoperasjonens fotavtrykk. Vurderingen er basert på et 250-meters rutenett. Ruten med høyest befolkningstetthet som overlapper fotavtrykket er dimensjonerende: ${populationData.calculation}. Gjennomsnittlig befolkningstetthet i fotavtrykket er ${formatNbNumber(populationDensityAverage, 1)} personer/km² basert på ${formatNbNumber(populationData.cellCount)} overlappende ruter. Dimensjonerende rute ligger ${populationData.driver ?? 'innenfor operasjonens fotavtrykk'}.`
        : populationData.summary;

      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        ...deterministicGroundRisk,
        population_density_value: populationDensityValue,
        population_density_calculation: populationData.calculation ?? populationData.summary,
        population_density_average: populationDensityAverage,
        population_density_driver: populationData.driver ?? null,
        population_density_source: populationData.dataSource ?? 'SSB befolkning på rutenett 250 m (2025)',
        population_density_footprint: populationData.footprintDescription ?? 'Planlagt rute med operasjonsvolum og bakkerisikobuffer.',
        ssb_grid_population: populationData.maxCellPopulation ?? null,
        ssb_grid_resolution_m: populationData.gridResolutionM ?? 250,
        population_density_description: populationDensityDescription,
      };
    } else {
      aiAnalysis.ground_risk_analysis = {
        ...(aiAnalysis.ground_risk_analysis || {}),
        ...deterministicGroundRisk,
        population_density_description: 'SSB 250 m-befolkningstetthet var ikke tilgjengelig. Systemet bruker konservativ fallback for å unngå AI-variasjon.',
      };
    }

    console.log(`GRC deterministic: ${deterministicGroundRisk.igrc_table_basis} => iGRC=${deterministicGroundRisk.igrc}, reductions=${deterministicGroundRisk.total_reduction}, fGRC=${deterministicGroundRisk.fgrc}`);

    console.log('AI analysis complete:', aiAnalysis.recommendation, 'HARD STOP:', aiAnalysis.hard_stop_triggered, 'Overall score:', aiAnalysis.overall_score);
    console.log('Air risk analysis present:', !!aiAnalysis.air_risk_analysis, aiAnalysis.air_risk_analysis ? JSON.stringify(aiAnalysis.air_risk_analysis).substring(0, 200) : 'MISSING');

    // 10. Save to database
    const { data: savedAssessment, error: saveError } = await supabase
      .from('mission_risk_assessments')
      .insert({
        mission_id: missionId,
        pilot_id: user.id,
        company_id: companyId,
        weather_score: aiAnalysis.categories?.weather?.score || null,
        airspace_score: aiAnalysis.categories?.airspace?.score || null,
        pilot_experience_score: aiAnalysis.categories?.pilot_experience?.score || null,
        mission_complexity_score: aiAnalysis.categories?.mission_complexity?.score || null,
        equipment_score: aiAnalysis.categories?.equipment?.score || null,
        overall_score: aiAnalysis.overall_score,
        recommendation: aiAnalysis.recommendation,
        ai_analysis: aiAnalysis,
        pilot_inputs: pilotInputs || {},
        pilot_comments: pilotComments || {},
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
      // Still return the analysis even if save fails
    }

    // 11. SORA-based auto-approval
    let autoApproved = false;
    let approvalStatus: 'approved' | 'not_approved' | null = null;
    let approvalReason: string | null = null;
    let approvalThreshold: number | null = null;
    try {
      // Use RPC that respects parent-company propagation (propagate_sora_approval)
      const { data: effective, error: effErr } = await supabase
        .rpc('get_effective_sora_approval_config', { _company_id: companyId });

      if (effErr) {
        console.error('get_effective_sora_approval_config error:', effErr);
      }

      const soraApprovalConfig: any = (effective as any)?.config ?? {};
      const inheritedFrom = (effective as any)?.effective_company_id ?? companyId;
      const inherited = (effective as any)?.inherited === true;
      console.log('SORA auto-approval config resolved:', {
        companyId,
        inherited,
        effectiveCompanyId: inheritedFrom,
        sora_based_approval: soraApprovalConfig?.sora_based_approval,
        threshold: soraApprovalConfig?.sora_approval_threshold,
      });

      if (soraApprovalConfig?.sora_based_approval && missionId) {
        const overallScore = aiAnalysis.overall_score ?? 0;
        const hardStopTriggered = aiAnalysis.hard_stop_triggered === true;
        const threshold = Number(soraApprovalConfig.sora_approval_threshold) || 7.0;
        const hardstopRequiresApproval = soraApprovalConfig.sora_hardstop_requires_approval !== false;
        approvalThreshold = threshold;

        if (hardStopTriggered && hardstopRequiresApproval) {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `Hardstop utløst — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (hardstop triggered)');
        } else if (overallScore >= threshold && !hardStopTriggered) {
          await supabase.from('missions').update({ approval_status: 'approved' }).eq('id', missionId);
          autoApproved = true;
          approvalStatus = 'approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} oppfyller terskel ${threshold.toFixed(1)}`;
          console.log('SORA auto-approval: APPROVED (score', overallScore, '>=', threshold, ')');
        } else {
          await supabase.from('missions').update({ approval_status: 'not_approved' }).eq('id', missionId);
          approvalStatus = 'not_approved';
          approvalReason = `AI-score ${overallScore.toFixed(1)} er under terskel ${threshold.toFixed(1)} — krever manuell godkjenning`;
          console.log('SORA auto-approval: DENIED (score', overallScore, '<', threshold, ')');
        }
      }
    } catch (approvalErr) {
      console.error('SORA auto-approval error (non-blocking):', approvalErr);
    }

    await finishJob('done');
    return new Response(JSON.stringify({
      success: true,
      assessment: savedAssessment || {
        ...aiAnalysis,
        weather_data: weatherData,
        airspace_warnings: airspaceWarnings,
      },
      aiAnalysis,
      autoApproved,
      approvalStatus,
      approvalReason,
      approvalThreshold,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    try {
      // Best-effort: mark any in-flight job for this user as failed
      await supabase.from('ai_risk_assessment_jobs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: (error as Error)?.message ?? 'unknown' })
        .eq('user_id', user.id).eq('status', 'running');
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
