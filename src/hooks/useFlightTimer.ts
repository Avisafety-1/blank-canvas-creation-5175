import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { addToQueue } from '@/lib/offlineQueue';
import { toast } from 'sonner';

// User-specific localStorage keys to prevent cross-user state sharing
const getStorageKey = (userId: string) => `active_flight_start_time_${userId}`;
const getMissionKey = (userId: string) => `active_flight_mission_id_${userId}`;
const getPublishModeKey = (userId: string) => `active_flight_publish_mode_${userId}`;
const getChecklistsKey = (userId: string) => `active_flight_checklists_${userId}`;

// Legacy keys for cleanup
const LEGACY_KEYS = ['active_flight_start_time', 'active_flight_mission_id', 'active_flight_publish_mode', 'active_flight_checklists'];

export type PublishMode = 'none' | 'advisory' | 'live_uav';

interface FlightTimerState {
  isActive: boolean;
  startTime: Date | null;
  elapsedSeconds: number;
  missionId: string | null;
  publishMode: PublishMode;
  completedChecklistIds: string[];
  dronetagDeviceId: string | null;
}

export const useFlightTimer = () => {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<FlightTimerState>({
    isActive: false,
    startTime: null,
    elapsedSeconds: 0,
    missionId: null,
    publishMode: 'none',
    completedChecklistIds: [],
    dronetagDeviceId: null,
  });
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ 
    lat: number; 
    lon: number; 
    alt: number;
    speed: number;
    heading: number;
  } | null>(null);
  const startAltitudeRef = useRef<number | null>(null);
  const prevPositionRef = useRef<{ alt: number; timestamp: number } | null>(null);

  // Function to publish/refresh SafeSky advisory
  const publishAdvisory = useCallback(async (missionId: string) => {
    try {
      const { error } = await supabase.functions.invoke('safesky-advisory', {
        body: { action: 'publish_advisory', missionId: missionId },
      });
      if (error) {
        console.error('Error publishing SafeSky advisory:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to publish SafeSky advisory:', err);
      return false;
    }
  }, []);

  // NOTE: publishLiveUav removed - live_uav mode no longer publishes to SafeSky
  // Live position is now only displayed internally on /kart

  // Function to end SafeSky advisory
  const endAdvisory = useCallback(async (missionId: string) => {
    try {
      await supabase.functions.invoke('safesky-advisory', {
        body: { action: 'delete_advisory', missionId: missionId },
      });
    } catch (err) {
      console.error('Failed to end SafeSky advisory:', err);
    }
  }, []);

  // Start GPS watch for live UAV mode
  const startGpsWatch = useCallback(() => {
    // Set initial fallback position (will be updated by GPS if available)
    lastPositionRef.current = { lat: 63.43, lon: 10.39, alt: 50, speed: 0, heading: 0 };
    startAltitudeRef.current = null;
    prevPositionRef.current = null;

    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, using fallback position');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const newAlt = position.coords.altitude || 50;
        
        // Set start altitude on first GPS fix
        if (startAltitudeRef.current === null) {
          startAltitudeRef.current = newAlt;
          console.log('Start altitude set:', newAlt);
        }

        lastPositionRef.current = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          alt: newAlt,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0,
        };

        // Update previous position for vertical speed calculation
        prevPositionRef.current = { alt: newAlt, timestamp: now };
      },
      (error) => {
        console.error('GPS error, using fallback position:', error);
        // Fallback is already set, keep using it
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }, []);

  // Stop GPS watch
  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastPositionRef.current = null;
    startAltitudeRef.current = null;
    prevPositionRef.current = null;
  }, []);

  // Check for active flight on mount
  // DATABASE IS SOURCE OF TRUTH - localStorage is only for performance optimization
  useEffect(() => {
    const checkActiveFlight = async () => {
      if (!user) return;

      // Clean up legacy non-user-specific keys
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key));

      // User-specific localStorage keys
      const userStorageKey = getStorageKey(user.id);
      const userMissionKey = getMissionKey(user.id);
      const userPublishModeKey = getPublishModeKey(user.id);
      const userChecklistsKey = getChecklistsKey(user.id);

      // DATABASE IS SOURCE OF TRUTH - check database first
      const { data: dbFlight, error } = await supabase
        .from('active_flights')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking active flight:', error);
        return;
      }

      if (dbFlight) {
        // Active flight exists in database - sync to localStorage and use it
        const startTime = new Date(dbFlight.start_time);
        const publishMode = (dbFlight.publish_mode as PublishMode) || 'none';
        const localChecklists = JSON.parse(localStorage.getItem(userChecklistsKey) || '[]') as string[];

        // Sync database state to localStorage
        localStorage.setItem(userStorageKey, startTime.toISOString());
        if (dbFlight.mission_id) {
          localStorage.setItem(userMissionKey, dbFlight.mission_id);
        } else {
          localStorage.removeItem(userMissionKey);
        }
        localStorage.setItem(userPublishModeKey, publishMode);

        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
        setState({
          isActive: true,
          startTime,
          elapsedSeconds: elapsed,
          missionId: dbFlight.mission_id || null,
          publishMode,
          completedChecklistIds: localChecklists,
          dronetagDeviceId: dbFlight.dronetag_device_id || null,
        });

        // Restart GPS watch if in live_uav or none mode
        if (publishMode === 'live_uav' || publishMode === 'none') {
          startGpsWatch();
        }
      } else {
        // NO active flight in database - clear any stale localStorage data
        localStorage.removeItem(userStorageKey);
        localStorage.removeItem(userMissionKey);
        localStorage.removeItem(userPublishModeKey);
        localStorage.removeItem(userChecklistsKey);

        // Ensure state is reset
        setState({
          isActive: false,
          startTime: null,
          elapsedSeconds: 0,
          missionId: null,
          publishMode: 'none',
          completedChecklistIds: [],
          dronetagDeviceId: null,
        });
      }
    };

    checkActiveFlight();
  }, [user, startGpsWatch]);

  // NOTE: Live UAV refresh interval removed - no longer publishing to SafeSky for live_uav mode
  // Backend cron job handles beacon fetching for DroneTag telemetry

  // Update elapsed time every second when active
  useEffect(() => {
    if (!state.isActive || !state.startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime!.getTime()) / 1000);
      setState(prev => ({ ...prev, elapsedSeconds: elapsed }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.startTime]);

  // NOTE: publishPointAdvisory removed - live_uav mode no longer publishes Point advisories
  // Pilot position is now displayed internally on /kart map

  const startFlight = useCallback(async (
    missionId?: string, 
    publishMode: PublishMode = 'none', 
    completedChecklistIds: string[] = [],
    startPosition?: { lat: number; lng: number },
    pilotName?: string,
    dronetagDeviceId?: string
  ) => {
    if (!user || !companyId) return false;

    const startTime = new Date();
    let routeData = null;

    // Fetch route data from mission if advisory mode is selected
    // Note: Advisory publishing is now handled in StartFlightDialog (with size validation)
    // so we only fetch route for storing in active_flights
    if (publishMode === 'advisory' && missionId) {
      const { data: mission } = await supabase
        .from('missions')
        .select('route')
        .eq('id', missionId)
        .single();
      
      if (mission?.route) {
        routeData = mission.route;
      }
      // Advisory was already published by StartFlightDialog with size validation
    } else if (publishMode === 'live_uav' || publishMode === 'none') {
      // Start GPS watch for local tracking (position stored in active_flights)
      // No SafeSky publishing - only internal pilot position display and beacon fetching
      startGpsWatch();
    }

    // Save to user-specific localStorage for offline support
    localStorage.setItem(getStorageKey(user.id), startTime.toISOString());
    if (missionId) localStorage.setItem(getMissionKey(user.id), missionId);
    localStorage.setItem(getPublishModeKey(user.id), publishMode);
    localStorage.setItem(getChecklistsKey(user.id), JSON.stringify(completedChecklistIds));

    // Save to database for cross-device sync, including route_data copy and live_uav start position
    const flightData = {
      profile_id: user.id,
      company_id: companyId,
      start_time: startTime.toISOString(),
      mission_id: missionId || null,
      publish_mode: publishMode,
      route_data: routeData,
      start_lat: startPosition?.lat || null,
      start_lng: startPosition?.lng || null,
      pilot_name: pilotName || null,
      dronetag_device_id: dronetagDeviceId || null,
    };

    if (navigator.onLine) {
      const { error } = await supabase.from('active_flights').insert([flightData]);
      if (error) {
        console.error('Error starting flight:', error);
      }

      // Auto-set mission status to "Pågående" if currently "Planlagt"
      if (missionId) {
        await supabase
          .from('missions')
          .update({ status: 'Pågående' })
          .eq('id', missionId)
          .eq('status', 'Planlagt');
      }
    } else {
      addToQueue({
        table: 'active_flights',
        operation: 'insert',
        data: flightData,
        description: 'Start flight (offline)',
      });
      toast.info('Flytur startet offline – synkroniseres når nett er tilbake');
    }

    setState({
      isActive: true,
      startTime,
      elapsedSeconds: 0,
      missionId: missionId || null,
      publishMode,
      completedChecklistIds,
      dronetagDeviceId: dronetagDeviceId || null,
    });

    return true;
  }, [user, companyId, startGpsWatch]);

  // Fetch flight track from DroneTag positions
  const fetchFlightTrack = useCallback(async (
    dronetagDeviceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ lat: number; lng: number; alt: number; alt_msl?: number; alt_agl?: number; speed?: number; heading?: number; vert_speed?: number; timestamp: string }>> => {
    try {
      // Fetch dronetag device to get the device_id (text identifier)
      const { data: device } = await supabase
        .from('dronetag_devices')
        .select('device_id')
        .eq('id', dronetagDeviceId)
        .single();

      if (!device) return [];

      const { data: positions } = await supabase
        .from('dronetag_positions')
        .select('lat, lng, alt_msl, alt_agl, speed, heading, vert_speed, timestamp')
        .eq('device_id', device.device_id)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (!positions || positions.length === 0) return [];

      return positions
        .filter(p => p.lat && p.lng)
        .map(p => ({
          lat: p.lat!,
          lng: p.lng!,
          alt: p.alt_msl || p.alt_agl || 0,
          alt_msl: p.alt_msl ?? undefined,
          alt_agl: p.alt_agl ?? undefined,
          speed: p.speed ?? undefined,
          heading: p.heading ?? undefined,
          vert_speed: p.vert_speed ?? undefined,
          timestamp: p.timestamp
        }));
    } catch (error) {
      console.error('Error fetching flight track:', error);
      return [];
    }
  }, []);

  // Reverse geocode coordinates to address
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lng}&radius=100&treffPerSide=1`
      );
      const data = await response.json();
      if (data.adresser && data.adresser.length > 0) {
        const addr = data.adresser[0];
        return `${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`;
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, []);

  // Prepare data for ending flight WITHOUT actually ending it
  // Used to show LogFlightTimeDialog while flight continues running
  const prepareEndFlight = useCallback(async (): Promise<{
    elapsedMinutes: number;
    missionId: string | null;
    flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }>;
    dronetagDeviceId: string | null;
    startPosition: { lat: number; lng: number } | null;
    pilotName: string | null;
    startTime: Date;
    publishMode: PublishMode;
    completedChecklistIds: string[];
  } | null> => {
    if (!state.isActive || !state.startTime) {
      return null;
    }

    const endTime = new Date();
    const elapsedSeconds = Math.floor((endTime.getTime() - state.startTime.getTime()) / 1000);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60);

    // Fetch active flight to get dronetag_device_id and start position
    let dronetagDeviceId: string | null = null;
    let flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }> = [];
    let startPosition: { lat: number; lng: number } | null = null;
    let pilotName: string | null = null;

    if (user) {
      const { data: activeFlight } = await supabase
        .from('active_flights')
        .select('dronetag_device_id, start_lat, start_lng, pilot_name')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (activeFlight?.dronetag_device_id) {
        dronetagDeviceId = activeFlight.dronetag_device_id;
        // Fetch flight track from DroneTag positions
        flightTrack = await fetchFlightTrack(dronetagDeviceId, state.startTime, endTime);
      }

      // Store start position and pilot name for LogFlightTimeDialog to use
      if (activeFlight?.start_lat && activeFlight?.start_lng) {
        startPosition = { lat: activeFlight.start_lat, lng: activeFlight.start_lng };
      }
      pilotName = activeFlight?.pilot_name || null;
    }

    return {
      elapsedMinutes,
      missionId: state.missionId,
      flightTrack,
      dronetagDeviceId,
      startPosition,
      pilotName,
      startTime: state.startTime,
      publishMode: state.publishMode,
      completedChecklistIds: state.completedChecklistIds,
    };
  }, [state.isActive, state.startTime, state.missionId, state.publishMode, state.completedChecklistIds, user, fetchFlightTrack]);

  // Actually end the flight - clear all state, stop GPS, end advisory
  const endFlight = useCallback(async (): Promise<void> => {
    if (!state.isActive || !state.startTime) {
      return;
    }

    // Stop refresh interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Stop GPS watch if active
    stopGpsWatch();

    // End SafeSky advisory if it was published
    if (state.publishMode === 'advisory' && state.missionId) {
      await endAdvisory(state.missionId);
    }

    // Clear user-specific localStorage
    if (user) {
      localStorage.removeItem(getStorageKey(user.id));
      localStorage.removeItem(getMissionKey(user.id));
      localStorage.removeItem(getPublishModeKey(user.id));
      localStorage.removeItem(getChecklistsKey(user.id));
    }

    // Clear database
    if (user) {
      if (navigator.onLine) {
        await supabase
          .from('active_flights')
          .delete()
          .eq('profile_id', user.id);
      } else {
        addToQueue({
          table: 'active_flights',
          operation: 'delete',
          matchColumn: 'profile_id',
          matchValue: user.id,
          data: {},
          description: 'End flight (offline)',
        });
      }
    }

    setState({
      isActive: false,
      startTime: null,
      elapsedSeconds: 0,
      missionId: null,
      publishMode: 'none',
      completedChecklistIds: [],
      dronetagDeviceId: null,
    });
  }, [state.isActive, state.startTime, state.publishMode, state.missionId, user, endAdvisory, stopGpsWatch]);

  const formatElapsedTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    if (hours > 0) {
      return `${hours}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }, []);

  return {
    isActive: state.isActive,
    startTime: state.startTime,
    elapsedSeconds: state.elapsedSeconds,
    missionId: state.missionId,
    publishMode: state.publishMode,
    completedChecklistIds: state.completedChecklistIds,
    dronetagDeviceId: state.dronetagDeviceId,
    startFlight,
    prepareEndFlight,
    endFlight,
    formatElapsedTime,
  };
};
