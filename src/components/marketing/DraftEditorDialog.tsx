import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Layers,
  ChevronDown,
  Save,
  BookmarkPlus,
  Image,
  Eye,
  Facebook,
  Instagram,
  CalendarIcon,
  Clock,
  Upload,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GENERATION_PRESETS,
  POST_STRUCTURES,
  BRAND_VOICE_DEFAULTS,
} from "./marketingPresets";
import { VisualGeneratorDialog } from "./VisualGeneratorDialog";
import { VisualPreview } from "./VisualPreview";
import { MediaLibraryPickerDialog } from "./MediaLibraryPickerDialog";
import { useQuery, useQueryClient as useQC2 } from "@tanstack/react-query";

const DraftVisualSection = ({ draftId, draftTitle, draftHook, composedText }: { draftId: string; draftTitle: string; draftHook: string; composedText: string }) => {
  const [genOpen, setGenOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { companyId } = useAuth();
  const { data: media = [] } = useQuery({
    queryKey: ["marketing-draft-media", draftId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_media")
        .select("*")
        .eq("draft_id", draftId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const handleRemove = async (mediaId: string) => {
    // Unlink from draft (set draft_id to null) instead of deleting
    const { error } = await supabase
      .from("marketing_media")
      .update({ draft_id: null })
      .eq("id", mediaId);
    if (error) {
      toast.error("Kunne ikke fjerne bilde");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-draft-media", draftId] });
    queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
    toast.success("Bilde fjernet fra utkast");
  };

  const handlePickFromLibrary = async (mediaIds: string[]) => {
    // Link selected media to this draft
    for (const id of mediaIds) {
      const { error } = await supabase
        .from("marketing_media")
        .update({ draft_id: draftId })
        .eq("id", id);
      if (error) {
        toast.error("Kunne ikke knytte bilde");
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-draft-media", draftId] });
    queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
    toast.success(`${mediaIds.length} bilde(r) lagt til`);
  };

  return (
    <div className="space-y-2 p-2">
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {media.map((m: any) => (
            <div key={m.id} className="relative group">
              <img src={m.file_url} alt={m.title || ""} className="rounded-md border border-border w-full object-cover aspect-video" />
              <button
                onClick={() => handleRemove(m.id)}
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Fjern"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => setPickerOpen(true)}>
          <Image className="w-3.5 h-3.5" />
          Fra bibliotek
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 flex-1"
          disabled={uploading || !companyId}
          onClick={() => document.getElementById(`draft-upload-${draftId}`)?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Last opp
        </Button>
        <input
          id={`draft-upload-${draftId}`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !companyId) return;
            setUploading(true);
            try {
              const ext = file.name.split('.').pop();
              const path = `${companyId}/uploads/${Date.now()}-${file.name}`;
              const { error: upErr } = await supabase.storage.from("marketing-media").upload(path, file);
              if (upErr) throw upErr;
              const { data: urlData } = supabase.storage.from("marketing-media").getPublicUrl(path);
              const { error: dbErr } = await supabase.from("marketing_media").insert({
                company_id: companyId,
                title: file.name.replace(/\.[^.]+$/, ''),
                file_url: urlData.publicUrl,
                source_type: "upload",
                image_format: ext || "jpg",
                draft_id: draftId,
              });
              if (dbErr) throw dbErr;
              queryClient.invalidateQueries({ queryKey: ["marketing-draft-media", draftId] });
              queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
              toast.success("Bilde lastet opp");
            } catch (err: any) {
              toast.error(err.message || "Opplasting feilet");
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
        <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => setGenOpen(true)}>
          <Image className="w-3.5 h-3.5" />
          Generer ny
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewOpen(true)}>
          <Eye className="w-3.5 h-3.5" />
        </Button>
      </div>
      <MediaLibraryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={media.map((m: any) => m.id)}
        onSelect={handlePickFromLibrary}
      />
      <VisualGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        draftId={draftId}
        initialTitle={draftTitle}
        initialSubtitle={draftHook}
      />
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>LinkedIn-forhåndsvisning</DialogTitle>
          </DialogHeader>
          <VisualPreview text={composedText} imageUrl={media[0]?.file_url} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface Draft {
  id: string;
  title: string;
  content: string;
  platform: string | null;
  status: string;
  metadata?: any;
}

interface StructuredDraft {
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  suggestedAudience: string;
  characterCount: number;
  whyItWorks: string;
  audienceFit: string;
  followUpVariation: string;
}

interface Props {
  draft: Draft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const platforms = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "blog", label: "Blogg" },
  { value: "email", label: "E-post" },
];

const statuses = [
  { value: "draft", label: "Utkast" },
  { value: "review", label: "Til gjennomgang" },
  { value: "approved", label: "Godkjent" },
];

export const DraftEditorDialog = ({ draft, open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [status, setStatus] = useState("draft");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingIg, setPublishingIg] = useState(false);
  const [confirmFbOpen, setConfirmFbOpen] = useState(false);
  const [confirmIgOpen, setConfirmIgOpen] = useState(false);

  // Structured fields
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");

  // Generation options
  const [preset, setPreset] = useState("safety_tip");
  const [structure, setStructure] = useState("hook_insight_cta");
  const [language, setLanguage] = useState<"no" | "en">("no");

  // Scheduler
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState("09:00");

  // Review helper
  const [review, setReview] = useState<{
    whyItWorks: string;
    audienceFit: string;
    followUpVariation: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Variants
  const [variants, setVariants] = useState<StructuredDraft[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      setPlatform(draft.platform || "linkedin");
      setStatus(draft.status || "draft");
      setVariants([]);
      setActiveVariant(0);
      setReview(null);

      // Load scheduled_at
      const draftAny = draft as any;
      if (draftAny.scheduled_at) {
        const d = new Date(draftAny.scheduled_at);
        setScheduledDate(d);
        setScheduledTime(format(d, "HH:mm"));
      } else {
        setScheduledDate(undefined);
        setScheduledTime("09:00");
      }

      const meta = draft.metadata as any;
      if (meta?.structured) {
        setHook(meta.structured.hook || "");
        setBody(meta.structured.body || "");
        setCta(meta.structured.cta || "");
        setHashtags(meta.structured.hashtags?.join(", ") || "");
        if (meta.structured.whyItWorks) {
          setReview({
            whyItWorks: meta.structured.whyItWorks,
            audienceFit: meta.structured.audienceFit || "",
            followUpVariation: meta.structured.followUpVariation || "",
          });
        }
        if (meta.preset) setPreset(meta.preset);
        if (meta.structure) setStructure(meta.structure);
        if (meta.language) setLanguage(meta.language);
      } else {
        // Legacy plain-text content
        setHook("");
        setBody(draft.content || "");
        setCta("");
        setHashtags("");
      }
    }
  }, [draft]);

  const composePlainContent = () => {
    const parts = [hook, body, cta, hashtags ? hashtags.split(",").map((h) => `#${h.trim()}`).join(" ") : ""].filter(Boolean);
    return parts.join("\n\n");
  };

  const handleSave = async () => {
    if (!draft) return;
    const content = composePlainContent();
    const metadata = {
      ...(draft.metadata as any || {}),
      structured: {
        hook,
        body,
        cta,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        ...(review || {}),
      },
      preset,
      structure,
      language,
    };

    const { error } = await supabase
      .from("marketing_drafts")
      .update({ title, content, platform, status, metadata, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) {
      toast.error("Kunne ikke lagre");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts-count"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-approved-count"] });
    toast.success("Utkast lagret");
    onOpenChange(false);
  };

  const handleSaveAsTemplate = async () => {
    if (!draft) return;
    const content = composePlainContent();
    const metadata = {
      structured: { hook, body, cta, hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean) },
      preset,
      structure,
      language,
      isTemplate: true,
    };
    const { error } = await supabase
      .from("marketing_drafts")
      .update({ title, content, platform, status, metadata, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    if (error) {
      toast.error("Kunne ikke lagre som mal");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    toast.success("Lagret som mal");
  };

  const loadBrandSettings = () => {
    try {
      const stored = localStorage.getItem("avisafe-marketing-brand-settings");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const handleGenerate = async (variantCount = 1) => {
    setGenerating(true);
    setVariants([]);
    setActiveVariant(0);
    try {
      const presetConfig = GENERATION_PRESETS.find((p) => p.id === preset);
      const brandSettings = loadBrandSettings();

      const { data, error } = await supabase.functions.invoke("marketing-ai", {
        body: {
          type: "draft",
          ideaTitle: title,
          platform,
          preset,
          structure,
          language,
          variantCount,
          presetConfig: presetConfig
            ? { label: presetConfig.label, tone: presetConfig.tone, audience: presetConfig.audience, ctaStyle: presetConfig.ctaStyle, hashtagStyle: presetConfig.hashtagStyle }
            : undefined,
          brandSettings: brandSettings
            ? { customRules: brandSettings.customRules, bannedPhrases: brandSettings.bannedPhrases }
            : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (variantCount > 1 && data.variants) {
        setVariants(data.variants);
        applyStructured(data.variants[0]);
        toast.success(`${data.variants.length} varianter generert`);
      } else if (data.structured) {
        applyStructured(data.structured);
        toast.success("Innhold generert med AI");
      }
    } catch (e: any) {
      toast.error(e.message || "Feil ved AI-generering");
    } finally {
      setGenerating(false);
    }
  };

  const applyStructured = (s: StructuredDraft) => {
    if (s.title) setTitle(s.title);
    setHook(s.hook || "");
    setBody(s.body || "");
    setCta(s.cta || "");
    setHashtags(s.hashtags?.join(", ") || "");
    if (s.whyItWorks) {
      setReview({
        whyItWorks: s.whyItWorks,
        audienceFit: s.audienceFit || "",
        followUpVariation: s.followUpVariation || "",
      });
      setReviewOpen(true);
    }
  };

  const handlePublishFacebook = async () => {
    if (!draft) return;
    setPublishing(true);
    setConfirmFbOpen(false);
    try {
      const text = composePlainContent();
      // Get first media image if available
      const { data: media } = await supabase
        .from("marketing_media")
        .select("file_url")
        .eq("draft_id", draft.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const imageUrl = media?.[0]?.file_url || undefined;

      const { data, error } = await supabase.functions.invoke("publish-facebook", {
        body: { text, imageUrl, draftId: draft.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
      toast.success("Publisert til Facebook!", {
        description: data.postUrl ? "Se innlegget på Facebook" : undefined,
        action: data.postUrl ? { label: "Åpne", onClick: () => window.open(data.postUrl, "_blank") } : undefined,
      });
      setStatus("published");
    } catch (e: any) {
      toast.error(e.message || "Kunne ikke publisere til Facebook");
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishInstagram = async () => {
    if (!draft) return;
    setPublishingIg(true);
    setConfirmIgOpen(false);
    try {
      const text = composePlainContent();
      const { data: media } = await supabase
        .from("marketing_media")
        .select("file_url")
        .eq("draft_id", draft.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const imageUrl = media?.[0]?.file_url;

      if (!imageUrl) {
        toast.error("Instagram krever et bilde. Legg til et bilde i utkastet først.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("publish-instagram", {
        body: { text, imageUrl, draftId: draft.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
      toast.success("Publisert til Instagram!", {
        description: data.postUrl ? "Se innlegget på Instagram" : undefined,
        action: data.postUrl ? { label: "Åpne", onClick: () => window.open(data.postUrl, "_blank") } : undefined,
      });
      setStatus("published");
    } catch (e: any) {
      toast.error(e.message || "Kunne ikke publisere til Instagram");
    } finally {
      setPublishingIg(false);
    }
  };

  const handleSchedule = async () => {
    if (!draft || !scheduledDate) return;
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    const scheduledAt = new Date(scheduledDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt <= new Date()) {
      toast.error("Planlagt tidspunkt må være i fremtiden");
      return;
    }

    const content = composePlainContent();
    const metadata = {
      ...(draft.metadata as any || {}),
      structured: {
        hook, body, cta,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        ...(review || {}),
      },
      preset, structure, language,
    };

    const { error } = await supabase
      .from("marketing_drafts")
      .update({
        title, content, platform,
        status: "scheduled",
        scheduled_at: scheduledAt.toISOString(),
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
    if (error) {
      toast.error("Kunne ikke planlegge");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-scheduled-count"] });
    queryClient.invalidateQueries({ queryKey: ["marketing-next-scheduled"] });
    toast.success(`Planlagt for ${format(scheduledAt, "d. MMM yyyy HH:mm", { locale: nb })}`);
    onOpenChange(false);
  };

  const selectVariant = (idx: number) => {
    setActiveVariant(idx);
    applyStructured(variants[idx]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger utkast</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground">Tittel</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Row: Platform, Status, Language */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Plattform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Språk</label>
              <Select value={language} onValueChange={(v) => setLanguage(v as "no" | "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Norsk</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Preset, Structure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Innholdstype</label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENERATION_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Poststruktur</label>
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_STRUCTURES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(1)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Generer med AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(1)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(3)}
              disabled={generating || !title.trim()}
              className="gap-1"
            >
              <Layers className="w-3 h-3" />
              3 varianter
            </Button>
          </div>

          {/* Variant tabs */}
          {variants.length > 1 && (
            <div className="flex gap-2">
              {variants.map((_, i) => (
                <Button
                  key={i}
                  variant={i === activeVariant ? "default" : "outline"}
                  size="sm"
                  onClick={() => selectVariant(i)}
                >
                  Variant {i + 1}
                </Button>
              ))}
            </div>
          )}

          {/* Structured content fields */}
          <div>
            <label className="text-sm font-medium text-foreground">Hook</label>
            <Textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={2}
              placeholder="Åpningslinjen som fanger oppmerksomhet..."
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Hovedinnhold</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Hoveddelen av innlegget..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">CTA (Call to Action)</label>
            <Textarea
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              rows={2}
              placeholder="Handlingsoppfordring..."
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Hashtags</label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="DroneSafety, AviSafe, UAS (kommaseparert)"
              className="text-sm"
            />
          </div>

          {/* Review helper */}
          {review && (
            <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground w-full justify-between">
                  <span>AI-vurdering</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${reviewOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">Hvorfor dette fungerer</p>
                    <p className="text-muted-foreground">{review.whyItWorks}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Målgruppe</p>
                    <p className="text-muted-foreground">{review.audienceFit}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Foreslått oppfølging</p>
                    <p className="text-muted-foreground">{review.followUpVariation}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
           )}

          {/* Visual section */}
          {draft && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground w-full justify-between">
                  <span className="flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Visuelt</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <DraftVisualSection draftId={draft.id} draftTitle={title} draftHook={hook || body.substring(0, 100)} composedText={composePlainContent()} />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Scheduler */}
          <div className="border border-border rounded-md p-3 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Planlegg publisering
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("gap-1 w-[180px] justify-start text-left font-normal", !scheduledDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {scheduledDate ? format(scheduledDate, "d. MMM yyyy", { locale: nb }) : "Velg dato"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    disabled={(date) => date < new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-[120px] h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSchedule}
                disabled={!scheduledDate || !composePlainContent().trim()}
                className="gap-1 text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
              >
                <Clock className="w-3.5 h-3.5" />
                Planlegg
              </Button>
              {scheduledDate && (
                <Button variant="ghost" size="sm" onClick={() => setScheduledDate(undefined)} className="text-xs text-muted-foreground">
                  Fjern
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={handleSaveAsTemplate} className="gap-1 mr-auto" title="Lagre som mal">
            <BookmarkPlus className="w-4 h-4" />
            Lagre som mal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmFbOpen(true)}
            disabled={publishing || !composePlainContent().trim()}
            className="gap-1 text-[#1877F2] border-[#1877F2]/30 hover:bg-[#1877F2]/10"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
            Facebook
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmIgOpen(true)}
            disabled={publishingIg || !composePlainContent().trim()}
            className="gap-1 text-[#E1306C] border-[#E1306C]/30 hover:bg-[#E1306C]/10"
          >
            {publishingIg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
            Instagram
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave} className="gap-1">
            <Save className="w-4 h-4" />
            Lagre
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmFbOpen} onOpenChange={setConfirmFbOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publiser til Facebook?</AlertDialogTitle>
            <AlertDialogDescription>
              Innlegget vil bli publisert direkte på Facebook-siden. Denne handlingen kan ikke angres fra AviSafe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublishFacebook} className="gap-1">
              <Facebook className="w-4 h-4" />
              Publiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmIgOpen} onOpenChange={setConfirmIgOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publiser til Instagram?</AlertDialogTitle>
            <AlertDialogDescription>
              Innlegget vil bli publisert direkte på Instagram Business-kontoen. Et bilde er påkrevd. Denne handlingen kan ikke angres fra AviSafe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublishInstagram} className="gap-1 bg-[#E1306C] hover:bg-[#E1306C]/90">
              <Instagram className="w-4 h-4" />
              Publiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
