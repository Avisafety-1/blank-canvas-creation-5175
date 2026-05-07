import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, FileIcon, Loader2, Upload, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

const ECCAIRS_GATEWAY = import.meta.env.VITE_ECCAIRS_GATEWAY_URL || "";
const ECCAIRS_GATEWAY_KEY = import.meta.env.VITE_ECCAIRS_GATEWAY_KEY || "";

interface EccairsAttachmentUploadProps {
  incidentId: string;
  e2Id: string;
  environment: "sandbox" | "prod";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Document {
  id: string;
  tittel: string;
  kategori: string;
  fil_navn: string | null;
  fil_url: string | null;
  opprettet_dato: string | null;
  fil_storrelse: number | null;
}

interface SelectedDocument {
  document: Document;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export function EccairsAttachmentUpload({
  incidentId,
  e2Id,
  environment,
  open,
  onOpenChange,
  onSuccess,
}: EccairsAttachmentUploadProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<SelectedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch documents when dialog opens
  useEffect(() => {
    if (open) {
      fetchDocuments();
    } else {
      // Reset state when closed
      setSelectedDocs([]);
      setSearchQuery("");
    }
  }, [open]);

  // Filter documents based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredDocuments(documents);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredDocuments(
        documents.filter(
          (doc) =>
            doc.tittel.toLowerCase().includes(query) ||
            doc.kategori.toLowerCase().includes(query) ||
            doc.fil_navn?.toLowerCase().includes(query),
        ),
      );
    }
  }, [searchQuery, documents]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, tittel, kategori, fil_navn, fil_url, opprettet_dato, fil_storrelse")
        .not("fil_url", "is", null)
        .order("opprettet_dato", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
      setFilteredDocuments(data || []);
    } catch (err) {
      console.error("Error fetching documents:", err);
      toast.error("Kunne ikke hente dokumenter");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDocument = (doc: Document) => {
    const isSelected = selectedDocs.some((s) => s.document.id === doc.id);
    if (isSelected) {
      setSelectedDocs((prev) => prev.filter((s) => s.document.id !== doc.id));
    } else {
      setSelectedDocs((prev) => [...prev, { document: doc, status: "pending" }]);
    }
  };

  const isDocumentSelected = (docId: string) => {
    return selectedDocs.some((s) => s.document.id === docId);
  };

  const getDocumentStatus = (docId: string) => {
    return selectedDocs.find((s) => s.document.id === docId);
  };

  const uploadSelectedDocuments = async () => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    if (selectedDocs.length === 0) {
      toast.error("Velg minst ett dokument");
      return;
    }

    setIsUploading(true);

    // Snapshot pending docs to avoid closure/state issues with double-processing
    const docsToUpload = selectedDocs
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.status === "pending");

    for (const { item, idx: i } of docsToUpload) {
      setSelectedDocs((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "uploading" } : s)));

      try {
        // Download file from Supabase storage
        if (!item.document.fil_url) {
          throw new Error("Ingen fil-URL");
        }

        let fileData: Blob;

        // Check if fil_url is a full URL or relative path
        if (item.document.fil_url.startsWith("http")) {
          // Full URL - use fetch directly
          const response = await fetch(item.document.fil_url);
          if (!response.ok) {
            throw new Error(`Kunne ikke laste ned fil: HTTP ${response.status}`);
          }
          fileData = await response.blob();
        } else {
          // Relative path - use Supabase storage
          const { data, error: downloadError } = await supabase.storage
            .from("documents")
            .download(item.document.fil_url);

          if (downloadError || !data) {
            throw new Error(`Kunne ikke laste ned fil: ${downloadError?.message || "Ukjent feil"}`);
          }
          fileData = data;
        }

        // Create FormData and upload to ECCAIRS
        const formData = new FormData();
        const fileName = item.document.fil_navn || "document";
        formData.append("files", fileData, fileName);
        formData.append("attributePath", "24.ATTRIBUTES.793");
        formData.append("overwrite", "true");
        formData.append("versionType", "DRAFT");
        formData.append("incident_id", incidentId);
        formData.append("environment", environment);

        const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/attachments/${encodeURIComponent(e2Id)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(ECCAIRS_GATEWAY_KEY ? { "x-api-key": ECCAIRS_GATEWAY_KEY } : {}),
          },
          body: formData,
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Opplasting feilet (${res.status})`);
        }

        setSelectedDocs((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "success" } : s)));
      } catch (err: any) {
        console.error("Attachment upload failed:", err);
        setSelectedDocs((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "error", error: err?.message || "Ukjent feil" } : s)),
        );
      }
    }

    setIsUploading(false);

    // Use functional state read to get accurate counts after all updates
    setSelectedDocs((prev) => {
      const successCount = prev.filter((s) => s.status === "success").length;
      const errorCount = prev.filter((s) => s.status === "error").length;

      if (successCount > 0 && errorCount === 0) {
        toast.success(`${successCount} vedlegg lastet opp til ECCAIRS`);
        onSuccess?.();
        setTimeout(() => handleClose(), 0);
      } else if (successCount > 0) {
        toast.success(`${successCount} vedlegg lastet opp, ${errorCount} feilet`);
      } else if (errorCount > 0) {
        toast.error("Ingen vedlegg ble lastet opp");
      }
      return prev;
    });
  };

  const handleClose = () => {
    if (!isUploading) {
      onOpenChange(false);
    }
  };

  const pendingCount = selectedDocs.filter((s) => s.status === "pending").length;

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Velg vedlegg fra dokumenter</DialogTitle>
          <DialogDescription>Velg dokumenter som skal legges ved ECCAIRS-rapporten ({e2Id})</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Søk i dokumenter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Laster dokumenter...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-8 text-center">
                <FileIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "Ingen dokumenter funnet" : "Ingen dokumenter med filer"}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredDocuments.map((doc) => {
                  const selected = isDocumentSelected(doc.id);
                  const status = getDocumentStatus(doc.id);

                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors",
                        selected && "bg-primary/5",
                      )}
                      onClick={() => !isUploading && toggleDocument(doc)}
                    >
                      <Checkbox checked={selected} disabled={isUploading} onCheckedChange={() => toggleDocument(doc)} />
                      <FileIcon className="w-5 h-5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{doc.tittel}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-muted px-1.5 py-0.5 rounded">{doc.kategori}</span>
                          {doc.fil_navn && <span className="truncate">{doc.fil_navn}</span>}
                          {doc.fil_storrelse && <span>{formatFileSize(doc.fil_storrelse)}</span>}
                        </div>
                      </div>
                      {status?.status === "uploading" && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      )}
                      {status?.status === "success" && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                      {status?.status === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-label={status.error} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected count */}
          {selectedDocs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedDocs.length} dokument{selectedDocs.length > 1 ? "er" : ""} valgt
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Avbryt
          </Button>
          <Button onClick={uploadSelectedDocuments} disabled={isUploading || pendingCount === 0}>
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Laster opp...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Last opp ({pendingCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
