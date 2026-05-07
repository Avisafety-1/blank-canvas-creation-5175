import { LayoutDashboard, Lightbulb, FileEdit, Settings, Image, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MarketingSection = "overview" | "ideas" | "drafts" | "visuals" | "newsletter" | "settings";

const items: { key: MarketingSection; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Oversikt", icon: LayoutDashboard },
  { key: "ideas", label: "Idéer", icon: Lightbulb },
  { key: "drafts", label: "Utkast", icon: FileEdit },
  { key: "visuals", label: "Visuelt", icon: Image },
  { key: "newsletter", label: "Nyhetsbrev", icon: Mail },
  { key: "settings", label: "Innstillinger", icon: Settings },
];

interface Props {
  active: MarketingSection;
  onChange: (s: MarketingSection) => void;
}

export const MarketingSidebar = ({ active, onChange }: Props) => (
  <>
    {/* Desktop sidebar */}
    <aside className="hidden md:flex flex-col w-56 border-r border-border bg-card/50 p-4 gap-1">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wider">Marketing</h2>
      {items.map((item) => (
        <Button
          key={item.key}
          variant="ghost"
          size="sm"
          className={cn(
            "justify-start gap-2 w-full",
            active === item.key && "bg-accent text-accent-foreground font-medium"
          )}
          onClick={() => onChange(item.key)}
        >
          <item.icon className="w-4 h-4" />
          {item.label}
        </Button>
      ))}
    </aside>

    {/* Mobile tabs - compact icon-only with label below */}
    <div className="flex md:hidden border-b border-border bg-card/50">
      {items.map((item) => (
        <button
          key={item.key}
          className={cn(
            "flex-1 flex flex-col items-center gap-0.5 py-2 text-muted-foreground transition-colors border-b-2 border-transparent",
            active === item.key && "border-primary text-primary font-medium"
          )}
          onClick={() => onChange(item.key)}
        >
          <item.icon className="w-4 h-4" />
          <span className="text-[10px] leading-tight">{item.label}</span>
        </button>
      ))}
    </div>
  </>
);
