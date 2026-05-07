import { useEffect, useRef, useState } from "react";
import { Loader2, Radio, AlertTriangle } from "lucide-react";

interface WhepPlayerProps {
  url: string;
  onError?: (msg: string) => void;
}

type PlayerState = "connecting" | "live" | "error" | "disconnected";

/**
 * Minimal WHEP (WebRTC-HTTP Egress Protocol) klient.
 * Sender SDP-offer som POST til WHEP-URL, mottar SDP-answer,
 * og rendrer videostrømmen i et <video>-element.
 */
export const WhepPlayer = ({ url, onError }: WhepPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<PlayerState>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          const cs = pc.connectionState;
          if (cs === "connected") setState("live");
          else if (cs === "failed" || cs === "closed") setState("disconnected");
          else if (cs === "disconnected") setState("disconnected");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp || "",
        });

        if (!res.ok) {
          throw new Error(`WHEP returnerte status ${res.status}`);
        }

        const answerSdp = await res.text();
        if (cancelled) return;

        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || "Ukjent feil ved tilkobling";
        setErrorMsg(msg);
        setState("error");
        onError?.(msg);
      }
    };

    start();

    return () => {
      cancelled = true;
      try { pcRef.current?.close(); } catch { /* ignore */ }
      pcRef.current = null;
    };
  }, [url, onError]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video bg-black rounded-md overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls
          className="w-full h-full"
        />
        {state === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
            <div className="text-center text-destructive-foreground">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className={`h-3.5 w-3.5 ${state === "live" ? "text-green-500" : ""}`} />
        <span>
          {state === "connecting" && "Kobler til…"}
          {state === "live" && "Live"}
          {state === "disconnected" && "Frakoblet"}
          {state === "error" && "Feil"}
        </span>
      </div>
    </div>
  );
};
