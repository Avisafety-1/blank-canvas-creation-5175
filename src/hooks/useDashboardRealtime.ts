import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

type Callback = (payload: any) => void;

interface TableCallbacks {
  [table: string]: Callback[];
}

/**
 * Shared dashboard realtime channel.
 *
 * Instead of each dashboard component opening its own Supabase channel,
 * this hook creates ONE channel (`dashboard-main`) with multiple `.on()` listeners.
 * Components register their callbacks via the returned `register` function.
 *
 * A second channel (`dashboard-flights`) handles active_flights + dronetag_positions.
 */
export function useDashboardRealtime() {
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();
  const mainCallbacksRef = useRef<TableCallbacks>({});
  const flightsCallbacksRef = useRef<TableCallbacks>({});

  // Register a callback for a table on the main channel
  const registerMain = (table: string, callback: Callback) => {
    if (!mainCallbacksRef.current[table]) {
      mainCallbacksRef.current[table] = [];
    }
    mainCallbacksRef.current[table].push(callback);

    // Return unregister function
    return () => {
      const arr = mainCallbacksRef.current[table];
      if (arr) {
        mainCallbacksRef.current[table] = arr.filter((cb) => cb !== callback);
      }
    };
  };

  // Register a callback for a table on the flights channel
  const registerFlights = (table: string, callback: Callback) => {
    if (!flightsCallbacksRef.current[table]) {
      flightsCallbacksRef.current[table] = [];
    }
    flightsCallbacksRef.current[table].push(callback);

    return () => {
      const arr = flightsCallbacksRef.current[table];
      if (arr) {
        flightsCallbacksRef.current[table] = arr.filter((cb) => cb !== callback);
      }
    };
  };

  useEffect(() => {
    if (!user) return;

    const dispatch = (ref: React.RefObject<TableCallbacks>, table: string) => (payload: any) => {
      const cbs = ref.current?.[table];
      if (cbs) {
        cbs.forEach((cb) => cb(payload));
      }
    };

    // ---- dashboard-main channel ----
    const mainChannel = supabase
      .channel("dashboard-main")
      // Status data tables (previously in useStatusData)
      .on("postgres_changes", { event: "*", schema: "public", table: "drones" }, (p) => {
        dispatch(mainCallbacksRef, "drones")(p);
        queryClient.invalidateQueries({ queryKey: ["drones", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, (p) => {
        dispatch(mainCallbacksRef, "equipment")(p);
        queryClient.invalidateQueries({ queryKey: ["equipment", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
        dispatch(mainCallbacksRef, "profiles")(p);
        queryClient.invalidateQueries({ queryKey: ["personnel", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "personnel_competencies" }, (p) => {
        dispatch(mainCallbacksRef, "personnel_competencies")(p);
        queryClient.invalidateQueries({ queryKey: ["personnel", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drone_accessories" }, (p) => {
        dispatch(mainCallbacksRef, "drone_accessories")(p);
        queryClient.invalidateQueries({ queryKey: ["drones", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drone_equipment" }, (p) => {
        dispatch(mainCallbacksRef, "drone_equipment")(p);
        queryClient.invalidateQueries({ queryKey: ["drones", companyId] });
      })
      // Incidents
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, dispatch(mainCallbacksRef, "incidents"))
      // Incident comments
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_comments" }, dispatch(mainCallbacksRef, "incident_comments"))
      // Missions
      .on("postgres_changes", { event: "*", schema: "public", table: "missions" }, dispatch(mainCallbacksRef, "missions"))
      // Documents
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, dispatch(mainCallbacksRef, "documents"))
      // Calendar events
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, dispatch(mainCallbacksRef, "calendar_events"))
      // News
      .on("postgres_changes", { event: "*", schema: "public", table: "news" }, dispatch(mainCallbacksRef, "news"))
      .subscribe();

    // ---- dashboard-flights channel ----
    const flightsChannel = supabase
      .channel("dashboard-flights")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_flights" }, dispatch(flightsCallbacksRef, "active_flights"))
      .on("postgres_changes", { event: "*", schema: "public", table: "dronetag_positions" }, dispatch(flightsCallbacksRef, "dronetag_positions"))
      .subscribe();

    return () => {
      supabase.removeChannel(mainChannel);
      supabase.removeChannel(flightsChannel);
    };
  }, [user, companyId, queryClient]);

  return { registerMain, registerFlights };
}
