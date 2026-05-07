import { useNavigate } from "react-router-dom";
import { isBatteryType } from "@/config/equipmentCategories";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Book, 
  Plane, 
  PackagePlus, 
  PackageMinus, 
  Edit, 
  Plus, 
  User,
  Trash2,
  FileText,
  Wrench,
  ImagePlus,
  X,
  ZoomIn,
  Battery,
  Heart,
  TrendingDown,
  Calendar,
  Thermometer,
  Zap,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import autoTable from "jspdf-autotable";
import { createPdfDocument, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf, addSignatureToPdf, getPdfFontName } from "@/lib/pdfUtils";

interface EquipmentLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  equipmentNavn: string;
  flyvetimer: number;
  equipmentType?: string;
  equipmentSerienummer?: string;
}

interface BatteryTrendEntry {
  date: Date;
  cycles: number | null;
  health: number | null;
  tempMin: number | null;
  tempMax: number | null;
  voltageMin: number | null;
  capacityMah: number | null;
  cellDeviation: number | null;
}

interface LogEntry {
  id: string;
  type: 'flight' | 'drone_added' | 'drone_removed' | 'manual';
  date: Date;
  title: string;
  description?: string;
  userName?: string;
  icon: React.ReactNode;
  badgeColor: string;
  badgeText: string;
  imageUrl?: string;
  incidentId?: string;
  manualEntryId?: string;
  rawEntry?: { entry_type: string | null; title: string; description: string | null; entry_date: string };
}

export const EquipmentLogbookDialog = ({ 
  open, 
  onOpenChange, 
  equipmentId, 
  equipmentNavn,
  flyvetimer,
  equipmentType,
  equipmentSerienummer,
}: EquipmentLogbookDialogProps) => {
  const { user, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const navigate = useNavigate();
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batteryTrend, setBatteryTrend] = useState<BatteryTrendEntry[]>([]);
  const [newEntry, setNewEntry] = useState({
    entry_type: "merknad",
    title: "",
    description: "",
    entry_date: new Date().toISOString().split('T')[0],
  });

  const isBattery = isBatteryType(equipmentType);

  useEffect(() => {
    if (open && equipmentId) {
      fetchAllLogs();
      fetchSignature();
      if (isBattery && equipmentSerienummer) fetchBatteryTrend();
    }
  }, [open, equipmentId]);

  const fetchSignature = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("profiles")
      .select("signature_url")
      .eq("id", user.id)
      .single();
    setSignatureUrl(data?.signature_url || null);
  };

  const fetchBatteryTrend = async () => {
    if (!equipmentSerienummer || !companyId) return;
    try {
      const { data } = await (supabase
        .from('flight_logs')
        .select('flight_date, battery_cycles, battery_health_pct, battery_temp_min_c, battery_temp_max_c, battery_voltage_min_v, battery_full_capacity_mah, battery_cell_deviation_max_v')
        .eq('company_id', companyId) as any)
        .eq('battery_sn', equipmentSerienummer)
        .not('battery_cycles', 'is', null)
        .order('flight_date', { ascending: true })
        .limit(100);

      if (data) {
        setBatteryTrend(
          data.map((r: any) => ({
            date: new Date(r.flight_date),
            cycles: r.battery_cycles,
            health: r.battery_health_pct,
            tempMin: r.battery_temp_min_c,
            tempMax: r.battery_temp_max_c,
            voltageMin: r.battery_voltage_min_v,
            capacityMah: r.battery_full_capacity_mah,
            cellDeviation: r.battery_cell_deviation_max_v,
          }))
        );
      }
    } catch (e) {
      console.error('Error fetching battery trend:', e);
    }
  };

  const fetchAllLogs = async () => {
    setIsLoading(true);
    try {
      const logs: LogEntry[] = [];

      // Fetch flight logs where this equipment was used
      const { data: flightLogEquipment } = await supabase
        .from("flight_log_equipment")
        .select("flight_log_id")
        .eq("equipment_id", equipmentId);

      if (flightLogEquipment && flightLogEquipment.length > 0) {
        const flightLogIds = flightLogEquipment.map(f => f.flight_log_id);
        
        const { data: flightLogs } = await supabase
          .from("flight_logs")
          .select(`id, flight_date, flight_duration_minutes, departure_location, landing_location, notes, movements, user_id`)
          .in("id", flightLogIds)
          .order("flight_date", { ascending: false });

        if (flightLogs) {
          const { data: pilotLinks } = await (supabase as any)
            .from("flight_log_personnel")
            .select("flight_log_id, profile_id")
            .in("flight_log_id", flightLogIds);

          const pilotByLogId = new Map<string, string>();
          (pilotLinks || []).forEach((p: any) => {
            if (!pilotByLogId.has(p.flight_log_id)) pilotByLogId.set(p.flight_log_id, p.profile_id);
          });

          const allUserIds = new Set<string>();
          flightLogs.forEach(f => { if (f.user_id) allUserIds.add(f.user_id); });
          pilotByLogId.forEach(pid => allUserIds.add(pid));

          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(allUserIds));
          const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

          flightLogs.forEach(log => {
            logs.push({
              id: `flight-${log.id}`,
              type: 'flight',
              date: new Date(log.flight_date),
              title: `Flytur: ${log.departure_location} -> ${log.landing_location}`,
              description: `${log.flight_duration_minutes} min, ${log.movements} bevegelser${log.notes ? ` - ${log.notes}` : ''}`,
              userName: userMap.get(pilotByLogId.get(log.id) || log.user_id) || 'Ukjent',
              icon: <Plane className="w-4 h-4" />,
              badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
              badgeText: 'Flytur',
            });
          });
        }
      }

      // Fetch drone assignment history
      const { data: droneHistory } = await supabase
        .from("drone_equipment_history")
        .select("id, action, item_name, created_at, user_id, drone_id")
        .eq("item_id", equipmentId)
        .eq("item_type", "equipment")
        .order("created_at", { ascending: false });

      if (droneHistory) {
        const userIds = [...new Set(droneHistory.map(e => e.user_id))];
        const droneIds = [...new Set(droneHistory.map(e => e.drone_id))];
        
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const { data: drones } = await supabase.from("drones").select("id, modell").in("id", droneIds);
        
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        const droneMap = new Map(drones?.map(d => [d.id, d.modell]) || []);

        droneHistory.forEach(entry => {
          const isAdded = entry.action === 'added';
          const droneName = droneMap.get(entry.drone_id) || 'Ukjent drone';
          logs.push({
            id: `drone-${entry.id}`,
            type: isAdded ? 'drone_added' : 'drone_removed',
            date: new Date(entry.created_at),
            title: `${isAdded ? 'Lagt til' : 'Fjernet fra'} ${droneName}`,
            description: `Dronekobling`,
            userName: userMap.get(entry.user_id) || 'Ukjent',
            icon: isAdded ? <PackagePlus className="w-4 h-4" /> : <PackageMinus className="w-4 h-4" />,
            badgeColor: isAdded 
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
            badgeText: isAdded ? 'Lagt til' : 'Fjernet',
          });
        });
      }

      // Fetch manual entries (with image_url)
      const { data: manualEntries } = await (supabase as any)
        .from("equipment_log_entries")
        .select("id, entry_date, entry_type, title, description, user_id, image_url")
        .eq("equipment_id", equipmentId)
        .order("entry_date", { ascending: false });

      if (manualEntries) {
        const allUserIds: string[] = (manualEntries as any[]).map((e) => e.user_id as string);
        const userIds = [...new Set(allUserIds)];
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const userMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        for (const entry of manualEntries as any[]) {
          const isVedlikehold = entry.entry_type === 'vedlikehold';
          let imagePublicUrl: string | undefined;
          if (entry.image_url) {
            const { data } = await supabase.storage.from("logbook-images").createSignedUrl(entry.image_url, 3600);
            imagePublicUrl = data?.signedUrl || undefined;
          }
          const isHendelse = entry.entry_type === 'hendelse';
          const incidentIdMatch = entry.description?.match(/^incident_id:(.+)$/);
          logs.push({
            id: `manual-${entry.id}`,
            type: 'manual',
            date: new Date(entry.entry_date),
            title: entry.title,
            description: incidentIdMatch ? undefined : (entry.description || undefined),
            userName: userMap.get(entry.user_id) || 'Ukjent',
            icon: isHendelse ? <AlertTriangle className="w-4 h-4" /> : (isVedlikehold ? <Wrench className="w-4 h-4" /> : <Edit className="w-4 h-4" />),
            badgeColor: isHendelse
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : (isVedlikehold
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'),
            badgeText: entry.entry_type || 'Merknad',
            imageUrl: imagePublicUrl,
            incidentId: incidentIdMatch?.[1] || undefined,
            manualEntryId: entry.id,
            rawEntry: { entry_type: entry.entry_type, title: entry.title, description: entry.description, entry_date: entry.entry_date },
          });
        }
      }

      logs.sort((a, b) => b.date.getTime() - a.date.getTime());
      setAllLogs(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Kunne ikke hente loggbok");
    } finally {
      setIsLoading(false);
    }
  };

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
    setIsSaving(true);
    try {
      let entryId = editingEntryId;
      if (editingEntryId) {
        const { error } = await (supabase as any)
          .from("equipment_log_entries")
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
          .from("equipment_log_entries")
          .insert({
            equipment_id: equipmentId,
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
        const filePath = `${companyId}/equipment-${entryId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logbook-images")
          .upload(filePath, imageFile, { contentType: imageFile.type });
        
        if (uploadError) {
          toast.error("Innlegg lagret, men bilde kunne ikke lastes opp");
        } else {
          await (supabase as any)
            .from("equipment_log_entries")
            .update({ image_url: filePath })
            .eq("id", entryId);
        }
      }

      toast.success(editingEntryId ? "Innlegg oppdatert" : "Innlegg lagt til");
      setNewEntry({ entry_type: "merknad", title: "", description: "", entry_date: new Date().toISOString().split('T')[0] });
      clearImage();
      setShowAddEntry(false);
      setEditingEntryId(null);
      fetchAllLogs();
    } catch (error: any) {
      console.error("Error saving entry:", error);
      toast.error(`Kunne ikke lagre innlegg: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditManualEntry = (log: LogEntry) => {
    if (!log.manualEntryId || !log.rawEntry) return;
    setEditingEntryId(log.manualEntryId);
    setNewEntry({
      entry_type: log.rawEntry.entry_type || "merknad",
      title: log.rawEntry.title,
      description: log.rawEntry.description || "",
      entry_date: log.rawEntry.entry_date.split('T')[0],
    });
    clearImage();
    setShowAddEntry(true);
  };

  const handleDeleteEntry = async (logId: string) => {
    const parts = logId.split('-');
    const type = parts[0];
    const id = parts.slice(1).join('-');
    if (type !== 'manual') return;

    try {
      const { error } = await supabase
        .from("equipment_log_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Innlegg slettet");
      fetchAllLogs();
    } catch (error: any) {
      toast.error(`Kunne ikke slette: ${error.message}`);
    }
  };

  const handleExportPDF = async () => {
    if (!user || !companyId) {
      toast.error("Du må være innlogget");
      return;
    }

    try {
      const pdf = await createPdfDocument();
      const dateStr = format(new Date(), 'dd.MM.yyyy');
      const timeStr = format(new Date(), 'HH:mm');
      
      pdf.setFontSize(18);
      pdf.text(sanitizeForPdf(`Loggbok - ${equipmentNavn}`), 14, 20);
      pdf.setFontSize(11);
      pdf.text(`Totalt ${Number(flyvetimer).toFixed(2)} flyvetimer`, 14, 28);
      pdf.text(`Eksportert: ${dateStr} ${timeStr}`, 14, 35);
      
      if (allLogs.length === 0) {
        pdf.setFontSize(10);
        pdf.text("Ingen oppføringer i loggboken.", 14, 55);
      } else {
        const tableData = allLogs.map(log => [
          formatDateForPdf(log.date, 'dd.MM.yyyy HH:mm'),
          sanitizeForPdf(log.badgeText),
          sanitizeForPdf(log.title),
          sanitizeForPdf(log.description) || '',
          sanitizeForPdf(log.userName) || 'Ukjent'
        ]);

        autoTable(pdf, {
          startY: 45,
          head: [['Dato', 'Type', 'Tittel', 'Beskrivelse', 'Utført av']],
          body: tableData,
          styles: { fontSize: 8, cellPadding: 2, font: getPdfFontName() },
          headStyles: { fillColor: [59, 130, 246], font: getPdfFontName() },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 25 },
            2: { cellWidth: 45 },
            3: { cellWidth: 55 },
            4: { cellWidth: 30 },
          },
        });
      }

      if (signatureUrl) {
        const finalY = allLogs.length > 0 ? ((pdf as any).lastAutoTable?.finalY || 150) : 70;
        await addSignatureToPdf(pdf, signatureUrl, finalY + 20, "Signatur:");
      }

      const pdfBlob = pdf.output('blob');
      const safeName = sanitizeFilenameForPdf(equipmentNavn);
      const fileName = `loggbok-utstyr-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const filePath = `${companyId}/${user.id}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('documents').insert({
        tittel: sanitizeForPdf(`Loggbok - ${equipmentNavn} - ${dateStr}`),
        kategori: 'loggbok',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: pdfBlob.size,
        company_id: companyId,
        user_id: user.id,
      });

      if (insertError) throw insertError;
      toast.success('Loggbok eksportert til dokumenter');
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toast.error(`Kunne ikke eksportere: ${error.message}`);
    }
  };

  const filteredLogs = activeTab === 'all' 
    ? allLogs 
    : allLogs.filter(log => {
        switch (activeTab) {
          case 'flights': return log.type === 'flight';
          case 'drones': return log.type === 'drone_added' || log.type === 'drone_removed';
          case 'manual': return log.type === 'manual';
          default: return true;
        }
      });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Book className="w-5 h-5 text-primary shrink-0" />
              <span className="break-words hyphens-auto">Loggbok - {equipmentNavn}</span>
            </DialogTitle>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Totalt {Number(flyvetimer).toFixed(2)} flyvetimer
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddEntry(!showAddEntry)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Legg til
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportPDF}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("flex-1 flex flex-col min-h-0", showAddEntry && "hidden sm:flex")}>
            <TabsList className="flex w-full overflow-x-auto no-scrollbar mb-2">
              <TabsTrigger value="all" className="flex-1 min-w-[50px] text-xs sm:text-sm">Alle</TabsTrigger>
              <TabsTrigger value="flights" className="flex-1 min-w-[50px] text-xs sm:text-sm">Flyturer</TabsTrigger>
              <TabsTrigger value="drones" className="flex-1 min-w-[50px] text-xs sm:text-sm">Droner</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 min-w-[50px] text-xs sm:text-sm">Manuelt</TabsTrigger>
              {isBattery && <TabsTrigger value="battery" className="flex-1 min-w-[50px] text-xs sm:text-sm"><span className="sm:hidden">Batt</span><span className="hidden sm:inline">Batteritrend</span></TabsTrigger>}
            </TabsList>

            {showAddEntry && (
              <div className="border rounded-lg p-3 sm:p-4 space-y-3 bg-muted/30 mb-3 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs sm:text-sm">Type</Label>
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
                          <SelectItem value="vedlikehold">Vedlikehold</SelectItem>
                          <SelectItem value="annet">Annet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">Dato</Label>
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
                  {/* Image upload */}
                  <div>
                    <Label className="text-xs sm:text-sm">Bilde (valgfritt)</Label>
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
                  <div className="flex gap-2 sticky bottom-0 bg-muted/30 pt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-1">
                    <Button size="sm" onClick={handleAddEntry} disabled={isSaving}>
                      {isSaving ? "Lagrer..." : "Lagre"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowAddEntry(false); clearImage(); }}>Avbryt</Button>
                  </div>
                </div>
            )}

            {activeTab !== 'battery' && (
            <TabsContent value={activeTab} className="flex-1 min-h-0 mt-0 overflow-y-auto">
              <div className="overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Laster loggbok...
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Ingen oppføringer
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className="border rounded-lg p-2 sm:p-3 bg-card hover:bg-accent/50 transition-colors overflow-hidden"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="text-muted-foreground mt-0.5 shrink-0">
                            {log.icon}
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className={`${log.badgeColor} text-[10px] sm:text-xs shrink-0`}>
                                    {log.badgeText}
                                  </Badge>
                                </div>
                                <p className="font-medium text-xs sm:text-sm mt-1 break-words">
                                  {log.title}
                                </p>
                              </div>
                              {log.type === 'manual' && !log.incidentId && log.badgeText !== 'hendelse' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={() => handleDeleteEntry(log.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                              {log.incidentId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary shrink-0"
                                  title="Åpne hendelse"
                                  onClick={() => {
                                    onOpenChange(false);
                                    navigate('/hendelser', { state: { openIncidentId: log.incidentId } });
                                  }}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              )}
                            </div>
                            {log.description && (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                                {log.description}
                              </p>
                            )}
                            {log.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(log.imageUrl!)}
                                className="mt-2 relative group"
                              >
                                <img
                                  src={log.imageUrl}
                                  alt="Vedlegg"
                                  className="h-16 w-auto rounded-md border object-cover max-w-[120px]"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                              <span className="flex items-center gap-1 shrink-0">
                                <Calendar className="w-3 h-3" />
                                <span className="sm:hidden">{format(log.date, 'dd.MM.yy', { locale: nb })}</span>
                                <span className="hidden sm:inline">{format(log.date, 'dd.MM.yyyy', { locale: nb })}</span>
                              </span>
                              <span className="flex items-center gap-1 min-w-0">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="truncate">{log.userName}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            )}

            {isBattery && (
              <TabsContent value="battery" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-[calc(60vh-200px)] sm:h-[400px] min-h-[200px] max-h-[400px] pr-2 sm:pr-4">
                  {batteryTrend.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <div className="text-center space-y-2">
                        <Battery className="w-8 h-8 mx-auto opacity-50" />
                        <p>Ingen batterihistorikk funnet</p>
                        <p className="text-xs">Importer flylogger med dette batteriet for å se trender</p>
                      </div>
                    </div>
                  ) : (() => {
                    const latest = batteryTrend[batteryTrend.length - 1];
                    const first = batteryTrend[0];
                    const latestHealth = latest?.health ?? 100;
                    const latestTempMax = latest?.tempMax;
                    const latestVoltageMin = latest?.voltageMin;
                    const latestCapacity = latest?.capacityMah;
                    const latestCellDev = latest?.cellDeviation;
                    const cellDevColor = latestCellDev == null ? '' : latestCellDev > 0.1 ? 'text-destructive' : latestCellDev > 0.05 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';
                    const firstCapacity = first?.capacityMah;

                    const healthColor = latestHealth < 60 ? 'text-destructive' : latestHealth < 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';
                    const tempColor = latestTempMax == null ? '' : latestTempMax > 50 ? 'text-destructive' : latestTempMax > 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';
                    const voltageColor = latestVoltageMin == null ? '' : latestVoltageMin < 3.0 ? 'text-destructive' : latestVoltageMin < 3.3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';

                    return (
                      <div className="space-y-4">
                        {/* Summary cards - 4 cols on desktop, 2 on mobile */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Sykluser</p>
                            <p className="text-lg font-bold">{latest?.cycles ?? '—'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {first?.cycles ?? '?'} → {latest?.cycles ?? '?'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3" /> Helse</p>
                            <p className={`text-lg font-bold ${healthColor}`}>
                              {latest?.health ?? '—'}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {first?.health ?? '?'}% → {latest?.health ?? '?'}%
                            </p>
                          </div>
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="w-3 h-3" /> Maks temp</p>
                            <p className={`text-lg font-bold ${tempColor}`}>
                              {latestTempMax != null ? `${latestTempMax}°C` : '—'}
                            </p>
                            {latest?.tempMin != null && (
                              <p className="text-[10px] text-muted-foreground">
                                Min: {latest.tempMin}°C
                              </p>
                            )}
                          </div>
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Min spenning</p>
                            <p className={`text-lg font-bold ${voltageColor}`}>
                              {latestVoltageMin != null ? `${latestVoltageMin.toFixed(2)}V` : '—'}
                            </p>
                            {latestCapacity != null && (
                              <p className="text-[10px] text-muted-foreground">
                                {latestCapacity} mAh
                              </p>
                            )}
                          </div>
                          {latestCellDev != null && (
                            <div className="border rounded-lg p-3 bg-card">
                              <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Celleavvik</p>
                              <p className={`text-lg font-bold ${cellDevColor}`}>
                                {latestCellDev.toFixed(3)}V
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {latestCellDev > 0.1 ? 'Høyt' : latestCellDev > 0.05 ? 'Moderat' : 'OK'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Capacity degradation trend */}
                        {firstCapacity != null && latestCapacity != null && firstCapacity !== latestCapacity && (
                          <div className="border rounded-lg p-3 bg-card">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                              <Battery className="w-3 h-3" /> Kapasitetsutvikling
                            </p>
                            <p className="text-sm">
                              {firstCapacity} mAh → {latestCapacity} mAh
                              <span className={`ml-2 text-xs ${latestCapacity < firstCapacity ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                ({latestCapacity < firstCapacity ? '' : '+'}{Math.round(((latestCapacity - firstCapacity) / firstCapacity) * 100)}%)
                              </span>
                            </p>
                          </div>
                        )}

                        {/* History table */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Historikk ({batteryTrend.length} flylogger)</p>
                          {/* Header row - hidden on mobile */}
                          <div className="hidden sm:grid sm:grid-cols-7 gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                            <span>Dato</span>
                            <span>Sykluser</span>
                            <span>Helse</span>
                            <span>Temp</span>
                            <span>Spenning</span>
                            <span>Celleavvik</span>
                            <span>Kapasitet</span>
                          </div>
                          {batteryTrend.slice().reverse().map((entry, idx) => (
                            <div key={idx} className="border rounded-md px-3 py-2 text-sm">
                              {/* Desktop layout */}
                              <div className="hidden sm:grid sm:grid-cols-7 gap-2 items-center">
                                <span className="text-muted-foreground">{format(entry.date, 'dd.MM.yyyy')}</span>
                                <span>{entry.cycles != null ? `${entry.cycles}` : '—'}</span>
                                <span className={entry.health != null ? (entry.health < 60 ? 'text-destructive' : entry.health < 80 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.health != null ? `${entry.health}%` : '—'}
                                </span>
                                <span className={entry.tempMax != null ? (entry.tempMax > 50 ? 'text-destructive' : entry.tempMax > 40 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.tempMin != null || entry.tempMax != null
                                    ? `${entry.tempMin ?? '?'}–${entry.tempMax ?? '?'}°C`
                                    : '—'}
                                </span>
                                <span className={entry.voltageMin != null ? (entry.voltageMin < 3.0 ? 'text-destructive' : entry.voltageMin < 3.3 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.voltageMin != null ? `${entry.voltageMin.toFixed(2)}V` : '—'}
                                </span>
                                <span className={entry.cellDeviation != null ? (entry.cellDeviation > 0.1 ? 'text-destructive' : entry.cellDeviation > 0.05 ? 'text-yellow-600 dark:text-yellow-400' : '') : ''}>
                                  {entry.cellDeviation != null ? `${entry.cellDeviation.toFixed(3)}V` : '—'}
                                </span>
                                <span>{entry.capacityMah != null ? `${entry.capacityMah} mAh` : '—'}</span>
                              </div>
                              {/* Mobile layout */}
                              <div className="sm:hidden">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground text-xs">{format(entry.date, 'dd.MM.yyyy')}</span>
                                  <div className="flex gap-3 text-xs">
                                    {entry.cycles != null && <span>🔄 {entry.cycles}</span>}
                                    {entry.health != null && (
                                      <span className={entry.health < 60 ? 'text-destructive' : entry.health < 80 ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                                        ❤️ {entry.health}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {(entry.tempMax != null || entry.voltageMin != null || entry.capacityMah != null || entry.cellDeviation != null) && (
                                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                    {entry.tempMax != null && <span>🌡 {entry.tempMax}°C</span>}
                                    {entry.voltageMin != null && <span>⚡ {entry.voltageMin.toFixed(2)}V</span>}
                                    {entry.cellDeviation != null && (
                                      <span className={entry.cellDeviation > 0.1 ? 'text-destructive' : ''}>
                                        📊 {entry.cellDeviation.toFixed(3)}V
                                      </span>
                                    )}
                                    {entry.capacityMah != null && <span>🔋 {entry.capacityMah} mAh</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

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
    </>
  );
};
