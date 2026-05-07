import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, Navigation, Check } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationSelected: (location: string, lat: number, lng: number) => void;
  title: string;
}

export const LocationPickerDialog = ({ 
  open, 
  onOpenChange, 
  onLocationSelected, 
  title 
}: LocationPickerDialogProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  
  const [selectedLocation, setSelectedLocation] = useState<{
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  // Norway center as fallback
  const NORWAY_CENTER: [number, number] = [62.0, 10.0];

  useEffect(() => {
    if (!open) {
      // Cleanup when closing
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      userMarkerRef.current = null;
      setSelectedLocation(null);
      setIsLoadingLocation(true);
      return;
    }

    // Initialize map when dialog opens
    const initMap = (center: [number, number], zoom: number) => {
      if (!mapContainer.current || mapRef.current) return;

      const map = L.map(mapContainer.current, {
        center,
        zoom,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Handle map clicks
      map.on("click", async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        
        // Remove existing marker
        if (markerRef.current) {
          markerRef.current.remove();
        }

        // Add new marker
        const redIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: 24px;
            height: 24px;
            background: hsl(var(--destructive));
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        markerRef.current = L.marker([lat, lng], { icon: redIcon }).addTo(map);

        // Reverse geocode
        setIsLoadingAddress(true);
        try {
          const response = await fetch(
            `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lng}&radius=500&treffPerSide=1`
          );
          const data = await response.json();

          let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          if (data.adresser && data.adresser.length > 0) {
            const addr = data.adresser[0];
            address = `${addr.adressetekst}, ${addr.postnummer} ${addr.poststed}`;
          }

          setSelectedLocation({ address, lat, lng });
        } catch (error) {
          console.error("Reverse geocoding failed:", error);
          setSelectedLocation({ 
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, 
            lat, 
            lng 
          });
        } finally {
          setIsLoadingAddress(false);
        }
      });

      mapRef.current = map;
      setIsLoadingLocation(false);
    };

    // Try to get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          
          initMap([userLat, userLng], 14);

          // Add user position marker
          if (mapRef.current) {
            userMarkerRef.current = L.circleMarker([userLat, userLng], {
              radius: 10,
              fillColor: "hsl(217, 91%, 60%)",
              color: "white",
              weight: 3,
              opacity: 1,
              fillOpacity: 0.8,
            }).addTo(mapRef.current);

            userMarkerRef.current.bindPopup("Din posisjon").openPopup();
          }
        },
        (error) => {
          console.warn("Geolocation error:", error);
          initMap(NORWAY_CENTER, 6);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      initMap(NORWAY_CENTER, 6);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open]);

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelected(selectedLocation.address, selectedLocation.lat, selectedLocation.lng);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4">
          {isLoadingLocation && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Henter din posisjon...
            </div>
          )}
          
          {!isLoadingLocation && (
            <p className="text-sm text-muted-foreground mb-2">
              Klikk på kartet for å velge posisjon
            </p>
          )}
        </div>

        <div 
          ref={mapContainer} 
          className="w-full h-[50vh] min-h-[300px]"
          style={{ zIndex: 0 }}
        />

        {selectedLocation && (
          <div className="px-4 py-2 bg-muted/50 border-t">
            <div className="flex items-start gap-2">
              <Navigation className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {isLoadingAddress ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Henter adresse...
                  </div>
                ) : (
                  <p className="text-sm font-medium truncate">{selectedLocation.address}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button 
            type="button" 
            onClick={handleConfirm} 
            disabled={!selectedLocation || isLoadingAddress}
          >
            <Check className="w-4 h-4 mr-2" />
            Bekreft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
