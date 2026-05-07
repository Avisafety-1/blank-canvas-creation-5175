import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Brain, FileText } from "lucide-react";

interface RiskAssessmentTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAI: () => void;
  onSelectManualSORA: () => void;
}

export const RiskAssessmentTypeDialog = ({
  open,
  onOpenChange,
  onSelectAI,
  onSelectManualSORA,
}: RiskAssessmentTypeDialogProps) => {
  const { t } = useTranslation();

  const handleSelectAI = () => {
    onOpenChange(false);
    onSelectAI();
  };

  const handleSelectSORA = () => {
    onOpenChange(false);
    onSelectManualSORA();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('riskAssessmentType.title', 'Velg type risikovurdering')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <button
            onClick={handleSelectAI}
            className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left flex items-start gap-4"
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Brain className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">
                {t('riskAssessmentType.aiBasedTitle', 'AI-basert risikovurdering')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('riskAssessmentType.aiBasedDescription', 'Automatisk analyse basert på vær, luftrom, piloterfaring og utstyr')}
              </p>
            </div>
          </button>

          <button
            onClick={handleSelectSORA}
            className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left flex items-start gap-4"
          >
            <div className="p-2 rounded-lg bg-secondary text-secondary-foreground">
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">
                {t('riskAssessmentType.soraTitle', 'Manuell SORA-analyse')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('riskAssessmentType.soraDescription', 'Strukturert risikovurdering etter SORA-metodikken')}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
