import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MediaLibraryPickerDialog } from "@/components/marketing/MediaLibraryPickerDialog";
import {
  Loader2, Plus, Trash2, Send, Upload, Users, FileEdit, History,
  Type, Image, Minus, MousePointerClick, Save, FolderOpen, Copy, ArrowUp, ArrowDown, ImagePlus
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

/* ─── Types ─── */
interface Contact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  unsubscribed: boolean;
  created_at: string;
}

interface Broadcast {
  id: string;
  subject: string;
  html_content: string;
  resend_broadcast_id: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

type BlockType = "heading" | "text" | "button" | "divider" | "image" | "spacer";

interface EmailBlock {
  id: string;
  type: BlockType;
  content: string;
  props: Record<string, string>;
}

interface NewsletterTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
}

async function invokeNewsletter(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("newsletter-manage", {
    body: { action, ...extra },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ─── Block → HTML ─── */
function blockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return `<h${block.props.level || "1"} style="font-family:Arial,sans-serif;color:${block.props.color || "#1a1a2e"};font-size:${block.props.level === "2" ? "20px" : "26px"};margin:0 0 16px;">${block.content}</h${block.props.level || "1"}>`;
    case "text":
      return `<p style="font-family:Arial,sans-serif;color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;">${block.content}</p>`;
    case "button":
      return `<table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td style="background:${block.props.bgColor || "#0ea5e9"};border-radius:6px;padding:12px 28px;"><a href="${block.props.url || "#"}" style="color:${block.props.textColor || "#fff"};font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">${block.content}</a></td></tr></table>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;
    case "image":
      return `<img src="${block.props.src || ""}" alt="${block.content}" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" />`;
    case "spacer":
      return `<div style="height:${block.props.height || "24"}px;"></div>`;
    default:
      return "";
  }
}

function blocksToHtml(blocks: EmailBlock[]): string {
  const inner = blocks.map(blockToHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="no">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;"><tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="padding:32px 40px;">
${inner}
</td></tr>
<tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">Du mottar dette fordi du abonnerer på vårt nyhetsbrev.</p>
<p style="font-size:12px;color:#999;margin:8px 0 0;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#0ea5e9;">Meld deg av</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function htmlToBlocks(html: string): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  let id = 1;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // Find the inner content cell (first td with padding:32px 40px)
  const cells = doc.querySelectorAll("td");
  let contentCell: Element | null = null;
  for (const cell of cells) {
    const style = cell.getAttribute("style") || "";
    if (style.includes("padding:32px 40px") || style.includes("padding: 32px 40px")) {
      contentCell = cell;
      break;
    }
  }
  if (!contentCell) return [];
  
  for (const child of contentCell.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      blocks.push({ id: String(id++), type: "heading", content: child.textContent || "", props: { level: tag.replace("h", "") } });
    } else if (tag === "p") {
      blocks.push({ id: String(id++), type: "text", content: child.textContent || "", props: {} });
    } else if (tag === "hr") {
      blocks.push({ id: String(id++), type: "divider", content: "", props: {} });
    } else if (tag === "img") {
      blocks.push({ id: String(id++), type: "image", content: "", props: { src: child.getAttribute("src") || "", alt: child.getAttribute("alt") || "" } });
    } else if (tag === "div") {
      const style = child.getAttribute("style") || "";
      if (style.includes("height:")) {
        const m = style.match(/height:\s*(\d+)/);
        blocks.push({ id: String(id++), type: "spacer", content: "", props: { height: m?.[1] || "24" } });
      }
    } else if (tag === "table") {
      // Could be a button
      const link = child.querySelector("a");
      const td = child.querySelector("td");
      if (link) {
        const tdStyle = td?.getAttribute("style") || "";
        const bgMatch = tdStyle.match(/background:\s*(#[a-fA-F0-9]+)/);
        blocks.push({
          id: String(id++), type: "button",
          content: link.textContent?.trim() || "Klikk her",
          props: {
            url: link.getAttribute("href") || "#",
            bgColor: bgMatch?.[1] || "#0ea5e9",
            textColor: "#ffffff",
          },
        });
      }
    }
  }
  return blocks;
}

const defaultBlocks: EmailBlock[] = [
  { id: "1", type: "heading", content: "Hei! 👋", props: { level: "1" } },
  { id: "2", type: "text", content: "Her er siste nytt fra AviSafe.", props: {} },
  { id: "3", type: "divider", content: "", props: {} },
  { id: "4", type: "text", content: "Skriv innholdet ditt her...", props: {} },
  { id: "5", type: "button", content: "Les mer", props: { url: "https://avisafe.no", bgColor: "#0ea5e9", textColor: "#ffffff" } },
];

/* ─── Main component ─── */
export const MarketingNewsletter = () => {
  const [tab, setTab] = useState("subscribers");
  const signupUrl = "https://app.avisafe.no/nyhetsbrev";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Nyhetsbrev</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Påmeldingslenke:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded select-all">{signupUrl}</code>
          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(signupUrl); toast({ title: "Kopiert!" }); }}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="subscribers" className="gap-1"><Users className="w-3.5 h-3.5" /> Abonnenter</TabsTrigger>
          <TabsTrigger value="compose" className="gap-1"><FileEdit className="w-3.5 h-3.5" /> Skriv</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="w-3.5 h-3.5" /> Historikk</TabsTrigger>
        </TabsList>
        <TabsContent value="subscribers"><SubscribersTab /></TabsContent>
        <TabsContent value="compose"><ComposeTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
};

/* ─── Subscribers ─── */
const SubscribersTab = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeNewsletter("list-contacts");
      setContacts(res?.data ?? []);
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!email) return;
    try {
      await invokeNewsletter("add-contact", { email, first_name: firstName, last_name: lastName });
      toast({ title: "Lagt til" });
      setEmail(""); setFirstName(""); setLastName("");
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const removeContact = async (id: string) => {
    try {
      await invokeNewsletter("remove-contact", { contact_id: id });
      toast({ title: "Fjernet" });
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const importContacts = async () => {
    const emails = importText.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
    if (!emails.length) return;
    try {
      const res = await invokeNewsletter("import-contacts", { emails });
      const ok = res.imported?.filter((r: any) => r.ok).length ?? 0;
      toast({ title: `Importert ${ok} av ${emails.length} kontakter` });
      setImportText("");
      setShowImport(false);
      load();
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const subscribed = contacts.filter(c => !c.unsubscribed);
  const unsubscribed = contacts.filter(c => c.unsubscribed);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[150px]"><Label className="text-xs">E-post</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="e@post.no" /></div>
        <div className="min-w-[100px]"><Label className="text-xs">Fornavn</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div className="min-w-[100px]"><Label className="text-xs">Etternavn</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        <Button size="sm" onClick={addContact}><Plus className="w-4 h-4 mr-1" />Legg til</Button>
        <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}><Upload className="w-4 h-4 mr-1" />Importer</Button>
      </div>

      {showImport && (
        <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
          <Label className="text-xs">Lim inn e-poster (komma-, semikolon- eller linjeskilt)</Label>
          <Textarea value={importText} onChange={e => setImportText(e.target.value)} rows={3} placeholder="a@b.no, c@d.no" />
          <Button size="sm" onClick={importContacts}>Importer alle</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{subscribed.length} aktive abonnenter{unsubscribed.length > 0 && `, ${unsubscribed.length} avmeldt`}</p>
          <div className="rounded-md border overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-post</TableHead>
                  <TableHead className="hidden sm:table-cell">Navn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.email}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.unsubscribed ? "secondary" : "default"} className="text-[10px]">
                        {c.unsubscribed ? "Avmeldt" : "Aktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeContact(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {contacts.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">Ingen kontakter enda</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── Image Block Properties ─── */
const ImageBlockProps = ({ block, onUpdateProps, onUpdateContent }: {
  block: EmailBlock;
  onUpdateProps: (key: string, val: string) => void;
  onUpdateContent: (val: string) => void;
}) => {
  const { companyId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploading(true);
    try {
      const path = `${companyId}/newsletter/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("marketing-media").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("marketing-media").getPublicUrl(path);
      onUpdateProps("src", urlData.publicUrl);
      toast({ title: "Bilde lastet opp!" });
    } catch (err: any) {
      toast({ title: "Feil ved opplasting", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleMediaSelect = async (mediaIds: string[]) => {
    if (!mediaIds.length) return;
    // Fetch the URL of the first selected media
    const { data } = await supabase.from("marketing_media").select("file_url").eq("id", mediaIds[0]).single();
    if (data?.file_url) {
      onUpdateProps("src", data.file_url);
      toast({ title: "Bilde valgt fra biblioteket" });
    }
  };

  return (
    <>
      {block.props.src && (
        <div className="rounded-md overflow-hidden border border-border">
          <img src={block.props.src} alt="Preview" className="w-full h-auto max-h-32 object-cover" />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-xs">Bilde</Label>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            Last opp
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setShowMediaPicker(true)}>
            <ImagePlus className="w-3.5 h-3.5 mr-1" />Bibliotek
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>
      <div>
        <Label className="text-xs">Eller lim inn URL</Label>
        <Input value={block.props.src || ""} onChange={e => onUpdateProps("src", e.target.value)} placeholder="https://..." className="text-xs" />
      </div>
      <div>
        <Label className="text-xs">Alt-tekst</Label>
        <Input value={block.content} onChange={e => onUpdateContent(e.target.value)} className="text-xs" />
      </div>
      <MediaLibraryPickerDialog
        open={showMediaPicker}
        onOpenChange={setShowMediaPicker}
        onSelect={handleMediaSelect}
      />
    </>
  );
};

/* ─── Compose (Visual Editor) ─── */
const ComposeTab = () => {
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([...defaultBlocks]);
  const [sending, setSending] = useState(false);
  
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data } = await supabase.from("newsletter_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data as any[]) ?? []);
  };

  const addBlock = (type: BlockType) => {
    const newBlock: EmailBlock = {
      id: crypto.randomUUID(),
      type,
      content: type === "heading" ? "Overskrift" : type === "text" ? "Tekst her..." : type === "button" ? "Klikk her" : "",
      props: type === "heading" ? { level: "1" } : type === "button" ? { url: "#", bgColor: "#0ea5e9", textColor: "#ffffff" } : type === "spacer" ? { height: "24" } : {},
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlock(newBlock.id);
  };

  const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const updateBlockProps = (id: string, key: string, value: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlock === id) setSelectedBlock(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0 || idx + dir < 0 || idx + dir >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      return arr;
    });
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const html = blocksToHtml(blocks);
    await supabase.from("newsletter_templates").insert({
      name: templateName,
      subject,
      html_content: html,
    } as any);
    toast({ title: "Mal lagret!" });
    setTemplateName("");
    setShowSaveDialog(false);
    loadTemplates();
  };

  const loadTemplate = (tpl: NewsletterTemplate) => {
    setSubject(tpl.subject);
    const parsed = htmlToBlocks(tpl.html_content);
    setBlocks(parsed.length > 0 ? parsed : [...defaultBlocks]);
    setSelectedBlock(null);
    toast({ title: `Mal «${tpl.name}» lastet` });
    setShowLoadDialog(false);
  };

  const sendNow = async () => {
    if (!subject) {
      toast({ title: "Fyll ut emne", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const html = blocksToHtml(blocks);
      const broadcast = await invokeNewsletter("create-broadcast", { subject, html });
      await invokeNewsletter("send-broadcast", { broadcast_id: broadcast.id });
      toast({ title: "Nyhetsbrev sendt!" });
      setSubject("");
      setBlocks([...defaultBlocks]);
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const selected = blocks.find(b => b.id === selectedBlock);
  const generatedHtml = blocksToHtml(blocks);

  return (
    <div className="space-y-4 mt-2">
      {/* Subject */}
      <div>
        <Label>Emne</Label>
        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Emne for nyhetsbrevet" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Legg til:</span>
        <Button size="sm" variant="outline" onClick={() => addBlock("heading")}><Type className="w-3.5 h-3.5 mr-1" />Overskrift</Button>
        <Button size="sm" variant="outline" onClick={() => addBlock("text")}><FileEdit className="w-3.5 h-3.5 mr-1" />Tekst</Button>
        <Button size="sm" variant="outline" onClick={() => addBlock("button")}><MousePointerClick className="w-3.5 h-3.5 mr-1" />Knapp</Button>
        <Button size="sm" variant="outline" onClick={() => addBlock("image")}><Image className="w-3.5 h-3.5 mr-1" />Bilde</Button>
        <Button size="sm" variant="outline" onClick={() => addBlock("divider")}><Minus className="w-3.5 h-3.5 mr-1" />Linje</Button>
        <Button size="sm" variant="outline" onClick={() => addBlock("spacer")}>Mellomrom</Button>
        <div className="ml-auto flex gap-1">
          <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary"><Save className="w-3.5 h-3.5 mr-1" />Lagre mal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Lagre som mal</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Malnavn</Label><Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="F.eks. Månedlig oppdatering" /></div>
                <Button onClick={saveTemplate} disabled={!templateName.trim()}>Lagre</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary"><FolderOpen className="w-3.5 h-3.5 mr-1" />Last mal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Velg mal</DialogTitle></DialogHeader>
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Ingen lagrede maler enda.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-auto">
                  {templates.map(t => (
                    <button key={t.id} className="w-full text-left p-3 rounded-md border border-border hover:bg-accent/10 transition-colors" onClick={() => loadTemplate(t)}>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.subject || "Uten emne"}</p>
                    </button>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Live editable preview + properties panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Live email preview - editable */}
        <div className="border border-border rounded-lg overflow-hidden bg-[#f4f4f7]">
          <div className="flex justify-center py-8 px-4">
            <div className="w-full max-w-[600px] bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-8 space-y-0">
                {blocks.map((block, idx) => (
                  <div
                    key={block.id}
                    className={`group relative rounded transition-all cursor-pointer ${selectedBlock === block.id ? "ring-2 ring-primary ring-offset-2" : "hover:ring-1 hover:ring-primary/30 hover:ring-offset-1"}`}
                    onClick={() => setSelectedBlock(block.id)}
                  >
                    {/* Hover controls */}
                    <div className="absolute -top-3 right-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <Button size="icon" variant="secondary" className="h-5 w-5 rounded-full shadow-sm" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }} disabled={idx === 0}><ArrowUp className="w-2.5 h-2.5" /></Button>
                      <Button size="icon" variant="secondary" className="h-5 w-5 rounded-full shadow-sm" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }} disabled={idx === blocks.length - 1}><ArrowDown className="w-2.5 h-2.5" /></Button>
                      <Button size="icon" variant="destructive" className="h-5 w-5 rounded-full shadow-sm" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}><Trash2 className="w-2.5 h-2.5" /></Button>
                    </div>

                    {/* Inline-editable block rendering */}
                    {block.type === "heading" && (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className={`outline-none font-bold ${block.props.level === "2" ? "text-xl" : "text-2xl"} mb-4 break-words whitespace-pre-wrap`}
                        style={{ color: block.props.color || "#1a1a2e", fontFamily: "Arial, sans-serif" }}
                        onBlur={e => updateBlock(block.id, { content: e.currentTarget.textContent || "" })}
                        dangerouslySetInnerHTML={{ __html: block.content }}
                      />
                    )}
                    {block.type === "text" && (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="outline-none text-[15px] leading-relaxed mb-4 break-words whitespace-pre-wrap"
                        style={{ color: "#444", fontFamily: "Arial, sans-serif" }}
                        onBlur={e => updateBlock(block.id, { content: e.currentTarget.textContent || "" })}
                        dangerouslySetInnerHTML={{ __html: block.content }}
                      />
                    )}
                    {block.type === "button" && (
                      <div className="my-4">
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          className="inline-block outline-none rounded-md px-7 py-3 font-semibold text-[15px]"
                          style={{ background: block.props.bgColor || "#0ea5e9", color: block.props.textColor || "#fff", fontFamily: "Arial, sans-serif" }}
                          onBlur={e => updateBlock(block.id, { content: e.currentTarget.textContent || "" })}
                          dangerouslySetInnerHTML={{ __html: block.content }}
                        />
                      </div>
                    )}
                    {block.type === "divider" && (
                      <hr className="border-t border-[#e2e8f0] my-6" />
                    )}
                    {block.type === "image" && (
                      <div className="my-4">
                        {block.props.src ? (
                          <img src={block.props.src} alt={block.content} className="max-w-full h-auto rounded-lg" />
                        ) : (
                          <div className="h-32 bg-muted/50 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                            <Image className="w-5 h-5 mr-2" />Velg et bilde
                          </div>
                        )}
                      </div>
                    )}
                    {block.type === "spacer" && (
                      <div style={{ height: `${block.props.height || 24}px` }} />
                    )}
                  </div>
                ))}
                {blocks.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">Legg til blokker for å bygge nyhetsbrevet</p>
                )}
              </div>
              {/* Footer preview */}
              <div className="bg-[#f9fafb] px-10 py-5 text-center">
                <p className="text-xs text-[#999] m-0">Du mottar dette fordi du abonnerer på vårt nyhetsbrev.</p>
                <p className="text-xs text-[#999] mt-2"><span className="text-[#0ea5e9] underline cursor-default">Meld deg av</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* Properties panel */}
        <div className="border border-border rounded-lg p-3 bg-card/50 space-y-3 h-fit sticky top-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Egenskaper</p>
          {selected ? (
            <>
              <Badge variant="secondary" className="text-[10px]">
                {selected.type === "heading" ? "Overskrift" : selected.type === "text" ? "Tekst" : selected.type === "button" ? "Knapp" : selected.type === "divider" ? "Linje" : selected.type === "image" ? "Bilde" : "Mellomrom"}
              </Badge>
              {selected.type === "heading" && (
                <div>
                  <Label className="text-xs">Nivå</Label>
                  <Select value={selected.props.level || "1"} onValueChange={v => updateBlockProps(selected.id, "level", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">H1 — Stor</SelectItem>
                      <SelectItem value="2">H2 — Medium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selected.type === "button" && (
                <>
                  <div><Label className="text-xs">URL</Label><Input value={selected.props.url || ""} onChange={e => updateBlockProps(selected.id, "url", e.target.value)} placeholder="https://..." /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Bakgrunn</Label><Input type="color" value={selected.props.bgColor || "#0ea5e9"} onChange={e => updateBlockProps(selected.id, "bgColor", e.target.value)} className="h-8 p-1" /></div>
                    <div><Label className="text-xs">Tekst</Label><Input type="color" value={selected.props.textColor || "#ffffff"} onChange={e => updateBlockProps(selected.id, "textColor", e.target.value)} className="h-8 p-1" /></div>
                  </div>
                </>
              )}
              {selected.type === "image" && (
                <ImageBlockProps
                  block={selected}
                  onUpdateProps={(key, val) => updateBlockProps(selected.id, key, val)}
                  onUpdateContent={(val) => updateBlock(selected.id, { content: val })}
                />
              )}
              {selected.type === "spacer" && (
                <div><Label className="text-xs">Høyde (px)</Label><Input type="number" value={selected.props.height || "24"} onChange={e => updateBlockProps(selected.id, "height", e.target.value)} /></div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Velg en blokk for å redigere</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={sendNow} disabled={sending}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
          Send nå
        </Button>
      </div>
    </div>
  );
};

/* ─── History ─── */
const HistoryTab = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await invokeNewsletter("list-broadcasts");
        setBroadcasts(res ?? []);
      } catch (e: any) {
        toast({ title: "Feil", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mt-2">
      {broadcasts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Ingen sendte nyhetsbrev enda</p>
      ) : (
        <div className="rounded-md border overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emne</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sendt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="text-sm font-medium">{b.subject}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "sent" ? "default" : "secondary"} className="text-[10px]">{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.sent_at ? format(new Date(b.sent_at), "dd. MMM yyyy HH:mm", { locale: nb }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
