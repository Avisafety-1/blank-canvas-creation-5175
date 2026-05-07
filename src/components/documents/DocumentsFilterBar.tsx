import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { DocumentCategory, DocumentSortOption, DocumentStatusFilter } from "@/pages/Documents";

interface DocumentsFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategories: DocumentCategory[];
  onCategoriesChange: (categories: DocumentCategory[]) => void;
  selectedStatuses: DocumentStatusFilter[];
  onStatusesChange: (statuses: DocumentStatusFilter[]) => void;
  sortOption: DocumentSortOption;
  onSortChange: (option: DocumentSortOption) => void;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "regelverk", label: "Regelverk" },
  { value: "prosedyrer", label: "Prosedyrer" },
  { value: "sjekklister", label: "Sjekklister" },
  { value: "rapporter", label: "Rapporter" },
  { value: "nettsider", label: "Nettsider" },
  { value: "oppdrag", label: "Oppdrag" },
  { value: "loggbok", label: "Loggbok" },
  { value: "kml-kmz", label: "KML/KMZ" },
  { value: "dokumentstyring", label: "Dokumentstyring" },
  { value: "risikovurderinger", label: "Risikovurderinger" },
  { value: "operasjonsmanual", label: "Operasjonsmanual" },
  { value: "annet", label: "Annet" },
];

const STATUS_FILTERS: { value: DocumentStatusFilter; label: string; dot: string }[] = [
  { value: "expired", label: "Utgått", dot: "bg-destructive" },
  { value: "expiring_soon", label: "Utgår snart", dot: "bg-yellow-500" },
  { value: "valid", label: "Gyldig", dot: "bg-green-500" },
  { value: "no_expiry", label: "Uten utløp", dot: "bg-muted-foreground" },
];

const SORT_OPTIONS: { value: DocumentSortOption; label: string }[] = [
  { value: "newest", label: "Nyeste først" },
  { value: "oldest", label: "Eldste først" },
  { value: "expiry", label: "Utgår snart" },
  { value: "alpha_asc", label: "Alfabetisk A–Å" },
  { value: "alpha_desc", label: "Alfabetisk Å–A" },
];

const DocumentsFilterBar = ({
  searchQuery,
  onSearchChange,
  selectedCategories,
  onCategoriesChange,
  selectedStatuses,
  onStatusesChange,
  sortOption,
  onSortChange,
}: DocumentsFilterBarProps) => {
  const toggleCategory = (category: DocumentCategory) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  const toggleStatus = (status: DocumentStatusFilter) => {
    if (selectedStatuses.includes(status)) {
      onStatusesChange(selectedStatuses.filter(s => s !== status));
    } else {
      onStatusesChange([...selectedStatuses, status]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search + Sort row */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Søk i dokumenter..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sortOption} onValueChange={(v) => onSortChange(v as DocumentSortOption)}>
          <SelectTrigger className="w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category filter badges */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(category => (
          <Badge
            key={category.value}
            variant={selectedCategories.includes(category.value) ? "default" : "outline"}
            onClick={() => toggleCategory(category.value)}
            className={selectedCategories.includes(category.value) ? "cursor-pointer" : "cursor-pointer bg-secondary"}
          >
            {category.label}
          </Badge>
        ))}
      </div>
    </div>
  );
};

export default DocumentsFilterBar;
