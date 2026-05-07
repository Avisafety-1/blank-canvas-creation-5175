import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, FileText, Pencil, X, FolderPlus, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentDetailDialog } from "@/components/dashboard/DocumentDetailDialog";
import { Document } from "@/types";

interface FolderDetailDialogProps {
  folder: { id: string; name: string; company_id?: string; inherited?: boolean } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  isAdmin: boolean;
  canManage?: boolean;
}

interface FolderTab {
  id: string;
  name: string;
  sort_order: number;
}

interface FolderDoc {
  id: string;
  document_id: string;
  tab_id: string | null;
  tittel: string;
  kategori: string;
}

export const FolderDetailDialog = ({ folder, open, onOpenChange, onRefresh, isAdmin, canManage }: FolderDetailDialogProps) => {
  const { companyId } = useAuth();
  const canManageFolder = canManage ?? (isAdmin && !folder?.inherited);
  const [folderDocs, setFolderDocs] = useState<FolderDoc[]>([]);
  const [tabs, setTabs] = useState<FolderTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null); // null = "Alle"
  const [showPicker, setShowPicker] = useState(false);
  const [allDocs, setAllDocs] = useState<{ id: string; tittel: string; kategori: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchPicker, setSearchPicker] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [docDetailOpen, setDocDetailOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [showNewTab, setShowNewTab] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);

  const getDocumentStatus = (doc: { gyldig_til?: string | null; varsel_dager_for_utløp?: number | null }): string => {
    if (!doc.gyldig_til) return "Grønn";
    const today = new Date();
    const expiryDate = new Date(doc.gyldig_til);
    const daysUntil = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return "Rød";
    if (daysUntil <= (doc.varsel_dager_for_utløp || 30)) return "Gul";
    return "Grønn";
  };

  const handleDocClick = async (documentId: string) => {
    const { data } = await supabase.from("documents").select("*").eq("id", documentId).single();
    if (data) {
      const doc: Document = {
        id: data.id,
        tittel: data.tittel,
        kategori: data.kategori as any,
        versjon: data.versjon || "1.0",
        varsel_dager_for_utløp: data.varsel_dager_for_utløp || 30,
        synlighet: (data.global_visibility ? "Alle" : "Internt") as any,
        sist_endret: new Date(data.oppdatert_dato || data.opprettet_dato || new Date()),
        gyldig_til: data.gyldig_til ? new Date(data.gyldig_til) : undefined,
        utsteder: undefined,
        fil_url: data.fil_url || undefined,
        fil_navn: data.fil_navn || undefined,
        nettside_url: data.nettside_url || undefined,
        beskrivelse: data.beskrivelse,
        merknader: undefined,
        company_id: data.company_id,
        visible_to_children: data.visible_to_children ?? false,
        global_visibility: data.global_visibility ?? false,
      };
      setSelectedDocument(doc);
      setDocDetailOpen(true);
    }
  };

  const loadFolderDocs = async () => {
    if (!folder) return;
    const { data } = await supabase
      .from("document_folder_items")
      .select("id, document_id, tab_id, documents:document_id(tittel, kategori)")
      .eq("folder_id", folder.id);
    setFolderDocs(
      (data || []).map((d: any) => ({
        id: d.id,
        document_id: d.document_id,
        tab_id: d.tab_id,
        tittel: d.documents?.tittel || "Ukjent",
        kategori: d.documents?.kategori || "",
      }))
    );
  };

  const loadTabs = async () => {
    if (!folder) return;
    const { data } = await supabase
      .from("document_folder_tabs")
      .select("id, name, sort_order")
      .eq("folder_id", folder.id)
      .order("sort_order", { ascending: true });
    setTabs(data || []);
  };

  const loadFolderMeta = async () => {
    if (!folder) return;
    const { data } = await supabase
      .from("document_folders")
      .select("visible_to_children")
      .eq("id", folder.id)
      .single();
    if (data) setVisibleToChildren(data.visible_to_children ?? false);
  };

  const checkHasChildren = async () => {
    if (!companyId) return;
    const { count } = await supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("parent_company_id", companyId);
    setHasChildren((count ?? 0) > 0);
  };

  useEffect(() => {
    if (open && folder) {
      loadFolderDocs();
      loadTabs();
      loadFolderMeta();
      checkHasChildren();
      setShowPicker(false);
      setEditing(false);
      setActiveTab(null);
      setShowNewTab(false);
      setEditingTabId(null);
    }
  }, [open, folder]);

  const openPicker = async () => {
    const { data } = await supabase.from("documents").select("id, tittel, kategori").order("tittel");
    setAllDocs(data || []);
    // Pre-select docs already in this tab (or all if "Alle" tab)
    const existing = new Set(
      folderDocs
        .filter((d) => activeTab === null || d.tab_id === activeTab)
        .map((d) => d.document_id)
    );
    setSelectedIds(existing);
    setShowPicker(true);
    setSearchPicker("");
  };

  const toggleDoc = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const savePicker = async () => {
    if (!folder) return;
    const tabFilter = activeTab;
    const relevantDocs = folderDocs.filter((d) =>
      tabFilter === null ? true : d.tab_id === tabFilter
    );
    const existingIds = new Set(relevantDocs.map((d) => d.document_id));
    const toAdd = [...selectedIds].filter((id) => !existingIds.has(id));
    const toRemove = relevantDocs.filter((d) => !selectedIds.has(d.document_id));

    if (toRemove.length) {
      await supabase.from("document_folder_items").delete().in("id", toRemove.map((d) => d.id));
    }
    if (toAdd.length) {
      await supabase.from("document_folder_items").insert(
        toAdd.map((document_id) => ({
          folder_id: folder.id,
          document_id,
          tab_id: tabFilter,
        }))
      );
    }
    toast.success("Mappeinnhold oppdatert");
    setShowPicker(false);
    loadFolderDocs();
    onRefresh();
  };

  const removeDoc = async (itemId: string) => {
    await supabase.from("document_folder_items").delete().eq("id", itemId);
    toast.success("Dokument fjernet fra mappen");
    loadFolderDocs();
    onRefresh();
  };

  const deleteFolder = async () => {
    if (!folder) return;
    const { error } = await supabase.from("document_folders").delete().eq("id", folder.id);
    if (error) { toast.error("Kunne ikke slette mappen"); return; }
    toast.success("Mappe slettet");
    onOpenChange(false);
    onRefresh();
  };

  const saveRename = async () => {
    if (!folder || !editName.trim()) return;
    await supabase.from("document_folders").update({ name: editName.trim() }).eq("id", folder.id);
    toast.success("Mappenavn oppdatert");
    setEditing(false);
    onRefresh();
  };

  const toggleVisibleToChildren = async (checked: boolean) => {
    if (!folder) return;
    setVisibleToChildren(checked);
    await supabase.from("document_folders").update({ visible_to_children: checked }).eq("id", folder.id);
    toast.success(checked ? "Mappen er nå synlig for avdelinger" : "Mappen er nå kun synlig for dette selskapet");
    onRefresh();
  };

  // Tab management
  const createTab = async () => {
    if (!folder || !newTabName.trim()) return;
    const nextOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.sort_order)) + 1 : 0;
    const { error } = await supabase.from("document_folder_tabs").insert({
      folder_id: folder.id,
      name: newTabName.trim(),
      sort_order: nextOrder,
    });
    if (error) { toast.error("Kunne ikke opprette fane"); return; }
    toast.success("Fane opprettet");
    setNewTabName("");
    setShowNewTab(false);
    loadTabs();
  };

  const renameTab = async () => {
    if (!editingTabId || !editingTabName.trim()) return;
    await supabase.from("document_folder_tabs").update({ name: editingTabName.trim() }).eq("id", editingTabId);
    toast.success("Fanenavn oppdatert");
    setEditingTabId(null);
    loadTabs();
  };

  const deleteTab = async (tabId: string) => {
    // Documents in this tab will have tab_id set to null (ON DELETE SET NULL)
    await supabase.from("document_folder_tabs").delete().eq("id", tabId);
    toast.success("Fane slettet");
    if (activeTab === tabId) setActiveTab(null);
    loadTabs();
    loadFolderDocs();
  };

  const filteredPickerDocs = allDocs.filter(
    (d) => !searchPicker || d.tittel.toLowerCase().includes(searchPicker.toLowerCase())
  );

  const visibleDocs = activeTab === null
    ? folderDocs
    : folderDocs.filter((d) => d.tab_id === activeTab);

  if (!folder) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[85vh] flex flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-lg font-semibold" onKeyDown={(e) => e.key === "Enter" && saveRename()} autoFocus />
              <Button size="sm" onClick={saveRename}>Lagre</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DialogTitle>{folder.name}</DialogTitle>
              {canManageFolder && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditName(folder.name); setEditing(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          <DialogDescription>{folderDocs.length} dokument{folderDocs.length !== 1 ? "er" : ""}</DialogDescription>
        </DialogHeader>

        {/* Tabs bar */}
        {(tabs.length > 0 || canManageFolder) && !showPicker && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border">
            <button
              onClick={() => setActiveTab(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors ${
                activeTab === null ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
              }`}
            >
              Alle
            </button>
            {tabs.map((tab) => (
              <div key={tab.id} className="flex items-center group">
                {editingTabId === tab.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editingTabName}
                      onChange={(e) => setEditingTabName(e.target.value)}
                      className="h-7 text-xs w-24"
                      onKeyDown={(e) => e.key === "Enter" && renameTab()}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={renameTab}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingTabId(null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors ${
                        activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
                      }`}
                    >
                      {tab.name}
                    </button>
                    {canManageFolder && (
                      <div className="hidden group-hover:flex items-center">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { setEditingTabId(tab.id); setEditingTabName(tab.name); }}>
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => deleteTab(tab.id)}>
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {canManageFolder && !showNewTab && (
              <button onClick={() => setShowNewTab(true)} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            {canManageFolder && showNewTab && (
              <div className="flex items-center gap-1">
                <Input
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  placeholder="Fanenavn..."
                  className="h-7 text-xs w-24"
                  onKeyDown={(e) => e.key === "Enter" && createTab()}
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={createTab}>OK</Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowNewTab(false)}><X className="h-3 w-3" /></Button>
              </div>
            )}
          </div>
        )}

        {showPicker ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Input placeholder="Søk dokumenter..." value={searchPicker} onChange={(e) => setSearchPicker(e.target.value)} />
            <div className="flex-1 min-h-[200px] overflow-y-auto border rounded-md p-2">
              {filteredPickerDocs.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-accent/10 rounded cursor-pointer">
                  <Checkbox checked={selectedIds.has(doc.id)} onCheckedChange={() => toggleDoc(doc.id)} />
                  <span className="text-sm truncate">{doc.tittel}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{doc.kategori}</span>
                </label>
              ))}
              {filteredPickerDocs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Ingen dokumenter funnet</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowPicker(false)}>Avbryt</Button>
              <Button size="sm" onClick={savePicker}>Lagre endringer</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {visibleDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {activeTab ? "Ingen dokumenter i denne fanen" : "Ingen dokumenter i denne mappen"}
                </p>
              ) : (
                <div className="space-y-1">
                  {visibleDocs.map((doc) => (
                    <div key={doc.id} className="flex items-start gap-2 p-2 rounded hover:bg-accent/10 cursor-pointer" onClick={() => handleDocClick(doc.document_id)}>
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-sm flex-1 break-words leading-snug">{doc.tittel}</span>
                      {canManageFolder && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {canManageFolder && (
              <div className="space-y-3 pt-2 border-t">
                {hasChildren && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={visibleToChildren} onCheckedChange={toggleVisibleToChildren} />
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-foreground">Synlig for alle avdelinger</span>
                  </label>
                )}
                <div className="flex gap-2 justify-between">
                  <Button variant="destructive" size="sm" onClick={deleteFolder}>
                    <Trash2 className="h-4 w-4 mr-1" /> Slett mappe
                  </Button>
                  <Button size="sm" onClick={openPicker}>
                    <Plus className="h-4 w-4 mr-1" /> Legg til dokumenter
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>

    <DocumentDetailDialog
      open={docDetailOpen}
      onOpenChange={setDocDetailOpen}
      document={selectedDocument}
      status={selectedDocument ? getDocumentStatus(selectedDocument as any) : "Grønn"}
    />
    </>
  );
};
