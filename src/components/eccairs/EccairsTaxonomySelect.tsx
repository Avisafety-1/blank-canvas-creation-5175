import { useState, useEffect } from "react";
import { useEccairsTaxonomy, useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface EccairsTaxonomySelectProps {
  valueListKey: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  valueIdPrefix?: string;
  /** Override the displayed label for the selected value (useful when DB description is ambiguous) */
  fixedLabel?: string;
}

export function EccairsTaxonomySelect({
  valueListKey,
  value,
  onChange,
  placeholder = "Velg...",
  disabled = false,
  valueIdPrefix = "",
  fixedLabel,
}: EccairsTaxonomySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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
    open, // Only fetch when popover is open
    valueIdPrefix
  );

  // Separate query for selected item label
  const { data: selectedItem, isLoading: isLoadingSelected } = useEccairsTaxonomyItem(
    valueListKey,
    value,
    !!value
  );

  const isLoading = isLoadingItems || (!!value && isLoadingSelected);

  if (isLoading && !open && !selectedItem) {
    return <Skeleton className="h-10 w-full" />;
  }

  const isVL453 = valueListKey === 'VL453';

  const getDisplayLabel = (id: string, description?: string): string => {
    if (isVL453) {
      if (id === '2133') return 'CAA Norway';
      return description ? `${description} (${id})` : `CAA (${id})`;
    }
    return description || `ID: ${id}`;
  };

  const selectedDisplay = value
    ? (isVL453
        ? getDisplayLabel(value, selectedItem?.value_description)
        : (fixedLabel || selectedItem?.value_description || `ID: ${value}`))
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">{selectedDisplay}</span>
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
                  {(items || []).map((item) => (
                    <CommandItem
                      key={item.value_id}
                      value={`${item.value_id}__${item.value_description}`}
                      onSelect={(currentValue) => {
                        // cmdk lowercases value, so we use the original item.value_id
                        onChange(item.value_id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === item.value_id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {getDisplayLabel(item.value_id, item.value_description)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
