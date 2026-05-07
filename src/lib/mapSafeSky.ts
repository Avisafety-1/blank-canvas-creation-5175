import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { getBeaconSvgUrl, isAnimatedType, HELI_ANIM_FRAMES, droneAnimatedIcon } from "@/lib/mapIcons";

export interface SafeSkyControls {
  start: () => void;
  stop: () => void;
}

export function createSafeSkyManager(params: {
  safeskyLayer: L.LayerGroup;
  mode: string;
}) {
  const { safeskyLayer, mode } = params;
  
  const safeskyMarkersCache = new Map<string, L.Marker>();
  const heliAnimIntervals = new Map<string, number>();
  let destroyed = false;
  let consecutiveFailures = 0;
  let consecutiveEmptyResults = 0;
  const MAX_FAILURES_BEFORE_RECONNECT = 3;
  const MAX_EMPTY_BEFORE_REFRESH = 5;
  
  function clearAllHeliIntervals() {
    for (const [, intervalId] of heliAnimIntervals) {
      clearInterval(intervalId);
    }
    heliAnimIntervals.clear();
  }

  function isMarkerAttached(marker: L.Marker): boolean {
    try {
      return !!(marker as any)._map && !!marker.getElement();
    } catch {
      return false;
    }
  }

  function renderSafeSkyBeacons(beacons: any[]) {
    if (destroyed) return;
    const currentIds = new Set<string>();
    console.log(`SafeSky: ${beacons.length} beacons from database`);
    
    for (const beacon of beacons) {
      if (destroyed) return;
      const lat = beacon.latitude;
      const lon = beacon.longitude;
      if (lat == null || lon == null) continue;
      
      const beaconId = beacon.id || `${lat}_${lon}`;
      currentIds.add(beaconId);
      
      const beaconType = beacon.beacon_type || 'UNKNOWN';
      const course = beacon.course || 0;
      const isDrone = beaconType === 'UAV';
      const isHeli = isAnimatedType(beaconType);
      
      const altitudeMetersForColor = beacon.altitude;
      const isHighAltitude = altitudeMetersForColor != null && altitudeMetersForColor > 610;
      const highAltFilter = isHighAltitude ? 'filter:grayscale(100%) brightness(0);' : '';
      
      const iconUrl = getBeaconSvgUrl(beaconType);
      
      const callsign = beacon.callsign || 'Ukjent';
      const altitudeFt = beacon.altitude != null ? Math.round(beacon.altitude * 3.28084) : '?';
      const speedKt = beacon.ground_speed != null ? Math.round(beacon.ground_speed * 1.94384) : '?';
      const typeLabel = beaconType || 'Ukjent';
      const popupHtml = `
        <div>
          <strong>Callsign: ${callsign}</strong><br/>
          Type: ${typeLabel}<br/>
          Høyde: ${altitudeFt} ft<br/>
          Fart: ${speedKt} kt<br/>
          <span style="font-size: 10px; color: #888;">Via SafeSky</span>
        </div>
      `;
      
      const existingMarker = safeskyMarkersCache.get(beaconId);
      
      if (existingMarker) {
        try {
          if (isMarkerAttached(existingMarker)) {
            if (!existingMarker.isPopupOpen()) {
              existingMarker.setLatLng([lat, lon]);
            }
            existingMarker.setPopupContent(popupHtml);
            
            if (!isDrone && !isHeli) {
              const el = existingMarker.getElement();
              if (el) {
                const img = el.querySelector('img');
                if (img) {
                  img.style.transform = `rotate(${course}deg)`;
                }
              }
            }
          }
        } catch (err) {
          // Marker DOM out of sync, remove and re-create next cycle
          console.warn('SafeSky: marker update error, removing stale marker', err);
          try { safeskyLayer.removeLayer(existingMarker); } catch {}
          safeskyMarkersCache.delete(beaconId);
          const intervalId = heliAnimIntervals.get(beaconId);
          if (intervalId != null) { clearInterval(intervalId); heliAnimIntervals.delete(beaconId); }
        }
      } else {
        try {
          const size = 56;
          const anchor = size / 2;
          const rotation = (!isDrone && !isHeli) ? `transform:rotate(${course}deg);` : '';
          
          const icon = L.divIcon({
            className: '',
            html: `<img src="${iconUrl}" style="width:${size}px;height:${size}px;${rotation}${highAltFilter}" data-beacon-type="${beaconType}" />`,
            iconSize: [size, size],
            iconAnchor: [anchor, anchor],
            popupAnchor: [0, -anchor],
          });
          
          const marker = L.marker([lat, lon], { icon, interactive: mode !== 'routePlanning', pane: 'safeskyPane' });
          marker.bindPopup(popupHtml, { autoPan: false, keepInView: false });
          marker.addTo(safeskyLayer);
          safeskyMarkersCache.set(beaconId, marker);
          
          if (isHeli) {
            let frameIdx = 0;
            const intervalId = window.setInterval(() => {
              if (destroyed) { clearInterval(intervalId); return; }
              if (!isMarkerAttached(marker)) { clearInterval(intervalId); heliAnimIntervals.delete(beaconId); return; }
              if (marker.isPopupOpen()) return;
              frameIdx = (frameIdx + 1) % HELI_ANIM_FRAMES.length;
              const el = marker.getElement();
              if (el) {
                const img = el.querySelector('img');
                if (img) {
                  img.src = HELI_ANIM_FRAMES[frameIdx];
                }
              }
            }, 200);
            heliAnimIntervals.set(beaconId, intervalId);
          }
        } catch (err) {
          console.warn('SafeSky: error adding marker', err);
        }
      }
    }
    
    for (const [id, marker] of safeskyMarkersCache) {
      if (!currentIds.has(id)) {
        try { safeskyLayer.removeLayer(marker); } catch {}
        safeskyMarkersCache.delete(id);
        const intervalId = heliAnimIntervals.get(id);
        if (intervalId != null) {
          clearInterval(intervalId);
          heliAnimIntervals.delete(id);
        }
      }
    }
  }

  async function fetchSafeSkyBeacons() {
    if (destroyed) return;
    // Auth is ensured by the caller (OpenAIPMap single getUser check)
    
    try {
      const { data, error } = await supabase
        .from('safesky_beacons')
        .select('*');
      
      if (error) {
        console.error('SafeSky database error:', error);
        consecutiveFailures++;
        consecutiveEmptyResults = 0;
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECONNECT) {
          console.warn('SafeSky: too many failures, reconnecting...');
          reconnect();
        }
        return;
      }
      
      consecutiveFailures = 0;
      const beacons = data || [];
      
      if (beacons.length === 0) {
        consecutiveEmptyResults++;
        console.warn(`SafeSky: 0 beacons returned (${consecutiveEmptyResults} consecutive empty results)`);
        if (consecutiveEmptyResults >= MAX_EMPTY_BEFORE_REFRESH) {
          console.warn('SafeSky: too many empty results, refreshing auth token...');
          consecutiveEmptyResults = 0;
          try {
            await supabase.auth.refreshSession();
          } catch (refreshErr) {
            console.error('SafeSky: token refresh failed', refreshErr);
          }
        }
      } else {
        consecutiveEmptyResults = 0;
      }
      
      renderSafeSkyBeacons(beacons);
    } catch (err) {
      console.error('Feil ved henting av SafeSky data:', err);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECONNECT) {
        console.warn('SafeSky: too many failures, reconnecting...');
        reconnect();
      }
    }
  }

  let safeskyChannel: ReturnType<typeof supabase.channel> | null = null;
  let safeskyDebounceTimer: number | null = null;
  let safeskyPollInterval: number | null = null;
  let warmupTriggered = false;

  const debouncedFetchSafeSky = () => {
    if (destroyed) return;
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
    }
    safeskyDebounceTimer = window.setTimeout(() => {
      fetchSafeSkyBeacons();
    }, 500);
  };

  /** Trigger edge function to populate cache on-demand (deduplicated) */
  async function warmUpCache() {
    if (warmupTriggered || destroyed) return;
    warmupTriggered = true;
    try {
      console.log('SafeSky: triggering cache warm-up via edge function');
      const { error } = await supabase.functions.invoke('safesky-beacons-fetch', { body: {} });
      if (error) {
        console.warn('SafeSky: warm-up invoke failed', error);
      } else {
        console.log('SafeSky: warm-up complete');
      }
    } catch (err) {
      console.warn('SafeSky: warm-up error', err);
    }
  }

  /** Short retry burst on startup if cache is empty */
  async function startupRetryBurst() {
    const retryDelays = [2000, 4000, 6000];
    for (const delay of retryDelays) {
      if (destroyed || safeskyMarkersCache.size > 0) return;
      await new Promise(r => setTimeout(r, delay));
      if (destroyed) return;
      console.log(`SafeSky: startup retry after ${delay}ms`);
      await fetchSafeSkyBeacons();
    }
  }

  function reconnect() {
    if (destroyed) return;
    consecutiveFailures = 0;
    // Tear down current connections
    if (safeskyChannel) {
      try { safeskyChannel.unsubscribe(); } catch {}
      safeskyChannel = null;
    }
    if (safeskyPollInterval) {
      clearInterval(safeskyPollInterval);
      safeskyPollInterval = null;
    }
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
      safeskyDebounceTimer = null;
    }
    // Restart after a short delay
    window.setTimeout(() => {
      if (!destroyed) {
        console.log('SafeSky: reconnecting...');
        start();
      }
    }, 2000);
  }

  async function start() {
    if (destroyed) return;
    if (!safeskyChannel) {
      console.log('Lufttrafikk: Starting real-time subscription');
      
      // Fire-and-forget warm-up (fills DB cache in background)
      warmUpCache();
      
      // Immediate DB fetch (may be empty first time, retry burst handles it)
      await fetchSafeSkyBeacons();
      
      // If still empty after first fetch, do short retry burst
      if (safeskyMarkersCache.size === 0 && !destroyed) {
        startupRetryBurst();
      }
      
      if (destroyed) return;
      
      safeskyChannel = supabase
        .channel('safesky-beacons-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'safesky_beacons' },
          () => debouncedFetchSafeSky()
        )
        .subscribe();
    }
  }

  function stop() {
    if (safeskyChannel) {
      console.log('Lufttrafikk: Stopping subscription');
      try { safeskyChannel.unsubscribe(); } catch {}
      safeskyChannel = null;
      safeskyLayer.clearLayers();
      safeskyMarkersCache.clear();
    }
    if (safeskyPollInterval) {
      clearInterval(safeskyPollInterval);
      safeskyPollInterval = null;
    }
    if (safeskyDebounceTimer) {
      clearTimeout(safeskyDebounceTimer);
      safeskyDebounceTimer = null;
    }
    clearAllHeliIntervals();
  }

  function cleanup() {
    destroyed = true;
    stop();
  }

  return { start, stop, cleanup };
}
