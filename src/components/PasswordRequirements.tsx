import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

export const passwordChecks: PasswordCheck[] = [
  { label: "Minst 8 tegn", test: (pw) => pw.length >= 8 },
  { label: "Minst én stor bokstav (A–Z)", test: (pw) => /[A-Z]/.test(pw) },
  { label: "Minst én liten bokstav (a–z)", test: (pw) => /[a-z]/.test(pw) },
  { label: "Minst ett tall (0–9)", test: (pw) => /[0-9]/.test(pw) },
  { label: "Minst ett spesialtegn (f.eks. !@#$%)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export const isPasswordValid = (pw: string) => passwordChecks.every((c) => c.test(pw));

export const passwordErrorMessage = (pw: string): string | null => {
  const failed = passwordChecks.filter((c) => !c.test(pw));
  if (failed.length === 0) return null;
  return "Passordet må inneholde: " + failed.map((f) => f.label.toLowerCase()).join(", ");
};

interface Props {
  password: string;
  className?: string;
}

export const PasswordRequirements = ({ password, className }: Props) => {
  return (
    <div className={cn("rounded-md border border-border/50 bg-muted/30 p-3 space-y-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground mb-1">Passordet må inneholde:</p>
      {passwordChecks.map((check) => {
        const ok = check.test(password);
        return (
          <div
            key={check.label}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            <span>{check.label}</span>
          </div>
        );
      })}
    </div>
  );
};
