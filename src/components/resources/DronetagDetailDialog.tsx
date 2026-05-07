import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useRoleCheck } from "@/hooks/useRoleCheck";

interface DronetagDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dronetag: any;
  onDronetagUpdated?: () => void;
}

export function DronetagDetailDialog({ open, onOpenChange, dronetag, onDronetagUpdated }: DronetagDetailDialogProps) {
  const { t } = useTranslation();
  const { isAdmin } = useRoleCheck();
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    callsign: "",
    device_id: "",
    kjopsdato: "",
    description: "",
  });

  useEffect(() => {
    if (dronetag) {
      setFormData({
        name: dronetag.name || "",
        callsign: dronetag.callsign || "",
        device_id: dronetag.device_id || "",
        kjopsdato: dronetag.kjopsdato ? format(new Date(dronetag.kjopsdato), "yyyy-MM-dd") : "",
        description: dronetag.description || "",
      });
      setIsEditing(false);
    }
  }, [dronetag]);

  const handleSave = async () => {
    if (!formData.device_id.trim()) {
      toast.error(t('dronetag.serialNumberRequired'));
      return;
    }

    setLoading(true);
    
    const { error } = await supabase
      .from("dronetag_devices")
      .update({
        name: formData.name || null,
        callsign: formData.callsign || null,
        device_id: formData.device_id.trim(),
        kjopsdato: formData.kjopsdato || null,
        description: formData.description || null,
      })
      .eq("id", dronetag.id);

    setLoading(false);

    if (error) {
      console.error("Error updating dronetag device:", error);
      toast.error(t('dronetag.updateError'));
    } else {
      toast.success(t('dronetag.updateSuccess'));
      setIsEditing(false);
      onDronetagUpdated?.();
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    
    const { error } = await supabase
      .from("dronetag_devices")
      .delete()
      .eq("id", dronetag.id);

    setLoading(false);

    if (error) {
      console.error("Error deleting dronetag device:", error);
      toast.error(`${t('dronetag.deleteError')}: ${error.message}`);
    } else {
      toast.success(t('dronetag.deleteSuccess'));
      onOpenChange(false);
      onDronetagUpdated?.();
    }
  };

  if (!dronetag) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dronetag.name || dronetag.device_id}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">{t('dronetag.name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('dronetag.namePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="callsign">{t('dronetag.callsign')}</Label>
                <Input
                  id="callsign"
                  value={formData.callsign}
                  onChange={(e) => setFormData({ ...formData, callsign: e.target.value })}
                  placeholder={t('dronetag.callsignPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('dronetag.callsignHelp')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="device_id">{t('dronetag.serialNumber')} *</Label>
                <Input
                  id="device_id"
                  value={formData.device_id}
                  onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                  placeholder={t('dronetag.serialNumberPlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="kjopsdato">{t('dronetag.purchaseDate')}</Label>
                <Input
                  id="kjopsdato"
                  type="date"
                  value={formData.kjopsdato}
                  onChange={(e) => setFormData({ ...formData, kjopsdato: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('dronetag.notes')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('dronetag.notesPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  {t('actions.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? t('common.saving') : t('actions.save')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('dronetag.name')}</p>
                  <p className="font-medium">{dronetag.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('dronetag.callsign')}</p>
                  <p className="font-medium">{dronetag.callsign || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('dronetag.serialNumber')}</p>
                  <p className="font-medium">{dronetag.device_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('dronetag.purchaseDate')}</p>
                  <p className="font-medium">
                    {dronetag.kjopsdato ? format(new Date(dronetag.kjopsdato), "dd.MM.yyyy") : "-"}
                  </p>
                </div>
              </div>

              {dronetag.description && (
                <div className="text-sm">
                  <p className="text-muted-foreground">{t('dronetag.notes')}</p>
                  <p className="font-medium">{dronetag.description}</p>
                </div>
              )}

              <div className="flex justify-between pt-4">
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('actions.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('dronetag.deleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('dronetag.deleteConfirmDesc')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {t('actions.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button onClick={() => setIsEditing(true)} className="ml-auto">
                  {t('actions.edit')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
