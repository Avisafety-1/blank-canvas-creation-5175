import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertTriangle, Plane, Users, Wrench, Calendar, FileText } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, getWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TimelineEventType = "mission" | "maintenance" | "document" | "calendar";

interface TimelineEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status?: string;
  eventType: TimelineEventType;
  resourceName?: string;
  resourceType?: "drone" | "equipment" | "personnel";
}

interface ResourceRow {
  id: string;
  name: string;
  type: "drone" | "equipment" | "personnel";
  events: TimelineEvent[];
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const MAINTENANCE_DURATION_MS = 1 * 60 * 60 * 1000;

const EVENT_COLORS: Record<TimelineEventType, string> = {
  mission: "bg-primary/80 border-primary",
  maintenance: "bg-orange-500/80 border-orange-500",
  document: "bg-blue-400/80 border-blue-400",
  calendar: "bg-purple-500/80 border-purple-500",
};

const checkOverlap = (a: TimelineEvent, b: TimelineEvent): boolean => {
  return a.start < b.end && a.end > b.start;
};

export function ResourceTimeline() {
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [resourceRows, setResourceRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [missionDetailOpen, setMissionDetailOpen] = useState(false);
  const [maintenanceDetailOpen, setMaintenanceDetailOpen] = useState(false);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState<TimelineEvent | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        missionsResult,
        dronesResult,
        equipmentResult,
        accessoriesResult,
        calendarEventsResult,
      ] = await Promise.all([
        supabase.from("missions").select("id, tittel, tidspunkt, slutt_tidspunkt, status").in("status", ["Planlagt", "Pågående"]),
        supabase.from("drones").select("id, modell, serienummer, neste_inspeksjon, sjekkliste_id").eq("aktiv", true),
        supabase.from("equipment").select("id, navn, type, neste_vedlikehold, sjekkliste_id").eq("aktiv", true),
        supabase.from("drone_accessories").select("id, navn, drone_id, neste_vedlikehold"),
        supabase.from("calendar_events").select("id, title, event_date, event_time, type"),
      ]);

      const missions = missionsResult.data || [];
      const allDrones = dronesResult.data || [];
      const allEquipment = equipmentResult.data || [];
      const allAccessories = accessoriesResult.data || [];
      const calendarEvents = calendarEventsResult.data || [];

      const droneRows = new Map<string, ResourceRow>();
      const personnelRows = new Map<string, ResourceRow>();
      const equipmentRows = new Map<string, ResourceRow>();
      const calendarRows = new Map<string, ResourceRow>();

      for (const drone of allDrones) {
        droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
        if (drone.neste_inspeksjon) {
          const inspDate = new Date(drone.neste_inspeksjon);
          droneRows.get(drone.id)!.events.push({
            id: `insp-${drone.id}`,
            title: `Inspeksjon`,
            start: inspDate,
            end: new Date(inspDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
            resourceName: drone.modell,
            resourceType: "drone",
          });
        }
      }

      for (const eq of allEquipment) {
        equipmentRows.set(eq.id, { id: eq.id, name: eq.navn, type: "equipment", events: [] });
        if (eq.neste_vedlikehold) {
          const maintDate = new Date(eq.neste_vedlikehold);
          equipmentRows.get(eq.id)!.events.push({
            id: `maint-${eq.id}`,
            title: `Vedlikehold`,
            start: maintDate,
            end: new Date(maintDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
            resourceName: eq.navn,
            resourceType: "equipment",
          });
        }
      }

      for (const acc of allAccessories) {
        if (acc.neste_vedlikehold && acc.drone_id && droneRows.has(acc.drone_id)) {
          const maintDate = new Date(acc.neste_vedlikehold);
          const parentDrone = droneRows.get(acc.drone_id)!;
          parentDrone.events.push({
            id: `acc-maint-${acc.id}`,
            title: `${acc.navn} vedlikehold`,
            start: maintDate,
            end: new Date(maintDate.getTime() + MAINTENANCE_DURATION_MS),
            eventType: "maintenance",
            resourceName: parentDrone.name,
            resourceType: "drone",
          });
        }
      }

      if (missions.length > 0) {
        const missionIds = missions.map((m) => m.id);
        const [droneLinks, personnelLinks, equipmentLinks] = await Promise.all([
          supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
          supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name)").in("mission_id", missionIds),
          supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        ]);

        const missionMap = new Map(missions.map((m) => [m.id, m]));

        const toTimelineEvent = (missionId: string): TimelineEvent | null => {
          const m = missionMap.get(missionId);
          if (!m) return null;
          const start = new Date(m.tidspunkt);
          const end = m.slutt_tidspunkt ? new Date(m.slutt_tidspunkt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
          return { id: m.id, title: m.tittel, start, end, status: m.status, eventType: "mission" };
        };

        for (const link of droneLinks.data || []) {
          const drone = link.drones as any;
          if (!drone) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!droneRows.has(drone.id)) {
            droneRows.set(drone.id, { id: drone.id, name: drone.modell, type: "drone", events: [] });
          }
          droneRows.get(drone.id)!.events.push(ev);
        }

        for (const link of personnelLinks.data || []) {
          const profile = link.profiles as any;
          if (!profile) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!personnelRows.has(profile.id)) {
            personnelRows.set(profile.id, { id: profile.id, name: profile.full_name || "Ukjent", type: "personnel", events: [] });
          }
          personnelRows.get(profile.id)!.events.push(ev);
        }

        for (const link of equipmentLinks.data || []) {
          const eq = link.equipment as any;
          if (!eq) continue;
          const ev = toTimelineEvent(link.mission_id);
          if (!ev) continue;
          if (!equipmentRows.has(eq.id)) {
            equipmentRows.set(eq.id, { id: eq.id, name: eq.navn, type: "equipment", events: [] });
          }
          equipmentRows.get(eq.id)!.events.push(ev);
        }
      }

      // Process calendar events into their own rows grouped by type
      for (const ce of calendarEvents) {
        const eventDate = new Date(ce.event_date);
        if (ce.event_time) {
          const [h, m] = ce.event_time.split(":").map(Number);
          eventDate.setHours(h || 0, m || 0);
        }
        const typeLabel = ce.type || "Annet";
        if (!calendarRows.has(typeLabel)) {
          calendarRows.set(typeLabel, { id: `cal-type-${typeLabel}`, name: typeLabel, type: "personnel", events: [] });
        }
        calendarRows.get(typeLabel)!.events.push({
          id: `cal-${ce.id}`,
          title: ce.title,
          start: eventDate,
          end: new Date(eventDate.getTime() + MAINTENANCE_DURATION_MS),
          eventType: "calendar",
        });
      }

      setResourceRows([
        ...Array.from(droneRows.values()),
        ...Array.from(personnelRows.values()),
        ...Array.from(equipmentRows.values()),
        ...Array.from(calendarRows.values()),
      ]);
    } catch (err) {
      console.error("ResourceTimeline fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMissionClick = async (missionId: string) => {
    try {
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .eq("id", missionId)
        .single();
      if (error) throw error;
      setSelectedMission(data);
      setMissionDetailOpen(true);
    } catch (err) {
      console.error("Error loading mission:", err);
    }
  };

  const handleMaintenanceClick = (event: TimelineEvent) => {
    setSelectedMaintenanceEvent(event);
    setMaintenanceDetailOpen(true);
  };

  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const weekDurationMs = weekEndMs - weekStartMs;

  // Filter rows by type, then by week visibility
  const eventOverlapsWeek = (e: TimelineEvent) => e.end.getTime() > weekStartMs && e.start.getTime() < weekEndMs;

  const droneResources = resourceRows.filter((r) => r.type === "drone" && r.events.some(eventOverlapsWeek));
  const personnelResources = resourceRows.filter((r) => r.type === "personnel" && !r.id.startsWith("cal-type-") && r.events.some(eventOverlapsWeek));
  const equipmentResources = resourceRows.filter((r) => r.type === "equipment" && r.events.some(eventOverlapsWeek));
  const calendarResources = resourceRows.filter((r) => r.id.startsWith("cal-type-") && r.events.some(eventOverlapsWeek));

  const renderEventBlock = (event: TimelineEvent, row: ResourceRow) => {
    const mStart = Math.max(event.start.getTime(), weekStartMs);
    const mEnd = Math.min(event.end.getTime(), weekEndMs);
    if (mEnd <= mStart) return null;

    const leftPct = ((mStart - weekStartMs) / weekDurationMs) * 100;
    const widthPct = ((mEnd - mStart) / weekDurationMs) * 100;

    const hasConflict = event.eventType === "mission" && row.events.some(
      (other) => other.id !== event.id && other.eventType === "mission" && checkOverlap(event, other)
    );

    const color = EVENT_COLORS[event.eventType];
    const isClickable = event.eventType === "mission" || event.eventType === "maintenance";

    const handleClick = () => {
      if (event.eventType === "mission") handleMissionClick(event.id);
      else if (event.eventType === "maintenance") handleMaintenanceClick(event);
    };

    const blockContent = (
      <span className="flex items-center gap-1 truncate">
        {hasConflict && <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-200" />}
        {event.eventType === "maintenance" && <Wrench className="w-3 h-3 flex-shrink-0" />}
        {event.title}
      </span>
    );

    return (
      <TooltipProvider key={event.id} delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={isClickable ? handleClick : undefined}
              className={cn(
                "absolute top-1 h-7 rounded-md border text-[10px] sm:text-xs font-medium text-white px-1.5 truncate transition-opacity hover:opacity-90 z-10",
                isClickable ? "cursor-pointer" : "cursor-default",
                color,
                hasConflict && "ring-2 ring-amber-400 ring-offset-1 ring-offset-background"
              )}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
            >
              {blockContent}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-semibold">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(event.start, "EEE dd.MM HH:mm", { locale: nb })} – {format(event.end, "HH:mm", { locale: nb })}
            </p>
            {event.eventType !== "mission" && (
              <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                {event.eventType === "maintenance" ? "Vedlikehold" : event.eventType}
              </Badge>
            )}
            {hasConflict && (
              <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> Ressurskonflikt
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderSection = (title: string, icon: React.ReactNode, rows: ResourceRow[]) => {
    if (rows.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          {rows.map((row, idx) => {
            const visibleEvents = row.events.filter(eventOverlapsWeek);
            return (
              <div
                key={row.id}
                className={cn(
                  "flex items-stretch min-h-[36px]",
                  idx > 0 && "border-t border-border"
                )}
              >
                <div className="w-28 sm:w-36 flex-shrink-0 px-2 py-1.5 bg-muted/50 flex items-center">
                  <span className="text-xs sm:text-sm font-medium truncate">{row.name}</span>
                </div>
                <div className="flex-1 relative">
                  <div className="absolute inset-0 flex">
                    {daysOfWeek.map((day, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1",
                          i > 0 && "border-l border-border/50",
                          isSameDay(day, new Date()) && "bg-primary/5"
                        )}
                      />
                    ))}
                  </div>
                  {visibleEvents.map((e) => renderEventBlock(e, row))}
                  {visibleEvents.length === 0 && (
                    <div className="absolute inset-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isEmpty = droneResources.length === 0 && personnelResources.length === 0 && equipmentResources.length === 0 && calendarResources.length === 0 && !loading;

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            I dag
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {isMobile ? (
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">Uke {weekNumber}, {format(weekStart, "yyyy")}</div>
            <div className="text-xs text-muted-foreground">{format(weekStart, "d. MMMM", { locale: nb })} – {format(weekEnd, "d. MMMM", { locale: nb })}</div>
          </div>
        ) : (
          <div className="text-sm font-medium text-muted-foreground">
            Uke {weekNumber}, {format(weekStart, "yyyy")} — {format(weekStart, "d. MMM", { locale: nb })} – {format(weekEnd, "d. MMM", { locale: nb })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-primary/80 inline-block" /> Oppdrag</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-500/80 inline-block" /> Vedlikehold</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-purple-500/80 inline-block" /> Kalender</span>
      </div>

      {/* Day headers */}
      <div className="flex mb-2">
        <div className="w-28 sm:w-36 flex-shrink-0" />
        <div className="flex-1 flex">
          {daysOfWeek.map((day, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center text-xs font-medium py-1",
                isSameDay(day, new Date()) ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              {isMobile ? format(day, "EEEEE", { locale: nb }) : format(day, "EEE d.", { locale: nb })}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Laster ressurskalender…
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">Ingen ressurser med hendelser denne uken</p>
          <p className="text-xs mt-1">Opprett oppdrag og tildel droner, utstyr eller personell for å se dem her</p>
        </div>
      ) : (
        <>
          {renderSection("Droner", <Plane className="w-4 h-4 text-primary" />, droneResources)}
          {renderSection("Personell", <Users className="w-4 h-4 text-blue-500" />, personnelResources)}
          {renderSection("Utstyr", <Wrench className="w-4 h-4 text-orange-500" />, equipmentResources)}
          {renderSection("Kalender", <Calendar className="w-4 h-4 text-purple-500" />, calendarResources)}
        </>
      )}

      <MissionDetailDialog
        open={missionDetailOpen}
        onOpenChange={setMissionDetailOpen}
        mission={selectedMission}
      />

      {/* Maintenance detail dialog */}
      <Dialog open={maintenanceDetailOpen} onOpenChange={setMaintenanceDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-500" />
              {selectedMaintenanceEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedMaintenanceEvent && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ressurs</span>
                <span className="font-medium">{selectedMaintenanceEvent.resourceName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline" className="capitalize">
                  {selectedMaintenanceEvent.resourceType === "drone" ? "Drone" : "Utstyr"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dato</span>
                <span className="font-medium">{format(selectedMaintenanceEvent.start, "d. MMMM yyyy", { locale: nb })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kategori</span>
                <Badge className="bg-orange-500/80 text-white border-orange-500">
                  {selectedMaintenanceEvent.title.includes("Inspeksjon") ? "Inspeksjon" : "Vedlikehold"}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
