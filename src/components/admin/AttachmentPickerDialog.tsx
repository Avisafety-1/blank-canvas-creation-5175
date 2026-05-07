import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText, Paperclip, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per attachment (larger files get download links)

interface Document {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  kategori: string;
  fil_url: string | null;
  fil_navn: string | null;
  fil_storrelse: number | null;
}

interface AttachmentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDocumentIds: string[];
  onSelect: (documents: Document[]) => void;
  companyId?: string;
}

export const AttachmentPickerDialog = ({
  open,
  onOpenChange,
  selectedDocumentIds,
  onSelect,
  companyId,
}: AttachmentPickerDialogProps) => {
  const { companyId: userCompanyId } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeCompanyId = companyId || userCompanyId;

  useEffect(() => {
    if (open) {
      setSelectedIds(selectedDocumentIds);
      fetchDocuments();
    }
  }, [open, activeCompanyId]);

  const fetchDocuments = async () => {
    if (!activeCompanyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, tittel, beskrivelse, kategori, fil_url, fil_navn, fil_storrelse")
        .eq("company_id", activeCompanyId)
        .not("fil_url", "is", null)
        .order("tittel");

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.kategori.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleDocument = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    
    // Check if trying to add a file that's too large
    if (doc && !selectedIds.includes(docId) && doc.fil_storrelse && doc.fil_storrelse > MAX_ATTACHMENT_SIZE_BYTES) {
      toast({
        title: "Stort vedlegg",
        description: `${doc.tittel} (${formatFileSize(doc.fil_storrelse)}) vil bli sendt som nedlastingslenke i stedet for direkte vedlegg`,
        variant: "default",
      });
    }
    
    setSelectedIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleConfirm = () => {
    const selected = documents.filter((doc) => selectedIds.includes(doc.id));
    onSelect(selected);
    onOpenChange(false);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryLabel = (kategori: string) => {
    const labels: Record<string, string> = {
      operasjonsmanual: "Operasjonsmanual",
      sikkerhet: "Sikkerhet",
      vedlikehold: "Vedlikehold",
      sertifikater: "Sertifikater",
      forsikring: "Forsikring",
      kontrakter: "Kontrakter",
      prosedyrer: "Prosedyrer",
      sjekklister: "Sjekklister",
      rapporter: "Rapporter",
      annet: "Annet",
    };
    return labels[kategori] || kategori;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Velg dokumenter som vedlegg
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk etter dokumenter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex-1 min-h-[300px] max-h-[400px] border rounded-lg overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p>Ingen dokumenter funnet</p>
              <p className="text-xs">Kun dokumenter med filer kan velges som vedlegg</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredDocuments.map((doc) => {
                const isLargeFile = doc.fil_storrelse && doc.fil_storrelse > MAX_ATTACHMENT_SIZE_BYTES;
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.includes(doc.id)
                        ? "bg-primary/10 border border-primary/30"
                        : isLargeFile
                        ? "bg-amber-50 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800"
                        : "hover:bg-muted/50 border border-transparent"
                    }`}
                    onClick={() => toggleDocument(doc.id)}
                  >
                    <Checkbox
                      checked={selectedIds.includes(doc.id)}
                      onCheckedChange={() => toggleDocument(doc.id)}
                    />
                    <FileText className={`h-5 w-5 flex-shrink-0 ${isLargeFile ? "text-amber-600" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${isLargeFile ? "text-amber-700 dark:text-amber-400" : ""}`}>{doc.tittel}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="bg-muted px-1.5 py-0.5 rounded">
                          {getCategoryLabel(doc.kategori)}
                        </span>
                        {doc.fil_navn && <span className="truncate">{doc.fil_navn}</span>}
                        {doc.fil_storrelse && (
                          <span className={isLargeFile ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                            ({formatFileSize(doc.fil_storrelse)})
                            {isLargeFile && " → lenke"}
                          </span>
                        )}
                      </div>
                    </div>
                    {isLargeFile && (
                      <span className="text-xs text-amber-600 whitespace-nowrap">📎 Lenke</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selectedIds.length} dokument(er) valgt</span>
          <span className="text-xs">Filer over 5 MB sendes som nedlastingslenke</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm}>
            Legg til vedlegg ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
