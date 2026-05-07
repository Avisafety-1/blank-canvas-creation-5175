import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Document, DocumentCategory } from "@/pages/Documents";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Upload, Trash2, Plus, ChevronUp, ChevronDown, Building2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  text: string;
}

interface DocumentCardModalProps {
  document: (Document & { versjon?: string; fil_navn?: string }) | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  onDeleteSuccess: () => void;
  isAdmin: boolean;
  isCreating: boolean;
  isOwnerCompany?: boolean;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "regelverk", label: "Regelverk" },
  { value: "prosedyrer", label: "Prosedyrer" },
  { value: "sjekklister", label: "Sjekklister" },
  { value: "rapporter", label: "Rapporter" },
  { value: "nettsider", label: "Nettsider" },
  { value: "oppdrag", label: "Oppdrag" },
  { value: "loggbok", label: "Loggbok" },
  { value: "kml-kmz", label: "KML/KMZ" },
  { value: "dokumentstyring", label: "Dokumentstyring" },
  { value: "risikovurderinger", label: "Risikovurderinger" },
  { value: "operasjonsmanual", label: "Operasjonsmanual" },
  { value: "annet", label: "Annet" },
];

const formSchema = z.object({
  tittel: z.string().min(1, "Tittel er påkrevd").max(200, "Tittel må være under 200 tegn"),
  beskrivelse: z.string().max(1000, "Beskrivelse må være under 1000 tegn").optional(),
  kategori: z.enum(["regelverk", "prosedyrer", "sjekklister", "rapporter", "nettsider", "oppdrag", "loggbok", "kml-kmz", "dokumentstyring", "risikovurderinger", "operasjonsmanual", "annet"]),
  gyldig_til: z.date().optional(),
  varsel_dager_for_utløp: z.coerce.number().int().min(0).max(365).optional(),
  nettside_url: z.string().max(500, "URL må være under 500 tegn").optional(),
});

type FormData = z.infer<typeof formSchema>;

const DocumentCardModal = ({
  document,
  isOpen,
  onClose,
  onSaveSuccess,
  onDeleteSuccess,
  isAdmin,
  isCreating,
  isOwnerCompany = true,
}: DocumentCardModalProps) => {
  const { companyId, isSuperAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [isParentCompany, setIsParentCompany] = useState(false);
  const [visibleToChildren, setVisibleToChildren] = useState(false);

  // Detect if current company is a parent company
  useEffect(() => {
    if (!companyId || !isOpen) return;
    const check = async () => {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('parent_company_id', companyId)
        .limit(1);
      setIsParentCompany((data?.length ?? 0) > 0);
    };
    check();
  }, [companyId, isOpen]);

  // Sync visibleToChildren state with document
  useEffect(() => {
    if (isOpen) {
      if (document) {
        setVisibleToChildren(!!(document as any).visible_to_children);
      } else if (isCreating) {
        setVisibleToChildren(false);
      }
    }
  }, [document, isOpen, isCreating]);

  // Parse checklist JSON when document loads
  useEffect(() => {
    if (document && isOpen && document.kategori === "sjekklister" && document.beskrivelse) {
      try {
        const parsed = JSON.parse(document.beskrivelse);
        if (Array.isArray(parsed)) {
          setChecklistItems(parsed);
        }
      } catch {
        // Not valid JSON, keep empty
        setChecklistItems([]);
      }
    } else if (isOpen) {
      setChecklistItems([]);
    }
  }, [document, isOpen]);

  const handleAddChecklistItem = () => {
    setChecklistItems(prev => [...prev, { id: crypto.randomUUID(), text: "" }]);
  };

  const handleMoveChecklistItem = (id: string, direction: 'up' | 'down') => {
    setChecklistItems(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
  };

  const handleChecklistItemChange = (id: string, text: string) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === id ? { ...item, text } : item
    ));
  };

  const openUrl = (url: string) => {
    let finalUrl = url;
    if (!url.match(/^https?:\/\//i)) {
      finalUrl = `https://${url}`;
    }
    window.open(finalUrl, "_blank");
  };

  const handleOpenFile = async (filUrl: string) => {
    try {
      // Check if it's an external URL
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        window.open(filUrl, '_blank');
        return;
      }
      
      // It's a storage path - generate signed URL
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filUrl, 3600); // Valid for 1 hour

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      toast.error('Du har tilgang til dokumentkortet, men filtilgangen mangler. Kontakt administrator.');
    }
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tittel: "",
      beskrivelse: "",
      kategori: "annet",
      varsel_dager_for_utløp: 30,
      nettside_url: "",
    },
  });

  useEffect(() => {
    if (document && isOpen) {
      form.reset({
        tittel: document.tittel,
        beskrivelse: document.beskrivelse || "",
        kategori: document.kategori as DocumentCategory,
        gyldig_til: document.gyldig_til ? new Date(document.gyldig_til) : undefined,
        varsel_dager_for_utløp: document.varsel_dager_for_utløp || undefined,
        nettside_url: document.nettside_url || "",
      });
    } else if (isCreating && isOpen) {
      form.reset({
        tittel: "",
        beskrivelse: "",
        kategori: "annet",
        varsel_dager_for_utløp: 30,
        nettside_url: "",
      });
      setSelectedFile(null);
    }
  }, [document, isOpen, isCreating, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    return filePath;
  };

  // Helper function to increment version number
  const incrementVersion = (currentVersion: string): string => {
    const parts = currentVersion.split('.');
    if (parts.length === 2) {
      const major = parseInt(parts[0]) || 1;
      const minor = parseInt(parts[1]) || 0;
      return `${major}.${minor + 1}`;
    }
    return "1.1"; // Default increment if format is unexpected
  };

  const onSubmit = async (data: FormData) => {
    if (!canManageDocument || !companyId) return;

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      let fileUrl = document?.fil_url || null;
      let fileName = document?.fil_navn || null;
      
      // Track if we're uploading a new file to an existing document (triggers version increment)
      const isUpdatingFile = !isCreating && document && selectedFile;

      if (selectedFile) {
        fileUrl = await uploadFile(selectedFile);
        fileName = selectedFile.name;
      }

      // For checklists, convert items array back to JSON
      let beskrivelse = data.beskrivelse || null;
      if (data.kategori === "sjekklister") {
        const validItems = checklistItems.filter(item => item.text.trim() !== "");
        beskrivelse = validItems.length > 0 ? JSON.stringify(validItems) : null;
      }

      // Calculate new version if updating document with new file
      let newVersion = document?.versjon || "1.0";
      if (isUpdatingFile) {
        const currentVersion = document?.versjon || "1.0";
        newVersion = incrementVersion(currentVersion);
      }

      const documentData = {
        tittel: data.tittel,
        beskrivelse,
        kategori: data.kategori,
        gyldig_til: data.gyldig_til ? data.gyldig_til.toISOString() : null,
        varsel_dager_for_utløp: data.varsel_dager_for_utløp || null,
        nettside_url: data.nettside_url || null,
        fil_url: fileUrl,
        fil_navn: fileName,
        company_id: companyId,
        opprettet_av: userData.user?.email || null,
        versjon: isCreating ? "1.0" : newVersion,
        oppdatert_dato: new Date().toISOString(),
        visible_to_children: isParentCompany ? visibleToChildren : false,
      };

      if (isCreating) {
        const { error } = await supabase.from("documents").insert(documentData);
        if (error) throw error;
      } else if (document) {
        const { error } = await supabase
          .from("documents")
          .update(documentData)
          .eq("id", document.id);
        if (error) throw error;
        
        // Show version update message if file was updated
        if (isUpdatingFile) {
          toast.success(`Dokument oppdatert til versjon ${newVersion}`);
        }
      }

      onSaveSuccess();
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Kunne ikke lagre dokumentet");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!document || !canManageDocument) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase.from("documents").delete().eq("id", document.id);
      if (error) throw error;
      onDeleteSuccess();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Kunne ikke slette dokumentet");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const canManageDocument = isAdmin && (isCreating || isOwnerCompany || isSuperAdmin);
  const readOnly = !canManageDocument;
  const isSharedDocument = !!document && !isCreating && !isOwnerCompany && !isSuperAdmin;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "Nytt dokument" : readOnly ? "Dokument" : "Rediger dokument"}
            </DialogTitle>
            {document && !isCreating && (
              <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4">
                {document.opprettet_av && <span>Opprettet av: {document.opprettet_av}</span>}
                {document.opprettet_dato && <span>Opprettet: {format(new Date(document.opprettet_dato), "dd.MM.yyyy", { locale: nb })}</span>}
              </div>
            )}
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {isSharedDocument && (
                <Alert>
                  <Building2 className="h-4 w-4" />
                  <AlertDescription>
                    Dette dokumentet er delt fra {(document as any).company_name || "et annet selskap"} og kan ikke endres eller slettes her.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="kategori"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={readOnly}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Velg kategori" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tittel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tittel *</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={readOnly} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="beskrivelse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch("kategori") === "sjekklister" ? "Sjekkliste-punkter" : "Beskrivelse"}
                    </FormLabel>
                    <FormControl>
                      {form.watch("kategori") === "sjekklister" ? (
                        <div className="space-y-2">
                          {checklistItems.map((item, index) => (
                            <div key={item.id} className="flex items-center gap-1.5">
                              {!readOnly && (
                                <div className="flex flex-col flex-shrink-0">
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveChecklistItem(item.id, 'up')} disabled={index === 0}>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveChecklistItem(item.id, 'down')} disabled={index === checklistItems.length - 1}>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                              <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                              <Input
                                value={item.text}
                                onChange={(e) => handleChecklistItemChange(item.id, e.target.value)}
                                placeholder="Skriv inn sjekkpunkt..."
                                disabled={readOnly}
                                className="flex-1"
                              />
                              {!readOnly && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveChecklistItem(item.id)}
                                  className="flex-shrink-0 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {checklistItems.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              Ingen sjekkpunkter lagt til ennå.
                            </p>
                          )}
                          {!readOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddChecklistItem}
                              className="mt-2"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Legg til punkt
                            </Button>
                          )}
                        </div>
                      ) : readOnly && field.value ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap p-3 rounded-md border bg-muted/50">{field.value}</p>
                      ) : (
                        <Textarea {...field} rows={4} disabled={readOnly} placeholder="Legg til beskrivelse..." />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gyldig_til"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Utløpsdato</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={readOnly}
                          >
                            {field.value ? (
                              format(field.value, "dd.MM.yyyy", { locale: nb })
                            ) : (
                              <span>Velg dato</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="varsel_dager_for_utløp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Varsling (antall dager før utløp)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ""}
                        disabled={readOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nettside_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nettside URL</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={readOnly} placeholder="https://..." />
                    </FormControl>
                    {!readOnly && document?.nettside_url && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Eksisterende URL:</span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => openUrl(document.nettside_url!)}
                        >
                          Åpne eksisterende URL
                        </Button>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!readOnly && (
                <div className="space-y-2">
                  <FormLabel>
                    {isCreating ? "Opplasting av dokument" : "Oppdater dokument"}
                  </FormLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                      className="flex-1"
                    />
                    {selectedFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setSelectedFile(null)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {!isCreating && selectedFile && document?.versjon && (
                    <p className="text-sm text-muted-foreground">
                      Ved lagring økes versjon fra {document.versjon} til {(() => {
                        const parts = document.versjon.split('.');
                        if (parts.length === 2) {
                          const major = parseInt(parts[0]) || 1;
                          const minor = parseInt(parts[1]) || 0;
                          return `${major}.${minor + 1}`;
                        }
                        return "1.1";
                      })()}
                    </p>
                  )}
                  {document?.fil_url && !selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Eksisterende fil ({document.fil_navn || "fil"}):</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => handleOpenFile(document.fil_url!)}
                      >
                        Åpne eksisterende fil
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {document?.fil_url && readOnly && (
                <div className="space-y-2">
                  <FormLabel>Dokument</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenFile(document.fil_url!)}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Åpne dokument
                  </Button>
                </div>
              )}

              {document?.nettside_url && readOnly && (
                <div className="space-y-2">
                  <FormLabel>Nettside</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openUrl(document.nettside_url!)}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Åpne nettside
                  </Button>
                </div>
              )}

              {!readOnly && isParentCompany && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label htmlFor="edit-visible-children-doc">Synlig for alle avdelinger</Label>
                      <p className="text-xs text-muted-foreground">
                        Deles automatisk med alle underavdelinger
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="edit-visible-children-doc"
                    checked={visibleToChildren}
                    onCheckedChange={setVisibleToChildren}
                  />
                </div>
              )}

              <DialogFooter className="gap-2">
                {canManageDocument && !isCreating && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Slett
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>
                  {readOnly ? "Lukk" : "Avbryt"}
                </Button>
                {canManageDocument && (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Lagrer..." : "Lagre"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette dette dokumentet? Denne handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Sletter..." : "Slett"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DocumentCardModal;
