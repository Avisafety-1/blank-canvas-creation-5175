import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { Search, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface MissionOption {
  id: string;
  tittel: string;
  tidspunkt: string;
  status: string;
  lokasjon: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
  loading: boolean;
  results: MissionOption[];
  onSelect: (m: MissionOption) => void;
  triggerLabel: string;
  limit: number;
  onLoadMore: () => void;
}

export const ManualMissionPicker = ({ open, onOpenChange, search, onSearchChange, loading, results, onSelect, triggerLabel, limit, onLoadMore }: Props) => {
  const visible = results.slice(0, limit);
  const hasMore = results.length > visible.length;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs gap-1.5">
          <Search className="w-3 h-3" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Søk etter oppdrag..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Søker...
              </div>
            )}
            {!loading && results.length === 0 && (
              <CommandEmpty>Ingen oppdrag funnet</CommandEmpty>
            )}
            {!loading && visible.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => onSelect(m)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="font-medium text-sm">{m.tittel}</span>
                <span className="text-xs text-muted-foreground">
                  {m.tidspunkt ? format(new Date(m.tidspunkt), 'dd.MM.yyyy HH:mm') : 'Ukjent dato'}
                  {m.lokasjon ? ` — ${m.lokasjon}` : ''}
                  {m.status ? ` · ${m.status}` : ''}
                </span>
              </CommandItem>
            ))}
            {!loading && hasMore && (
              <div className="p-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={(e) => { e.preventDefault(); onLoadMore(); }}
                >
                  Last inn flere ({results.length - visible.length} igjen)
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
