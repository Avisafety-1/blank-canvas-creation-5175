import { GlassCard } from "@/components/GlassCard";
import { Plane, Gauge, Users } from "lucide-react";
import { Status } from "@/types";
import { useState } from "react";
import { DroneListDialog } from "./DroneListDialog";
import { EquipmentListDialog } from "./EquipmentListDialog";
import { PersonnelListDialog } from "./PersonnelListDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { useTranslation } from "react-i18next";
import { useStatusData } from "@/hooks/useStatusData";
import { Skeleton } from "@/components/ui/skeleton";

interface StatusCounts {
  Grønn: number;
  Gul: number;
  Rød: number;
}

const statusSegments: { key: Status; bg: string; border: string }[] = [
  { key: "Grønn", bg: "bg-status-green/20", border: "border-status-green" },
  { key: "Gul", bg: "bg-status-yellow/20", border: "border-status-yellow" },
  { key: "Rød", bg: "bg-status-red/20", border: "border-status-red" },
];

const StatusCard = ({
  title,
  icon: Icon,
  counts,
  onSegmentClick,
}: {
  title: string;
  icon: any;
  counts: StatusCounts;
  onSegmentClick: (status: Status) => void;
}) => {
  return (
    <div className="flex w-full gap-1.5 sm:gap-2 overflow-hidden">
      {statusSegments.map(({ key, bg, border }) =>
        counts[key] > 0 ? (
          <button
            key={key}
            type="button"
            style={{ flexGrow: counts[key] }}
            className={`${bg} ${border} border-2 rounded px-2 py-1 sm:px-3 sm:py-1.5 transition-all hover:scale-105 cursor-pointer text-gray-700 dark:text-gray-200 min-w-0 flex items-center gap-2 sm:gap-3 overflow-hidden`}
            onClick={() => onSegmentClick(key)}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-lg sm:text-xl font-bold">{counts[key]}</span>
          </button>
        ) : null
      )}
    </div>
  );
};

const StatusCardSkeleton = () => (
  <div className="bg-muted/30 border-2 border-muted rounded p-2 sm:p-3">
    <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
      <Skeleton className="w-4 h-4 sm:w-5 sm:h-5 rounded" />
      <Skeleton className="h-4 w-16" />
    </div>
    <Skeleton className="h-8 w-12" />
  </div>
);

export const StatusPanel = () => {
  const { t } = useTranslation();
  const terminology = useTerminology();
  const [droneDialogOpen, setDroneDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [personnelDialogOpen, setPersonnelDialogOpen] = useState(false);
  const [droneFilter, setDroneFilter] = useState<Status | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Status | null>(null);
  const [personnelFilter, setPersonnelFilter] = useState<Status | null>(null);

  const {
    isLoading,
    drones,
    equipment,
    personnel,
    droneStatus,
    equipmentStatus,
    personnelStatus,
    refetchDrones,
    refetchEquipment,
    refetchPersonnel,
  } = useStatusData();

  const openDrone = (status: Status) => { setDroneFilter(status); setDroneDialogOpen(true); };
  const openEquipment = (status: Status) => { setEquipmentFilter(status); setEquipmentDialogOpen(true); };
  const openPersonnel = (status: Status) => { setPersonnelFilter(status); setPersonnelDialogOpen(true); };

  return (
    <>
      <GlassCard className="overflow-hidden">
        <h2 className="text-sm sm:text-base font-semibold mb-2">{t('dashboard.status.title')}</h2>
        <div className="grid grid-cols-1 gap-1.5 sm:gap-2 w-full">
          {isLoading ? (
            <>
              <StatusCardSkeleton />
              <StatusCardSkeleton />
              <StatusCardSkeleton />
            </>
          ) : (
            <>
              <StatusCard title={terminology.vehicles} icon={Plane} counts={droneStatus} onSegmentClick={openDrone} />
              <StatusCard title={t('dashboard.status.equipment')} icon={Gauge} counts={equipmentStatus} onSegmentClick={openEquipment} />
              <StatusCard title={t('dashboard.status.personnel')} icon={Users} counts={personnelStatus} onSegmentClick={openPersonnel} />
            </>
          )}
        </div>
      </GlassCard>
      
      <DroneListDialog 
        open={droneDialogOpen} 
        onOpenChange={(o) => { setDroneDialogOpen(o); if (!o) setDroneFilter(null); }}
        drones={drones}
        onDronesUpdated={refetchDrones}
        statusFilter={droneFilter}
        onStatusFilterChange={setDroneFilter}
      />
      <EquipmentListDialog 
        open={equipmentDialogOpen} 
        onOpenChange={(o) => { setEquipmentDialogOpen(o); if (!o) setEquipmentFilter(null); }}
        equipment={equipment}
        onEquipmentUpdated={refetchEquipment}
        statusFilter={equipmentFilter}
        onStatusFilterChange={setEquipmentFilter}
      />
      <PersonnelListDialog 
        open={personnelDialogOpen} 
        onOpenChange={(o) => { setPersonnelDialogOpen(o); if (!o) setPersonnelFilter(null); }}
        personnel={personnel}
        onPersonnelUpdated={refetchPersonnel}
        statusFilter={personnelFilter}
        onStatusFilterChange={setPersonnelFilter}
      />
    </>
  );
};
