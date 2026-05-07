import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plane, Clock, MapPin, Radio, User, Building2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";

interface ActiveFlight {
  id: string;
  start_time: string;
  publish_mode: string | null;
  pilot_name: string | null;
  mission_id: string | null;
  profile_id: string;
  profileName?: string;
  missionTitle?: string;
  companyName?: string;
}

export const ActiveFlightsSection = ({ onHasFlightsChange }: { onHasFlightsChange?: (has: boolean) => void }) => {
  const { t } = useTranslation();
  const { companyId, companyName } = useAuth();
  const { isSuperAdmin } = useRoleCheck();
  const { registerFlights } = useDashboardRealtimeContext();
  const navigate = useNavigate();
  const [flights, setFlights] = useState<ActiveFlight[]>([]);
  const [now, setNow] = useState(Date.now());
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [isParentCompany, setIsParentCompany] = useState(false);

  const isSuperAdminAvisafe = isSuperAdmin && companyName === 'Avisafe';

  const fetchFlights = useCallback(async () => {
    if (!companyId && !isSuperAdminAvisafe) return;

    // Check for child companies to determine if this is a parent company
    let childIds: string[] = [];
    if (!isSuperAdminAvisafe && companyId) {
      const { data: children } = await supabase
        .from('companies')
        .select('id')
        .eq('parent_company_id', companyId);
      childIds = (children || []).map((c: any) => c.id);
    }
    const hasChildren = childIds.length > 0;
    setIsParentCompany(hasChildren);

    let query = (supabase as any)
      .from('active_flights')
      .select('id, start_time, publish_mode, pilot_name, mission_id, profile_id, profiles:profile_id(full_name), missions:mission_id(tittel), companies:company_id(navn)');

    if (!isSuperAdminAvisafe) {
      if (hasChildren) {
        query = query.in('company_id', [companyId, ...childIds]);
      } else {
        query = query.eq('company_id', companyId);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching active flights:', error);
      return;
    }

    const mapped: ActiveFlight[] = (data || []).map((f: any) => ({
      id: f.id,
      start_time: f.start_time,
      publish_mode: f.publish_mode,
      pilot_name: f.pilot_name,
      mission_id: f.mission_id,
      profile_id: f.profile_id,
      profileName: f.profiles?.full_name || null,
      missionTitle: f.missions?.tittel || null,
      companyName: f.companies?.navn || null,
    }));

    setFlights(mapped);
    onHasFlightsChange?.(mapped.length > 0);
  }, [companyId, onHasFlightsChange, isSuperAdminAvisafe]);

  useEffect(() => {
    fetchFlights();
  }, [fetchFlights]);

  // Real-time via shared flights channel
  useEffect(() => {
    const unregister = registerFlights('active_flights', () => {
      fetchFlights();
    });
    return unregister;
  }, [registerFlights, fetchFlights]);

  // Tick elapsed time every second
  useEffect(() => {
    if (flights.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [flights.length]);

  const formatElapsed = (startTime: string) => {
    const seconds = Math.max(0, Math.floor((now - new Date(startTime).getTime()) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleFlightClick = async (flight: ActiveFlight) => {
    if (!flight.mission_id) {
      navigate('/kart', { state: { focusFlightId: flight.id } });
      return;
    }
    const { data, error } = await supabase
      .from('missions')
      .select('*')
      .eq('id', flight.mission_id)
      .maybeSingle();

    if (error || !data) {
      navigate('/kart', { state: { focusFlightId: flight.id } });
      return;
    }
    setSelectedMission(data);
    setMissionDialogOpen(true);
  };

  const handleViewOnMap = (e: React.MouseEvent, flightId: string) => {
    e.stopPropagation();
    navigate('/kart', { state: { focusFlightId: flightId } });
  };

  if (flights.length === 0) {
    return (
      <GlassCard className="hidden lg:block">
        <div className="flex items-center gap-2 mb-2">
          <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h2 className="text-sm sm:text-base font-semibold">{t('dashboard.activeFlights.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">{t('dashboard.activeFlights.noFlights')}</p>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <h2 className="text-sm sm:text-base font-semibold">{t('dashboard.activeFlights.title')}</h2>
            <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 text-[10px] sm:text-xs">
              {flights.length}
            </Badge>
          </div>
        </div>

        <div className={`space-y-1.5 sm:space-y-2 ${(isSuperAdminAvisafe || isParentCompany) ? 'max-h-[400px]' : 'max-h-[250px]'} overflow-y-auto`}>
          {flights.map((flight) => (
            <div
              key={flight.id}
              onClick={() => handleFlightClick(flight)}
              className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-xs sm:text-sm truncate">
                    {flight.missionTitle || t('dashboard.activeFlights.freeFlight')}
                  </h3>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {flight.publish_mode && flight.publish_mode !== 'none' && (
                    <Radio className="w-3 h-3 text-primary animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <User className="w-3 h-3" />
                <span className="truncate">{flight.pilot_name || flight.profileName || t('common.unknownName')}</span>
              </div>
              {(isSuperAdminAvisafe || isParentCompany) && flight.companyName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Building2 className="w-3 h-3" />
                  <span className="truncate">{flight.companyName}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={(e) => handleViewOnMap(e, flight.id)}
                >
                  <MapPin className="w-3 h-3 mr-1" />
                  {t('dashboard.activeFlights.viewOnMap')}
                </Button>
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 text-xs sm:text-sm font-mono px-2.5 py-1">
                  <Clock className="w-3.5 h-3.5 mr-1.5" />
                  {formatElapsed(flight.start_time)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <MissionDetailDialog
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        mission={selectedMission}
      />
    </>
  );
};
