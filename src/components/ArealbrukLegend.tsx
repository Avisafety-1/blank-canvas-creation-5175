const categories = [
  { color: "#e74c3c", label: "Bolig" },
  { color: "#8e44ad", label: "Næring/Kontor" },
  { color: "#7f8c8d", label: "Industri/Lager" },
  { color: "#27ae60", label: "Fritid/Park" },
  { color: "#f39c12", label: "Offentlig" },
  { color: "#8d6e63", label: "Transport" },
];

export function ArealbrukLegend() {
  return (
    <div className="absolute bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto bg-background/95 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg border border-border z-[1000]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Arealbruk:</span>
        {categories.map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
