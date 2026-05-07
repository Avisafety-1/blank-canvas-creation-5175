import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState, useEffect, useMemo } from "react";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Status } from "@/types";
import { X, Building2 } from "lucide-react";

interface EquipmentListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: any[];
  onEquipmentUpdated?: () => void;
  statusFilter?: Status | null;
  onStatusFilterChange?: (filter: Status | null) => void;
}

export const EquipmentListDialog = ({ open, onOpenChange, equipment, onEquipmentUpdated, statusFilter, onStatusFilterChange }: EquipmentListDialogProps) => {
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const { companyId } = useAuth();

  const filteredEquipment = useMemo(() => {
    if (!statusFilter) return equipment;
    return equipment.filter(e => e.status === statusFilter);
  }, [equipment, statusFilter]);

  const handleEquipmentClick = (item: any) => {
    setSelectedEquipment(item);
    setDetailDialogOpen(true);
  };

  const handleEquipmentUpdated = () => {
    if (onEquipmentUpdated) {
      onEquipmentUpdated();
    }
  };

  // Sync selectedEquipment when equipment prop changes
  useEffect(() => {
    if (selectedEquipment && equipment.length > 0) {
      const updated = equipment.find(e => e.id === selectedEquipment.id);
      if (updated) {
        setSelectedEquipment(updated);
      }
    }
  }, [equipment]);

  const titleSuffix = statusFilter ? ` – ${statusFilter} (${filteredEquipment.length})` : ` (${equipment.length})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Utstyr{titleSuffix}
            {statusFilter && (
              <button type="button" onClick={() => onStatusFilterChange?.(null)} className="inline-flex items-center gap-0.5 text-xs bg-muted rounded-full px-2 py-0.5 hover:bg-muted/80">
                Vis alle <X className="w-3 h-3" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {filteredEquipment.map((item) => (
            <div 
              key={item.id} 
              onClick={() => handleEquipmentClick(item)}
              className="border border-border rounded-lg p-3 sm:p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted/70"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-base sm:text-lg break-words hyphens-auto">{item.navn}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground break-words hyphens-auto">{item.type}</p>
                  {item.company_id !== companyId && item.companies?.navn && (
                    <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {item.companies.navn}
                    </Badge>
                  )}
                </div>
                <StatusBadge status={(item.status || "Grønn") as Status} />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm">
                <div className="flex justify-between sm:block">
                  <span className="text-muted-foreground">Serienummer:</span>
                  <span className="font-medium sm:ml-2">{item.serienummer}</span>
                </div>
                <div className="flex justify-between sm:block">
                  <span className="text-muted-foreground">Tilgjengelig:</span>
                  <span className="font-medium sm:ml-2">{item.tilgjengelig ? "Ja" : "Nei"}</span>
                </div>
                {item.neste_vedlikehold && (
                  <div className="flex justify-between sm:block">
                    <span className="text-muted-foreground">Neste vedl.:</span>
                    <span className="font-medium sm:ml-2">
                      {format(new Date(item.neste_vedlikehold), "dd.MM.yy", { locale: nb })}
                    </span>
                  </div>
                )}
                {item.sist_vedlikeholdt && (
                  <div className="flex justify-between sm:block">
                    <span className="text-muted-foreground">Sist vedl.:</span>
                    <span className="font-medium sm:ml-2">
                      {format(new Date(item.sist_vedlikeholdt), "dd.MM.yy", { locale: nb })}
                    </span>
                  </div>
                )}
              </div>
              
              {item.merknader && (
                <div className="text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Merknader:</span>
                  <p className="mt-1">{item.merknader}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      {selectedEquipment && (
        <EquipmentDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          equipment={selectedEquipment}
          onEquipmentUpdated={handleEquipmentUpdated}
        />
      )}
    </Dialog>
  );
};
