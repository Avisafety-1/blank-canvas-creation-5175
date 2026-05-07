import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Book, Plane, MapPin, Clock, Calendar, Plus, FileText, Edit, Trash2, ImagePlus, X, ZoomIn, User, Pencil } from "lucide-react";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { EditFlightLogDialog } from "@/components/EditFlightLogDialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, formatDurationForPdf, addSignatureToPdf, getPdfFontName } from "@/lib/pdfUtils";

interface FlightLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
}

interface FlightLog {
  id: string;
  flight_date: string;
  departure_location: string;
  landing_location: string;
  flight_duration_minutes: number;
  movements: number;
  notes: string | null;
  drone: {
    modell: string;
    serienummer: string;
  } | null;
  mission: {
    tittel: string;
  } | null;
}

interface PersonnelLogEntry {
  id: string;
  entry_date: string;
  entry_type: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  imagePublicUrl?: string;
}

export const FlightLogbookDialog = ({ open, onOpenChange, personId, personName }: FlightLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const queryClient = useQueryClient();
  const [editingFlightLogId, setEditingFlightLogId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [personnelLogs, setPersonnelLogs] = useState<PersonnelLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [profileFlyvetimer, setProfileFlyvetimer] = useState(0);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [showAddHours, setShowAddHours] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (open && personId) {
      fetchFlightLogs();
      fetchProfileData();
      fetchPersonnelLogs();
    }
  }, [open, personId]);

  const fetchProfileData = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("flyvetimer")
      .eq("id", personId)
      .single();
    setProfileFlyvetimer(Number(data?.flyvetimer) || 0);
    
    const { data: signatureData } = await (supabase as any)
      .from("profiles")
      .select("signature_url")
      .eq("id", personId)
      .single();
    setSignatureUrl(signatureData?.signature_url || null);
  };

  const fetchPersonnelLogs = async () => {
    const { data, error } = await (supabase as any)
      .from("personnel_log_entries")
      .select("id, entry_date, entry_type, title, description, image_url")
      .eq("profile_id", personId)
      .order("entry_date", { ascending: false });

    if (error) {
      console.error("Error fetching personnel logs:", error);
      return;
    }

    const entries: PersonnelLogEntry[] = [];
    for (const e of (data || [])) {
      let imagePublicUrl: string | undefined;
      if (e.image_url) {
        const { data: urlData } = await supabase.storage.from("logbook-images").createSignedUrl(e.image_url, 3600);
        imagePublicUrl = urlData?.signedUrl || undefined;
      }
      entries.push({ ...e, imagePublicUrl });
    }
    setPersonnelLogs(entries);
  };

  const handleConfirmAddHours = () => {
    const hours = parseInt(manualHours) || 0;
    const mins = parseInt(manualMinutes) || 0;
    if (hours === 0 && mins === 0) {
      toast.error("Angi timer eller minutter");
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleAddManualHours = async () => {
    const hours = parseInt(manualHours) || 0;
    const mins = parseInt(manualMinutes) || 0;
    const additionalMinutes = hours * 60 + mins;
    const additionalHours = additionalMinutes / 60;
    const newTotal = profileFlyvetimer + additionalHours;
    
    const { error } = await supabase
      .from("profiles")
      .update({ flyvetimer: newTotal })
      .eq("id", personId);

    if (error) {
      toast.error("Kunne ikke legge til flytimer");
      console.error(error);
    } else {
      // Create a logbook entry so it's visible in the log
      const durationLabel = hours > 0 && mins > 0
        ? `${hours} t ${mins} min`
        : hours > 0
          ? `${hours} t`
          : `${mins} min`;

      await (supabase as any)
        .from("personnel_log_entries")
        .insert({
          profile_id: personId,
          company_id: companyId,
          user_id: user?.id,
          entry_date: new Date().toISOString().split('T')[0],
          entry_type: "flytid",
          title: `Manuelt lagt til ${durationLabel} flytid`,
          description: null,
        });

      toast.success("Flytimer lagt til");
      setProfileFlyvetimer(newTotal);
      setManualHours("");
      setManualMinutes("");
      setShowAddHours(false);
      fetchPersonnelLogs();
    }
    setConfirmDialogOpen(false);
  };

  const fetchFlightLogs = async () => {
    setLoading(true);
    try {
      const { data: personnelLogs } = await (supabase as any)
        .from("flight_log_personnel")
        .select("flight_log_id")
        .eq("profile_id", personId);

      if (!personnelLogs || personnelLogs.length === 0) {
        setFlightLogs([]);
        setTotalMinutes(0);
        setLoading(false);
        return;
      }

      const logIds = personnelLogs.map((p: any) => p.flight_log_id);

      const { data: logs } = await (supabase as any)
        .from("flight_logs")
        .select(`
          id,
          flight_date,
          departure_location,
          landing_location,
          flight_duration_minutes,
          movements,
          notes,
          drone:drone_id (
            modell,
            serienummer
          ),
          mission:mission_id (
            tittel
          )
        `)
        .in("id", logIds)
        .order("flight_date", { ascending: false });

      if (logs) {
        setFlightLogs(logs);
        const total = logs.reduce((sum: number, log: FlightLog) => sum + log.flight_duration_minutes, 0);
        setTotalMinutes(total);
      }
    } catch (error) {
      console.error("Error fetching flight logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} t`;
    return `${hours} t ${mins} min`;
  };

  const totalFlytid = totalMinutes + (profileFlyvetimer * 60);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bildet er for stort (maks 10 MB)");
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddEntry = async () => {
    if (!user || !companyId || !newEntry.title.trim()) {
      toast.error("Fyll inn tittel");
      return;
    }
    setIsSavingEntry(true);
    try {
      let entryId = editingEntryId;

      if (editingEntryId) {
        const { error } = await (supabase as any)
          .from("personnel_log_entries")
          .update({
            entry_date: newEntry.entry_date,
            entry_type: newEntry.entry_type,
            title: newEntry.title.trim(),
            description: newEntry.description.trim() || null,
          })
          .eq("id", editingEntryId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("personnel_log_entries")
          .insert({
            profile_id: personId,
            company_id: companyId,
            user_id: user.id,
            entry_date: newEntry.entry_date,
            entry_type: newEntry.entry_type,
            title: newEntry.title.trim(),
            description: newEntry.description.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        entryId = inserted?.id;
      }

      if (imageFile && entryId) {
        const ext = imageFile.name.split('.').pop();
        const filePath = `${companyId}/personnel-${entryId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logbook-images")
          .upload(filePath, imageFile, { contentType: imageFile.type });

        if (uploadError) {
          toast.error("Innlegg lagret, men bilde kunne ikke lastes opp");
        } else {
          await (supabase as any)
            .from("personnel_log_entries")
            .update({ image_url: filePath })
            .eq("id", entryId);
        }
      }

      toast.success(editingEntryId ? "Innlegg oppdatert" : "Innlegg lagt til");
      setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] });
      clearImage();
      setShowAddEntry(false);
      setEditingEntryId(null);
      fetchPersonnelLogs();
    } catch (error: any) {
      console.error("Error saving entry:", error);
      toast.error(`Kunne ikke lagre innlegg: ${error.message}`);
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleEditEntry = (entry: PersonnelLogEntry) => {
    setEditingEntryId(entry.id);
    setNewEntry({
      entry_type: entry.entry_type || "merknad",
      title: entry.title,
      description: entry.description || "",
      entry_date: entry.entry_date.split('T')[0],
    });
    clearImage();
    setShowAddEntry(true);
    setShowAddHours(false);
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("personnel_log_entries")
        .delete()
        .eq("id", entryId);

      if (error) throw error;
      toast.success("Innlegg slettet");
      fetchPersonnelLogs();
    } catch (error: any) {
      toast.error(`Kunne ikke slette: ${error.message}`);
    }
  };

  const handleExportPDF = async () => {
    if (!companyId || !user) {
      toast.error("Mangler bruker- eller bedriftsinformasjon");
      return;
    }

    setExporting(true);
    try {
      const doc = await createPdfDocument();
      
      doc.setFontSize(18);
      doc.text(sanitizeForPdf(`Loggbok - ${personName}`), 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(formatDateForPdf(new Date(), "'Eksportert:' d. MMMM yyyy 'kl.' HH:mm"), 14, 28);
      
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`Total flytid: ${formatDurationForPdf(Math.round(totalFlytid))}`, 14, 40);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Fra loggførte flyturer: ${formatDurationForPdf(totalMinutes)}`, 14, 47);
      if (profileFlyvetimer > 0) {
        doc.text(`Manuelt lagt til: ${formatDurationForPdf(Math.round(profileFlyvetimer * 60))}`, 14, 54);
      }
      
      const tableData = flightLogs.map(log => [
        format(new Date(log.flight_date), "dd.MM.yyyy"),
        sanitizeForPdf(log.departure_location),
        sanitizeForPdf(log.landing_location),
        formatDurationForPdf(log.flight_duration_minutes),
        sanitizeForPdf(log.drone?.modell) || "-",
        sanitizeForPdf(log.mission?.tittel) || "-"
      ]);
      
      autoTable(doc, {
        startY: profileFlyvetimer > 0 ? 62 : 55,
        head: [["Dato", "Avgang", "Landing", "Varighet", "Drone", "Oppdrag"]],
        body: tableData,
        styles: { fontSize: 8, font: getPdfFontName() },
        headStyles: { fillColor: [59, 130, 246], font: getPdfFontName() }
      });

      if (signatureUrl) {
        const finalY = (doc as any).lastAutoTable?.finalY || 150;
        await addSignatureToPdf(doc, signatureUrl, finalY + 20, "Signatur:");
      }
      
      const safeName = sanitizeFilenameForPdf(personName);
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const fileName = `loggbok_${safeName}_${dateStr}.pdf`;
      
      const pdfBlob = doc.output("blob");
      const filePath = `${companyId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBlob, { contentType: "application/pdf", upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { error: docError } = await supabase.from("documents").insert({
        company_id: companyId,
        user_id: user.id,
        tittel: sanitizeForPdf(`Loggbok - ${personName}`),
        kategori: "loggbok",
        fil_navn: fileName,
        fil_url: filePath,
        fil_storrelse: pdfBlob.size,
        beskrivelse: sanitizeForPdf(`Personlig flyloggbok eksportert ${format(new Date(), "d. MMMM yyyy", { locale: nb })}`)
      });
      
      if (docError) throw docError;

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Loggbok eksportert til dokumenter");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Kunne ikke eksportere loggbok");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              Loggbok - {personName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2 pr-1">
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span className="font-medium">Total flytid</span>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {formatDuration(Math.round(totalFlytid))}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground px-1">
              <span>Fra loggførte flyturer: {formatDuration(totalMinutes)}</span>
              {profileFlyvetimer > 0 && (
                <span>Manuelt lagt til: {formatDuration(Math.round(profileFlyvetimer * 60))}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddHours(!showAddHours); setShowAddEntry(false); }}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                Legg til flytimer manuelt
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddEntry(!showAddEntry); setShowAddHours(false); }}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                Legg til logginnlegg
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex-1"
              >
                <FileText className="w-4 h-4 mr-2" />
                {exporting ? "Eksporterer..." : "Eksporter PDF"}
              </Button>
            </div>

            {showAddHours && (
              <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="manual-hours" className="text-xs">Timer</Label>
                    <Input
                      id="manual-hours"
                      type="number"
                      min="0"
                      value={manualHours}
                      onChange={(e) => setManualHours(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="manual-minutes" className="text-xs">Minutter</Label>
                    <Input
                      id="manual-minutes"
                      type="number"
                      min="0"
                      max="59"
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowAddHours(false); setManualHours(""); setManualMinutes(""); }}
                  >
                    Avbryt
                  </Button>
                  <Button size="sm" onClick={handleConfirmAddHours}>
                    Legg til
                  </Button>
                </div>
              </div>
            )}

            {showAddEntry && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={newEntry.entry_type}
                      onValueChange={(v) => setNewEntry(prev => ({ ...prev, entry_type: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merknad">Merknad</SelectItem>
                        <SelectItem value="hendelse">Hendelse</SelectItem>
                        <SelectItem value="reparasjon">Reparasjon</SelectItem>
                        <SelectItem value="annet">Annet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Dato</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={newEntry.entry_date}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, entry_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Tittel *</Label>
                  <Input
                    value={newEntry.title}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Kort beskrivelse"
                  />
                </div>
                <div>
                  <Label>Beskrivelse</Label>
                  <Textarea
                    value={newEntry.description}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Utfyllende detaljer (valgfritt)"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bilde (valgfritt)</Label>
                  {imagePreviewUrl ? (
                    <div className="relative inline-block mt-1">
                      <img
                        src={imagePreviewUrl}
                        alt="Forhåndsvisning"
                        className="h-20 sm:h-24 w-auto rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors w-full"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Last opp bilde
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </div>
                <div className="flex gap-2 sticky bottom-0 bg-muted/30 pt-2 -mx-3 px-3 pb-1">
                  <Button size="sm" onClick={handleAddEntry} disabled={isSavingEntry}>
                    {isSavingEntry ? "Lagrer..." : (editingEntryId ? "Oppdater" : "Lagre")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowAddEntry(false); setEditingEntryId(null); clearImage(); setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] }); }}>Avbryt</Button>
                </div>
              </div>
            )}
          </div>

          <Tabs defaultValue="flyturer" className={cn("mt-2", showAddEntry && "hidden sm:block")}>
            <TabsList className="w-full">
              <TabsTrigger value="flyturer" className="flex-1">Flyturer</TabsTrigger>
              <TabsTrigger value="innlegg" className="flex-1">
                Logginnlegg {personnelLogs.length > 0 && `(${personnelLogs.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="flyturer" className="mt-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-muted-foreground">Laster...</div>
                  </div>
                ) : flightLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Book className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">Ingen loggførte flyturer</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {flightLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 bg-card border border-border rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {format(new Date(log.flight_date), "d. MMMM yyyy", { locale: nb })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{formatDuration(log.flight_duration_minutes)}</Badge>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Rediger flylogg (admin)"
                                onClick={() => setEditingFlightLogId(log.id)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {log.drone && (
                            <div className="flex items-center gap-1">
                              <Plane className="w-3 h-3" />
                              <span>{log.drone.modell} (SN: {log.drone.serienummer})</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span>{log.departure_location}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{log.landing_location}</span>
                          {log.movements > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              {log.movements} landinger
                            </Badge>
                          )}
                        </div>

                        {log.mission && (
                          <div className="text-sm text-muted-foreground">
                            Oppdrag: {log.mission.tittel}
                          </div>
                        )}

                        {log.notes && (
                          <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </TabsContent>

            <TabsContent value="innlegg" className="mt-2">
                {personnelLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Edit className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">Ingen logginnlegg ennå</p>
                    <p className="text-xs text-muted-foreground mt-1">Klikk «Legg til logginnlegg» for å legge til</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {personnelLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 bg-card border border-border rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {entry.entry_type || 'Merknad'}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(entry.entry_date), "d. MMMM yyyy", { locale: nb })}
                              </span>
                            </div>
                            <p className="font-medium text-sm mt-1">{entry.title}</p>
                            {entry.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">{entry.description}</p>
                            )}
                            {entry.imagePublicUrl && (
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(entry.imagePublicUrl!)}
                                className="mt-2 relative group"
                              >
                                <img
                                  src={entry.imagePublicUrl}
                                  alt="Vedlegg"
                                  className="h-16 w-auto rounded-md border object-cover max-w-[120px]"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(isAdmin || entry.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => handleEditEntry(entry)}
                                title="Rediger"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteEntry(entry.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </TabsContent>
          </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft manuell registrering</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du ønsker å legge til {manualHours || "0"} timer og {manualMinutes || "0"} minutter manuelt? 
              Dette vil øke den totale flytiden permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddManualHours}>
              Bekreft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxUrl && (
        <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-background/95">
            <img
              src={lightboxUrl}
              alt="Bilde"
              className="w-full h-auto rounded-md max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      <EditFlightLogDialog
        open={!!editingFlightLogId}
        onOpenChange={(o) => { if (!o) setEditingFlightLogId(null); }}
        flightLogId={editingFlightLogId}
        onSaved={() => { fetchFlightLogs(); fetchPersonnelLogs(); fetchProfileData(); }}
      />
    </>
  );
};
