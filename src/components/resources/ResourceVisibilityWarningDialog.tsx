import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, FileText, Package, User } from "lucide-react";
import { useState } from "react";
import type { MissingVisibility, DepartmentInfo } from "@/lib/droneVisibilityCheck";
import { grantMissingVisibility } from "@/lib/droneVisibilityCheck";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: MissingVisibility[];
  departments: DepartmentInfo[];
  /** Called when user wants to proceed (after optional auto-grant) */
  onContinue: () => void | Promise<void>;
  /** Called when user cancels — saving should be aborted */
  onCancel: () => void;
}

const typeMeta: Record<MissingVisibility["resourceType"], { label: string; Icon: any }> = {
  document: { label: "Dokument", Icon: FileText },
  equipment: { label: "Utstyr", Icon: Package },
  personnel: { label: "Personell", Icon: User },
};

export const ResourceVisibilityWarningDialog = ({
  open,
  onOpenChange,
  missing,
  departments,
  onContinue,
  onCancel,
}: Props) => {
  const [working, setWorking] = useState(false);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.navn || id.slice(0, 8);
  const autoFixable = missing.filter((m) => m.resourceType !== "personnel");
  const personnelOnly = missing.filter((m) => m.resourceType === "personnel");

  const handleGrantAll = async () => {
    setWorking(true);
    try {
      await grantMissingVisibility(autoFixable);
      toast.success(`${autoFixable.length} ressurs(er) gjort synlig`);
      await onContinue();
      onOpenChange(false);
    } catch (e: any) {
      console.error("Grant visibility error:", e);
      toast.error(`Kunne ikke oppdatere synlighet: ${e.message}`);
    } finally {
      setWorking(false);
    }
  };

  const handleProceed = async () => {
    setWorking(true);
    try {
      await onContinue();
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); else onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Manglende synlighet for tilknyttede ressurser
          </DialogTitle>
          <DialogDescription>
            Følgende ressurser er tilknyttet dronen, men er ikke synlige for alle avdelingene
            dronen deles med. Du kan gjøre dem synlige automatisk eller fortsette uten endring.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Navn</TableHead>
                <TableHead>Mangler synlighet for</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missing.map((m, i) => {
                const meta = typeMeta[m.resourceType];
                const Icon = meta.Icon;
                return (
                  <TableRow key={`${m.resourceType}-${m.resourceId}-${i}`}>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {meta.label}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{m.resourceName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.missingDeptIds.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">
                            {deptName(d)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {personnelOnly.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>
              Personell kan ikke gjøres synlig automatisk — de er bundet til sin avdeling.
              Du må eventuelt invitere dem på nytt eller flytte dem manuelt.
            </span>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={handleCancel} disabled={working}>
            Avbryt
          </Button>
          <Button variant="outline" onClick={handleProceed} disabled={working}>
            Fortsett uten endring
          </Button>
          {autoFixable.length > 0 && (
            <Button onClick={handleGrantAll} disabled={working}>
              {working ? "Oppdaterer..." : `Gjør ${autoFixable.length} synlig`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
