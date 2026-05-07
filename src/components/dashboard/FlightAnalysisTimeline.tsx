import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BatterySummary } from "./FlightAnalysisDialog";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { 
  Mountain, Gauge, Battery, Radio, Gamepad2, Wind, Satellite, Navigation, AlertTriangle, Thermometer
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StickWidget } from "./StickWidget";

interface TelemetryPoint {
  lat: number; lng: number; alt: number; height: number; timestamp: string;
  speed?: number; vSpeed?: number; battery?: number; voltage?: number;
  current?: number; temp?: number; gpsNum?: number; gpsLevel?: number;
  pitch?: number; roll?: number; yaw?: number;
  rcAileron?: number; rcElevator?: number; rcRudder?: number; rcThrottle?: number;
  gimbalPitch?: number; gimbalRoll?: number; gimbalYaw?: number;
  dist2D?: number; dist3D?: number; elevation?: number;
  flycState?: string; groundOrSky?: string;
  windSpeed?: number; windDir?: number; maxWindSpeed?: number;
  // Dual-battery fields
  battery1?: number; voltage1?: number; current1?: number; temp1?: number;
  battery2?: number; voltage2?: number; current2?: number; temp2?: number;
}

interface FlightAnalysisTimelineProps {
  positions: TelemetryPoint[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  events?: Array<{ type: string; message: string; t_offset_ms: number | null }>;
  showWarnings?: boolean;
  batterySummary?: BatterySummary;
}

const formatTime = (idx: number, positions: TelemetryPoint[]) => {
  const ts = positions[idx]?.timestamp;
  if (!ts) return `#${idx}`;
  const match = ts.match(/PT(\d+)S/);
  if (match) {
    const sec = parseInt(match[1]);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  try {
    return new Date(ts).toLocaleTimeString("nb-NO", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return `#${idx}`; }
};

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-2 text-xs shadow-lg">
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.stroke || p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

const hasData = (positions: TelemetryPoint[], key: keyof TelemetryPoint) =>
  positions.some(p => p[key] !== undefined && p[key] !== null);

export const FlightAnalysisTimeline = ({ positions, currentIndex, onIndexChange, events, showWarnings = true, batterySummary }: FlightAnalysisTimelineProps) => {
  const [activeChart, setActiveChart] = useState("altitude");
  const [selectedEventIdx, setSelectedEventIdx] = useState<number | null>(null);

  const rcInputRange = useMemo<'dji' | 'ardupilot'>(() => {
    return positions.some(p =>
      (p.rcElevator != null && p.rcElevator > 1700) ||
      (p.rcAileron != null && p.rcAileron > 1700) ||
      (p.rcRudder != null && p.rcRudder > 1700) ||
      (p.rcThrottle != null && p.rcThrottle > 1700)
    ) ? 'ardupilot' : 'dji';
  }, [positions]);

  const isDualBattery = useMemo(() => hasData(positions, 'battery1'), [positions]);

  const chartData = useMemo(() => 
    positions.map((p, i) => ({ ...p, idx: i, time: formatTime(i, positions) })),
    [positions]
  );

  const current = positions[currentIndex];

  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: any; always?: boolean; key?: keyof TelemetryPoint; custom?: boolean }> = [
      { id: "altitude", label: "Høyde", icon: Mountain, always: true },
      { id: "speed", label: "Hastighet", icon: Gauge, key: "speed" as keyof TelemetryPoint },
      { id: "gps", label: "GPS", icon: Satellite, key: "gpsNum" as keyof TelemetryPoint },
      { id: "rc", label: "RC", icon: Gamepad2, key: "rcAileron" as keyof TelemetryPoint },
      { id: "gimbal", label: "Gimbal", icon: Navigation, key: "gimbalPitch" as keyof TelemetryPoint },
      { id: "distance", label: "Avstand", icon: Radio, key: "dist2D" as keyof TelemetryPoint },
      { id: "wind", label: "Vind", icon: Wind, key: "windSpeed" as keyof TelemetryPoint },
    ];
    const result = tabs.filter(t => t.always || (t.key && hasData(positions, t.key)));
    // Add unified battery tab if ANY battery field exists
    const hasBattData = ['battery', 'battery1', 'battery2', 'temp', 'voltage', 'current', 'temp1', 'temp2', 'voltage1', 'voltage2', 'current1', 'current2']
      .some(k => hasData(positions, k as keyof TelemetryPoint));
    if (hasBattData) {
      const insertIdx = result.findIndex(t => t.id === 'speed');
      result.splice(insertIdx >= 0 ? insertIdx + 1 : result.length, 0, { id: "batteryInfo", label: "Batteri", icon: Battery, custom: true });
    }
    // Add warnings tab if events exist
    if (events && events.length > 0) {
      result.push({ id: "warnings", label: "Varsler", icon: AlertTriangle, custom: true });
    }
    return result;
  }, [positions, events]);

  const eventIndices = useMemo(() => {
    if (!events?.length || !positions.length) return [];
    return events.filter(e => e.t_offset_ms != null).map(e => {
      const targetSec = (e.t_offset_ms || 0) / 1000;
      let best = 0;
      let bestDiff = Infinity;
      positions.forEach((p, i) => {
        const match = p.timestamp?.match(/PT(\d+)S/);
        if (match) {
          const diff = Math.abs(parseInt(match[1]) - targetSec);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
      });
      return { ...e, index: best };
    });
  }, [events, positions]);

  return (
    <div className="space-y-3">
      {/* Scrubber */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTime(0, positions)}</span>
          <span className="font-medium text-foreground">{formatTime(currentIndex, positions)}</span>
          <span>{formatTime(positions.length - 1, positions)}</span>
        </div>
        <div className="relative">
          <Slider
            value={[currentIndex]}
            min={0}
            max={positions.length - 1}
            step={1}
            onValueChange={([v]) => onIndexChange(v)}
            className="w-full"
          />
          {/* Event markers on slider track — clickable, toggle-controlled */}
          {showWarnings && eventIndices.map((e, i) => (
            <Popover key={i}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-5 rounded-sm cursor-pointer hover:scale-125 transition-transform z-10"
                  style={{
                    left: `${(e.index / (positions.length - 1)) * 100}%`,
                    backgroundColor: e.type === 'RTH' || e.type === 'app_warning_critical' ? 'hsl(var(--destructive))' : 
                      e.type === 'LOW_BATTERY' || e.type === 'app_warning_important' ? 'hsl(38 92% 50%)' : 'hsl(25 95% 53%)',
                  }}
                  onClick={(ev) => { ev.stopPropagation(); onIndexChange(e.index); }}
                />
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto max-w-[240px] p-2 text-xs" sideOffset={8}>
                <p className="font-medium">{e.type}</p>
                <p className="text-muted-foreground mt-0.5 break-words">{e.message}</p>
              </PopoverContent>
            </Popover>
          ))}
        </div>
      </div>

      {/* Current values info panel */}
      {current && (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1.5 text-[10px] sm:text-xs">
          <InfoCell label="Høyde" value={`${current.height?.toFixed(0) ?? '—'}m`} />
          <InfoCell label="MSL" value={`${current.alt?.toFixed(0) ?? '—'}m`} />
          {current.speed !== undefined && <InfoCell label="Hast." value={`${current.speed.toFixed(1)} m/s`} />}
          {current.vSpeed !== undefined && <InfoCell label="V.hast" value={`${current.vSpeed.toFixed(1)} m/s`} />}
          {current.battery !== undefined && <InfoCell label="Batteri" value={`${current.battery.toFixed(0)}%`} />}
          {current.gpsNum !== undefined && <InfoCell label="GPS" value={`${current.gpsNum} sat`} />}
          {current.dist2D !== undefined && <InfoCell label="Avstand" value={`${current.dist2D.toFixed(0)}m`} />}
          {current.gimbalPitch !== undefined && <InfoCell label="Gimbal" value={`${current.gimbalPitch.toFixed(0)}°`} />}
          {current.windSpeed !== undefined && <InfoCell label="Vind" value={`${current.windSpeed.toFixed(1)} m/s`} />}
          {current.flycState && <InfoCell label="Modus" value={current.flycState} />}
          {current.yaw !== undefined && <InfoCell label="Heading" value={`${current.yaw.toFixed(0)}°`} />}
        </div>
      )}

      {/* Charts */}
      <Tabs value={activeChart} onValueChange={setActiveChart}>
        <TabsList className="flex flex-wrap w-full h-auto gap-0.5 sm:gap-0 sm:flex-nowrap sm:h-8">
          {availableTabs.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1 min-w-[60px] text-[10px] sm:text-xs gap-1 px-1.5 h-7 sm:h-8">
              <t.icon className="w-3 h-3 hidden sm:block" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="altitude" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Area type="monotone" dataKey="elevation" stroke="#8B7355" fill="#8B7355" fillOpacity={0.3} strokeWidth={1} name="Terreng" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="alt" stroke="hsl(210 80% 50%)" fill="hsl(210 80% 50%)" fillOpacity={0.1} strokeWidth={2} name="MSL" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="height" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="AGL" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="speed" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="speed" stroke="hsl(210 80% 50%)" strokeWidth={2} name="H.hastighet" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="vSpeed" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="V.hastighet" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        {/* Unified battery tab */}
        <TabsContent value="batteryInfo" className="mt-2 space-y-2">
          {batterySummary && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[10px] sm:text-xs">
              {batterySummary.cycles != null && <InfoCell label="Sykluser" value={`${batterySummary.cycles}`} />}
              {batterySummary.healthPct != null && <InfoCell label="Helse" value={`${batterySummary.healthPct}%`} />}
              {batterySummary.fullCapacityMah != null && <InfoCell label="Kapasitet" value={`${batterySummary.fullCapacityMah} mAh`} />}
              {batterySummary.voltageMinV != null && <InfoCell label="Min spenning" value={`${batterySummary.voltageMinV.toFixed(2)} V`} />}
              {batterySummary.tempMaxC != null && <InfoCell label="Maks temp" value={`${batterySummary.tempMaxC}°C`} />}
              {batterySummary.cellDeviationV != null && <InfoCell label="Celleavvik" value={`${batterySummary.cellDeviationV.toFixed(3)} V`} />}
            </div>
          )}
          {(hasData(positions, 'battery') || hasData(positions, 'battery1')) && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">Batteri %</p>
              <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []} height={100}>
                {isDualBattery && hasData(positions, 'battery1') && (
                  <Line type="monotone" dataKey="battery1" stroke="hsl(142 76% 36%)" strokeWidth={2} name="Batteri 1 %" dot={false} isAnimationActive={false} />
                )}
                {isDualBattery && hasData(positions, 'battery2') && (
                  <Line type="monotone" dataKey="battery2" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Batteri 2 %" dot={false} isAnimationActive={false} />
                )}
                {!isDualBattery && hasData(positions, 'battery') && (
                  <Line type="monotone" dataKey="battery" stroke="hsl(142 76% 36%)" strokeWidth={2} name="Batteri %" dot={false} isAnimationActive={false} />
                )}
              </MiniChart>
            </div>
          )}
          {(hasData(positions, 'temp') || hasData(positions, 'temp1') || hasData(positions, 'temp2')) && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">Temperatur °C</p>
              <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []} height={100}>
                {hasData(positions, 'temp') && !isDualBattery && (
                  <Line type="monotone" dataKey="temp" stroke="hsl(0 84% 60%)" strokeWidth={2} name="Temp" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'temp1') && (
                  <Line type="monotone" dataKey="temp1" stroke="hsl(0 84% 60%)" strokeWidth={2} name="Temp B1" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'temp2') && (
                  <Line type="monotone" dataKey="temp2" stroke="hsl(25 95% 53%)" strokeWidth={2} name="Temp B2" dot={false} isAnimationActive={false} />
                )}
              </MiniChart>
            </div>
          )}
          {(hasData(positions, 'current') || hasData(positions, 'current1') || hasData(positions, 'current2')) && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">Strøm A</p>
              <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []} height={100}>
                {hasData(positions, 'current') && !isDualBattery && (
                  <Line type="monotone" dataKey="current" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Strøm" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'current1') && (
                  <Line type="monotone" dataKey="current1" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Strøm B1" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'current2') && (
                  <Line type="monotone" dataKey="current2" stroke="hsl(280 65% 60%)" strokeWidth={2} name="Strøm B2" dot={false} isAnimationActive={false} />
                )}
              </MiniChart>
            </div>
          )}
          {(hasData(positions, 'voltage') || hasData(positions, 'voltage1') || hasData(positions, 'voltage2')) && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">Spenning V</p>
              <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []} height={100}>
                {hasData(positions, 'voltage') && !isDualBattery && (
                  <Line type="monotone" dataKey="voltage" stroke="hsl(38 92% 50%)" strokeWidth={2} name="Spenning" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'voltage1') && (
                  <Line type="monotone" dataKey="voltage1" stroke="hsl(38 92% 50%)" strokeWidth={2} name="Spenning B1" dot={false} isAnimationActive={false} />
                )}
                {hasData(positions, 'voltage2') && (
                  <Line type="monotone" dataKey="voltage2" stroke="hsl(280 65% 60%)" strokeWidth={2} name="Spenning B2" dot={false} isAnimationActive={false} />
                )}
              </MiniChart>
            </div>
          )}
        </TabsContent>

        <TabsContent value="gps" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="stepAfter" dataKey="gpsNum" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Satellitter" dot={false} isAnimationActive={false} />
            <ReferenceLine y={6} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: "Min 6", fill: "hsl(var(--destructive))", fontSize: 10 }} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="rc" className="mt-2 space-y-3">
          {/* Visual DJI stick widgets */}
          {current && (
            <div className="flex items-center justify-center gap-6">
              <StickWidget
                x={current.rcRudder ?? 0}
                y={current.rcThrottle ?? 0}
                label="Venstre stikke"
                xLabel="Rudder"
                yLabel="Throttle"
                inputRange={rcInputRange}
              />
              <StickWidget
                x={current.rcAileron ?? 0}
                y={current.rcElevator ?? 0}
                label="Høyre stikke"
                xLabel="Aileron"
                yLabel="Elevator"
                inputRange={rcInputRange}
              />
            </div>
          )}
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="rcElevator" stroke="hsl(210 80% 50%)" strokeWidth={1.5} name="Elevator" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcAileron" stroke="hsl(142 76% 36%)" strokeWidth={1.5} name="Aileron" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcThrottle" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Throttle" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rcRudder" stroke="hsl(280 65% 60%)" strokeWidth={1.5} name="Rudder" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="gimbal" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="gimbalPitch" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Tilt" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="gimbalYaw" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Pan" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="distance" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="dist2D" stroke="hsl(210 80% 50%)" strokeWidth={2} name="2D avstand" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="dist3D" stroke="hsl(280 65% 60%)" strokeWidth={1.5} name="3D avstand" dot={false} isAnimationActive={false} />
          </MiniChart>
        </TabsContent>

        <TabsContent value="wind" className="mt-2">
          <MiniChart data={chartData} currentIndex={currentIndex} onIndexChange={onIndexChange} eventIndices={showWarnings ? eventIndices : []}>
            <Line type="monotone" dataKey="windSpeed" stroke="hsl(210 80% 50%)" strokeWidth={2} name="Vindstyrke m/s" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="windDir" stroke="hsl(38 92% 50%)" strokeWidth={1.5} name="Retning °" dot={false} isAnimationActive={false} yAxisId="right" />
          </MiniChart>
        </TabsContent>

        {/* Warnings list tab */}
        <TabsContent value="warnings" className="mt-2">
          <ScrollArea className="h-[160px]">
            <div className="space-y-1">
              {eventIndices.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Ingen hendelser registrert</p>
              ) : (
                eventIndices.map((e, i) => {
                  const time = formatTime(e.index, positions);
                      const isActive = selectedEventIdx === i;
                      const color = e.type === 'RTH' || e.type === 'app_warning_critical'
                        ? 'text-destructive'
                        : e.type === 'LOW_BATTERY' || e.type === 'app_warning_important'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-orange-600 dark:text-orange-400';
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-start gap-2 transition-colors hover:bg-accent/15 ${isActive ? 'bg-accent/20 ring-1 ring-primary/30' : ''}`}
                      onClick={() => { onIndexChange(e.index); setSelectedEventIdx(i); }}
                    >
                      <span className="font-mono text-muted-foreground shrink-0 mt-0.5 tabular-nums">{time}</span>
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${color}`} />
                      <div className="min-w-0">
                        <span className={`font-medium ${color}`}>{e.type}</span>
                        <p className="text-muted-foreground break-words leading-snug">{e.message}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const InfoCell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-muted/50 rounded px-1.5 py-1 text-center">
    <div className="text-muted-foreground truncate">{label}</div>
    <div className="font-medium truncate">{value}</div>
  </div>
);

const MiniChart = ({ data, currentIndex, onIndexChange, eventIndices, children, height = 160 }: {
  data: any[]; currentIndex: number; onIndexChange: (i: number) => void;
  eventIndices: Array<{ index: number; type: string; message: string }>;
  children: React.ReactNode;
  height?: number;
}) => {
  const hasRightAxis = (Array.isArray(children) ? children : [children]).some(
    (child: any) => child?.props?.yAxisId === 'right'
  );

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: hasRightAxis ? 40 : 10, left: 0, bottom: 5 }}
          onClick={(e: any) => {
            if (e?.activeTooltipIndex != null) onIndexChange(e.activeTooltipIndex);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
          <XAxis dataKey="idx" hide />
          <YAxis fontSize={10} width={40} />
          {hasRightAxis && <YAxis yAxisId="right" orientation="right" fontSize={10} width={40} />}
          <Tooltip content={<ChartTooltip />} />
          {/* Current position indicator */}
          <ReferenceLine x={currentIndex} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 2" />
          {/* Event markers */}
          {eventIndices.map((e, i) => (
            <ReferenceLine
              key={i}
              x={e.index}
              stroke={e.type === 'RTH' ? 'hsl(var(--destructive))' : 'hsl(38 92% 50%)'}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          ))}
          {children}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
