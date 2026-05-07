import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MapPin, Loader2 } from "lucide-react";

interface AddressAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelectLocation?: (location: { address: string; lat: number; lon: number }) => void;
  placeholder?: string;
  required?: boolean;
}

interface KartverketResult {
  adressetekst: string;
  postnummer: string;
  poststed: string;
  kommunenavn: string;
  representasjonspunkt: {
    lat: number;
    lon: number;
  };
}

interface KartverketResponse {
  adresser: KartverketResult[];
}

export function AddressAutocomplete({
  label,
  value,
  onChange,
  onSelectLocation,
  placeholder = "Søk etter adresse...",
  required = false,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<KartverketResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(searchQuery)}&treffPerSide=5&asciiKompatibel=true`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Kunne ikke hente adresser");
      }

      const data: KartverketResponse = await response.json();
      setSuggestions(data.adresser || []);
      setIsOpen((data.adresser || []).length > 0);
    } catch (error) {
      console.error("Feil ved henting av adresser:", error);
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (newValue: string) => {
    setQuery(newValue);
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 350);
  };

  const formatFullAddress = (suggestion: KartverketResult) => {
    return `${suggestion.adressetekst}, ${suggestion.postnummer} ${suggestion.poststed}`;
  };

  const handleSelectSuggestion = (suggestion: KartverketResult) => {
    const address = formatFullAddress(suggestion);
    setQuery(address);
    onChange(address);
    setIsOpen(false);
    setSuggestions([]);

    if (onSelectLocation) {
      onSelectLocation({
        address,
        lat: suggestion.representasjonspunkt.lat,
        lon: suggestion.representasjonspunkt.lon,
      });
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Label htmlFor="address-input">{label}</Label>
      <div className="relative">
        <Input
          id="address-input"
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          className="pr-8"
          required={required}
        />
        {isLoading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!isLoading && query && (
          <MapPin className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          <ul className="py-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.adressetekst}-${index}`}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={cn(
                  "px-3 py-2 cursor-pointer hover:bg-accent transition-colors",
                  "text-sm text-foreground"
                )}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2">{formatFullAddress(suggestion)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
