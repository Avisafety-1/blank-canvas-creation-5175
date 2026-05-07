import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateTrainingFolderDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const { companyId, user, isSuperAdmin } = useAuth();
  const [name, setName] = useState("");
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    const { error } = await supabase.from("training_course_folders" as any).insert({
      name: name.trim(),
      company_id: companyId,
      created_by: user?.id,
      visible_to_children: visibleToChildren,
    });
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke opprette mappe");
      return;
    }
    toast.success("Mappe opprettet");
    setName("");
    setVisibleToChildren(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ny kursmappe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Mappenavn</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Skriv inn mappenavn..."
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-3">
              <Switch checked={visibleToChildren} onCheckedChange={setVisibleToChildren} id="visible-children" />
              <Label htmlFor="visible-children" className="text-sm">Synlig for alle avdelinger</Label>
            </div>
          )}
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
