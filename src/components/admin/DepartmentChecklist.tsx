import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DepartmentItem {
  id: string;
  navn: string;
}

interface DepartmentChecklistProps {
  departments: DepartmentItem[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  allLabel?: string;
  className?: string;
}

export const DepartmentChecklist = ({
  departments,
  selectedIds,
  onToggle,
  allSelected,
  onToggleAll,
  allLabel = "Alle avdelinger",
  className,
}: DepartmentChecklistProps) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase();
    return departments.filter((d) => d.navn.toLowerCase().includes(q));
  }, [departments, search]);

  const showSearch = departments.length > 8;

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-xs cursor-pointer mb-1.5 font-medium">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="rounded border-border"
        />
        <strong>{allLabel}</strong>
      </label>

      {!allSelected && (
        <>
          {showSearch && (
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Søk avdeling..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-6 pl-6 text-xs"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <ScrollArea className="max-h-[200px]">
            <div className={departments.length > 6 ? "grid grid-cols-2 gap-x-2 gap-y-0.5" : "space-y-0.5"}>
              {filtered.map((dept) => (
                <label key={dept.id} className="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(dept.id)}
                    onChange={(e) => onToggle(dept.id, e.target.checked)}
                    className="rounded border-border flex-shrink-0"
                  />
                  <span className="truncate">{dept.navn}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-2 py-1">Ingen treff</p>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
};
