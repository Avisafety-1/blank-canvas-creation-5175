import { GlassCard } from "@/components/GlassCard";
import { Calendar as CalendarIcon, Plus, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { IncidentDetailDialog } from "./IncidentDetailDialog";
import { AddIncidentDialog } from "./AddIncidentDialog";
import { AddMissionDialog } from "./AddMissionDialog";
import { AddNewsDialog } from "./AddNewsDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";

interface CalendarEvent {
  type: string;
  title: string;
  date: Date;
  color: string;
  description?: string;
  id?: string;
  isCustom?: boolean;
  sourceId?: string;
  sourceType?: 'mission' | 'document' | 'drone' | 'equipment' | 'incident' | 'custom' | 'accessory';
}

type CalendarEventDB = Tables<"calendar_events">;

export const CalendarWidget = () => {
  const { t, i18n } = useTranslation();
  const { companyId, user, ensureValidToken, isAdmin } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;
  const [month, setMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customEvents, setCustomEvents] = useState<CalendarEventDB[]>([]);
  const [realEvents, setRealEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEvent, setNewEvent] = useState({
    title: "",
    type: "Oppdrag",
    description: "",
    time: "09:00",
  });

  // State for detail dialogs
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  
  // State for creation dialogs
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);
  const [createMissionOpen, setCreateMissionOpen] = useState(false);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createNewsOpen, setCreateNewsOpen] = useState(false);
  

  // Helper function - must be defined before use
  const getColorForType = (type: string): string => {
    switch (type) {
      case "Oppdrag": return "text-primary";
      case "Vedlikehold": return "text-orange-500";
      case "Dokument": return "text-blue-500";
      case "Møte": return "text-purple-500";
      default: return "text-gray-500";
    }
  };

  // Fetch all events from database
  useEffect(() => {
    fetchAllEvents();
  }, [companyId]);


  const fetchAllEvents = async () => {
    try {
      await Promise.all([
        fetchCustomEvents(),
        fetchRealCalendarEvents()
      ]);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  // Real-time subscriptions via shared dashboard channel
  useEffect(() => {
    const unregisters = [
      registerMain('calendar_events', (payload) => {
        if (payload.eventType === 'INSERT') {
          setCustomEvents((current) => [...current, payload.new as CalendarEventDB]);
        } else if (payload.eventType === 'UPDATE') {
          setCustomEvents((current) =>
            current.map((event) =>
              event.id === (payload.new as CalendarEventDB).id ? (payload.new as CalendarEventDB) : event
            )
          );
        } else if (payload.eventType === 'DELETE') {
          setCustomEvents((current) =>
            current.filter((event) => event.id !== (payload.old as CalendarEventDB).id)
          );
        }
      }),
      registerMain('missions', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
      registerMain('documents', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
      registerMain('drones', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
      registerMain('equipment', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
      registerMain('incidents', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
      registerMain('drone_accessories', () => { if (navigator.onLine) fetchRealCalendarEvents(); }),
    ];

    return () => { unregisters.forEach(fn => fn()); };
  }, [registerMain]);

  const fetchCustomEvents = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<CalendarEventDB[]>(`offline_cal_custom_${companyId}`);
      if (cached) setCustomEvents(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // 3. Fetch fresh data
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) throw error;

      setCustomEvents(data || []);
      if (companyId) setCachedData(`offline_cal_custom_${companyId}`, data || []);
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      toast.error(t('dashboard.calendar.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRealCalendarEvents = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<CalendarEvent[]>(`offline_cal_real_${companyId}`);
      if (cached) setRealEvents(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) return;

    // 3. Fetch fresh data
    try {
      const events: CalendarEvent[] = [];

      // Fetch missions
      const { data: missions } = await supabase
        .from('missions')
        .select('id, tittel, tidspunkt')
        .order('tidspunkt', { ascending: true });
      
      if (missions) {
        events.push(...missions.map(m => ({
          type: "Oppdrag",
          title: m.tittel,
          date: new Date(m.tidspunkt),
          color: "text-primary",
          sourceId: m.id,
          sourceType: 'mission' as const,
        })));
      }

      // Fetch documents with expiry dates
      const { data: documents } = await supabase
        .from('documents')
        .select('id, tittel, gyldig_til')
        .not('gyldig_til', 'is', null)
        .order('gyldig_til', { ascending: true });
      
      if (documents) {
        events.push(...documents.map(d => ({
          type: "Dokument",
          title: `${d.tittel} utgår`,
          date: new Date(d.gyldig_til!),
          color: "text-blue-500",
          sourceId: d.id,
          sourceType: 'document' as const,
        })));
      }

      // Fetch drones with inspection dates
      const { data: drones } = await supabase
        .from('drones')
        .select('id, modell, neste_inspeksjon')
        .not('neste_inspeksjon', 'is', null)
        .order('neste_inspeksjon', { ascending: true });
      
      if (drones) {
        events.push(...drones.map(d => ({
          type: "Vedlikehold",
          title: `${d.modell} - inspeksjon`,
          date: new Date(d.neste_inspeksjon!),
          color: "text-orange-500",
          sourceId: d.id,
          sourceType: 'drone' as const,
        })));
      }

      // Fetch equipment with maintenance dates
      const { data: equipment } = await supabase
        .from('equipment')
        .select('id, navn, neste_vedlikehold')
        .not('neste_vedlikehold', 'is', null)
        .order('neste_vedlikehold', { ascending: true });
      
      if (equipment) {
        events.push(...equipment.map(e => ({
          type: "Vedlikehold",
          title: `${e.navn} - vedlikehold`,
          date: new Date(e.neste_vedlikehold!),
          color: "text-orange-500",
          sourceId: e.id,
          sourceType: 'equipment' as const,
        })));
      }

      // Fetch incidents
      const { data: incidents } = await supabase
        .from('incidents')
        .select('id, tittel, hendelsestidspunkt')
        .order('hendelsestidspunkt', { ascending: true });
      
      if (incidents) {
        events.push(...incidents.map(i => ({
          type: "Hendelse",
          title: i.tittel,
          date: new Date(i.hendelsestidspunkt),
          color: "text-red-500",
          sourceId: i.id,
          sourceType: 'incident' as const,
        })));
      }

      // Fetch drone accessories with maintenance dates
      const { data: accessories } = await supabase
        .from('drone_accessories')
        .select('id, navn, neste_vedlikehold')
        .not('neste_vedlikehold', 'is', null)
        .order('neste_vedlikehold', { ascending: true });
      
      if (accessories) {
        events.push(...accessories.map(a => ({
          type: "Vedlikehold",
          title: `${a.navn} - vedlikehold`,
          date: new Date(a.neste_vedlikehold!),
          color: "text-orange-500",
          sourceId: a.id,
          sourceType: 'accessory' as const,
        })));
      }

      setRealEvents(events);
      if (companyId) setCachedData(`offline_cal_real_${companyId}`, events);
    } catch (error) {
      console.error('Error fetching real calendar events:', error);
    }
  };

  // Combine real and custom events
  const allEvents: CalendarEvent[] = [
    ...realEvents,
    ...customEvents.map((event) => {
      const eventDate = new Date(event.event_date);
      if (event.event_time) {
        const [hours, minutes] = event.event_time.split(':');
        eventDate.setHours(parseInt(hours), parseInt(minutes));
      }
      
      return {
        id: event.id,
        type: event.type,
        title: event.title,
        date: eventDate,
        description: event.description || undefined,
        color: getColorForType(event.type),
        isCustom: true,
        sourceType: 'custom' as const,
      };
    }),
  ];

  const getEventsForDate = (checkDate: Date) => {
    return allEvents.filter((event) => isSameDay(event.date, checkDate));
  };

  const hasEvents = (checkDate: Date) => {
    return getEventsForDate(checkDate).length > 0;
  };

  const handleDateClick = (clickedDate: Date) => {
    setSelectedDate(clickedDate);
    setDialogOpen(true);
    setShowAddForm(false);
    setNewEvent({ title: "", type: "Oppdrag", description: "", time: "09:00" });
  };

  const handleEventClick = async (event: CalendarEvent) => {
    if (!event.sourceId || !event.sourceType) {
      if (event.sourceType === 'custom') {
        toast.info(t('dashboard.calendar.customEvent'));
      }
      return;
    }

    try {
      switch (event.sourceType) {
        case 'mission':
          const { data: mission } = await supabase
            .from('missions')
            .select('*')
            .eq('id', event.sourceId)
            .single();
          
          if (mission) {
            setSelectedMission(mission);
            setMissionDialogOpen(true);
          }
          break;

        case 'document':
          const { data: document } = await supabase
            .from('documents')
            .select('*')
            .eq('id', event.sourceId)
            .single();
          
          if (document) {
            setSelectedDocument(document);
            setDocumentDialogOpen(true);
          }
          break;

        case 'incident':
          const { data: incident } = await supabase
            .from('incidents')
            .select('*')
            .eq('id', event.sourceId)
            .single();
          
          if (incident) {
            setSelectedIncident(incident);
            setIncidentDialogOpen(true);
          }
          break;

        case 'drone':
        case 'equipment':
          toast.info(`${event.title} - ${t('dashboard.calendar.eventTypes.maintenance')}`);
          break;
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      toast.error(t('dashboard.calendar.couldNotLoadDetails'));
    }
  };

  const handleMissionAdded = () => {
    fetchRealCalendarEvents();
    toast.success(t('dashboard.calendar.missionCreated'));
  };

  const handleDocumentAdded = () => {
    fetchRealCalendarEvents();
    toast.success(t('dashboard.calendar.documentCreated'));
  };

  const handleAddEvent = async () => {
    if (!newEvent.title.trim()) {
      toast.error(t('dashboard.calendar.titleRequired'));
      return;
    }

    if (!selectedDate) {
      toast.error(t('dashboard.calendar.noDateSelected'));
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !companyId) {
        toast.error(t('dashboard.calendar.mustBeLoggedIn'));
        return;
      }

      const { error } = await supabase
        .from('calendar_events')
        .insert({
          user_id: user.id,
          company_id: companyId,
          title: newEvent.title,
          type: newEvent.type,
          description: newEvent.description || null,
          event_date: format(selectedDate, 'yyyy-MM-dd'),
          event_time: newEvent.time,
        });

      if (error) throw error;

      toast.success(t('dashboard.calendar.eventCreated'));
      setShowAddForm(false);
      setDialogOpen(false);
      setNewEvent({ title: "", type: "Oppdrag", description: "", time: "09:00" });
    } catch (error: any) {
      console.error('Error creating calendar event:', error);
      toast.error(`Feil ved opprettelse: ${error.message}`);
    }
  };

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <>
      <GlassCard className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-3 min-w-0">
          <CalendarIcon className="w-5 h-5 text-primary flex-shrink-0" />
          <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.calendar.title')}</h2>
        </div>

        <Calendar
          month={month}
          onMonthChange={setMonth}
          onDayClick={handleDateClick}
          locale={dateLocale}
          className={cn("rounded-md border-0 pointer-events-auto w-full")}
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4 w-full",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-xs sm:text-sm font-medium",
            nav: "space-x-1 flex items-center",
            nav_button: cn(
              "h-6 w-6 sm:h-7 sm:w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
            ),
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "w-full border-collapse space-y-1",
            head_row: "flex w-full",
            head_cell:
              "text-muted-foreground rounded-md w-full font-normal text-[0.7rem] sm:text-[0.8rem]",
            row: "flex w-full mt-2",
            cell: cn(
              "relative p-0 text-center text-xs sm:text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md w-full",
              "h-8 sm:h-9"
            ),
            day: cn(
              "h-8 sm:h-9 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md relative [&.has-events]:font-bold [&.has-events]:after:absolute [&.has-events]:after:bottom-1 [&.has-events]:after:left-1/2 [&.has-events]:after:-translate-x-1/2 [&.has-events]:after:w-1 [&.has-events]:after:h-1 [&.has-events]:after:bg-primary [&.has-events]:after:rounded-full"
            ),
            day_range_start: "day-range-start",
            day_range_end: "day-range-end",
            day_selected:
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "bg-primary/15 text-foreground font-semibold",
            day_outside:
              "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
            day_disabled: "text-muted-foreground opacity-50",
            day_range_middle:
              "aria-selected:bg-accent aria-selected:text-accent-foreground",
            day_hidden: "invisible",
          }}
          modifiers={{
            hasEvents: (day) => hasEvents(day),
          }}
          modifiersClassNames={{
            hasEvents: "has-events",
          }}
        />
      </GlassCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {selectedDate && format(selectedDate, "dd. MMMM yyyy", { locale: dateLocale })}
          </DialogTitle>
            <DialogDescription>
              {t('dashboard.calendar.events')}
            </DialogDescription>
          </DialogHeader>

          {!showAddForm ? (
            <>
              <div className="space-y-3">
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event, index) => (
                    <div
                      key={event.id || index}
                      className={cn(
                        "p-3 bg-card/30 rounded-lg border border-border",
                        event.sourceType && event.sourceType !== 'custom' && 
                        "cursor-pointer hover:bg-card/50 transition-colors"
                      )}
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-1">{event.title}</h4>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mb-2">{event.description}</p>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {event.type}
                          </Badge>
                        </div>
                        <div className={cn("text-xs font-medium", event.color)}>
                          {format(event.date, "HH:mm")}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('dashboard.calendar.noEvents')}
                  </p>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full gap-2">
                    <Plus className="w-4 h-4" />
                    {t('actions.add')}
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background z-[1250]">
                  <DropdownMenuItem
                    onClick={() => {
                      setCreateIncidentOpen(true);
                      setDialogOpen(false);
                    }}
                  >
                    {t('dashboard.calendar.eventTypes.incident')}
                  </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setCreateDocumentOpen(true);
                        setDialogOpen(false);
                      }}
                    >
                      {t('dashboard.calendar.eventTypes.document')}
                    </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setCreateMissionOpen(true);
                      setDialogOpen(false);
                    }}
                  >
                    {t('dashboard.calendar.eventTypes.mission')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setCreateNewsOpen(true);
                      setDialogOpen(false);
                    }}
                  >
                    {t('dashboard.news.title')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowAddForm(true);
                    }}
                  >
                    {t('common.other')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('missions.title')} *</Label>
                <Input
                  id="title"
                  placeholder={t('missions.titlePlaceholder')}
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">{t('missions.type')}</Label>
                <Select
                  value={newEvent.type}
                  onValueChange={(value) => setNewEvent({ ...newEvent, type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oppdrag">{t('dashboard.calendar.eventTypes.mission')}</SelectItem>
                    <SelectItem value="Vedlikehold">{t('dashboard.calendar.eventTypes.maintenance')}</SelectItem>
                    <SelectItem value="Dokument">{t('dashboard.calendar.expires')}</SelectItem>
                    <SelectItem value="Møte">{t('dashboard.calendar.eventTypes.meeting')}</SelectItem>
                    <SelectItem value="Annet">{t('common.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">{t('missions.time')}</Label>
                <Input
                  id="time"
                  type="time"
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('missions.description')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('missions.descriptionPlaceholder')}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">
                  {t('actions.cancel')}
                </Button>
                <Button onClick={handleAddEvent} className="flex-1">
                  {t('actions.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialogs */}
      <MissionDetailDialog
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        mission={selectedMission}
      />

      <DocumentCardModal
        isOpen={documentDialogOpen}
        onClose={() => setDocumentDialogOpen(false)}
        document={selectedDocument}
        onSaveSuccess={() => fetchRealCalendarEvents()}
        onDeleteSuccess={() => fetchRealCalendarEvents()}
        isAdmin={isAdmin}
        isCreating={false}
      />

      <IncidentDetailDialog
        open={incidentDialogOpen}
        onOpenChange={setIncidentDialogOpen}
        incident={selectedIncident}
      />

      {/* Creation Dialogs */}
      <AddIncidentDialog
        open={createIncidentOpen}
        onOpenChange={(open) => {
          setCreateIncidentOpen(open);
          if (!open) {
            fetchRealCalendarEvents();
          }
        }}
        defaultDate={selectedDate || undefined}
      />

      <AddMissionDialog
        open={createMissionOpen}
        onOpenChange={setCreateMissionOpen}
        onMissionAdded={handleMissionAdded}
      />

      <DocumentUploadDialog
        open={createDocumentOpen}
        onOpenChange={setCreateDocumentOpen}
        onSuccess={() => {
          fetchRealCalendarEvents();
          toast.success("Dokument opprettet og lagt til i kalenderen");
        }}
        defaultExpiryDate={selectedDate || undefined}
      />

      <AddNewsDialog
        open={createNewsOpen}
        onOpenChange={(open) => {
          setCreateNewsOpen(open);
        }}
        news={null}
      />
    </>
  );
};
