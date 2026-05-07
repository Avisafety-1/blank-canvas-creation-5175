import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";

export const IdleTimeoutWarning = () => {
  const { showWarning, remainingSeconds, extendSession, logout } = useIdleTimeout();
  const { t } = useTranslation();

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-destructive" />
            {t("idleTimeout.title", "Inaktivitet oppdaget")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {t(
                "idleTimeout.description",
                "Du blir logget ut på grunn av inaktivitet."
              )}
            </span>
            <span className="block text-2xl font-mono font-bold text-foreground text-center py-2">
              {timeDisplay}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={logout}>
            {t("idleTimeout.logoutNow", "Logg ut nå")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={extendSession}>
            {t("idleTimeout.extendSession", "Forleng sesjon")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
