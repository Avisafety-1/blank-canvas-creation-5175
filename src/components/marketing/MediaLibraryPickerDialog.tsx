import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Image, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeIds?: string[];
  onSelect: (mediaIds: string[]) => void;
}

export const MediaLibraryPickerDialog = ({
  open,
  onOpenChange,
  excludeIds = [],
  onSelect,
}: Props) => {
  const { companyId } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: media = [], isLoading } = useQuery({
    queryKey: ["marketing-media-library", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_media")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const filtered = media.filter(
    (m: any) =>
      !excludeIds.includes(m.id) &&
      (m.title?.toLowerCase().includes(search.toLowerCase()) ||
        m.source_type?.toLowerCase().includes(search.toLowerCase()) ||
        !search)
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onSelect(selectedIds);
    setSelectedIds([]);
    setSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Velg fra mediebiblioteket
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk etter bilder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex-1 min-h-[300px] max-h-[400px] border rounded-lg overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Image className="h-8 w-8 mb-2 opacity-50" />
              <p>Ingen bilder funnet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
              {filtered.map((item: any) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`relative cursor-pointer rounded-lg border overflow-hidden transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => toggle(item.id)}
                  >
                    <div className="aspect-square bg-muted/30">
                      <img
                        src={item.file_url}
                        alt={item.title || "Media"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(item.id)}
                        className="bg-background/80"
                      />
                    </div>
                    <div className="p-1.5">
                      <p className="text-xs font-medium text-foreground truncate">
                        {item.title || "Uten tittel"}
                      </p>
                      <div className="flex gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {item.source_type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {selectedIds.length} bilde(r) valgt
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.length === 0}>
            Legg til ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
