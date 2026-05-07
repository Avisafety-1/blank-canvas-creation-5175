import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Document, DocumentStatusFilter } from "@/pages/Documents";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, AlertTriangle, Clock, FileText, FileImage, FileSpreadsheet, File, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const openUrl = (url: string) => {
  let finalUrl = url;
  if (!url.match(/^https?:\/\//i)) {
    finalUrl = `https://${url}`;
  }
  window.open(finalUrl, "_blank");
};

const canOpenInBrowser = (fileName?: string | null): boolean => {
  if (!fileName) return false;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt'].includes(ext || '');
};

const getFileIcon = (fileName?: string | null) => {
  if (!fileName) return File;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': case 'doc': case 'docx': case 'txt': return FileText;
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'svg': return FileImage;
    case 'xls': case 'xlsx': return FileSpreadsheet;
    default: return File;
  }
};

const showFileAccessError = (action: "open" | "download") => {
  toast.error(
    action === "open"
      ? "Du har tilgang til dokumentkortet, men filtilgangen mangler. Kontakt administrator."
      : "Du har tilgang til dokumentkortet, men filen kunne ikke lastes ned. Kontakt administrator."
  );
};

interface DocumentsListProps {
  documents: Document[];
  isLoading: boolean;
  onDocumentClick: (document: Document) => void;
  getDocumentStatus: (doc: Document) => DocumentStatusFilter;
}

const CATEGORY_LABELS: Record<string, string> = {
  regelverk: "Regelverk",
  prosedyrer: "Prosedyrer",
  sjekklister: "Sjekklister",
  rapporter: "Rapporter",
  nettsider: "Nettsider",
  oppdrag: "Oppdrag",
  loggbok: "Loggbok",
  "kml-kmz": "KML/KMZ",
  dokumentstyring: "Dokumentstyring",
  risikovurderinger: "Risikovurderinger",
  operasjonsmanual: "Operasjonsmanual",
  annet: "Annet"
};

const ExpiryCell = ({ doc, status }: { doc: Document; status: DocumentStatusFilter }) => {
  if (!doc.gyldig_til) {
    return <span className="text-muted-foreground italic text-sm">Ingen utløpsdato</span>;
  }

  const formatted = format(new Date(doc.gyldig_til), "dd.MM.yyyy", { locale: nb });

  if (status === "expired") {
    return (
      <span className="flex items-center gap-1 text-destructive font-medium text-sm">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {formatted}
      </span>
    );
  }

  if (status === "expiring_soon") {
    return (
      <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium text-sm">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {formatted}
      </span>
    );
  }

  return <span className="text-sm">{formatted}</span>;
};

const DocumentsList = ({
  documents,
  isLoading,
  onDocumentClick,
  getDocumentStatus,
}: DocumentsListProps) => {
  const { companyId, departmentsEnabled } = useAuth();

  const handleOpenFile = async (filUrl: string) => {
    try {
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        window.open(filUrl, '_blank');
        return;
      }
      const { data, error } = await supabase.storage.from('documents').createSignedUrl(filUrl, 3600);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error opening file:', error);
      showFileAccessError("open");
    }
  };

  const handleDownloadFile = async (filUrl: string, originalFileName?: string) => {
    try {
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        window.open(filUrl, '_blank');
        toast.info('Åpner ekstern lenke');
        return;
      }
      const { data, error } = await supabase.storage.from('documents').download(filUrl);
      if (error) throw error;
      if (data) {
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = originalFileName || filUrl.split('/').pop() || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Dokumentet ble lastet ned');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      showFileAccessError("download");
    }
  };

  if (isLoading) {
    return <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>;
  }

  if (documents.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">
        Ingen dokumenter funnet
      </div>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-muted/80 text-foreground opacity-100">Tittel</TableHead>
            <TableHead className="bg-muted/80 text-foreground shadow-sm px-2 md:px-4">
              <span className="md:hidden">Kat.</span>
              <span className="hidden md:inline">Kategori</span>
            </TableHead>
            <TableHead className="bg-muted/80 text-foreground hidden md:table-cell">
              Utløpsdato
            </TableHead>
            <TableHead className="bg-muted/80 text-foreground hidden lg:table-cell">Opprettet</TableHead>
            <TableHead className="bg-muted/80 text-foreground text-right pl-1 md:pl-4">Handlinger</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map(doc => {
            const status = getDocumentStatus(doc);
            return (
              <TableRow
                key={doc.id}
                className={cn(
                  "cursor-pointer hover:bg-accent",
                  status === "expired" && "bg-destructive/5 hover:bg-destructive/10",
                  status === "expiring_soon" && "bg-yellow-50/60 dark:bg-yellow-900/10 hover:bg-yellow-100/60 dark:hover:bg-yellow-900/20"
                )}
                onClick={() => onDocumentClick(doc)}
              >
                <TableCell className="font-medium bg-slate-200/50 text-slate-950 shadow-sm rounded-none max-w-[150px] md:max-w-none">
                  <div className="flex flex-col gap-0.5">
                    {departmentsEnabled && (doc as any).company_id !== companyId && (doc as any).company_name && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 whitespace-nowrap w-fit gap-0.5 border-primary/30 text-primary">
                        <Building2 className="h-2.5 w-2.5" />
                        {(doc as any).company_name}
                      </Badge>
                    )}
                    <span className="truncate">{doc.tittel}</span>
                  </div>
                </TableCell>
                <TableCell className="bg-slate-200/50 text-slate-950 px-2 md:px-4">
                  <Badge variant="secondary" className="text-xs whitespace-nowrap">
                    {CATEGORY_LABELS[doc.kategori] || doc.kategori}
                  </Badge>
                </TableCell>
                <TableCell className="bg-slate-200/50 text-slate-950 hidden md:table-cell">
                  <ExpiryCell doc={doc} status={status} />
                </TableCell>
                <TableCell className="bg-slate-200/50 text-slate-950 hidden lg:table-cell">
                  {format(new Date(doc.opprettet_dato), "dd.MM.yyyy", { locale: nb })}
                </TableCell>
                <TableCell className="bg-slate-200/50 text-slate-950 text-right pl-1 md:pl-4">
                  <TooltipProvider>
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      {doc.nettside_url && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => openUrl(doc.nettside_url!)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Åpne nettside</TooltipContent>
                        </Tooltip>
                      )}
                      {doc.fil_url && !doc.nettside_url && (
                        <>
                          {canOpenInBrowser(doc.fil_navn) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => handleOpenFile(doc.fil_url!)}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Åpne i nettleser</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => handleDownloadFile(doc.fil_url!, doc.fil_navn || undefined)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Last ned</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default DocumentsList;
