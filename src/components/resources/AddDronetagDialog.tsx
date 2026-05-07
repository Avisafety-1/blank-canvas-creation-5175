import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AddDronetagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDronetagCreated?: () => void;
}

export function AddDronetagDialog({ open, onOpenChange, onDronetagCreated }: AddDronetagDialogProps) {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    callsign: "",
    device_id: "",
    kjopsdato: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.device_id.trim()) {
      toast.error(t('dronetag.serialNumberRequired'));
      return;
    }

    if (!user || !companyId) {
      toast.error(t('errors.notLoggedIn'));
      return;
    }

    setLoading(true);
    
    const { error } = await supabase
      .from("dronetag_devices")
      .insert({
        name: formData.name || null,
        callsign: formData.callsign || null,
        device_id: formData.device_id.trim(),
        kjopsdato: formData.kjopsdato || null,
        description: formData.description || null,
        company_id: companyId,
        user_id: user.id,
      });

    setLoading(false);

    if (error) {
      console.error("Error creating dronetag device:", error);
      toast.error(`${t('dronetag.createError')}: ${error.message}`);
    } else {
      toast.success(t('dronetag.createSuccess'));
      setFormData({
        name: "",
        callsign: "",
        device_id: "",
        kjopsdato: "",
        description: "",
      });
      onDronetagCreated?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dronetag.addTitle')}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.saving') : t('actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
