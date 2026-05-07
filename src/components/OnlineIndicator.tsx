import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  isOnline: boolean;
  className?: string;
}

export const OnlineIndicator = ({ isOnline, className }: OnlineIndicatorProps) => {
  return (
    <span
      className={cn(
        "w-2.5 h-2.5 rounded-full border-2 border-background",
        isOnline ? "bg-emerald-500" : "bg-muted-foreground/50",
        className
      )}
      title={isOnline ? "Aktiv" : "Inaktiv"}
    />
  );
};
