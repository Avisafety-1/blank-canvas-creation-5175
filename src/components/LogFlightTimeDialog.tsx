import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addToQueue } from "@/lib/offlineQueue";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, Plane, MapPin, Navigation, User, CheckCircle, Map, Timer, Package, Info, ChevronDown, AlertTriangle } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import { LocationPickerDialog } from "./LocationPickerDialog";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { DeviationReportDialog } from "./DeviationReportDialog";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format } from "date-fns";

interface FlightTrackPosition {
  lat: number;
  lng: number;
  alt: number;
  timestamp: string;
}

interface LogFlightTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFlightLogged?: () => void;
  onStopTimer?: () => void;
  prefilledDuration?: number;
  safeskyMode?: string;
  completedChecklistIds?: string[];
  prefilledMissionId?: string;
  flightTrack?: FlightTrackPosition[];
  dronetagDeviceId?: string;
  startPosition?: { lat: number; lng: number };
  pilotName?: string;
  flightStartTime?: Date;
}

interface Drone {
  id: string;
  modell: string;
  serienummer: string;
}

interface Mission {
  id: string;
  tittel: string;
  tidspunkt: string;
}

interface Personnel {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Equipment {
  id: string;
  navn: string;
  serienummer: string;
}

// Cache for airport data
let airportCache: Array<{ icao: string; name: string; lat: number; lng: number }> | null = null;

// Calculate distance between two points in meters (Haversine formula)
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Fetch airports from ArcGIS API
const fetchAirports = async (): Promise<Array<{ icao: string; name: string; lat: number; lng: number }>> => {
  if (airportCache) return airportCache;
  
  try {
    const response = await fetch(
      'https://services.arcgis.com/2JyTvMWQSnM2Vi8q/arcgis/rest/services/Flyplasser_i_Norge/FeatureServer/0/query?where=1%3D1&outFields=ICAO,lufthavnnavn&outSR=4326&f=geojson'
    );
    const data = await response.json();
    
    if (data.features) {
      airportCache = data.features
        .filter((f: any) => f.properties?.ICAO && f.geometry?.coordinates)
        .map((f: any) => ({
          icao: f.properties.ICAO,
          name: f.properties.lufthavnnavn || f.properties.ICAO,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        }));
      return airportCache;
    }
  } catch (error) {
    console.error('Error fetching airports:', error);
  }
  return [];
};

// Find nearest airport within 1km
const findNearestAirport = async (lat: number, lng: number): Promise<string | null> => {
  const airports = await fetchAirports();
  
  for (const airport of airports) {
    const distance = calculateDistance(lat, lng, airport.lat, airport.lng);
    if (distance <= 1000) { // 1 km
      return `${airport.icao} - ${airport.name}`;
    }
  }
  return null;
};

// Reverse geocode coordinates to address using Geonorge API
const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const response = await fetch(
      `https://api.kartverket.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lng}&koordsys=4326`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.kommunenavn) {
        return data.kommunenavn;
      }
    }
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
};

// Get current GPS position from phone
const getCurrentPosition = (): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
};

export const LogFlightTimeDialog = ({ open, onOpenChange, onFlightLogged, onStopTimer, prefilledDuration, safeskyMode, completedChecklistIds, prefilledMissionId, flightTrack, dronetagDeviceId, startPosition, pilotName, flightStartTime }: LogFlightTimeDialogProps) => {
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [linkedPersonnel, setLinkedPersonnel] = useState<string[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  
  const [formData, setFormData] = useState({
    droneId: "",
    missionId: "",
    pilotId: "",
    departureLocation: "",
    landingLocation: "",
    flightDurationMinutes: 0,
    movements: 1,
    flightDate: new Date().toISOString().split('T')[0],
    notes: "",
    markMissionCompleted: false,
    operationType: "VLOS" as "VLOS" | "BVLOS" | "EVLOS",
  });

  const [departurePickerOpen, setDeparturePickerOpen] = useState(false);
  const [landingPickerOpen, setLandingPickerOpen] = useState(false);
  const [useTimeRange, setUseTimeRange] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Post-flight checklist state
  const [postFlightPromptOpen, setPostFlightPromptOpen] = useState(false);
  const [postFlightChecklistId, setPostFlightChecklistId] = useState<string | null>(null);
  const [postFlightMissionId, setPostFlightMissionId] = useState<string | null>(null);
  const [postFlightExecOpen, setPostFlightExecOpen] = useState(false);

  // Deviation report state
  const companySettings = useCompanySettings();
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [deviationMissionId, setDeviationMissionId] = useState<string | null>(null);
  const [deviationFlightLogId, setDeviationFlightLogId] = useState<string | null>(null);

  // Check if this dialog was opened from an active flight timer
  const isFromActiveTimer = prefilledDuration !== undefined;

  const handleCancel = () => {
    if (isFromActiveTimer) {
      setCancelConfirmOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const confirmCancel = () => {
    setCancelConfirmOpen(false);
    onOpenChange(false);
    onStopTimer?.(); // Stop the timer when closing without saving
  };

  // Calculate duration from time range
  useEffect(() => {
    if (useTimeRange && startTime && endTime) {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;
      
      let durationMinutes = endTotalMinutes - startTotalMinutes;
      
      // Handle overnight flights (end time is earlier than start time)
      if (durationMinutes < 0) {
        durationMinutes += 24 * 60;
      }
      
      if (durationMinutes > 0) {
        setFormData(prev => ({ ...prev, flightDurationMinutes: durationMinutes }));
      }
    }
  }, [useTimeRange, startTime, endTime]);

  useEffect(() => {
    if (open && companyId) {
      fetchDrones();
      fetchMissions();
      fetchPersonnel();
      fetchEquipment();
      
      // Reset form completely when dialog opens, with user as default pilot
      // Pre-fill mission if provided from active flight
      setFormData({
        droneId: "",
        missionId: prefilledMissionId || "",
        pilotId: user?.id || "",
        departureLocation: "",
        landingLocation: "",
        flightDurationMinutes: prefilledDuration !== undefined ? prefilledDuration : 0,
        movements: 1,
        flightDate: new Date().toISOString().split('T')[0],
        notes: "",
        // Default to checked when no mission is selected (will auto-create a new mission)
        markMissionCompleted: !prefilledMissionId,
        operationType: "VLOS",
      });
      setSelectedEquipment([]);
      setLinkedPersonnel([]);
      setStartTime("");
      setEndTime("");
    }
  }, [open, companyId, user, prefilledDuration]);

  // Auto-fill departure and landing locations when dialog opens from active flight
  // This runs AFTER the form reset effect above
  useEffect(() => {
    if (!open || !isFromActiveTimer) return;
    
    // Small delay to ensure form reset has completed
    const timer = setTimeout(() => {
      const autoFillLocations = async () => {
        setIsLoadingLocations(true);
        
        let departureLocation = "";
        let landingLocation = "";
        
        console.log('Auto-fill locations starting...', { 
          hasFlightTrack: !!flightTrack, 
          trackLength: flightTrack?.length,
          hasStartPosition: !!startPosition,
          startPosition,
          prefilledMissionId 
        });
        
        try {
          // === DEPARTURE LOCATION ===
          // Priority 1: First position from DroneTag flight track
          if (flightTrack && flightTrack.length > 0) {
            const firstPos = flightTrack[0];
            console.log('Using flightTrack first position for departure:', firstPos);
            // Check for nearby airport (within 1km)
            const icao = await findNearestAirport(firstPos.lat, firstPos.lng);
            if (icao) {
              departureLocation = icao;
              console.log('Found ICAO for departure:', icao);
            } else {
              departureLocation = await reverseGeocode(firstPos.lat, firstPos.lng);
              console.log('Reverse geocoded departure:', departureLocation);
            }
          }
          // Priority 2: Phone GPS at start
          else if (startPosition) {
            console.log('Using startPosition for departure:', startPosition);
            const icao = await findNearestAirport(startPosition.lat, startPosition.lng);
            if (icao) {
              departureLocation = icao;
              console.log('Found ICAO for departure:', icao);
            } else {
              departureLocation = await reverseGeocode(startPosition.lat, startPosition.lng);
              console.log('Reverse geocoded departure:', departureLocation);
            }
          }
          // Priority 3: Mission location (if linked)
          else if (prefilledMissionId) {
            console.log('Fetching mission location for departure');
            const { data: mission } = await supabase
              .from('missions')
              .select('lokasjon')
              .eq('id', prefilledMissionId)
              .single();
            if (mission?.lokasjon) {
              departureLocation = mission.lokasjon;
              console.log('Using mission location for departure:', departureLocation);
            }
          } else {
            console.log('No departure location source available');
          }
          
          // === LANDING LOCATION ===
          // Priority 1: Last position from DroneTag flight track
          if (flightTrack && flightTrack.length > 0) {
            const lastPos = flightTrack[flightTrack.length - 1];
            console.log('Using flightTrack last position for landing:', lastPos);
            const icao = await findNearestAirport(lastPos.lat, lastPos.lng);
            if (icao) {
              landingLocation = icao;
              console.log('Found ICAO for landing:', icao);
            } else {
              landingLocation = await reverseGeocode(lastPos.lat, lastPos.lng);
              console.log('Reverse geocoded landing:', landingLocation);
            }
          }
          // Priority 2: Current phone GPS position
          else {
            console.log('Getting current phone GPS for landing');
            const currentPos = await getCurrentPosition();
            if (currentPos) {
              console.log('Current phone position:', currentPos);
              const icao = await findNearestAirport(currentPos.lat, currentPos.lng);
              if (icao) {
                landingLocation = icao;
                console.log('Found ICAO for landing:', icao);
              } else {
                landingLocation = await reverseGeocode(currentPos.lat, currentPos.lng);
                console.log('Reverse geocoded landing:', landingLocation);
              }
            } else {
              console.log('Could not get current phone position');
            }
          }
          
          // Priority 3: Fallback to departure location if still empty
          if (!landingLocation && departureLocation) {
            console.log('Using departure location as fallback for landing');
            landingLocation = departureLocation;
          }
        } catch (error) {
          console.error('Error auto-filling locations:', error);
        }
        
        console.log('Final locations:', { departureLocation, landingLocation });
        
        setFormData(prev => ({
          ...prev,
          departureLocation: departureLocation || prev.departureLocation,
          landingLocation: landingLocation || prev.landingLocation,
        }));
        
        setIsLoadingLocations(false);
      };
      
      autoFillLocations();
    }, 100); // Small delay to ensure form reset completed
    
    return () => clearTimeout(timer);
  }, [open, isFromActiveTimer, flightTrack, startPosition, prefilledMissionId]);

  // Fetch mission details when a mission is selected
  useEffect(() => {
    if (formData.missionId) {
      fetchMissionDetails(formData.missionId);
    }
  }, [formData.missionId]);

  // Fetch drone links when drone is selected (but not from mission auto-fill)
  useEffect(() => {
    if (formData.droneId) {
      fetchDroneLinks(formData.droneId);
    } else {
      setLinkedPersonnel([]);
    }
  }, [formData.droneId]);

  const fetchDrones = async () => {
    try {
      const { data, error } = await supabase
        .from("drones")
        .select("id, modell, serienummer")
        .eq("aktiv", true)
        .order("modell");
      if (error) throw error;
      if (data) {
        setDrones(data);
        setCachedData(`offline_logflight_drones_${companyId}`, data);
      }
    } catch {
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<Drone[]>(`offline_logflight_drones_${companyId}`);
        if (cached) setDrones(cached);
      }
    }
  };

  const fetchMissions = async () => {
    try {
      const { data, error } = await supabase
        .from("missions")
        .select("id, tittel, tidspunkt")
        .order("tidspunkt", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (data) {
        setMissions(data);
        setCachedData(`offline_logflight_missions_${companyId}`, data);
      }
    } catch {
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<Mission[]>(`offline_logflight_missions_${companyId}`);
        if (cached) setMissions(cached);
      }
    }
  };

  const fetchPersonnel = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("approved", true)
        .order("full_name");
      if (error) throw error;
      if (data) {
        setPersonnel(data);
        setCachedData(`offline_logflight_personnel_${companyId}`, data);
      }
    } catch {
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<Personnel[]>(`offline_logflight_personnel_${companyId}`);
        if (cached) setPersonnel(cached);
      }
    }
  };

  const fetchEquipment = async () => {
    try {
      const { data, error } = await supabase
        .from("equipment")
        .select("id, navn, serienummer")
        .eq("aktiv", true)
        .order("navn");
      if (error) throw error;
      if (data) {
        setEquipmentList(data);
        setCachedData(`offline_logflight_equipment_${companyId}`, data);
      }
    } catch {
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<Equipment[]>(`offline_logflight_equipment_${companyId}`);
        if (cached) setEquipmentList(cached);
      }
    }
  };

  const fetchMissionDetails = async (missionId: string) => {
    // Fetch mission drones
    const { data: missionDrones } = await supabase
      .from("mission_drones")
      .select("drone_id")
      .eq("mission_id", missionId);
    
    // Fetch mission personnel
    const { data: missionPersonnel } = await supabase
      .from("mission_personnel")
      .select("profile_id")
      .eq("mission_id", missionId);
    
    // Fetch mission equipment
    const { data: missionEquipment } = await supabase
      .from("mission_equipment")
      .select("equipment_id")
      .eq("mission_id", missionId);
    
    // Auto-fill drone if available
    if (missionDrones && missionDrones.length > 0) {
      setFormData(prev => ({ ...prev, droneId: missionDrones[0].drone_id }));
    }
    
    // Auto-fill pilot if available
    if (missionPersonnel && missionPersonnel.length > 0) {
      setFormData(prev => ({ ...prev, pilotId: missionPersonnel[0].profile_id }));
    }
    
    // Auto-fill equipment
    if (missionEquipment && missionEquipment.length > 0) {
      setSelectedEquipment(missionEquipment.map(e => e.equipment_id));
    }
  };

  const fetchDroneLinks = async (droneId: string) => {
    // Fetch linked equipment from drone
    const { data: equipmentData } = await supabase
      .from("drone_equipment")
      .select("equipment_id")
      .eq("drone_id", droneId);
    
    // Add drone-linked equipment to selected equipment (if not from mission)
    if (equipmentData && !formData.missionId) {
      const droneEquipmentIds = equipmentData.map(e => e.equipment_id);
      setSelectedEquipment(prev => {
        const combined = new Set([...prev, ...droneEquipmentIds]);
        return Array.from(combined);
      });
    }

    // Fetch linked personnel
    const { data: personnelData } = await (supabase as any)
      .from("drone_personnel")
      .select("profile_id")
      .eq("drone_id", droneId);
    
    if (personnelData) {
      setLinkedPersonnel(personnelData.map((p: any) => p.profile_id));
    }
  };

  const toggleEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev => 
      prev.includes(equipmentId)
        ? prev.filter(id => id !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !companyId || isSubmitting) return;
    
    if (!formData.droneId) {
      toast.error(`Velg en ${terminology.vehicleLower}`);
      return;
    }
    
    if (!formData.departureLocation || !formData.landingLocation) {
      toast.error("Fyll ut avgangsted og landingssted");
      return;
    }
    
    if (formData.flightDurationMinutes <= 0) {
      toast.error("Flytid må være større enn 0");
      return;
    }

    setIsSubmitting(true);
    
    // === OFFLINE PATH ===
    if (!navigator.onLine) {
      try {
        const flightTrackData = flightTrack && flightTrack.length > 0 
          ? { positions: flightTrack } 
          : null;

        // Generate a client-side UUID so secondary records can reference this flight log
        const offlineFlightLogId = crypto.randomUUID();

        // Queue the flight log (trigger will auto-update drone flyvetimer on sync)
        addToQueue({
          table: 'flight_logs',
          operation: 'insert',
          data: {
            id: offlineFlightLogId,
            company_id: companyId,
            user_id: user.id,
            drone_id: formData.droneId,
            mission_id: formData.missionId || null,
            departure_location: formData.departureLocation,
            landing_location: formData.landingLocation,
            flight_duration_minutes: formData.flightDurationMinutes,
            movements: formData.movements,
            flight_date: flightStartTime?.toISOString() || new Date().toISOString(),
            notes: formData.notes || null,
            safesky_mode: safeskyMode || null,
            completed_checklists: completedChecklistIds && completedChecklistIds.length > 0 ? completedChecklistIds : null,
            flight_track: flightTrackData,
            dronetag_device_id: dronetagDeviceId || null,
            operation_type: formData.operationType,
          },
          description: 'Flylogg (offline)',
        });

        // Queue flight_log_equipment entries (trigger will auto-update equipment flyvetimer)
        for (const equipmentId of selectedEquipment) {
          addToQueue({
            table: 'flight_log_equipment',
            operation: 'insert',
            data: {
              flight_log_id: offlineFlightLogId,
              equipment_id: equipmentId,
            },
            description: `Utstyr til flylogg (offline)`,
          });
        }

        // Queue flight_log_personnel entries for linked personnel
        for (const profileId of linkedPersonnel) {
          addToQueue({
            table: 'flight_log_personnel',
            operation: 'insert',
            data: {
              flight_log_id: offlineFlightLogId,
              profile_id: profileId,
            },
            description: `Personell til flylogg (offline)`,
          });
        }

        // Add pilot to personnel if not already linked
        if (formData.pilotId && !linkedPersonnel.includes(formData.pilotId)) {
          addToQueue({
            table: 'flight_log_personnel',
            operation: 'insert',
            data: {
              flight_log_id: offlineFlightLogId,
              profile_id: formData.pilotId,
            },
            description: `Pilot til flylogg (offline)`,
          });
        }

        toast.success("Flylogg lagret lokalt – synkroniseres når nett er tilbake");
        
        // Reset form
        setFormData({
          droneId: "",
          missionId: "",
          pilotId: "",
          departureLocation: "",
          landingLocation: "",
          flightDurationMinutes: 0,
          movements: 1,
          flightDate: new Date().toISOString().split('T')[0],
          notes: "",
          markMissionCompleted: false,
          operationType: "VLOS",
        });
        setSelectedEquipment([]);
        setLinkedPersonnel([]);
        setStartTime("");
        setEndTime("");

        await finishFlow(formData.missionId || null, offlineFlightLogId);
      } catch (error: any) {
        console.error("Error queuing flight log offline:", error);
        toast.error(`Kunne ikke lagre flylogg lokalt: ${error.message}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // === ONLINE PATH (original logic) ===
    try {
      let missionIdToUse = formData.missionId;

      // If no mission was selected, create one automatically
      if (!missionIdToUse && formData.markMissionCompleted) {
        // Determine location from flight track or start position
        let lat = startPosition?.lat || (flightTrack && flightTrack[0]?.lat);
        let lng = startPosition?.lng || (flightTrack && flightTrack[0]?.lng);
        let lokasjon = formData.departureLocation || 'Ukjent lokasjon';

        const flightDate = flightStartTime || new Date();

        // Create auto-generated mission
        const { data: newMission, error: missionError } = await supabase
          .from('missions')
          .insert({
            tittel: `Flytur ${format(flightDate, 'dd.MM.yyyy HH:mm')}`,
            lokasjon,
            latitude: lat || null,
            longitude: lng || null,
            tidspunkt: flightDate.toISOString(),
            slutt_tidspunkt: new Date().toISOString(),
            status: 'Fullført',
            risk_nivå: 'Lav',
            beskrivelse: `Automatisk generert fra flytur.\nPilot: ${pilotName || personnel.find(p => p.id === formData.pilotId)?.full_name || 'Ukjent'}`,
            company_id: companyId,
            user_id: user.id,
          })
          .select('id')
          .single();

        if (!missionError && newMission) {
          missionIdToUse = newMission.id;
        }
      }

      // 1. Create flight log entry
      const flightTrackData = flightTrack && flightTrack.length > 0 
        ? { positions: flightTrack } 
        : null;

      const { data: flightLog, error: flightLogError } = await (supabase as any)
        .from("flight_logs")
        .insert({
          company_id: companyId,
          user_id: user.id,
          drone_id: formData.droneId,
          mission_id: missionIdToUse || null,
          departure_location: formData.departureLocation,
          landing_location: formData.landingLocation,
          flight_duration_minutes: formData.flightDurationMinutes,
          movements: formData.movements,
          flight_date: flightStartTime?.toISOString() || new Date().toISOString(),
          notes: formData.notes || null,
          safesky_mode: safeskyMode || null,
          completed_checklists: completedChecklistIds && completedChecklistIds.length > 0 ? completedChecklistIds : null,
          flight_track: flightTrackData,
          dronetag_device_id: dronetagDeviceId || null,
          operation_type: formData.operationType,
        })
        .select()
        .single();

      if (flightLogError) throw flightLogError;

      // 2. Create flight_log_equipment entries (trigger auto-updates equipment flyvetimer)
      for (const equipmentId of selectedEquipment) {
        await (supabase as any)
          .from("flight_log_equipment")
          .insert({
            flight_log_id: flightLog.id,
            equipment_id: equipmentId,
          });
      }

      // 3. Create flight_log_personnel entries for linked personnel
      for (const profileId of linkedPersonnel) {
        await (supabase as any)
          .from("flight_log_personnel")
          .insert({
            flight_log_id: flightLog.id,
            profile_id: profileId,
          });
      }

      // 4. Add pilot to flight log personnel if selected and not already linked
      if (formData.pilotId && !linkedPersonnel.includes(formData.pilotId)) {
        await (supabase as any)
          .from("flight_log_personnel")
          .insert({
            flight_log_id: flightLog.id,
            profile_id: formData.pilotId,
          });
      }

      // 5. Update mission status to "Fullført" if checkbox is checked and mission exists
      if (missionIdToUse && formData.markMissionCompleted && formData.missionId) {
        // Only update if it was an existing mission (not auto-created, which is already "Fullført")
        const { error: missionUpdateError } = await supabase
          .from("missions")
          .update({ status: "Fullført" })
          .eq("id", missionIdToUse);
        
        if (missionUpdateError) {
          console.error("Error updating mission status:", missionUpdateError);
          toast.warning("Flytid logget, men kunne ikke oppdatere oppdragsstatus");
        } else {
          toast.success("Flytid logget og oppdrag markert som fullført!");
        }
      } else {
        toast.success("Flytid logget!");
      }

      // Check if selected drone has a post-flight checklist
      let foundPostFlightChecklistId: string | null = null;
      if (formData.droneId) {
        const { data: droneData } = await supabase
          .from("drones")
          .select("post_flight_checklist_id")
          .eq("id", formData.droneId)
          .single();
        foundPostFlightChecklistId = (droneData as any)?.post_flight_checklist_id || null;
      }

      if (foundPostFlightChecklistId) {
        // Show post-flight checklist prompt instead of closing immediately
        setPostFlightChecklistId(foundPostFlightChecklistId);
        setPostFlightMissionId(missionIdToUse || null);
        setIsSubmitting(false);
        setPostFlightPromptOpen(true);
        return; // Don't close dialog yet
      }
      
      // Reset form
      setFormData({
        droneId: "",
        missionId: "",
        pilotId: "",
        departureLocation: "",
        landingLocation: "",
        flightDurationMinutes: 0,
        movements: 1,
        flightDate: new Date().toISOString().split('T')[0],
        notes: "",
        markMissionCompleted: false,
        operationType: "VLOS",
      });
      setSelectedEquipment([]);
      setLinkedPersonnel([]);
      setStartTime("");
      setEndTime("");

      await finishFlow(missionIdToUse || null, flightLog?.id || null);
    } catch (error: any) {
      console.error("Error logging flight time:", error);
      toast.error(`Kunne ikke logge flytid: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFormState = () => {
    setFormData({
      droneId: "",
      missionId: "",
      pilotId: "",
      departureLocation: "",
      landingLocation: "",
      flightDurationMinutes: 0,
      movements: 1,
      flightDate: new Date().toISOString().split('T')[0],
      notes: "",
      markMissionCompleted: false,
      operationType: "VLOS",
    });
    setSelectedEquipment([]);
    setLinkedPersonnel([]);
    setStartTime("");
    setEndTime("");
    setPostFlightChecklistId(null);
    setPostFlightMissionId(null);
  };

  const finishFlow = async (missionIdForReport: string | null, flightLogIdForReport: string | null) => {
    // Deviation report: child departments inherit toggle + categories from parent
    if (missionIdForReport && companyId && navigator.onLine) {
      try {
        // Resolve effective enabled-flag (parent overrides child via propagate_deviation_report)
        const { data: comp } = await supabase
          .from("companies")
          .select("parent_company_id, deviation_report_enabled")
          .eq("id", companyId)
          .maybeSingle();
        const parentId = (comp as any)?.parent_company_id;
        let enabled = (comp as any)?.deviation_report_enabled ?? false;
        if (parentId) {
          const { data: parent } = await supabase
            .from("companies")
            .select("deviation_report_enabled")
            .eq("id", parentId)
            .maybeSingle();
          enabled = (parent as any)?.deviation_report_enabled ?? false;
        }
        if (enabled) {
          // Use RPC to check effective categories (handles inheritance + RLS)
          const { data: hasCats } = await (supabase as any).rpc("has_effective_deviation_categories", {
            _company_id: companyId,
          });
          if (hasCats) {
            setDeviationMissionId(missionIdForReport);
            setDeviationFlightLogId(flightLogIdForReport);
            setDeviationDialogOpen(true);
            return;
          }
        }
      } catch {
        // fall through
      }
    }
    resetFormState();
    onOpenChange(false);
    onFlightLogged?.();
  };

  const resetAndClose = () => {
    resetFormState();
    onOpenChange(false);
    onFlightLogged?.();
  };

  const handlePostFlightExecuteNow = () => {
    setPostFlightPromptOpen(false);
    setPostFlightExecOpen(true);
  };

  const handlePostFlightExecuteLater = async () => {
    setPostFlightPromptOpen(false);
    // Add checklist to mission's checklist_ids as pending (gray badge)
    if (postFlightMissionId && postFlightChecklistId) {
      try {
        const { data: missionData } = await supabase
          .from("missions")
          .select("checklist_ids")
          .eq("id", postFlightMissionId)
          .single();
        const existingIds: string[] = (missionData as any)?.checklist_ids || [];
        const merged = [...new Set([...existingIds, postFlightChecklistId])];
        await supabase
          .from("missions")
          .update({ checklist_ids: merged })
          .eq("id", postFlightMissionId);
      } catch (e) {
        console.warn("Could not add post-flight checklist to mission:", e);
      }
    }
    await finishFlow(postFlightMissionId, null);
  };

  const handlePostFlightChecklistCompleted = async (_checklistId: string) => {
    setPostFlightExecOpen(false);
    // Mark checklist as completed on mission
    if (postFlightMissionId && postFlightChecklistId) {
      try {
        const { data: missionData } = await supabase
          .from("missions")
          .select("checklist_ids, checklist_completed_ids")
          .eq("id", postFlightMissionId)
          .single();
        const existingIds: string[] = (missionData as any)?.checklist_ids || [];
        const existingCompleted: string[] = (missionData as any)?.checklist_completed_ids || [];
        const mergedIds = [...new Set([...existingIds, postFlightChecklistId])];
        const mergedCompleted = [...new Set([...existingCompleted, postFlightChecklistId])];
        await supabase
          .from("missions")
          .update({ checklist_ids: mergedIds, checklist_completed_ids: mergedCompleted })
          .eq("id", postFlightMissionId);
      } catch (e) {
        console.warn("Could not update post-flight checklist on mission:", e);
      }
    }
    await finishFlow(postFlightMissionId, null);
  };

  const handlePostFlightChecklistCancelled = async () => {
    setPostFlightExecOpen(false);
    // Treat cancel as "execute later"
    await handlePostFlightExecuteLater();
  };
  const selectedDrone = drones.find(d => d.id === formData.droneId);
  const selectedPilot = personnel.find(p => p.id === formData.pilotId);

  // Build flight time summary
  const buildFlightTimeSummary = () => {
    const items: string[] = [];
    
    if (selectedPilot) {
      items.push(selectedPilot.full_name || selectedPilot.email || 'Pilot');
    }
    
    if (selectedDrone) {
      items.push(selectedDrone.modell);
    }
    
    if (selectedEquipment.length > 0) {
      const equipmentNames = selectedEquipment
        .map(id => equipmentList.find(e => e.id === id)?.navn)
        .filter(Boolean);
      items.push(...equipmentNames as string[]);
    }
    
    return items;
  };

  const flightTimeSummary = buildFlightTimeSummary();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Logg flytid
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Warning when DroneTag was selected but no track recorded */}
          {dronetagDeviceId && (!flightTrack || flightTrack.length === 0) && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-yellow-800 dark:text-yellow-200">
                <span className="font-medium">Ingen DroneTag-posisjoner funnet.</span>{" "}
                Sjekk at DroneTag-enheten sender data til SafeSky under flytur.
              </div>
            </div>
          )}
          {/* Mission selection - NOW AT TOP */}
          <div>
            <Label htmlFor="mission">Tilknytt oppdrag</Label>
            <Select 
              value={formData.missionId || "none"} 
              onValueChange={(value) => {
                const newMissionId = value === "none" ? "" : value;
                setFormData({ 
                  ...formData, 
                  missionId: newMissionId,
                  markMissionCompleted: false,
                  // Clear auto-filled fields when removing mission
                  ...(newMissionId === "" ? { droneId: "", pilotId: "" } : {})
                });
                if (newMissionId === "") {
                  setSelectedEquipment([]);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg oppdrag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                {missions.map((mission) => (
                  <SelectItem key={mission.id} value={mission.id}>
                    {mission.tittel} - {new Date(mission.tidspunkt).toLocaleDateString('nb-NO')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Option to mark mission as completed */}
            {formData.missionId && (
              <div className="flex items-center justify-between mt-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <Label htmlFor="markCompleted" className="text-sm cursor-pointer">
                    Sett oppdrag til fullført
                  </Label>
                </div>
                <Switch
                  id="markCompleted"
                  checked={formData.markMissionCompleted}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, markMissionCompleted: checked })
                  }
                />
              </div>
            )}
          </div>

          {/* Drone/Fly selection */}
          <div>
            <Label htmlFor="drone">{terminology.vehicle} *</Label>
            <Select 
              value={formData.droneId} 
              onValueChange={(value) => setFormData({ ...formData, droneId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={terminology.selectVehicle} />
              </SelectTrigger>
              <SelectContent>
                {drones.map((drone) => (
                  <SelectItem key={drone.id} value={drone.id}>
                    <span className="flex items-center gap-2">
                      <Plane className="w-4 h-4" />
                      {drone.modell} (SN: {drone.serienummer})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
          </Select>
          </div>

          {/* Pilot selection */}
          <div>
            <Label htmlFor="pilot" className="flex items-center gap-1">
              <User className="w-3 h-3" />
              Pilot
            </Label>
            <Select 
              value={formData.pilotId || "none"} 
              onValueChange={(value) => setFormData({ ...formData, pilotId: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg pilot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                {personnel.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.full_name || person.email || 'Ukjent'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment selection - Dropdown */}
          <div>
            <Label className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              Utstyr
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal mt-1"
                >
                  {selectedEquipment.length === 0 
                    ? "Velg utstyr" 
                    : `${selectedEquipment.length} utstyr valgt`}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover border border-border" align="start">
                <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                  {equipmentList.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Ingen utstyr tilgjengelig</p>
                  ) : (
                    equipmentList.map((equipment) => (
                      <div 
                        key={equipment.id} 
                        className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => toggleEquipment(equipment.id)}
                      >
                        <Checkbox
                          id={`equipment-${equipment.id}`}
                          checked={selectedEquipment.includes(equipment.id)}
                          onCheckedChange={() => toggleEquipment(equipment.id)}
                        />
                        <label 
                          htmlFor={`equipment-${equipment.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {equipment.navn} (SN: {equipment.serienummer})
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Flight date */}
          <div>
            <Label htmlFor="flightDate">Dato *</Label>
            <Input
              id="flightDate"
              type="date"
              value={formData.flightDate}
              onChange={(e) => setFormData({ ...formData, flightDate: e.target.value })}
              required
            />
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="departure" className="flex items-center gap-1">
                <Navigation className="w-3 h-3" />
                Avgangssted *
                {isLoadingLocations && <span className="text-xs text-muted-foreground ml-1">(henter...)</span>}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="departure"
                  value={formData.departureLocation}
                  onChange={(e) => setFormData({ ...formData, departureLocation: e.target.value })}
                  placeholder={isLoadingLocations ? "Henter posisjon..." : "F.eks. Oslo"}
                  required
                  className="flex-1"
                  disabled={isLoadingLocations}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDeparturePickerOpen(true)}
                  title="Velg på kart"
                  disabled={isLoadingLocations}
                >
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="landing" className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Landingssted *
                {isLoadingLocations && <span className="text-xs text-muted-foreground ml-1">(henter...)</span>}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="landing"
                  value={formData.landingLocation}
                  onChange={(e) => setFormData({ ...formData, landingLocation: e.target.value })}
                  placeholder={isLoadingLocations ? "Henter posisjon..." : "F.eks. Bergen"}
                  required
                  className="flex-1"
                  disabled={isLoadingLocations}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setLandingPickerOpen(true)}
                  title="Velg på kart"
                  disabled={isLoadingLocations}
                >
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Flight duration toggle and inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Flytid *
              </Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${!useTimeRange ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  Minutter
                </span>
                <Switch
                  checked={useTimeRange}
                  onCheckedChange={(checked) => {
                    setUseTimeRange(checked);
                    if (!checked) {
                      setStartTime("");
                      setEndTime("");
                    }
                  }}
                />
                <span className={`text-xs ${useTimeRange ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  Klokkeslett
                </span>
              </div>
            </div>

            {useTimeRange ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime" className="text-xs text-muted-foreground">Fra</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime" className="text-xs text-muted-foreground">Til</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <Input
                id="duration"
                type="number"
                min="1"
                value={formData.flightDurationMinutes || ""}
                onChange={(e) => setFormData({ ...formData, flightDurationMinutes: parseInt(e.target.value) || 0 })}
                placeholder="45"
                required
              />
            )}

            {formData.flightDurationMinutes > 0 && (
              <p className="text-xs text-muted-foreground">
                = {formData.flightDurationMinutes} minutter ({(formData.flightDurationMinutes / 60).toFixed(2)} timer)
              </p>
            )}
          </div>

          {/* Movements */}
          <div>
            <Label htmlFor="movements">Antall bevegelser</Label>
            <Input
              id="movements"
              type="number"
              min="1"
              value={formData.movements === 0 ? '' : formData.movements}
              onChange={(e) => setFormData({ ...formData, movements: e.target.value === '' ? 0 : parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground mt-1">Antall landinger</p>
          </div>

          {/* Operation type (VLOS / BVLOS / EVLOS) */}
          <div>
            <Label htmlFor="operation-type">Operasjonstype</Label>
            <Select
              value={formData.operationType}
              onValueChange={(v) => setFormData({ ...formData, operationType: v as "VLOS" | "BVLOS" | "EVLOS" })}
            >
              <SelectTrigger id="operation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VLOS">VLOS — visuell siktforbindelse</SelectItem>
                <SelectItem value="BVLOS">BVLOS — utenfor visuell rekkevidde</SelectItem>
                <SelectItem value="EVLOS">EVLOS — utvidet med observatør</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Standard: VLOS. Brukes i statistikken på Status-siden.</p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Merknad</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Valgfri merknad..."
              rows={2}
            />
          </div>

          {/* Flight time summary */}
          {flightTimeSummary.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <span className="font-medium">Flytid logges på:</span>{" "}
                  {flightTimeSummary.join(", ")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Logger..." : "Logg flytid"}
            </Button>
          </DialogFooter>
        </form>

        {/* Location picker dialogs */}
        <LocationPickerDialog
          open={departurePickerOpen}
          onOpenChange={setDeparturePickerOpen}
          onLocationSelected={(location) => setFormData({ ...formData, departureLocation: location })}
          title="Velg avgangssted"
        />
        <LocationPickerDialog
          open={landingPickerOpen}
          onOpenChange={setLandingPickerOpen}
          onLocationSelected={(location) => setFormData({ ...formData, landingLocation: location })}
          title="Velg landingssted"
        />
      </DialogContent>

      {/* Cancel confirmation dialog for active flight timer */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avslutt flytur?</AlertDialogTitle>
            <AlertDialogDescription>
              Velg om du vil stoppe flyturen uten å lagre, eller fortsette loggingen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCancelConfirmOpen(false); onOpenChange(false); }}>Fortsett logging</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive hover:bg-destructive/90">
              Avslutt flytur
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post-flight checklist prompt */}
      <AlertDialog open={postFlightPromptOpen} onOpenChange={setPostFlightPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post flight sjekkliste</AlertDialogTitle>
            <AlertDialogDescription>
              Dronen har en post flight sjekkliste. Vil du utføre den nå eller senere?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handlePostFlightExecuteLater}>
              Utfør senere
            </Button>
            <Button onClick={handlePostFlightExecuteNow}>
              Utfør nå
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post-flight checklist execution */}
      {postFlightExecOpen && postFlightChecklistId && (
        <ChecklistExecutionDialog
          open={postFlightExecOpen}
          onOpenChange={(open) => {
            if (!open) handlePostFlightChecklistCancelled();
          }}
          checklistId={postFlightChecklistId}
          itemName="Post flight"
          onComplete={handlePostFlightChecklistCompleted}
        />
      )}

      {/* Deviation report after flight */}
      <DeviationReportDialog
        open={deviationDialogOpen}
        onOpenChange={setDeviationDialogOpen}
        missionId={deviationMissionId}
        flightLogId={deviationFlightLogId}
        onDone={() => {
          setDeviationMissionId(null);
          setDeviationFlightLogId(null);
          resetFormState();
          onOpenChange(false);
          onFlightLogged?.();
        }}
      />
    </Dialog>
  );
};
