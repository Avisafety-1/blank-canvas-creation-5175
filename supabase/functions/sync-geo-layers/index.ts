import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LayerConfig {
  url: string;
  table: string;
  nameField: string[];
  paginate?: boolean;
}

const LAYER_SOURCES: Record<string, LayerConfig> = {
  rpas_ctr_tiz: {
    url: 'https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_CTR_TIZ/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'rpas_ctr_tiz',
    nameField: ['navn', 'name', 'NAVN', 'NAME']
  },
  nsm_restriction_zones: {
    url: 'https://services9.arcgis.com/qCxEdsGu1A7NwfY1/ArcGIS/rest/services/Forbudsomr%c3%a5derNSM_v/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'nsm_restriction_zones',
    nameField: ['navn', 'name', 'NAVN', 'NAME', 'omradenavn', 'OMRADENAVN']
  },
  rpas_5km_zones: {
    url: 'https://services.arcgis.com/a8CwScMFSS2ljjgn/ArcGIS/rest/services/RPAS_AVIGIS1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
    table: 'rpas_5km_zones',
    nameField: ['navn', 'name', 'NAVN', 'NAME', 'lufthavn', 'LUFTHAVN']
  },
};

const VERN_RESTRICTION_BASE_URL = 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern_restriksjonsomrader/FeatureServer';
const VERN_RESTRICTION_SUB_LAYERS = [
  { layerIndex: 0, restrictionType: 'FERDSELSFORBUD' },
  { layerIndex: 1, restrictionType: 'LAVFLYVING' },
  { layerIndex: 2, restrictionType: 'LANDINGSFORBUD' },
];

const BATCH_SIZE = 25; // Features per bulk-upsert call
const CHUNK_SIZE = 50; // IDs per ArcGIS fetch chunk

// Convert Esri JSON geometry to GeoJSON geometry
function esriGeometryToGeoJson(esriGeom: any): any | null {
  if (!esriGeom) return null;

  if (esriGeom.rings) {
    if (!Array.isArray(esriGeom.rings) || esriGeom.rings.length === 0) return null;
    // Check rings have actual coordinates
    if (esriGeom.rings.some((r: any) => !Array.isArray(r) || r.length < 3)) return null;
    return { type: 'Polygon', coordinates: esriGeom.rings };
  }

  if (esriGeom.paths) {
    if (!Array.isArray(esriGeom.paths) || esriGeom.paths.length === 0) return null;
    if (esriGeom.paths.length === 1) {
      return { type: 'LineString', coordinates: esriGeom.paths[0] };
    }
    return { type: 'MultiLineString', coordinates: esriGeom.paths };
  }

  if (esriGeom.x !== undefined && esriGeom.y !== undefined) {
    if (typeof esriGeom.x !== 'number' || typeof esriGeom.y !== 'number') return null;
    return { type: 'Point', coordinates: [esriGeom.x, esriGeom.y] };
  }

  return null;
}

// Validate GeoJSON geometry has actual coordinate data
function isValidGeometry(geom: any): boolean {
  if (!geom || !geom.type || !geom.coordinates) return false;
  if (geom.type === 'Point') return Array.isArray(geom.coordinates) && geom.coordinates.length >= 2;
  if (geom.type === 'Polygon') return Array.isArray(geom.coordinates) && geom.coordinates.length > 0 && geom.coordinates[0].length >= 3;
  if (geom.type === 'LineString') return Array.isArray(geom.coordinates) && geom.coordinates.length >= 2;
  if (geom.type === 'MultiLineString') return Array.isArray(geom.coordinates) && geom.coordinates.length > 0;
  return true; // Allow other types through
}

// Fetch object IDs from Esri FeatureServer
async function fetchObjectIds(baseUrl: string): Promise<number[]> {
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}returnIdsOnly=true&f=json`;
  console.log(`  Fetching object IDs...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Esri error: ${data.error.message || JSON.stringify(data.error)}`);
  const ids = data.objectIds || [];
  console.log(`  Got ${ids.length} object IDs`);
  return ids;
}

// Fetch features by object IDs from Esri FeatureServer
async function fetchFeaturesByIds(baseUrl: string, ids: number[]): Promise<{ attributes: any; geometry: any }[]> {
  const idsStr = ids.join(',');
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}objectIds=${idsStr}&outFields=*&outSR=4326&f=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Esri error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.features || [];
}

// Split array into chunks
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Fetch paginated GeoJSON features
async function fetchAllGeoJsonFeatures(baseUrl: string): Promise<any[]> {
  const allFeatures: any[] = [];
  let offset = 0;
  const pageSize = 2000;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}resultOffset=${offset}&resultRecordCount=${pageSize}`;
    console.log(`  Fetching GeoJSON page at offset ${offset}...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const geojson = await response.json();
    const features = geojson.features || [];
    allFeatures.push(...features);
    console.log(`  Got ${features.length} features (total: ${allFeatures.length})`);

    if (features.length < pageSize) break;
    offset += pageSize;
  }

  return allFeatures;
}

function findName(properties: Record<string, any>, nameFields: string[]): string {
  for (const field of nameFields) {
    if (properties[field]) return properties[field];
  }
  return 'Ukjent';
}

function getExternalId(properties: Record<string, any>, fallback: string): string {
  return String(properties.OBJECTID || properties.FID || properties.objectid || properties.fid || fallback);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support partial sync via query params:
    // ?layer=naturvern_zones  - sync only naturvern
    // ?offset=1750            - start from ID index (for resuming)
    // ?limit=1500             - max IDs to process (default 1500)
    const url = new URL(req.url);
    const layerFilter = url.searchParams.get('layer');
    const idOffset = parseInt(url.searchParams.get('offset') || '0', 10);
    const idLimit = parseInt(url.searchParams.get('limit') || '1500', 10);

    console.log(`Starting geo layers sync${layerFilter ? ` (filter: ${layerFilter})` : ' (all layers)'}${idOffset ? ` offset=${idOffset}` : ''} limit=${idLimit}...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, any> = {};
    const shouldSync = (name: string) => !layerFilter || layerFilter === name;

    // 1. Sync standard GeoJSON layers
    for (const [layerId, config] of Object.entries(LAYER_SOURCES)) {
      if (!shouldSync(layerId)) continue;
      console.log(`Fetching ${layerId}...`);
      try {
        const features = await fetchAllGeoJsonFeatures(config.url);
        console.log(`Processing ${features.length} features for ${layerId}...`);

        let totalSuccess = 0, totalError = 0, totalSkipped = 0;

        // Build batches for bulk upsert
        const batches = chunk(features, BATCH_SIZE);
        for (const batch of batches) {
          const batchData = batch.map((feature, idx) => {
            const props = feature.properties || {};
            const geom = feature.geometry;
            if (!geom || !isValidGeometry(geom)) return null;

            return {
              external_id: getExternalId(props, `${layerId}_${totalSuccess + idx}`),
              name: findName(props, config.nameField),
              geometry_geojson: JSON.stringify(geom),
              properties: props,
            };
          }).filter(Boolean);

          const skippedInBatch = batch.length - batchData.length;
          totalSkipped += skippedInBatch;

          if (batchData.length === 0) continue;

          const { data, error } = await supabase.rpc('bulk_upsert_geojson_features', {
            p_table_name: config.table,
            p_features: batchData,
          });

          if (error) {
            console.error(`Bulk upsert error for ${layerId}:`, error);
            totalError += batchData.length;
          } else if (data) {
            totalSuccess += data.success || 0;
            totalError += data.error || 0;
            totalSkipped += data.skipped || 0;
          }
        }

        results[layerId] = { success: true, total: features.length, successCount: totalSuccess, errorCount: totalError, skippedCount: totalSkipped };
        console.log(`${layerId}: ${totalSuccess} ok, ${totalError} failed, ${totalSkipped} skipped`);
      } catch (e) {
        console.error(`Error syncing ${layerId}:`, e);
        results[layerId] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
      }
    }

    // 2. Sync naturvern_zones (Esri JSON, ID-based chunking)
    if (shouldSync('naturvern_zones')) {
      console.log('Fetching naturvern_zones (Esri JSON, ID-based chunking)...');
      try {
        const naturvernBaseUrl = 'https://kart.miljodirektoratet.no/arcgis/rest/services/vern/FeatureServer/0/query?where=1%3D1';
        const allObjectIds = await fetchObjectIds(naturvernBaseUrl);
        // Apply offset and limit for resumable sync
        const objectIds = allObjectIds.slice(idOffset, idOffset + idLimit);
        console.log(`Got ${allObjectIds.length} naturvern object IDs, processing ${objectIds.length} (offset=${idOffset}, limit=${idLimit})`);

        let totalSuccess = 0, totalError = 0, totalSkipped = 0;
        const idChunks = chunk(objectIds, CHUNK_SIZE);

        for (let i = 0; i < idChunks.length; i++) {
          console.log(`  Processing naturvern chunk ${i + 1}/${idChunks.length} (${idChunks[i].length} IDs)...`);
          try {
            const features = await fetchFeaturesByIds(
              'https://kart.miljodirektoratet.no/arcgis/rest/services/vern/FeatureServer/0/query',
              idChunks[i]
            );

            const batchData = features.map(feature => {
              const props = feature.attributes || {};
              const geojsonGeom = esriGeometryToGeoJson(feature.geometry);
              if (!geojsonGeom || !isValidGeometry(geojsonGeom)) return null;

              return {
                external_id: getExternalId(props, `naturvern_${totalSuccess}`),
                name: props.navn || props.offisieltNavn || 'Ukjent',
                verneform: props.verneform || null,
                geometry_geojson: JSON.stringify(geojsonGeom),
                properties: props,
              };
            }).filter(Boolean);

            totalSkipped += features.length - batchData.length;

            if (batchData.length > 0) {
              // Sub-batch for DB calls
              const subBatches = chunk(batchData, BATCH_SIZE);
              for (const subBatch of subBatches) {
                const { data, error } = await supabase.rpc('bulk_upsert_naturvern_zones', {
                  p_features: subBatch,
                });

                if (error) {
                  console.error(`Bulk upsert error for naturvern:`, error);
                  totalError += subBatch.length;
                } else if (data) {
                  totalSuccess += data.success || 0;
                  totalError += data.error || 0;
                  totalSkipped += data.skipped || 0;
                }
              }
            }
          } catch (e) {
            console.error(`Error processing naturvern chunk ${i + 1}:`, e);
            totalError += idChunks[i].length;
          }
        }

        results['naturvern_zones'] = { success: true, total: objectIds.length, successCount: totalSuccess, errorCount: totalError, skippedCount: totalSkipped };
        console.log(`naturvern_zones: ${totalSuccess} ok, ${totalError} failed, ${totalSkipped} skipped`);
      } catch (e) {
        console.error('Error syncing naturvern_zones:', e);
        results['naturvern_zones'] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
      }
    }

    // 3. Sync vern_restriction_zones (Esri JSON, 3 sub-layers, ID-based chunking)
    if (shouldSync('vern_restriction_zones')) {
      console.log('Fetching vern_restriction_zones (Esri JSON, 3 sub-layers)...');
      try {
        let totalSuccess = 0, totalError = 0, totalFeatures = 0, totalSkipped = 0;

        for (const sub of VERN_RESTRICTION_SUB_LAYERS) {
          const layerBaseUrl = `${VERN_RESTRICTION_BASE_URL}/${sub.layerIndex}/query?where=1%3D1`;
          console.log(`  Fetching sub-layer ${sub.layerIndex} (${sub.restrictionType}) IDs...`);

          try {
            const objectIds = await fetchObjectIds(layerBaseUrl);
            totalFeatures += objectIds.length;
            console.log(`  Got ${objectIds.length} IDs for ${sub.restrictionType}`);

            const idChunks = chunk(objectIds, CHUNK_SIZE);
            for (let i = 0; i < idChunks.length; i++) {
              try {
                const features = await fetchFeaturesByIds(
                  `${VERN_RESTRICTION_BASE_URL}/${sub.layerIndex}/query`,
                  idChunks[i]
                );

                const batchData = features.map(feature => {
                  const props = feature.attributes || {};
                  const geojsonGeom = esriGeometryToGeoJson(feature.geometry);
                  if (!geojsonGeom || !isValidGeometry(geojsonGeom)) return null;

                  return {
                    external_id: getExternalId(props, `vern_restr_${sub.layerIndex}_${totalSuccess}`),
                    name: findName(props, ['navn', 'name', 'NAVN', 'NAME']),
                    restriction_type: sub.restrictionType,
                    geometry_geojson: JSON.stringify(geojsonGeom),
                    properties: props,
                  };
                }).filter(Boolean);

                totalSkipped += features.length - batchData.length;

                if (batchData.length > 0) {
                  const subBatches = chunk(batchData, BATCH_SIZE);
                  for (const subBatch of subBatches) {
                    const { data, error } = await supabase.rpc('bulk_upsert_vern_restrictions', {
                      p_features: subBatch,
                    });

                    if (error) {
                      console.error(`Bulk upsert error for vern restriction:`, error);
                      totalError += subBatch.length;
                    } else if (data) {
                      totalSuccess += data.success || 0;
                      totalError += data.error || 0;
                      totalSkipped += data.skipped || 0;
                    }
                  }
                }
              } catch (e) {
                console.error(`Error processing vern restriction chunk:`, e);
                totalError += idChunks[i].length;
              }
            }
          } catch (e) {
            console.error(`Error fetching sub-layer ${sub.layerIndex}:`, e);
          }
        }

        results['vern_restriction_zones'] = { success: true, total: totalFeatures, successCount: totalSuccess, errorCount: totalError, skippedCount: totalSkipped };
        console.log(`vern_restriction_zones: ${totalSuccess} ok, ${totalError} failed, ${totalSkipped} skipped`);
      } catch (e) {
        console.error('Error syncing vern_restriction_zones:', e);
        results['vern_restriction_zones'] = { success: false, error: e instanceof Error ? e.message : 'Unknown' };
      }
    }

    console.log('Synchronization complete!');

    return new Response(
      JSON.stringify({ success: true, message: 'Geo layers synchronization completed', results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Fatal error during synchronization:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
