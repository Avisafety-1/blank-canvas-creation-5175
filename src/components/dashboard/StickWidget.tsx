interface StickWidgetProps {
  x: number;
  y: number;
  label: string;
  xLabel?: string;
  yLabel?: string;
  inputRange?: 'dji' | 'ardupilot';
}

const SIZE = 80;
const PAD = 4;
const RANGE = SIZE - PAD * 2;

const normalize = (val: number, min: number, max: number) =>
  Math.max(0, Math.min(1, (val - min) / (max - min)));

export const StickWidget = ({ x, y, label, xLabel, yLabel, inputRange }: StickWidgetProps) => {
  // Use explicit inputRange if provided, otherwise fall back to auto-detect
  const isArduPilot = inputRange
    ? inputRange === 'ardupilot'
    : (x > 1700 || y > 1700);
  const min = isArduPilot ? 1000 : 364;
  const max = isArduPilot ? 2000 : 1684;
  const nx = normalize(x, min, max);
  const ny = normalize(y, min, max);

  const cx = PAD + nx * RANGE;
  const cy = PAD + (1 - ny) * RANGE; // invert Y so up = positive

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={SIZE} height={SIZE} className="border border-border rounded bg-muted/30">
        {/* Crosshair */}
        <line x1={SIZE / 2} y1={PAD} x2={SIZE / 2} y2={SIZE - PAD} stroke="hsl(var(--border))" strokeWidth={1} />
        <line x1={PAD} y1={SIZE / 2} x2={SIZE - PAD} y2={SIZE / 2} stroke="hsl(var(--border))" strokeWidth={1} />
        {/* Stick dot */}
        <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" strokeWidth={1.5} />
      </svg>
      <span className="text-[10px] font-medium text-foreground">{label}</span>
      {(xLabel || yLabel) && (
        <span className="text-[9px] text-muted-foreground">
          {xLabel}{xLabel && yLabel ? ' / ' : ''}{yLabel}
        </span>
      )}
    </div>
  );
};
