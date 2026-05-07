import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, RefreshCw, Trash2, Link, Loader2, Mail } from "lucide-react";
import { useCalendarSubscription } from "@/hooks/useCalendarSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function CalendarSubscriptionSection() {
  const { user, companyId } = useAuth();
  const [sendingEmail, setSendingEmail] = useState(false);
  const {
    subscription,
    feedUrl,
    loading,
    generating,
    generateSubscription,
    deleteSubscription,
    regenerateSubscription,
    copyToClipboard,
  } = useCalendarSubscription();

  const sendEmailLink = async () => {
    if (!user || !feedUrl || !companyId) return;
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-calendar-link", {
        body: { userId: user.id, feedUrl, companyId },
      });
      if (error) throw error;
      toast.success("Kalenderlenke sendt på e-post!");
    } catch (err) {
      console.error("Error sending calendar link email:", err);
      toast.error("Kunne ikke sende e-post");
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground px-2">eller</span>
        <Separator className="flex-1" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Automatisk synkronisering</span>
        </div>

        {subscription && feedUrl ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Legg til denne URL-en i din kalenderapp for automatiske oppdateringer:
            </p>

            <div className="flex gap-2">
              <Input
                value={feedUrl}
                readOnly
                className="text-xs font-mono bg-muted/50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                title="Kopier lenke"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={sendEmailLink}
                disabled={sendingEmail}
                title="Send på e-post"
              >
                {sendingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generer ny lenke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Generer ny lenke?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Den gamle lenken vil slutte å fungere. Du må oppdatere lenken i alle kalenderapper som bruker den.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction onClick={regenerateSubscription}>
                      Generer ny
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Slett lenke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slett abonnementslenke?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Kalenderen vil ikke lenger oppdateres automatisk i kalenderapper som bruker denne lenken.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteSubscription} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Slett
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {subscription.last_accessed_at && (
              <p className="text-xs text-muted-foreground">
                Sist hentet: {new Date(subscription.last_accessed_at).toLocaleString("nb-NO")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Generer en unik lenke som kan legges til i Google Calendar, Apple Calendar eller andre kalenderapper. Kalenderen oppdateres automatisk.
            </p>

            <Button
              onClick={generateSubscription}
              disabled={generating}
              className="w-full"
              variant="outline"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link className="h-4 w-4 mr-2" />
              )}
              Generer abonnementslenke
            </Button>
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <p className="text-xs font-medium">Slik legger du til:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Google Calendar:</strong> Legg til kalender → Fra URL</li>
            <li>• <strong>iPhone:</strong> Innstillinger → Kalender → Kontoer → Abonner</li>
            <li>• <strong>Outlook:</strong> Legg til kalender → Fra internett</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
