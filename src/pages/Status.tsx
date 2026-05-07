import { useQueryClient } from "@tanstack/react-query";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/GlassCard";
import droneBackground from "@/assets/drone-background.png";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, AlertTriangle, Clock, Package, Download, CalendarIcon, ChevronRight, ChevronLeft } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, parseISO, isValid } from "date-fns";
import { nb } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, formatDateForPdf, getPdfFontName } from "@/lib/pdfUtils";

interface KPIData {
  totalMissions: number;
  completedMissions: number;
  totalFlightHours: number;
  incidentRate: number;
  activeResources: number;
}

interface MonthData {
  month: string;
  count: number;
}

interface StatusData {
  name: string;
  value: number;
}

const COLORS = {
  primary: "hsl(var(--primary))",
  destructive: "hsl(var(--destructive))",
  warning: "hsl(var(--status-yellow))",
  success: "hsl(var(--status-green))",
  muted: "hsl(var(--muted-foreground))",
};

const Status = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<"month" | "quarter" | "year" | "custom">("year");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [kpiData, setKpiData] = useState<KPIData>({
    totalMissions: 0,
    completedMissions: 0,
    totalFlightHours: 0,
    incidentRate: 0,
    activeResources: 0,
  });
  const [missionsByMonth, setMissionsByMonth] = useState<MonthData[]>([]);
  const [missionsByStatus, setMissionsByStatus] = useState<StatusData[]>([]);
  const [missionsByRisk, setMissionsByRisk] = useState<StatusData[]>([]);
  const [incidentsByMonth, setIncidentsByMonth] = useState<MonthData[]>([]);
  const [incidentsByMainCause, setIncidentsByMainCause] = useState<StatusData[]>([]);
  const [incidentsByContributingCause, setIncidentsByContributingCause] = useState<StatusData[]>([]);
  const [incidentsBySeverity, setIncidentsBySeverity] = useState<StatusData[]>([]);
  const [daysSinceLastSevere, setDaysSinceLastSevere] = useState<number>(0);
  const [droneStatus, setDroneStatus] = useState<StatusData[]>([]);
  const [equipmentStatus, setEquipmentStatus] = useState<StatusData[]>([]);
  const [flightHoursByDrone, setFlightHoursByDrone] = useState<any[]>([]);
  const [operationTypeStats, setOperationTypeStats] = useState<{
    counts: { name: string; value: number }[];
    hours: { name: string; value: number }[];
    monthly: { month: string; VLOS: number; BVLOS: number; EVLOS: number }[];
    totalFlights: number;
    totalMinutes: number;
  }>({ counts: [], hours: [], monthly: [], totalFlights: 0, totalMinutes: 0 });
  const [expiringDocs, setExpiringDocs] = useState<{ thirtyDays: number; sixtyDays: number; ninetyDays: number }>({
    thirtyDays: 0,
    sixtyDays: 0,
    ninetyDays: 0,
  });

  // Deviation reports view state
  const [activeView, setActiveView] = useState<"operational" | "deviation">("operational");
  const [deviationReports, setDeviationReports] = useState<Array<{
    id: string;
    mission_id: string | null;
    category_path: string[];
    comment: string | null;
    created_at: string;
    reported_by: string | null;
    reporter_name?: string | null;
  }>>([]);
  const [flightLogsCount, setFlightLogsCount] = useState(0);
  const [deviationDrillPath, setDeviationDrillPath] = useState<string[]>([]);
  const [deviationPage, setDeviationPage] = useState(1);
  const [companySettings, setCompanySettings] = useState<{ deviation_report_enabled: boolean }>({ deviation_report_enabled: false });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // Don't fetch if custom period is selected but dates are incomplete
    if (timePeriod === "custom" && (!customDateFrom || !customDateTo)) {
      return;
    }

    fetchAllStatistics();
  }, [user, navigate, timePeriod, companyId, customDateFrom, customDateTo]);

  const fetchAllStatistics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchKPIData(),
        fetchMissionStatistics(),
        fetchIncidentStatistics(),
        fetchResourceStatistics(),
        fetchDocumentStatistics(),
        fetchDeviationStatistics(),
        fetchOperationTypeStatistics(),
      ]);
      // Cache all state after successful fetch
      if (companyId) {
        setCachedData(`offline_status_loaded_${companyId}`, true);
      }
    } catch (error) {
      console.error("Error fetching statistics:", error);
      // Try loading from cache if offline
      if (!navigator.onLine && companyId) {
        const cached = getCachedData<any>(`offline_status_kpi_${companyId}`);
        if (cached) setKpiData(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = (): { startDate: Date; endDate: Date } => {
    const now = new Date();
    
    if (timePeriod === "custom" && customDateFrom && customDateTo) {
      return { startDate: customDateFrom, endDate: customDateTo };
    }
    
    switch (timePeriod) {
      case "month":
        return { startDate: subMonths(now, 1), endDate: now };
      case "quarter":
        return { startDate: subMonths(now, 3), endDate: now };
      case "year":
      default:
        return { startDate: subMonths(now, 12), endDate: now };
    }
  };

  const getMonthsToShow = (): number => {
    if (timePeriod === "custom" && customDateFrom && customDateTo) {
      const diffTime = Math.abs(customDateTo.getTime() - customDateFrom.getTime());
      const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
      return Math.max(1, diffMonths);
    }
    return timePeriod === "month" ? 1 : timePeriod === "quarter" ? 3 : 12;
  };

  const fetchKPIData = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: missions } = await supabase
      .from("missions")
      .select("status, tidspunkt")
      .gte("tidspunkt", startDate.toISOString())
      .lte("tidspunkt", endDate.toISOString());
    const { data: drones } = await supabase.from("drones").select("flyvetimer, aktiv");
    const { data: equipment } = await supabase.from("equipment").select("aktiv");
    const { data: incidents } = await supabase
      .from("incidents")
      .select("*")
      .gte("hendelsestidspunkt", startDate.toISOString())
      .lte("hendelsestidspunkt", endDate.toISOString());

    const totalMissions = missions?.length || 0;
    const completedMissions = missions?.filter((m) => m.status === "Fullført").length || 0;
    const totalFlightHours = drones?.reduce((sum, d) => sum + (d.flyvetimer || 0), 0) || 0;
    const activeDrones = drones?.filter((d) => d.aktiv).length || 0;
    const activeEquipment = equipment?.filter((e) => e.aktiv).length || 0;
    const incidentRate = totalFlightHours > 0 ? ((incidents?.length || 0) / totalFlightHours) * 100 : 0;

    setKpiData({
      totalMissions,
      completedMissions,
      totalFlightHours,
      incidentRate,
      activeResources: activeDrones + activeEquipment,
    });
  };

  const fetchMissionStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: missions } = await supabase
      .from("missions")
      .select("tidspunkt, status, risk_nivå")
      .gte("tidspunkt", startDate.toISOString())
      .lte("tidspunkt", endDate.toISOString()) as any;

    if (!missions) return;

    // Missions by month (based on selected period)
    const monthsToShow = getMonthsToShow();
    const monthlyData: { [key: string]: number } = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const monthKey = format(monthDate, "MMM yyyy", { locale: nb });
      monthlyData[monthKey] = 0;
    }

    missions.forEach((mission: any) => {
      const missionDate = new Date(mission.tidspunkt);
      const monthKey = format(missionDate, "MMM yyyy", { locale: nb });
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey]++;
      }
    });

    setMissionsByMonth(
      Object.entries(monthlyData).map(([month, count]) => ({ month, count }))
    );

    // Missions by status
    const statusCounts: { [key: string]: number } = {};
    missions.forEach((m: any) => {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
    });
    setMissionsByStatus(
      Object.entries(statusCounts).map(([name, value]) => ({ name, value }))
    );

    // Missions by risk level
    const riskCounts: { [key: string]: number } = {};
    missions.forEach((m: any) => {
      riskCounts[m.risk_nivå] = (riskCounts[m.risk_nivå] || 0) + 1;
    });
    setMissionsByRisk(
      Object.entries(riskCounts).map(([name, value]) => ({ name, value }))
    );
  };

  const fetchIncidentStatistics = async () => {
    const { startDate, endDate } = getDateFilter();
    
    const { data: incidents } = await supabase
      .from("incidents")
      .select("hendelsestidspunkt, hovedaarsak, medvirkende_aarsak, alvorlighetsgrad")
      .gte("hendelsestidspunkt", startDate.toISOString())
      .lte("hendelsestidspunkt", endDate.toISOString())
      .order("hendelsestidspunkt", { ascending: false });

    if (!incidents) return;

    // Incidents by month (based on selected period)
    const monthsToShow = getMonthsToShow();
    const monthlyData: { [key: string]: number } = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const monthKey = format(monthDate, "MMM yyyy", { locale: nb });
      monthlyData[monthKey] = 0;
    }

    incidents.forEach((incident) => {
      const incidentDate = new Date(incident.hendelsestidspunkt);
      const monthKey = format(incidentDate, "MMM yyyy", { locale: nb });
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey]++;
      }
    });

    setIncidentsByMonth(
      Object.entries(monthlyData).map(([month, count]) => ({ month, count }))
    );

    // Incidents by main cause (hovedårsak)
    const mainCauseCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      const cause = i.hovedaarsak || "Ikke angitt";
      mainCauseCounts[cause] = (mainCauseCounts[cause] || 0) + 1;
    });
    setIncidentsByMainCause(
      Object.entries(mainCauseCounts).map(([name, value]) => ({ name, value }))
    );

    // Incidents by contributing cause (medvirkende årsak)
    const contributingCauseCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      const cause = i.medvirkende_aarsak || "Ikke angitt";
      contributingCauseCounts[cause] = (contributingCauseCounts[cause] || 0) + 1;
    });
    setIncidentsByContributingCause(
      Object.entries(contributingCauseCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    );

    // Incidents by severity
    const severityCounts: { [key: string]: number } = {};
    incidents.forEach((i) => {
      severityCounts[i.alvorlighetsgrad] = (severityCounts[i.alvorlighetsgrad] || 0) + 1;
    });
    setIncidentsBySeverity(
      Object.entries(severityCounts).map(([name, value]) => ({ name, value }))
    );

    // Days since last severe incident
    const severeIncident = incidents.find((i) => i.alvorlighetsgrad === "Alvorlig");
    if (severeIncident) {
      const daysSince = Math.floor(
        (new Date().getTime() - new Date(severeIncident.hendelsestidspunkt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      setDaysSinceLastSevere(daysSince);
    } else {
      setDaysSinceLastSevere(999);
    }
  };

  const fetchResourceStatistics = async () => {
    const { data: drones } = await supabase.from("drones").select("status, flyvetimer, modell, serienummer");
    const { data: equipment } = await supabase.from("equipment").select("status");

    if (drones) {
      const statusCounts: { [key: string]: number } = {};
      drones.forEach((d) => {
        statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
      });
      setDroneStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      // Flight hours by drone (top 10)
      const sortedDrones = [...drones]
        .sort((a, b) => b.flyvetimer - a.flyvetimer)
        .slice(0, 10)
        .map((d) => ({
          name: `${d.modell} (SN: ${d.serienummer})`,
          hours: d.flyvetimer,
        }));
      setFlightHoursByDrone(sortedDrones);
    }

    if (equipment) {
      const statusCounts: { [key: string]: number } = {};
      equipment.forEach((e) => {
        statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
      });
      setEquipmentStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));
    }
  };

  const fetchDocumentStatistics = async () => {
    const { data: documents } = await supabase.from("documents").select("gyldig_til");

    if (!documents) return;

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    let thirtyCount = 0;
    let sixtyCount = 0;
    let ninetyCount = 0;

    documents.forEach((doc) => {
      if (!doc.gyldig_til) return;
      const expiryDate = new Date(doc.gyldig_til);
      if (expiryDate > now && expiryDate <= thirtyDays) thirtyCount++;
      else if (expiryDate > thirtyDays && expiryDate <= sixtyDays) sixtyCount++;
      else if (expiryDate > sixtyDays && expiryDate <= ninetyDays) ninetyCount++;
    });

  };

  const fetchDeviationStatistics = async () => {
    if (!companyId) return;
    const { startDate, endDate } = getDateFilter();

    // Fetch company setting
    const { data: companyData } = await supabase
      .from("companies")
      .select("deviation_report_enabled")
      .eq("id", companyId)
      .single();
    setCompanySettings({ deviation_report_enabled: (companyData as any)?.deviation_report_enabled ?? false });

    // Fetch reports in period
    const { data: reports, error } = await (supabase as any)
      .from("mission_deviation_reports")
      .select("id, mission_id, category_path, comment, created_at, reported_by")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Deviation] fetch error", error);
      setDeviationReports([]);
      return;
    }

    const rows = (reports || []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.reported_by).filter(Boolean) as string[]));
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
    }
    setDeviationReports(rows.map((r) => ({ ...r, reporter_name: r.reported_by ? nameMap[r.reported_by] : null })));

    // Total flight logs in period for ratio KPI
    const { count } = await supabase
      .from("flight_logs")
      .select("id", { count: "exact", head: true })
      .gte("flight_date", startDate.toISOString().slice(0, 10))
      .lte("flight_date", endDate.toISOString().slice(0, 10));
    setFlightLogsCount(count || 0);
  };

  const fetchOperationTypeStatistics = async () => {
    const { startDate, endDate } = getDateFilter();

    const { data: logs } = await supabase
      .from("flight_logs")
      .select("operation_type, flight_duration_minutes, flight_date")
      .gte("flight_date", startDate.toISOString().slice(0, 10))
      .lte("flight_date", endDate.toISOString().slice(0, 10));

    const rows = (logs || []) as Array<{
      operation_type: string | null;
      flight_duration_minutes: number | null;
      flight_date: string;
    }>;

    const types: Array<"VLOS" | "BVLOS" | "EVLOS"> = ["VLOS", "BVLOS", "EVLOS"];
    const countMap: Record<string, number> = { VLOS: 0, BVLOS: 0, EVLOS: 0 };
    const minutesMap: Record<string, number> = { VLOS: 0, BVLOS: 0, EVLOS: 0 };

    rows.forEach((r) => {
      const t = (r.operation_type as "VLOS" | "BVLOS" | "EVLOS") || "VLOS";
      const safeType = types.includes(t) ? t : "VLOS";
      countMap[safeType]++;
      minutesMap[safeType] += Number(r.flight_duration_minutes || 0);
    });

    const monthsToShow = getMonthsToShow();
    const monthly: Record<string, { VLOS: number; BVLOS: number; EVLOS: number }> = {};
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthDate = subMonths(endDate, i);
      const key = format(monthDate, "MMM yyyy", { locale: nb });
      monthly[key] = { VLOS: 0, BVLOS: 0, EVLOS: 0 };
    }
    rows.forEach((r) => {
      const monthKey = format(new Date(r.flight_date), "MMM yyyy", { locale: nb });
      if (!monthly[monthKey]) return;
      const t = (r.operation_type as "VLOS" | "BVLOS" | "EVLOS") || "VLOS";
      const safeType = types.includes(t) ? t : "VLOS";
      monthly[monthKey][safeType]++;
    });

    setOperationTypeStats({
      counts: types.map((t) => ({ name: t, value: countMap[t] })),
      hours: types.map((t) => ({ name: t, value: +(minutesMap[t] / 60).toFixed(2) })),
      monthly: Object.entries(monthly).map(([month, v]) => ({ month, ...v })),
      totalFlights: rows.length,
      totalMinutes: minutesMap.VLOS + minutesMap.BVLOS + minutesMap.EVLOS,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90">
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">Laster statistikk...</div>
        </main>
      </div>
    );
  }

  const completionRate = kpiData.totalMissions > 0
    ? ((kpiData.completedMissions / kpiData.totalMissions) * 100).toFixed(1)
    : "0";

  const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // KPI Sheet
      const kpiSheetData = [
        ["Nøkkeltall (KPI)", ""],
        ["Totale oppdrag", kpiData.totalMissions],
        ["Fullførte oppdrag", kpiData.completedMissions],
        ["Fullføringsgrad", `${completionRate}%`],
        ["Totale flyvetimer", kpiData.totalFlightHours],
        ["Hendelsesfrekvens", kpiData.incidentRate.toFixed(2)],
        ["Aktive ressurser", kpiData.activeResources],
      ];
      const wsKPI = XLSX.utils.aoa_to_sheet(kpiSheetData);
      XLSX.utils.book_append_sheet(wb, wsKPI, "KPI");

      // Missions by Month
      const missionMonthData = [
        ["Måned", "Antall oppdrag"],
        ...missionsByMonth.map(item => [item.month, item.count])
      ];
      const wsMissionsMonth = XLSX.utils.aoa_to_sheet(missionMonthData);
      XLSX.utils.book_append_sheet(wb, wsMissionsMonth, "Oppdrag per måned");

      // Missions by Status
      const missionStatusData = [
        ["Status", "Antall"],
        ...missionsByStatus.map(item => [item.name, item.value])
      ];
      const wsMissionsStatus = XLSX.utils.aoa_to_sheet(missionStatusData);
      XLSX.utils.book_append_sheet(wb, wsMissionsStatus, "Oppdrag per status");

      // Missions by Risk
      const missionRiskData = [
        ["Risikonivå", "Antall"],
        ...missionsByRisk.map(item => [item.name, item.value])
      ];
      const wsMissionsRisk = XLSX.utils.aoa_to_sheet(missionRiskData);
      XLSX.utils.book_append_sheet(wb, wsMissionsRisk, "Oppdrag per risiko");

      // Incidents by Month
      const incidentMonthData = [
        ["Måned", "Antall hendelser"],
        ...incidentsByMonth.map(item => [item.month, item.count])
      ];
      const wsIncidentsMonth = XLSX.utils.aoa_to_sheet(incidentMonthData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMonth, "Hendelser per måned");

      // Incidents by Main Cause
      const incidentMainCauseData = [
        ["Hovedårsak", "Antall"],
        ...incidentsByMainCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsMainCause = XLSX.utils.aoa_to_sheet(incidentMainCauseData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsMainCause, "Hovedårsaker");

      // Incidents by Contributing Cause
      const incidentContributingData = [
        ["Medvirkende årsak", "Antall"],
        ...incidentsByContributingCause.map(item => [item.name, item.value])
      ];
      const wsIncidentsContributing = XLSX.utils.aoa_to_sheet(incidentContributingData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsContributing, "Medvirkende årsaker");

      // Incidents by Severity
      const incidentSeverityData = [
        ["Alvorlighetsgrad", "Antall"],
        ...incidentsBySeverity.map(item => [item.name, item.value])
      ];
      const wsIncidentsSeverity = XLSX.utils.aoa_to_sheet(incidentSeverityData);
      XLSX.utils.book_append_sheet(wb, wsIncidentsSeverity, "Hendelser per alvorlighetsgrad");

      // Drone Status
      const droneStatusData = [
        ["Status", "Antall"],
        ...droneStatus.map(item => [item.name, item.value])
      ];
      const wsDroneStatus = XLSX.utils.aoa_to_sheet(droneStatusData);
      XLSX.utils.book_append_sheet(wb, wsDroneStatus, "Dronestatus");

      // Equipment Status
      const equipmentStatusData = [
        ["Status", "Antall"],
        ...equipmentStatus.map(item => [item.name, item.value])
      ];
      const wsEquipmentStatus = XLSX.utils.aoa_to_sheet(equipmentStatusData);
      XLSX.utils.book_append_sheet(wb, wsEquipmentStatus, "Utstyrstatus");

      // Flight Hours by Drone
      const flightHoursData = [
        ["Drone", "Flyvetimer"],
        ...flightHoursByDrone.map(item => [item.name, item.hours])
      ];
      const wsFlightHours = XLSX.utils.aoa_to_sheet(flightHoursData);
      XLSX.utils.book_append_sheet(wb, wsFlightHours, "Flyvetimer per drone");

      // Expiring Documents
      const expiringDocsData = [
        ["Tidsperiode", "Antall dokumenter"],
        ["Innen 30 dager", expiringDocs.thirtyDays],
        ["Innen 60 dager", expiringDocs.sixtyDays],
        ["Innen 90 dager", expiringDocs.ninetyDays],
      ];
      const wsExpiringDocs = XLSX.utils.aoa_to_sheet(expiringDocsData);
      XLSX.utils.book_append_sheet(wb, wsExpiringDocs, "Dokumenter som utløper");

      // Deviation Reports
      const deviationSummary = [
        ["Avviksrapporter (sammendrag)", ""],
        ["Totalt antall avvik", deviationReports.length],
        ["Unike flyturer med avvik", new Set(deviationReports.map(r => r.mission_id).filter(Boolean)).size],
        ["Unike piloter", new Set(deviationReports.map(r => r.reported_by).filter(Boolean)).size],
        [],
        ["Hovedkategori", "Antall"],
        ...Object.entries(deviationReports.reduce((acc: Record<string, number>, r) => {
          const root = r.category_path[0] || "Ukategorisert";
          acc[root] = (acc[root] || 0) + 1;
          return acc;
        }, {})).map(([name, value]) => [name, value]),
        [],
        ["Dato", "Pilot", "Kategori", "Kommentar"],
        ...deviationReports.map(r => [
          format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
          r.reporter_name || "Ukjent",
          r.category_path.join(" > "),
          r.comment || "",
        ]),
      ];
      const wsDeviation = XLSX.utils.aoa_to_sheet(deviationSummary);
      XLSX.utils.book_append_sheet(wb, wsDeviation, "Avviksrapporter");

      // Generate filename with date
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      
      // Convert workbook to array buffer for upload
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Get user's company_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name")
        .eq("id", user?.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("Kunne ikke hente firmaopplysninger");
      }

      // Upload to Supabase Storage
      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Create document entry in database
      const periodLabel = timePeriod === "month" ? "Siste måned" : 
                         timePeriod === "quarter" ? "Siste kvartal" : "Siste år";
      
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `Statistikkrapport - ${periodLabel}`,
          kategori: 'Rapporter',
          beskrivelse: `Excel-rapport generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`,
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: blob.size,
          company_id: profile.company_id,
          user_id: user?.id,
          opprettet_av: profile?.full_name || user?.email || 'Ukjent'
        });

      if (dbError) throw dbError;

      // Also download the file for the user
      XLSX.writeFile(wb, fileName);
      
      toast.success("Excel-rapport lagret", {
        description: "Rapporten er lagret i dokumenter under kategorien Rapporter"
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast.error("Feil ved eksport", {
        description: "Kunne ikke generere Excel-rapport"
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const sep = ";";
      const sections: string[][] = [];

      // KPI
      sections.push(["Nøkkeltall (KPI)", ""]);
      sections.push(["Totale oppdrag", String(kpiData.totalMissions)]);
      sections.push(["Fullførte oppdrag", String(kpiData.completedMissions)]);
      sections.push(["Fullføringsgrad", `${completionRate}%`]);
      sections.push(["Totale flyvetimer", String(kpiData.totalFlightHours)]);
      sections.push(["Hendelsesfrekvens", kpiData.incidentRate.toFixed(2)]);
      sections.push(["Aktive ressurser", String(kpiData.activeResources)]);
      sections.push([]);

      // Missions by Month
      sections.push(["Måned", "Antall oppdrag"]);
      missionsByMonth.forEach(item => sections.push([item.month, String(item.count)]));
      sections.push([]);

      // Missions by Status
      sections.push(["Status", "Antall"]);
      missionsByStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Missions by Risk
      sections.push(["Risikonivå", "Antall"]);
      missionsByRisk.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Month
      sections.push(["Måned", "Antall hendelser"]);
      incidentsByMonth.forEach(item => sections.push([item.month, String(item.count)]));
      sections.push([]);

      // Incidents by Main Cause
      sections.push(["Hovedårsak", "Antall"]);
      incidentsByMainCause.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Contributing Cause
      sections.push(["Medvirkende årsak", "Antall"]);
      incidentsByContributingCause.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Incidents by Severity
      sections.push(["Alvorlighetsgrad", "Antall"]);
      incidentsBySeverity.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Drone Status
      sections.push(["Dronestatus", "Antall"]);
      droneStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Equipment Status
      sections.push(["Utstyrstatus", "Antall"]);
      equipmentStatus.forEach(item => sections.push([item.name, String(item.value)]));
      sections.push([]);

      // Flight Hours by Drone
      sections.push(["Drone", "Flyvetimer"]);
      flightHoursByDrone.forEach(item => sections.push([item.name, String(item.hours)]));
      sections.push([]);

      // Expiring Documents
      sections.push(["Dokumenter som utløper", "Antall"]);
      sections.push(["Innen 30 dager", String(expiringDocs.thirtyDays)]);
      sections.push(["Innen 60 dager", String(expiringDocs.sixtyDays)]);
      sections.push(["Innen 90 dager", String(expiringDocs.ninetyDays)]);
      sections.push([]);

      // Deviation Reports
      sections.push(["Avviksrapporter (sammendrag)", ""]);
      sections.push(["Totalt antall avvik", String(deviationReports.length)]);
      sections.push(["Unike flyturer med avvik", String(new Set(deviationReports.map(r => r.mission_id).filter(Boolean)).size)]);
      sections.push(["Unike piloter", String(new Set(deviationReports.map(r => r.reported_by).filter(Boolean)).size)]);
      sections.push([]);
      sections.push(["Hovedkategori", "Antall"]);
      Object.entries(deviationReports.reduce((acc: Record<string, number>, r) => {
        const root = r.category_path[0] || "Ukategorisert";
        acc[root] = (acc[root] || 0) + 1;
        return acc;
      }, {})).forEach(([name, value]) => sections.push([name, String(value)]));
      sections.push([]);
      sections.push(["Dato", "Pilot", "Kategori", "Kommentar"]);
      deviationReports.forEach(r => sections.push([
        format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
        r.reporter_name || "Ukjent",
        r.category_path.join(" > "),
        r.comment || "",
      ]));

      const bom = "\uFEFF";
      const csvContent = bom + sections.map(row => row.join(sep)).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;

      // Upload to Supabase Storage + documents table
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name")
        .eq("id", user?.id)
        .single();

      if (!profile?.company_id) throw new Error("Kunne ikke hente firmaopplysninger");

      const filePath = `${profile.company_id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, blob, { contentType: "text/csv", upsert: true });

      if (uploadError) throw uploadError;

      const periodLabel = timePeriod === "month" ? "Siste måned" :
                          timePeriod === "quarter" ? "Siste kvartal" : "Siste år";

      await supabase.from("documents").insert({
        tittel: `Statistikkrapport CSV - ${periodLabel}`,
        kategori: "Rapporter",
        beskrivelse: `CSV-rapport generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`,
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: blob.size,
        company_id: profile.company_id,
        user_id: user?.id,
        opprettet_av: profile?.full_name || user?.email || "Ukjent",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("CSV-rapport lagret", {
        description: "Rapporten er lagret i dokumenter under kategorien Rapporter",
      });
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      toast.error("Feil ved eksport", { description: "Kunne ikke generere CSV-rapport" });
    }
  };

  const handleExportPDF = async () => {
    try {
      // Get company name and company_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name, companies(navn)")
        .eq("id", user?.id)
        .single();

      const companyName = (profile as any)?.companies?.navn || "Ukjent selskap";
      const companyId = profile?.company_id;
      
      if (!companyId) {
        throw new Error("Kunne ikke hente firmaopplysninger");
      }

      const periodLabel = timePeriod === "month" ? "Siste måned" : 
                         timePeriod === "quarter" ? "Siste kvartal" : "Siste år";

      // Create PDF document
      const doc = await createPdfDocument();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let yPos = 20;

      // Color palette
      const COLORS = {
        primary: [59, 130, 246] as [number, number, number],
        success: [34, 197, 94] as [number, number, number],
        warning: [234, 179, 8] as [number, number, number],
        destructive: [239, 68, 68] as [number, number, number],
        muted: [156, 163, 175] as [number, number, number],
      };

      // Helper function: Draw bar chart
      const drawBarChart = (data: { name: string; value: number }[], x: number, y: number, width: number, height: number, title: string) => {
        doc.setFontSize(12);
        setFontStyle(doc, 'bold');
        doc.text(title, x, y);
        y += 8;

        if (data.length === 0 || data.every(d => d.value === 0)) {
          doc.setFontSize(10);
          setFontStyle(doc, 'normal');
          doc.text("Ingen data", x, y + 20);
          return;
        }

        const maxValue = Math.max(...data.map(d => d.value), 1);
        const barWidth = Math.min((width - 10) / data.length - 5, 25);
        const chartHeight = height - 25;

        // Draw axes
        doc.setDrawColor(200, 200, 200);
        doc.line(x, y + chartHeight, x + width, y + chartHeight); // X-axis
        doc.line(x, y, x, y + chartHeight); // Y-axis

        // Draw bars
        data.forEach((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const barX = x + 5 + index * (barWidth + 5);
          const barY = y + chartHeight - barHeight;

          doc.setFillColor(...COLORS.primary);
          doc.rect(barX, barY, barWidth, barHeight, 'F');

          // Value label on top
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(item.value.toString(), barX + barWidth / 2, barY - 2, { align: 'center' });

          // Name label below
          doc.setFont('helvetica', 'normal');
          doc.text(item.name, barX + barWidth / 2, y + chartHeight + 5, { 
            align: 'center', 
            maxWidth: barWidth + 3 
          });
        });
        
        doc.setTextColor(0, 0, 0);
      };

      // Helper function: Draw pie chart
      const drawPieChart = (data: { name: string; value: number }[], x: number, y: number, radius: number, title: string) => {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title, x - radius, y - radius - 5);

        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text("Ingen data", x, y, { align: 'center' });
          return;
        }

        const colors = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.destructive, COLORS.muted];
        let currentAngle = -90; // Start at top

        // Draw each slice
        data.forEach((item, index) => {
          const sliceAngle = (item.value / total) * 360;
          const color = colors[index % colors.length];
          const startAngle = (currentAngle * Math.PI) / 180;
          const endAngle = ((currentAngle + sliceAngle) * Math.PI) / 180;
          
          doc.setFillColor(...color);
          
          // Draw slice as filled path
          doc.setDrawColor(...color);
          const segments = Math.max(2, Math.ceil(sliceAngle / 5));
          
          for (let i = 0; i <= segments; i++) {
            const angle = startAngle + (i / segments) * (endAngle - startAngle);
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            
            if (i === 0) {
              doc.line(x, y, px, py);
            } else {
              const prevAngle = startAngle + ((i - 1) / segments) * (endAngle - startAngle);
              const prevPx = x + radius * Math.cos(prevAngle);
              const prevPy = y + radius * Math.sin(prevAngle);
              
              // Draw triangle for each segment
              doc.setFillColor(...color);
              doc.triangle(x, y, prevPx, prevPy, px, py, 'FD');
            }
          }

          // Add percentage label
          const labelAngle = currentAngle + sliceAngle / 2;
          const labelRadius = radius * 0.65;
          const labelX = x + labelRadius * Math.cos((labelAngle * Math.PI) / 180);
          const labelY = y + labelRadius * Math.sin((labelAngle * Math.PI) / 180);
          
          const percentage = ((item.value / total) * 100).toFixed(0);
          if (parseInt(percentage) >= 5) { // Only show label if slice is big enough
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(`${percentage}%`, labelX, labelY + 1, { align: 'center' });
          }

          currentAngle += sliceAngle;
        });
        
        doc.setTextColor(0, 0, 0);

        // Draw legend
        let legendY = y + radius + 10;
        doc.setFont('helvetica', 'normal');
        data.forEach((item, index) => {
          const color = colors[index % colors.length];
          doc.setFillColor(...color);
          doc.rect(x - radius, legendY, 4, 4, 'F');
          doc.setFontSize(8);
          doc.text(`${item.name} (${item.value})`, x - radius + 6, legendY + 3);
          legendY += 6;
        });
      };

      // Page 1: Header and KPIs
      doc.setFontSize(20);
      setFontStyle(doc, "bold");
      doc.text(`Statistikkrapport - ${companyName}`, 20, yPos);
      yPos += 10;

      doc.setFontSize(12);
      setFontStyle(doc, "normal");
      doc.text(`Periode: ${periodLabel}`, 20, yPos);
      yPos += 7;
      doc.text(`Generert: ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}`, 20, yPos);
      yPos += 15;

      // KPI Table
      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text("Nøkkeltall", 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['KPI', 'Verdi']],
        body: [
          ['Totalt oppdrag', kpiData.totalMissions.toString()],
          ['Fullførte oppdrag', `${kpiData.completedMissions} (${kpiData.totalMissions > 0 ? Math.round((kpiData.completedMissions / kpiData.totalMissions) * 100) : 0}%)`],
          ['Totale flyvetimer', kpiData.totalFlightHours.toString()],
          ['Hendelsesfrekvens', `${kpiData.incidentRate.toFixed(1)}%`],
          ['Aktive ressurser', kpiData.activeResources.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Missions by Month Bar Chart
      if (missionsByMonth.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawBarChart(
          missionsByMonth.map(m => ({ name: m.month, value: m.count })), 
          20, 
          yPos, 
          170, 
          60, 
          "Oppdrag per måned"
        );
        yPos += 70;
      }

      // Missions by Status Pie Chart
      if (missionsByStatus.length > 0) {
        if (yPos > 220) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(missionsByStatus, 60, yPos + 35, 30, "Oppdrag per status");
        yPos += 100;
      }

      // Page 2: Incidents
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text("Hendelser", 20, yPos);
      yPos += 15;

      // Incidents by Month Bar Chart
      if (incidentsByMonth.length > 0) {
        drawBarChart(
          incidentsByMonth.map(m => ({ name: m.month, value: m.count })), 
          20, 
          yPos, 
          170, 
          60, 
          "Hendelser per måned"
        );
        yPos += 70;
      }

      // Incidents by Main Cause Pie Chart
      if (incidentsByMainCause.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(incidentsByMainCause, 60, yPos + 35, 30, "Fordeling hovedårsaker");
        yPos += 100;
      }

      // Incidents by Contributing Cause Table
      if (incidentsByContributingCause.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(12);
        setFontStyle(doc, 'bold');
        doc.text("Medvirkende årsaker", 20, yPos);
        yPos += 5;

        autoTable(doc, {
          startY: yPos,
          head: [['Årsak', 'Antall']],
          body: incidentsByContributingCause.map(item => [item.name, item.value.toString()]),
          theme: 'grid',
          headStyles: { fillColor: COLORS.warning },
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Incidents by Severity Bar Chart
      if (incidentsBySeverity.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawBarChart(incidentsBySeverity, 20, yPos, 170, 50, "Hendelser per alvorlighetsgrad");
        yPos += 60;
      }

      // HMS Box - Days since last severe incident
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFillColor(...COLORS.success);
      doc.rect(20, yPos, 170, 20, 'F');
      doc.setFontSize(12);
      setFontStyle(doc, "bold");
      doc.setTextColor(255, 255, 255);
      const daysText = daysSinceLastSevere > 0 
        ? `${daysSinceLastSevere} dager siden siste alvorlige hendelse`
        : 'Ingen alvorlige hendelser registrert';
      doc.text(daysText, 105, yPos + 12, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      yPos += 30;

      // Page 3: Resources
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      setFontStyle(doc, "bold");
      doc.text("Ressurser", 20, yPos);
      yPos += 15;

      // Drone Status Pie Chart
      if (droneStatus.length > 0) {
        drawPieChart(droneStatus, 60, yPos + 35, 30, "Dronestatus");
        yPos += 100;
      }

      // Equipment Status Pie Chart
      if (equipmentStatus.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        drawPieChart(equipmentStatus, 60, yPos + 35, 30, "Utstyrsstatus");
        yPos += 100;
      }

      // Expiring Documents
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      setFontStyle(doc, "bold");
      doc.text("Dokumenter som utløper", 20, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['Periode', 'Antall']],
        body: [
          ['Innen 30 dager', expiringDocs.thirtyDays.toString()],
          ['Innen 60 dager', expiringDocs.sixtyDays.toString()],
          ['Innen 90 dager', expiringDocs.ninetyDays.toString()],
        ],
        theme: 'grid',
        headStyles: { fillColor: COLORS.primary },
      });

      // Deviation Reports section
      if (deviationReports.length > 0) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(16);
        setFontStyle(doc, "bold");
        doc.text("Avviksrapporter", 20, yPos);
        yPos += 10;

        const rootCounts: Record<string, number> = {};
        deviationReports.forEach(r => {
          const root = r.category_path[0] || "Ukategorisert";
          rootCounts[root] = (rootCounts[root] || 0) + 1;
        });

        autoTable(doc, {
          startY: yPos,
          head: [['Hovedkategori', 'Antall']],
          body: Object.entries(rootCounts).map(([k, v]) => [k, v.toString()]),
          theme: 'grid',
          headStyles: { fillColor: COLORS.warning },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;

        autoTable(doc, {
          startY: yPos,
          head: [['Dato', 'Pilot', 'Kategori', 'Kommentar']],
          body: deviationReports.map(r => [
            format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
            sanitizeForPdf(r.reporter_name || "Ukjent"),
            sanitizeForPdf(r.category_path.join(" > ")),
            sanitizeForPdf(r.comment || ""),
          ]),
          theme: 'striped',
          headStyles: { fillColor: COLORS.warning },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 3: { cellWidth: 60 } },
        });
      }

      // Generate PDF blob
      const pdfBlob = doc.output('blob');
      const fileName = `statistikk-rapport-${format(new Date(), "yyyy-MM-dd-HHmmss")}.pdf`;

      // Upload to Supabase Storage
      const filePath = `${companyId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Create document entry in database
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          tittel: `Statistikkrapport - ${periodLabel}`,
          kategori: 'Rapporter',
          beskrivelse: `PDF-rapport generert ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`,
          fil_navn: fileName,
          fil_url: filePath,
          fil_storrelse: pdfBlob.size,
          company_id: companyId,
          user_id: user?.id,
          opprettet_av: profile?.full_name || user?.email || 'Ukjent'
        });

      if (dbError) throw dbError;

      // Also download the file for the user
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("PDF-rapport lagret", {
        description: "Rapporten er lagret i dokumenter under kategorien Rapporter"
      });
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast.error("Feil ved eksport", {
        description: "Kunne ikke generere PDF-rapport"
      });
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Statistikk</h1>
          <div className="flex flex-col sm:flex-row lg:flex-row items-stretch sm:items-center gap-3 w-full">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground whitespace-nowrap">Periode:</span>
              <Select value={timePeriod} onValueChange={(value: "month" | "quarter" | "year" | "custom") => setTimePeriod(value)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Siste måned</SelectItem>
                  <SelectItem value="quarter">Siste kvartal</SelectItem>
                  <SelectItem value="year">Siste år</SelectItem>
                  <SelectItem value="custom">Egendefinert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {timePeriod === "custom" && (
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">Fra:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm",
                          !customDateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{customDateFrom ? format(customDateFrom, "dd.MM.yy") : "Velg"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={setCustomDateFrom}
                        disabled={(date) => customDateTo ? date > customDateTo : false}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-foreground whitespace-nowrap">Til:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm",
                          !customDateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{customDateTo ? format(customDateTo, "dd.MM.yy") : "Velg"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateTo}
                        onSelect={setCustomDateTo}
                        disabled={(date) => customDateFrom ? date < customDateFrom : false}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            
            <div className="lg:ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" size="default" className="gap-2 w-full sm:w-auto">
                    <Download className="w-4 h-4" />
                    Eksporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <Download className="w-4 h-4 mr-2" />
                    Eksporter til Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <Download className="w-4 h-4 mr-2" />
                    Eksporter til PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    Eksporter til CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
          <ToggleGroup
            type="single"
            value={activeView}
            onValueChange={(v) => v && setActiveView(v as "operational" | "deviation")}
            className="justify-start"
          >
            <ToggleGroupItem value="operational" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              Hendelser
            </ToggleGroupItem>
            <ToggleGroupItem value="deviation" className="bg-muted text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground border border-border">
              Avvik
            </ToggleGroupItem>
          </ToggleGroup>

        {activeView === "operational" && (<>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totale oppdrag</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalMissions}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {completionRate}% fullført
                </p>
              </div>
              <Activity className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totale flyvetimer</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.totalFlightHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">timer</p>
              </div>
              <Clock className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hendelsesfrekvens</p>
                <p className="text-3xl font-bold text-foreground">
                  {kpiData.incidentRate.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">per 100 flyvetimer</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-destructive opacity-70" />
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktive ressurser</p>
                <p className="text-3xl font-bold text-foreground">{kpiData.activeResources}</p>
                <p className="text-xs text-muted-foreground mt-1">droner og utstyr</p>
              </div>
              <Package className="w-10 h-10 text-primary opacity-70" />
            </div>
          </GlassCard>
        </div>

        {/* Mission Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Oppdrag per måned
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={missionsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  name="Oppdrag"
                />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Oppdrag per status</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={missionsByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {missionsByStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Object.values(COLORS)[index % Object.values(COLORS).length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Oppdrag per risikonivå
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={missionsByRisk}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" fill={COLORS.primary} name="Antall" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">HMS - Sikkerhetsstatus</h2>
            <div className="flex items-center justify-center h-[300px]">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Dager siden siste alvorlige hendelse
                </p>
                <p className="text-6xl font-bold text-foreground">{daysSinceLastSevere}</p>
                <p className="text-sm text-muted-foreground mt-2">dager</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Operation type (VLOS / BVLOS / EVLOS) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Operasjonstype – fordeling
            </h2>
            {operationTypeStats.totalFlights === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                Ingen flyturer i valgt periode
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={operationTypeStats.counts.filter((c) => c.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                  >
                    {operationTypeStats.counts.filter((c) => c.value > 0).map((entry, idx) => {
                      const colorMap: Record<string, string> = {
                        VLOS: COLORS.success,
                        BVLOS: COLORS.destructive,
                        EVLOS: COLORS.warning,
                      };
                      return <Cell key={idx} fill={colorMap[entry.name] || COLORS.primary} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Flytimer per operasjonstype
            </h2>
            <div className="space-y-4 pt-4">
              {(["VLOS", "BVLOS", "EVLOS"] as const).map((type) => {
                const hours = operationTypeStats.hours.find((h) => h.name === type)?.value || 0;
                const totalH = operationTypeStats.totalMinutes / 60;
                const pct = totalH > 0 ? (hours / totalH) * 100 : 0;
                const colorMap: Record<string, string> = {
                  VLOS: COLORS.success,
                  BVLOS: COLORS.destructive,
                  EVLOS: COLORS.warning,
                };
                return (
                  <div key={type}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-foreground">{type}</span>
                      <span className="text-sm text-muted-foreground">
                        {hours.toFixed(1)} t ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: colorMap[type] }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                Totalt {(operationTypeStats.totalMinutes / 60).toFixed(1)} timer fordelt på {operationTypeStats.totalFlights} flyturer.
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Operasjonstype per måned
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={operationTypeStats.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="VLOS" stackId="op" fill={COLORS.success} />
                <Bar dataKey="BVLOS" stackId="op" fill={COLORS.destructive} />
                <Bar dataKey="EVLOS" stackId="op" fill={COLORS.warning} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Incident Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Hendelser per måned
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incidentsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill={COLORS.destructive} name="Hendelser" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Fordeling hovedårsaker
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incidentsByMainCause}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill={COLORS.destructive}
                  dataKey="value"
                >
                  {incidentsByMainCause.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Object.values(COLORS)[index % Object.values(COLORS).length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(value) => (
                    <span style={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 120, display: 'inline-block' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Hendelser per alvorlighetsgrad
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incidentsBySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="value" fill={COLORS.warning} name="Antall" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Contributing Causes - Full Width Horizontal Bar Chart */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Medvirkende årsaker
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(300, incidentsByContributingCause.length * 35)}>
            <BarChart data={incidentsByContributingCause} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis
                type="category"
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                width={180}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="value" fill={COLORS.warning} name="Antall" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Resource & Document Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Drone statusfordeling
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={droneStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {droneStatus.map((entry, index) => {
                    const colorMap: { [key: string]: string } = {
                      Grønn: COLORS.success,
                      Gul: COLORS.warning,
                      Rød: COLORS.destructive,
                    };
                    return <Cell key={`cell-${index}`} fill={colorMap[entry.name] || COLORS.muted} />;
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Utstyr statusfordeling
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={equipmentStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill={COLORS.primary}
                  dataKey="value"
                >
                  {equipmentStatus.map((entry, index) => {
                    const colorMap: { [key: string]: string } = {
                      Grønn: COLORS.success,
                      Gul: COLORS.warning,
                      Rød: COLORS.destructive,
                    };
                    return <Cell key={`cell-${index}`} fill={colorMap[entry.name] || COLORS.muted} />;
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Flyvetimer per drone (topp 10)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={flightHoursByDrone} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  width={150}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="hours" fill={COLORS.primary} name="Timer" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Dokumenter som utløper
            </h2>
            <div className="space-y-6 pt-8">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Innen 30 dager</span>
                  <span className="text-2xl font-bold text-destructive">
                    {expiringDocs.thirtyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-destructive h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.thirtyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Innen 60 dager</span>
                  <span className="text-2xl font-bold text-warning">
                    {expiringDocs.sixtyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-warning h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.sixtyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Innen 90 dager</span>
                  <span className="text-2xl font-bold text-primary">
                    {expiringDocs.ninetyDays}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        (expiringDocs.ninetyDays /
                          Math.max(
                            expiringDocs.thirtyDays,
                            expiringDocs.sixtyDays,
                            expiringDocs.ninetyDays,
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
        </>)}

        {activeView === "deviation" && (() => {
          const monthsToShow = getMonthsToShow();
          const { endDate } = getDateFilter();
          const monthlyMap: Record<string, number> = {};
          for (let i = monthsToShow - 1; i >= 0; i--) {
            const d = subMonths(endDate, i);
            monthlyMap[format(d, "MMM yyyy", { locale: nb })] = 0;
          }
          deviationReports.forEach((r) => {
            const k = format(new Date(r.created_at), "MMM yyyy", { locale: nb });
            if (monthlyMap[k] !== undefined) monthlyMap[k]++;
          });
          const monthlyData = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

          const filtered = deviationReports.filter((r) =>
            deviationDrillPath.every((seg, i) => r.category_path[i] === seg)
          );
          const level = deviationDrillPath.length;
          const distMap: Record<string, number> = {};
          filtered.forEach((r) => {
            const seg = r.category_path[level];
            if (seg) distMap[seg] = (distMap[seg] || 0) + 1;
          });
          const distData = Object.entries(distMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

          const rootMap: Record<string, number> = {};
          deviationReports.forEach((r) => {
            const root = r.category_path[0] || "Ukategorisert";
            rootMap[root] = (rootMap[root] || 0) + 1;
          });
          const rootData = Object.entries(rootMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

          const uniqueFlights = new Set(deviationReports.map((r) => r.mission_id).filter(Boolean)).size;
          const uniquePilots = new Set(deviationReports.map((r) => r.reported_by).filter(Boolean)).size;
          const avgPerFlight = flightLogsCount > 0 ? (deviationReports.length / flightLogsCount).toFixed(2) : "0";

          const PAGE_SIZE = 20;
          const totalPages = Math.max(1, Math.ceil(deviationReports.length / PAGE_SIZE));
          const pageRows = deviationReports.slice((deviationPage - 1) * PAGE_SIZE, deviationPage * PAGE_SIZE);

          return (
            <div className="space-y-6">
              {!companySettings.deviation_report_enabled && (
                <GlassCard className="p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-foreground font-medium">Avviksrapportering er ikke aktivert</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Aktiver «Avviksrapport ved endt flytur» under selskapsinnstillinger.
                      </p>
                      <Button variant="link" className="px-0 mt-2" onClick={() => navigate("/admin")}>
                        Gå til selskapsinnstillinger
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">Totalt antall avvik</p>
                  <p className="text-3xl font-bold text-foreground">{deviationReports.length}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">Unike flyturer med avvik</p>
                  <p className="text-3xl font-bold text-foreground">{uniqueFlights}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">Unike piloter</p>
                  <p className="text-3xl font-bold text-foreground">{uniquePilots}</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <p className="text-sm text-muted-foreground">Snitt per flytur</p>
                  <p className="text-3xl font-bold text-foreground">{avgPerFlight}</p>
                  <p className="text-xs text-muted-foreground mt-1">{flightLogsCount} flyturer i perioden</p>
                </GlassCard>
              </div>

              {deviationReports.length === 0 ? (
                <GlassCard className="p-8 text-center">
                  <p className="text-muted-foreground">Ingen avviksrapporter i valgt periode.</p>
                </GlassCard>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GlassCard className="p-6">
                      <h2 className="text-xl font-semibold mb-4 text-foreground">Avvik per måned</h2>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                          <YAxis stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="count" fill={COLORS.warning} name="Avvik" />
                        </BarChart>
                      </ResponsiveContainer>
                    </GlassCard>

                    <GlassCard className="p-6">
                      <h2 className="text-xl font-semibold mb-4 text-foreground">Topp-kategorier (rotnivå)</h2>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={rootData} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${e.value}`} outerRadius={80} dataKey="value">
                            {rootData.map((_, idx) => (
                              <Cell key={idx} fill={Object.values(COLORS)[idx % Object.values(COLORS).length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </GlassCard>
                  </div>

                  <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold text-foreground">Underkategori-fordeling</h2>
                      {deviationDrillPath.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setDeviationDrillPath((p) => p.slice(0, -1))}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> Tilbake
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mb-4 text-sm">
                      <button onClick={() => setDeviationDrillPath([])} className="text-primary hover:underline">Alle</button>
                      {deviationDrillPath.map((seg, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <button onClick={() => setDeviationDrillPath(deviationDrillPath.slice(0, i + 1))} className="text-primary hover:underline">{seg}</button>
                        </span>
                      ))}
                    </div>
                    {distData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">Ingen dypere kategorier å vise.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(300, distData.length * 35)}>
                        <BarChart data={distData} layout="vertical" onClick={(e: any) => {
                          const label = e?.activeLabel;
                          if (label) setDeviationDrillPath((p) => [...p, label]);
                        }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                          <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" width={180} tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="value" fill={COLORS.primary} name="Antall" cursor="pointer" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">Tips: Klikk på en bar for å borre ned.</p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h2 className="text-xl font-semibold mb-4 text-foreground">Detaljer ({deviationReports.length})</h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dato</TableHead>
                          <TableHead>Pilot</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Kommentar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => (
                          <TableRow key={r.id} className={r.mission_id ? "cursor-pointer" : ""} onClick={() => r.mission_id && navigate(`/oppdrag?id=${r.mission_id}`)}>
                            <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd.MM.yyyy HH:mm", { locale: nb })}</TableCell>
                            <TableCell>{r.reporter_name || "Ukjent"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                {r.category_path.map((seg, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                                    <span>{seg}</span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground italic">{r.comment || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <Button variant="outline" size="sm" disabled={deviationPage === 1} onClick={() => setDeviationPage((p) => p - 1)}>Forrige</Button>
                        <span className="text-sm text-muted-foreground">Side {deviationPage} av {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={deviationPage === totalPages} onClick={() => setDeviationPage((p) => p + 1)}>Neste</Button>
                      </div>
                    )}
                  </GlassCard>
                </>
              )}
            </div>
          );
        })()}
      </main>
      </div>
    </div>
  );
};

export default Status;
