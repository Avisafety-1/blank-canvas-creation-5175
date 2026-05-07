import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";

interface Props {
  videoId: string;
  start?: number | null;
  end?: number | null;
  autoplay?: boolean;
  onEnd?: () => void;
  className?: string;
  /** Hide all YouTube UI and use a custom play/pause + progress bar that respects the clip range. */
  customControls?: boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiPromise?: Promise<void>;
  }
}

const loadYouTubeApi = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise<void>((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
  });
  return window.__ytApiPromise;
};

export const YouTubeClipPlayer = ({
  videoId,
  start,
  end,
  autoplay = false,
  onEnd,
  className,
  customControls = false,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(typeof start === "number" ? start : 0);
  const [finished, setFinished] = useState(false);

  const startSec = typeof start === "number" && start > 0 ? Math.floor(start) : 0;
  const endSec = typeof end === "number" && end > 0 ? Math.floor(end) : null;

  useEffect(() => {
    let cancelled = false;
    endedRef.current = false;
    setFinished(false);
    setReady(false);
    setIsPlaying(false);
    setCurrentTime(startSec);

    const init = async () => {
      await loadYouTubeApi();
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);

      const playerVars: any = {
        autoplay: autoplay ? 1 : 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      };
      if (startSec > 0) playerVars.start = startSec;
      if (endSec) playerVars.end = endSec;

      if (customControls) {
        // Hide YouTube UI as much as possible
        playerVars.controls = 0;
        playerVars.disablekb = 1;
        playerVars.fs = 0;
        playerVars.iv_load_policy = 3;
        playerVars.showinfo = 0;
        playerVars.cc_load_policy = 0;
      }

      playerRef.current = new window.YT.Player(div, {
        videoId,
        playerVars,
        events: {
          onReady: (e: any) => {
            setReady(true);
            if (autoplay) {
              try {
                e.target.playVideo();
              } catch {}
            }
          },
          onStateChange: (e: any) => {
            // 1 = playing, 2 = paused, 0 = ended
            if (e.data === 1) setIsPlaying(true);
            else if (e.data === 2) setIsPlaying(false);
            if (e.data === 0 && !endedRef.current) {
              endedRef.current = true;
              setIsPlaying(false);
              setFinished(true);
              onEnd?.();
            }
          },
        },
      });

      // Poller — pauses at end time and tracks current time for progress bar
      intervalRef.current = window.setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== "function") return;
        try {
          const t = p.getCurrentTime();
          setCurrentTime(t);
          if (endSec && t >= endSec && !endedRef.current) {
            p.pauseVideo();
            endedRef.current = true;
            setIsPlaying(false);
            setFinished(true);
            onEnd?.();
          }
        } catch {}
      }, 200);
    };

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, startSec, endSec, autoplay, customControls]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || finished) return;
    try {
      if (isPlaying) p.pauseVideo();
      else p.playVideo();
    } catch {}
  };

  // Compute progress relative to the clip range
  const clipDuration = endSec != null ? Math.max(0, endSec - startSec) : null;
  const elapsed = Math.max(0, currentTime - startSec);
  const progressPct =
    clipDuration && clipDuration > 0
      ? Math.min(100, Math.max(0, (elapsed / clipDuration) * 100))
      : 0;

  return (
    <div className="space-y-2">
      <div className={className ?? "relative w-full aspect-video rounded-lg overflow-hidden bg-black"}>
        <div ref={containerRef} className="absolute inset-0 [&>*]:w-full [&>*]:h-full" />
        {customControls && (
          <>
            {/* Click-blocker over the iframe to prevent YouTube interactions */}
            <div
              className="absolute inset-0"
              onClick={togglePlay}
              style={{ cursor: finished ? "not-allowed" : "pointer" }}
              aria-hidden
            />
            {finished && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                <p className="text-white text-sm font-medium">Video ferdig — klikk «Neste slide»</p>
              </div>
            )}
          </>
        )}
      </div>

      {customControls && clipDuration != null && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={togglePlay}
            disabled={!ready || finished}
            className="h-9 w-9 shrink-0"
            aria-label={isPlaying ? "Pause" : "Spill av"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {formatSeconds(elapsed)} / {formatSeconds(clipDuration)}
          </span>
        </div>
      )}
    </div>
  );
};

export const parseYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["shorts", "embed", "v", "live"].includes(parts[0])) {
        return parts[1];
      }
    }
  } catch {}
  return null;
};

export const parseTimeInput = (value: string): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
};

export const formatSeconds = (s: number | null | undefined): string => {
  if (s == null || isNaN(s)) return "";
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
