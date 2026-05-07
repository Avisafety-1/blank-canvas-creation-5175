import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Send, ArrowLeft } from "lucide-react";
import droneBackground from "@/assets/drone-background.png";
import { PasswordRequirements, isPasswordValid, passwordErrorMessage } from "@/components/PasswordRequirements";

const avisafeLogoText = "/avisafe-logo-text.png";

type Stage = "idle" | "verifying" | "verified" | "resend";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token_hash") ? "idle" : "resend";
  });
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);

  // Read token_hash from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const tokenHash = urlParams.get("token_hash");

  const startVerification = async () => {
    if (!tokenHash) {
      toast.error("Ingen gyldig token funnet i lenken.");
      setStage("resend");
      return;
    }

    setStage("verifying");

    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (error) {
        console.error("verifyOtp error:", error);
        toast.error("Lenken er ugyldig eller utløpt. Prøv å sende en ny link.");
        setStage("resend");
      } else {
        setStage("verified");
      }
    } catch (err: any) {
      console.error("verifyOtp exception:", err);
      toast.error("En feil oppstod. Prøv å sende en ny link.");
      setStage("resend");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passordene er ikke like");
      return;
    }
    const pwErr = passwordErrorMessage(password);
    if (pwErr) {
      toast.error(pwErr);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Passord oppdatert! Du kan nå logge inn med ditt nye passord.");
      navigate("/auth");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || "En feil oppstod ved tilbakestilling av passord");
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) {
      toast.error("Skriv inn e-postadressen din");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: resendEmail },
      });
      if (error) throw error;
      setResendSent(true);
      toast.success("Hvis e-posten finnes i systemet, vil du motta en ny tilbakestillingslenke.");
    } catch (error: any) {
      console.error("Resend error:", error);
      toast.error("Kunne ikke sende ny link. Prøv igjen senere.");
    } finally {
      setLoading(false);
    }
  };

  const Background = () => (
    <div
      className="fixed inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.7)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );

  const renderContent = () => {
    if (stage === "verifying") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="text-muted-foreground">Verifiserer lenke...</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (stage === "verified") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">Sett nytt passord</CardTitle>
              <CardDescription>Skriv inn ditt nye passord nedenfor</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nytt passord</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <PasswordRequirements password={password} />
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Bekreft nytt passord</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="text-xs text-destructive">Passordene er ikke like</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading || !isPasswordValid(password) || password !== confirmPassword}>
                {loading ? "Oppdaterer..." : "Oppdater passord"}
              </Button>
            </form>
            <div className="text-center text-sm mt-4">
              <button type="button" onClick={() => navigate("/auth")} className="text-primary hover:underline">
                Tilbake til innlogging
              </button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (stage === "resend") {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">Send ny tilbakestillingslenke</CardTitle>
              <CardDescription>
                Skriv inn e-postadressen din så sender vi en ny lenke.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {resendSent ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <Send className="h-10 w-10 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Hvis e-posten finnes i systemet, vil du motta en ny tilbakestillingslenke. Sjekk innboksen din (og søppelpost).
                </p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tilbake til innlogging
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResendLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resendEmail">E-postadresse</Label>
                  <Input id="resendEmail" type="email" placeholder="din@epost.no" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sender..." : "Send ny link"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStage("idle")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tilbake
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      );
    }

    // idle — landing page with token_hash present

    return (
      <Card className="bg-card/95 backdrop-blur-sm border-border/50">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center">
            <img src={avisafeLogoText} alt="AviSafe" className="h-24 w-auto" />
          </div>
          <div className="text-center">
            <CardTitle className="text-xl">Tilbakestill passord</CardTitle>
            <CardDescription>
              Klikk knappen under for å verifisere lenken og sette nytt passord.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={startVerification} className="w-full" size="lg">
            <ShieldCheck className="mr-2 h-5 w-5" />
            Verifiser og sett nytt passord
          </Button>
          <div className="text-center">
            <button type="button" onClick={() => setStage("resend")} className="text-sm text-muted-foreground hover:text-primary hover:underline">
              Fungerte ikke lenken? Send ny link
            </button>
          </div>
          <div className="text-center">
            <button type="button" onClick={() => navigate("/auth")} className="text-sm text-primary hover:underline">
              Tilbake til innlogging
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <Background />
      <div className="relative z-10 w-full max-w-md px-4">
        {renderContent()}
      </div>
    </div>
  );
};

export default ResetPassword;
