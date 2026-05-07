import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search, AlertCircle, Building2 } from "lucide-react";
import { Document } from "@/types";
import { useState, useEffect } from "react";
import { DocumentDetailDialog } from "./DocumentDetailDialog";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";

const getDocumentStatus = (doc: Document) => {
  if (!doc.gyldig_til) return "Grønn";

  const today = new Date();
  const expiryDate = new Date(doc.gyldig_til);
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return "Rød";
  if (daysUntilExpiry <= doc.varsel_dager_for_utløp) return "Gul";
  return "Grønn";
};

const StatusDot = ({ status }: { status: string }) => {
  const colors = {
    Grønn: "bg-status-green",
    Gul: "bg-status-yellow",
    Rød: "bg-status-red",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status as keyof typeof colors]}`} />;
};

export const DocumentSection = ({ abortSignal }: { abortSignal?: AbortSignal }) => {
  const { t } = useTranslation();
  const { companyId, departmentsEnabled } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedDocStatus, setSelectedDocStatus] = useState<string>("Grønn");
  const [selectedDocVisibility, setSelectedDocVisibility] = useState<string>("Intern");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Helper to determine if document is internal (own company) or external (shared by superadmin)
  const getDocumentVisibility = (doc: any): string => {
    // If global_visibility is true and it's from a different company, it's "Ekstern"
    if (doc.global_visibility && doc.company_id !== companyId) {
      return "Ekstern";
    }
    return "Intern";
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.kategori.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchDocuments();
  }, [companyId]);

  // Real-time via shared dashboard channel
  useEffect(() => {
    const unregister = registerMain('documents', (payload) => {
      if (payload.eventType === 'INSERT') {
        const newDoc = payload.new as any;
        const mappedDoc: Document = {
          id: newDoc.id,
          tittel: newDoc.tittel,
          kategori: newDoc.kategori,
          versjon: newDoc.versjon || "1.0",
          gyldig_til: newDoc.gyldig_til ? new Date(newDoc.gyldig_til) : undefined,
          sist_endret: newDoc.oppdatert_dato ? new Date(newDoc.oppdatert_dato) : new Date(newDoc.opprettet_dato!),
          varsel_dager_for_utløp: newDoc.varsel_dager_for_utløp || 30,
          beskrivelse: newDoc.beskrivelse ?? null,
          synlighet: (newDoc.global_visibility && newDoc.company_id !== companyId) ? "Ekstern" : "Intern" as any,
          fil_url: newDoc.fil_url,
          fil_navn: newDoc.fil_navn,
          nettside_url: newDoc.nettside_url,
          utsteder: newDoc.opprettet_av,
          merknader: undefined,
        };
        setDocuments(prev => [mappedDoc, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        const updatedDoc = payload.new as any;
        const mappedDoc: Document = {
          id: updatedDoc.id,
          tittel: updatedDoc.tittel,
          kategori: updatedDoc.kategori,
          versjon: updatedDoc.versjon || "1.0",
          gyldig_til: updatedDoc.gyldig_til ? new Date(updatedDoc.gyldig_til) : undefined,
          sist_endret: updatedDoc.oppdatert_dato ? new Date(updatedDoc.oppdatert_dato) : new Date(updatedDoc.opprettet_dato!),
          varsel_dager_for_utløp: updatedDoc.varsel_dager_for_utløp || 30,
          beskrivelse: updatedDoc.beskrivelse ?? null,
          synlighet: (updatedDoc.global_visibility && updatedDoc.company_id !== companyId) ? "Ekstern" : "Intern" as any,
          fil_url: updatedDoc.fil_url,
          fil_navn: updatedDoc.fil_navn,
          nettside_url: updatedDoc.nettside_url,
          utsteder: updatedDoc.opprettet_av,
          merknader: undefined,
        };
        setDocuments(prev => prev.map(doc => doc.id === mappedDoc.id ? mappedDoc : doc));
      } else if (payload.eventType === 'DELETE') {
        const deletedDoc = payload.old as any;
        setDocuments(prev => prev.filter(doc => doc.id !== deletedDoc.id));
      }
    });
    return unregister;
  }, [registerMain, companyId]);

  const fetchDocuments = async () => {
    // 1. Load cache first for instant display
    if (companyId) {
      const cached = getCachedData<Document[]>(`offline_dashboard_docs_${companyId}`);
      if (cached) setDocuments(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // 3. Fetch fresh data from network
    try {
      if (abortSignal?.aborted) { setLoading(false); return; }
      const query = supabase
        .from("documents")
        .select("*, companies:company_id(id, navn)")
        .order("opprettet_dato", { ascending: false });
      if (abortSignal) (query as any).abortSignal(abortSignal);
      const { data, error } = await query;

      if (error) throw error;

      const mappedDocuments: (Document & { company_id?: string; global_visibility?: boolean })[] = (data || []).map((doc) => ({
        id: doc.id,
        tittel: doc.tittel,
        kategori: doc.kategori as any,
        versjon: doc.versjon || "1.0",
        gyldig_til: doc.gyldig_til ? new Date(doc.gyldig_til) : undefined,
        sist_endret: doc.oppdatert_dato ? new Date(doc.oppdatert_dato) : new Date(doc.opprettet_dato!),
        varsel_dager_for_utløp: doc.varsel_dager_for_utløp || 30,
        beskrivelse: (doc as any).beskrivelse ?? null,
        synlighet: (doc.global_visibility && doc.company_id !== companyId) ? "Ekstern" : "Intern" as any,
        fil_url: doc.fil_url,
        fil_navn: doc.fil_navn,
        nettside_url: doc.nettside_url,
        utsteder: doc.opprettet_av,
        merknader: undefined,
        company_id: doc.company_id,
        global_visibility: doc.global_visibility,
      }));

      setDocuments(mappedDocuments);
      if (companyId) setCachedData(`offline_dashboard_docs_${companyId}`, mappedDocuments);
    } catch (error: any) {
      if (error?.name === 'AbortError' || abortSignal?.aborted) return;
      console.error("Error fetching documents:", error);
      toast.error(t('dashboard.documents.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentClick = (doc: Document, status: string) => {
    setSelectedDocument(doc);
    setSelectedDocStatus(status);
    setDetailDialogOpen(true);
  };

  return (
    <>
      <GlassCard className="h-[415px] flex flex-col overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.documents.title')}</h2>
          </div>
          <Button
            size="sm"
            className="gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
            onClick={() => setUploadDialogOpen(true)}
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">{t('actions.add')}</span>
          </Button>
        </div>

        <div className="relative mb-2 sm:mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
          <Input 
            placeholder={t('forms.searchPlaceholder')} 
            className="pl-7 sm:pl-8 h-8 sm:h-9 text-xs sm:text-sm" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="space-y-1.5 sm:space-y-2 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs sm:text-sm text-muted-foreground">{t('dashboard.documents.loading')}</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {searchQuery ? t('dashboard.documents.noResults') : t('dashboard.documents.noDocuments')}
              </p>
            </div>
          ) : (
            filteredDocuments.map((doc) => {
              const status = getDocumentStatus(doc);
              return (
                <div
                  key={doc.id}
                  onClick={() => handleDocumentClick(doc, status)}
                  className="flex items-center justify-between p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                    <StatusDot status={status} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-xs sm:text-sm truncate">{doc.tittel}</h3>
                      {departmentsEnabled && (doc as any).company_id !== companyId && (doc as any).companies?.navn && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
                          <Building2 className="h-2.5 w-2.5" />
                          {(doc as any).companies.navn}
                        </span>
                      )}
                      <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                        <span className="px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] sm:text-xs">
                          {doc.kategori}
                        </span>
                        <span>v{doc.versjon}</span>
                      </div>
                    </div>
                  </div>

                  {status !== "Grønn" && doc.gyldig_til && (
                    <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs flex-shrink-0">
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
                      <span className={status === "Rød" ? "text-destructive font-medium" : "text-status-yellow"}>
                        {status === "Rød" ? t('dashboard.documents.expired') : t('dashboard.documents.expiresSoon')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DocumentUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} onSuccess={fetchDocuments} />

        <DocumentDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          document={selectedDocument}
          status={selectedDocStatus}
        />
      </GlassCard>
    </>
  );
};
