import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addToQueue } from "@/lib/offlineQueue";

interface Category {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string | null;
  flightLogId: string | null;
  onDone?: () => void;
}

type FlightPhase = "takeoff" | "in_flight" | "landing";

const PHASE_LABELS: Record<FlightPhase, string> = {
  takeoff: "Takeoff",
  in_flight: "In flight",
  landing: "Landing",
};

export const DeviationReportDialog = ({ open, onOpenChange, missionId, flightLogId, onDone }: Props) => {
  const { user, companyId } = useAuth();
  const [step, setStep] = useState<"prompt" | "select">("prompt");
  const [categories, setCategories] = useState<Category[]>([]);
  const [path, setPath] = useState<Category[]>([]); // selected path from root
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [flightPhase, setFlightPhase] = useState<FlightPhase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("prompt");
    setPath([]);
    setComment("");
    setSearch("");
    setFlightPhase(null);
    if (companyId) {
      (async () => {
        // Use RPC to fetch effective categories (handles parent inheritance via SECURITY DEFINER)
        const { data } = await (supabase as any).rpc("get_effective_deviation_categories", {
          _company_id: companyId,
        });
        setCategories(data || []);
      })();
    }
  }, [open, companyId]);

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const buildPathFor = (cat: Category): Category[] => {
    const result: Category[] = [];
    let current: Category | undefined = cat;
    while (current) {
      result.unshift(current);
      current = current.parent_id ? catById.get(current.parent_id) : undefined;
    }
    return result;
  };

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
  const visibleOptions = categories
    .filter((c) => c.parent_id === currentParentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { cat: Category; path: Category[] }[];
    return categories
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 30)
      .map((c) => ({ cat: c, path: buildPathFor(c) }))
      .sort((a, b) => a.path.map((p) => p.label).join(" › ").localeCompare(b.path.map((p) => p.label).join(" › ")));
  }, [search, categories, catById]);

  const handleClose = () => {
    onOpenChange(false);
    onDone?.();
  };

  const handleSubmit = async () => {
    if (!missionId || !companyId || !user || path.length === 0) {
      handleClose();
      return;
    }
    setSubmitting(true);
    const payload = {
      mission_id: missionId,
      flight_log_id: flightLogId,
      company_id: companyId,
      reported_by: user.id,
      category_path: path.map((p) => p.label),
      category_ids: path.map((p) => p.id),
      flight_phase: flightPhase,
      comment: comment.trim() || null,
    };

    if (!navigator.onLine) {
      addToQueue({
        table: "mission_deviation_reports",
        operation: "insert",
        data: payload,
        description: "Avviksrapport (offline)",
      });
      toast.success("Avviksrapport lagret lokalt – synkroniseres senere");
      setSubmitting(false);
      handleClose();
      return;
    }

    const { error } = await (supabase as any).from("mission_deviation_reports").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(`Kunne ikke lagre rapport: ${error.message}`);
    } else {
      toast.success("Avviksrapport lagret");
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "prompt" ? "Avviksrapport" : "Velg kategori"}
          </DialogTitle>
        </DialogHeader>

        {step === "prompt" && (
          <>
            <p className="text-sm">Ønsker du å rapportere noe fra flyturen?</p>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose}>
                Nei
              </Button>
              <Button onClick={() => setStep("select")}>Ja</Button>
            </DialogFooter>
          </>
        )}

        {step === "select" && (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk i kategorier…"
                className="pl-8 h-9"
              />
            </div>

            {search.trim() ? (
              <div className="space-y-1 max-h-60 overflow-y-auto border rounded-md p-1">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3">Ingen treff</p>
                ) : (
                  searchResults.map(({ cat, path: p }) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="w-full px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                      onClick={() => {
                        setPath(p);
                        setSearch("");
                      }}
                    >
                      <div className="font-medium">{cat.label}</div>
                      {p.length > 1 && (
                        <div className="text-xs text-muted-foreground">
                          {p.slice(0, -1).map((s) => s.label).join(" › ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                {/* Breadcrumb */}
                {path.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {path.map((p, i) => (
                      <span key={p.id} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3" />}
                        <span className="font-medium text-foreground">{p.label}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Back */}
                {path.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPath((p) => p.slice(0, -1))}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Tilbake
                  </Button>
                )}

                {/* Options */}
                {visibleOptions.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-y-auto border rounded-md p-1">
                    {visibleOptions.map((opt) => {
                      const hasChildren = categories.some((c) => c.parent_id === opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                          onClick={() => setPath((p) => [...p, opt])}
                        >
                          <span>{opt.label}</span>
                          {hasChildren && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic px-1">
                    Ingen flere underkategorier — du kan lagre rapporten nå.
                  </p>
                )}
              </>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Kommentar (valgfritt)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Beskriv hendelsen…"
                rows={3}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Kritisk fase (valgfritt)
              </label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(PHASE_LABELS) as FlightPhase[]).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={flightPhase === p ? "default" : "outline"}
                    onClick={() => setFlightPhase((cur) => (cur === p ? null : p))}
                  >
                    {PHASE_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Avbryt
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || path.length === 0}>
                {submitting ? "Lagrer…" : "Lagre rapport"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
