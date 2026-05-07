import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Search, Plus, AlertTriangle, Weight, Radio } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  status: string;
  vekt: number | null;
}

interface DronetagDevice {
  id: string;
  name: string | null;
  device_id: string;
  callsign: string | null;
  description: string | null;
}

interface AddEquipmentToDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  existingEquipmentIds: string[];
  existingDronetagIds?: string[];
  onEquipmentAdded: () => void;
  dronePayload: number | null;
  currentEquipmentWeight: number;
}

const statusColors: Record<string, string> = {
  Grønn: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
  Gul: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Rød: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const AddEquipmentToDroneDialog = ({ 
  open, 
  onOpenChange, 
  droneId, 
  existingEquipmentIds,
  existingDronetagIds = [],
  onEquipmentAdded,
  dronePayload,
  currentEquipmentWeight
}: AddEquipmentToDroneDialogProps) => {
  const { user, companyId } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [dronetags, setDronetags] = useState<DronetagDevice[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("equipment");

  useEffect(() => {
    if (open) {
      fetchAvailableEquipment();
      fetchAvailableDronetags();
    }
  }, [open, existingEquipmentIds, existingDronetagIds]);

  const fetchAvailableEquipment = async () => {
    const { data, error } = await supabase
      .from("equipment")
      .select("id, navn, type, serienummer, status, vekt")
      .eq("aktiv", true)
      .order("navn");

    if (error) {
      console.error("Error fetching equipment:", error);
      toast.error("Kunne ikke hente utstyr");
    } else {
      const available = (data || []).filter(
        (item) => !existingEquipmentIds.includes(item.id)
      );
      setEquipment(available);
    }
  };

  const fetchAvailableDronetags = async () => {
    const { data, error } = await supabase
      .from("dronetag_devices")
      .select("id, name, device_id, callsign, description, drone_id")
      .order("name");

    if (error) {
      console.error("Error fetching dronetag devices:", error);
      toast.error("Kunne ikke hente DroneTag-enheter");
    } else {
      // Filter out already linked dronetags (either to this drone or others)
      const available = (data || []).filter(
        (item) => !item.drone_id && !existingDronetagIds.includes(item.id)
      );
      setDronetags(available);
    }
  };

  const logEquipmentHistory = async (itemId: string | null, itemName: string, itemType: 'equipment' | 'dronetag') => {
    if (!user || !companyId) return;
    try {
      await supabase.from("drone_equipment_history").insert({
        drone_id: droneId,
        company_id: companyId,
        user_id: user.id,
        action: 'added',
        item_type: itemType,
        item_id: itemId,
        item_name: itemName,
      });
    } catch (error) {
      console.error("Error logging equipment history:", error);
    }
  };

  const getWeightStatus = (equipmentWeight: number | null): "ok" | "warning" | "exceeded" => {
    if (!dronePayload || !equipmentWeight) return "ok";
    
    const newTotalWeight = currentEquipmentWeight + equipmentWeight;
    
    if (newTotalWeight > dronePayload) {
      return "exceeded";
    }
    if (newTotalWeight > dronePayload - 0.1) {
      return "warning";
    }
    return "ok";
  };

  const handleAddEquipment = async (equipmentItem: Equipment) => {
    setAdding(equipmentItem.id);
    
    try {
      const { error } = await supabase
        .from("drone_equipment")
        .insert({
          drone_id: droneId,
          equipment_id: equipmentItem.id,
        });

      if (error) throw error;

      await logEquipmentHistory(equipmentItem.id, equipmentItem.navn, 'equipment');

      toast.success("Utstyr lagt til");
      onEquipmentAdded();
      fetchAvailableEquipment();
    } catch (error: any) {
      console.error("Error adding equipment:", error);
      toast.error(`Kunne ikke legge til utstyr: ${error.message}`);
    } finally {
      setAdding(null);
    }
  };

  const handleAddDronetag = async (dronetag: DronetagDevice) => {
    setAdding(dronetag.id);
    
    try {
      const { error } = await supabase
        .from("dronetag_devices")
        .update({ drone_id: droneId })
        .eq("id", dronetag.id);

      if (error) throw error;

      await logEquipmentHistory(dronetag.id, dronetag.name || dronetag.device_id, 'dronetag');

      toast.success("DroneTag lagt til");
      onEquipmentAdded();
      fetchAvailableDronetags();
    } catch (error: any) {
      console.error("Error adding dronetag:", error);
      toast.error(`Kunne ikke legge til DroneTag: ${error.message}`);
    } finally {
      setAdding(null);
    }
  };

  const filteredEquipment = equipment.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.navn.toLowerCase().includes(searchLower) ||
      item.type.toLowerCase().includes(searchLower) ||
      item.serienummer.toLowerCase().includes(searchLower)
    );
  });

  const filteredDronetags = dronetags.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      (item.name?.toLowerCase() || "").includes(searchLower) ||
      item.device_id.toLowerCase().includes(searchLower) ||
      (item.callsign?.toLowerCase() || "").includes(searchLower)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Legg til utstyr</DialogTitle>
        </DialogHeader>

        {dronePayload !== null && activeTab === "equipment" && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
            <Weight className="w-4 h-4 text-muted-foreground" />
            <span>
              Utstyrsvekt: <strong>{currentEquipmentWeight.toFixed(2)} kg</strong> / Payload: <strong>{dronePayload} kg</strong>
            </span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="equipment">Utstyr ({filteredEquipment.length})</TabsTrigger>
            <TabsTrigger value="dronetag">DroneTag ({filteredDronetags.length})</TabsTrigger>
          </TabsList>

          <div className="relative my-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "equipment" ? "Søk etter navn, type eller serienummer..." : "Søk etter navn, device ID eller callsign..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <TabsContent value="equipment" className="flex-1 overflow-y-auto space-y-2 pr-2 mt-0">
            {filteredEquipment.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {search ? `Ingen treff for "${search}"` : "Ingen tilgjengelig utstyr"}
              </p>
            ) : (
              filteredEquipment.map((item) => {
                const weightStatus = getWeightStatus(item.vekt);
                const newTotalWeight = currentEquipmentWeight + (item.vekt || 0);
                
                return (
                  <div
                    key={item.id}
                    className="flex flex-col p-3 bg-background/50 rounded-lg border border-border hover:bg-background/70 transition-colors gap-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-medium break-words min-w-0">{item.navn}</h4>
                          <Badge className={`${statusColors[item.status] || ""} border text-xs flex-shrink-0`}>
                            {item.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.type}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>SN: {item.serienummer}</span>
                          {item.vekt !== null && (
                            <span className="flex items-center gap-1">
                              <Weight className="w-3 h-3" />
                              {item.vekt} kg
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddEquipment(item)}
                        disabled={adding === item.id}
                        className="gap-2 w-full sm:w-auto flex-shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        {adding === item.id ? "Legger til..." : "Legg til"}
                      </Button>
                    </div>
                    
                    {dronePayload !== null && item.vekt !== null && weightStatus !== "ok" && (
                      <div className={`flex items-center gap-2 mt-2 p-2 rounded text-xs ${
                        weightStatus === "exceeded" 
                          ? "bg-destructive/10 text-destructive" 
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {weightStatus === "exceeded" 
                            ? `Overskrider payload! Ny totalvekt: ${newTotalWeight.toFixed(2)} kg`
                            : `Nær payload-grense. Ny totalvekt: ${newTotalWeight.toFixed(2)} kg`
                          }
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="dronetag" className="flex-1 overflow-y-auto space-y-2 pr-2 mt-0">
            {filteredDronetags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {search ? `Ingen treff for "${search}"` : "Ingen tilgjengelige DroneTag-enheter"}
              </p>
            ) : (
              filteredDronetags.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col p-3 bg-background/50 rounded-lg border border-border hover:bg-background/70 transition-colors gap-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Radio className="w-4 h-4 text-primary flex-shrink-0" />
                        <h4 className="font-medium break-words min-w-0">{item.name || item.device_id}</h4>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>Device: {item.device_id}</span>
                        {item.callsign && <span>Callsign: {item.callsign}</span>}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddDronetag(item)}
                      disabled={adding === item.id}
                      className="gap-2 w-full sm:w-auto flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      {adding === item.id ? "Legger til..." : "Legg til"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
