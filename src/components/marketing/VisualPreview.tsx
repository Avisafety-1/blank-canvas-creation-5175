import { Card } from "@/components/ui/card";

interface Props {
  text: string;
  imageUrl?: string | null;
  authorName?: string;
}

export const VisualPreview = ({ text, imageUrl, authorName = "AviSafe" }: Props) => (
  <Card className="max-w-md mx-auto overflow-hidden border-border">
    {/* LinkedIn-style header */}
    <div className="flex items-center gap-2.5 p-3 pb-2">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
        A
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{authorName}</p>
        <p className="text-xs text-muted-foreground">Drone Operations & Safety Platform</p>
      </div>
    </div>

    {/* Post text */}
    <div className="px-3 pb-2">
      <p className="text-sm text-foreground whitespace-pre-line line-clamp-6">{text || "Innleggstekst vises her..."}</p>
    </div>

    {/* Image */}
    {imageUrl && (
      <div className="border-t border-border">
        <img src={imageUrl} alt="Post visual" className="w-full object-contain" />
      </div>
    )}

    {/* Engagement bar */}
    <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
      <span>👍 Like</span>
      <span>💬 Comment</span>
      <span>🔄 Repost</span>
      <span>📤 Send</span>
    </div>
  </Card>
);
