import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateFolderDialog = ({ open, onOpenChange, onSuccess }: CreateFolderDialogProps) => {
  const { companyId, user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    const { error } = await supabase.from("document_folders").insert({
      name: name.trim(),
      company_id: companyId,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke opprette mappe");
      return;
    }
    toast.success("Mappe opprettet");
    setName("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ny mappe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="folder-name">Mappenavn</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Skriv inn mappenavn..."
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Lagrer..." : "Opprett"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
