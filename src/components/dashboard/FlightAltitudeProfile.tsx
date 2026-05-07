import { useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TerrainPoint } from "@/lib/terrainElevation";

interface FlightAltitudeProfileProps {
  data: TerrainPoint[];
  loading?: boolean;
  onHoverIndex?: (index: number | null) => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TerrainPoint | undefined;
  if (!d) return null;

  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg p-3 text-xs shadow-lg">
      <div className="font-semibold mb-1">
        Avstand: {d.distance.toFixed(2)} km
      </div>
      <hr className="my-1 border-border" />
      {d.alt_msl != null && (
        <div>Høyde (MSL): {Math.round(d.alt_msl)} m</div>
      )}
      {d.terrain_elevation != null && (
        <div>Terreng: {Math.round(d.terrain_elevation)} m</div>
      )}
      {d.agl != null && (
        <div className="font-semibold text-primary">
          Høyde (AGL): {Math.round(d.agl)} m
        </div>
      )}
      {d.speed != null && <div>Hastighet: {d.speed.toFixed(1)} m/s</div>}
      {d.timestamp && (
        <div>
          Tid: {new Date(d.timestamp).toLocaleTimeString("nb-NO")}
        </div>
      )}
    </div>
  );
};

export const FlightAltitudeProfile = ({
  data,
  loading,
  onHoverIndex,
}: FlightAltitudeProfileProps) => {
  const handleMouseMove = useCallback(
    (state: any) => {
      if (onHoverIndex && state?.activeTooltipIndex != null) {
        onHoverIndex(state.activeTooltipIndex);
      }
    },
    [onHoverIndex]
  );

  const handleMouseLeave = useCallback(() => {
    onHoverIndex?.(null);
  }, [onHoverIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
        Henter terrengdata...
      </div>
    );
  }

  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
        Ingen høydedata tilgjengelig
      </div>
    );
  }

  // Calculate Y-axis domain with padding
  const allAltitudes = data
    .flatMap((d) => [d.alt_msl, d.terrain_elevation])
    .filter((v): v is number => v != null);
  const minY = Math.max(0, Math.floor((Math.min(...allAltitudes) - 20) / 10) * 10);
  const maxY = Math.ceil((Math.max(...allAltitudes) + 20) / 10) * 10;

  return (
    <div className="w-full h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="distance"
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
            label={{ value: "km", position: "insideBottomRight", offset: -5, fontSize: 11 }}
            fontSize={10}
          />
          <YAxis
            domain={[minY, maxY]}
            tickFormatter={(v: number) => `${v}`}
            label={{ value: "m", position: "insideTopLeft", offset: -5, fontSize: 11 }}
            fontSize={10}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Terrain filled area (brown/green) */}
          <Area
            type="monotone"
            dataKey="terrain_elevation"
            stroke="#8B7355"
            fill="#8B7355"
            fillOpacity={0.4}
            strokeWidth={1.5}
            name="Terreng"
            dot={false}
            isAnimationActive={false}
          />
          {/* Flight altitude line (blue) */}
          <Area
            type="monotone"
            dataKey="alt_msl"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.1}
            strokeWidth={2}
            name="Flyhøyde (MSL)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
