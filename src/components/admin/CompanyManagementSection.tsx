import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CompanyManagementDialog } from "./CompanyManagementDialog";
import { Plus, Pencil, Building2, Mail, Phone, MapPin, Hash, Plane, Radio, ChevronDown, BarChart3, Loader2, CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

interface Company {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype: string | null;
  created_at: string;
  updated_at: string;
  eccairs_enabled: boolean | null;
  dji_flightlog_enabled: boolean;
  dji_auto_sync_enabled: boolean;
  dji_sync_from_date: string | null;
  dronetag_enabled: boolean;
  ardupilot_enabled: boolean;
  parent_company_id: string | null;
}

// Mobile expandable company card component
const MobileCompanyCard = ({
  company,
  onToggleActive,
  onToggleEccairs,
  onToggleDji,
  onToggleAutoSync,
  onToggleDronetag,
  onToggleArdupilot,
  onSyncDateChange,
  onEdit,
  onDelete,
}: {
  company: Company;
  onToggleActive: (company: Company) => void;
  onToggleEccairs: (company: Company) => void;
  onToggleDji: (company: Company) => void;
  onToggleAutoSync: (company: Company) => void;
  onToggleDronetag: (company: Company) => void;
  onToggleArdupilot: (company: Company) => void;
  onSyncDateChange: (company: Company, date: Date | undefined) => void;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger className="w-full p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">{company.navn}</span>
            <div className="flex gap-1 flex-shrink-0">
              <Badge variant={company.aktiv ? "default" : "secondary"} className="text-xs">
                {company.aktiv ? "Aktiv" : "Inaktiv"}
              </Badge>
              {company.eccairs_enabled && (
                <Badge variant="outline" className="text-xs">ECCAIRS</Badge>
              )}
              {company.dji_flightlog_enabled && (
                <Badge variant="outline" className="text-xs">DJI</Badge>
              )}
              {company.ardupilot_enabled && (
                <Badge variant="outline" className="text-xs">ArduPilot</Badge>
              )}
              {company.dronetag_enabled && (
                <Badge variant="outline" className="text-xs">DroneTag</Badge>
              )}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t pt-3">
            {/* Type */}
            <div className="flex items-center gap-2 text-sm">
              {company.selskapstype === 'flyselskap' ? (
                <>
                  <Plane className="h-3 w-3 text-muted-foreground" />
                  <span>Flyselskap</span>
                </>
              ) : (
                <>
                  <Radio className="h-3 w-3 text-muted-foreground" />
                  <span>Droneoperatør</span>
                </>
              )}
            </div>

            {/* Contact info */}
            <div className="space-y-1 text-sm">
              {company.org_nummer && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  <span>{company.org_nummer}</span>
                </div>
              )}
              {company.kontakt_epost && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{company.kontakt_epost}</span>
                </div>
              )}
              {company.kontakt_telefon && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{company.kontakt_telefon}</span>
                </div>
              )}
              {company.adresse && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{company.adresse}</span>
                </div>
              )}
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={company.aktiv}
                  onCheckedChange={() => onToggleActive(company)}
                />
                <Label className="text-sm">Status</Label>
              </div>
              {company.parent_company_id ? (
                <p className="text-xs text-muted-foreground italic">Integrasjoner arves fra morselskap</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.eccairs_enabled ?? false}
                      onCheckedChange={() => onToggleEccairs(company)}
                    />
                    <Label className="text-sm">ECCAIRS</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.dji_flightlog_enabled}
                      onCheckedChange={() => onToggleDji(company)}
                    />
                    <Label className="text-sm">DJI Flylogg</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.ardupilot_enabled}
                      onCheckedChange={() => onToggleArdupilot(company)}
                    />
                    <Label className="text-sm">ArduPilot</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={company.dronetag_enabled}
                      onCheckedChange={() => onToggleDronetag(company)}
                    />
                    <Label className="text-sm">DroneTag</Label>
                  </div>
                  {company.dji_flightlog_enabled && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={company.dji_auto_sync_enabled}
                          onCheckedChange={() => onToggleAutoSync(company)}
                        />
                        <Label className="text-sm">Auto-sync</Label>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Sync fra dato</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !company.dji_sync_from_date && "text-muted-foreground")}>
                              <CalendarIcon className="h-3 w-3 mr-1" />
                              {company.dji_sync_from_date ? format(new Date(company.dji_sync_from_date), "dd.MM.yyyy") : "Ikke satt"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : undefined}
                              onSelect={(date) => onSyncDateChange(company, date)}
                              disabled={(date) => date > new Date()}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(company)}
                className="flex-1"
              >
                <Pencil className="h-3 w-3 mr-1" />
                Rediger
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(company)}
                className="flex-1"
              >
                Slett
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export const CompanyManagementSection = () => {
  const { companyId, isSuperAdmin, refetchUserInfo, user } = useAuth();
  const isMobile = useIsMobile();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageData, setUsageData] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase();
    return companies.filter((c) =>
      c.navn.toLowerCase().includes(q) ||
      (c.org_nummer && c.org_nummer.toLowerCase().includes(q)) ||
      (c.kontakt_epost && c.kontakt_epost.toLowerCase().includes(q))
    );
  }, [companies, searchQuery]);

  useEffect(() => {
    fetchCompanies();

    const channel = supabase
      .channel("companies_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companies",
        },
        () => {
          fetchCompanies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("navn", { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      console.error("Error fetching companies:", error);
      toast.error("Kunne ikke laste selskaper");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompany = () => {
    setSelectedCompany(null);
    setDialogOpen(true);
  };

  const handleEditCompany = (company: Company) => {
    setSelectedCompany(company);
    setDialogOpen(true);
  };

  const handleToggleActive = async (company: Company) => {
    const newValue = !company.aktiv;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, aktiv: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ aktiv: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? "Selskap aktivert" : "Selskap deaktivert");
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, aktiv: !newValue } : c));
      console.error("Error toggling company status:", error);
      toast.error("Kunne ikke oppdatere status");
    }
  };

  const handleToggleEccairs = async (company: Company) => {
    const newValue = !company.eccairs_enabled;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, eccairs_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ eccairs_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? "ECCAIRS aktivert" : "ECCAIRS deaktivert");
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, eccairs_enabled: !newValue } : c));
      console.error("Error toggling ECCAIRS status:", error);
      toast.error("Kunne ikke oppdatere ECCAIRS-status");
    }
  };

  const handleToggleDji = async (company: Company) => {
    const newValue = !company.dji_flightlog_enabled;
    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_flightlog_enabled: newValue } : c));
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-dronelog-key', {
        body: { companyId: company.id, enable: newValue },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
    toast.success(newValue ? "DJI Flylogg aktivert" : "DJI Flylogg deaktivert");
    } catch (error: any) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_flightlog_enabled: !newValue } : c));
      console.error("Error toggling DJI status:", error);
      toast.error("Kunne ikke oppdatere DJI Flylogg-status: " + (error.message || "Ukjent feil"));
    }
  };

  const handleToggleDronetag = async (company: Company) => {
    const newValue = !company.dronetag_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dronetag_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dronetag_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? "DroneTag aktivert" : "DroneTag deaktivert");
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dronetag_enabled: !newValue } : c));
      console.error("Error toggling DroneTag status:", error);
      toast.error("Kunne ikke oppdatere DroneTag-status");
    }
  };

  const handleToggleArdupilot = async (company: Company) => {
    const newValue = !company.ardupilot_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ardupilot_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ ardupilot_enabled: newValue } as any)
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? "ArduPilot aktivert" : "ArduPilot deaktivert");
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ardupilot_enabled: !newValue } : c));
      console.error("Error toggling ArduPilot status:", error);
      toast.error("Kunne ikke oppdatere ArduPilot-status");
    }
  };

  const handleToggleAutoSync = async (company: Company) => {
    const newValue = !company.dji_auto_sync_enabled;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_auto_sync_enabled: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dji_auto_sync_enabled: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? "Automatisk sync aktivert" : "Automatisk sync deaktivert");
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_auto_sync_enabled: !newValue } : c));
      console.error("Error toggling auto sync:", error);
      toast.error("Kunne ikke oppdatere auto-sync status");
    }
  };

  const handleSyncDateChange = async (company: Company, date: Date | undefined) => {
    const newValue = date ? date.toISOString().split('T')[0] : null;
    const oldValue = company.dji_sync_from_date;
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_sync_from_date: newValue } : c));
    
    try {
      const { error } = await supabase
        .from("companies")
        .update({ dji_sync_from_date: newValue })
        .eq("id", company.id);

      if (error) throw error;
      toast.success(newValue ? `Sync-startdato satt til ${format(date!, "dd.MM.yyyy")}` : "Sync-startdato fjernet");
    } catch (error: any) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, dji_sync_from_date: oldValue } : c));
      console.error("Error updating sync date:", error);
      toast.error("Kunne ikke oppdatere sync-startdato");
    }
  };

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;

    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyToDelete.id);

      if (error) throw error;
      toast.success("Selskap slettet");
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    } catch (error: any) {
      console.error("Error deleting company:", error);
      toast.error("Kunne ikke slette selskap: " + error.message);
    }
  };

  const handleCompanySwitch = async (newCompanyId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_id: newCompanyId })
        .eq('id', user?.id);
      
      if (error) throw error;
      
      await refetchUserInfo();
      const company = companies.find(c => c.id === newCompanyId);
      toast.success(`Byttet til ${company?.navn}`);
    } catch (error) {
      console.error("Error switching company:", error);
      toast.error("Kunne ikke bytte selskap");
    }
  };

  const [usageCompanyId, setUsageCompanyId] = useState<string>("");

  const handleFetchUsage = async (forCompanyId?: string) => {
    setUsageDialogOpen(true);
    setUsageLoading(true);
    try {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const body: any = { from, to };
      if (forCompanyId) body.companyId = forCompanyId;

      const { data, error } = await supabase.functions.invoke('dronelog-usage', { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setUsageData(data);
    } catch (error: any) {
      console.error("Error fetching usage:", error);
      toast.error("Kunne ikke hente API-bruk: " + (error.message || "Ukjent feil"));
    } finally {
      setUsageLoading(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-3 sm:p-6">
        <div className="flex items-center justify-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-muted-foreground">Laster selskaper...</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">Selskapsadministrasjon</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleFetchUsage()} variant="outline" size={isMobile ? "sm" : "default"}>
              <BarChart3 className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? "API" : "API-bruk"}
            </Button>
            <Button onClick={handleAddCompany} size={isMobile ? "sm" : "default"}>
              <Plus className={`${isMobile ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'}`} />
              {isMobile ? "Nytt" : "Nytt selskap"}
            </Button>
          </div>
        </div>

        {/* Search field */}
        {companies.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Søk etter navn, org.nr eller e-post..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {companies.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            Ingen selskaper funnet. Opprett ditt første selskap.
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-muted-foreground">
            Ingen selskaper matcher søket «{searchQuery}»
          </div>
        ) : isMobile ? (
          // Mobile: Expandable cards
          <div className="space-y-2">
            {filteredCompanies.map((company) => (
              <MobileCompanyCard
                key={company.id}
                company={company}
                onToggleActive={handleToggleActive}
                onToggleEccairs={handleToggleEccairs}
                onToggleDji={handleToggleDji}
                onToggleAutoSync={handleToggleAutoSync}
                onToggleDronetag={handleToggleDronetag}
                onToggleArdupilot={handleToggleArdupilot}
                onSyncDateChange={handleSyncDateChange}
                onEdit={handleEditCompany}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        ) : (
          // Desktop: Table view
          <ScrollArea className="w-full">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Navn</TableHead>
                    <TableHead className="text-xs sm:text-sm">Type</TableHead>
                    <TableHead className="text-xs sm:text-sm">Org.nr</TableHead>
                    <TableHead className="text-xs sm:text-sm">Kontaktinfo</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm">ECCAIRS</TableHead>
                     <TableHead className="text-xs sm:text-sm">DJI Flylogg</TableHead>
                    <TableHead className="text-xs sm:text-sm">ArduPilot</TableHead>
                    <TableHead className="text-xs sm:text-sm">DroneTag</TableHead>
                    <TableHead className="text-xs sm:text-sm">Auto-sync</TableHead>
                    <TableHead className="text-xs sm:text-sm">Sync fra dato</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span>{company.navn}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          {company.selskapstype === 'flyselskap' ? (
                            <>
                              <Plane className="h-3 w-3 text-muted-foreground" />
                              <span>Flyselskap</span>
                            </>
                          ) : (
                            <>
                              <Radio className="h-3 w-3 text-muted-foreground" />
                              <span>Droneoperatør</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.org_nummer ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Hash className="h-3 w-3 flex-shrink-0" />
                            {company.org_nummer}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {company.kontakt_epost && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{company.kontakt_epost}</span>
                            </div>
                          )}
                          {company.kontakt_telefon && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              {company.kontakt_telefon}
                            </div>
                          )}
                          {company.adresse && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{company.adresse}</span>
                            </div>
                          )}
                          {!company.kontakt_epost &&
                            !company.kontakt_telefon &&
                            !company.adresse && (
                              <span className="text-muted-foreground text-xs">
                                Ingen kontaktinfo
                              </span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={company.aktiv}
                            onCheckedChange={() => handleToggleActive(company)}
                          />
                          <Label className="cursor-pointer">
                            <Badge
                              variant={company.aktiv ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {company.aktiv ? "Aktiv" : "Inaktiv"}
                            </Badge>
                          </Label>
                        </div>
                      </TableCell>
                      {company.parent_company_id ? (
                        <TableCell colSpan={6}>
                          <span className="text-xs text-muted-foreground italic">Arvet fra morselskap</span>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.eccairs_enabled ?? false}
                                onCheckedChange={() => handleToggleEccairs(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.eccairs_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.eccairs_enabled ? "På" : "Av"}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.dji_flightlog_enabled}
                                onCheckedChange={() => handleToggleDji(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.dji_flightlog_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.dji_flightlog_enabled ? "På" : "Av"}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.ardupilot_enabled}
                                onCheckedChange={() => handleToggleArdupilot(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.ardupilot_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.ardupilot_enabled ? "På" : "Av"}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={company.dronetag_enabled}
                                onCheckedChange={() => handleToggleDronetag(company)}
                              />
                              <Label className="cursor-pointer">
                                <Badge
                                  variant={company.dronetag_enabled ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {company.dronetag_enabled ? "På" : "Av"}
                                </Badge>
                              </Label>
                            </div>
                          </TableCell>
                          <TableCell>
                            {company.dji_flightlog_enabled ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={company.dji_auto_sync_enabled}
                                  onCheckedChange={() => handleToggleAutoSync(company)}
                                />
                                <Label className="cursor-pointer">
                                  <Badge
                                    variant={company.dji_auto_sync_enabled ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {company.dji_auto_sync_enabled ? "På" : "Av"}
                                  </Badge>
                                </Label>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {company.dji_flightlog_enabled ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal text-xs", !company.dji_sync_from_date && "text-muted-foreground")}>
                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                    {company.dji_sync_from_date ? format(new Date(company.dji_sync_from_date), "dd.MM.yyyy") : "Ikke satt"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : undefined}
                                    onSelect={(date) => handleSyncDateChange(company, date)}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCompany(company)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(company)}
                          >
                            Slett
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </GlassCard>

      <CompanyManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={selectedCompany}
        onSuccess={fetchCompanies}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft sletting</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette selskapet "
              {companyToDelete?.navn}"? Denne handlingen kan ikke angres.
              <br />
              <br />
              <strong className="text-destructive">
                Advarsel: Alle brukere og data tilknyttet dette selskapet vil
                også bli påvirket.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Slett selskap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              DroneLog API-bruk
            </DialogTitle>
           <DialogDescription>
              Bruksstatistikk for gjeldende måned
            </DialogDescription>
          </DialogHeader>

          {/* Company selector for scoped usage */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Vis bruk for</Label>
            <div className="flex gap-2">
              <Select value={usageCompanyId || "__all__"} onValueChange={(v) => { const val = v === "__all__" ? "" : v; setUsageCompanyId(val); handleFetchUsage(val || undefined); }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Master-nøkkel (alle)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Master-nøkkel (alle)</SelectItem>
                  {companies.filter(c => c.dji_flightlog_enabled).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.navn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {usageData?._keyScope && (
              <p className="text-xs text-muted-foreground">
                Viser: {usageData._keyScope === 'company' ? `Selskapsnøkkel (${usageData._companyName})` : 'Master-nøkkel'}
              </p>
            )}
          </div>

          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usageData ? (
            <div className="space-y-4">
              {/* Summary from result */}
              {(() => {
                const summary = usageData?.result?.summary || usageData?.summary || usageData?.result || usageData;
                const used = summary?.used_this_month ?? summary?.used ?? summary?.total ?? '—';
                const limit = summary?.monthly_limit ?? summary?.limit ?? summary?.quota ?? '—';
                const remaining = summary?.remaining ?? (typeof used === 'number' && typeof limit === 'number' ? limit - used : '—');
                const plan = summary?.plan;
                const pct = typeof used === 'number' && typeof limit === 'number' && limit > 0 ? Math.round((used / limit) * 100) : null;

                return (
                  <>
                    {plan && (
                      <div className="text-sm text-muted-foreground text-center">
                        Plan: <span className="font-medium text-foreground capitalize">{plan}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{used}</p>
                        <p className="text-xs text-muted-foreground">Brukt</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{limit}</p>
                        <p className="text-xs text-muted-foreground">Limit</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{remaining}</p>
                        <p className="text-xs text-muted-foreground">Gjenstående</p>
                      </div>
                    </div>
                    {pct !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Forbruk</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Raw JSON fallback for debugging */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Vis rådata</summary>
                <pre className="mt-2 p-2 rounded bg-muted overflow-auto max-h-48 text-xs">
                  {JSON.stringify(usageData, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen data tilgjengelig</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
