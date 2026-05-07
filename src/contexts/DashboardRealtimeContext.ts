import { createContext, useContext } from "react";

type RegisterFn = (table: string, callback: (payload: any) => void) => () => void;

interface DashboardRealtimeContextType {
  registerMain: RegisterFn;
  registerFlights: RegisterFn;
}

export const DashboardRealtimeContext = createContext<DashboardRealtimeContextType | null>(null);

export function useDashboardRealtimeContext() {
  const ctx = useContext(DashboardRealtimeContext);
  if (!ctx) {
    throw new Error("useDashboardRealtimeContext must be used within DashboardRealtimeContext.Provider");
  }
  return ctx;
}
