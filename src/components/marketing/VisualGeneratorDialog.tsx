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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Image, Shield, Monitor, Layout } from "lucide-react";
import { VISUAL_TEMPLATES } from "./marketingPresets";

const VISUAL_TYPES = [
  { value: "safety_graphic", label: "Sikkerhetsgrafik", icon: Shield, desc: "Illustrer sikkerhetskonsepter" },
  { value: "product_mockup", label: "Produktmockup", icon: Monitor, desc: "AviSafe på enhet" },
  { value: "screenshot_layout", label: "Skjermbildelayout", icon: Layout, desc: "Ramme inn skjermbilde" },
] as const;

const FORMATS = [
  { value: "1200x1200", label: "LinkedIn kvadrat (1200×1200)" },
  { value: "1200x628", label: "LinkedIn landskap (1200×628)" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId?: string | null;
  initialTitle?: string;
  initialSubtitle?: string;
}

export const VisualGeneratorDialog = ({ open, onOpenChange, draftId, initialTitle, initialSubtitle }: Props) => {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  const [type, setType] = useState<string>("safety_graphic");
  const [template, setTemplate] = useState("feature_highlight");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [format, setFormat] = useState("1200x1200");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Auto-fill from draft content when dialog opens
  useEffect(() => {
    if (open) {
      if (initialTitle && !title) setTitle(initialTitle);
      if (initialSubtitle && !subtitle) setSubtitle(initialSubtitle);
    }
    if (!open) {
      setTitle("");
      setSubtitle("");
      setPreviewUrl(null);
      setScreenshotUrl("");
    }
  }, [open]);

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploading(true);
    try {
      const fileName = `${companyId}/screenshots/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage
        .from("marketing-media")
        .upload(fileName, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("marketing-media").getPublicUrl(fileName);
      setScreenshotUrl(data.publicUrl);
      toast.success("Skjermbilde lastet opp");
    } catch (err: any) {
      toast.error("Feil ved opplasting: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("Skriv inn en tittel");
      return;
    }
    setGenerating(true);
    setPreviewUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("marketing-visual", {
        body: {
          type,
          title,
          subtitle,
          template,
          format,
          screenshotUrl: type === "screenshot_layout" ? screenshotUrl : undefined,
          companyId,
          draftId: draftId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPreviewUrl(data.media.file_url);
      queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
      if (draftId) queryClient.invalidateQueries({ queryKey: ["marketing-draft-media"] });
      toast.success("Visuell generert!");
    } catch (err: any) {
      toast.error(err.message || "Feil ved generering");
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setPreviewUrl(null);
    setTitle("");
    setSubtitle("");
    setScreenshotUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            AviSafe Visuell Generator
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Visual type selector */}
          <div>
            <Label>Type visuell</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {VISUAL_TYPES.map((vt) => (
                <button
                  key={vt.value}
                  onClick={() => setType(vt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm transition-colors ${
                    type === vt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <vt.icon className="w-5 h-5" />
                  <span className="font-medium text-xs">{vt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template */}
          <div>
            <Label>Layout-mal</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISUAL_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title & subtitle */}
          <div>
            <Label>Overskrift</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="f.eks. Sjekk vindgrensene før du flyr" />
          </div>
          <div>
            <Label>Undertekst (valgfritt)</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="f.eks. AviSafe hjelper deg å planlegge trygt" />
          </div>

          {/* Format */}
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Screenshot upload for screenshot_layout */}
          {type === "screenshot_layout" && (
            <div>
              <Label>Last opp skjermbilde (valgfritt)</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  disabled={uploading}
                  className="text-sm"
                />
                {uploading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {screenshotUrl && (
                <img src={screenshotUrl} alt="Screenshot" className="mt-2 rounded-md border border-border max-h-32 object-contain" />
              )}
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div>
              <Label>Resultat</Label>
              <div className="mt-1.5 rounded-lg border border-border overflow-hidden bg-muted/30">
                <img src={previewUrl} alt="Generated visual" className="w-full object-contain" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Lukk</Button>
          <Button onClick={handleGenerate} disabled={generating || !title.trim()} className="gap-1.5">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
            {generating ? "Genererer..." : previewUrl ? "Generer ny" : "Generer visuell"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
