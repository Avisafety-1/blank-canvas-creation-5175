import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

interface MonthData {
  month: string;
  hendelser: number;
}

export const KPIChart = () => {
  const { t, i18n } = useTranslation();
  const { companyId } = useAuth();
  const [chartData, setChartData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;

  useEffect(() => {
    fetchIncidentStats();

    const channel = supabase
      .channel('incidents-stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        () => {
          fetchIncidentStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchIncidentStats = async () => {
    try {
      const { data: incidents, error } = await supabase
        .from('incidents')
        .select('hendelsestidspunkt')
        .order('hendelsestidspunkt', { ascending: false });

      if (error) throw error;

      const monthsData: MonthData[] = [];
      const today = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        const count = incidents?.filter(incident => {
          const incidentDate = new Date(incident.hendelsestidspunkt);
          return incidentDate >= monthStart && incidentDate <= monthEnd;
        }).length || 0;

        monthsData.push({
          month: format(monthDate, 'MMM', { locale: dateLocale }),
          hendelser: count
        });
      }

      setChartData(monthsData);
    } catch (error) {
      console.error('Error fetching incident stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="h-auto overflow-hidden">
        <div className="flex items-center gap-2 mb-3 min-w-0">
          <TrendingUp className="w-5 h-5 text-primary flex-shrink-0" />
          <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.kpi.title')}</h2>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('dashboard.kpi.loading')}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="h-auto overflow-hidden">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <TrendingUp className="w-5 h-5 text-primary flex-shrink-0" />
        <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.kpi.title')}</h2>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" className="text-sm" />
          <YAxis className="text-sm" allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Bar dataKey="hendelser" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};
