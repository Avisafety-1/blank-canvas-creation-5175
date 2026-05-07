import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Radio, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { WhepPlayer } from "./WhepPlayer";

interface CameraOption {
  index: string;
  name: string;
}

interface LiveStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceSn: string;
  deviceName?: string;
  cameras: CameraOption[];
  projectUuid?: string;
}

const QUALITY_OPTIONS = [
  { value: "adaptive", label: "Auto (adaptiv)" },
  { value: "smooth", label: "Smooth" },
  { value: "high_definition", label: "HD" },
  { value: "ultra_high_definition", label: "Ultra HD" },
];

export const LiveStreamDialog = ({
  open, onOpenChange, deviceSn, deviceName, cameras, projectUuid,
}: LiveStreamDialogProps) => {
  const [cameraIndex, setCameraIndex] = useState<string>("");
  const [quality, setQuality] = useState<string>("adaptive");
  const [starting, setStarting] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [expireTs, setExpireTs] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [debugAttempts, setDebugAttempts] = useState<any>(null);
  const [resolvedProjectUuid, setResolvedProjectUuid] = useState<string | null>(null);
  const [projectResolve, setProjectResolve] = useState<any>(null);

  useEffect(() => {
    if (open && cameras.length > 0 && !cameraIndex) {
      setCameraIndex(cameras[0].index);
    }
    if (!open) {
      setStreamUrl(null);
      setExpireTs(null);
      setDebugAttempts(null);
      setResolvedProjectUuid(null);
      setProjectResolve(null);
    }
  }, [open, cameras, cameraIndex]);

  useEffect(() => {
    if (!streamUrl) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [streamUrl]);

  const start = async () => {
    if (!cameraIndex) {
      toast.error("Velg et kamera");
      return;
    }
    setStarting(true);
    setStreamUrl(null);
    setDebugAttempts(null);
    setResolvedProjectUuid(null);
    setProjectResolve(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: {
          action: "start-livestream",
          deviceSn,
          cameraIndex,
          qualityType: quality,
          projectUuid,
        },
      });
      if (error) throw error;
      const used = data?.attempts?.[0]?.projectUuidSent ?? data?.projectUuid ?? null;
      setResolvedProjectUuid(used);
      setProjectResolve(data?.projectResolve ?? null);
      if (data?.ok && data?.url) {
        setStreamUrl(data.url);
        setExpireTs(data.expireTs ?? null);
        toast.success("Live stream startet");
      } else {
        setDebugAttempts(data?.attempts ?? data);
        toast.error(data?.error || "Kunne ikke starte live stream");
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved start av live stream");
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    setStreamUrl(null);
    setExpireTs(null);
  };

  const copyUrl = () => {
    if (!streamUrl) return;
    navigator.clipboard.writeText(streamUrl);
    toast.success("URL kopiert");
  };

  const isHttp = streamUrl?.startsWith("http://");
  const remainingSec = expireTs ? Math.max(0, Math.floor(expireTs - now / 1000)) : null;
  const remainingFmt = remainingSec != null
    ? `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Live stream — {deviceName || deviceSn}
          </DialogTitle>
        </DialogHeader>

        {!streamUrl && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kamera</Label>
              <Select value={cameraIndex} onValueChange={setCameraIndex} disabled={cameras.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={cameras.length === 0 ? "Ingen kameraer funnet" : "Velg kamera"} />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map((c) => (
                    <SelectItem key={c.index} value={c.index}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kvalitet</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((q) => (
                    <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5 border rounded p-2">
              <div><span className="font-medium">SN:</span> <span className="font-mono">{deviceSn}</span></div>
              <div><span className="font-medium">Camera index:</span> <span className="font-mono">{cameraIndex || "(ikke valgt)"}</span></div>
              <div>
                <span className="font-medium">Project UUID (UI):</span>{" "}
                <span className="font-mono">{projectUuid || <span className="text-muted-foreground">(ikke satt — proxy auto-løser)</span>}</span>
              </div>
              {resolvedProjectUuid && (
                <div>
                  <span className="font-medium">Project UUID (brukt):</span>{" "}
                  <span className="font-mono">{resolvedProjectUuid}</span>
                </div>
              )}
            </div>

            {projectResolve && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Auto-resolve av prosjekt:</p>
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                  {JSON.stringify(projectResolve, null, 2)}
                </pre>
              </div>
            )}

            {debugAttempts && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Forsøk:</p>
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
                  {JSON.stringify(debugAttempts, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {streamUrl && (
          <div className="space-y-3">
            {isHttp ? (
              <div className="space-y-2 p-3 border border-amber-500/30 bg-amber-500/10 rounded-md">
                <p className="text-sm font-medium">Strøm-URL er HTTP (ikke HTTPS)</p>
                <p className="text-xs text-muted-foreground">
                  Nettleseren blokkerer ofte blandet innhold. Bruk «Åpne i ny fane» eller kopier URL-en til VLC.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={copyUrl}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Kopier URL
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={streamUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Åpne i ny fane
                    </a>
                  </Button>
                </div>
                <pre className="text-[10px] bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                  {streamUrl}
                </pre>
              </div>
            ) : (
              <WhepPlayer url={streamUrl} />
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {remainingFmt && <span>Utløper om: {remainingFmt}</span>}
              <Button size="sm" variant="outline" onClick={copyUrl}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Kopier URL
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!streamUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
              <Button onClick={start} disabled={starting || !cameraIndex}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Radio className="h-4 w-4 mr-1" />}
                Start strøm
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={stop}>Stopp</Button>
              <Button onClick={() => onOpenChange(false)}>Lukk</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
