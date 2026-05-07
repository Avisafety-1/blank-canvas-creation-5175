import { GlassCard } from "@/components/GlassCard";
import { Calendar as CalendarIcon, FileText, Wrench, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, addDays } from "date-fns";
import { nb } from "date-fns/locale";
import { mockDocuments, mockMissions, mockDrones, mockEquipment } from "@/data/mockData";

const now = new Date();

// Generate calendar items from mock data
const calendarItems = [
  ...mockDocuments
    .filter((doc) => doc.gyldig_til)
    .map((doc) => ({
      type: "Dokument",
      title: `${doc.tittel} utgår`,
      date: doc.gyldig_til!,
      icon: FileText,
      color: "text-blue-500",
    })),
  ...mockMissions.map((mission) => ({
    type: "Oppdrag",
    title: mission.tittel,
    date: mission.start,
    icon: CalendarIcon,
    color: "text-primary",
  })),
  ...mockDrones
    .filter((drone) => drone.neste_inspeksjon)
    .map((drone) => ({
      type: "Vedlikehold",
      title: `${drone.modell} - inspeksjon`,
      date: drone.neste_inspeksjon!,
      icon: Wrench,
      color: "text-orange-500",
    })),
  ...mockEquipment
    .filter((eq) => eq.neste_vedlikehold)
    .map((eq) => ({
      type: "Vedlikehold",
      title: `${eq.navn} - vedlikehold`,
      date: eq.neste_vedlikehold!,
      icon: Wrench,
      color: "text-orange-500",
    })),
]
  .sort((a, b) => a.date.getTime() - b.date.getTime())
  .slice(0, 6);

export const CalendarSection = () => {
  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-3">
        <CalendarIcon className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Kalender</h2>
      </div>

      <div className="space-y-2">
        {calendarItems.map((item, index) => {
          const Icon = item.icon;
          const isUrgent = item.date < addDays(now, 7);
          
          return (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${item.color}`} />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{item.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                    {item.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(item.date, "dd. MMM", { locale: nb })}
                  </span>
                </div>
              </div>
              {isUrgent && <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
