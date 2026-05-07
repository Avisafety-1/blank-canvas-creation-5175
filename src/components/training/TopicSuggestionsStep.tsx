import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SuggestedTopic {
  title: string;
  chapter_reference: string;
  description: string;
  focus_query: string;
}

interface Props {
  loading: boolean;
  topics: SuggestedTopic[];
  selected: SuggestedTopic | null;
  onSelect: (t: SuggestedTopic) => void;
  errorMsg?: string | null;
  onRetry?: () => void;
}

export const TopicSuggestionsStep = ({ loading, topics, selected, onSelect, errorMsg, onRetry }: Props) => {
  if (loading) {
    return (
      <div className="py-10 flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-medium">AI leser manualen…</p>
        <p className="text-sm text-muted-foreground">
          Foreslår kurs-temaer basert på innholdet. Tar 10-30 sekunder.
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Prøv igjen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">
        Velg ett tema for kurset. AI vil bygge kurset rundt dette emnet.
      </p>
      {topics.map((t, i) => {
        const isSelected = selected?.title === t.title && selected?.chapter_reference === t.chapter_reference;
        return (
          <Card
            key={`${t.title}-${i}`}
            onClick={() => onSelect(t)}
            className={`p-4 cursor-pointer transition border-2 ${
              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <BookOpen className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-semibold text-sm">{t.title}</h4>
                  <Badge variant="secondary" className="text-xs">{t.chapter_reference}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
              </div>
            </div>
          </Card>
        );
      })}
      {topics.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Ingen forslag ble generert.</p>
      )}
    </div>
  );
};
