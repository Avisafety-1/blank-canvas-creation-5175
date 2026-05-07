import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const SESSION_ID = crypto.randomUUID();
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Sends a heartbeat to map_viewer_heartbeats while the user is logged in,
 * so the SafeSky edge function knows there are active users and keeps
 * the beacon cache populated — even before the map page is opened.
 */
export function useAppHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<number | null>(null);
  const skipCyclesRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async () => {
      // Backoff: skip cycles after errors
      if (skipCyclesRef.current > 0) {
        skipCyclesRef.current--;
        return;
      }
      try {
        const { error } = await supabase
          .from("map_viewer_heartbeats")
          .upsert(
            {
              session_id: SESSION_ID,
              user_id: user.id,
              last_seen: new Date().toISOString(),
            },
            { onConflict: "session_id" }
          );
        if (error) {
          console.error("Heartbeat error:", error);
          skipCyclesRef.current = 2; // Skip next 2 cycles (~60s)
        }
      } catch (err) {
        console.error("Heartbeat failed:", err);
        skipCyclesRef.current = 2;
      }
    };

    const deleteHeartbeat = async () => {
      try {
        await supabase
          .from("map_viewer_heartbeats")
          .delete()
          .eq("session_id", SESSION_ID);
      } catch {}
    };

    // Send immediately, then every 30s
    sendHeartbeat();
    intervalRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Pause when tab is hidden, resume when visible
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        sendHeartbeat();
        if (!intervalRef.current) {
          intervalRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      deleteHeartbeat();
    };
  }, [user]);
}
