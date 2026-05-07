import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Document } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Calendar, AlertCircle, FileText, User, Download, ExternalLink, Edit, Trash2, Square, FileImage, FileSpreadsheet, FileIcon, File } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface ChecklistItem {
  id: string;
  text: string;
}
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

interface DocumentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  status: string;
  canManage?: boolean;
}

export const DocumentDetailDialog = ({ open, onOpenChange, document, status, canManage }: DocumentDetailDialogProps) => {
  const { user, ensureValidToken, isAdmin, isSuperAdmin, companyId } = useAuth();
  const [downloading, setDownloading] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedDate, setEditedDate] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  

  useEffect(() => {
    if (document?.gyldig_til) {
      setEditedDate(format(document.gyldig_til, "yyyy-MM-dd"));
    }
  }, [document]);


  // Helper to determine if file can be opened in browser
  const canOpenInBrowser = (fileName?: string | null): boolean => {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt'].includes(ext || '');
  };

  // Helper to get file type info
  const getFileTypeInfo = (fileName?: string | null): { icon: typeof FileIcon; label: string; canPreview: boolean } => {
    if (!fileName) return { icon: File, label: 'Fil', canPreview: false };
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'pdf':
        return { icon: FileText, label: 'PDF', canPreview: true };
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return { icon: FileImage, label: 'Bilde', canPreview: true };
      case 'doc':
      case 'docx':
        return { icon: FileText, label: 'Word', canPreview: false };
      case 'xls':
      case 'xlsx':
        return { icon: FileSpreadsheet, label: 'Excel', canPreview: false };
      case 'txt':
        return { icon: FileText, label: 'Tekst', canPreview: true };
      default:
        return { icon: File, label: ext?.toUpperCase() || 'Fil', canPreview: false };
    }
  };

  const fileTypeInfo = getFileTypeInfo(document?.fil_navn);
  
  if (!document) return null;

  const ownsDocument = !document.company_id || document.company_id === companyId;
  const canManageDocument = canManage ?? (isAdmin && (ownsDocument || isSuperAdmin));

  const handleOpenDocument = async () => {
    try {
      // Priority 1: Check for nettside_url (website URL)
      if (document.nettside_url) {
        const url = document.nettside_url.startsWith('http://') || document.nettside_url.startsWith('https://')
          ? document.nettside_url
          : `https://${document.nettside_url}`;
        window.open(url, '_blank');
        return;
      }
      
      // Priority 2: Check for fil_url (file in storage or external URL)
      if (!document.fil_url) return;
      
      // Check if it's an external URL
      if (document.fil_url.startsWith('http://') || document.fil_url.startsWith('https://')) {
        window.open(document.fil_url, '_blank');
        return;
      }
      
      // Extract path from URL if it's a full URL (for backwards compatibility)
      let filePath = document.fil_url;
      if (filePath.includes('/storage/v1/object/')) {
        const parts = filePath.split('/documents/');
        if (parts.length > 1) {
          filePath = parts[1];
        }
      }
      
      // Generate signed URL for viewing
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600); // Valid for 1 hour

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error: any) {
      console.error('Error opening document:', error);
      toast.error('Kunne ikke åpne dokumentet');
    }
  };

  const handleDownloadDocument = async () => {
    if (!document.fil_url || downloading) return;
    
    // Check if it's an external URL - can't download directly
    if (document.fil_url.startsWith('http://') || document.fil_url.startsWith('https://')) {
      window.open(document.fil_url, '_blank');
      toast.info('Åpner ekstern lenke i ny fane');
      return;
    }
    
    setDownloading(true);
    try {
      // Extract path from URL if it's a full URL (for backwards compatibility)
      let filePath = document.fil_url;
      if (filePath.includes('/storage/v1/object/')) {
        const parts = filePath.split('/documents/');
        if (parts.length > 1) {
          filePath = parts[1];
        }
      }
      
      // Download file using Supabase client
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);

      if (error) throw error;
      
      // Create blob URL and download
      const url = window.URL.createObjectURL(data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fil_navn || document.tittel;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Dokumentet ble lastet ned');
    } catch (error: any) {
      console.error('Error downloading document:', error);
      toast.error('Kunne ikke laste ned dokumentet');
    } finally {
      setDownloading(false);
    }
  };

  const handleUpdateExpiryDate = async () => {
    if (!document.id || !editedDate || !canManageDocument) return;

    try {
      const { error } = await supabase
        .from('documents')
        .update({ gyldig_til: editedDate })
        .eq('id', document.id);

      if (error) throw error;

      toast.success('Utløpsdato oppdatert');
      setIsEditing(false);
      onOpenChange(false);
      // Refresh the page to show updated data
      window.location.reload();
    } catch (error: any) {
      console.error('Error updating expiry date:', error);
      toast.error('Kunne ikke oppdatere utløpsdato');
    }
  };

  const handleDeleteDocument = async () => {
    if (!document.id || deleting || !canManageDocument) return;
    if (!document.fil_url && !document.nettside_url) return;

    setDeleting(true);
    try {
      // Only delete from storage if there's a fil_url and it's not an external URL
      if (document.fil_url) {
        const isExternalUrl = document.fil_url.startsWith('http://') || document.fil_url.startsWith('https://');
        
        if (!isExternalUrl) {
          // Extract path from URL if it's a full URL
          let filePath = document.fil_url;
          if (filePath.includes('/storage/v1/object/')) {
            const parts = filePath.split('/documents/');
            if (parts.length > 1) {
              filePath = parts[1];
            }
          }

          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([filePath]);

          if (storageError) throw storageError;
        }
      }

      // Delete from database (works for both files and URLs)
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);

      if (dbError) throw dbError;

      toast.success('Dokument slettet');
      setDeleteDialogOpen(false);
      onOpenChange(false);
      // Refresh the page to show updated list
      window.location.reload();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error('Kunne ikke slette dokumentet');
    } finally {
      setDeleting(false);
    }
  };

  const getDaysUntilExpiry = () => {
    if (!document.gyldig_til) return null;
    const today = new Date();
    const expiryDate = new Date(document.gyldig_til);
    return Math.floor(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  const daysUntilExpiry = getDaysUntilExpiry();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <DialogTitle className="text-lg sm:text-xl">{document.tittel}</DialogTitle>
            <StatusBadge status={status as any} />
          </div>
        </DialogHeader>
        
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs sm:text-sm">
              {document.kategori}
            </Badge>
            <Badge variant="outline" className="text-xs sm:text-sm">
              Versjon {document.versjon}
            </Badge>
            {document.synlighet && (
              <Badge variant="outline" className="text-xs sm:text-sm">
                {document.synlighet}
              </Badge>
            )}
          </div>

          <div className="space-y-2 sm:space-y-3">
            {document.utsteder && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Utsteder</p>
                  <p className="text-base">{document.utsteder}</p>
                </div>
              </div>
            )}

            {document.gyldig_til && (
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Gyldig til</p>
                  {isEditing && canManageDocument ? (
                    <div className="flex gap-2 items-center mt-1">
                      <Input
                        type="date"
                        value={editedDate}
                        onChange={(e) => setEditedDate(e.target.value)}
                        className="max-w-[200px]"
                      />
                      <Button size="sm" onClick={handleUpdateExpiryDate}>
                        Lagre
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                        Avbryt
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-base">
                        {format(document.gyldig_til, "dd. MMMM yyyy", { locale: nb })}
                      </p>
                      {canManageDocument && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsEditing(true)}
                          className="h-6 px-2"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                  {daysUntilExpiry !== null && (
                    <p className={`text-sm mt-1 ${
                      daysUntilExpiry < 0 
                        ? "text-destructive font-medium"
                        : daysUntilExpiry <= document.varsel_dager_for_utløp
                        ? "text-status-yellow"
                        : "text-muted-foreground"
                    }`}>
                      {daysUntilExpiry < 0 
                        ? `Utløpt for ${Math.abs(daysUntilExpiry)} dager siden`
                        : daysUntilExpiry === 0
                        ? "Utløper i dag"
                        : `${daysUntilExpiry} dager igjen`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {document.sist_endret && (
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sist endret</p>
                  <p className="text-base">
                    {format(document.sist_endret, "dd. MMMM yyyy, HH:mm", { locale: nb })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {document.kategori?.toLowerCase() === "sjekklister" && (document as any).beskrivelse && (() => {
            // Try to parse checklist items from beskrivelse
            let checklistItems: ChecklistItem[] = [];
            try {
              const parsed = JSON.parse((document as any).beskrivelse);
              if (Array.isArray(parsed)) {
                checklistItems = parsed.filter((item: any) => item && typeof item === 'object' && item.text);
              }
            } catch {
              // Not valid JSON, will show as regular description below
            }
            
            if (checklistItems.length > 0) {
              return (
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">Sjekkpunkter ({checklistItems.length})</p>
                  <div className="space-y-2">
                    {checklistItems.map((item, index) => (
                      <div key={item.id || index} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
                        <Square className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {document.kategori?.toLowerCase() !== "sjekklister" && (document as any).beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{(document as any).beskrivelse}</p>
            </div>
          )}

          {document.merknader && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Merknader</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{document.merknader}</p>
            </div>
          )}

          {status === "Rød" && (
            <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Dokumentet har utløpt</p>
                  <p className="text-sm mt-1 text-destructive/90">
                    Dette dokumentet må fornyes umiddelbart for å opprettholde compliance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === "Gul" && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Dokumentet nærmer seg utløp
                  </p>
                  <p className="text-sm mt-1 text-amber-900 dark:text-amber-100">
                    Vennligst sørg for fornyelse innen utløpsdato.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(document.fil_url || document.nettside_url) && (
            <div className="space-y-3 pt-4 border-t border-border">
              {/* File type indicator */}
              {document.fil_url && !document.nettside_url && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <fileTypeInfo.icon className="w-4 h-4" />
                  <span>{fileTypeInfo.label}</span>
                  {document.fil_navn && (
                    <span className="text-xs truncate max-w-[200px]">({document.fil_navn})</span>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {document.nettside_url && (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={handleOpenDocument}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Åpne nettside
                  </Button>
                )}
                {document.fil_url && !document.nettside_url && (
                  <>
                    {/* Show "Open in browser" for viewable files */}
                    {canOpenInBrowser(document.fil_navn) && (
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={handleOpenDocument}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Åpne
                      </Button>
                    )}
                    {/* Download button */}
                    <Button
                      variant={canOpenInBrowser(document.fil_navn) ? "outline" : "default"}
                      className="flex-1"
                      onClick={handleDownloadDocument}
                      disabled={downloading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {downloading ? "Laster ned..." : "Last ned"}
                    </Button>
                  </>
                )}
              </div>
              
              {canManageDocument && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Slett dokument
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette vil permanent slette dokumentet "{document.tittel}". Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocument}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Sletter..." : "Slett"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};