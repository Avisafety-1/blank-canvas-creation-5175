import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, Plane, CheckCircle, XCircle, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { usePlanGating } from "@/hooks/usePlanGating";

interface PendingDjiLog {
  id: string;
  dji_log_id: string;
  aircraft_name: string | null;
  aircraft_sn: string | null;
  flight_date: string | null;
  duration_seconds: number | null;
  max_height_m: number | null;
  total_distance_m: number | null;
  matched_drone_id: string | null;
  matched_battery_id: string | null;
  status: string;
  error_message: string | null;
  error_code: string | null;
  last_error_at: string | null;
  retry_count: number | null;
  created_at: string;
  parsed_result: any;
  user_id: string | null;
  ownerName?: string | null;
}

interface PendingDjiLogsSectionProps {
  onSelectLog: (log: PendingDjiLog) => void;
  expanded?: boolean;
}

export interface PendingDjiLogsSectionRef {
  refresh: () => void;
  updateLog: (id: string, patch: Partial<PendingDjiLog>) => void;
}

const PAGE_SIZE = 200;

export const PendingDjiLogsSection = forwardRef<PendingDjiLogsSectionRef, PendingDjiLogsSectionProps>(({ onSelectLog, expanded }, ref) => {
  const { companyId, user } = useAuth();
  const { hasAddon } = usePlanGating();
  const [logs, setLogs] = useState<PendingDjiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const djiEnabled = hasAddon('dji');

  useImperativeHandle(ref, () => ({
    refresh: () => { if (companyId) fetchPendingLogs(0, true); },
    updateLog: (id, patch) => {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    },
  }));

  useEffect(() => {
    if (companyId) fetchPendingLogs(0, true);
  }, [companyId, onlyMine]);

  const fetchPendingLogs = async (offset: number, replace: boolean) => {
    if (!companyId) return;
    if (replace) setLoading(true); else setLoadingMore(true);

    let query = supabase
      .from("pending_dji_logs")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending");

    if (onlyMine && user?.id) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query
      .order("flight_date", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching pending logs:", error);
    }

    let rawLogs = (data || []) as PendingDjiLog[];

    // Sort: errored or unparsed first (so they're visible)
    rawLogs.sort((a, b) => {
      const aPriority = a.error_code ? 0 : !a.parsed_result ? 1 : 2;
      const bPriority = b.error_code ? 0 : !b.parsed_result ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aDate = a.flight_date ? new Date(a.flight_date).getTime() : 0;
      const bDate = b.flight_date ? new Date(b.flight_date).getTime() : 0;
      return bDate - aDate;
    });

    // Fetch owner names for unique user_ids
    const userIds = [...new Set(rawLogs.map(l => l.user_id).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      rawLogs.forEach(l => { l.ownerName = l.user_id ? nameMap.get(l.user_id) || null : null; });
    }

    setHasMore(rawLogs.length === PAGE_SIZE);
    setLogs(prev => replace ? rawLogs : [...prev, ...rawLogs]);
    setLoading(false);
    setLoadingMore(false);
  };

  const handleDismiss = async (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    setDismissingId(logId);
    const { error } = await supabase
      .from("pending_dji_logs")
      .update({ status: "dismissed" })
      .eq("id", logId);

    if (error) {
      toast.error("Kunne ikke avvise loggen");
      console.error("Dismiss error:", error);
    } else {
      setLogs(prev => prev.filter(l => l.id !== logId));
      toast.success("Logg fjernet");
    }
    setDismissingId(null);
  };

  if (!djiEnabled) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Sjekker ventende logger...</span>
      </div>
    );
  }

  // Filter is now applied serverside via the onlyMine flag in fetchPendingLogs
  const displayedLogs = logs;

  return (
    <div className={`space-y-2 ${expanded ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">Ventende flylogger fra auto-sync</p>
        <Badge variant="secondary" className="text-xs">{displayedLogs.length}{hasMore ? "+" : ""}</Badge>
        <div className="flex items-center gap-1.5 ml-auto">
          <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
          <Label htmlFor="only-mine" className="text-xs text-muted-foreground cursor-pointer">Kun mine</Label>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        Finner du ikke riktig logg? Enkelte loggtyper støttes ikke av auto-sync og må lastes opp manuelt.
      </p>
      {displayedLogs.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">
          {onlyMine ? "Ingen ventende logger på deg. Skru av «Kun mine» for å se andres." : "Ingen logger til behandling"}
        </p>
      )}
      <div className={`space-y-1.5 overflow-y-auto ${expanded ? 'flex-1 min-h-0' : 'max-h-[200px]'}`}>
        {displayedLogs.map(log => {
          const ownerName = log.ownerName;
          // Determine if this log has a recent error (rate-limit cooldown = 2 min)
          const hasError = !!log.error_code;
          const isRateLimited =
            log.error_code === "rate_limit" &&
            log.last_error_at &&
            (Date.now() - new Date(log.last_error_at).getTime()) < 2 * 60 * 1000;
          const errorLabel =
            log.error_code === "rate_limit" ? "DJI begrenser forespørsler – vent litt før du prøver igjen"
            : log.error_code === "parse_error" ? "Loggfilen kan ikke parses (DJI avviste filen)"
            : log.error_code === "login_failed" ? "Innlogging mot DJI feilet"
            : log.error_code === "download_failed" ? "Kunne ikke laste ned loggfilen fra DJI"
            : log.error_message || null;
          return (
            <button
              key={log.id}
              onClick={() => onSelectLog(log)}
              disabled={isRateLimited}
              title={errorLabel || undefined}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left group ${
                isRateLimited
                  ? "border-yellow-500/40 bg-yellow-500/5 cursor-not-allowed opacity-70"
                  : hasError
                    ? "border-destructive/40 hover:border-destructive/60 hover:bg-muted/30"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Plane className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium truncate">
                    {log.aircraft_name || log.aircraft_sn || "Ukjent drone"}
                  </p>
                  {log.matched_drone_id && !hasError && (
                    <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                  )}
                  {!log.matched_drone_id && !hasError && (
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                  )}
                  {hasError && (
                    <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {log.flight_date
                    ? format(new Date(log.flight_date), "dd. MMM yyyy HH:mm", { locale: nb })
                    : "Ukjent dato"}
                  {log.duration_seconds
                    ? ` · ${Math.round(log.duration_seconds / 60)} min`
                    : ""}
                  {log.max_height_m ? ` · ${Math.round(log.max_height_m)}m` : ""}
                </p>
                {ownerName && (
                  <p className="text-[11px] text-muted-foreground">{ownerName}</p>
                )}
                {errorLabel && (
                  <p className={`text-[11px] mt-0.5 ${isRateLimited ? "text-yellow-600" : "text-destructive"}`}>
                    {errorLabel}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => handleDismiss(e, log.id)}
                disabled={dismissingId === log.id}
              >
                {dismissingId === log.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </Button>
            </button>
          );
        })}
      </div>
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => fetchPendingLogs(logs.length, false)}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Laster...</>
          ) : (
            "Last flere"
          )}
        </Button>
      )}
    </div>
  );
});
