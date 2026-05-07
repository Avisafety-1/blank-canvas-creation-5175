import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Main categories for VL390 - Event Types
const EVENT_TYPE_CATEGORIES = [
  { value_id: "99012035", label: "Any Other Events" },
  { value_id: "3000000", label: "Consequential Events" },
  { value_id: "1000000", label: "Equipment" },
  { value_id: "99010158", label: "Operational" },
  { value_id: "99010164", label: "Organisational" },
  { value_id: "99010159", label: "Personnel" },
  { value_id: "99000000", label: "Unknown" },
];

interface EccairsEventTypeSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function EccairsEventTypeSelect({
  value,
  onChange,
  placeholder = "Velg hendelsestype...",
  disabled = false,
}: EccairsEventTypeSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedItem = EVENT_TYPE_CATEGORIES.find(item => item.value_id === value);

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
          <span className="truncate">
            {selectedItem?.label || (value ? `ID: ${value}` : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {EVENT_TYPE_CATEGORIES.map((item) => (
                <CommandItem
                  key={item.value_id}
                  value={item.value_id}
                  onSelect={() => {
                    onChange(item.value_id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.value_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
