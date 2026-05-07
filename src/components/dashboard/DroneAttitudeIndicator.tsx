interface DroneAttitudeIndicatorProps {
  pitch: number;  // degrees, positive = nose up
  roll: number;   // degrees, positive = right roll
  yaw?: number;   // heading degrees
}

export const DroneAttitudeIndicator = ({ pitch, roll, yaw }: DroneAttitudeIndicatorProps) => {
  // Clamp pitch to ±45° for visual range
  const clampedPitch = Math.max(-45, Math.min(45, pitch));
  const pitchOffset = (clampedPitch / 45) * 20; // max 20px shift

  return (
    <div className="w-[108px] h-[108px] sm:h-full sm:w-auto sm:aspect-square sm:max-w-[280px] rounded-lg bg-background/80 backdrop-blur-sm border border-border shadow-lg flex flex-col items-center justify-center overflow-hidden p-1">
      {/* Attitude ball */}
      <div className="w-[84px] h-[84px] sm:w-[85%] sm:h-[85%] sm:max-w-full sm:max-h-full rounded-full border border-border overflow-hidden relative bg-sky-400 dark:bg-sky-600 aspect-square">
        {/* Ground half - shifts with pitch */}
        <div
          className="absolute left-0 right-0 bg-amber-700/70 dark:bg-amber-800/70"
          style={{
            top: `${50 + pitchOffset}%`,
            bottom: 0,
            transform: `rotate(${roll}deg)`,
            transformOrigin: `50% ${50 - pitchOffset}%`,
          }}
        />
        {/* Horizon line */}
        <div
          className="absolute left-0 right-0 h-[2px] bg-foreground/60"
          style={{
            top: `calc(${50 + pitchOffset}% - 1px)`,
            transform: `rotate(${roll}deg)`,
            transformOrigin: '50% 50%',
          }}
        />
        {/* Center drone reference */}
        <svg viewBox="0 0 84 84" className="absolute inset-0 w-full h-full">
          {/* Wings */}
          <line x1="18" y1="42" x2="33" y2="42" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" />
          <line x1="51" y1="42" x2="66" y2="42" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" />
          {/* Center dot */}
          <circle cx="42" cy="42" r="4.5" fill="hsl(var(--foreground))" />
          {/* Nose */}
          <line x1="42" y1="42" x2="42" y2="33" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      {/* Heading */}
      {yaw !== undefined && (
        <span className="text-[11px] font-mono text-muted-foreground leading-none mt-1">
          {Math.round(((yaw % 360) + 360) % 360)}°
        </span>
      )}
    </div>
  );
};
