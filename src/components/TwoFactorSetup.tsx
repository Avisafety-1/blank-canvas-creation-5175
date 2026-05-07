import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type EnrollState = 'idle' | 'enrolling' | 'verifying';
type PendingMfaSetup = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri?: string;
};

const PENDING_MFA_SETUP_KEY = "avisafe_pending_mfa_setup";

export const TwoFactorSetup = () => {
  const { t } = useTranslation();
  const [isEnabled, setIsEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollState, setEnrollState] = useState<EnrollState>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const clearPendingSetup = () => {
    try {
      sessionStorage.removeItem(PENDING_MFA_SETUP_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const savePendingSetup = (setup: PendingMfaSetup) => {
    try {
      sessionStorage.setItem(PENDING_MFA_SETUP_KEY, JSON.stringify(setup));
    } catch {
      // ignore storage errors
    }
  };

  const restorePendingSetup = (verifiedFactorId?: string) => {
    try {
      const raw = sessionStorage.getItem(PENDING_MFA_SETUP_KEY);
      if (!raw) return false;

      const pending = JSON.parse(raw) as PendingMfaSetup;
      if (!pending.factorId || pending.factorId === verifiedFactorId || !pending.qrCode || !pending.secret) {
        clearPendingSetup();
        return false;
      }

      setFactorId(pending.factorId);
      setQrCode(pending.qrCode);
      setSecret(pending.secret);
      setTotpUri(pending.uri ?? null);
      setEnrollState('verifying');
      return true;
    } catch {
      clearPendingSetup();
      return false;
    }
  };

  const cleanupUnverifiedFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;

    const unverifiedFactors = data.totp.filter(f => (f.status as string) === 'unverified');
    await Promise.all(
      unverifiedFactors.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })),
    );
  };

  const checkMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactor = data.totp.find(f => (f.status as string) === 'verified');
      if (totpFactor) {
        setIsEnabled(true);
        setFactorId(totpFactor.id);
        clearPendingSetup();
      } else {
        setIsEnabled(false);
        if (!restorePendingSetup()) {
          setFactorId(null);
        }
      }
    } catch (err) {
      console.error('Error checking MFA status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrollState('enrolling');
    try {
      await cleanupUnverifiedFactors();

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `AviSafe 2FA ${new Date().toISOString()}`,
      });
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setTotpUri(data.totp.uri ?? null);
      setFactorId(data.id);
      savePendingSetup({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      setEnrollState('verifying');
    } catch (err: any) {
      console.error('MFA enroll error:', err);
      if (err?.code === 'mfa_factor_name_conflict' || String(err?.message ?? '').includes('friendly name')) {
        try {
          await cleanupUnverifiedFactors();
        } catch (cleanupError) {
          console.error('MFA cleanup error:', cleanupError);
        }
        toast.error(t('twoFactor.factorConflict'));
      } else {
        toast.error(err.message || t('twoFactor.enrollError'));
      }
      setEnrollState('idle');
    }
  };

  const handleVerify = async () => {
    if (!factorId || verifyCode.length !== 6) return;

    setVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setIsEnabled(true);
      setEnrollState('idle');
      setQrCode(null);
      setSecret(null);
      setTotpUri(null);
      setVerifyCode("");
      clearPendingSetup();
      toast.success(t('twoFactor.enabled'));
    } catch (err: any) {
      console.error('MFA verify error:', err);
      toast.error(err.message || t('twoFactor.verifyError'));
      setVerifyCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!factorId || disableCode.length !== 6) return;

    setDisabling(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: disableCode,
      });
      if (verifyError) throw verifyError;

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const verifiedFactors = factorsData.totp.filter(f => (f.status as string) === 'verified');
      const factorsToRemove = verifiedFactors.length > 0 ? verifiedFactors : [{ id: factorId }];
      const results = await Promise.all(factorsToRemove.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })));
      const unenrollError = results.find(result => result.error)?.error;
      if (unenrollError) throw unenrollError;

      setIsEnabled(false);
      setFactorId(null);
      setDisableCode("");
      setShowDisableDialog(false);
      toast.success(t('twoFactor.disabled'));
    } catch (err: any) {
      console.error('MFA unenroll error:', err);
      toast.error(err.message || t('twoFactor.disableError'));
    } finally {
      setDisabling(false);
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t('twoFactor.secretCopied'));
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  };

  const handleOpenAuthenticator = () => {
    if (!totpUri) return;
    window.location.href = totpUri;
  };

  const handleCancel = async () => {
    // Clean up unverified factor
    if (factorId) {
      try {
        const { data } = await supabase.auth.mfa.listFactors();
        const unverified = data?.totp.find(f => f.id === factorId && (f.status as string) === 'unverified');
        if (unverified) {
          await supabase.auth.mfa.unenroll({ factorId });
        }
      } catch {
        // ignore cleanup errors
      }
    }
    setEnrollState('idle');
    setQrCode(null);
    setSecret(null);
    setTotpUri(null);
    setVerifyCode("");
    setFactorId(null);
    clearPendingSetup();
  };

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
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('twoFactor.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium">{t('twoFactor.authenticatorApp')}</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                {t('twoFactor.description')}
              </p>
            </div>
            {isEnabled ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {t('twoFactor.active')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <ShieldOff className="h-3 w-3" />
                {t('twoFactor.inactive')}
              </Badge>
            )}
          </div>

          {/* Enroll flow */}
          {enrollState === 'verifying' && qrCode && (
            <div className="space-y-3 sm:space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/30">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('twoFactor.scanQr')}</Label>
                <p className="text-xs text-muted-foreground">{t('twoFactor.scanQrDesc')}</p>
              </div>

              {totpUri && (
                <Button onClick={handleOpenAuthenticator} className="w-full" type="button">
                  <Smartphone className="h-4 w-4 mr-2" />
                  {t('twoFactor.openAuthenticator')}
                </Button>
              )}

              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code" className="w-36 h-36 sm:w-48 sm:h-48 rounded-lg border" />
              </div>

              {secret && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('twoFactor.manualEntry')}</Label>
                  <p className="text-xs text-muted-foreground">{t('twoFactor.manualEntryDesc')}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all select-all">
                      {secret}
                    </code>
                    <Button variant="outline" onClick={handleCopySecret} className="shrink-0">
                      {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                      <span className="hidden sm:inline">{t('twoFactor.copySecret')}</span>
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm">{t('twoFactor.enterCode')}</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
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
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  {t('actions.cancel')}
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={verifyCode.length !== 6 || verifying}
                  className="flex-1"
                >
                  {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('twoFactor.verify')}
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {enrollState === 'idle' && (
            <div>
              {isEnabled ? (
                <Button
                  variant="outline"
                  onClick={() => setShowDisableDialog(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <ShieldOff className="h-4 w-4 mr-2" />
                  {t('twoFactor.disable')}
                </Button>
              ) : (
                <Button onClick={handleEnroll}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t('twoFactor.enable')}
                </Button>
              )}
            </div>
          )}

          {enrollState === 'enrolling' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('twoFactor.settingUp')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable confirmation dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('twoFactor.disableTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('twoFactor.disableDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">{t('twoFactor.disableCodeLabel')}</Label>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={disableCode} onChange={setDisableCode}>
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
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabling} onClick={() => setDisableCode("")}>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable}
              disabled={disabling || disableCode.length !== 6}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disabling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('twoFactor.confirmDisable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
