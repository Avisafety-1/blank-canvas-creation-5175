import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, FileEdit, CheckCircle, Clock, Facebook, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

export const MarketingOverview = () => {
  const { companyId } = useAuth();

  const { data: ideaCount = 0 } = useQuery({
    queryKey: ["marketing-ideas-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_content_ideas")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: draftCount = 0 } = useQuery({
    queryKey: ["marketing-drafts-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "draft");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: approvedCount = 0 } = useQuery({
    queryKey: ["marketing-approved-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "approved");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: scheduledCount = 0 } = useQuery({
    queryKey: ["marketing-scheduled-count", companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("marketing_drafts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "scheduled");
      return count ?? 0;
    },
    enabled: !!companyId,
  });

  const { data: nextScheduled = [] } = useQuery({
    queryKey: ["marketing-next-scheduled", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_drafts")
        .select("id, title, platform, scheduled_at")
        .eq("company_id", companyId!)
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(3);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: recentPublished = [] } = useQuery({
    queryKey: ["marketing-recent-published", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_drafts")
        .select("id, title, platform, published_at")
        .eq("company_id", companyId!)
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!companyId,
  });

  const stats = [
    { label: "Idéer", value: ideaCount, icon: Lightbulb, color: "text-yellow-500" },
    { label: "Utkast", value: draftCount, icon: FileEdit, color: "text-blue-500" },
    { label: "Godkjent", value: approvedCount, icon: CheckCircle, color: "text-green-500" },
    { label: "Planlagt", value: scheduledCount, icon: Clock, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Marketing Oversikt</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">Administrer innholdsidéer og utkast for markedsføring.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Next scheduled */}
      {nextScheduled.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Neste planlagte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextScheduled.map((item: any) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-foreground font-medium truncate">{item.title}</span>
                  {item.platform && (
                    <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{item.platform}</Badge>
                  )}
                </div>
                <span className="text-orange-600 dark:text-orange-400 text-xs flex-shrink-0">
                  {formatDistanceToNow(new Date(item.scheduled_at), { addSuffix: true, locale: nb })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recently published */}
      {recentPublished.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Facebook className="w-4 h-4 text-blue-500" />
              Nylig publisert
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPublished.map((item: any) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-foreground font-medium truncate">{item.title}</span>
                  {item.platform && (
                    <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{item.platform}</Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs flex-shrink-0">
                  {format(new Date(item.published_at), "d. MMM HH:mm", { locale: nb })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
