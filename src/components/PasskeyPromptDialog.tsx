import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { startRegistration } from "@simplewebauthn/browser";
import { isDevelopment } from "@/config/domains";

const getDefaultDeviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Enhet";
};

export const PasskeyPromptDialog = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    const check = async () => {
      // Skip if not supported, dev env, or already dismissed/registered
      if (!window.PublicKeyCredential) return;
      if (isDevelopment()) return;
      try {
        if (localStorage.getItem("avisafe_passkey_prompt_dismissed")) return;
        if (localStorage.getItem("avisafe_passkey_registered")) return;
      } catch { return; }

      // Check if user already has passkeys
      const { data } = await supabase.from("passkeys").select("id").limit(1);
      if (data && data.length > 0) return;

      setOpen(true);
    };
    check();
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const { data: optionsData, error: optionsError } = await supabase.functions.invoke("webauthn", {
        body: { action: "register-options" },
      });
      if (optionsError) throw optionsError;

      const credential = await startRegistration({ optionsJSON: optionsData.options });

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
        setOpen(false);
      } else {
        toast.error(t("passkey.registerError"));
      }
    } catch (err: any) {
      console.error("Passkey registration error:", err);
      if (err.name === "NotAllowedError") return;
      toast.error(err.message || t("passkey.registerError"));
    } finally {
      setRegistering(false);
    }
  };

  const handleDismiss = () => {
    try { localStorage.setItem("avisafe_passkey_prompt_dismissed", "1"); } catch {}
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {t("passkey.promptTitle", "Aktiver biometrisk innlogging")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("passkey.promptDescription", "Logg inn raskere neste gang med fingeravtrykk eller ansiktsgjenkjenning. Vil du aktivere dette nå?")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleRegister} disabled={registering} className="w-full">
            {registering && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("passkey.promptActivate", "Ja, aktiver")}
          </Button>
          <Button variant="ghost" onClick={handleDismiss} disabled={registering} className="w-full">
            {t("passkey.promptDismiss", "Ikke nå")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
