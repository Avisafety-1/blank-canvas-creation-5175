import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Search, User, Plus } from "lucide-react";

interface Person {
  id: string;
  full_name: string;
  email: string | null;
  tittel: string | null;
  company_id: string | null;
  company_navn: string | null;
}

interface AddPersonnelToDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  droneId: string;
  droneCompanyId: string;
  existingPersonnelIds: string[];
  onPersonnelAdded: () => void;
  onVisibilityChanged?: () => void;
}

export const AddPersonnelToDroneDialog = ({
  open,
  onOpenChange,
  droneId,
  droneCompanyId,
  existingPersonnelIds,
  onPersonnelAdded,
  onVisibilityChanged,
}: AddPersonnelToDroneDialogProps) => {
  const { companyId } = useAuth();
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [visibilityPrompt, setVisibilityPrompt] = useState<{
    person: Person;
  } | null>(null);

  useEffect(() => {
    if (open && companyId) {
      fetchAvailablePersonnel();
    }
  }, [open, companyId, existingPersonnelIds]);

  const getHierarchyCompanyIds = async (): Promise<string[]> => {
    if (!companyId) return [];

    // Check if current company has a parent
    const { data: ownCompany } = await supabase
      .from("companies")
      .select("id, parent_company_id")
      .eq("id", companyId)
      .single();

    const parentId = ownCompany?.parent_company_id || companyId;

    // Get all children of the root
    const { data: children } = await supabase
      .from("companies")
      .select("id")
      .eq("parent_company_id", parentId);

    const ids = [parentId];
    if (children) {
      ids.push(...children.map(c => c.id));
    }
    return [...new Set(ids)];
  };

  const fetchAvailablePersonnel = async () => {
    if (!companyId) return;

    const visibleIds = await getHierarchyCompanyIds();
    if (visibleIds.length === 0) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, tittel, company_id, companies:company_id(id, navn)")
      .eq("approved", true)
      .in("company_id", visibleIds)
      .order("full_name");

    if (error) {
      console.error("Error fetching personnel:", error);
      return;
    }

    const availablePersonnel = (data || [])
      .filter((p) => !existingPersonnelIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        tittel: p.tittel,
        company_id: p.company_id,
        company_navn: (p.companies as any)?.navn || null,
      }));
    setPersonnel(availablePersonnel);
  };

  const checkVisibilityAndAdd = async (person: Person) => {
    if (!droneId || !person.company_id) return;

    // If person is in the same company as the drone, just add directly
    if (person.company_id === droneCompanyId) {
      await doAddPersonnel(person.id);
      return;
    }

    // Check if drone is already visible to person's company
    const { data: existing } = await (supabase as any)
      .from("drone_department_visibility")
      .select("id")
      .eq("drone_id", droneId)
      .eq("company_id", person.company_id);

    if (existing && existing.length > 0) {
      // Already visible, just add
      await doAddPersonnel(person.id);
      return;
    }

    // Show visibility prompt
    setVisibilityPrompt({ person });
  };

  const doAddPersonnel = async (personId: string) => {
    if (!droneId) return;

    setAddingId(personId);
    try {
      const { error } = await (supabase as any)
        .from("drone_personnel")
        .insert({
          drone_id: droneId,
          profile_id: personId,
        });

      if (error) throw error;

      toast.success("Personell lagt til");
      onPersonnelAdded();

      // Remove from local list
      setPersonnel((prev) => prev.filter((p) => p.id !== personId));
    } catch (error: any) {
      console.error("Error adding personnel:", error);
      toast.error(`Kunne ikke legge til personell: ${error.message}`);
    } finally {
      setAddingId(null);
    }
  };

  const handleVisibilityConfirm = async () => {
    if (!visibilityPrompt) return;
    const { person } = visibilityPrompt;
    setVisibilityPrompt(null);

    // Insert visibility record
    try {
      await (supabase as any).from("drone_department_visibility").insert({
        drone_id: droneId,
        company_id: person.company_id,
      });
      onVisibilityChanged?.();
    } catch (err: any) {
      console.error("Error updating visibility:", err);
    }

    await doAddPersonnel(person.id);
  };

  const handleVisibilityDecline = async () => {
    if (!visibilityPrompt) return;
    const personId = visibilityPrompt.person.id;
    setVisibilityPrompt(null);
    await doAddPersonnel(personId);
  };

  const filteredPersonnel = personnel.filter((p) =>
    p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.tittel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.company_navn?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Legg til personell
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Søk etter personell..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[300px]">
            {filteredPersonnel.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <User className="w-12 h-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchTerm ? "Ingen treff" : "Ingen tilgjengelig personell"}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {filteredPersonnel.map((person) => (
                  <div
                    key={person.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-card border border-border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base truncate">{person.full_name || "Ukjent"}</p>
                        {person.company_id !== droneCompanyId && person.company_navn && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {person.company_navn}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-muted-foreground">
                        {person.tittel && <span>{person.tittel}</span>}
                        {person.email && person.tittel && <span className="hidden sm:inline">•</span>}
                        {person.email && <span className="truncate max-w-[180px] sm:max-w-none">{person.email}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => checkVisibilityAndAdd(person)}
                      disabled={addingId === person.id}
                      className="gap-1 w-full sm:w-auto shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      {addingId === person.id ? "..." : "Legg til"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Lukk
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!visibilityPrompt} onOpenChange={(o) => { if (!o) setVisibilityPrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gjøre dronen synlig?</AlertDialogTitle>
            <AlertDialogDescription>
              {visibilityPrompt?.person.company_navn
                ? `Ønsker du å gjøre dronen synlig for ${visibilityPrompt.person.company_navn}? Personellet du legger til tilhører en annen avdeling enn dronen.`
                : "Ønsker du å gjøre dronen synlig for denne avdelingen?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleVisibilityDecline}>
              Nei, bare legg til
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleVisibilityConfirm}>
              Ja, gjør synlig
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
