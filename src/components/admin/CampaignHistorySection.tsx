import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { History, Send, Users, UserCog, Globe, Loader2, RefreshCw, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Campaign {
  id: string;
  company_id: string | null;
  recipient_type: string;
  subject: string;
  html_content: string;
  sent_at: string;
  emails_sent: number;
  sent_to_emails: string[];
  failed_emails: string[];
}

const recipientTypeLabel = (type: string) => {
  if (type === "users") return "Brukere (min bedrift)";
  if (type === "customers") return "Kunder";
  if (type === "all_users") return "Alle brukere (alle selskaper)";
  return type;
};

const recipientTypeIcon = (type: string) => {
  if (type === "users") return <Users className="h-3 w-3" />;
  if (type === "customers") return <UserCog className="h-3 w-3" />;
  if (type === "all_users") return <Globe className="h-3 w-3" />;
  return null;
};

export const CampaignHistorySection = () => {
  const { companyId } = useAuth();
  const { isSuperAdmin } = useRoleCheck();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [missedCount, setMissedCount] = useState<number | null>(null);
  const [loadingMissed, setLoadingMissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (companyId) fetchCampaigns();
  }, [companyId, isSuperAdmin]);

  const fetchCampaigns = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("bulk_email_campaigns")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(20);

      if (!isSuperAdmin) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCampaigns((data || []) as Campaign[]);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToMissedClick = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setMissedCount(null);
    setLoadingMissed(true);
    setConfirmOpen(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: { type: "preview_missed_count", campaignId: campaign.id },
      });
      if (error) throw error;
      setMissedCount(data?.missedCount ?? 0);
    } catch (e) {
      console.error("Error fetching missed count:", e);
      setMissedCount(null);
    } finally {
      setLoadingMissed(false);
    }
  };

  const handleSendToMissed = async () => {
    if (!selectedCampaign) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: { type: "send_to_missed", campaignId: selectedCampaign.id },
      });
      if (error) throw error;
      const sent = data?.emailsSent ?? 0;
      toast.success(`E-post sendt til ${sent} nye mottaker${sent !== 1 ? "e" : ""}`);
      fetchCampaigns();
    } catch (e: any) {
      toast.error("Sending feilet: " + e.message);
    } finally {
      setSending(false);
      setConfirmOpen(false);
      setSelectedCampaign(null);
    }
  };

  if (!loading && campaigns.length === 0) return null;

  return (
    <>
      <GlassCard className="p-3 sm:p-6 mt-4 sm:mt-6">
        <div className="flex items-center justify-between mb-4">
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => setExpanded(v => !v)}
          >
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">Tidligere kampanjer</h2>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <Button variant="ghost" size="sm" onClick={fetchCampaigns} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Ingen kampanjer ennå</p>
            ) : (
              campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-lg border border-border bg-card/50 p-3 sm:p-4 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{campaign.subject}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(campaign.sent_at), "d. MMM yyyy HH:mm", { locale: nb })}
                        </span>
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs py-0">
                          {recipientTypeIcon(campaign.recipient_type)}
                          {recipientTypeLabel(campaign.recipient_type)}
                        </Badge>
                        <span className="text-foreground font-medium">
                          {campaign.emails_sent} sendt
                        </span>
                        {campaign.failed_emails?.length > 0 && (
                          <span className="text-destructive">
                            {campaign.failed_emails.length} feilet
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => { setPreviewCampaign(campaign); setPreviewOpen(true); }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Vis
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => handleSendToMissedClick(campaign)}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send til nye
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </GlassCard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Forhåndsvisning — {previewCampaign?.subject}</DialogTitle>
            <DialogDescription>
              Sendt {previewCampaign ? format(new Date(previewCampaign.sent_at), "d. MMM yyyy HH:mm", { locale: nb }) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div
              className="p-4"
              dangerouslySetInnerHTML={{ __html: previewCampaign?.html_content || "" }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send to Missed Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send til nye mottakere</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Kampanje: <strong>{selectedCampaign?.subject}</strong>
                </p>
                {loadingMissed ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Teller nye mottakere...
                  </div>
                ) : missedCount !== null ? (
                  missedCount === 0 ? (
                    <p className="text-muted-foreground">
                      Alle nåværende mottakere har allerede fått denne e-posten. Ingen å sende til.
                    </p>
                  ) : (
                    <p>
                      Det er <strong>{missedCount} nye mottaker{missedCount !== 1 ? "e" : ""}</strong> som ikke har mottatt denne e-posten. Vil du sende til dem nå?
                    </p>
                  )
                ) : (
                  <p className="text-muted-foreground">Kunne ikke hente antall nye mottakere.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendToMissed}
              disabled={sending || loadingMissed || missedCount === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sender...
                </>
              ) : (
                "Send e-post"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
