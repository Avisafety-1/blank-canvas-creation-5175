import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FolderOpen, Building2 } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { FolderDetailDialog } from "./FolderDetailDialog";

interface FolderGridProps {
  isAdmin: boolean;
  companyId: string | null;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}

interface Folder {
  id: string;
  name: string;
  company_id: string;
  item_count: number;
  inherited: boolean;
}

const FolderGrid = ({ isAdmin, companyId, createOpen, onCreateOpenChange }: FolderGridProps) => {
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { companyId: userCompanyId } = useAuth();

  const { data: folders, refetch } = useQuery({
    queryKey: ["document-folders", companyId],
    queryFn: async () => {
      const { data: foldersData, error: foldersError } = await supabase
        .from("document_folders")
        .select("id, name, company_id, visible_to_children")
        .order("created_at", { ascending: true });

      if (foldersError) {
        console.error("FolderGrid: failed to load folders", foldersError);
        throw foldersError;
      }
      if (!foldersData?.length) return [];

      const { data: items } = await supabase
        .from("document_folder_items")
        .select("folder_id");
      const countMap = new Map<string, number>();
      (items || []).forEach((item: any) => {
        countMap.set(item.folder_id, (countMap.get(item.folder_id) || 0) + 1);
      });

      return foldersData.map((f: any) => ({
        id: f.id,
        name: f.name,
        company_id: f.company_id,
        item_count: countMap.get(f.id) || 0,
        inherited: f.company_id !== userCompanyId,
      })) as Folder[];
    },
    enabled: !!companyId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  if (!folders?.length && !isAdmin) return null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {folders?.map((folder) => (
          <button
            key={folder.id}
            onClick={() => { setSelectedFolder(folder); setDetailOpen(true); }}
            className="rounded-lg border border-glass bg-card/80 backdrop-blur-md flex items-center gap-3 hover:bg-accent/15 transition-colors cursor-pointer p-3 sm:p-4 sm:flex-col sm:items-center sm:justify-center sm:aspect-square"
          >
            <div className="relative shrink-0">
              <FolderOpen className="h-7 w-7 sm:h-9 sm:w-9 text-primary" />
              {folder.inherited && (
                <Building2 className="absolute -top-1 -right-1 h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col sm:items-center min-w-0">
              <span className="text-sm sm:text-xs font-medium text-foreground text-left sm:text-center line-clamp-2 leading-tight">{folder.name}</span>
              <span className="text-[11px] sm:text-[10px] text-muted-foreground">{folder.item_count} dok.</span>
            </div>
          </button>
        ))}
      </div>

      <CreateFolderDialog open={createOpen} onOpenChange={onCreateOpenChange} onSuccess={refetch} />
      <FolderDetailDialog
        folder={selectedFolder}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={refetch}
        isAdmin={isAdmin}
        canManage={isAdmin && !selectedFolder?.inherited}
      />
    </>
  );
};

export default FolderGrid;
