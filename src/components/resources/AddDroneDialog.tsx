import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTerminology } from "@/hooks/useTerminology";
import { useChecklists } from "@/hooks/useChecklists";
import { usePlanGating } from "@/hooks/usePlanGating";

interface DroneModel {
  id: string;
  name: string;
  eu_class: string;
  weight_kg: number;
  payload_kg: number;
  weight_without_payload_kg: number | null;
  standard_takeoff_weight_kg: number | null;
  category: string | null;
  endurance_min: number | null;
  max_wind_mps: number | null;
  sensor_type: string | null;
  comment: string | null;
}

export interface DroneDefaultValues {
  modell?: string;
  serienummer?: string;
  internal_serial?: string;
  merknader?: string;
}

interface AddDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDroneAdded: () => void;
  userId: string;
  defaultValues?: DroneDefaultValues;
  onDroneCreated?: (drone: { id: string; modell: string; serienummer: string }) => void;
}

export const AddDroneDialog = ({ open, onOpenChange, onDroneAdded, userId, defaultValues, onDroneCreated }: AddDroneDialogProps) => {
  const [companyId, setCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspectionStartDate, setInspectionStartDate] = useState<string>("");
  const [inspectionIntervalDays, setInspectionIntervalDays] = useState<string>("");
  const [calculatedNextInspection, setCalculatedNextInspection] = useState<string>("");
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>("");
  const [selectedOpsChecklistIds, setSelectedOpsChecklistIds] = useState<string[]>([]);
  const [selectedPostFlightChecklistId, setSelectedPostFlightChecklistId] = useState<string>("");
  const [droneCount, setDroneCount] = useState(0);
  const terminology = useTerminology();
  const { checklists } = useChecklists();
  const { maxDrones, currentPlan, seatCount } = usePlanGating();

  // Drone catalog state
  const [droneModels, setDroneModels] = useState<DroneModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Controlled form fields for auto-fill
  const [modell, setModell] = useState("");
  const [klasse, setKlasse] = useState("");
  const [vekt, setVekt] = useState("");
  const [payload, setPayload] = useState("");
  const [merknader, setMerknader] = useState("");
  const [internalSerial, setInternalSerial] = useState("");

  useEffect(() => {
    const fetchCompanyId = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      
      if (data) {
        setCompanyId(data.company_id);
        // Count existing drones for plan limit check
        const { count } = await supabase
          .from("drones")
          .select("id", { count: 'exact', head: true })
          .eq("company_id", data.company_id);
        setDroneCount(count ?? 0);
      }
    };
    
    if (userId) {
      fetchCompanyId();
    }
  }, [userId]);

  // Fetch drone models catalog
  useEffect(() => {
    const fetchDroneModels = async () => {
      const { data, error } = await supabase
        .from("drone_models")
        .select("*")
        .order("name");
      
      if (data && !error) {
        setDroneModels(data as DroneModel[]);
      }
    };
    
    if (open) {
      fetchDroneModels();
    }
  }, [open]);

  // Reset form when dialog closes, pre-populate from defaultValues when opening
  useEffect(() => {
    if (!open) {
      setSelectedModelId("");
      setModell("");
      setKlasse("");
      setVekt("");
      setPayload("");
      setMerknader("");
      setInternalSerial("");
      setInspectionStartDate("");
      setInspectionIntervalDays("");
      setCalculatedNextInspection("");
      setSelectedChecklistId("");
      setSelectedOpsChecklistIds([]);
      setSelectedPostFlightChecklistId("");
    } else if (defaultValues) {
      if (defaultValues.modell) setModell(defaultValues.modell);
      if (defaultValues.merknader) setMerknader(defaultValues.merknader);
      if (defaultValues.internal_serial) setInternalSerial(defaultValues.internal_serial);
    }
  }, [open, defaultValues]);

  // Calculate next inspection when start date or interval changes
  useEffect(() => {
    if (inspectionStartDate && inspectionIntervalDays) {
      const startDate = new Date(inspectionStartDate);
      const days = parseInt(inspectionIntervalDays);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + days);
        setCalculatedNextInspection(nextDate.toISOString().split('T')[0]);
      }
    } else {
      setCalculatedNextInspection("");
    }
  }, [inspectionStartDate, inspectionIntervalDays]);

  // Handle catalog selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    if (modelId && modelId !== "manual") {
      const model = droneModels.find(m => m.id === modelId);
      if (model) {
        setModell(model.name);
        setKlasse(model.eu_class);
        setVekt(model.weight_kg.toString());
        setPayload(model.payload_kg.toString());
        setMerknader(model.comment || "");
      }
    } else {
      // Reset for manual input
      setModell("");
      setKlasse("");
      setVekt("");
      setPayload("");
      setMerknader("");
    }
  };

  const handleAddDrone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    // Check drone limit
    if (droneCount >= maxDrones) {
      toast.error(`Du har nådd maks antall droner (${maxDrones}) for din ${currentPlan.name}-plan (${currentPlan.maxDrones} per bruker × ${seatCount} brukere). Oppgrader for å legge til flere.`);
      return;
    }

    setIsSubmitting(true);
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    if (!companyId) {
      toast.error("Kunne ikke hente brukerinformasjon");
      setIsSubmitting(false);
      return;
    }

    const nesteInspeksjon = calculatedNextInspection || (formData.get("neste_inspeksjon") as string) || null;
    
    try {
      const { data: droneData, error } = await (supabase as any).from("drones").insert([{
        user_id: userId,
        company_id: companyId,
        modell: modell || (formData.get("modell") as string),
        serienummer: (formData.get("serienummer") as string) || '',
        internal_serial: internalSerial || null,
        registration_number: (formData.get("registration_number") as string) || null,
        status: (formData.get("status") as string) || "Grønn",
        flyvetimer: parseInt(formData.get("flyvetimer") as string) || 0,
        merknader: merknader || null,
        sist_inspeksjon: (formData.get("sist_inspeksjon") as string) || null,
        neste_inspeksjon: nesteInspeksjon,
        kjøpsdato: (formData.get("kjøpsdato") as string) || null,
        klasse: klasse || null,
        vekt: vekt ? parseFloat(vekt) : null,
        payload: payload ? parseFloat(payload) : null,
        inspection_start_date: inspectionStartDate || null,
        inspection_interval_days: inspectionIntervalDays ? parseInt(inspectionIntervalDays) : null,
        sjekkliste_id: selectedChecklistId && selectedChecklistId !== "none" ? selectedChecklistId : null,
        operations_checklist_ids: selectedOpsChecklistIds.length > 0 ? selectedOpsChecklistIds : null,
        post_flight_checklist_id: selectedPostFlightChecklistId && selectedPostFlightChecklistId !== "none" ? selectedPostFlightChecklistId : null,
      }]).select().single();

      if (error) {
        console.error("Error adding drone:", error);
        if (error.code === "42501" || error.message?.includes("policy")) {
          toast.error(`Du har ikke tillatelse til å legge til ${terminology.vehicleLower}`);
        } else {
          toast.error(`Kunne ikke legge til ${terminology.vehicleLower}: ${error.message || "Ukjent feil"}`);
        }
      } else {
        toast.success(`${terminology.vehicle} lagt til`);
        form.reset();
        setInspectionStartDate("");
        setInspectionIntervalDays("");
        setCalculatedNextInspection("");
        setSelectedChecklistId("");
        setSelectedOpsChecklistIds([]);
        setSelectedPostFlightChecklistId("");
        setSelectedModelId("");
        setModell("");
        setKlasse("");
        setVekt("");
        setPayload("");
        setMerknader("");
        setInternalSerial("");
        if (onDroneCreated && droneData) {
          onDroneCreated({ id: droneData.id, modell: droneData.modell, serienummer: droneData.serienummer });
        }
        onDroneAdded();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{terminology.addVehicle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddDrone} className="space-y-4">
          {/* Drone catalog selector */}
          <div className="border-b pb-4 mb-4">
            <Label>Velg fra katalog (valgfritt)</Label>
            <Select value={selectedModelId} onValueChange={handleModelSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Velg dronemodell eller angi manuelt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Angi manuelt</SelectItem>
                {droneModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} ({model.eu_class})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Velg en modell for å auto-fylle vekt, payload og klasse
            </p>
          </div>

          <div>
            <Label htmlFor="modell">Modell</Label>
            <Input 
              id="modell" 
              name="modell" 
              required 
              value={modell}
              onChange={(e) => setModell(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="serienummer">Serienummer</Label>
            <Input id="serienummer" name="serienummer" defaultValue={defaultValues?.serienummer || ''} />
          </div>
          <div>
            <Label htmlFor="internal_serial">Internt serienummer</Label>
            <Input 
              id="internal_serial" 
              value={internalSerial}
              onChange={(e) => setInternalSerial(e.target.value)}
              placeholder="Valgfritt"
            />
          </div>
          <div>
            <Label htmlFor="registration_number">Registreringsnummer</Label>
            <Input id="registration_number" name="registration_number" placeholder="Valgfritt" />
          </div>
          <div>
            <Label htmlFor="klasse">Klasse</Label>
            <Select value={klasse} onValueChange={setKlasse}>
              <SelectTrigger>
                <SelectValue placeholder="Velg klasse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C0">C0</SelectItem>
                <SelectItem value="C1">C1</SelectItem>
                <SelectItem value="C2">C2</SelectItem>
                <SelectItem value="C3">C3</SelectItem>
                <SelectItem value="C4">C4</SelectItem>
                <SelectItem value="C5">C5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vekt">MTOW (kg)</Label>
              <Input 
                id="vekt" 
                name="vekt" 
                type="number" 
                step="0.001" 
                placeholder="f.eks. 0.9" 
                value={vekt}
                onChange={(e) => setVekt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="payload">Payload (kg)</Label>
              <Input 
                id="payload" 
                name="payload" 
                type="number" 
                step="0.001" 
                placeholder="f.eks. 0.5" 
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            </div>
          </div>
          {selectedModelId && selectedModelId !== "manual" && (() => {
            const model = droneModels.find(m => m.id === selectedModelId);
            if (!model || (!model.weight_without_payload_kg && !model.standard_takeoff_weight_kg && !model.endurance_min && !model.max_wind_mps && !model.sensor_type && !model.category)) return null;
            return (
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                {model.weight_without_payload_kg != null && (
                  <div>
                    <span className="font-medium">Vekt uten payload:</span> {model.weight_without_payload_kg} kg
                  </div>
                )}
                {model.standard_takeoff_weight_kg != null && (
                  <div>
                    <span className="font-medium">Standard takeoff:</span> {model.standard_takeoff_weight_kg} kg
                  </div>
                )}
                {model.endurance_min != null && (
                  <div>
                    <span className="font-medium">Flygetid:</span> {model.endurance_min} min
                  </div>
                )}
                {model.max_wind_mps != null && (
                  <div>
                    <span className="font-medium">Maks vind:</span> {model.max_wind_mps} m/s
                  </div>
                )}
                {model.sensor_type && (
                  <div>
                    <span className="font-medium">Sensor:</span> {model.sensor_type}
                  </div>
                )}
                {model.category && (
                  <div>
                    <span className="font-medium">Kategori:</span> {model.category}
                  </div>
                )}
              </div>
            );
          })()}
          <div>
            <Label htmlFor="kjøpsdato">Kjøpsdato</Label>
            <Input id="kjøpsdato" name="kjøpsdato" type="date" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue="Grønn">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Grønn">Grønn</SelectItem>
                <SelectItem value="Gul">Gul</SelectItem>
                <SelectItem value="Rød">Rød</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="flyvetimer">{terminology.flightHours}</Label>
            <Input id="flyvetimer" name="flyvetimer" type="number" defaultValue={0} />
          </div>
          <div>
            <Label htmlFor="sist_inspeksjon">Sist inspeksjon</Label>
            <Input id="sist_inspeksjon" name="sist_inspeksjon" type="date" />
          </div>
          
          {/* Inspection interval section */}
          <div className="border-t pt-4 mt-4">
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">Inspeksjonsintervall</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inspection_start_date">Startdato</Label>
                <Input 
                  id="inspection_start_date" 
                  type="date" 
                  value={inspectionStartDate}
                  onChange={(e) => setInspectionStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inspection_interval_days">Intervall (dager)</Label>
                <Input 
                  id="inspection_interval_days" 
                  type="number" 
                  placeholder="f.eks. 90"
                  value={inspectionIntervalDays}
                  onChange={(e) => setInspectionIntervalDays(e.target.value)}
                />
              </div>
            </div>
            {calculatedNextInspection && (
              <p className="text-sm text-muted-foreground mt-2">
                Beregnet neste inspeksjon: <span className="font-medium">{new Date(calculatedNextInspection).toLocaleDateString('nb-NO')}</span>
              </p>
            )}
          </div>
          
          {/* Checklist selection */}
          {checklists.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <Label htmlFor="sjekkliste">Sjekkliste for inspeksjon</Label>
              <Select value={selectedChecklistId} onValueChange={setSelectedChecklistId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg sjekkliste (valgfritt)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen sjekkliste</SelectItem>
                  {checklists.map((checklist) => (
                    <SelectItem key={checklist.id} value={checklist.id}>
                      {checklist.tittel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Hvis valgt, må sjekklisten fullføres før inspeksjon registreres
              </p>
            </div>
          )}
          
          {/* Operations checklist multi-select */}
          {checklists.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <Label>Operasjonssjekklister</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal">
                    <span className="min-w-0 flex-1 truncate text-left">
                      {selectedOpsChecklistIds.length > 0
                        ? `${selectedOpsChecklistIds.length} sjekkliste(r) valgt`
                        : "Velg sjekklister (valgfritt)"}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-2" align="start">
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {checklists.map((checklist) => (
                      <label key={checklist.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedOpsChecklistIds.includes(checklist.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedOpsChecklistIds(prev => [...prev, checklist.id]);
                            } else {
                              setSelectedOpsChecklistIds(prev => prev.filter(id => id !== checklist.id));
                            }
                          }}
                        />
                        {checklist.tittel}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground mt-1">
                Kobles automatisk til oppdrag når dronen legges til
              </p>
            </div>
          )}

          {/* Post flight checklist selection */}
          {checklists.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <Label htmlFor="post_flight_checklist">Post flight sjekkliste</Label>
              <Select value={selectedPostFlightChecklistId} onValueChange={setSelectedPostFlightChecklistId}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg post flight sjekkliste (valgfritt)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen sjekkliste</SelectItem>
                  {checklists.map((checklist) => (
                    <SelectItem key={checklist.id} value={checklist.id}>
                      {checklist.tittel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Vises som bekreftelsesdialog når oppdrag fullføres
              </p>
            </div>
          )}
          
          <div>
            <Label htmlFor="neste_inspeksjon">Neste inspeksjon {calculatedNextInspection && "(overstyrt av intervall)"}</Label>
            <Input 
              id="neste_inspeksjon" 
              name="neste_inspeksjon" 
              type="date" 
              value={calculatedNextInspection}
              onChange={(e) => {
                if (!inspectionIntervalDays) {
                  setCalculatedNextInspection(e.target.value);
                }
              }}
              disabled={!!calculatedNextInspection}
            />
          </div>
          <div>
            <Label htmlFor="merknader">Merknader</Label>
            <Textarea 
              id="merknader" 
              name="merknader" 
              value={merknader}
              onChange={(e) => setMerknader(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Legger til..." : terminology.addVehicle}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
