import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Plane } from "lucide-react";

interface EditFlightLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightLogId: string | null;
  onSaved?: () => void;
}

interface FlightLogRow {
  id: string;
  company_id: string;
  flight_date: string;
  departure_location: string | null;
  landing_location: string | null;
  flight_duration_minutes: number;
  movements: number | null;
  notes: string | null;
  operation_type: string | null;
}

export const EditFlightLogDialog = ({ open, onOpenChange, flightLogId, onSaved }: EditFlightLogDialogProps) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<FlightLogRow | null>(null);
  const [persons, setPersons] = useState<Array<{ id: string; full_name?: string | null }>>([]);
  const [originalPilotId, setOriginalPilotId] = useState<string | null>(null);
  const [pilotId, setPilotId] = useState<string | null>(null);
  const [departure, setDeparture] = useState("");
  const [landing, setLanding] = useState("");
  const [durationMin, setDurationMin] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [operationType, setOperationType] = useState<"VLOS" | "BVLOS" | "EVLOS">("VLOS");

  useEffect(() => {
    if (!open || !flightLogId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: fl, error } = await supabase
          .from("flight_logs")
          .select("id, company_id, flight_date, departure_location, landing_location, flight_duration_minutes, movements, notes, operation_type")
          .eq("id", flightLogId)
          .single();
        if (error) throw error;
        if (cancelled) return;

        setLog(fl as FlightLogRow);
        setDeparture(fl.departure_location || "");
        setLanding(fl.landing_location || "");
        setDurationMin(fl.flight_duration_minutes || 0);
        setNotes(fl.notes || "");
        const ot = ((fl as any).operation_type as string) || "VLOS";
        setOperationType((ot === "BVLOS" || ot === "EVLOS" || ot === "VLOS") ? ot : "VLOS");

        // Fetch current pilot from junction
        const { data: pilotRow } = await (supabase as any)
          .from("flight_log_personnel")
          .select("profile_id")
          .eq("flight_log_id", flightLogId)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const currentPilot = pilotRow?.profile_id || null;
        setOriginalPilotId(currentPilot);
        setPilotId(currentPilot);

        // Fetch personnel from log's company + all sub-departments (hierarchy)
        const targetCompany = (fl as any).company_id || companyId;
        const companyIds = new Set<string>([targetCompany]);
        if (targetCompany) {
          const { data: children } = await supabase
            .from("companies")
            .select("id")
            .eq("parent_company_id", targetCompany);
          (children || []).forEach((c: any) => companyIds.add(c.id));
        }
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, company_id")
          .in("company_id", Array.from(companyIds))
          .order("full_name");
        if (!cancelled) setPersons((profs || []) as any);
      } catch (e: any) {
        toast.error(`Kunne ikke laste flylogg: ${e.message}`);
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, flightLogId, companyId, onOpenChange]);

  const adjustHours = async (table: 'profiles' | 'equipment', id: string, deltaMinutes: number) => {
    if (!id || deltaMinutes === 0) return;
    const column = 'flyvetimer';
    const { data: row } = await (supabase as any)
      .from(table)
      .select(column)
      .eq('id', id)
      .single();
    const current = Number(row?.[column] || 0);
    const newVal = Math.max(0, current + deltaMinutes / 60);
    await (supabase as any)
      .from(table)
      .update({ [column]: newVal })
      .eq('id', id);
  };

  const handleSave = async () => {
    if (!log) return;
    setSaving(true);
    try {
      const oldDuration = log.flight_duration_minutes || 0;
      const newDuration = Number(durationMin) || 0;

      // 1. Update flight_logs main fields
      const { error: updErr } = await supabase
        .from("flight_logs")
        .update({
          departure_location: departure || null,
          landing_location: landing || null,
          flight_duration_minutes: newDuration,
          notes: notes || null,
          operation_type: operationType,
        })
        .eq("id", log.id);
      if (updErr) throw updErr;

      // 2. Pilot reassignment / hours adjustment
      const pilotChanged = originalPilotId !== pilotId;
      const durationChanged = oldDuration !== newDuration;

      if (pilotChanged) {
        if (originalPilotId) {
          await (supabase as any)
            .from("flight_log_personnel")
            .delete()
            .eq("flight_log_id", log.id)
            .eq("profile_id", originalPilotId);
          await adjustHours('profiles', originalPilotId, -oldDuration);
        }
        if (pilotId) {
          await (supabase as any)
            .from("flight_log_personnel")
            .insert({ flight_log_id: log.id, profile_id: pilotId });
          await adjustHours('profiles', pilotId, newDuration);
        }
      } else if (durationChanged && pilotId) {
        // Same pilot, duration changed: adjust by delta
        await adjustHours('profiles', pilotId, newDuration - oldDuration);
      }

      // 3. Adjust equipment hours by delta if duration changed
      if (durationChanged) {
        const { data: eqRows } = await (supabase as any)
          .from("flight_log_equipment")
          .select("equipment_id")
          .eq("flight_log_id", log.id);
        for (const row of (eqRows || [])) {
          await adjustHours('equipment', row.equipment_id, newDuration - oldDuration);
        }
      }

      toast.success("Flylogg oppdatert");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      toast.error(`Kunne ikke lagre: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-primary" />
            Rediger flylogg
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : log ? (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div>
              <Label>Pilot</Label>
              <SearchablePersonSelect
                persons={persons}
                value={pilotId}
                onValueChange={setPilotId}
                placeholder="Velg pilot..."
                searchPlaceholder="Søk pilot..."
                allowNone
                noneLabel="(Ingen pilot)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Endring justerer flytimer på pilotens profil.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Avgang</Label>
                <Input value={departure} onChange={(e) => setDeparture(e.target.value)} />
              </div>
              <div>
                <Label>Landing</Label>
                <Input value={landing} onChange={(e) => setLanding(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Varighet (minutter)</Label>
              <Input
                type="number"
                min={0}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label>Merknader</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div>
              <Label>Operasjonstype</Label>
              <Select value={operationType} onValueChange={(v) => setOperationType(v as "VLOS" | "BVLOS" | "EVLOS")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VLOS">VLOS</SelectItem>
                  <SelectItem value="BVLOS">BVLOS</SelectItem>
                  <SelectItem value="EVLOS">EVLOS</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Brukes i statistikken på Status-siden.</p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !log}>
            {saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Lagrer...</>) : "Lagre endringer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
