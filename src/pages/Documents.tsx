import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks, FolderPlus } from "lucide-react";
import DocumentsFilterBar from "@/components/documents/DocumentsFilterBar";
import DocumentsList from "@/components/documents/DocumentsList";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { CreateChecklistDialog } from "@/components/documents/CreateChecklistDialog";
import { toast } from "sonner";
import droneBackground from "@/assets/drone-background.png";
import FolderGrid from "@/components/documents/FolderGrid";

export type DocumentCategory = "regelverk" | "prosedyrer" | "sjekklister" | "rapporter" | "nettsider" | "oppdrag" | "loggbok" | "kml-kmz" | "dokumentstyring" | "risikovurderinger" | "operasjonsmanual" | "annet";
export type DocumentSortOption = "newest" | "oldest" | "expiry" | "alpha_asc" | "alpha_desc";
export type DocumentStatusFilter = "expired" | "expiring_soon" | "valid" | "no_expiry";

export interface Document {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  kategori: string;
  gyldig_til: string | null;
  varsel_dager_for_utløp: number | null;
  fil_url: string | null;
  fil_navn: string | null;
  nettside_url: string | null;
  opprettet_dato: string;
  oppdatert_dato: string | null;
  opprettet_av: string | null;
  company_id?: string | null;
  company_name?: string | null;
  visible_to_children?: boolean | null;
  global_visibility?: boolean | null;
}

const getDocumentStatus = (doc: Document): DocumentStatusFilter => {
  if (!doc.gyldig_til) return "no_expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(doc.gyldig_til);
  expiryDate.setHours(0, 0, 0, 0);
  if (expiryDate < today) return "expired";
  const warningDays = doc.varsel_dager_for_utløp ?? 30;
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + warningDays);
  if (expiryDate <= warningDate) return "expiring_soon";
  return "valid";
};

const Documents = () => {
  const { user, loading, companyId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<DocumentCategory[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<DocumentStatusFilter[]>([]);
  const [sortOption, setSortOption] = useState<DocumentSortOption>("newest");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createChecklistOpen, setCreateChecklistOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const { departmentsEnabled } = useAuth();

  const { data: documents, isLoading, refetch } = useQuery({
    queryKey: ["documents", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*, companies:company_id(id, navn)").order("opprettet_dato", { ascending: false });
      if (error) throw error;
      return (data || []).map((d: any) => ({ ...d, company_name: d.companies?.navn || null })) as (Document & { company_name?: string })[];
    },
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const channel = supabase.channel('documents-page-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'documents'
    }, () => {
      refetch();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = searchQuery === "" ||
      doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.beskrivelse?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.fil_url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.nettside_url?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategories.length === 0 ||
      selectedCategories.includes(doc.kategori.toLowerCase().trim() as DocumentCategory);

    const matchesStatus = selectedStatuses.length === 0 ||
      selectedStatuses.includes(getDocumentStatus(doc));

    return matchesSearch && matchesCategory && matchesStatus;
  })?.sort((a, b) => {
    switch (sortOption) {
      case "oldest":
        return new Date(a.opprettet_dato).getTime() - new Date(b.opprettet_dato).getTime();
      case "expiry":
        if (!a.gyldig_til && !b.gyldig_til) return 0;
        if (!a.gyldig_til) return 1;
        if (!b.gyldig_til) return -1;
        return new Date(a.gyldig_til).getTime() - new Date(b.gyldig_til).getTime();
      case "alpha_asc":
        return a.tittel.localeCompare(b.tittel, "nb");
      case "alpha_desc":
        return b.tittel.localeCompare(a.tittel, "nb");
      case "newest":
      default:
        return new Date(b.opprettet_dato).getTime() - new Date(a.opprettet_dato).getTime();
    }
  });

  const handleOpenDocument = (document: Document) => {
    setSelectedDocument(document);
    setIsCreating(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
    setIsCreating(false);
  };

  const handleSaveSuccess = () => {
    refetch();
    handleCloseModal();
    toast.success(isCreating ? "Dokument opprettet" : "Dokument oppdatert");
  };

  const handleDeleteSuccess = () => {
    refetch();
    handleCloseModal();
    toast.success("Dokument slettet");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>;
  }

  return <div className="min-h-screen relative w-full overflow-x-hidden">
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat"
      }} />
      <div className="relative z-10 w-full">
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-4xl font-bold text-foreground">Dokumenter</h1>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button onClick={() => setCreateChecklistOpen(true)} variant="secondary" size="default">
                    <ListChecks className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Ny sjekkliste</span>
                  </Button>
                  <Button onClick={() => setCreateFolderOpen(true)} variant="secondary" size="default">
                    <FolderPlus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Ny mappe</span>
                  </Button>
                  <Button onClick={() => setCreateDialogOpen(true)} size="default">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Nytt dokument</span>
                  </Button>
                </div>
              )}
            </div>

            <FolderGrid isAdmin={isAdmin} companyId={companyId} createOpen={createFolderOpen} onCreateOpenChange={setCreateFolderOpen} />

            <DocumentsFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategories={selectedCategories}
              onCategoriesChange={setSelectedCategories}
              selectedStatuses={selectedStatuses}
              onStatusesChange={setSelectedStatuses}
              sortOption={sortOption}
              onSortChange={setSortOption}
            />

            <DocumentsList
              documents={filteredDocuments || []}
              isLoading={isLoading}
              onDocumentClick={handleOpenDocument}
              getDocumentStatus={getDocumentStatus}
            />

            <DocumentUploadDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={() => {
              refetch();
              toast.success("Dokument opprettet");
            }} />

            <CreateChecklistDialog
              open={createChecklistOpen}
              onOpenChange={setCreateChecklistOpen}
              onSuccess={() => { refetch(); }}
            />

            <DocumentCardModal
              document={selectedDocument}
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              onSaveSuccess={handleSaveSuccess}
              onDeleteSuccess={handleDeleteSuccess}
              isAdmin={isAdmin}
              isCreating={isCreating}
              isOwnerCompany={isCreating || selectedDocument?.company_id === companyId}
            />
          </div>
        </main>
      </div>
    </div>;
};

export default Documents;
