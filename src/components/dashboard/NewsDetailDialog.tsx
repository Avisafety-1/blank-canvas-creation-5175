import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Pin, User, Calendar, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type News = any;

interface NewsDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  news: News | null;
  onEdit?: (news: News) => void;
}

export const NewsDetailDialog = ({ open, onOpenChange, news, onEdit }: NewsDetailDialogProps) => {
  const { isAdmin } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  if (!news) return null;

  const handleEdit = () => {
    onEdit?.(news);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('news')
        .delete()
        .eq('id', news.id);

      if (error) throw error;

      toast.success('Nyheten ble slettet');
      onOpenChange(false);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting news:', error);
      toast.error('Kunne ikke slette nyheten');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start gap-2">
            {news.pin_on_top && (
              <Pin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
            )}
            <DialogTitle className="text-lg sm:text-xl pr-8">{news.tittel}</DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="flex-1 sm:flex-initial"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Rediger
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="flex-1 sm:flex-initial"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Slett
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground border-b border-border pb-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(news.publisert), "dd. MMMM yyyy, HH:mm", { locale: nb })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span>{news.forfatter}</span>
            </div>
            {news.synlighet !== "Alle" && (
              <Badge variant="outline" className="text-xs">
                {news.synlighet}
              </Badge>
            )}
          </div>
          
          <div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto">
            <div className="whitespace-pre-wrap text-foreground leading-relaxed break-words">
              {news.innhold}
            </div>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette vil permanent slette nyheten "{news.tittel}". Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Sletter...' : 'Slett'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};