import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Person {
  id: string;
  full_name?: string | null;
}

interface SearchablePersonSelectProps {
  persons: Person[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}

export const SearchablePersonSelect = ({
  persons,
  value,
  onValueChange,
  placeholder = "Velg person...",
  searchPlaceholder = "Søk person...",
  emptyText = "Ingen personer funnet.",
  allowNone = false,
  noneLabel = "Ingen",
  disabled = false,
  className,
}: SearchablePersonSelectProps) => {
  const [open, setOpen] = useState(false);

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === value),
    [persons, value]
  );

  const displayLabel = value
    ? selectedPerson?.full_name || "Ukjent bruker"
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  value={noneLabel}
                  onSelect={() => {
                    onValueChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")}
                  />
                  {noneLabel}
                </CommandItem>
              )}
              {persons.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.full_name || "Ukjent"}
                  onSelect={() => {
                    onValueChange(person.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === person.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {person.full_name || "Ukjent bruker"}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
