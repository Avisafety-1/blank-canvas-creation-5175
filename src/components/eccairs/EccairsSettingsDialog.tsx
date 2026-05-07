import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanGating } from "@/hooks/usePlanGating";

const ECCAIRS_GATEWAY = import.meta.env.VITE_ECCAIRS_GATEWAY_URL || "";

interface EccairsSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: Environment;
  onEnvironmentChange: (environment: Environment) => void;
}

type Environment = "sandbox" | "prod";

// Base URLs from ECCAIRS E2 API documentation
const E2_BASE_URLS = {
  sandbox: "https://api.uat.aviationreporting.eu",
  prod: "https://api.aviationreporting.eu",
} as const;

export function EccairsSettingsDialog({
  open,
  onOpenChange,
  environment,
  onEnvironmentChange,
}: EccairsSettingsDialogProps) {
  const { companyId } = useAuth();
  const { hasAddon } = usePlanGating();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasExistingSecret, setHasExistingSecret] = useState(false);

  // Gate addon
  useEffect(() => {
    if (open && !hasAddon('eccairs')) {
      toast.error('ECCAIRS-rapportering krever ECCAIRS-tilleggsmodulen');
      onOpenChange(false);
    }
  }, [open]);

  // Fetch existing settings when dialog opens
  useEffect(() => {
    const fetchSettings = async () => {
      if (!open || !companyId) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("eccairs_integrations")
          .select("e2_client_id, e2_client_secret_encrypted, e2_scope")
          .eq("company_id", companyId)
          .eq("environment", environment)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setClientId(data.e2_client_id || "");
          setClientSecret("");
          setHasExistingSecret(!!data.e2_client_secret_encrypted);
        } else {
          setClientId("");
          setClientSecret("");
          setHasExistingSecret(false);
        }
      } catch (err) {
        console.error("Error fetching ECCAIRS settings:", err);
        toast.error("Kunne ikke hente ECCAIRS-innstillinger");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [open, companyId, environment]);

  const handleSave = async () => {
    if (!companyId) {
      toast.error("Ingen bedrift tilknyttet");
      return;
    }

    if (!clientId) {
      toast.error("Client ID er påkrevd");
      return;
    }

    if (!clientSecret && !hasExistingSecret) {
      toast.error("Client Secret er påkrevd");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_eccairs_credentials", {
        p_company_id: companyId,
        p_environment: environment,
        p_e2_client_id: clientId,
        p_e2_client_secret: clientSecret || "********",
        p_e2_base_url: E2_BASE_URLS[environment],
        p_e2_scope: null,
      });

      if (error) throw error;

      toast.success("ECCAIRS-innstillinger lagret");
      setHasExistingSecret(true);
      setTestResult(null);
    } catch (err: any) {
      console.error("Error saving ECCAIRS settings:", err);
      if (err.message?.includes("ECCAIRS_ENCRYPTION_KEY")) {
        toast.error("Krypteringsnøkkel ikke konfigurert i Supabase Vault");
      } else {
        toast.error("Kunne ikke lagre innstillinger");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!companyId) {
      toast.error("Ingen bedrift tilknyttet");
      return;
    }

    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL ikke konfigurert");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        toast.error("Du må være logget inn");
        return;
      }

      const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          company_id: companyId,
          environment,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Tilkobling vellykket (${data.credentials_source === "database" ? "per-selskap credentials" : "globale credentials"})`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || "Tilkobling feilet",
        });
      }
    } catch (err: any) {
      console.error("Test connection error:", err);
      setTestResult({
        ok: false,
        message: err.message || "Nettverksfeil",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            ECCAIRS API-innstillinger
          </DialogTitle>
          <DialogDescription>
            Konfigurer tilkobling til ECCAIRS E2 API for rapportering.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            {/* Environment */}
            <div className="space-y-2">
              <Label htmlFor="environment">Miljø</Label>
              <Select
                value={environment}
                onValueChange={(val) => onEnvironmentChange(val as Environment)}
              >
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                  <SelectItem value="prod">Produksjon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Client ID */}
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID (brukernavn)</Label>
              <Input
                id="clientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Din E2 client ID"
              />
            </div>

            {/* Client Secret */}
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret (passord)</Label>
              <Input
                id="clientSecret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={hasExistingSecret ? "••••••••" : "Din E2 client secret"}
              />
              {hasExistingSecret && (
                <p className="text-xs text-muted-foreground">
                  La feltet stå tomt for å beholde eksisterende passord
                </p>
              )}
            </div>

            {/* Base URL info */}
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                <strong>API URL:</strong> {E2_BASE_URLS[environment]}
              </p>
            </div>


            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 p-3 rounded-md text-sm ${
                  testResult.ok
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !clientId}
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Tester...
                  </>
                ) : (
                  "Test tilkobling"
                )}
              </Button>
              <Button onClick={handleSave} disabled={saving || !clientId}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Lagrer...
                  </>
                ) : (
                  "Lagre"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
