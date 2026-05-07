import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TRAINING_MODULES, type TrainingModuleKey } from "@/config/trainingModules";

interface TrainingModulePickerProps {
  selected: TrainingModuleKey[];
  onChange: (modules: TrainingModuleKey[]) => void;
  disabled?: boolean;
  lockedModules?: TrainingModuleKey[];
  onOpenAllModules?: () => void;
}

export const TrainingModulePicker = ({ selected, onChange, disabled, lockedModules = [], onOpenAllModules }: TrainingModulePickerProps) => {
  const lockedSet = new Set(lockedModules);

  const toggle = (moduleKey: TrainingModuleKey, checked: boolean) => {
    if (lockedSet.has(moduleKey)) return;
    if (checked) onChange(Array.from(new Set([...selected, moduleKey])));
    else onChange(selected.filter((key) => key !== moduleKey));
  };

  return (
    <div className="space-y-2">
      {onOpenAllModules && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-center"
          onClick={onOpenAllModules}
          disabled={disabled}
        >
          Åpne alle moduler
        </Button>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TRAINING_MODULES.map((module) => {
          const isLockedByCourse = lockedSet.has(module.key);
          return (
            <Label
              key={module.key}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(module.key) || isLockedByCourse}
                onCheckedChange={(checked) => toggle(module.key, checked === true)}
                disabled={disabled || isLockedByCourse}
              />
              <span className="flex-1">{module.label}</span>
              {isLockedByCourse && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">via kurs</Badge>}
            </Label>
          );
        })}
      </div>
    </div>
  );
};