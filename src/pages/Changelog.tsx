import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Loader2, Plus, Pencil, Trash2, Wrench, CheckCircle2,
  Clock, FlaskConical, Circle, Settings2, Save, ArrowUpDown,
  ArrowUp, ArrowDown, Minus, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface SystemStatus {
  id: string;
  name: string;
  status: string;
  description: string | null;
  sort_order: number;
  updated_at: string;
}

interface ChangelogEntry {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface Maintenance {
  id: string;
  active: boolean;
  message: string;
  updated_at: string;
}

const statusColors: Record<string, string> = {
  green: "bg-status-green",
  yellow: "bg-status-yellow",
  red: "bg-status-red",
};

const entryStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ikke_startet: { label: "Ikke startet", color: "bg-muted text-foreground", icon: <Circle className="w-3 h-3" /> },
  pågår: { label: "Pågår", color: "bg-status-yellow/20 text-foreground border border-status-yellow/40", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  testing: { label: "Testing", color: "bg-blue-500/20 text-foreground border border-blue-500/40", icon: <FlaskConical className="w-3 h-3" /> },
  implementert: { label: "Implementert", color: "bg-status-green/20 text-foreground border border-status-green/40", icon: <CheckCircle2 className="w-3 h-3" /> },
};

const priorityConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  high: { label: "Høy", color: "bg-destructive/15 text-foreground border border-destructive/40", icon: <ArrowUp className="w-3 h-3" /> },
  medium: { label: "Medium", color: "bg-status-yellow/15 text-foreground border border-status-yellow/40", icon: <Minus className="w-3 h-3" /> },
  low: { label: "Lav", color: "bg-muted text-foreground", icon: <ArrowDown className="w-3 h-3" /> },
};

const Changelog = () => {
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();

  const [systems, setSystems] = useState<SystemStatus[]>([]);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"created_at" | "status" | "completed_at">("created_at");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialogs
  const [systemDialog, setSystemDialog] = useState<{ open: boolean; system?: SystemStatus }>({ open: false });
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: ChangelogEntry }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "system" | "entry"; id: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState("green");
  const [formDescription, setFormDescription] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formEntryDesc, setFormEntryDesc] = useState("");
  const [formEntryStatus, setFormEntryStatus] = useState("ikke_startet");
  const [formCompletedAt, setFormCompletedAt] = useState("");
  const [formPriority, setFormPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    const [sysRes, entRes, maintRes] = await Promise.all([
      supabase.from("changelog_systems").select("*").order("sort_order"),
      supabase.from("changelog_entries").select("*").order("created_at", { ascending: false }),
      supabase.from("changelog_maintenance").select("*").limit(1).single(),
    ]);
    if (sysRes.data) setSystems(sysRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (maintRes.data) setMaintenance(maintRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Maintenance toggle
  const toggleMaintenance = async () => {
    if (!maintenance) return;
    const { error } = await supabase
      .from("changelog_maintenance")
      .update({ active: !maintenance.active, updated_at: new Date().toISOString() })
      .eq("id", maintenance.id);
    if (error) { toast.error("Kunne ikke oppdatere"); return; }
    setMaintenance({ ...maintenance, active: !maintenance.active });
  };

  const updateMaintenanceMessage = async (msg: string) => {
    if (!maintenance) return;
    const { error } = await supabase
      .from("changelog_maintenance")
      .update({ message: msg, updated_at: new Date().toISOString() })
      .eq("id", maintenance.id);
    if (error) toast.error("Kunne ikke oppdatere melding");
    else setMaintenance({ ...maintenance, message: msg });
  };

  // System CRUD
  const openSystemDialog = (system?: SystemStatus) => {
    setFormName(system?.name || "");
    setFormStatus(system?.status || "green");
    setFormDescription(system?.description || "");
    setSystemDialog({ open: true, system });
  };

  const saveSystem = async () => {
    setSaving(true);
    if (systemDialog.system) {
      const { error } = await supabase.from("changelog_systems")
        .update({ name: formName, status: formStatus, description: formDescription || null, updated_at: new Date().toISOString() })
        .eq("id", systemDialog.system.id);
      if (error) toast.error("Feil ved lagring");
      else toast.success("System oppdatert");
    } else {
      const maxOrder = systems.reduce((m, s) => Math.max(m, s.sort_order), 0);
      const { error } = await supabase.from("changelog_systems")
        .insert({ name: formName, status: formStatus, description: formDescription || null, sort_order: maxOrder + 1 });
      if (error) toast.error("Feil ved opprettelse");
      else toast.success("System lagt til");
    }
    setSaving(false);
    setSystemDialog({ open: false });
    fetchAll();
  };

  // Entry CRUD
  const openEntryDialog = (entry?: ChangelogEntry) => {
    setFormTitle(entry?.title || "");
    setFormEntryDesc(entry?.description || "");
    setFormEntryStatus(entry?.status || "ikke_startet");
    setFormPriority(entry?.priority || "medium");
    setFormCompletedAt(entry?.completed_at ? entry.completed_at.slice(0, 10) : "");
    setEntryDialog({ open: true, entry });
  };

  const saveEntry = async () => {
    setSaving(true);
    const completedAt = formCompletedAt ? new Date(formCompletedAt).toISOString() : null;
    if (entryDialog.entry) {
      const { error } = await supabase.from("changelog_entries")
        .update({ title: formTitle, description: formEntryDesc || null, status: formEntryStatus, priority: formPriority, completed_at: completedAt, updated_at: new Date().toISOString() })
        .eq("id", entryDialog.entry.id);
      if (error) toast.error("Feil ved lagring");
      else toast.success("Oppføring oppdatert");
    } else {
      const { error } = await supabase.from("changelog_entries")
        .insert({ title: formTitle, description: formEntryDesc || null, status: formEntryStatus, priority: formPriority, completed_at: completedAt });
      if (error) toast.error("Feil ved opprettelse");
      else toast.success("Oppføring lagt til");
    }
    setSaving(false);
    setEntryDialog({ open: false });
    fetchAll();
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.type === "system" ? "changelog_systems" : "changelog_entries";
    const { error } = await supabase.from(table).delete().eq("id", deleteTarget.id);
    if (error) toast.error("Kunne ikke slette");
    else toast.success("Slettet");
    setDeleteTarget(null);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Driftstatus og endringslogg</h1>

      {/* Maintenance Banner */}
      {(maintenance?.active || isSuperAdmin) && (
        <Card className={maintenance?.active ? "border-status-yellow bg-status-yellow/10" : "border-dashed"}>
          <CardContent className="flex items-center gap-3 py-4">
            {maintenance?.active && <Wrench className="w-5 h-5 text-status-yellow animate-spin" />}
            <span className={`flex-1 font-medium ${maintenance?.active ? "text-foreground" : "text-muted-foreground"}`}>
              {maintenance?.message || "Drift og vedlikehold pågår"}
            </span>
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <Switch checked={maintenance?.active || false} onCheckedChange={toggleMaintenance} />
                {maintenance?.active && isSuperAdmin && (
                  <Input
                    value={maintenance.message}
                    onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
                    onBlur={(e) => updateMaintenanceMessage(e.target.value)}
                    className="max-w-xs h-8 text-sm"
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* System Status Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Systemstatus</CardTitle>
            {isSuperAdmin && (
              <Button variant="ghost" size="sm" onClick={() => openSystemDialog()}>
                <Plus className="w-4 h-4 mr-1" /> Legg til
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {systems.map((sys) => (
              <button
                key={sys.id}
                onClick={() => isSuperAdmin && openSystemDialog(sys)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border border-border/50 transition-colors ${
                  isSuperAdmin ? "hover:bg-accent cursor-pointer" : "cursor-default"
                }`}
                disabled={!isSuperAdmin}
              >
                <div className={`w-3 h-3 rounded-full ${statusColors[sys.status] || "bg-muted"}`} />
                <span className="text-xs font-medium text-center leading-tight">{sys.name}</span>
                {sys.description && (
                  <span className="text-[10px] text-muted-foreground text-center">{sys.description}</span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Changelog Entries */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg">Endringslogg</CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="relative flex-1 min-w-0 sm:flex-none">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Søk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full sm:w-[160px] text-xs pl-7"
                />
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 w-[140px] sm:w-[160px] text-xs">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Opprettet dato</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="completed_at">Utført dato</SelectItem>
                </SelectContent>
              </Select>
              {isSuperAdmin && (
                <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => openEntryDialog()}>
                  <Plus className="w-4 h-4 mr-1" /> Legg til
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Ingen oppføringer ennå</p>
          )}
          {[...entries].filter((e) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return e.title.toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q);
          }).sort((a, b) => {
            if (sortBy === "status") {
              const order = ["pågår", "testing", "ikke_startet", "implementert"];
              return order.indexOf(a.status) - order.indexOf(b.status);
            }
            if (sortBy === "completed_at") {
              if (!a.completed_at && !b.completed_at) return 0;
              if (!a.completed_at) return 1;
              if (!b.completed_at) return -1;
              return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
            }
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }).map((entry) => {
            const cfg = entryStatusConfig[entry.status] || entryStatusConfig.ikke_startet;
            const pri = priorityConfig[entry.priority] || priorityConfig.medium;
            return (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.title}</span>
                    <Badge variant="outline" className={`text-[10px] gap-1 ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </Badge>
                    {entry.status !== "implementert" && (
                      <Badge variant="outline" className={`text-[10px] gap-1 ${pri.color}`}>
                        {pri.icon} {pri.label}
                      </Badge>
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                    <span>Opprettet: {format(new Date(entry.created_at), "d. MMM yyyy", { locale: nb })}</span>
                    {entry.completed_at && (
                      <span>Utført: {format(new Date(entry.completed_at), "d. MMM yyyy", { locale: nb })}</span>
                    )}
                  </div>
                </div>
                {isSuperAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEntryDialog(entry)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget({ type: "entry", id: entry.id })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* System Dialog */}
      <Dialog open={systemDialog.open} onOpenChange={(o) => !o && setSystemDialog({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{systemDialog.system ? "Rediger system" : "Legg til system"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Navn</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="green">🟢 Operativ</SelectItem>
                  <SelectItem value="yellow">🟡 Delvis</SelectItem>
                  <SelectItem value="red">🔴 Nede</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Beskrivelse (valgfri)</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            {systemDialog.system && (
              <Button variant="destructive" size="sm" onClick={() => { setSystemDialog({ open: false }); setDeleteTarget({ type: "system", id: systemDialog.system!.id }); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Slett
              </Button>
            )}
            <Button onClick={saveSystem} disabled={!formName || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry Dialog */}
      <Dialog open={entryDialog.open} onOpenChange={(o) => !o && setEntryDialog({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entryDialog.entry ? "Rediger oppføring" : "Ny oppføring"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tittel</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>
            <div>
              <Label>Beskrivelse (valgfri)</Label>
              <Textarea value={formEntryDesc} onChange={(e) => setFormEntryDesc(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formEntryStatus} onValueChange={setFormEntryStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ikke_startet">Ikke startet</SelectItem>
                  <SelectItem value="pågår">Pågår</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="implementert">Implementert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioritet</Label>
              <Select value={formPriority} onValueChange={setFormPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Høy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Lav</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Utført dato (valgfri)</Label>
              <Input type="date" value={formCompletedAt} onChange={(e) => setFormCompletedAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveEntry} disabled={!formTitle || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Lagre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>Denne handlingen kan ikke angres.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Changelog;
