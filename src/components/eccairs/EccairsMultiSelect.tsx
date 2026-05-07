import { useState, useEffect } from "react";
import { useEccairsTaxonomy, useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EccairsMultiSelectProps {
  valueListKey: string;
  value: string[] | null; // Array of value IDs
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
}

// Component to display a single selected item with its label
function SelectedItemBadge({ 
  valueListKey, 
  valueId, 
  onRemove 
}: { 
  valueListKey: string; 
  valueId: string; 
  onRemove: () => void;
}) {
  const { data: item, isLoading } = useEccairsTaxonomyItem(valueListKey, valueId, true);
  
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {isLoading ? (
        <span className="animate-pulse">...</span>
      ) : (
        <span className="truncate max-w-[150px]">
          {item?.value_description || `ID: ${valueId}`}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

export function EccairsMultiSelect({
  valueListKey,
  value,
  onChange,
  placeholder = "Velg...",
  disabled = false,
  maxItems = 5,
}: EccairsMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const selectedValues = value || [];

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-side search query
  const { data: items, isLoading: isLoadingItems } = useEccairsTaxonomy(
    valueListKey, 
    debouncedSearch, 
    open
  );

  const handleSelect = (itemId: string) => {
    if (selectedValues.includes(itemId)) {
      // Remove if already selected
      onChange(selectedValues.filter(v => v !== itemId));
    } else if (selectedValues.length < maxItems) {
      // Add if not at max
      onChange([...selectedValues, itemId]);
    }
  };

  const handleRemove = (itemId: string) => {
    onChange(selectedValues.filter(v => v !== itemId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full min-h-10 h-auto justify-between font-normal"
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedValues.length > 0 ? (
              selectedValues.map((id) => (
                <SelectedItemBadge
                  key={id}
                  valueListKey={valueListKey}
                  valueId={id}
                  onRemove={() => handleRemove(id)}
                />
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3" role="search">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk..."
              className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <CommandList>
            {isLoadingItems ? (
              <div className="p-4 text-sm text-muted-foreground">Søker...</div>
            ) : (
              <>
                <CommandEmpty>Ingen treff</CommandEmpty>
                <CommandGroup>
                  {(items || []).map((item) => {
                    const isSelected = selectedValues.includes(item.value_id);
                    return (
                      <CommandItem
                        key={item.value_id}
                        value={`${item.value_id}__${item.value_description}`}
                        onSelect={() => handleSelect(item.value_id)}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {item.value_description}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
