import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Sparkles, Upload, FileText, Loader2, CheckCircle2, AlertCircle, BookOpen, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chunkManualText } from "@/lib/manualChunker";
import { TopicSuggestionsStep, SuggestedTopic } from "./TopicSuggestionsStep";

interface Folder {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  initialFolderId?: string | null;
  onCourseCreated: (courseId: string) => void;
}

type Step = "select" | "upload" | "topics" | "config" | "generate" | "done";

interface ExistingManual {
  id: string;
  title: string;
  page_count: number | null;
  file_size: number | null;
  created_at: string;
  chunk_count: number;
}

export const AICourseGeneratorDialog = ({
  open,
  onOpenChange,
  folders,
  initialFolderId,
  onCourseCreated,
}: Props) => {
  const { companyId, user } = useAuth();
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [manualId, setManualId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);

  // Existing manuals
  const [existingManuals, setExistingManuals] = useState<ExistingManual[]>([]);
  const [loadingManuals, setLoadingManuals] = useState(false);

  // Topics
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topics, setTopics] = useState<SuggestedTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<SuggestedTopic | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Config
  const [length, setLength] = useState<5 | 10 | 15>(10);
  const [includeNarration, setIncludeNarration] = useState(true);
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [voice, setVoice] = useState<string>("coral");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId || null);

  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("select");
      setFile(null);
      setTitle("");
      setManualId(null);
      setChunkCount(0);
      setUploadProgress(0);
      setUploadStage("");
      setErrorMsg(null);
      setTopics([]);
      setSelectedTopic(null);
      setTopicsError(null);
      setFolderId(initialFolderId || null);
      loadExistingManuals();
    }
  }, [open, initialFolderId, companyId]);

  const loadExistingManuals = async () => {
    if (!companyId) return;
    setLoadingManuals(true);
    try {
      const { data: manuals, error } = await supabase
        .from("manuals")
        .select("id, title, page_count, file_size, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (manuals || []).map((m) => m.id);
      let counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: chunks } = await supabase
          .from("manual_chunks")
          .select("manual_id")
          .in("manual_id", ids);
        for (const c of chunks || []) {
          counts[c.manual_id] = (counts[c.manual_id] || 0) + 1;
        }
      }
      setExistingManuals(
        (manuals || []).map((m) => ({ ...m, chunk_count: counts[m.id] || 0 }))
      );
    } catch (e) {
      console.error("loadExistingManuals", e);
    } finally {
      setLoadingManuals(false);
    }
  };

  const useExistingManual = (m: ExistingManual) => {
    if (m.chunk_count === 0) {
      toast.error("Denne manualen mangler AI-indeks. Last opp på nytt.");
      return;
    }
    setManualId(m.id);
    setTitle(m.title);
    setChunkCount(m.chunk_count);
    setStep("topics");
    fetchTopics(m.id);
  };

  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isDocx = (f: File) =>
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(f.name);

  const handleFileSelect = (selected: File | undefined) => {
    if (!selected) return;
    if (!isPdf(selected) && !isDocx(selected)) {
      toast.error("Kun PDF- eller Word-filer (.docx) er støttet");
      return;
    }
    if (/\.doc$/i.test(selected.name) && !isDocx(selected)) {
      toast.error("Gamle .doc-filer støttes ikke. Lagre som .docx og prøv igjen.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      toast.error("Filen er for stor (maks 50 MB)");
      return;
    }
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.(pdf|docx)$/i, ""));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files?.[0]);
  }, []);

  const fetchTopics = async (mid: string) => {
    setTopicsLoading(true);
    setTopicsError(null);
    setTopics([]);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-course-topics", {
        body: { manual_id: mid },
      });
      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) throw new Error("AI er overbelastet. Prøv igjen om litt.");
        if (ctx?.status === 402) throw new Error("AI-kreditter brukt opp.");
        throw error;
      }
      setTopics(data?.topics || []);
      if (!data?.topics?.length) {
        setTopicsError("AI klarte ikke å foreslå temaer. Prøv en annen manual.");
      }
    } catch (e: any) {
      console.error(e);
      setTopicsError(e?.message || "Kunne ikke hente forslag");
    } finally {
      setTopicsLoading(false);
    }
  };

  const extractAndUpload = async () => {
    if (!file || !companyId || !user) return;
    setErrorMsg(null);
    setUploadProgress(5);
    setUploadStage(isDocx(file) ? "Leser Word-dokument…" : "Leser PDF…");

    try {
      let fullText = "";
      let pageCount = 0;
      const arrayBuf = await file.arrayBuffer();

      if (isDocx(file)) {
        const mammoth: any = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuf });
        fullText = result.value || "";
        pageCount = Math.max(1, Math.ceil(fullText.length / 3000));
        setUploadProgress(40);
      } else {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
        pageCount = pdf.numPages;
        for (let p = 1; p <= pageCount; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const pageText = content.items.map((it: any) => it.str).join(" ");
          fullText += "\n\n" + pageText;
          setUploadProgress(5 + Math.floor((p / pageCount) * 35));
        }
      }

      setUploadStage("Splitter i seksjoner…");
      const chunks = chunkManualText(fullText);
      if (chunks.length === 0) {
        throw new Error(
          isDocx(file)
            ? "Fant ingen tekst i Word-dokumentet."
            : "Fant ingen tekst i PDF-en. Er den scannet?"
        );
      }
      setUploadProgress(45);

      setUploadStage("Lagrer manual…");
      const manualUuid = crypto.randomUUID();
      const ext = isDocx(file) ? "docx" : "pdf";
      const path = `${companyId}/${manualUuid}.${ext}`;
      const contentType = isDocx(file)
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";

      const { error: uploadErr } = await supabase.storage
        .from("manuals")
        .upload(path, file, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;
      setUploadProgress(60);

      const { error: insertErr } = await supabase.from("manuals").insert({
        id: manualUuid,
        company_id: companyId,
        title: title.trim() || file.name,
        file_url: path,
        file_size: file.size,
        page_count: pageCount,
        uploaded_by: user.id,
      } as any);
      if (insertErr) throw insertErr;

      setManualId(manualUuid);
      setUploadStage("Genererer embeddings (AI-indeks)…");
      setUploadProgress(70);

      const { data: procData, error: procErr } = await supabase.functions.invoke("process-manual", {
        body: {
          manual_id: manualUuid,
          chunks: chunks.map((c) => ({ index: c.index, text: c.text, heading: c.heading || null })),
        },
      });
      if (procErr) throw procErr;
      setChunkCount(procData?.chunk_count || chunks.length);
      setUploadProgress(100);
      setUploadStage("Ferdig");
      setStep("topics");
      fetchTopics(manualUuid);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Opplasting feilet";
      setErrorMsg(msg);
      toast.error(msg);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const handleGenerate = async () => {
    if (!manualId || !selectedTopic) return;
    setGenerating(true);
    setErrorMsg(null);
    setStep("generate");
    setGenerationStage("Analyserer manual og lager intro-tekst…");

    try {
      // Progressive UI hints (since we can't get real progress from the function)
      setTimeout(() => {
        if (includeVisuals) setGenerationStage("Genererer bilder med AI…");
      }, 6000);
      setTimeout(() => {
        if (includeNarration) setGenerationStage("Lager talesynteser…");
      }, 14000);
      setTimeout(() => setGenerationStage("Lager spørsmål…"), 22000);

      const { data, error } = await supabase.functions.invoke("generate-course", {
        body: {
          manual_id: manualId,
          length,
          folder_id: folderId,
          topic_title: selectedTopic.title,
          topic_description: selectedTopic.description,
          chapter_reference: selectedTopic.chapter_reference,
          focus_query: selectedTopic.focus_query,
          include_narration: includeNarration,
          include_visuals: includeVisuals,
          voice: includeNarration ? voice : undefined,
        },
      });

      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 429) throw new Error("AI er overbelastet. Prøv igjen om litt.");
        if (ctx?.status === 402) throw new Error("AI-kreditter brukt opp. Legg til kreditter i Workspace.");
        throw error;
      }

      if (!data?.course_id) throw new Error("AI returnerte ikke et kurs");

      setGenerationStage("Lagrer kurs…");
      const generated = data.questions_generated ?? 0;
      const requested = data.questions_requested ?? length;
      const intros = data.intro_slides_generated ?? 0;
      toast.success(
        `Kurs opprettet (${intros} intro-slides + ${generated}/${requested} spørsmål)`
      );
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(warnings.slice(0, 3).join(" • "), { duration: 8000 });
      }
      setStep("done");
      onCourseCreated(data.course_id);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Generering feilet";
      setErrorMsg(msg);
      toast.error(msg);
      setStep("config");
    } finally {
      setGenerating(false);
    }
  };

  const renderSelect = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Velg en tidligere opplastet manual for å spare tid og AI-kostnader, eller last opp en ny.
      </p>

      {loadingManuals ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : existingManuals.length > 0 ? (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {existingManuals.map((m) => {
            const indexed = m.chunk_count > 0;
            return (
              <Card
                key={m.id}
                onClick={() => indexed && useExistingManual(m)}
                className={`p-3 transition border-2 ${
                  indexed
                    ? "cursor-pointer border-border hover:border-primary hover:bg-muted/30"
                    : "border-border opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {indexed ? `${m.chunk_count} seksjoner` : "Ikke indeksert"}
                      {m.page_count ? ` · ${m.page_count} sider` : ""}
                      {" · lastet opp "}
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: nb })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
          Ingen tidligere manualer funnet.
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
        <Button onClick={() => setStep("upload")}>
          <Plus className="h-4 w-4 mr-2" /> Last opp ny manual
        </Button>
      </div>
    </div>
  );

  const renderUpload = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="manual-title">Tittel</Label>
        <Input
          id="manual-title"
          placeholder="F.eks. Operasjonsmanual 2025"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1"
        />
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-10 w-10 text-primary" />
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-10 w-10" />
            <p className="font-medium">Dra og slipp PDF eller Word her</p>
            <p className="text-xs">eller klikk for å velge (.pdf eller .docx, maks 50 MB)</p>
          </div>
        )}
      </div>

      {uploadStage && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{uploadStage}</span>
            <span className="text-muted-foreground">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => setStep("select")} disabled={uploadProgress > 0 && uploadProgress < 100}>
          Tilbake
        </Button>
        <Button onClick={extractAndUpload} disabled={!file || !title.trim() || (uploadProgress > 0 && uploadProgress < 100)}>
          {uploadProgress > 0 && uploadProgress < 100 ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Behandler…</>
          ) : (
            <>Last opp og fortsett</>
          )}
        </Button>
      </div>
    </div>
  );

  const renderTopics = () => (
    <div className="space-y-4">
      <Card className="p-3 bg-muted/30 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-sm">
          <strong>{title}</strong> — {chunkCount} seksjoner indeksert
        </span>
      </Card>

      <TopicSuggestionsStep
        loading={topicsLoading}
        topics={topics}
        selected={selectedTopic}
        onSelect={setSelectedTopic}
        errorMsg={topicsError}
        onRetry={manualId ? () => fetchTopics(manualId) : undefined}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
        <Button onClick={() => setStep("config")} disabled={!selectedTopic}>
          Fortsett
        </Button>
      </div>
    </div>
  );

  const renderConfig = () => (
    <div className="space-y-5">
      {selectedTopic && (
        <Card className="p-3 bg-primary/5 border-primary/30">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Valgt tema</p>
          <p className="font-semibold text-sm">{selectedTopic.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{selectedTopic.chapter_reference} · {selectedTopic.description}</p>
        </Card>
      )}

      <div>
        <Label>Antall spørsmål</Label>
        <RadioGroup
          value={String(length)}
          onValueChange={(v) => setLength(Number(v) as 5 | 10 | 15)}
          className="flex gap-4 mt-2"
        >
          {[5, 10, 15].map((n) => (
            <label key={n} className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value={String(n)} id={`len-${n}`} />
              <span>{n}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="narration-toggle" className="font-medium">Inkluder talende intro</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI genererer talesyntese (TTS) som leser opp introduksjonen før spørsmålene.
            </p>
          </div>
          <Switch id="narration-toggle" checked={includeNarration} onCheckedChange={setIncludeNarration} />
        </div>
        {includeNarration && (
          <div className="pt-2 border-t">
            <Label htmlFor="voice-select" className="text-sm">Stemme</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger id="voice-select" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coral">Coral – varm kvinnestemme (anbefalt)</SelectItem>
                <SelectItem value="sage">Sage – rolig kvinnestemme</SelectItem>
                <SelectItem value="nova">Nova – lys, energisk kvinnestemme</SelectItem>
                <SelectItem value="onyx">Onyx – dyp mannstemme</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Bruker OpenAI gpt-4o-mini-tts med norsk lærer-tone.
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label htmlFor="visuals-toggle" className="font-medium">Inkluder AI-bilder</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hver intro-slide får et AI-generert illustrasjonsbilde.
            </p>
          </div>
          <Switch id="visuals-toggle" checked={includeVisuals} onCheckedChange={setIncludeVisuals} />
        </div>
      </div>

      {folders.length > 0 && (
        <div>
          <Label>Mappe (valgfritt)</Label>
          <Select value={folderId || "_none"} onValueChange={(v) => setFolderId(v === "_none" ? null : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Ingen mappe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Ingen mappe</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep("topics")}>Tilbake</Button>
        <Button onClick={handleGenerate} disabled={generating}>
          <Sparkles className="h-4 w-4 mr-2" />
          Generer kurs
        </Button>
      </div>
    </div>
  );

  const renderGenerate = () => (
    <div className="py-8 flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium">{generationStage}</p>
      <p className="text-sm text-muted-foreground">
        Dette kan ta 30-90 sekunder{includeVisuals || includeNarration ? " (bilder og lyd tar lengst)" : ""}.
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Kursgenerator
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Velg en eksisterende manual eller last opp en ny"}
            {step === "upload" && "Last opp en operasjonsmanual (PDF eller Word)"}
            {step === "topics" && "Velg tema for kurset"}
            {step === "config" && "Konfigurer kurset"}
            {step === "generate" && "Genererer kurs…"}
          </DialogDescription>
        </DialogHeader>
        {step === "select" && renderSelect()}
        {step === "upload" && renderUpload()}
        {step === "topics" && renderTopics()}
        {step === "config" && renderConfig()}
        {step === "generate" && renderGenerate()}
      </DialogContent>
    </Dialog>
  );
};
