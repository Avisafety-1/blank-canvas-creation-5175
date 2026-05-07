import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Target,
  Shield,
  AlertTriangle,
  FileText,
  UserPlus,
  Package,
  Wrench,
  ChevronDown,
  Activity,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

interface ActivityItem {
  type: string;
  description: string;
  person: string;
  company: string;
  timestamp: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  mission: { icon: Target, label: "Oppdrag", color: "text-primary" },
  risk_assessment: { icon: Shield, label: "Risikovurdering", color: "text-purple-500" },
  incident: { icon: AlertTriangle, label: "Hendelse", color: "text-destructive" },
  document: { icon: FileText, label: "Dokument", color: "text-green-500" },
  new_user: { icon: UserPlus, label: "Ny bruker", color: "text-blue-500" },
  drone: { icon: Package, label: "Drone", color: "text-orange-500" },
  equipment: { icon: Wrench, label: "Utstyr", color: "text-muted-foreground" },
};

interface Props {
  excludeAvisafe: boolean;
}

export const PlatformActivityLog = ({ excludeAvisafe }: Props) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-activity-log?exclude_avisafe=${excludeAvisafe}&limit=200`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error("Failed to fetch activity log:", err);
    } finally {
      setLoading(false);
    }
  }, [excludeAvisafe]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const formatRelativeTime = (ts: string) => {
    try {
      return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: nb });
    } catch {
      return ts;
    }
  };

  const formatFullTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString("nb-NO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Aktivitetslogg</h3>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="hide-log" className="text-xs text-muted-foreground cursor-pointer">Skjul</Label>
          <Switch id="hide-log" checked={hidden} onCheckedChange={setHidden} />
        </div>
      </div>

      {hidden ? null : (
        <>
      {loading && activities.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Laster aktivitet...
        </div>
      ) : (
        <>
          <div className="overflow-y-auto max-h-[220px] border rounded-md">
            <TooltipProvider>
              <table className="w-full caption-bottom text-[11px] sm:text-sm">
                <thead className="[&_tr]:border-b sticky top-0 bg-card z-10">
                  <tr className="border-b">
                    <th className="h-8 sm:h-10 px-2 sm:px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                    <th className="h-8 sm:h-10 px-2 sm:px-4 text-left align-middle font-medium text-muted-foreground">Beskrivelse</th>
                    <th className="h-8 sm:h-10 px-2 sm:px-4 text-left align-middle font-medium text-muted-foreground">Person</th>
                    <th className="h-8 sm:h-10 px-2 sm:px-4 text-left align-middle font-medium text-muted-foreground">Selskap</th>
                    <th className="h-8 sm:h-10 px-2 sm:px-4 text-right align-middle font-medium text-muted-foreground">Tid</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {activities.map((item, i) => {
                    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.equipment;
                    const Icon = config.icon;
                    return (
                      <tr key={`${item.type}-${item.timestamp}-${i}`} className="border-b transition-colors hover:bg-muted/50">
                        <td className="py-1.5 sm:py-2 px-2 sm:px-4 align-middle">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Icon className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${config.color}`} />
                            <span className="whitespace-nowrap">{config.label}</span>
                          </div>
                        </td>
                        <td className="py-1.5 sm:py-2 px-2 sm:px-4 align-middle max-w-[80px] sm:max-w-[200px] truncate text-foreground">
                          {item.description}
                        </td>
                        <td className="py-1.5 sm:py-2 px-2 sm:px-4 align-middle text-muted-foreground max-w-[60px] sm:max-w-none truncate">
                          {item.person}
                        </td>
                        <td className="py-1.5 sm:py-2 px-2 sm:px-4 align-middle text-muted-foreground max-w-[60px] sm:max-w-none truncate">
                          {item.company}
                        </td>
                        <td className="py-1.5 sm:py-2 px-2 sm:px-4 align-middle text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-default whitespace-nowrap">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatFullTime(item.timestamp)}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                  {activities.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-8">
                        Ingen aktivitet funnet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TooltipProvider>
          </div>

        </>
      )}
        </>
      )}
    </GlassCard>
  );
};
