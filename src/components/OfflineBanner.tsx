import { WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { cn } from "@/lib/utils";

export const OfflineBanner = () => {
  const { isOnline, isSyncing, pendingCount } = useNetworkStatus();

  // Don't show anything when online and not syncing with no pending
  if (isOnline && !isSyncing && pendingCount === 0) {
    return null;
  }

  // Show syncing state briefly when coming back online
  if (isOnline && isSyncing) {
    return (
      <div className="bg-info/90 text-info-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-40">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Synkroniserer {pendingCount} endring{pendingCount !== 1 ? 'er' : ''}...</span>
      </div>
    );
  }

  // Show pending items when online (briefly after sync)
  if (isOnline && pendingCount > 0) {
    return (
      <div className="bg-warning/90 text-warning-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-40">
        <CloudOff className="h-4 w-4" />
        <span>{pendingCount} endring{pendingCount !== 1 ? 'er' : ''} venter på synkronisering</span>
      </div>
    );
  }

  // Offline state
  if (!isOnline) {
    return (
      <div className="bg-warning/90 text-warning-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-40">
        <WifiOff className="h-4 w-4" />
        <span>
          Du er frakoblet
          {pendingCount > 0 && ` – ${pendingCount} endring${pendingCount !== 1 ? 'er' : ''} lagret lokalt`}
          {pendingCount === 0 && ' – endringer lagres lokalt'}
        </span>
      </div>
    );
  }

  return null;
};
