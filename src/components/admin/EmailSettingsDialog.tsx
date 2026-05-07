import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, Save, Send, Loader2, Mail } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EmailSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmailSettings {
  id?: string;
  company_id: string;
  from_name: string;
  from_email: string;
  enabled: boolean;
}

export const EmailSettingsDialog = ({ open, onOpenChange }: EmailSettingsDialogProps) => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState<EmailSettings>({
    company_id: companyId || "",
    from_name: "",
    from_email: "noreply@avisafe.no",
    enabled: true,
  });

  useEffect(() => {
    if (open && companyId) fetchSettings();
  }, [open, companyId]);

  const fetchSettings = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_settings_safe" as any)
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const d = data as any;
        setSettings({
          id: d.id,
          company_id: d.company_id,
          from_name: d.from_name || "",
          from_email: d.from_email || "noreply@avisafe.no",
          enabled: d.enabled ?? true,
        });
      } else {
        setSettings({
          company_id: companyId,
          from_name: "",
          from_email: "noreply@avisafe.no",
          enabled: true,
        });
      }
    } catch (error: any) {
      console.error("Error fetching email settings:", error);
      toast.error("Kunne ikke laste innstillinger");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error("Du må være logget inn");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_email_settings', {
        p_company_id: companyId,
        p_from_name: settings.from_name || '',
        p_from_email: settings.from_email,
        p_enabled: settings.enabled,
      });
      if (error) throw error;
      toast.success("Innstillinger lagret");
      fetchSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Kunne ikke lagre innstillinger: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error("Vennligst skriv inn en e-postadresse for test");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      toast.error("Ugyldig e-postadresse");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-email", {
        body: { company_id: companyId, recipient_email: testEmail },
      });
      if (error) throw error;
      toast.success("Test e-post sendt! Sjekk innboksen din.");
    } catch (error: any) {
      console.error("Error sending test email:", error);
      toast.error("Kunne ikke sende test e-post: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={isMobile ? "max-w-[95vw]" : "max-w-2xl"}>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? "max-w-[95vw] max-h-[85vh]" : "max-w-2xl max-h-[90vh]"} overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
            <Settings className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
            E-postinnstillinger
          </DialogTitle>
          <DialogDescription className={isMobile ? "text-xs" : "text-sm"}>
            Konfigurer avsender for e-post fra systemet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription className={isMobile ? "text-xs" : "text-sm"}>
              E-post sendes via AviSafe (Resend). Du kan tilpasse avsendernavn nedenfor.
            </AlertDescription>
          </Alert>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="enabled" className={isMobile ? "text-xs" : "text-sm"}>
              Aktiver e-postsending
            </Label>
            <Switch
              id="enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          {/* Sender name */}
          <div className="border-t pt-4 space-y-4">
            <h3 className={`font-semibold ${isMobile ? "text-sm" : "text-base"}`}>Avsender</h3>
            <div className="space-y-2">
              <Label htmlFor="from_name" className={isMobile ? "text-xs" : "text-sm"}>Avsendernavn</Label>
              <Input
                id="from_name"
                value={settings.from_name}
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                placeholder="Ditt Selskap"
                className={isMobile ? "h-9 text-sm" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Vises som avsendernavn i mottakerens innboks
              </p>
            </div>
            <div className="space-y-2">
              <Label className={isMobile ? "text-xs" : "text-sm"}>Avsender e-post</Label>
              <Input
                value={settings.from_email}
                disabled
                className={`${isMobile ? "h-9 text-sm" : ""} bg-muted`}
              />
              <p className="text-xs text-muted-foreground">
                Domenet må være verifisert i Resend for å kunne brukes som avsender
              </p>
            </div>
          </div>

          {/* Test email */}
          <div className="border-t pt-4 space-y-4">
            <h3 className={`font-semibold ${isMobile ? "text-sm" : "text-base"}`}>Test e-post</h3>
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className={isMobile ? "h-9 text-sm" : ""}
              />
              <Button
                onClick={handleTestEmail}
                disabled={testing}
                variant="outline"
                size={isMobile ? "sm" : "default"}
              >
                {testing ? (
                  <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
                ) : (
                  <Send className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
                )}
                {isMobile ? "Send" : "Send test"}
              </Button>
            </div>
            <p className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
              Send en test-epost for å verifisere at innstillingene fungerer
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
              size={isMobile ? "sm" : "default"}
            >
              {saving ? (
                <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
              ) : (
                <Save className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
              )}
              {saving ? "Lagrer..." : "Lagre innstillinger"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
