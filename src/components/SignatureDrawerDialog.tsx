import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Undo2, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface SignatureDrawerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
}

export function SignatureDrawerDialog({ open, onClose, onSave }: SignatureDrawerDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev, imageData]);
  }, []);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    setHistory([]);
  }, []);

  useEffect(() => {
    if (open) {
      // Delay to ensure container is rendered
      setTimeout(initCanvas, 50);
    }
  }, [open, initCanvas]);

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    saveToHistory();
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const newHistory = [...history];
    const lastState = newHistory.pop();
    if (lastState) {
      ctx.putImageData(lastState, 0, 0);
    } else {
      initCanvas();
    }
    setHistory(newHistory);
  };

  const handleClear = () => {
    initCanvas();
  };

  // Rotate canvas 90 degrees clockwise for correct orientation
  const rotateCanvasForSave = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = sourceCanvas.height;
    rotatedCanvas.height = sourceCanvas.width;
    
    const ctx = rotatedCanvas.getContext('2d');
    if (ctx) {
      ctx.translate(rotatedCanvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(sourceCanvas, 0, 0);
    }
    
    return rotatedCanvas;
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user) return;

    setIsSaving(true);
    try {
      // On mobile, rotate the signature back to normal orientation
      const canvasToSave = isMobile ? rotateCanvasForSave(canvas) : canvas;
      
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasToSave.toBlob(resolve, "image/png")
      );

      if (!blob) {
        throw new Error("Kunne ikke konvertere signatur til bilde");
      }

      const fileName = `${user.id}/signature_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(fileName, blob, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("signatures")
        .getPublicUrl(fileName);

      // Update profile with signature URL
      const { error: updateError } = await (supabase as any)
        .from("profiles")
        .update({ signature_url: urlData.publicUrl })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      toast.success("Signatur lagret");
      onSave(urlData.publicUrl);
      onClose();
    } catch (error: any) {
      console.error("Error saving signature:", error);
      toast.error("Kunne ikke lagre signatur: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-50 bg-background flex ${isMobile ? 'flex-row' : 'flex-col'}`}>
      {/* Header - rotated on mobile */}
      <div className={`flex items-center justify-between border-border bg-background ${
        isMobile 
          ? 'flex-col w-14 h-full border-r p-2' 
          : 'flex-row p-4 border-b'
      }`}>
        <h2 className={`font-semibold ${isMobile ? 'text-sm writing-mode-vertical rotate-180' : 'text-lg'}`}>
          Tegn signatur
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Canvas container */}
      <div 
        ref={containerRef}
        className="flex-1 p-4 bg-muted"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg border-2 border-dashed border-muted-foreground/30 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* Footer with actions - rotated on mobile */}
      <div className={`flex items-center justify-between border-border bg-background ${
        isMobile 
          ? 'flex-col-reverse w-auto h-full border-l p-2 gap-2' 
          : 'flex-row p-4 border-t'
      }`}>
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-2`}>
          <Button variant="outline" size={isMobile ? "icon" : "sm"} onClick={handleClear}>
            <Trash2 className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Tøm</span>}
          </Button>
          <Button 
            variant="outline" 
            size={isMobile ? "icon" : "sm"} 
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            <Undo2 className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Angre</span>}
          </Button>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          size={isMobile ? "icon" : "default"}
          className={isMobile ? "w-10 h-10" : ""}
        >
          <Save className="h-4 w-4" />
          {!isMobile && <span className="ml-2">{isSaving ? "Lagrer..." : "Lagre signatur"}</span>}
        </Button>
      </div>
    </div>
  );
}
