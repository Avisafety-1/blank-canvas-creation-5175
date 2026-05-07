import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Newspaper, Pin, Plus } from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import { NewsDetailDialog } from "./NewsDetailDialog";
import { AddNewsDialog } from "./AddNewsDialog";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";

type News = any;

export const NewsSection = () => {
  const { t, i18n } = useTranslation();
  const { companyId } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [news, setNews] = useState<News[]>([]);

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;
  
  useEffect(() => {
    fetchNews();
  }, [companyId]);

  // Real-time via shared dashboard channel
  useEffect(() => {
    const unregister = registerMain('news', () => {
      if (!navigator.onLine) return;
      fetchNews();
    });
    return unregister;
  }, [registerMain]);

  const fetchNews = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<News[]>(`offline_dashboard_news_${companyId}`);
      if (cached) setNews(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) return;

    // 3. Fetch fresh data
    try {
      const { data, error } = await (supabase as any)
        .from('news')
        .select('*')
        .order('publisert', { ascending: false });

      if (error) throw error;
      setNews(data || []);
      if (companyId) setCachedData(`offline_dashboard_news_${companyId}`, data || []);
    } catch (error) {
      console.error('Error fetching news:', error);
    }
  };
  
  const sortedNews = [...news].sort((a, b) => {
    if (a.pin_on_top && !b.pin_on_top) return -1;
    if (!a.pin_on_top && b.pin_on_top) return 1;
    return new Date(b.publisert).getTime() - new Date(a.publisert).getTime();
  });

  const handleNewsClick = (news: News) => {
    setSelectedNews(news);
    setDialogOpen(true);
  };

  const handleEdit = (news: News) => {
    setEditingNews(news);
    setDialogOpen(false);
    setAddDialogOpen(true);
  };

  const handleAddDialogClose = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) {
      setEditingNews(null);
    }
  };

  return (
    <>
      <GlassCard className="h-full overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Newspaper className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.news.title')}</h2>
          </div>
          <Button
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            className="h-7 sm:h-8 px-2 sm:px-3"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="text-xs sm:text-sm">{t('dashboard.news.addNew')}</span>
          </Button>
        </div>

      <div className="flex gap-2 sm:gap-3 flex-1 overflow-x-auto pb-2">
        {sortedNews.map((news) => (
          <div
            key={news.id}
            onClick={() => handleNewsClick(news)}
            className="p-3 sm:p-4 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer flex-shrink-0 w-[280px] sm:w-[320px]"
          >
            <div className="flex items-start gap-1.5 sm:gap-2">
              {news.visible_to_children && news.company_id !== companyId && (
                <Building2 className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              {news.pin_on_top && (
                <Pin className="w-3 h-3 sm:w-4 sm:h-4 text-primary flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-xs sm:text-sm mb-1">{news.tittel}</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-3 mb-1 sm:mb-1.5">
                  {news.innhold}
                </p>
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                  <span>{format(new Date(news.publisert), "dd. MMM", { locale: dateLocale })}</span>
                  <span>•</span>
                  <span className="truncate">{news.forfatter}</span>
                  {news.synlighet !== "Alle" && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                        {news.synlighet}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
    
      <NewsDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        news={selectedNews}
        onEdit={handleEdit}
      />
      
      <AddNewsDialog
        open={addDialogOpen}
        onOpenChange={handleAddDialogClose}
        news={editingNews}
      />
    </>
  );
};
