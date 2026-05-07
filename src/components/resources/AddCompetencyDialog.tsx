import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Check, ChevronsUpDown, Upload, FileText, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { AttachmentPickerDialog } from "@/components/admin/AttachmentPickerDialog";

interface AddCompetencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompetencyAdded: () => void;
  personnel: any[];
}

export const AddCompetencyDialog = ({ open, onOpenChange, onCompetencyAdded, personnel }: AddCompetencyDialogProps) => {
  const { companyId } = useAuth();
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [personSearchOpen, setPersonSearchOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("Kurs");
  const [navnValue, setNavnValue] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const KURS_PRESETS = ["STS", "A1/A3", "A2"];
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (f: File, competencyId: string): Promise<string | null> => {
    if (!companyId) return null;
    const ext = f.name.split('.').pop() || 'jpg';
    const filePath = `${companyId}/competency-${competencyId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('logbook-images').upload(filePath, f);
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    return filePath;
  };

  const handleAddCompetency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedPersonId) {
      toast.error("Vennligst velg en person");
      return;
    }
    
    const typeValue = formData.get("type") as string;
    const navnValue = formData.get("navn") as string;
    
    if (!typeValue || !navnValue) {
      toast.error("Type og navn er påkrevd");
      return;
    }
    
    const { data, error } = await (supabase as any).from("personnel_competencies").insert([{
      profile_id: selectedPersonId,
      type: typeValue,
      navn: navnValue,
      beskrivelse: (formData.get("beskrivelse") as string) || null,
      utstedt_dato: (formData.get("utstedt_dato") as string) || null,
      utloper_dato: (formData.get("utloper_dato") as string) || null,
    }]).select('id').single();

    if (error) {
      console.error("Error adding competency:", error);
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast.error("Du har ikke tillatelse til å legge til kompetanse for denne personen");
      } else {
        toast.error(`Kunne ikke legge til kompetanse: ${error.message || "Ukjent feil"}`);
      }
    } else {
      // Upload file if selected
      let filUrl: string | null = documentUrl;
      if (file && data?.id) {
        filUrl = await uploadFile(file, data.id);
      }
      if (filUrl && data?.id) {
        await (supabase as any).from("personnel_competencies").update({ fil_url: filUrl }).eq("id", data.id);
      }

      toast.success("Kompetanse lagt til");
      onOpenChange(false);
      setSelectedPersonId("");
      setSelectedType("Kurs");
      setNavnValue("");
      setFile(null);
      setDocumentUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onCompetencyAdded();
      e.currentTarget.reset();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Legg til kompetanse
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Legg til kompetanse/kurs</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompetency} className="space-y-4 px-2">
            <div>
              <Label>Person</Label>
              <Popover open={personSearchOpen} onOpenChange={setPersonSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={personSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedPersonId
                      ? personnel.find((p) => p.id === selectedPersonId)?.full_name || "Velg person..."
                      : "Velg person..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-[9999] bg-popover" align="start">
                  <Command className="bg-popover">
                    <CommandInput placeholder="Søk etter person..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Ingen personer funnet.</CommandEmpty>
                      <CommandGroup>
                        {personnel.map((person) => (
                          <CommandItem
                            key={person.id}
                            value={person.full_name || ""}
                            onSelect={() => {
                              setSelectedPersonId(person.id);
                              setPersonSearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedPersonId === person.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {person.full_name || "Ukjent navn"}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Select name="type" value={selectedType} onValueChange={(v) => { setSelectedType(v); setNavnValue(""); }}>
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
              <Label htmlFor="navn">Navn</Label>
              {selectedType === "Kurs" ? (
                <>
                  <Select
                    value={KURS_PRESETS.includes(navnValue) ? navnValue : (navnValue ? "__custom__" : "")}
                    onValueChange={(v) => setNavnValue(v === "__custom__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg kurs..." />
                    </SelectTrigger>
                    <SelectContent>
                      {KURS_PRESETS.map((k) => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Annet (skriv inn)...</SelectItem>
                    </SelectContent>
                  </Select>
                  {!KURS_PRESETS.includes(navnValue) && (
                    <Input
                      id="navn"
                      name="navn"
                      className="mt-2"
                      placeholder="Skriv inn kursnavn"
                      value={navnValue}
                      onChange={(e) => setNavnValue(e.target.value)}
                      required
                    />
                  )}
                  {KURS_PRESETS.includes(navnValue) && (
                    <input type="hidden" name="navn" value={navnValue} />
                  )}
                </>
              ) : (
                <Input
                  id="navn"
                  name="navn"
                  value={navnValue}
                  onChange={(e) => setNavnValue(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <Label htmlFor="beskrivelse">Beskrivelse</Label>
              <Textarea id="beskrivelse" name="beskrivelse" />
            </div>
            <div>
              <Label htmlFor="utstedt_dato">Utstedt dato</Label>
              <Input id="utstedt_dato" name="utstedt_dato" type="date" />
            </div>
            <div>
              <Label htmlFor="utloper_dato">Utløper dato</Label>
              <Input id="utloper_dato" name="utloper_dato" type="date" />
            </div>

            {/* File attachment section */}
            <div className="space-y-2">
              <Label className="text-xs">Vedlegg (sertifikat/kompetansebevis)</Label>
              {(file || documentUrl) ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate flex-1">
                    {file ? file.name : "Dokument fra /dokumenter"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setFile(null);
                      setDocumentUrl(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
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
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    Last opp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDocPickerOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    Dokumenter
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f) {
                        setFile(f);
                        setDocumentUrl(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <Button type="submit" className="w-full">Legg til kompetanse</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AttachmentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        selectedDocumentIds={[]}
        onSelect={(docs) => {
          if (docs.length > 0 && docs[0].fil_url) {
            setDocumentUrl(docs[0].fil_url);
            setFile(null);
          }
        }}
      />
    </>
  );
};
