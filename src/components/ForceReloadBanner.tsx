import { useState } from 'react';
import { useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getForceReloadState, subscribeForceReload, performReload } from '@/hooks/useForceReload';
import { Link } from 'react-router-dom';

export const ForceReloadBanner = () => {
  const state = useSyncExternalStore(subscribeForceReload, getForceReloadState);
  const [reloading, setReloading] = useState(false);

  if (!state.showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground px-4 py-3 flex items-center justify-center gap-3 shadow-lg" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 0.75rem)` }}>
      <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
      <span className="text-sm font-medium">
        Ny versjon tilgjengelig
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          performReload();
        }}
      >
        {reloading ? 'Oppdaterer...' : 'Oppdater nå'}
      </Button>
      <Link to="/changelog" className="text-sm underline underline-offset-2 hover:opacity-80">
        Se endringslogg
      </Link>
    </div>
  );
};
