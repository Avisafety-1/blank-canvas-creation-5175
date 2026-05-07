import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, FileEdit, Loader2 } from "lucide-react";
import type { MarketingSection } from "./MarketingSidebar";
import { GENERATION_PRESETS } from "./marketingPresets";

interface Props {
  onNavigate: (section: MarketingSection) => void;
}

export const MarketingIdeas = ({ onNavigate }: Props) => {
  const { companyId, user } = useAuth();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [presetFilter, setPresetFilter] = useState("all");

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["marketing-ideas", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_content_ideas")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const generateMutation = useMutation({
    mutationFn: async (t: string) => {
      const { data, error } = await supabase.functions.invoke("marketing-ai", {
        body: {
          type: "ideas",
          topic: t,
          preset: presetFilter !== "all" ? presetFilter : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.ideas as { title: string; description: string; category: string; suggestedPreset?: string }[];
    },
    onSuccess: async (ideas) => {
      const rows = ideas.map((i) => ({
        company_id: companyId!,
        created_by: user?.id,
        title: i.title,
        description: i.description,
        category: i.category,
        ai_generated: true,
      }));
      const { error } = await supabase.from("marketing_content_ideas").insert(rows);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["marketing-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-ideas-count"] });
      toast.success(`${ideas.length} idéer generert!`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addManual = async () => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("marketing_content_ideas").insert({
      company_id: companyId!,
      created_by: user?.id,
      title: newTitle.trim(),
      ai_generated: false,
    });
    if (error) {
      toast.error("Kunne ikke legge til idé");
      return;
    }
    setNewTitle("");
    queryClient.invalidateQueries({ queryKey: ["marketing-ideas"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-ideas-count"] });
  };

  const deleteIdea = async (id: string) => {
    await supabase.from("marketing_content_ideas").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["marketing-ideas"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-ideas-count"] });
  };

  const createDraftFromIdea = async (idea: { id: string; title: string; category?: string | null }) => {
    const matchedPreset = GENERATION_PRESETS.find((p) => {
      if (idea.category === "blog") return p.id === "industry_insight";
      if (idea.category === "social") return p.id === "safety_tip";
      return false;
    });

    const { error } = await supabase.from("marketing_drafts").insert({
      company_id: companyId!,
      created_by: user?.id,
      idea_id: idea.id,
      title: idea.title,
      platform: "linkedin",
      metadata: matchedPreset ? { preset: matchedPreset.id } : {},
    });
    if (error) {
      toast.error("Kunne ikke opprette utkast");
      return;
    }
    await supabase
      .from("marketing_content_ideas")
      .update({ status: "drafted" })
      .eq("id", idea.id);
    queryClient.invalidateQueries({ queryKey: ["marketing-ideas"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    toast.success("Utkast opprettet");
    onNavigate("drafts");
  };

  const categoryColors: Record<string, string> = {
    blog: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    social: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    newsletter: "bg-green-500/10 text-green-700 dark:text-green-400",
    video: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Innholdsidéer</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">Generer idéer med AI eller legg til manuelt.</p>
      </div>

      {/* AI Generate */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Tema for idéer (valgfritt)..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex-1"
            />
            <Select value={presetFilter} onValueChange={setPresetFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Alle typer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle typer</SelectItem>
                {GENERATION_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => generateMutation.mutate(topic)}
            disabled={generateMutation.isPending}
            className="gap-2 w-full sm:w-auto"
            size="sm"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generer idéer
          </Button>
        </CardContent>
      </Card>

      {/* Manual add */}
      <div className="flex gap-2">
        <Input
          placeholder="Legg til idé manuelt..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addManual()}
          className="flex-1"
        />
        <Button variant="outline" onClick={addManual} className="gap-1 flex-shrink-0" size="sm">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Legg til</span>
        </Button>
      </div>

      {/* Ideas list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : ideas.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Ingen idéer ennå. Generer noen med AI!</p>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <Card key={idea.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground">{idea.title}</h3>
                      {idea.category && (
                        <Badge variant="secondary" className={categoryColors[idea.category] || ""}>
                          {idea.category}
                        </Badge>
                      )}
                      {idea.ai_generated && (
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" /> AI
                        </Badge>
                      )}
                      {idea.status === "drafted" && (
                        <Badge variant="secondary">Utkast laget</Badge>
                      )}
                    </div>
                    {idea.description && (
                      <p className="text-sm text-muted-foreground mt-1">{idea.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {idea.status !== "drafted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => createDraftFromIdea(idea)}
                        title="Lag utkast"
                      >
                        <FileEdit className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteIdea(idea.id)}
                      title="Slett"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
