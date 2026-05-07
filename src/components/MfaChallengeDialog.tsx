import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface MfaChallengeDialogProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

export const MfaChallengeDialog = ({ open, onVerified, onCancel }: MfaChallengeDialogProps) => {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async (codeToVerify = code) => {
    if (codeToVerify.length !== 6 || verifying) return;

    setVerifying(true);
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactor = factorsData.totp.find(f => f.status === 'verified');
      if (!totpFactor) {
        toast.error(t('twoFactor.noFactorFound'));
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: codeToVerify,
      });
      if (verifyError) throw verifyError;

      onVerified();
    } catch (err: any) {
      console.error('MFA challenge error:', err);
      toast.error(err.message || t('twoFactor.invalidCode'));
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !verifying) {
      void handleVerify(code);
    }
  }, [code, verifying]);

  const handleCancel = async () => {
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t('twoFactor.challengeTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('twoFactor.challengeDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} className="flex-1" disabled={verifying}>
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={() => handleVerify()}
              disabled={code.length !== 6 || verifying}
              className="flex-1"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('twoFactor.verify')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
