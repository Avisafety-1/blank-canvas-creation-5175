import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, ChevronUp, ChevronDown, Globe } from "lucide-react";

interface ChecklistItem {
  id: string;
  text: string;
}

interface CreateChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateChecklistDialog = ({ open, onOpenChange, onSuccess }: CreateChecklistDialogProps) => {
  const { user, companyId, isSuperAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [globalVisibility, setGlobalVisibility] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: crypto.randomUUID(), text: "" }
  ]);

  const handleAddItem = () => {
    setItems([...items, { id: crypto.randomUUID(), text: "" }]);
  };

  const handleMoveItem = (id: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id: string, text: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, text } : item
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !companyId) {
      toast.error("Du må være logget inn");
      return;
    }

    if (!title.trim()) {
      toast.error("Fyll inn navn på sjekklisten");
      return;
    }

    const validItems = items.filter(item => item.text.trim());
    if (validItems.length === 0) {
      toast.error("Legg til minst ett punkt i sjekklisten");
      return;
    }

    setIsSubmitting(true);

    try {
      // Store checklist items as JSON in beskrivelse field
      const checklistData = JSON.stringify(validItems.map(item => ({
        id: item.id,
        text: item.text.trim()
      })));

      const { error } = await supabase.from("documents").insert({
        tittel: title.trim(),
        kategori: "sjekklister",
        beskrivelse: checklistData,
        company_id: companyId,
        user_id: user.id,
        opprettet_av: user.email || "Ukjent",
        global_visibility: isSuperAdmin ? globalVisibility : false,
      });

      if (error) throw error;

      toast.success("Sjekkliste opprettet");
      setTitle("");
      setGlobalVisibility(false);
      setItems([{ id: crypto.randomUUID(), text: "" }]);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating checklist:", error);
      toast.error(`Kunne ikke opprette sjekkliste: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setGlobalVisibility(false);
    setItems([{ id: crypto.randomUUID(), text: "" }]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ny sjekkliste</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Navn på sjekkliste</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="f.eks. Drone-inspeksjon før flyging"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Sjekkliste-punkter</Label>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <div className="flex flex-col flex-shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveItem(item.id, 'up')} disabled={index === 0}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveItem(item.id, 'down')} disabled={index === items.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <Input
                    value={item.text}
                    onChange={(e) => handleItemChange(item.id, e.target.value)}
                    placeholder="Beskriv sjekk-punktet..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={items.length === 1}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="w-full mt-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Legg til punkt
            </Button>
          </div>

          {/* Superadmin-only: Global visibility toggle */}
          {isSuperAdmin && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <div>
                  <Label htmlFor="global-visibility" className="text-sm font-medium">
                    Synlig for alle selskaper
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Gjør sjekklisten tilgjengelig for alle selskaper i systemet
                  </p>
                </div>
              </div>
              <Switch
                id="global-visibility"
                checked={globalVisibility}
                onCheckedChange={setGlobalVisibility}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Oppretter..." : "Opprett sjekkliste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
