import { useState } from "react";
import { 
  Layers, 
  Ban, 
  AlertTriangle, 
  TreePine, 
  Radio, 
  PlaneLanding, 
  Plane, 
  MapPin,
  Shield,
  Navigation,
  Radar,
  Users,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  layers: Layers,
  ban: Ban,
  alertTriangle: AlertTriangle,
  treePine: TreePine,
  radio: Radio,
  planeLanding: PlaneLanding,
  plane: Plane,
  mapPin: MapPin,
  shield: Shield,
  navigation: Navigation,
  radar: Radar,
  users: Users,
  zap: Zap,
};

export interface LayerConfig {
  id: string;
  name: string;
  layer: L.Layer;
  enabled: boolean;
  icon?: string;
}

interface MapLayerControlProps {
  layers: LayerConfig[];
  onLayerToggle: (id: string, enabled: boolean) => void;
}

export function MapLayerControl({ layers, onLayerToggle }: MapLayerControlProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg bg-card hover:bg-accent"
          aria-label="Kartlag"
        >
          <Layers className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] sm:w-[320px]">
        <SheetHeader>
          <SheetTitle>Kartlag</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-6 h-[calc(100vh-8rem)]">
          <div className="space-y-4 pr-3">
            {layers.map((layer) => {
              const IconComponent = layer.icon ? iconMap[layer.icon] : null;
              return (
                <div key={layer.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={layer.id}
                    checked={layer.enabled}
                    onCheckedChange={(checked) => {
                      onLayerToggle(layer.id, checked as boolean);
                    }}
                  />
                  {IconComponent && (
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Label
                    htmlFor={layer.id}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {layer.name}
                  </Label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
