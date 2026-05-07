import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";

const NewsletterSignup = () => {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-manage", {
        body: { action: "public-subscribe", email, first_name: firstName, last_name: lastName },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDone(true);
    } catch (err: any) {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">AviSafe Nyhetsbrev</h1>
          <p className="text-muted-foreground text-sm">
            Meld deg på vårt nyhetsbrev for å holde deg oppdatert på nyheter, tips og oppdateringer.
          </p>
        </div>

        {done ? (
          <div className="text-center space-y-3 p-6 border border-border rounded-lg bg-card">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <p className="text-foreground font-medium">Takk for at du meldte deg på!</p>
            <p className="text-sm text-muted-foreground">Du vil motta vårt neste nyhetsbrev på {email}.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6 border border-border rounded-lg bg-card">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fornavn</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ola" />
              </div>
              <div>
                <Label className="text-xs">Etternavn</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nordmann" />
              </div>
            </div>
            <div>
              <Label className="text-xs">E-post *</Label>
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="din@epost.no" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              Meld meg på
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Du kan melde deg av når som helst via lenken i nyhetsbrevet.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default NewsletterSignup;
