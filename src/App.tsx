import React, { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DomainGuard } from "@/components/DomainGuard";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { Header } from "@/components/Header";
import { KeyboardDismissButton } from "@/components/KeyboardDismissButton";
import { OfflineBanner } from "@/components/OfflineBanner";
import { IdleTimeoutWarning } from "@/components/IdleTimeoutWarning";
import { ForceReloadBanner } from "@/components/ForceReloadBanner";
import { useForceReload } from "@/hooks/useForceReload";
import { PlanRestricted } from "@/components/PlanRestricted";
import { TrainingModuleRestricted } from "@/components/TrainingModuleRestricted";
import LoadingSpinner from "@/components/LoadingSpinner";


// Synchronous imports — needed immediately
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages — loaded on demand for smaller initial bundle
const Index = React.lazy(() => import("./pages/Index"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const Admin = React.lazy(() => import("./pages/Admin"));
const Resources = React.lazy(() => import("./pages/Resources"));
const KartPage = React.lazy(() => import("./pages/Kart"));
const Documents = React.lazy(() => import("./pages/Documents"));
const Kalender = React.lazy(() => import("./pages/Kalender"));
const Hendelser = React.lazy(() => import("./pages/Hendelser"));
const Status = React.lazy(() => import("./pages/Status"));
const Oppdrag = React.lazy(() => import("./pages/Oppdrag"));
const Installer = React.lazy(() => import("./pages/Installer"));
const UserManualDownload = React.lazy(() => import("./pages/UserManualDownload"));
const Statistikk = React.lazy(() => import("./pages/Statistikk"));
const SoraProcess = React.lazy(() => import("./pages/SoraProcess"));
const Changelog = React.lazy(() => import("./pages/Changelog"));
const Marketing = React.lazy(() => import("./pages/Marketing"));
const Priser = React.lazy(() => import("./pages/Priser"));
const NewsletterSignup = React.lazy(() => import("./pages/NewsletterSignup"));

// Initialize i18n - must be imported after React setup
import "./i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min before data is stale
      gcTime: 24 * 60 * 60 * 1000, // Keep cached data for 24 hours
      retry: (failureCount, _error) => {
        if (!navigator.onLine) return false;
        return failureCount < 3;
      },
    },
  },
});

let persister: ReturnType<typeof createSyncStoragePersister> | undefined;
try {
  persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'avisafe_query_cache',
  });
} catch (e) {
  console.error('Failed to create query persister:', e);
}

// Layout wrapper that renders Header once for all authenticated routes
const AuthenticatedLayout = () => {
  const { user, loading, isApproved, profileLoaded, authRefreshing } = useAuth();
  const location = useLocation();
  useForceReload();
  

  // Prefetch common lazy-loaded pages after initial render
  useEffect(() => {
    const timer = setTimeout(() => {
      import("./pages/Admin");
      import("./pages/Resources");
      import("./pages/Documents");
      import("./pages/Kart");
      import("./pages/Oppdrag");
      import("./pages/Kalender");
      import("./pages/Hendelser");
      import("./pages/Statistikk");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);
  
  // Keep showing header during auth refresh — don't flash to blank screen.
  // A transient null user during token refresh should NOT hide the UI.
  const isOfflineWithSession = !navigator.onLine && user && !isApproved;
  if (loading || (!user && !authRefreshing)) {
    return <Outlet />;
  }
  if (!profileLoaded) {
    return <Outlet />;
  }
  if (!isApproved && !isOfflineWithSession) {
    return <Outlet />;
  }
  
  // Map page needs fixed layout for proper rendering
  const isMapPage = location.pathname === '/kart';
  
  if (isMapPage) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <Header />
        <OfflineBanner />
        <IdleTimeoutWarning />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SubscriptionGate>
            <Suspense fallback={<LoadingSpinner />}>
              <Outlet />
            </Suspense>
          </SubscriptionGate>
        </main>
      </div>
    );
  }
  
  // Other pages use scrollable layout
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <OfflineBanner />
      <IdleTimeoutWarning />
      <main className="flex-1 flex flex-col">
        <SubscriptionGate>
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </SubscriptionGate>
      </main>
    </div>
  );
};

// FIX: Refactored to explicit function body to avoid render2 error with provider nesting
const QueryWrapper = persister
  ? ({ children }: { children: React.ReactNode }) => (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: persister!, maxAge: 24 * 60 * 60 * 1000 }}>
        {children}
      </PersistQueryClientProvider>
    )
  : ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

const App = () => {
  useEffect(() => {
    const isDji = /dji/i.test(navigator.userAgent);
    const isMobilePhone = 'ontouchstart' in window && 
      Math.min(window.screen.width, window.screen.height) < 600;
    if (isMobilePhone && !isDji && screen.orientation?.lock) {
      screen.orientation.lock("portrait").catch(() => {});
    }
  }, []);

  return (
    <QueryWrapper>
      <TooltipProvider>
        <ErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <ForceReloadBanner />
              <Toaster />
              <Sonner />
              <KeyboardDismissButton />
                <Routes>
                  {/* Public routes - login domain */}
                  <Route path="/auth" element={<DomainGuard requireAuth={false}><Auth /></DomainGuard>} />
                  <Route path="/reset-password" element={<DomainGuard requireAuth={false}><Suspense fallback={<LoadingSpinner />}><ResetPassword /></Suspense></DomainGuard>} />
                  <Route path="/installer" element={<Suspense fallback={<LoadingSpinner />}><Installer /></Suspense>} />
                  <Route path="/priser" element={<Suspense fallback={<LoadingSpinner />}><Priser /></Suspense>} />
                  <Route path="/sora-prosess" element={<Suspense fallback={<LoadingSpinner />}><SoraProcess /></Suspense>} />
                  <Route path="/bruksanvisning" element={<Suspense fallback={<LoadingSpinner />}><UserManualDownload /></Suspense>} />
                  <Route path="/nyhetsbrev" element={<Suspense fallback={<LoadingSpinner />}><NewsletterSignup /></Suspense>} />
                  
                  {/* Protected routes with shared Header - app domain */}
                  <Route element={<AuthenticatedLayout />}>
                    <Route path="/" element={<DomainGuard><Index /></DomainGuard>} />
                    <Route path="/ressurser" element={<DomainGuard><TrainingModuleRestricted moduleKey="resources"><Resources /></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/kart" element={<DomainGuard><TrainingModuleRestricted moduleKey="map"><KartPage /></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/dokumenter" element={<DomainGuard><TrainingModuleRestricted moduleKey="documents"><Documents /></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/kalender" element={<DomainGuard><TrainingModuleRestricted moduleKey="calendar"><Kalender /></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/hendelser" element={<DomainGuard><TrainingModuleRestricted moduleKey="incidents"><PlanRestricted feature="incidents"><Hendelser /></PlanRestricted></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/status" element={<DomainGuard><TrainingModuleRestricted moduleKey="status"><PlanRestricted feature="status"><Status /></PlanRestricted></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/oppdrag" element={<DomainGuard><TrainingModuleRestricted moduleKey="missions"><Oppdrag /></TrainingModuleRestricted></DomainGuard>} />
                    <Route path="/changelog" element={<DomainGuard><Changelog /></DomainGuard>} />
                  </Route>
                  
                  {/* Admin has its own header */}
                  <Route path="/admin" element={<DomainGuard><Suspense fallback={<LoadingSpinner />}><Admin /></Suspense></DomainGuard>} />
                  <Route path="/statistikk" element={<DomainGuard><Suspense fallback={<LoadingSpinner />}><Statistikk /></Suspense></DomainGuard>} />
                  <Route path="/marketing" element={<DomainGuard><Suspense fallback={<LoadingSpinner />}><Marketing /></Suspense></DomainGuard>} />
                  
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryWrapper>
  );
};

export default App;
