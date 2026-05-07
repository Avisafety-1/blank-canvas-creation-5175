import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Pencil, Trash2, Book, Paperclip, Upload, X, FileText, ExternalLink, GraduationCap, Bell } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { FlightLogbookDialog } from "@/components/FlightLogbookDialog";
import { AttachmentPickerDialog } from "@/components/admin/AttachmentPickerDialog";
import { TakeCourseDialog } from "@/components/training/TakeCourseDialog";

interface Competency {
  id: string;
  navn: string;
  type: string;
  beskrivelse: string | null;
  utstedt_dato: string | null;
  utloper_dato: string | null;
  påvirker_status?: boolean;
  fil_url?: string | null;
  varsel_dager?: number | null;
}

interface Person {
  id: string;
  full_name: string;
  personnel_competencies?: Competency[];
  is_technical_responsible?: boolean;
}

interface PersonCompetencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person | null;
  onCompetencyUpdated: () => void;
}

export function PersonCompetencyDialog({
  open,
  onOpenChange,
  person: initialPerson,
  onCompetencyUpdated,
}: PersonCompetencyDialogProps) {
  const { companyId, isAdmin } = useAuth();
  const [person, setPerson] = useState<Person | null>(initialPerson);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [competencyToDelete, setCompetencyToDelete] = useState<string | null>(null);
  const [logbookDialogOpen, setLogbookDialogOpen] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [takeCourseAssignmentId, setTakeCourseAssignmentId] = useState<string | null>(null);
  
  // New competency form state
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIssueDate, setNewIssueDate] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newAffectsStatus, setNewAffectsStatus] = useState(true);
  const [newWarningDays, setNewWarningDays] = useState<number>(30);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newDocumentUrl, setNewDocumentUrl] = useState<string | null>(null);
  const [newDocPickerOpen, setNewDocPickerOpen] = useState(false);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Edit competency form state
  const [editType, setEditType] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editAffectsStatus, setEditAffectsStatus] = useState(true);
  const [editWarningDays, setEditWarningDays] = useState<number>(30);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editDocumentUrl, setEditDocumentUrl] = useState<string | null>(null);
  const [editExistingFilUrl, setEditExistingFilUrl] = useState<string | null>(null);
  const [editDocPickerOpen, setEditDocPickerOpen] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Update local person state when prop changes
  useEffect(() => {
    setPerson(initialPerson);
  }, [initialPerson]);

  // Fetch available courses for this person
  useEffect(() => {
    if (!person?.id || !open) { setAvailableCourses([]); return; }
    const fetchCourses = async () => {
      try {
        // Get courses available to all
        const { data: allCourses } = await supabase
          .from("training_courses")
          .select("id, title, description, passing_score, validity_months")
          .eq("status", "published")
          .eq("available_to_all", true);

        // Get assigned courses for this person (not completed)
        const { data: assignments } = await supabase
          .from("training_assignments")
          .select("id, course_id, completed_at, passed, training_courses(id, title, description, passing_score, validity_months)")
          .eq("profile_id", person.id);

        // Get completed & passed course IDs (not expired)
        const passedCourseIds = new Set<string>();
        (assignments || []).forEach((a: any) => {
          if (a.passed && a.completed_at) {
            const course = a.training_courses;
            if (course?.validity_months) {
              const completedAt = new Date(a.completed_at);
              const expiresAt = new Date(completedAt.getFullYear(), completedAt.getMonth() + course.validity_months, completedAt.getDate());
              if (expiresAt > new Date()) passedCourseIds.add(a.course_id);
            } else {
              passedCourseIds.add(a.course_id);
            }
          }
        });

        // Pending assigned courses (not completed)
        const pendingAssigned = (assignments || [])
          .filter((a: any) => !a.completed_at && a.training_courses)
          .map((a: any) => ({ ...a.training_courses, assignmentId: a.id }));

        // Available-to-all courses not yet passed
        const availableAll = (allCourses || [])
          .filter((c: any) => !passedCourseIds.has(c.id))
          .map((c: any) => ({ ...c, assignmentId: null }));

        // Merge (avoid duplicates)
        const seenIds = new Set<string>();
        const merged: any[] = [];
        for (const c of [...pendingAssigned, ...availableAll]) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            merged.push(c);
          }
        }
        setAvailableCourses(merged);
      } catch (err) {
        console.error("Error fetching available courses:", err);
      }
    };
    fetchCourses();
  }, [person?.id, open]);

  // Real-time subscription for competency updates
  useEffect(() => {
    if (!person?.id || !open) return;

    const channel = supabase
      .channel(`person-competencies-${person.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel_competencies',
          filter: `profile_id=eq.${person.id}`,
        },
        async () => {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, personnel_competencies(*)')
            .eq('id', person.id)
            .single();
          
          if (data) {
            setPerson(data as Person);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [person?.id, open]);

  const uploadFile = async (file: File, competencyId: string): Promise<string | null> => {
    if (!companyId) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${companyId}/competency-${competencyId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('logbook-images').upload(filePath, file);
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    return filePath;
  };

  const getFileDisplayUrl = async (filUrl: string): Promise<string> => {
    if (filUrl.startsWith('http')) return filUrl;
    // Files uploaded directly for competencies go to logbook-images (now private, needs signed URL)
    if (filUrl.includes('/competency-')) {
      const { data, error: signError } = await supabase.storage.from('logbook-images').createSignedUrl(filUrl, 3600);
      if (signError) console.error('Signed URL error:', signError);
      return data?.signedUrl || '';
    }
    // Files from /dokumenter go to documents bucket (private, needs signed URL)
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(filUrl, 3600);
    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error);
      return '';
    }
    return data.signedUrl;
  };

  const handleAddCompetency = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newType || !newName || !person) {
      toast({
        title: "Feil",
        description: "Type og navn er påkrevd",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase.from("personnel_competencies").insert({
      profile_id: person.id,
      type: newType,
      navn: newName,
      beskrivelse: newDescription || null,
      utstedt_dato: newIssueDate || null,
      utloper_dato: newExpiryDate || null,
      påvirker_status: newAffectsStatus,
      varsel_dager: newWarningDays,
    } as any).select('id').single();

    if (error) {
      console.error("Error adding competency:", error);
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast({ title: "Ingen tillatelse", description: "Du har ikke tillatelse til å legge til kompetanse for denne personen", variant: "destructive" });
      } else {
        toast({ title: "Feil", description: error.message || "Kunne ikke legge til kompetanse", variant: "destructive" });
      }
      return;
    }

    // Upload file if selected
    let filUrl: string | null = newDocumentUrl;
    if (newFile && data?.id) {
      filUrl = await uploadFile(newFile, data.id);
    }
    if (filUrl && data?.id) {
      await (supabase as any).from("personnel_competencies").update({ fil_url: filUrl }).eq("id", data.id);
    }

    toast({ title: "Suksess", description: "Kompetanse lagt til" });

    // Reset form
    setNewType("");
    setNewName("");
    setNewDescription("");
    setNewIssueDate("");
    setNewExpiryDate("");
    setNewAffectsStatus(true);
    setNewWarningDays(30);
    setNewFile(null);
    setNewDocumentUrl(null);
    if (newFileInputRef.current) newFileInputRef.current.value = '';
    
    onCompetencyUpdated();
  };

  const handleStartEdit = (competency: Competency) => {
    setEditingId(competency.id);
    setEditType(competency.type);
    setEditName(competency.navn);
    setEditDescription(competency.beskrivelse || "");
    setEditIssueDate(competency.utstedt_dato || "");
    setEditExpiryDate(competency.utloper_dato || "");
    setEditAffectsStatus(competency.påvirker_status !== false);
    setEditWarningDays(competency.varsel_dager ?? 30);
    setEditExistingFilUrl(competency.fil_url || null);
    setEditFile(null);
    setEditDocumentUrl(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditType("");
    setEditName("");
    setEditDescription("");
    setEditIssueDate("");
    setEditExpiryDate("");
    setEditAffectsStatus(true);
    setEditWarningDays(30);
    setEditFile(null);
    setEditDocumentUrl(null);
    setEditExistingFilUrl(null);
  };

  const handleUpdateCompetency = async (competencyId: string) => {
    if (!editType || !editName) {
      toast({ title: "Feil", description: "Type og navn er påkrevd", variant: "destructive" });
      return;
    }

    let filUrl: string | null | undefined = editExistingFilUrl;
    
    // Upload new file if selected
    if (editFile) {
      filUrl = await uploadFile(editFile, competencyId);
    } else if (editDocumentUrl) {
      filUrl = editDocumentUrl;
    }

    const { error } = await (supabase as any)
      .from("personnel_competencies")
      .update({
        type: editType,
        navn: editName,
        beskrivelse: editDescription || null,
        utstedt_dato: editIssueDate || null,
        utloper_dato: editExpiryDate || null,
        påvirker_status: editAffectsStatus,
        varsel_dager: editWarningDays,
        fil_url: filUrl,
      })
      .eq("id", competencyId);

    if (error) {
      toast({ title: "Feil", description: "Kunne ikke oppdatere kompetanse", variant: "destructive" });
      return;
    }

    toast({ title: "Suksess", description: "Kompetanse oppdatert" });
    setEditingId(null);
    onCompetencyUpdated();
  };

  const handleDeleteClick = (competencyId: string) => {
    setCompetencyToDelete(competencyId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!competencyToDelete) return;

    // Find the competency to check for file
    const comp = person?.personnel_competencies?.find(c => c.id === competencyToDelete);
    if (comp?.fil_url && comp.fil_url.includes('/competency-')) {
      await supabase.storage.from('logbook-images').remove([comp.fil_url]);
    }

    const { error } = await supabase
      .from("personnel_competencies")
      .delete()
      .eq("id", competencyToDelete);

    if (error) {
      toast({ title: "Feil", description: "Kunne ikke slette kompetanse", variant: "destructive" });
      return;
    }

    toast({ title: "Suksess", description: "Kompetanse slettet" });
    setDeleteDialogOpen(false);
    setCompetencyToDelete(null);
    onCompetencyUpdated();
  };

  const renderFileInput = (
    file: File | null,
    docUrl: string | null,
    existingFilUrl: string | null | undefined,
    onFileChange: (f: File | null) => void,
    onDocUrlChange: (url: string | null) => void,
    onExistingRemove: (() => void) | null,
    inputRef: React.RefObject<HTMLInputElement>,
    onOpenDocPicker: () => void,
  ) => {
    const hasAttachment = file || docUrl || existingFilUrl;
    return (
      <div className="space-y-2">
        <Label className="text-xs">Vedlegg (sertifikat/kompetansebevis)</Label>
        {hasAttachment ? (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs truncate flex-1">
              {file ? file.name : docUrl ? "Dokument fra /dokumenter" : "Vedlegg"}
            </span>
            {(existingFilUrl && !file && !docUrl) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={async () => {
                  const url = await getFileDisplayUrl(existingFilUrl);
                  if (url) window.open(url, '_blank');
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                onFileChange(null);
                onDocUrlChange(null);
                if (onExistingRemove) onExistingRemove();
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              Last opp
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onOpenDocPicker}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              Dokumenter
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (f) {
                  onFileChange(f);
                  onDocUrlChange(null);
                }
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const handleTakeCourse = async (course: any) => {
    if (course.assignmentId) {
      setTakeCourseAssignmentId(course.assignmentId);
      return;
    }
    // Create assignment on-the-fly for available_to_all course
    if (!person) return;
    try {
      const { data, error } = await supabase
        .from("training_assignments")
        .insert({
          course_id: course.id,
          profile_id: person.id,
          company_id: companyId,
        })
        .select("id")
        .single();
      if (error) throw error;
      setTakeCourseAssignmentId(data.id);
    } catch (err) {
      console.error("Error creating assignment:", err);
      toast({ title: "Feil", description: "Kunne ikke starte kurset", variant: "destructive" });
    }
  };

  if (!person) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] p-3 sm:p-6 overflow-hidden box-border">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-base sm:text-lg pr-8">{person.full_name}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogbookDialogOpen(true)}
              className="gap-2 w-full sm:w-auto"
            >
              <Book className="w-4 h-4" />
              Loggbok
            </Button>
          </DialogHeader>

          <ScrollArea className="h-[calc(90vh-10rem)] sm:h-[calc(90vh-8rem)] w-full max-w-full">
            <div className="pr-3 sm:pr-4 max-w-full overflow-hidden">


            {/* Existing Competencies */}
            <div className="space-y-3 mb-6 min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground">Kompetanser</h3>
              
              {(person.personnel_competencies || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen kompetanser registrert</p>
              ) : (
                (person.personnel_competencies || []).map((competency) => (
                  <div key={competency.id} className="border rounded-lg p-2.5 sm:p-4 space-y-2 bg-card min-w-0">
                    {editingId === competency.id ? (
                      // Edit mode
                      <div className="space-y-3">
                        <div>
                          <Label>Type</Label>
                          <Select value={editType} onValueChange={setEditType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Kurs">Kurs</SelectItem>
                              <SelectItem value="Sertifikat">Sertifikat</SelectItem>
                              <SelectItem value="Lisens">Lisens</SelectItem>
                              <SelectItem value="Utdanning">Utdanning</SelectItem>
                              <SelectItem value="Godkjenning">Godkjenning</SelectItem>
                              <SelectItem value="Kompetanse">Kompetanse</SelectItem>
                              <SelectItem value="Annet">Annet</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Navn</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Beskrivelse</Label>
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Utstedt</Label>
                            <Input
                              type="date"
                              value={editIssueDate}
                              onChange={(e) => setEditIssueDate(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Utløper</Label>
                            <Input
                              type="date"
                              value={editExpiryDate}
                              onChange={(e) => setEditExpiryDate(e.target.value)}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Bell className="h-3 w-3" />
                            Varsle (dager før utløp)
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={editWarningDays}
                            onChange={(e) => setEditWarningDays(Number(e.target.value) || 30)}
                            placeholder="30"
                            className="h-9"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Gul status og e-postvarsel utløses {editWarningDays} dager før utløp.
                          </p>
                        </div>
                        {renderFileInput(
                          editFile,
                          editDocumentUrl,
                          editExistingFilUrl,
                          setEditFile,
                          setEditDocumentUrl,
                          () => setEditExistingFilUrl(null),
                          editFileInputRef,
                          () => setEditDocPickerOpen(true),
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          <Switch
                            id={`edit-affects-status-${competency.id}`}
                            checked={editAffectsStatus}
                            onCheckedChange={setEditAffectsStatus}
                          />
                          <Label htmlFor={`edit-affects-status-${competency.id}`} className="text-xs">
                            Påvirker status
                          </Label>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            onClick={() => handleUpdateCompetency(competency.id)}
                            size="sm"
                          >
                            Lagre
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="outline"
                            size="sm"
                          >
                            Avbryt
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div className="flex items-start justify-between gap-1 min-w-0">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm sm:text-base break-words">{competency.navn}</h4>
                            <span className="text-xs text-muted-foreground">{competency.type}</span>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button
                              onClick={() => handleStartEdit(competency)}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 sm:h-8 sm:w-8"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteClick(competency.id)}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 sm:h-8 sm:w-8"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {competency.beskrivelse && (
                          <p className="text-xs sm:text-sm text-muted-foreground break-words">{competency.beskrivelse}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {competency.utstedt_dato && (
                            <span>Utstedt: {format(new Date(competency.utstedt_dato), "dd.MM.yy", { locale: nb })}</span>
                          )}
                          {competency.utloper_dato && (
                            <span className={new Date(competency.utloper_dato) < new Date() ? "text-destructive" : ""}>
                              Utløper: {format(new Date(competency.utloper_dato), "dd.MM.yy", { locale: nb })}
                            </span>
                          )}
                        </div>
                        {competency.utloper_dato && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Bell className="h-3 w-3" />
                            Gul varsling sendes {competency.varsel_dager ?? 30} dager før utløp
                          </p>
                        )}
                        {competency.fil_url && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 mt-2 text-xs"
                            onClick={async () => {
                              const url = await getFileDisplayUrl(competency.fil_url!);
                              if (url) window.open(url, '_blank');
                            }}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Vis vedlegg
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                          <Switch
                            id={`affects-status-${competency.id}`}
                            checked={competency.påvirker_status !== false}
                            onCheckedChange={async (checked) => {
                              setPerson(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  personnel_competencies: (prev.personnel_competencies || []).map(c =>
                                    c.id === competency.id ? { ...c, påvirker_status: checked } : c
                                  ),
                                };
                              });

                              const { error } = await supabase
                                .from("personnel_competencies")
                                .update({ påvirker_status: checked })
                                .eq("id", competency.id);
                              if (error) {
                                setPerson(prev => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    personnel_competencies: (prev.personnel_competencies || []).map(c =>
                                      c.id === competency.id ? { ...c, påvirker_status: !checked } : c
                                    ),
                                  };
                                });
                                toast({
                                  title: "Feil",
                                  description: "Kunne ikke oppdatere innstilling",
                                  variant: "destructive",
                                });
                              } else {
                                onCompetencyUpdated();
                              }
                            }}
                          />
                          <Label htmlFor={`affects-status-${competency.id}`} className="text-xs text-muted-foreground">
                            Påvirker status
                          </Label>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Available Courses */}
            {availableCourses.length > 0 && (
              <div className="space-y-3 mb-6 min-w-0">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Tilgjengelige kurs
                </h3>
                {availableCourses.map((course) => (
                  <div key={course.id} className="border rounded-lg p-3 bg-card flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{course.title}</p>
                      {course.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{course.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bestått: {course.passing_score}% · {course.validity_months ? `Gyldig ${course.validity_months} mnd` : "Permanent"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handleTakeCourse(course)}>
                      Ta kurs
                    </Button>
                  </div>
                ))}
              </div>
            )}


            <div className="border-t pt-4 mt-4 min-w-0 overflow-hidden">
              <h3 className="text-sm font-semibold mb-3">Legg til kompetanse</h3>
              <form onSubmit={handleAddCompetency} className="space-y-3 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="new-type" className="text-xs">Type *</Label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger id="new-type" className="h-9">
                        <SelectValue placeholder="Velg type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kurs">Kurs</SelectItem>
                        <SelectItem value="Sertifikat">Sertifikat</SelectItem>
                        <SelectItem value="Lisens">Lisens</SelectItem>
                        <SelectItem value="Utdanning">Utdanning</SelectItem>
                        <SelectItem value="Godkjenning">Godkjenning</SelectItem>
                        <SelectItem value="Kompetanse">Kompetanse</SelectItem>
                        <SelectItem value="Annet">Annet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="new-name" className="text-xs">Navn *</Label>
                    {newType === "Kurs" ? (
                      <>
                        <Select
                          value={["STS", "A1/A3", "A2"].includes(newName) ? newName : (newName ? "__custom__" : "")}
                          onValueChange={(v) => setNewName(v === "__custom__" ? "" : v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Velg kurs..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STS">STS</SelectItem>
                            <SelectItem value="A1/A3">A1/A3</SelectItem>
                            <SelectItem value="A2">A2</SelectItem>
                            <SelectItem value="__custom__">Annet (skriv inn)...</SelectItem>
                          </SelectContent>
                        </Select>
                        {!["STS", "A1/A3", "A2"].includes(newName) && (
                          <Input
                            id="new-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Skriv inn kursnavn"
                            className="h-9 mt-2"
                          />
                        )}
                      </>
                    ) : (
                      <Input
                        id="new-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="F.eks. A3 drone"
                        className="h-9"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="new-description" className="text-xs">Beskrivelse</Label>
                  <Textarea
                    id="new-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Valgfri"
                    className="min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="new-issue-date" className="text-xs">Utstedt</Label>
                    <Input
                      id="new-issue-date"
                      type="date"
                      value={newIssueDate}
                      onChange={(e) => setNewIssueDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="new-expiry-date" className="text-xs">Utløper</Label>
                    <Input
                      id="new-expiry-date"
                      type="date"
                      value={newExpiryDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="new-warning-days" className="text-xs flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Varsle (dager før utløp)
                  </Label>
                  <Input
                    id="new-warning-days"
                    type="number"
                    min={1}
                    max={365}
                    value={newWarningDays}
                    onChange={(e) => setNewWarningDays(Number(e.target.value) || 30)}
                    placeholder="30"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Gul status og e-postvarsel utløses {newWarningDays} dager før utløp.
                  </p>
                </div>

                {renderFileInput(
                  newFile,
                  newDocumentUrl,
                  null,
                  setNewFile,
                  setNewDocumentUrl,
                  null,
                  newFileInputRef,
                  () => setNewDocPickerOpen(true),
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    id="new-affects-status"
                    checked={newAffectsStatus}
                    onCheckedChange={setNewAffectsStatus}
                  />
                  <Label htmlFor="new-affects-status" className="text-xs">
                    Påvirker status
                  </Label>
                </div>

                <Button type="submit" className="w-full h-10">
                  Legg til
                </Button>
              </form>
            </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Denne handlingen kan ikke angres. Kompetansen vil bli permanent slettet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FlightLogbookDialog
        open={logbookDialogOpen}
        onOpenChange={setLogbookDialogOpen}
        personId={person.id}
        personName={person.full_name}
      />

      {/* Document picker dialogs */}
      <AttachmentPickerDialog
        open={newDocPickerOpen}
        onOpenChange={setNewDocPickerOpen}
        selectedDocumentIds={[]}
        onSelect={(docs) => {
          if (docs.length > 0 && docs[0].fil_url) {
            setNewDocumentUrl(docs[0].fil_url);
            setNewFile(null);
          }
        }}
      />
      <AttachmentPickerDialog
        open={editDocPickerOpen}
        onOpenChange={setEditDocPickerOpen}
        selectedDocumentIds={[]}
        onSelect={(docs) => {
          if (docs.length > 0 && docs[0].fil_url) {
            setEditDocumentUrl(docs[0].fil_url);
            setEditFile(null);
            setEditExistingFilUrl(null);
          }
        }}
      />

      {takeCourseAssignmentId && (
        <TakeCourseDialog
          assignmentId={takeCourseAssignmentId}
          open={!!takeCourseAssignmentId}
          onOpenChange={(open) => { if (!open) setTakeCourseAssignmentId(null); }}
          onCompleted={() => {
            setTakeCourseAssignmentId(null);
            onCompetencyUpdated();
          }}
        />
      )}
    </>
  );
}
