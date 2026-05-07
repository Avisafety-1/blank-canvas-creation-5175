import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Calendar, AlertTriangle, User, MessageSquare, Send, FileText, Edit, Image, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";

import { useAuth } from "@/contexts/AuthContext";
import { exportIncidentPDF } from "@/lib/incidentPdfExport";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { getIncidentReporterDisplayName } from "@/lib/incidentVisibility";

type Incident = Tables<"incidents">;

type IncidentComment = {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
};

interface IncidentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: Incident | null;
  onEditRequest?: (incident: Incident) => void;
}

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

const statusColors = {
  Ny: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "Under utredning": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  "Tiltak iverksatt": "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
  Lukket: "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30",
  Åpen: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
  "Under behandling": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Ferdigbehandlet: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
};

export const IncidentDetailDialog = ({ open, onOpenChange, incident, onEditRequest }: IncidentDetailDialogProps) => {
  const { user, companyId, parentCompanyId, ensureValidToken, isAdmin, departmentsEnabled } = useAuth();
  const companySettings = useCompanySettings();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [relatedMission, setRelatedMission] = useState<{ id: string; tittel: string; lokasjon: string; status: string } | null>(null);
  const [oppfolgingsansvarlig, setOppfolgingsansvarlig] = useState<{ id: string; full_name: string } | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [updatingResponsible, setUpdatingResponsible] = useState(false);
  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  // Sync local status from prop
  useEffect(() => {
    if (incident) setLocalStatus(incident.status);
  }, [incident?.id, incident?.status]);

  useEffect(() => {
    const checkAdmin = async () => {
      await ensureValidToken();
      if (user) {
        // Hent brukerens navn
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        setCurrentUserName(profile?.full_name || 'Ukjent bruker');
      }
    };
    
    const fetchUsers = async () => {
      if (!incident?.company_id && !companyId) return;
      try {
        const { data, error } = await supabase.rpc('get_incident_responsible_users', {
          target_company_id: incident?.company_id || companyId!
        });

        if (error) throw error;
        setUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    
    checkAdmin();
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchRelatedMission = async () => {
      if (!incident?.mission_id) {
        setRelatedMission(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('missions')
          .select('id, tittel, lokasjon, status')
          .eq('id', incident.mission_id)
          .single();

        if (error) throw error;
        setRelatedMission(data);
      } catch (error) {
        console.error('Error fetching related mission:', error);
        setRelatedMission(null);
      }
    };

    fetchRelatedMission();
  }, [incident?.mission_id]);

  // Synkroniser selectedResponsibleId med incident prop
  useEffect(() => {
    setSelectedResponsibleId(incident?.oppfolgingsansvarlig_id || null);
  }, [incident?.oppfolgingsansvarlig_id]);

  useEffect(() => {
    const fetchOppfolgingsansvarlig = async () => {
      if (!incident?.oppfolgingsansvarlig_id) {
        setOppfolgingsansvarlig(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', incident.oppfolgingsansvarlig_id)
          .maybeSingle();

        if (error) throw error;
        setOppfolgingsansvarlig(data);
      } catch (error) {
        console.error('Error fetching oppfolgingsansvarlig:', error);
        setOppfolgingsansvarlig(null);
      }
    };

    fetchOppfolgingsansvarlig();
  }, [incident?.oppfolgingsansvarlig_id]);

  useEffect(() => {
    const fetchComments = async () => {
      if (!incident?.id) {
        setComments([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('incident_comments')
          .select('id, comment_text, created_by_name, created_at')
          .eq('incident_id', incident.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setComments(data || []);
      } catch (error) {
        console.error('Error fetching comments:', error);
        setComments([]);
      }
    };

    fetchComments();
    
    if (!incident?.id) return;
    
    const channel = supabase
      .channel(`incident_comments_${incident.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'incident_comments',
          filter: `incident_id=eq.${incident.id}`
        },
        (payload) => {
          setComments(prev => [...prev, payload.new as IncidentComment]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [incident?.id]);

   const handleStatusChange = async (newStatus: string) => {
    if (!incident) return;
    
    setUpdatingStatus(true);
    setLocalStatus(newStatus); // Optimistic update
    try {
      const { error } = await supabase
        .from('incidents')
        .update({ 
          status: newStatus,
          oppdatert_dato: new Date().toISOString()
        })
        .eq('id', incident.id);

      if (error) throw error;

      toast.success("Status oppdatert");
    } catch (error) {
      console.error("Error updating status:", error);
      setLocalStatus(incident.status); // Revert on error
      toast.error("Kunne ikke oppdatere status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!incident || !newComment.trim()) return;
    
    setSubmittingComment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('incident_comments')
        .insert({
          incident_id: incident.id,
          user_id: user.id,
          comment_text: newComment.trim(),
          created_by_name: currentUserName
        });

      if (error) throw error;

      setNewComment("");
      toast.success("Kommentar lagt til");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Kunne ikke legge til kommentar");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleResponsibleChange = async (userId: string) => {
    if (!incident) return;
    
    setUpdatingResponsible(true);
    try {
      const newUserId = userId === "ingen" ? null : userId;
      
      const { error } = await supabase
        .from('incidents')
        .update({ 
          oppfolgingsansvarlig_id: newUserId,
          oppdatert_dato: new Date().toISOString()
        })
        .eq('id', incident.id);

      if (error) throw error;

      // Send e-post til ny ansvarlig hvis en bruker er valgt
      if (newUserId) {
        const recipientUser = users.find(u => u.id === newUserId);
        
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_followup_assigned',
            companyId: incident.company_id,
            followupAssigned: {
              recipientId: newUserId,
              recipientName: recipientUser?.full_name || 'Bruker',
              incidentTitle: incident.tittel,
              incidentSeverity: incident.alvorlighetsgrad,
              incidentLocation: incident.lokasjon,
              incidentDescription: incident.beskrivelse
            }
          }
        });
      }

      // Optimistisk UI-oppdatering
      setSelectedResponsibleId(newUserId);
      
      if (newUserId) {
        const user = users.find(u => u.id === newUserId);
        if (user) {
          setOppfolgingsansvarlig(user);
        }
      } else {
        setOppfolgingsansvarlig(null);
      }

      toast.success("Oppfølgingsansvarlig oppdatert");
    } catch (error) {
      console.error("Error updating responsible:", error);
      toast.error("Kunne ikke oppdatere ansvarlig");
    } finally {
      setUpdatingResponsible(false);
    }
  };

  const handleExportPDF = async () => {
    if (!incident || !companyId || !user) return;
    
    setExporting(true);
    
    const success = await exportIncidentPDF({
      incident: {
        id: incident.id,
        tittel: incident.tittel,
        beskrivelse: incident.beskrivelse,
        hendelsestidspunkt: incident.hendelsestidspunkt,
        alvorlighetsgrad: incident.alvorlighetsgrad,
        status: incident.status,
        kategori: incident.kategori,
        lokasjon: incident.lokasjon,
        rapportert_av: incident.rapportert_av,
        reported_anonymously: (incident as any).reported_anonymously,
        hovedaarsak: incident.hovedaarsak,
        medvirkende_aarsak: incident.medvirkende_aarsak,
        bilde_url: (incident as any).bilde_url || null,
      },
      comments,
      oppfolgingsansvarligName: oppfolgingsansvarlig?.full_name || null,
      relatedMissionTitle: relatedMission?.tittel || null,
      companyId,
      userId: user.id,
      hideReporterIdentity: companySettings.hide_reporter_identity,
      isAdmin,
      isParentCompany: !parentCompanyId,
      departmentsEnabled,
    });

    if (success) {
      toast.success("Hendelsesrapport lagret i dokumenter");
    } else {
      toast.error("Kunne ikke eksportere rapport");
    }
    
    setExporting(false);
  };

  if (!incident) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-3">
          <div className="space-y-1">
            {incident.incident_number && (
              <p className="text-sm font-mono text-muted-foreground">ID: {incident.incident_number}</p>
            )}
            <DialogTitle className="text-lg sm:text-xl pr-8">{incident.tittel}</DialogTitle>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {onEditRequest && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  onOpenChange(false);
                  onEditRequest(incident);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Rediger
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleExportPDF}
              disabled={exporting}
            >
              <FileText className="w-4 h-4 mr-2" />
              {exporting ? "Eksporterer..." : "Eksporter PDF"}
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status-select">Endre status (Admin)</Label>
                <Select 
                  value={localStatus || incident.status} 
                  onValueChange={handleStatusChange}
                  disabled={updatingStatus}
                >
                  <SelectTrigger id="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Åpen">Åpen</SelectItem>
                    <SelectItem value="Under behandling">Under behandling</SelectItem>
                    <SelectItem value="Ferdigbehandlet">Ferdigbehandlet</SelectItem>
                    <SelectItem value="Lukket">Lukket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="responsible-select">Oppfølgingsansvarlig (Admin)</Label>
                <SearchablePersonSelect
                  persons={users}
                  value={selectedResponsibleId}
                  onValueChange={(val) => handleResponsibleChange(val || "ingen")}
                  placeholder="Velg ansvarlig..."
                  searchPlaceholder="Søk person..."
                  allowNone
                  noneLabel="Ingen ansvarlig"
                  disabled={updatingResponsible}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge className={`${statusColors[(localStatus || incident.status) as keyof typeof statusColors] || 'bg-gray-500/20'} border`}>
              {localStatus || incident.status}
            </Badge>
            <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} border`}>
              Alvorlighetsgrad: {incident.alvorlighetsgrad}
            </Badge>
            {incident.kategori && (
              <Badge variant="outline">
                {incident.kategori}
              </Badge>
            )}
            {incident.hovedaarsak && (
              <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                Hovedårsak: {incident.hovedaarsak}
              </Badge>
            )}
            {incident.medvirkende_aarsak && incident.medvirkende_aarsak.split(", ").map((cause: string) => (
              <Badge key={cause} variant="outline" className="bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30">
                Medvirkende: {cause}
              </Badge>
            ))}
          </div>

          <div className="space-y-3">
            {relatedMission && (
              <div className="p-3 bg-muted rounded-md border">
                <p className="text-sm font-medium text-muted-foreground mb-1">Knyttet til oppdrag</p>
                <p className="font-medium">{relatedMission.tittel}</p>
                <p className="text-sm text-muted-foreground">
                  {relatedMission.lokasjon} • {relatedMission.status}
                </p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hendelsestidspunkt</p>
                <p className="text-base">
                  {format(new Date(incident.hendelsestidspunkt), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
            </div>

            {incident.lokasjon && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
                  <p className="text-base">{incident.lokasjon}</p>
                </div>
              </div>
            )}

            {incident.rapportert_av && (() => {
              const reporterName = getIncidentReporterDisplayName({
                incident,
                hideReporterIdentity: companySettings.hide_reporter_identity,
                isAdmin,
                isParentCompany: !parentCompanyId,
                departmentsEnabled,
              });
              return (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Rapportert av</p>
                    <p className="text-base">{reporterName}</p>
                  </div>
                </div>
              );
            })()}

            {incident.opprettet_dato && (
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rapportert dato</p>
                  <p className="text-base">
                    {format(new Date(incident.opprettet_dato), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                  </p>
                </div>
              </div>
            )}

            {oppfolgingsansvarlig && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Oppfølgingsansvarlig</p>
                  <p className="text-base">{oppfolgingsansvarlig.full_name || 'Ukjent bruker'}</p>
                </div>
              </div>
            )}
          </div>

          {incident.beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{incident.beskrivelse}</p>
            </div>
          )}

          {(incident as any).bilde_url && (
            <Collapsible className="border-t border-border pt-4">
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                <Image className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Vedlagt bilde</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <a href={(incident as any).bilde_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={(incident as any).bilde_url}
                    alt="Hendelsesbilde"
                    className="w-full max-h-64 object-cover rounded-md border border-border cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </a>
              </CollapsibleContent>
            </Collapsible>
          )}

          {(incident.alvorlighetsgrad === "Høy" || incident.alvorlighetsgrad === "Kritisk") && incident.status === "Åpen" && (
            <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {incident.alvorlighetsgrad === "Kritisk" ? "Kritisk hendelse" : "Høy alvorlighetsgrad"}
                  </p>
                  <p className="text-sm mt-1 text-destructive/90">
                    Denne hendelsen krever umiddelbar oppmerksomhet og oppfølging.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Kommentarer-seksjon */}
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-base font-medium">
              Kommentarer {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>

          {/* Eksisterende kommentarer */}
          <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Ingen kommentarer ennå
              </p>
            ) : (
              comments.map((comment) => (
                <div 
                  key={comment.id} 
                  className="bg-muted/50 rounded-lg p-3 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {comment.created_by_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {comment.comment_text}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Legg til ny kommentar */}
          <div className="space-y-2">
            <Textarea
              placeholder="Skriv en kommentar..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submittingComment}
              className="min-h-[80px] resize-none"
            />
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || submittingComment}
              className="w-full gap-2"
              size="sm"
            >
              <Send className="w-4 h-4" />
              {submittingComment ? "Legger til..." : "Legg til kommentar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};