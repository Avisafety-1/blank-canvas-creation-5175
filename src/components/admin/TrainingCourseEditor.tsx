import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronDown, Plus, Trash2, Upload, FileText, HelpCircle, Image as ImageIcon, Youtube } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { YouTubeClipPlayer, parseYouTubeId, parseTimeInput, formatSeconds } from "@/components/training/YouTubeClipPlayer";
import { TrainingModulePicker } from "@/components/training/TrainingModulePicker";
import { TRAINING_MODULE_KEYS, normalizeTrainingModules, type TrainingModuleKey } from "@/config/trainingModules";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TTS_VOICES: { value: string; label: string }[] = [
  { value: "coral", label: "Coral (varm, kvinnelig)" },
  { value: "sage", label: "Sage (rolig, kvinnelig)" },
  { value: "nova", label: "Nova (lys, kvinnelig)" },
  { value: "shimmer", label: "Shimmer (vennlig, kvinnelig)" },
  { value: "alloy", label: "Alloy (nøytral)" },
  { value: "ash", label: "Ash (mørk, mannlig)" },
  { value: "onyx", label: "Onyx (dyp, mannlig)" },
  { value: "echo", label: "Echo (klar, mannlig)" },
  { value: "ballad", label: "Ballad (mannlig)" },
  { value: "verse", label: "Verse (uttrykksfull)" },
  { value: "fable", label: "Fable (fortellende)" },
];
const TTS_SPEEDS: { value: string; label: string }[] = [
  { value: "0.75", label: "0.75x (langsom)" },
  { value: "0.9", label: "0.9x" },
  { value: "1", label: "1x (normal)" },
  { value: "1.1", label: "1.1x" },
  { value: "1.25", label: "1.25x (rask)" },
  { value: "1.5", label: "1.5x (veldig rask)" },
];

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface QuestionOption {
  id?: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

interface Slide {
  id?: string;
  slide_type: "content" | "question" | "video";
  question_text: string;
  content_json: any;
  image_url: string | null;
  sort_order: number;
  options: QuestionOption[];
  video_url?: string | null;
  video_start_seconds?: number | null;
  video_end_seconds?: number | null;
  video_required_complete?: boolean;
  // local-only for preview
  _localBlobUrl?: string;
}

interface Props {
  courseId: string | null;
  onClose: () => void;
}

export const TrainingCourseEditor = ({ courseId, onClose }: Props) => {
  const { companyId, user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [passingScore, setPassingScore] = useState(80);
  const [validityMonths, setValidityMonths] = useState<number | null>(null);
  const [hasPermanentValidity, setHasPermanentValidity] = useState(true);
  const [displayMode, setDisplayMode] = useState<"list" | "paginated">("paginated");
  const [fullscreen, setFullscreen] = useState(false);
  const [unlocksModules, setUnlocksModules] = useState<TrainingModuleKey[]>([]);
  const [unlocksModulesOpen, setUnlocksModulesOpen] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!courseId);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const slideImageInputRef = useRef<HTMLInputElement>(null);
  const [slideImageTargetIdx, setSlideImageTargetIdx] = useState<number | null>(null);
  const [generatingAudioIdx, setGeneratingAudioIdx] = useState<number | null>(null);

  const generateNarrationAudio = async (sIdx: number) => {
    const s = slides[sIdx];
    const cj = (s?.content_json as any) || {};
    const text: string = (cj.narration_text || "").trim();
    if (!text) {
      toast.error("Skriv inn tekst først");
      return;
    }
    if (!courseId) {
      toast.error("Lagre kurset før du genererer lyd");
      return;
    }
    setGeneratingAudioIdx(sIdx);
    try {
      const voice = cj.narration_voice || "coral";
      const speed = parseFloat(cj.narration_speed || "1") || 1;
      const { data, error } = await supabase.functions.invoke("generate-narration", {
        body: { text, course_id: courseId, slide_key: s.id || `slide-${sIdx}`, voice, speed },
      });
      if (error) throw error;
      const audioUrl = (data as any)?.audio_url;
      if (!audioUrl) throw new Error("Ingen lyd-URL returnert");
      setSlides((prev) => prev.map((x, i) => {
        if (i !== sIdx) return x;
        const cj2 = { ...(x.content_json || {}), narration_audio_url: audioUrl, narration_enabled: true, narration_voice: voice, narration_speed: String(speed) };
        return { ...x, content_json: cj2 };
      }));
      toast.success("Lyd generert med OpenAI");
    } catch (err: any) {
      console.error("generate-narration error", err);
      toast.error(err?.message || "Kunne ikke generere lyd");
    } finally {
      setGeneratingAudioIdx(null);
    }
  };

  useEffect(() => {
    if (courseId) loadCourse();
  }, [courseId]);

  const loadCourse = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const { data: course } = await supabase
        .from("training_courses")
        .select("*")
        .eq("id", courseId)
        .single();

      if (course) {
        setTitle(course.title);
        setDescription(course.description || "");
        setPassingScore(course.passing_score);
        setValidityMonths(course.validity_months);
        setHasPermanentValidity(!course.validity_months);
        setDisplayMode((course as any).display_mode === "list" ? "list" : "paginated");
        setFullscreen((course as any).fullscreen || false);
        setUnlocksModules(normalizeTrainingModules((course as any).unlocks_modules));
      }

      const { data: questionsData } = await supabase
        .from("training_questions")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");

      if (questionsData && questionsData.length > 0) {
        const qIds = questionsData.map((q: any) => q.id);
        const { data: optionsData } = await supabase
          .from("training_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("sort_order");

        const loadedSlides: Slide[] = questionsData.map((q: any) => ({
          id: q.id,
          slide_type: q.slide_type || "question",
          question_text: q.question_text,
          content_json: q.content_json || null,
          image_url: q.image_url,
          sort_order: q.sort_order,
          video_url: q.video_url || null,
          video_start_seconds: q.video_start_seconds ?? null,
          video_end_seconds: q.video_end_seconds ?? null,
          video_required_complete: q.video_required_complete ?? false,
          options: (optionsData || [])
            .filter((o: any) => o.question_id === q.id)
            .map((o: any) => ({
              id: o.id,
              option_text: o.option_text,
              is_correct: o.is_correct,
              sort_order: o.sort_order,
            })),
        }));
        setSlides(loadedSlides);
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurs");
    } finally {
      setLoading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Vennligst last opp en PDF-fil");
      return;
    }

    setUploadingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      const newSlides: Slide[] = [];
      const startOrder = slides.length;

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blobUrl = canvas.toDataURL("image/jpeg", 0.85);

        newSlides.push({
          slide_type: "content",
          question_text: `Slide ${startOrder + i}`,
          content_json: null,
          image_url: null,
          sort_order: startOrder + (i - 1),
          options: [],
          _localBlobUrl: blobUrl,
        });
      }

      setSlides((prev) => [...prev, ...newSlides]);
      toast.success(`${pageCount} sider lagt til fra PDF`);
    } catch (err) {
      console.error("Error parsing PDF:", err);
      toast.error("Kunne ikke lese PDF-filen");
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const newSlides: Slide[] = [];
      const startOrder = slides.length;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        newSlides.push({
          slide_type: "content",
          question_text: `Slide ${startOrder + i + 1}`,
          content_json: { heading: "", narration_text: "", narration_enabled: false },
          image_url: null,
          sort_order: startOrder + i,
          options: [],
          _localBlobUrl: dataUrl,
        });
      }
      if (newSlides.length === 0) {
        toast.error("Ingen gyldige bildefiler");
        return;
      }
      setSlides((prev) => [...prev, ...newSlides]);
      toast.success(`${newSlides.length} bilde${newSlides.length > 1 ? "r" : ""} lagt til`);
    } catch (err) {
      console.error("Image upload error", err);
      toast.error("Kunne ikke laste opp bilde");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSlideImageReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = slideImageTargetIdx;
    if (!file || idx == null) {
      if (slideImageInputRef.current) slideImageInputRef.current.value = "";
      return;
    }
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setSlides((prev) => prev.map((s, i) => i === idx ? { ...s, _localBlobUrl: dataUrl, image_url: null } : s));
    } catch (err) {
      toast.error("Kunne ikke laste bilde");
    } finally {
      setSlideImageTargetIdx(null);
      if (slideImageInputRef.current) slideImageInputRef.current.value = "";
    }
  };

  const addContentSlide = (afterIdx?: number) => {
    const newSlide: Slide = {
      slide_type: "content",
      question_text: "",
      content_json: { heading: "", narration_text: "", narration_enabled: false },
      image_url: null,
      sort_order: (afterIdx ?? slides.length - 1) + 1,
      options: [],
    };
    const newSlides = [...slides];
    const insertAt = afterIdx != null ? afterIdx + 1 : slides.length;
    newSlides.splice(insertAt, 0, newSlide);
    setSlides(newSlides);
  };

  const updateContentField = (idx: number, field: string, value: any) => {
    setSlides((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const cj = { ...(s.content_json || {}) };
      cj[field] = value;
      return { ...s, content_json: cj };
    }));
  };

  const addQuestionAfterSlide = (afterIdx: number) => {
    const newSlide: Slide = {
      slide_type: "question",
      question_text: "",
      content_json: null,
      image_url: null,
      sort_order: afterIdx + 1,
      options: [
        { option_text: "", is_correct: true, sort_order: 0 },
        { option_text: "", is_correct: false, sort_order: 1 },
      ],
    };
    const newSlides = [...slides];
    newSlides.splice(afterIdx + 1, 0, newSlide);
    setSlides(newSlides);
  };

  const addVideoSlide = (afterIdx?: number) => {
    const newSlide: Slide = {
      slide_type: "video",
      question_text: "YouTube-video",
      content_json: null,
      image_url: null,
      sort_order: (afterIdx ?? slides.length - 1) + 1,
      options: [],
      video_url: "",
      video_start_seconds: null,
      video_end_seconds: null,
      video_required_complete: false,
    };
    const newSlides = [...slides];
    const insertAt = afterIdx != null ? afterIdx + 1 : slides.length;
    newSlides.splice(insertAt, 0, newSlide);
    setSlides(newSlides);
  };

  const removeSlide = (idx: number) => {
    setSlides(slides.filter((_, i) => i !== idx));
  };

  const updateSlide = (idx: number, field: keyof Slide, value: any) => {
    setSlides(slides.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addOption = (sIdx: number) => {
    const s = slides[sIdx];
    updateSlide(sIdx, "options", [
      ...s.options,
      { option_text: "", is_correct: false, sort_order: s.options.length },
    ]);
  };

  const removeOption = (sIdx: number, oIdx: number) => {
    const s = slides[sIdx];
    updateSlide(sIdx, "options", s.options.filter((_, i) => i !== oIdx));
  };

  const updateOption = (sIdx: number, oIdx: number, field: keyof QuestionOption, value: any) => {
    const s = slides[sIdx];
    const newOpts = s.options.map((o, i) => {
      if (i === oIdx) return { ...o, [field]: value };
      return o;
    });
    updateSlide(sIdx, "options", newOpts);
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    const newSlides = [...slides];
    const [moved] = newSlides.splice(from, 1);
    newSlides.splice(to, 0, moved);
    setSlides(newSlides);
  };

  const uploadSlideImage = async (dataUrl: string, courseId: string, slideIndex: number): Promise<string> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${companyId}/${courseId}/slide-${slideIndex}.jpg`;

    const { error } = await supabase.storage
      .from("training-slides")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("training-slides")
      .getPublicUrl(path);

    // Since the bucket is private, we need signed URLs
    const { data: signedData } = await supabase.storage
      .from("training-slides")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 year signed URL

    return signedData?.signedUrl || urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!companyId || !title.trim()) {
      toast.error("Tittel er påkrevd");
      return;
    }

    const questionSlides = slides.filter(s => s.slide_type === "question");
    for (const q of questionSlides) {
      if (!q.question_text.trim()) {
        toast.error("Spørsmålsside mangler tekst");
        return;
      }
      if (q.options.length < 2) {
        toast.error("Spørsmålet må ha minst 2 alternativer");
        return;
      }
      if (!q.options.some(o => o.is_correct)) {
        toast.error("Spørsmålet må ha minst ett riktig svar");
        return;
      }
      for (const o of q.options) {
        if (!o.option_text.trim()) {
          toast.error("Alle alternativer må ha tekst");
          return;
        }
      }
    }

    const videoSlides = slides.filter(s => s.slide_type === "video");
    for (const v of videoSlides) {
      if (!v.video_url || !parseYouTubeId(v.video_url)) {
        toast.error("Ugyldig YouTube-URL på video-slide");
        return;
      }
      if (
        v.video_start_seconds != null &&
        v.video_end_seconds != null &&
        v.video_end_seconds <= v.video_start_seconds
      ) {
        toast.error("Sluttidspunkt må være etter starttidspunkt");
        return;
      }
    }

    setSaving(true);
    try {
      let cId = courseId;

      const coursePayload = {
        title: title.trim(),
        description: description.trim() || null,
        passing_score: passingScore,
        validity_months: hasPermanentValidity ? null : validityMonths,
        display_mode: displayMode,
        fullscreen,
        unlocks_modules: unlocksModules,
        updated_at: new Date().toISOString(),
      };

      if (cId) {
        const { error } = await supabase.from("training_courses").update(coursePayload as any).eq("id", cId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("training_courses")
          .insert({ ...coursePayload, company_id: companyId, created_by: user?.id, status: "draft" } as any)
          .select("id")
          .single();
        if (error) throw error;
        cId = data.id;
      }

      // Upload slide images that have local blob URLs
      const updatedSlides = [...slides];
      for (let i = 0; i < updatedSlides.length; i++) {
        const s = updatedSlides[i];
        if (s._localBlobUrl && s.slide_type === "content") {
          const imageUrl = await uploadSlideImage(s._localBlobUrl, cId!, i);
          updatedSlides[i] = { ...s, image_url: imageUrl, _localBlobUrl: undefined };
        }
      }

      // Delete existing questions (cascade deletes options)
      if (courseId) {
        await supabase.from("training_questions").delete().eq("course_id", courseId);
      }

      // Insert slides
      for (let i = 0; i < updatedSlides.length; i++) {
        const s = updatedSlides[i];
        const { data: qData, error: qErr } = await supabase
          .from("training_questions")
          .insert({
            course_id: cId!,
            question_text: s.question_text.trim() || (s.slide_type === "content" ? `Slide ${i + 1}` : s.slide_type === "video" ? `Video ${i + 1}` : ""),
            image_url: s.image_url,
            sort_order: i,
            slide_type: s.slide_type,
            content_json: s.content_json ?? null,
            video_url: s.slide_type === "video" ? (s.video_url || null) : null,
            video_start_seconds: s.slide_type === "video" ? (s.video_start_seconds ?? null) : null,
            video_end_seconds: s.slide_type === "video" ? (s.video_end_seconds ?? null) : null,
            video_required_complete: s.slide_type === "video" ? !!s.video_required_complete : false,
          } as any)
          .select("id")
          .single();
        if (qErr) throw qErr;

        if (s.slide_type === "question" && s.options.length > 0) {
          const optionsToInsert = s.options.map((o, j) => ({
            question_id: qData.id,
            option_text: o.option_text.trim(),
            is_correct: o.is_correct,
            sort_order: j,
          }));
          const { error: oErr } = await supabase.from("training_question_options").insert(optionsToInsert);
          if (oErr) throw oErr;
        }
      }

      toast.success("Kurs lagret");
      onClose();
    } catch (err) {
      console.error("Error saving course:", err);
      toast.error("Kunne ikke lagre kurs");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Laster kurs...</p>;

  const contentSlideCount = slides.filter(s => s.slide_type === "content").length;
  const questionSlideCount = slides.filter(s => s.slide_type === "question").length;
  const allModulesSelected = TRAINING_MODULE_KEYS.every((moduleKey) => unlocksModules.includes(moduleKey));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-bold flex-1">{courseId ? "Rediger kurs" : "Nytt kurs"}</h2>
      </div>

      {/* Course details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kursdetaljer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tittel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Navn på kurset" />
          </div>
          <div>
            <Label>Beskrivelse</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Valgfri beskrivelse" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bestått-grense (%)</Label>
              <Input type="number" min={1} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Switch checked={hasPermanentValidity} onCheckedChange={(v) => { setHasPermanentValidity(v); if (v) setValidityMonths(null); else setValidityMonths(12); }} />
                <Label className="text-sm">Permanent gyldighet</Label>
              </div>
              {!hasPermanentValidity && (
                <div>
                  <Label>Gyldighet (måneder)</Label>
                  <Input type="number" min={1} value={validityMonths || ""} onChange={(e) => setValidityMonths(Number(e.target.value) || null)} />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Switch checked={fullscreen} onCheckedChange={setFullscreen} id="fullscreen-toggle" />
            <Label htmlFor="fullscreen-toggle">Fullskjerm-modus ved gjennomføring</Label>
          </div>
          <Collapsible open={unlocksModulesOpen} onOpenChange={setUnlocksModulesOpen} className="pt-3 border-t">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left hover:bg-muted/50 transition-colors">
              <div>
                <Label className="cursor-pointer">Låser opp moduler ved bestått kurs</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {unlocksModules.length > 0 ? `${unlocksModules.length} moduler valgt` : "Ingen moduler valgt"}
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${unlocksModulesOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Disse modulene blir tilgjengelige for brukere under opplæring når kurset er bestått. Velges alle moduler, slås «Under opplæring» av ved bestått kurs.
              </p>
              <Button
                type="button"
                variant={allModulesSelected ? "outline" : "secondary"}
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setUnlocksModules(allModulesSelected ? [] : [...TRAINING_MODULE_KEYS])}
              >
                {allModulesSelected ? "Fjern alle moduler" : "Lås opp alle moduler"}
              </Button>
              <TrainingModulePicker selected={unlocksModules} onChange={setUnlocksModules} />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Upload presentation / images */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last opp presentasjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Last opp en PDF (eksportert fra PowerPoint/Keynote) eller bilder. Sidene legges til etter de eksisterende.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <input
              ref={slideImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleSlideImageReplace}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadingPdf ? "Leser PDF..." : "Legg til sider fra PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Legg til bilde(r)
            </Button>
            <Button
              variant="outline"
              onClick={() => addContentSlide()}
            >
              <FileText className="h-4 w-4 mr-2" />
              Legg til tekst-slide
            </Button>
            {contentSlideCount > 0 && (
              <Badge variant="secondary">
                <ImageIcon className="h-3 w-3 mr-1" />
                {contentSlideCount} slides
              </Badge>
            )}
          </div>
          {uploadingPdf && (
            <p className="text-xs text-muted-foreground">Konverterer sider til bilder...</p>
          )}
          <div className="pt-2 border-t space-y-2">
            <Button variant="outline" size="sm" onClick={() => addVideoSlide()}>
              <Youtube className="h-4 w-4 mr-2" />
              Legg til YouTube-video
            </Button>
            <p className="text-xs text-muted-foreground">
              Annonser fjernes automatisk når videoen spilles av i kurset (via klipping og YouTubes innebygde spiller uten reklame mellom segmenter).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Slides preview + question management */}
      {slides.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Sider ({slides.length}) · {questionSlideCount} spørsmål
            </h3>
          </div>

          {slides.map((s, sIdx) => (
            <Card key={sIdx}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-muted-foreground w-6">{sIdx + 1}.</span>
                  <Badge variant={s.slide_type === "content" ? "secondary" : s.slide_type === "video" ? "default" : "outline"} className="text-xs">
                    {s.slide_type === "content" ? "Slide" : s.slide_type === "video" ? "Video" : "Spørsmål"}
                  </Badge>
                  <div className="flex-1" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={sIdx === 0} onClick={() => moveSlide(sIdx, sIdx - 1)} className="h-7 w-7 p-0">↑</Button>
                    <Button size="sm" variant="ghost" disabled={sIdx === slides.length - 1} onClick={() => moveSlide(sIdx, sIdx + 1)} className="h-7 w-7 p-0">↓</Button>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSlide(sIdx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content slide: image + heading + text + narration toggle */}
                {s.slide_type === "content" && (() => {
                  const cj = (s.content_json as any) || {};
                  const narrationEnabled = cj.narration_enabled !== false && !!(cj.narration_text || cj.narration_audio_url);
                  const narrationToggle = cj.narration_enabled ?? !!(cj.narration_text || cj.narration_audio_url);
                  return (
                    <div className="space-y-3">
                      {(s._localBlobUrl || s.image_url) ? (
                        <img
                          src={s._localBlobUrl || s.image_url!}
                          alt={`Slide ${sIdx + 1}`}
                          className="w-full max-h-64 object-contain rounded border bg-muted/20"
                        />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSlideImageTargetIdx(sIdx); slideImageInputRef.current?.click(); }}
                          className="text-xs"
                        >
                          <ImageIcon className="h-3.5 w-3.5 mr-1" />
                          {(s._localBlobUrl || s.image_url) ? "Bytt bilde" : "Legg til bilde"}
                        </Button>
                        {(s._localBlobUrl || s.image_url) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSlides((prev) => prev.map((x, i) => i === sIdx ? { ...x, _localBlobUrl: undefined, image_url: null } : x))}
                            className="text-xs text-destructive"
                          >
                            Fjern bilde
                          </Button>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm">Overskrift</Label>
                        <Input
                          value={cj.heading || ""}
                          onChange={(e) => updateContentField(sIdx, "heading", e.target.value)}
                          placeholder="Valgfri overskrift"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Tekst</Label>
                        <Textarea
                          value={cj.narration_text || ""}
                          onChange={(e) => updateContentField(sIdx, "narration_text", e.target.value)}
                          placeholder="Tekst som vises på sliden (kan også leses opp)"
                          rows={3}
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-1 border-t">
                        <Switch
                          id={`narration-${sIdx}`}
                          checked={narrationToggle}
                          onCheckedChange={(v) => updateContentField(sIdx, "narration_enabled", v)}
                        />
                        <Label htmlFor={`narration-${sIdx}`} className="text-sm cursor-pointer">
                          Les opp tekst (text-to-speech)
                        </Label>
                      </div>
                      {narrationToggle && (
                        <div className="space-y-2 pl-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Stemme</Label>
                              <Select
                                value={cj.narration_voice || "coral"}
                                onValueChange={(v) => updateContentField(sIdx, "narration_voice", v)}
                              >
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {TTS_VOICES.map((v) => (
                                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Hastighet</Label>
                              <Select
                                value={cj.narration_speed || "1"}
                                onValueChange={(v) => updateContentField(sIdx, "narration_speed", v)}
                              >
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {TTS_SPEEDS.map((v) => (
                                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {cj.narration_audio_url ? (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">OpenAI-lyd lagret:</p>
                              <audio src={cj.narration_audio_url} controls className="w-full max-w-md" />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  disabled={generatingAudioIdx === sIdx || !(cj.narration_text || "").trim()}
                                  onClick={() => generateNarrationAudio(sIdx)}
                                >
                                  {generatingAudioIdx === sIdx ? "Genererer..." : "Generer på nytt"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs text-destructive"
                                  onClick={() => updateContentField(sIdx, "narration_audio_url", null)}
                                >
                                  Fjern lyd
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                disabled={generatingAudioIdx === sIdx || !(cj.narration_text || "").trim()}
                                onClick={() => generateNarrationAudio(sIdx)}
                              >
                                {generatingAudioIdx === sIdx ? "Genererer lyd..." : "🎙 Generer lyd (OpenAI)"}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                Uten generert lyd brukes nettleserens innebygde stemme.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addQuestionAfterSlide(sIdx)}
                          className="text-xs"
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-1" />
                          Legg til spørsmål etter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addVideoSlide(sIdx)}
                          className="text-xs"
                        >
                          <Youtube className="h-3.5 w-3.5 mr-1" />
                          Legg til video etter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addContentSlide(sIdx)}
                          className="text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Legg til slide etter
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Video slide */}
                {s.slide_type === "video" && (() => {
                  const vid = parseYouTubeId(s.video_url || "");
                  const startInvalid =
                    s.video_start_seconds != null &&
                    s.video_end_seconds != null &&
                    s.video_end_seconds <= s.video_start_seconds;
                  return (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">YouTube-URL</Label>
                        <Input
                          value={s.video_url || ""}
                          onChange={(e) => updateSlide(sIdx, "video_url", e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                        />
                        {!vid && (s.video_url?.length ?? 0) > 0 && (
                          <p className="text-xs text-destructive mt-1">Ugyldig YouTube-URL</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Start (MM:SS eller sek)</Label>
                          <Input
                            defaultValue={formatSeconds(s.video_start_seconds ?? undefined)}
                            onBlur={(e) => {
                              const parsed = parseTimeInput(e.target.value);
                              updateSlide(sIdx, "video_start_seconds", parsed);
                              if (parsed != null) e.target.value = formatSeconds(parsed);
                            }}
                            placeholder="0:00"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Slutt (MM:SS eller sek)</Label>
                          <Input
                            defaultValue={formatSeconds(s.video_end_seconds ?? undefined)}
                            onBlur={(e) => {
                              const parsed = parseTimeInput(e.target.value);
                              updateSlide(sIdx, "video_end_seconds", parsed);
                              if (parsed != null) e.target.value = formatSeconds(parsed);
                            }}
                            placeholder="(til slutt)"
                          />
                        </div>
                      </div>
                      {startInvalid && (
                        <p className="text-xs text-destructive">Sluttidspunkt må være etter starttidspunkt</p>
                      )}
                      {vid && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Forhåndsvisning av klipp</Label>
                          <YouTubeClipPlayer
                            videoId={vid}
                            start={s.video_start_seconds ?? null}
                            end={s.video_end_seconds ?? null}
                            autoplay={false}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <Switch
                          id={`req-complete-${sIdx}`}
                          checked={!!s.video_required_complete}
                          onCheckedChange={(v) => updateSlide(sIdx, "video_required_complete", v)}
                        />
                        <Label htmlFor={`req-complete-${sIdx}`} className="text-sm cursor-pointer">
                          Krev at brukeren ser hele videoen før «Neste»
                        </Label>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addQuestionAfterSlide(sIdx)}
                        className="text-xs"
                      >
                        <HelpCircle className="h-3.5 w-3.5 mr-1" />
                        Legg til spørsmål etter denne videoen
                      </Button>
                    </div>
                  );
                })()}

                {/* Question slide */}
                {s.slide_type === "question" && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm">Spørsmål</Label>
                      <Input
                        value={s.question_text}
                        onChange={(e) => updateSlide(sIdx, "question_text", e.target.value)}
                        placeholder="Skriv spørsmålet her..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Svaralternativer (kryss av alle riktige svar)
                      </Label>
                      {s.options.map((o, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={o.is_correct}
                            onChange={(e) => updateOption(sIdx, oIdx, "is_correct", e.target.checked)}
                            className="accent-primary h-4 w-4"
                            title="Marker som riktig svar"
                          />
                          <Input
                            value={o.option_text}
                            onChange={(e) => updateOption(sIdx, oIdx, "option_text", e.target.value)}
                            placeholder={`Alternativ ${oIdx + 1}`}
                            className="flex-1"
                          />
                          {s.options.length > 2 && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeOption(sIdx, oIdx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(sIdx)} className="text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Legg til alternativ
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center gap-3 justify-end sticky bottom-4 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
        <Button variant="outline" onClick={onClose}>
          Avbryt
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Lagrer..." : "Lagre kurs"}
        </Button>
      </div>
    </div>
  );
};
