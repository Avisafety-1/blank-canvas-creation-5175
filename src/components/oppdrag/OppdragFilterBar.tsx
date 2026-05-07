import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus } from "lucide-react";

interface OppdragFilterBarProps {
  filterTab: "active" | "completed";
  onFilterTabChange: (tab: "active" | "completed") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  customerFilter: string;
  onCustomerFilterChange: (value: string) => void;
  pilotFilter: string;
  onPilotFilterChange: (value: string) => void;
  droneFilter: string;
  onDroneFilterChange: (value: string) => void;
  uniqueCustomers: string[];
  uniquePilots: string[];
  uniqueDrones: string[];
  onAddMission: () => void;
}

export const OppdragFilterBar = ({
  filterTab,
  onFilterTabChange,
  searchQuery,
  onSearchChange,
  customerFilter,
  onCustomerFilterChange,
  pilotFilter,
  onPilotFilterChange,
  droneFilter,
  onDroneFilterChange,
  uniqueCustomers,
  uniquePilots,
  uniqueDrones,
  onAddMission,
}: OppdragFilterBarProps) => {
  return (
    <GlassCard className="p-3 sm:p-4 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <Tabs value={filterTab} onValueChange={(v) => onFilterTabChange(v as "active" | "completed")} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="text-xs sm:text-sm">Pågående og kommende</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">Fullførte</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={onAddMission} className="w-full sm:w-auto" size="lg">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Legg til oppdrag</span>
          <span className="sm:hidden">Nytt oppdrag</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Søk etter oppdrag..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Kunde" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle kunder</SelectItem>
            {uniqueCustomers.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pilotFilter} onValueChange={onPilotFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Pilot" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle piloter</SelectItem>
            {uniquePilots.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={droneFilter} onValueChange={onDroneFilterChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Drone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle droner</SelectItem>
            {uniqueDrones.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </GlassCard>
  );
};
