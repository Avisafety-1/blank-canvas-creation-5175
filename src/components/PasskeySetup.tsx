import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Fingerprint, Plus, Trash2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { startRegistration } from "@simplewebauthn/browser";
import { isDevelopment } from "@/config/domains";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface Passkey {
  id: string;
  credential_id: string;
  device_name: string | null;
  created_at: string;
}

export const PasskeySetup = () => {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;
  const isDevEnv = isDevelopment();

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const fetchPasskeys = async () => {
    try {
      const { data, error } = await supabase
        .from("passkeys")
        .select("id, credential_id, device_name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPasskeys(data || []);
    } catch (err) {
      console.error("Error fetching passkeys:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setRegistering(true);
    try {
      // Step 1: Get registration options from server
      const { data: optionsData, error: optionsError } = await supabase.functions.invoke("webauthn", {
        body: { action: "register-options" },
      });
      if (optionsError) throw optionsError;

      // Step 2: Start WebAuthn registration in browser
      const credential = await startRegistration({ optionsJSON: optionsData.options });

      // Step 3: Verify with server
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("webauthn", {
        body: {
          action: "register-verify",
          credential,
          signedChallenge: optionsData.signedChallenge,
          deviceName: getDefaultDeviceName(),
        },
      });
      if (verifyError) throw verifyError;

      if (verifyData.verified) {
        toast.success(t("passkey.registered"));
        try { localStorage.setItem("avisafe_passkey_registered", "1"); } catch {}
        await fetchPasskeys();
      } else {
        toast.error(t("passkey.registerError"));
      }
    } catch (err: any) {
      console.error("Passkey registration error:", err);
      if (err.name === "NotAllowedError") {
        // User cancelled
        return;
      }
      toast.error(err.message || t("passkey.registerError"));
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("passkeys").delete().eq("id", deleteId);
      if (error) throw error;
      const remaining = passkeys.filter((p) => p.id !== deleteId);
      setPasskeys(remaining);
      setDeleteId(null);
      if (remaining.length === 0) {
        try { localStorage.removeItem("avisafe_passkey_registered"); } catch {}
      }
      toast.success(t("passkey.deleted"));
    } catch (err: any) {
      console.error("Delete passkey error:", err);
      toast.error(t("passkey.deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const getDefaultDeviceName = () => {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows";
    return "Enhet";
  };

  if (!isSupported) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-2xl">
            <Fingerprint className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("passkey.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <p className="text-xs sm:text-sm text-muted-foreground">{t("passkey.description")}</p>

          {isDevEnv && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <Info className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-xs sm:text-sm">
                {t("passkey.devWarning", "Passkeys må registreres via app.avisafe.no for å fungere korrekt. De kan ikke brukes fra forhåndsvisning eller utviklingsmiljø.")}
              </AlertDescription>
            </Alert>
          )}

          {/* Registered passkeys list */}
          {passkeys.length > 0 && (
            <div className="space-y-2">
              {passkeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{pk.device_name || t("passkey.unknownDevice")}</p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {new Date(pk.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(pk.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add passkey flow */}
          <Button onClick={handleRegister} variant="outline" disabled={isDevEnv || registering}>
            {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {t("passkey.addPasskey")}
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passkey.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("passkey.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
