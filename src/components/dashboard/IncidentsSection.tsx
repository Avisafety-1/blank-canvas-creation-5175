import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { AlertTriangle, Clock, MessageSquare, Building2 } from "lucide-react";

import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { IncidentDetailDialog } from "./IncidentDetailDialog";
import { AddIncidentDialog } from "./AddIncidentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300",
};

const statusColors = {
  Ny: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  "Under utredning": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  "Tiltak iverksatt": "bg-green-500/20 text-green-700 dark:text-green-300",
  Lukket: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
  Åpen: "bg-status-red/20 text-red-700 dark:text-red-300",
  "Under behandling": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Ferdigbehandlet: "bg-green-500/20 text-green-700 dark:text-green-300",
  Pågår: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Utført: "bg-status-green/20 text-green-700 dark:text-green-300",
  Forsinket: "bg-status-red/20 text-red-700 dark:text-red-300",
};

type Incident = Tables<"incidents">;

export const IncidentsSection = ({ abortSignal }: { abortSignal?: AbortSignal }) => {
  const { t, i18n } = useTranslation();
  const { companyId, user, departmentsEnabled } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const [canBeIncidentResponsible, setCanBeIncidentResponsible] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [myFollowUpIncidents, setMyFollowUpIncidents] = useState<Incident[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(true);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;

  // Fetch incidents from database
  useEffect(() => {
    const fetchFlag = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('can_be_incident_responsible')
        .eq('id', user.id)
        .single();
      setCanBeIncidentResponsible(data?.can_be_incident_responsible === true);
    };
    fetchFlag();
  }, [user]);

  useEffect(() => {
    fetchIncidents();
  }, [companyId]);

  // Real-time via shared dashboard channel
  useEffect(() => {
    const unregister = registerMain('incidents', (payload) => {
      if (payload.eventType === 'INSERT') {
        const newIncident = payload.new as Incident;
        if (newIncident.status !== 'Ferdigbehandlet') {
          setIncidents((current) => [newIncident, ...current]);
        }
      } else if (payload.eventType === 'UPDATE') {
        const updatedIncident = payload.new as Incident;
        
        setSelectedIncident((current) => {
          if (current?.id === updatedIncident.id) {
            return updatedIncident;
          }
          return current;
        });
        
        setIncidents((current) => {
          if (updatedIncident.status === 'Ferdigbehandlet') {
            return current.filter((incident) => incident.id !== updatedIncident.id);
          }
          return current.map((incident) =>
            incident.id === updatedIncident.id ? updatedIncident : incident
          );
        });
      } else if (payload.eventType === 'DELETE') {
        setIncidents((current) =>
          current.filter((incident) => incident.id !== (payload.old as Incident).id)
        );
      }
    });
    return unregister;
  }, [registerMain]);

  // Fetch follow-up incidents for logged-in user
  useEffect(() => {
    const fetchMyFollowUps = async () => {
      // 1. Load cache first
      if (companyId) {
        const cached = getCachedData<Incident[]>(`offline_dashboard_followups_${companyId}`);
        if (cached) setMyFollowUpIncidents(cached);
      }

      // 2. Skip network if offline
      if (!navigator.onLine) {
        setFollowUpLoading(false);
        return;
      }

      // 3. Use user from AuthContext (works offline)
      if (!user) {
        setFollowUpLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .eq('oppfolgingsansvarlig_id', user.id)
          .neq('status', 'Lukket')
          .order('hendelsestidspunkt', { ascending: false });

        if (error) throw error;

        setMyFollowUpIncidents(data || []);
        if (companyId) setCachedData(`offline_dashboard_followups_${companyId}`, data || []);
      } catch (error: any) {
        console.error('Error fetching follow-up incidents:', error);
      } finally {
        setFollowUpLoading(false);
      }
    };

    fetchMyFollowUps();

    // Follow-up refetch also handled by shared incidents listener
    const unregister = registerMain('incidents', () => {
      if (!navigator.onLine) return;
      fetchMyFollowUps();
    });

    return unregister;
  }, [companyId, user, t, registerMain]);

  // Fetch comment counts for all incidents
  useEffect(() => {
    const fetchCommentCounts = async () => {
      if (!navigator.onLine) return;
      const allIncidentIds = [...new Set([...incidents.map(i => i.id), ...myFollowUpIncidents.map(i => i.id)])];
      if (allIncidentIds.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('incident_comments')
          .select('incident_id')
          .in('incident_id', allIncidentIds);

        if (error) throw error;

        const counts: Record<string, number> = {};
        data?.forEach(row => {
          counts[row.incident_id] = (counts[row.incident_id] || 0) + 1;
        });
        setCommentCounts(counts);
      } catch (error) {
        console.error('Error fetching comment counts:', error);
      }
    };

    fetchCommentCounts();
  }, [incidents, myFollowUpIncidents]);

  // Real-time for comment changes via shared channel
  useEffect(() => {
    const unregister = registerMain('incident_comments', (payload) => {
      if (payload.eventType === 'INSERT') {
        const newComment = payload.new as { incident_id: string };
        setCommentCounts(prev => ({
          ...prev,
          [newComment.incident_id]: (prev[newComment.incident_id] || 0) + 1
        }));
      } else if (payload.eventType === 'DELETE') {
        const deletedComment = payload.old as { incident_id: string };
        setCommentCounts(prev => ({
          ...prev,
          [deletedComment.incident_id]: Math.max((prev[deletedComment.incident_id] || 1) - 1, 0)
        }));
      }
    });
    return unregister;
  }, [registerMain]);

  const fetchIncidents = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<Incident[]>(`offline_dashboard_incidents_${companyId}`);
      if (cached) setIncidents(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // 3. Fetch fresh data
    try {
      if (abortSignal?.aborted) { setLoading(false); return; }
      const query = supabase
        .from('incidents')
        .select('*, companies:company_id(id, navn)')
        .neq('status', 'Ferdigbehandlet')
        .order('opprettet_dato', { ascending: false });
      if (abortSignal) (query as any).abortSignal(abortSignal);
      const { data: rawData, error } = await query;
      const data = (rawData || []).map((i: any) => ({ ...i, company_name: i.companies?.navn || null }));

      if (error) throw error;

      setIncidents(data || []);
      if (companyId) setCachedData(`offline_dashboard_incidents_${companyId}`, data || []);
    } catch (error: any) {
      if (error?.name === 'AbortError' || abortSignal?.aborted) return;
      console.error('Error fetching incidents:', error);
      toast.error(t('dashboard.incidents.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setDetailDialogOpen(true);
  };

  const handleEditRequest = (incident: Incident) => {
    setEditingIncident(incident);
    setAddDialogOpen(true);
  };

  return (
    <>
      <GlassCard className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive flex-shrink-0" />
          <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.incidents.title')}</h2>
        </div>
        <Button 
          size="sm" 
          variant="destructive" 
          className="gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
          onClick={() => setAddDialogOpen(true)}
        >
          <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
          <span>{t('dashboard.incidents.report')}</span>
        </Button>
      </div>

      <Tabs defaultValue="incidents" className="w-full flex-1 flex flex-col">
        <TabsList className="w-full h-8 sm:h-9">
          <TabsTrigger value="incidents" className="flex-1 text-xs sm:text-sm">
            {t('dashboard.incidents.title')} ({incidents.length})
          </TabsTrigger>
          {canBeIncidentResponsible && (
            <TabsTrigger value="followups" className="flex-1 text-xs sm:text-sm">
              {t('dashboard.incidents.followUp')} ({myFollowUpIncidents.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="incidents" className="mt-2 sm:mt-3 flex-1">
          <div className="space-y-1.5 sm:space-y-2 overflow-y-auto h-[400px] pr-2 sm:pr-4">
            {loading ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                {t('dashboard.incidents.loading')}
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                {t('dashboard.incidents.noIncidents')}
              </div>
            ) : (
              incidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => handleIncidentClick(incident)}
                  className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {departmentsEnabled && (incident as any).company_id !== companyId && (incident as any).company_name && (
                        <div className="mb-0.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 whitespace-nowrap gap-0.5 border-primary/30 text-primary">
                            <Building2 className="h-2.5 w-2.5" />
                            {(incident as any).company_name}
                          </Badge>
                        </div>
                      )}
                      {incident.incident_number && (
                        <span className="text-[10px] sm:text-xs font-mono text-muted-foreground block mb-0.5">{incident.incident_number}</span>
                      )}
                      <h3 className="font-medium text-xs sm:text-sm truncate mb-1">{(incident as any).tittel}</h3>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                        <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5`}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">{incident.kategori}</Badge>
                        )}
                        {incident.hovedaarsak && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                            {incident.hovedaarsak}
                          </Badge>
                        )}
                        {commentCounts[incident.id] > 0 && (
                          <span className="flex items-center gap-0.5 text-muted-foreground">
                            <MessageSquare className="w-3 h-3" />
                            {commentCounts[incident.id]}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {format(new Date(incident.hendelsestidspunkt), "dd. MMM", { locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                    <Badge className={`${statusColors[incident.status as keyof typeof statusColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap`}>{incident.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="followups" className="mt-2 sm:mt-3 flex-1">
          <div className="space-y-1.5 sm:space-y-2 overflow-y-auto h-[400px] pr-2 sm:pr-4">
            {followUpLoading ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                {t('dashboard.incidents.loadingFollowUp')}
              </div>
            ) : myFollowUpIncidents.length === 0 ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                {t('dashboard.incidents.noFollowUp')}
              </div>
            ) : (
              myFollowUpIncidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => handleIncidentClick(incident)}
                  className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {incident.incident_number && (
                          <span className="text-[10px] sm:text-xs font-mono text-muted-foreground">{incident.incident_number}</span>
                        )}
                        <h3 className="font-medium text-xs sm:text-sm">{incident.tittel}</h3>
                      </div>
                      {incident.beskrivelse && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 mb-1 sm:mb-1.5">
                          {incident.beskrivelse}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                        <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5`}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                            {incident.kategori}
                          </Badge>
                        )}
                        {incident.hovedaarsak && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                            {incident.hovedaarsak}
                          </Badge>
                        )}
                        {commentCounts[incident.id] > 0 && (
                          <span className="flex items-center gap-0.5 text-muted-foreground">
                            <MessageSquare className="w-3 h-3" />
                            {commentCounts[incident.id]}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {format(new Date(incident.hendelsestidspunkt), "dd. MMM", { locale: dateLocale })}
                        </span>
                        {incident.lokasjon && (
                          <span className="text-muted-foreground truncate">• {incident.lokasjon}</span>
                        )}
                      </div>
                    </div>
                    <Badge className={`${statusColors[incident.status as keyof typeof statusColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap`}>
                      {incident.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddIncidentDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditingIncident(null);
        }}
        incidentToEdit={editingIncident}
      />
      
      <IncidentDetailDialog 
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        incident={selectedIncident}
        onEditRequest={handleEditRequest}
      />
    </GlassCard>
    </>
  );
};
