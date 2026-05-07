import { Lock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { TRAINING_MODULES, type TrainingModuleKey } from "@/config/trainingModules";

interface TrainingModuleRestrictedProps {
  moduleKey: TrainingModuleKey;
  children: React.ReactNode;
}

export const TrainingModuleRestricted = ({ moduleKey, children }: TrainingModuleRestrictedProps) => {
  const { underTraining, hasTrainingModuleAccess } = useAuth();
  const navigate = useNavigate();
  const module = TRAINING_MODULES.find((item) => item.key === moduleKey);

  if (!underTraining || hasTrainingModuleAccess(moduleKey)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">Modulen krever opplæring</h2>
      <p className="text-muted-foreground max-w-md">
        {module?.label || "Denne modulen"} blir tilgjengelig når den er valgt av administrator eller låst opp via bestått kurs.
      </p>
      <Button variant="outline" onClick={() => navigate("/")}> 
        <ArrowLeft className="w-4 h-4 mr-2" />
        Tilbake til dashboard
      </Button>
    </div>
  );
};