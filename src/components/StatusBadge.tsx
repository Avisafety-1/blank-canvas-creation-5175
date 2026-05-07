import { Status } from "@/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const colors = {
    Grønn: "bg-status-green",
    Gul: "bg-status-yellow",
    Rød: "bg-status-red",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("w-3 h-3 rounded-full", colors[status])} />
      <span className="text-sm font-medium">{status}</span>
    </div>
  );
};
