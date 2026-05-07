import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Circle, ClipboardCheck, ImageIcon, FileText, ExternalLink, AlertTriangle } from "lucide-react";

type FileMode = "image" | "document" | null;

const getFileMode = (fileName: string | null | undefined, fileUrl: string | null | undefined): FileMode => {
  const source = (fileName || fileUrl || "").toLowerCase();
  const ext = source.split('.').pop()?.split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return "image";
  return "document";
};

interface ChecklistItem {
  id: string;
  text: string;
}

interface ChecklistExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistIds?: string[];
  completedIds?: string[];
  checklistId?: string;
  itemName: string;
  onComplete: (checklistId: string) => void | Promise<void>;
}

function tryParseChecklistItems(beskrivelse: string | null): ChecklistItem[] | null {
  if (!beskrivelse) return null;
  try {
    const parsed = JSON.parse(beskrivelse);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.id && parsed[0]?.text) {
      return parsed as ChecklistItem[];
    }
    return null;
  } catch {
    return null;
  }
}

export const ChecklistExecutionDialog = (props: ChecklistExecutionDialogProps) => {
  const { open, onOpenChange, itemName, onComplete, completedIds = [] } = props;
  const checklistIds: string[] = props.checklistIds ?? (props.checklistId ? [props.checklistId] : []);

  const [activeChecklistId, setActiveChecklistId] = useState<string>("");
  const [checklistTitles, setChecklistTitles] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checkedByTab, setCheckedByTab] = useState<Record<string, Set<string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  // File-based checklist state (image OR document)
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileMode, setFileMode] = useState<FileMode>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manuallyCompleted, setManuallyCompleted] = useState(false);

  const completedChecklistIds = new Set(completedIds);
  const checkedItems: Set<string> = checkedByTab[activeChecklistId] ?? new Set();

  const isFileMode = fileUrl !== null && items.length === 0;

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current && checklistIds.length > 0) {
      const firstIncomplete =
        checklistIds.find((id) => !completedChecklistIds.has(id)) ?? checklistIds[0];
      setActiveChecklistId(firstIncomplete);
      setCheckedByTab({});
      setManuallyCompleted(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Fetch titles
  useEffect(() => {
    if (!open || checklistIds.length === 0) return;
    const fetchTitles = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, tittel")
        .in("id", checklistIds);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d) => { map[d.id] = d.tittel; });
        setChecklistTitles(map);
      }
    };
    fetchTitles();
  }, [open, checklistIds.join(",")]);

  // Fetch items or file for active checklist
  useEffect(() => {
    if (!open || !activeChecklistId) return;
    const fetchData = async () => {
      setIsLoading(true);
      setFileUrl(null);
      setFileMode(null);
      setFileName(null);
      setLoadError(null);
      setManuallyCompleted(false);
      try {
        const { data, error } = await supabase
          .from("documents")
          .select("beskrivelse, fil_url, fil_navn")
          .eq("id", activeChecklistId)
          .single();
        if (error) throw error;

        const parsed = tryParseChecklistItems(data?.beskrivelse ?? null);
        if (parsed) {
          setItems(parsed);
          setFileUrl(null);
        } else if (data?.fil_url) {
          setItems([]);
          setFileName(data.fil_navn ?? null);
          const mode = getFileMode(data.fil_navn, data.fil_url);
          setFileMode(mode);

          // External URL — use directly
          if (data.fil_url.startsWith('http://') || data.fil_url.startsWith('https://')) {
            setFileUrl(data.fil_url);
          } else {
            const { data: signedData, error: signedError } = await supabase.storage
              .from("documents")
              .createSignedUrl(data.fil_url, 3600);
            if (signedError) {
              console.error("[ChecklistExecutionDialog] createSignedUrl failed:", signedError, "path:", data.fil_url);
              setLoadError("Kunne ikke laste sjekklistefilen. Sjekk at den er delt riktig, eller kontakt admin.");
            } else {
              setFileUrl(signedData?.signedUrl ?? null);
            }
          }
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error("[ChecklistExecutionDialog] fetch failed:", err);
        setItems([]);
        setLoadError("Kunne ikke laste sjekklisten. Kontakt admin.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [open, activeChecklistId]);

  const handleTabChange = (newId: string) => {
    setActiveChecklistId(newId);
  };

  const handleToggleItem = (itemId: string) => {
    setCheckedByTab((prev) => {
      const current = new Set(prev[activeChecklistId] ?? []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [activeChecklistId]: current };
    });
  };

  const allItemsChecked = isFileMode
    ? manuallyCompleted
    : items.length > 0 && checkedItems.size === items.length;
  const checkedCount = checkedItems.size;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete(activeChecklistId);
      const nowCompleted = new Set([...completedChecklistIds, activeChecklistId]);
      const nextIncomplete = checklistIds.find((id) => !nowCompleted.has(id));
      if (nextIncomplete) {
        setActiveChecklistId(nextIncomplete);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error completing:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const showTabs = checklistIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <span className="truncate">
              {showTabs
                ? itemName || "Sjekklister"
                : checklistTitles[activeChecklistId] || "Sjekkliste"}
            </span>
          </DialogTitle>
          {showTabs && (
            <p className="text-sm text-muted-foreground">
              {checklistTitles[activeChecklistId] || ""}
            </p>
          )}
          {!showTabs && itemName && (
            <p className="text-sm text-muted-foreground">{itemName}</p>
          )}
        </DialogHeader>

        {showTabs && (
          <Tabs value={activeChecklistId} onValueChange={handleTabChange}>
            <TabsList className="w-full flex-wrap h-auto gap-1">
              {checklistIds.map((id) => (
                <TabsTrigger key={id} value={id} className="flex-1 gap-1.5 text-xs whitespace-normal text-left leading-tight py-2 min-h-[2.5rem] h-auto">
                  {completedChecklistIds.has(id) && (
                    <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                  )}
                  <span className="line-clamp-2 break-words">{checklistTitles[id] || "…"}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Progress bar — only for JSON checklists */}
        {!isFileMode && !isLoading && items.length > 0 && (
          <div className="space-y-1 flex-shrink-0">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fremgang</span>
              <span className="font-medium">{checkedCount} av {totalCount}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-4" style={{ maxHeight: 'calc(90vh - 260px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Laster sjekkliste...</p>
            </div>
          ) : isFileMode ? (
            /* File-based checklist (image or document) */
            <div className="space-y-4 py-2">
              {fileMode === "image" ? (
                <div className="rounded-lg border overflow-hidden">
                  <img
                    src={fileUrl!}
                    alt={checklistTitles[activeChecklistId] || "Sjekkliste"}
                    className="w-full h-auto cursor-pointer"
                    onClick={() => window.open(fileUrl!, '_blank')}
                  />
                </div>
              ) : (
                <div className="rounded-lg border p-4 flex flex-col items-center gap-3 bg-muted/30">
                  <FileText className="w-12 h-12 text-primary" />
                  <div className="text-center">
                    <p className="font-medium text-sm">{fileName || "Sjekklistefil"}</p>
                    <p className="text-xs text-muted-foreground">Åpne dokumentet for å gjennomgå sjekklisten</p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => window.open(fileUrl!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Åpne sjekkliste
                  </Button>
                </div>
              )}
              <Button
                variant={manuallyCompleted ? "default" : "outline"}
                className="w-full gap-2"
                onClick={() => setManuallyCompleted(!manuallyCompleted)}
              >
                {manuallyCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Markert som utført
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Marker som utført
                  </>
                )}
              </Button>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-destructive font-medium">{loadError}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Ingen punkter i sjekklisten</p>
            </div>
          ) : (
            /* JSON-based checklist */
            <div className="space-y-3 py-2">
              {items.map((item, index) => {
                const isChecked = checkedItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      isChecked
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-background/50 border-border hover:bg-muted/50'
                    }`}
                    onClick={() => handleToggleItem(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleItem(item.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-center mt-0.5">
                      {isChecked ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                        {index + 1}. {item.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!allItemsChecked || isCompleting}
            className="gap-2"
          >
            {isCompleting ? (
              "Fullfører..."
            ) : allItemsChecked ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Fullfør
              </>
            ) : isFileMode ? (
              "Marker sjekklisten som utført"
            ) : (
              `Kryss av alle punkter (${checkedCount}/${totalCount})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
