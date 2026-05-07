import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, Save, Maximize, Minimize } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { YouTubeClipPlayer, parseYouTubeId } from "@/components/training/YouTubeClipPlayer";

interface Props {
  assignmentId?: string;
  courseId?: string;
  previewMode?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

interface SlideData {
  id: string;
  slide_type: string;
  question_text: string;
  content_json: any;
  image_url: string | null;
  sort_order: number;
  video_url?: string | null;
  video_start_seconds?: number | null;
  video_end_seconds?: number | null;
  video_required_complete?: boolean;
  options: { id: string; option_text: string; is_correct: boolean; sort_order: number }[];
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  validity_months: number | null;
  display_mode: string;
  fullscreen: boolean;
  unlocks_modules?: string[] | null;
}

export const TakeCourseDialog = ({ assignmentId, courseId: directCourseId, previewMode = false, open, onOpenChange, onCompleted }: Props) => {
  const { user, refetchUserInfo } = useAuth();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [completedVideoIds, setCompletedVideoIds] = useState<Set<string>>(new Set());

  const questionSlides = slides.filter(s => s.slide_type === "question");

  useEffect(() => {
    if (open) loadCourse();
    else {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }, [open, assignmentId, directCourseId]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const loadCourse = async () => {
    setLoading(true);
    setSubmitted(false);
    setScore(null);
    setCurrentPage(0);
    setAnswers({});
    try {
      let targetCourseId: string;
      let savedCurrentSlide = 0;

      if (previewMode && directCourseId) {
        targetCourseId = directCourseId;
      } else if (assignmentId) {
        const { data: assignment } = await supabase
          .from("training_assignments")
          .select("course_id, saved_answers")
          .eq("id", assignmentId)
          .single();

        if (!assignment) throw new Error("Assignment not found");
        targetCourseId = assignment.course_id;
        const savedAnswers = assignment.saved_answers as Record<string, any> | null;
        if (savedAnswers) {
          const { _currentSlide, ...rest } = savedAnswers as any;
          // Normaliser til string[] (støtt gammelt format der verdien var string)
          const normalized: Record<string, string[]> = {};
          Object.entries(rest).forEach(([k, v]) => {
            if (Array.isArray(v)) normalized[k] = v as string[];
            else if (typeof v === "string" && v) normalized[k] = [v];
          });
          setAnswers(normalized);
          if (typeof _currentSlide === "number") savedCurrentSlide = _currentSlide;
        }
      } else {
        throw new Error("No assignment or course specified");
      }

      const { data: courseData } = await supabase
        .from("training_courses")
        .select("*")
        .eq("id", targetCourseId)
        .single();

      setCourse({ ...courseData, fullscreen: (courseData as any)?.fullscreen || false } as CourseData);

      if ((courseData as any)?.fullscreen && !previewMode) {
        setIsFullscreen(true);
      }

      const { data: questionsData } = await supabase
        .from("training_questions")
        .select("*")
        .eq("course_id", targetCourseId)
        .order("sort_order");

      if (questionsData && questionsData.length > 0) {
        const qIds = questionsData.map((q: any) => q.id);
        const { data: optionsData } = await supabase
          .from("training_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("sort_order");

        const loadedSlides: SlideData[] = questionsData.map((q: any) => ({
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
          options: (optionsData || []).filter((o: any) => o.question_id === q.id),
        }));
        setSlides(loadedSlides);

        if (savedCurrentSlide > 0 && savedCurrentSlide < loadedSlides.length) {
          setCurrentPage(savedCurrentSlide);
        }
      }
    } catch (err) {
      console.error("Error loading course:", err);
      toast.error("Kunne ikke laste kurset");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgress = async () => {
    setSavingProgress(true);
    try {
      const saveData = { ...answers, _currentSlide: currentPage };
      const { error } = await supabase
        .from("training_assignments")
        .update({ saved_answers: saveData as any })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success("Fremgang lagret");
    } catch (err) {
      console.error("Error saving progress:", err);
      toast.error("Kunne ikke lagre fremgang");
    } finally {
      setSavingProgress(false);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSaveProgress();
    onOpenChange(false);
  };

  const handleToggleAnswer = (questionId: string, optionId: string) => {
    setAnswers(prev => {
      const cur = prev[questionId] || [];
      const next = cur.includes(optionId)
        ? cur.filter(id => id !== optionId)
        : [...cur, optionId];
      return { ...prev, [questionId]: next };
    });
  };

  const speakNarration = (text: string) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "nb-NO";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error("speech synthesis failed", e);
    }
  };

  const maybeAutoSpeak = (idx: number) => {
    const s = slides[idx];
    if (!s || s.slide_type !== "content") return;
    const cj = (s.content_json as any) || {};
    if (cj.narration_enabled === false) return;
    if (cj.narration_audio_url) return; // <audio autoPlay> handles it
    const text: string | null = cj.narration_text || null;
    if (text) speakNarration(text);
  };

  const handleNext = () => {
    if (currentPage < slides.length - 1) {
      const next = currentPage + 1;
      setCurrentPage(next);
      maybeAutoSpeak(next);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      const next = currentPage - 1;
      setCurrentPage(next);
      maybeAutoSpeak(next);
    }
  };

  const isQuestionAnswered = (qId: string) => (answers[qId]?.length ?? 0) > 0;

  const scoreQuestion = (q: SlideData) => {
    const correctIds = new Set(q.options.filter(o => o.is_correct).map(o => o.id));
    const selected = new Set(answers[q.id] || []);
    if (correctIds.size === 0) return false;
    if (correctIds.size !== selected.size) return false;
    for (const id of correctIds) if (!selected.has(id)) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!course) return;

    const unanswered = questionSlides.filter((q) => !isQuestionAnswered(q.id));
    if (unanswered.length > 0) {
      toast.error(`Du må svare på alle ${questionSlides.length} spørsmål`);
      const firstIdx = slides.findIndex((s) => s.slide_type === "question" && !isQuestionAnswered(s.id));
      if (firstIdx >= 0) setCurrentPage(firstIdx);
      return;
    }

    if (previewMode) {
      let correct = 0;
      questionSlides.forEach((q) => { if (scoreQuestion(q)) correct++; });
      const scorePercent = questionSlides.length > 0 ? Math.round((correct / questionSlides.length) * 100) : 100;
      setScore(scorePercent);
      setPassed(scorePercent >= course.passing_score);
      setSubmitted(true);
      return;
    }

    if (!user) return;

    setSubmitting(true);
    try {
      let correct = 0;
      questionSlides.forEach((q) => { if (scoreQuestion(q)) correct++; });

      const hasQuestions = questionSlides.length > 0;
      const scorePercent = hasQuestions ? Math.round((correct / questionSlides.length) * 100) : 100;
      const didPass = hasQuestions ? scorePercent >= course.passing_score : true;

      setScore(hasQuestions ? scorePercent : null);
      setPassed(didPass);
      setSubmitted(true);

      const updatePayload: any = {
        completed_at: new Date().toISOString(),
        score: hasQuestions ? scorePercent : null,
        passed: didPass,
        saved_answers: null,
      };

      if (didPass) {
        const now = new Date();
        const expiresAt = course.validity_months
          ? new Date(now.getFullYear(), now.getMonth() + course.validity_months, now.getDate())
          : null;

        try {
          const { data: compData, error: compErr } = await supabase
            .from("personnel_competencies")
            .insert({
              profile_id: user.id,
              type: "Kurs",
              navn: course.title,
              utstedt_dato: now.toISOString().split("T")[0],
              utloper_dato: expiresAt ? expiresAt.toISOString().split("T")[0] : null,
              påvirker_status: true,
            })
            .select("id")
            .single();

          if (!compErr && compData) {
            updatePayload.competency_id = compData.id;
          }
        } catch (compError) {
          console.error("Error creating competency:", compError);
        }
      }

      const { error: updateError } = await supabase
        .from("training_assignments")
        .update(updatePayload)
        .eq("id", assignmentId);

      if (updateError) {
        console.error("Error updating assignment:", updateError);
      }
      if (didPass && course?.unlocks_modules?.length) {
        await refetchUserInfo();
      }
    } catch (err) {
      console.error("Error submitting:", err);
      toast.error("Kunne ikke fullføre kurset");
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseResults = () => {
    setIsFullscreen(false);
    onOpenChange(false);
    if (!previewMode) onCompleted?.();
  };

  const handleClose = () => {
    setIsFullscreen(false);
    onOpenChange(false);
  };

  const answeredCount = questionSlides.filter((q) => isQuestionAnswered(q.id)).length;
  const totalProgress = slides.length > 0 ? Math.round(((currentPage + 1) / slides.length) * 100) : 0;

  const renderSlide = (s: SlideData) => {
    if (s.slide_type === "content") {
      const cj = (s.content_json as any) || {};
      const narrationUrl: string | null = cj.narration_audio_url || null;
      const narrationText: string | null = cj.narration_text || null;
      const heading: string | null = cj.heading || null;
      const sourceRef: string | null = cj.source_reference || null;

      return (
        <div className="flex flex-col items-center gap-4 max-w-3xl mx-auto">
          {heading && (
            <div className="text-center">
              <h3 className="text-xl font-semibold">{heading}</h3>
              {sourceRef && <p className="text-xs text-muted-foreground mt-1">{sourceRef}</p>}
            </div>
          )}
          {s.image_url ? (
            <img
              src={s.image_url}
              alt={heading || s.question_text}
              className={`rounded-lg object-contain ${isFullscreen ? "max-h-[60vh] max-w-[96vw] w-auto" : "w-full max-h-[40vh]"}`}
            />
          ) : null}
          {narrationText && (
            <p className="text-sm text-foreground/90 text-center leading-relaxed">{narrationText}</p>
          )}
          {cj.narration_enabled === false ? null : narrationUrl ? (
            <audio
              key={s.id}
              src={narrationUrl}
              controls
              autoPlay
              className="w-full max-w-md"
            />
          ) : narrationText ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => speakNarration(narrationText)}
            >
              ▶ Les opp
            </Button>
          ) : null}
          {!s.image_url && !narrationText && !heading && (
            <p className="text-muted-foreground text-sm">Innholdsside</p>
          )}
        </div>
      );
    }

    if (s.slide_type === "video") {
      const vid = parseYouTubeId(s.video_url || "");
      if (!vid) {
        return <p className="text-sm text-destructive">Ugyldig YouTube-URL</p>;
      }
      return (
        <div className="flex items-center justify-center">
          <div className={`w-full ${isFullscreen ? "max-w-[96vw]" : "max-w-3xl"} mx-auto`}>
            <YouTubeClipPlayer
              key={`${s.id}-${currentPage}`}
              videoId={vid}
              start={s.video_start_seconds ?? null}
              end={s.video_end_seconds ?? null}
              autoplay
              customControls
              onEnd={() => setCompletedVideoIds((prev) => {
                if (prev.has(s.id)) return prev;
                const next = new Set(prev);
                next.add(s.id);
                return next;
              })}
            />
          </div>
        </div>
      );
    }

    // Question slide
    return (
      <div className={isFullscreen ? "flex items-center justify-center min-h-[60vh]" : ""}>
        <Card className={`w-full mx-auto ${isFullscreen ? "max-w-4xl" : "max-w-2xl"}`}>
          <CardContent className="pt-4 space-y-3">
            <p className="font-medium">
              <span className="text-muted-foreground mr-2">
                {questionSlides.indexOf(s) + 1}/{questionSlides.length}
              </span>
              {s.question_text}
            </p>
            {s.image_url && (
              <img src={s.image_url} alt="" className={`${isFullscreen ? "max-h-[55vh]" : "max-h-48"} rounded object-contain`} />
            )}
            <p className="text-xs text-muted-foreground">
              Kryss av alle riktige svar (ett eller flere)
            </p>
            <div className="space-y-2">
              {s.options.map((o) => {
                const checked = (answers[s.id] || []).includes(o.id);
                return (
                  <div key={o.id} className="flex items-center gap-2">
                    <Checkbox
                      id={o.id}
                      checked={checked}
                      onCheckedChange={() => handleToggleAnswer(s.id, o.id)}
                    />
                    <Label htmlFor={o.id} className="cursor-pointer text-sm">{o.option_text}</Label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderResultView = () => (
    <div className="text-center py-8 space-y-4">
      {previewMode && (
        <Badge variant="secondary" className="mb-2">Forhåndsvisning</Badge>
      )}
      {passed ? (
        <CheckCircle className="h-16 w-16 text-primary mx-auto" />
      ) : (
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
      )}
      {questionSlides.length === 0 ? (
        <>
          <h3 className="text-2xl font-bold">Gjennomført</h3>
          <p className="text-lg">Kurset er registrert som gjennomført.</p>
        </>
      ) : (
        <>
          <h3 className="text-2xl font-bold">{score}%</h3>
          <p className="text-lg">
            {passed ? "Gratulerer! Du har bestått kurset." : "Dessverre, du bestod ikke denne gangen."}
          </p>
          <p className="text-sm text-muted-foreground">
            Krav: {course?.passing_score}% · Din score: {score}%
          </p>
        </>
      )}
      {!previewMode && passed && course?.validity_months && (
        <Badge variant="default">
          Gyldig i {course.validity_months} måneder
        </Badge>
      )}
      {!previewMode && passed && (
        <p className="text-sm text-muted-foreground">
          Kurset er lagret som kompetanse på din profil.
        </p>
      )}
      {previewMode && (
        <p className="text-sm text-muted-foreground">
          Dette er en forhåndsvisning — ingen data er lagret.
        </p>
      )}
      <Button onClick={handleCloseResults} className="mt-4">
        Lukk
      </Button>
    </div>
  );

  const currentSlide = slides[currentPage];

  const renderCourseView = () => (
    <div className={`space-y-4 ${isFullscreen ? "flex flex-col flex-1" : ""}`}>
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Side {currentPage + 1} av {slides.length}</span>
          <span>{answeredCount}/{questionSlides.length} spørsmål besvart</span>
        </div>
        <Progress value={totalProgress} className="h-2" />
      </div>

      {/* Current slide */}
      <div className={isFullscreen ? "flex-1" : ""}>
        {currentSlide && renderSlide(currentSlide)}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between sticky bottom-0 bg-background/80 backdrop-blur-sm p-3 rounded-lg border">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={handlePrev}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Forrige
          </Button>
          {currentPage < slides.length - 1 && (() => {
            const cur = slides[currentPage];
            const blockedByVideo =
              cur?.slide_type === "video" &&
              cur?.video_required_complete &&
              !completedVideoIds.has(cur.id);
            const blockedByQuestion =
              cur?.slide_type === "question" && !isQuestionAnswered(cur.id);
            const blocked = blockedByVideo || blockedByQuestion;
            const title = blockedByVideo
              ? "Du må se hele videoen før du kan gå videre"
              : blockedByQuestion
              ? "Velg minst ett svar før du kan gå videre"
              : undefined;
            return (
              <Button
                variant={blocked ? "outline" : "default"}
                size="sm"
                onClick={handleNext}
                disabled={blocked}
                title={title}
              >
                Neste
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            );
          })()}
        </div>
        <div className="flex gap-2">
          {!previewMode && (
            <Button variant="ghost" size="sm" onClick={handleSaveAndClose} disabled={savingProgress}>
              <Save className="h-4 w-4 mr-1" />
              {savingProgress ? "Lagrer..." : "Lagre og lukk"}
            </Button>
          )}
          {previewMode && (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Lukk
            </Button>
          )}
          {((questionSlides.length === 0 && currentPage === slides.length - 1) || (answeredCount === questionSlides.length && questionSlides.length > 0 && currentPage === slides.length - 1)) && (
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Fullfører..." : "Fullfør"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        ref={dialogRef}
        className={
          isFullscreen
            ? "fixed inset-0 translate-x-0 translate-y-0 max-w-none w-screen h-screen rounded-none border-none p-0 overflow-hidden"
            : "max-w-3xl max-h-[90vh] overflow-y-auto"
        }
      >
        <div className={isFullscreen ? "h-full flex flex-col overflow-y-auto p-2 sm:p-4" : ""}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-10">
              <div className="flex items-center gap-2 min-w-0">
                <DialogTitle className="truncate">{course?.title || "Kurs"}</DialogTitle>
                {previewMode && <Badge variant="secondary" className="shrink-0">Forhåndsvisning</Badge>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-lg border-border"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Avslutt fullskjerm" : "Fullskjerm"}
                >
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </div>
            </div>
            {course?.description && <p className="text-sm text-muted-foreground">{course.description}</p>}
          </DialogHeader>

          <div className={isFullscreen ? "flex-1 overflow-y-auto" : ""}>
            {loading ? (
              <p className="text-sm text-muted-foreground">Laster kurs...</p>
            ) : submitted ? (
              renderResultView()
            ) : (
              renderCourseView()
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
