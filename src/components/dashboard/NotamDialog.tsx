import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Copy, Save, AlertTriangle, Send } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Mission = any;

interface NotamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onSaved?: () => void;
}

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const toNotamCoord = (lat: number, lng: number): string => {
  const formatDMS = (value: number, isLat: boolean) => {
    const abs = Math.abs(value);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = Math.round((mFull - m) * 60);
    const dStr = isLat ? String(d).padStart(2, "0") : String(d).padStart(3, "0");
    const mStr = String(m).padStart(2, "0");
    const sStr = String(s).padStart(2, "0");
    const dir = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    return `${dStr}${mStr}${sStr}${dir}`;
  };
  return `${formatDMS(lat, true)} ${formatDMS(lng, false)}`;
};

const formatDateNotam = (d: Date) => {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

// Haversine distance in meters between two lat/lng points
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Compute NOTAM radius in NM = max distance from center to any route point + 0.2 NM buffer
const computeRouteRadiusNm = (
  centerLat: number,
  centerLng: number,
  coords: Array<{ lat: number; lng: number }>
): number | null => {
  if (!coords?.length) return null;
  let maxMeters = 0;
  for (const c of coords) {
    const d = haversineMeters(centerLat, centerLng, c.lat, c.lng);
    if (d > maxMeters) maxMeters = d;
  }
  const maxNm = maxMeters / 1852;
  return Math.round((maxNm + 0.2) * 10) / 10;
};

export const NotamDialog = ({ open, onOpenChange, mission, onSaved }: NotamDialogProps) => {
  const { companyId, user } = useAuth();

  const [operationType, setOperationType] = useState("BVLOS");
  const [areaName, setAreaName] = useState("");
  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [radiusNm, setRadiusNm] = useState(0.5);
  const [maxAglFt, setMaxAglFt] = useState(400);
  // "daily" = specific days with time window (phone manned during window)
  // "daterange" = date range only (phone manned 24/7)
  const [scheduleType, setScheduleType] = useState<"daily" | "daterange">("daily");
  const [scheduleDays, setScheduleDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI"]);
  const [timeFrom, setTimeFrom] = useState("0800");
  const [timeTo, setTimeTo] = useState("1600");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [vhfFrequency, setVhfFrequency] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from mission data
  useEffect(() => {
    if (!open || !mission) return;

    if (mission.notam_text) {
      setOperationType(mission.notam_operation_type || "BVLOS");
      setAreaName(mission.notam_area_name || mission.lokasjon || "");
      setCenterLat(mission.notam_center_lat_wgs84 ?? mission.latitude ?? null);
      setCenterLng(mission.notam_center_lon_wgs84 ?? mission.longitude ?? null);
      setRadiusNm(mission.notam_radius_nm ?? 0.5);
      setMaxAglFt(mission.notam_max_agl_ft ?? 400);
      setScheduleType(mission.notam_schedule_type || "daily");
      setScheduleDays(mission.notam_schedule_days || ["MON", "TUE", "WED", "THU", "FRI"]);
      const windows = mission.notam_schedule_windows;
      if (Array.isArray(windows) && windows.length > 0) {
        setTimeFrom(windows[0].from || "0800");
        setTimeTo(windows[0].to || "1600");
      }
      setStartDate(mission.notam_start_utc ? new Date(mission.notam_start_utc) : undefined);
      setEndDate(mission.notam_end_utc ? new Date(mission.notam_end_utc) : undefined);
      setContactName(mission.notam_realtime_contact_name || "");
      setContactPhone(mission.notam_realtime_contact_phone || "");
      setCompanyName(mission.notam_submitter_company || "");
      setVhfFrequency(windows?.[0]?.vhf || "");
    } else {
      setAreaName(mission.lokasjon || "");
      const cLat = mission.latitude ?? null;
      const cLng = mission.longitude ?? null;
      setCenterLat(cLat);
      setCenterLng(cLng);

      // Auto-compute radius from route coordinates if available
      const routeCoords = mission.route?.coordinates as Array<{ lat: number; lng: number }> | undefined;
      let computedRadius: number | null = null;
      if (cLat != null && cLng != null && routeCoords?.length) {
        computedRadius = computeRouteRadiusNm(cLat, cLng, routeCoords);
      }
      setRadiusNm(computedRadius ?? 0.5);

      setMaxAglFt(400);
      setOperationType("BVLOS");
      setScheduleType("daily");
      setScheduleDays(["MON", "TUE", "WED", "THU", "FRI"]);
      setTimeFrom("0800");
      setTimeTo("1600");
      setStartDate(mission.tidspunkt ? new Date(mission.tidspunkt) : undefined);
      setEndDate(mission.slutt_tidspunkt ? new Date(mission.slutt_tidspunkt) : undefined);
      setContactName("");
      setContactPhone("");
      setCompanyName("");
      setVhfFrequency("");
    }

    if (companyId && !mission.notam_submitter_company) {
      supabase
        .from("companies")
        .select("navn")
        .eq("id", companyId)
        .single()
        .then(({ data }) => {
          if (data?.navn) setCompanyName(data.navn);
        });
    }

    // Auto-fill contact name & phone with logged-in user's profile
    if (user?.id) {
      (supabase as any)
        .from("profiles")
        .select("full_name, telefon")
        .eq("id", user.id)
        .single()
        .then(({ data }: any) => {
          if (data?.full_name && !mission.notam_realtime_contact_name) {
            setContactName(data.full_name);
          }
          if (data?.telefon && !mission.notam_realtime_contact_phone) {
            setContactPhone(data.telefon);
          }
        });
    }
  }, [open, mission?.id]);

  const toggleDay = (day: string) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Contact availability description
  const contactAvailabilityNote = useMemo(() => {
    if (scheduleType === "daterange") {
      if (startDate && endDate) {
        return `Telefonnummeret skal være døgnbemannet fra ${formatDateNotam(startDate)} kl. 00:00 til ${formatDateNotam(endDate)} kl. 23:59.`;
      }
      return "Telefonnummeret skal være døgnbemannet i hele perioden.";
    }
    // daily
    const sorted = ALL_DAYS.filter((d) => scheduleDays.includes(d));
    if (sorted.length > 0) {
      let dayStr: string;
      if (sorted.length === 7) dayStr = "alle dager";
      else if (sorted.length >= 2) {
        const indices = sorted.map((d) => ALL_DAYS.indexOf(d));
        const isConsecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
        dayStr = isConsecutive ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join(", ");
      } else {
        dayStr = sorted[0];
      }
      return `Telefonnummeret skal være bemannet ${dayStr} kl. ${timeFrom}-${timeTo}.`;
    }
    return null;
  }, [scheduleType, scheduleDays, timeFrom, timeTo, startDate, endDate]);

  const generatedText = useMemo(() => {
    const lines: string[] = [];

    const datePrefix = startDate && endDate
      ? `${formatDateNotam(startDate)}-${formatDateNotam(endDate)} `
      : startDate
      ? `${formatDateNotam(startDate)} `
      : endDate
      ? `?-${formatDateNotam(endDate)} `
      : "";

    if (scheduleType === "daily") {
      const sorted = ALL_DAYS.filter((d) => scheduleDays.includes(d));
      let dayStr = "";
      if (sorted.length === 7) {
        dayStr = "DAILY";
      } else if (sorted.length >= 2) {
        const indices = sorted.map((d) => ALL_DAYS.indexOf(d));
        const isConsecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
        dayStr = isConsecutive ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join(" ");
      } else if (sorted.length === 1) {
        dayStr = sorted[0];
      }
      const timePart = dayStr ? `${dayStr} ${timeFrom}-${timeTo}` : `${timeFrom}-${timeTo}`;
      lines.push(`${datePrefix}${timePart}`);
    } else if (scheduleType === "daterange") {
      lines.push(datePrefix.trim() || `${timeFrom}-${timeTo}`);
    } else {
      lines.push(`${datePrefix}${timeFrom}-${timeTo}`);
    }

    lines.push(`Unmanned ACFT (${operationType}) will take place in ${areaName}`);

    if (centerLat != null && centerLng != null) {
      lines.push(`PSN ${toNotamCoord(centerLat, centerLng)}, radius ${radiusNm} NM.`);
    }

    lines.push(`MAX HGT ${maxAglFt} FT AGL.`);

    if (contactName || companyName) {
      const who = companyName || contactName;
      const tel = contactPhone ? `, tel ${contactPhone}` : "";
      lines.push(`For realtime status ctc ${who}${tel}`);
    }

    if (vhfFrequency.trim()) {
      lines.push(`VHF ${vhfFrequency.trim()}`);
    }

    return lines.join("\n");
  }, [operationType, areaName, centerLat, centerLng, radiusNm, maxAglFt, scheduleType, scheduleDays, timeFrom, timeTo, startDate, endDate, contactName, contactPhone, companyName, vhfFrequency]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    toast.success("NOTAM-tekst kopiert");
  };

  const handleSave = async () => {
    if (!mission?.id) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("missions")
      .update({
        notam_text: generatedText,
        notam_operation_type: operationType,
        notam_start_utc: startDate?.toISOString() || null,
        notam_end_utc: endDate?.toISOString() || null,
        notam_schedule_type: scheduleType,
        notam_schedule_days: scheduleDays,
        notam_schedule_windows: [{ from: timeFrom, to: timeTo, vhf: vhfFrequency || null }],
        notam_area_name: areaName,
        notam_center_lat_wgs84: centerLat,
        notam_center_lon_wgs84: centerLng,
        notam_radius_nm: radiusNm,
        notam_max_agl_ft: maxAglFt,
        notam_submitter_company: companyName,
        notam_realtime_contact_name: contactName,
        notam_realtime_contact_phone: contactPhone,
      })
      .eq("id", mission.id);

    setSaving(false);
    if (error) {
      toast.error("Kunne ikke lagre NOTAM");
      console.error(error);
    } else {
      toast.success("NOTAM lagret");
      onSaved?.();
      onOpenChange(false);
    }
  };

  const handleSubmit = async () => {
    if (!mission?.id) return;
    setSubmitting(true);
    const { error } = await (supabase as any)
      .from("missions")
      .update({
        notam_text: generatedText,
        notam_operation_type: operationType,
        notam_start_utc: startDate?.toISOString() || null,
        notam_end_utc: endDate?.toISOString() || null,
        notam_schedule_type: scheduleType,
        notam_schedule_days: scheduleDays,
        notam_schedule_windows: [{ from: timeFrom, to: timeTo, vhf: vhfFrequency || null }],
        notam_area_name: areaName,
        notam_center_lat_wgs84: centerLat,
        notam_center_lon_wgs84: centerLng,
        notam_radius_nm: radiusNm,
        notam_max_agl_ft: maxAglFt,
        notam_submitter_company: companyName,
        notam_realtime_contact_name: contactName,
        notam_realtime_contact_phone: contactPhone,
        notam_submitted_at: new Date().toISOString(),
      })
      .eq("id", mission.id);

    setSubmitting(false);
    if (error) {
      toast.error("Kunne ikke sende NOTAM");
      console.error(error);
      return;
    }

    // Build mailto link
    const userName = contactName || "";
    const subjectText = `UAS Notam request, ${companyName}`;
    const bodyText = `Hei.\n\nVi ønsker å publisere følgende NOTAM:\n\n${generatedText}\n\nMvh\n${userName}${companyName ? `, ${companyName}` : ""}`;
    const mailtoUrl = `mailto:nof@avinor.no?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    // Try opening mailto – works in production but not in iframe/preview
    const isInIframe = window.self !== window.top;
    if (!isInIframe) {
      const link = document.createElement("a");
      link.href = mailtoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Always copy full email details to clipboard as fallback
    const clipboardText = `Til: nof@avinor.no\nEmne: ${subjectText}\n\n${bodyText}`;
    await navigator.clipboard.writeText(clipboardText);

    if (isInIframe) {
      toast.success("E-posttekst kopiert til utklippstavlen (mailto fungerer ikke i preview-modus)");
    } else {
      toast.success("NOTAM sendt inn – e-postvindu åpnet");
    }
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>NOTAM-tekst</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Operation type */}
          <div className="space-y-1.5">
            <Label>Operasjonstype</Label>
            <Select value={operationType} onValueChange={setOperationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BVLOS">BVLOS</SelectItem>
                <SelectItem value="VLOS">VLOS</SelectItem>
                <SelectItem value="EVLOS">EVLOS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Area name */}
          <div className="space-y-1.5">
            <Label>Områdenavn</Label>
            <Input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Rennebu" />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Breddegrad (lat)</Label>
              <Input
                type="number"
                step="any"
                value={centerLat ?? ""}
                onChange={(e) => setCenterLat(e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lengdegrad (lon)</Label>
              <Input
                type="number"
                step="any"
                value={centerLng ?? ""}
                onChange={(e) => setCenterLng(e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          {/* Radius & height */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Radius (NM)</Label>
              <Input
                type="number"
                step="0.1"
                value={radiusNm}
                onChange={(e) => setRadiusNm(parseFloat(e.target.value) || 0.5)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maks høyde (FT AGL)</Label>
              <Input
                type="number"
                value={maxAglFt}
                onChange={(e) => setMaxAglFt(parseInt(e.target.value) || 400)}
              />
            </div>
          </div>

          {/* Schedule type */}
          <div className="space-y-1.5">
            <Label>Tidsplan</Label>
            <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daglig med klokkeslett (telefon bemannet i tidsvindu)</SelectItem>
                <SelectItem value="daterange">Datoperiode (telefon døgnbemannet)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fra dato</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Til dato</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Day selection (daily mode) */}
          {scheduleType === "daily" && (
            <>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={scheduleDays.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    {day}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fra kl. (UTC)</Label>
                  <Input value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} placeholder="0800" />
                </div>
                <div className="space-y-1.5">
                  <Label>Til kl. (UTC)</Label>
                  <Input value={timeTo} onChange={(e) => setTimeTo(e.target.value)} placeholder="1600" />
                </div>
              </div>
            </>
          )}

          {/* Contact availability info */}
          {contactAvailabilityNote && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-amber-900 dark:text-amber-100">{contactAvailabilityNote}</span>
            </div>
          )}

          {/* Contact */}
          <div className="space-y-1.5">
            <Label>Selskap</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kontaktperson (direkte)</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon (direkte linje)</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+47 123 45 678" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Telefonnummeret skal gå direkte til personen som kan avklare status og stanse flygning. Ikke bruk sentralbord.
          </p>

          {/* VHF frequency */}
          <div className="space-y-1.5">
            <Label>VHF-frekvens (valgfritt)</Label>
            <Input
              value={vhfFrequency}
              onChange={(e) => setVhfFrequency(e.target.value)}
              placeholder="f.eks. 123.450 MHz"
            />
            <p className="text-xs text-muted-foreground">VHF-frekvens erstatter ikke telefonnummer.</p>
          </div>

          {/* Generated NOTAM */}
          <div className="space-y-1.5">
            <Label>Generert NOTAM-tekst</Label>
            <Textarea value={generatedText} readOnly className="font-mono text-sm min-h-[120px]" />
          </div>

          <p className="text-xs text-muted-foreground">
            NOTAM skal normalt kun sendes inn ved BVLOS eller operasjoner over 120m. «Send inn» åpner din e-postapplikasjon med en ferdig formulert tekst.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Kopier</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? "Lagrer…" : "Lagre"}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting} variant="default" className="bg-green-600 hover:bg-green-700">
              <Send className="w-4 h-4 mr-1.5" />
              {submitting ? "Sender…" : "Send inn"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
