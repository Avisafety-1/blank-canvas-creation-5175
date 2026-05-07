import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState, useMemo, useEffect } from "react";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { calculatePersonnelAggregatedStatus } from "@/lib/maintenanceStatus";
import { usePresence } from "@/hooks/usePresence";
import { OnlineIndicator } from "@/components/OnlineIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { Status } from "@/types";
import { X, Building2 } from "lucide-react";

interface PersonnelListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personnel: any[];
  onPersonnelUpdated?: () => void;
  statusFilter?: Status | null;
  onStatusFilterChange?: (filter: Status | null) => void;
}

export const PersonnelListDialog = ({ open, onOpenChange, personnel, onPersonnelUpdated, statusFilter, onStatusFilterChange }: PersonnelListDialogProps) => {
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const { isOnline } = usePresence();
  const { companyId } = useAuth();

  // Calculate status for each person based on their competencies
  const personnelWithStatus = useMemo(() => {
    return personnel.map(person => ({
      ...person,
      calculatedStatus: calculatePersonnelAggregatedStatus(
        person.personnel_competencies || [],
        30
      )
    }));
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    if (!statusFilter) return personnelWithStatus;
    return personnelWithStatus.filter(p => p.calculatedStatus === statusFilter);
  }, [personnelWithStatus, statusFilter]);

  const handlePersonClick = (person: any) => {
    setSelectedPerson(person);
    setDetailDialogOpen(true);
  };

  const handlePersonUpdated = () => {
    if (onPersonnelUpdated) {
      onPersonnelUpdated();
    }
  };

  // Sync selectedPerson when personnel prop changes
  useEffect(() => {
    if (selectedPerson && personnel.length > 0) {
      const updated = personnel.find(p => p.id === selectedPerson.id);
      if (updated) {
        setSelectedPerson(updated);
      }
    }
  }, [personnel]);

  const titleSuffix = statusFilter ? ` – ${statusFilter} (${filteredPersonnel.length})` : ` (${personnel.length})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Personell{titleSuffix}
            {statusFilter && (
              <button type="button" onClick={() => onStatusFilterChange?.(null)} className="inline-flex items-center gap-0.5 text-xs bg-muted rounded-full px-2 py-0.5 hover:bg-muted/80">
                Vis alle <X className="w-3 h-3" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {filteredPersonnel.map((person) => (
            <div 
              key={person.id} 
              onClick={() => handlePersonClick(person)}
              className="border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <OnlineIndicator isOnline={isOnline(person.id)} />
                  <div>
                    <h3 className="font-semibold text-lg">{person.full_name || "Ukjent navn"}</h3>
                    {person.created_at && (
                      <p className="text-sm text-muted-foreground">
                        Opprettet: {format(new Date(person.created_at), "dd.MM.yyyy", { locale: nb })}
                      </p>
                    )}
                    {person.company_id !== companyId && person.companies?.navn && (
                      <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                        <Building2 className="w-3 h-3" />
                        {person.companies.navn}
                      </Badge>
                    )}
                  </div>
                </div>
                <StatusBadge status={person.calculatedStatus} />
              </div>
              
              {person.personnel_competencies && person.personnel_competencies.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Kompetanser:</span>
                  <div className="space-y-2 mt-2">
                    {person.personnel_competencies.map((comp: any) => (
                      <div key={comp.id} className="flex justify-between items-start p-2 bg-muted/50 rounded">
                        <div>
                          <span className="font-medium">{comp.navn}</span>
                          <p className="text-xs text-muted-foreground">{comp.type}</p>
                        </div>
                        {comp.utloper_dato && (
                          <span className="text-xs text-muted-foreground">
                            Utløper: {format(new Date(comp.utloper_dato), "dd.MM.yyyy")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {(!person.personnel_competencies || person.personnel_competencies.length === 0) && (
                <div className="text-sm text-muted-foreground">
                  Ingen kompetanser registrert
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      {selectedPerson && (
        <PersonCompetencyDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          person={selectedPerson}
          onCompetencyUpdated={handlePersonUpdated}
        />
      )}
    </Dialog>
  );
};
