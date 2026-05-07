import { AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { ResourceConflict } from "@/hooks/useResourceConflicts";

interface ResourceConflictWarningProps {
  conflicts: ResourceConflict[];
  compact?: boolean;
}

export const ResourceConflictWarning = ({ conflicts, compact = false }: ResourceConflictWarningProps) => {
  if (conflicts.length === 0) return null;

  const overlaps = conflicts.filter((c) => c.conflictType === 'overlap');
  const sameDay = conflicts.filter((c) => c.conflictType === 'same_day');

  // Show overlap warnings first (more severe)
  if (overlaps.length > 0) {
    const conflict = overlaps[0];
    return (
      <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {compact ? (
            <>Brukes i "{conflict.conflictingMission.tittel}"</>
          ) : (
            <>
              Konflikt: Brukes i "{conflict.conflictingMission.tittel}" (
              {format(new Date(conflict.conflictingMission.tidspunkt), "dd.MM HH:mm", { locale: nb })})
            </>
          )}
        </span>
      </div>
    );
  }

  // Show same-day info if no overlaps
  if (sameDay.length > 0) {
    const conflict = sameDay[0];
    return (
      <div className="flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400 mt-1">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {compact ? (
            <>Brukes også i "{conflict.conflictingMission.tittel}" samme dag</>
          ) : (
            <>
              Brukes også i "{conflict.conflictingMission.tittel}" samme dag (
              {format(new Date(conflict.conflictingMission.tidspunkt), "HH:mm", { locale: nb })})
            </>
          )}
        </span>
      </div>
    );
  }

  return null;
};

// Smaller inline indicator for badges
export const ResourceConflictIndicator = ({ conflicts }: { conflicts: ResourceConflict[] }) => {
  if (conflicts.length === 0) return null;

  const hasOverlap = conflicts.some((c) => c.conflictType === 'overlap');

  if (hasOverlap) {
    return <AlertTriangle className="h-3 w-3 text-amber-500 ml-1 flex-shrink-0" />;
  }

  return <Info className="h-3 w-3 text-blue-500 ml-1 flex-shrink-0" />;
};
