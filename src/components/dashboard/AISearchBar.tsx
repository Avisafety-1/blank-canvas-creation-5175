import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Bot, Database, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePlanGating } from "@/hooks/usePlanGating";
import { toast } from "sonner";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { IncidentDetailDialog } from "./IncidentDetailDialog";
import { DocumentDetailDialog } from "./DocumentDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";
import { NewsDetailDialog } from "./NewsDetailDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

interface SearchResults {
  summary: string;
  results: {
    missions: any[];
    incidents: any[];
    documents: any[];
    equipment: any[];
    drones: any[];
    competencies: any[];
    sora: any[];
    personnel: any[];
    customers: any[];
    news: any[];
    flightLogs: any[];
    calendarEvents: any[];
  };
}

export const AISearchBar = () => {
  const { t } = useTranslation();
  const { canAccess } = usePlanGating();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchMode, setSearchMode] = useState<"internal" | "regulations">("internal");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [selectedSora, setSelectedSora] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!query.trim() && searchMode === "internal") {
      setResults(null);
    }
  }, [query, searchMode]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleModeChange = (checked: boolean) => {
    setSearchMode(checked ? "regulations" : "internal");
    setResults(null);
    setChatMessages([]);
    setQuery("");
  };
  const handleSearch = async () => {
    if (!query.trim() || !user) return;
    if (!canAccess('ai_search')) {
      toast.error(t('plan.upgradeRequired', 'Oppgradering påkrevd'), {
        description: t('plan.featureRequiresPlan', { plan: 'Grower', defaultValue: 'Denne funksjonen krever Grower-planen eller høyere.' }),
      });
      return;
    }
    if (searchMode === "regulations") {
      return handleRegulationsSearch();
    }
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: {
          query: query.trim(),
          userId: user.id,
        },
      });
      if (error) throw error;
      setResults(data);
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error(t('dashboard.search.couldNotSearch'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleRegulationsSearch = async () => {
    if (!query.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: query.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setQuery("");
    setIsStreaming(true);

    let assistantSoFar = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drone-regulations-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ messages: newMessages }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || "AI-feil");
      }

      if (!resp.body) throw new Error("Ingen respons");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setChatMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      console.error("Regulations AI error:", e);
      toast.error(e.message || "Kunne ikke kontakte AI-assistenten");
      setChatMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getTotalResults = () => {
    if (!results) return 0;
    const r = results.results;
    return (
      r.missions.length +
      r.incidents.length +
      r.documents.length +
      r.equipment.length +
      r.drones.length +
      r.competencies.length +
      r.sora.length +
      r.personnel.length +
      r.customers.length +
      r.news.length +
      r.flightLogs.length +
      r.calendarEvents.length
    );
  };

  const handleMissionClick = async (missionId: string) => {
    const { data, error } = await supabase.from("missions").select("*").eq("id", missionId).single();
    if (error) {
      toast.error("Kunne ikke hente oppdragsdetaljer");
      return;
    }
    setSelectedMission(data);
  };

  const handleIncidentClick = async (incidentId: string) => {
    const { data, error } = await supabase.from("incidents").select("*").eq("id", incidentId).single();
    if (error) {
      toast.error("Kunne ikke hente hendelsesdetaljer");
      return;
    }
    setSelectedIncident(data);
  };

  const handleDocumentClick = async (documentId: string) => {
    const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
    if (error) {
      toast.error("Kunne ikke hente dokumentdetaljer");
      return;
    }
    setSelectedDocument(data);
  };

  const handleEquipmentClick = async (equipmentId: string) => {
    const { data, error } = await supabase.from("equipment").select("*").eq("id", equipmentId).single();
    if (error) {
      toast.error("Kunne ikke hente utstyrsdetaljer");
      return;
    }
    setSelectedEquipment(data);
  };

  const handleDroneClick = async (droneId: string) => {
    const { data, error } = await supabase.from("drones").select("*").eq("id", droneId).single();
    if (error) {
      toast.error("Kunne ikke hente dronedetaljer");
      return;
    }
    setSelectedDrone(data);
  };

  const handleSoraClick = async (soraId: string) => {
    const { data, error } = await supabase.from("mission_sora").select("mission_id").eq("id", soraId).single();
    if (error) {
      toast.error("Kunne ikke hente SORA-detaljer");
      return;
    }
    setSelectedSora(data.mission_id);
  };

  const handleNewsClick = async (newsId: string) => {
    const { data, error } = await supabase.from("news").select("*").eq("id", newsId).single();
    if (error) {
      toast.error("Kunne ikke hente nyhetsdetaljer");
      return;
    }
    setSelectedNews(data);
  };

  const handlePersonClick = async (personId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, personnel_competencies(*)")
      .eq("id", personId)
      .single();
    if (error) {
      toast.error("Kunne ikke hente persondetaljer");
      return;
    }
    setSelectedPerson(data);
  };

  const getDocumentStatus = (doc: any): string => {
    if (!doc.gyldig_til) return "Grønn";
    const today = new Date();
    const expiryDate = new Date(doc.gyldig_til);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return "Rød";
    if (daysUntilExpiry <= (doc.varsel_dager_for_utløp || 30)) return "Gul";
    return "Grønn";
  };

  return (
    <div className="relative">
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="search-mode" className="text-xs text-muted-foreground whitespace-nowrap">
                Internt søk
              </Label>
              <Switch
                id="search-mode"
                checked={searchMode === "regulations"}
                onCheckedChange={handleModeChange}
              />
              <Bot className={`h-4 w-4 ${searchMode === "regulations" ? "text-primary" : "text-muted-foreground"}`} />
              <Label className="text-xs text-muted-foreground whitespace-nowrap">(regelverkssøk)</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              placeholder={
                searchMode === "regulations"
                  ? "Spør om droneregelverk, teori, regler..."
                  : t('dashboard.search.placeholder')
              }
            />
            <Button onClick={handleSearch} disabled={(isSearching || isStreaming) || !query.trim()}>
              {(isSearching || isStreaming) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </GlassCard>

      {searchMode === "regulations" && chatMessages.length > 0 && (
        <GlassCard className="absolute z-50 left-0 right-0 mt-2 p-6 max-h-[500px] shadow-lg border border-border">
          <div className="space-y-4 overflow-y-auto max-h-[460px]" ref={chatContainerRef}>
          <div className="flex justify-end sticky top-0 z-10">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full bg-muted/80 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setChatMessages([])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && chatMessages[chatMessages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
          </div>
        </GlassCard>
      )}

      {searchMode === "internal" && results && (
        <GlassCard className="absolute z-50 left-0 right-0 mt-2 p-6 max-h-[400px] shadow-lg border border-border">
          <div className="space-y-4 overflow-y-auto max-h-[360px]">
          <div className="flex justify-end sticky top-0 z-10">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full bg-muted/80 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setResults(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{t('dashboard.search.results')} ({getTotalResults()})</h3>
            {results.summary && <p className="text-sm text-muted-foreground">{results.summary}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.results.missions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Oppdrag ({results.results.missions.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.missions.map((m: any) => (
                    <li
                      key={m.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleMissionClick(m.id)}
                    >
                      • {m.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.incidents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Hendelser ({results.results.incidents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.incidents.map((i: any) => (
                    <li
                      key={i.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleIncidentClick(i.id)}
                    >
                      • {i.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.documents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Dokumenter ({results.results.documents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.documents.map((d: any) => (
                    <li
                      key={d.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleDocumentClick(d.id)}
                    >
                      • {d.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.equipment.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Utstyr ({results.results.equipment.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.equipment.map((e: any) => (
                    <li
                      key={e.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleEquipmentClick(e.id)}
                    >
                      • {e.navn}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.drones.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Droner ({results.results.drones.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.drones.map((d: any) => (
                    <li
                      key={d.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleDroneClick(d.id)}
                    >
                      • {d.modell}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.competencies.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kompetanser ({results.results.competencies.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.competencies.map((c: any) => (
                    <li key={c.id} className="text-muted-foreground">
                      • {c.navn} ({c.type})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.sora.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">SORA-analyser ({results.results.sora.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.sora.map((s: any) => (
                    <li
                      key={s.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleSoraClick(s.id)}
                    >
                      • SORA analyse ({s.sora_status})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.personnel.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Personell ({results.results.personnel.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.personnel.map((p: any) => (
                    <li
                      key={p.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handlePersonClick(p.id)}
                    >
                      • {p.full_name} {p.tittel && <span className="text-xs">({p.tittel})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.customers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kunder ({results.results.customers.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.customers.map((c: any) => (
                    <li key={c.id} className="text-muted-foreground">
                      • {c.navn} {c.kontaktperson && <span className="text-xs">({c.kontaktperson})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.news.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Nyheter ({results.results.news.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.news.map((n: any) => (
                    <li
                      key={n.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleNewsClick(n.id)}
                    >
                      • {n.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.flightLogs.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Flylogger ({results.results.flightLogs.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.flightLogs.map((f: any) => (
                    <li key={f.id} className="text-muted-foreground">
                      • {format(new Date(f.flight_date), "dd.MM.yy", { locale: nb })}: {f.departure_location} → {f.landing_location}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.calendarEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kalender ({results.results.calendarEvents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.calendarEvents.map((e: any) => (
                    <li key={e.id} className="text-muted-foreground">
                      • {format(new Date(e.event_date), "dd.MM.yy", { locale: nb })}: {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          </div>
        </GlassCard>
      )}

      <MissionDetailDialog
        open={!!selectedMission}
        onOpenChange={(open) => !open && setSelectedMission(null)}
        mission={selectedMission}
      />
      <IncidentDetailDialog
        open={!!selectedIncident}
        onOpenChange={(open) => !open && setSelectedIncident(null)}
        incident={selectedIncident}
      />
      <DocumentDetailDialog
        open={!!selectedDocument}
        onOpenChange={(open) => !open && setSelectedDocument(null)}
        document={selectedDocument}
        status={selectedDocument ? getDocumentStatus(selectedDocument) : "Grønn"}
      />
      <EquipmentDetailDialog
        open={!!selectedEquipment}
        onOpenChange={(open) => !open && setSelectedEquipment(null)}
        equipment={selectedEquipment}
        onEquipmentUpdated={() => {}}
      />
      <DroneDetailDialog
        open={!!selectedDrone}
        onOpenChange={(open) => !open && setSelectedDrone(null)}
        drone={selectedDrone}
        onDroneUpdated={() => {}}
      />
      <SoraAnalysisDialog
        open={!!selectedSora}
        onOpenChange={(open) => !open && setSelectedSora(null)}
        missionId={selectedSora || undefined}
      />
      <NewsDetailDialog
        open={!!selectedNews}
        onOpenChange={(open) => !open && setSelectedNews(null)}
        news={selectedNews}
      />
      <PersonCompetencyDialog
        open={!!selectedPerson}
        onOpenChange={(open) => !open && setSelectedPerson(null)}
        person={selectedPerson}
        onCompetencyUpdated={() => {}}
      />
    </div>
  );
};
