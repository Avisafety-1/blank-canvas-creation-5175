import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CampaignHistorySection } from "@/components/admin/CampaignHistorySection";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Users, UserCog, Eye, Loader2, Code, Eye as EyeIcon, Globe, FlaskConical, Image as ImageIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

type RecipientType = "users" | "customers" | "all_users";

export const BulkEmailSender = () => {
  const { companyId, user } = useAuth();
  const { isSuperAdmin } = useRoleCheck();
  const isMobile = useIsMobile();
  const [recipientType, setRecipientType] = useState<RecipientType>("users");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [allUsersCount, setAllUsersCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const quillRef = useRef<ReactQuill>(null);

  useEffect(() => {
    if (companyId) {
      fetchCounts();
    }
  }, [companyId, isSuperAdmin]);

  const fetchCounts = async () => {
    if (!companyId) return;

    try {
      // Fetch user count (approved users with email in current company)
      const { count: users, error: usersError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("approved", true)
        .not("email", "is", null);

      if (usersError) throw usersError;
      setUserCount(users || 0);

      // Fetch customer count (active customers with email)
      const { count: customers, error: customersError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("aktiv", true)
        .not("epost", "is", null);

      if (customersError) throw customersError;
      setCustomerCount(customers || 0);

      // Fetch all users count for superadmin via edge function (bypasses RLS)
      if (isSuperAdmin) {
        try {
          const { data, error: allUsersError } = await supabase.functions.invoke("count-all-users");
          
          if (allUsersError) {
            console.error("Error fetching all users count:", allUsersError);
          } else {
            setAllUsersCount(data?.count || 0);
          }
        } catch (err) {
          console.error("Error calling count-all-users:", err);
        }
      }
    } catch (error) {
      console.error("Error fetching counts:", error);
    }
  };

  const uploadImageFile = async (file: File): Promise<string | null> => {
    if (!companyId) {
      toast.error("Ingen bedrift valgt");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Kun bildefiler er tillatt");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Bildet er for stort (maks 5 MB)");
      return null;
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `${companyId}/bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("email-images").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      toast.error("Kunne ikke laste opp bilde: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("email-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleQuillImageUpload = () => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadImageFile(file);
      if (!url) return;
      const editor = quillRef.current?.getEditor();
      if (!editor) return;
      const range = editor.getSelection(true);
      editor.insertEmbed(range.index, "image", url, "user");
      editor.setSelection(range.index + 1, 0);
      toast.success("Bilde lagt til");
    };
  };

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: handleQuillImageUpload,
        },
      },
    }),
    [companyId]
  );

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "list",
    "bullet",
    "align",
    "link",
    "image",
  ];

  const handleHtmlImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = await uploadImageFile(file);
    if (!url) return;
    const imgTag = `<img src="${url}" alt="" style="max-width:100%;height:auto;" />`;
    setContent((prev) => prev + "\n" + imgTag);
    toast.success("Bilde lagt til i HTML");
  };

  const wrapContentInEmailTemplate = (htmlContent: string) => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { 
        font-family: Arial, sans-serif; 
        line-height: 1.6; 
        color: #333; 
        margin: 0;
        padding: 0;
        background-color: #f4f4f4;
      }
      .container { 
        max-width: 600px; 
        margin: 20px auto; 
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .content { 
        padding: 30px; 
      }
      .footer { 
        background: #f9f9f9;
        padding: 20px 30px;
        text-align: center; 
        font-size: 12px; 
        color: #888;
        border-top: 1px solid #eee;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        ${htmlContent}
      </div>
      <div class="footer">
        <p style="font-size: 11px; color: #aaa;">Dette er en automatisk generert e-post.</p>
      </div>
    </div>
  </body>
</html>`;
  };

  const handleVisualEditorChange = (value: string) => {
    const wrappedContent = wrapContentInEmailTemplate(value);
    setContent(wrappedContent);
  };

  const getVisualEditorContent = () => {
    const match = content.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return content;
  };

  const handleSendClick = () => {
    if (!subject.trim()) {
      toast.error("Vennligst skriv inn et emne");
      return;
    }
    if (!content.trim()) {
      toast.error("Vennligst skriv inn innhold");
      return;
    }
    const count = recipientType === "users" ? userCount : recipientType === "customers" ? customerCount : allUsersCount;
    if (count === 0) {
      toast.error("Ingen mottakere å sende til");
      return;
    }
    setConfirmOpen(true);
  };

  const sendEmail = async (dryRun: boolean) => {
    if (!companyId) {
      toast.error("Feil: Ingen bedrift valgt");
      return;
    }

    setSending(true);
    try {
      const emailType = recipientType === "users" 
        ? "bulk_email_users" 
        : recipientType === "customers" 
          ? "bulk_email_customers" 
          : "bulk_email_all_users";
      
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: {
          type: emailType,
          companyId,
          subject,
          htmlContent: content,
          sentBy: user?.id,
          dry_run: dryRun,
        },
      });

      if (error) throw error;

      const sentCount = data?.emailsSent || 0;
      if (dryRun) {
        toast.success(`[DRY RUN] ${sentCount} mottakere ville ha fått e-post — kampanjen er lagret i historikken`);
      } else {
        toast.success(`Sender e-post til ${sentCount} mottaker${sentCount !== 1 ? "e" : ""} — kampanje opprettet. Sjekk historikken om noen minutter for faktisk status.`);
        // Reset form only on real send
        setSubject("");
        setContent("");
      }
    } catch (error: any) {
      console.error("Error sending bulk email:", error);
      toast.error("Kunne ikke sende e-post: " + error.message);
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const handleSend = () => sendEmail(false);
  const handleDryRun = async () => {
    if (!subject.trim()) { toast.error("Vennligst skriv inn et emne"); return; }
    if (!content.trim()) { toast.error("Vennligst skriv inn innhold"); return; }
    await sendEmail(true);
  };

  const recipientCount = recipientType === "users" ? userCount : recipientType === "customers" ? customerCount : allUsersCount;

  return (
    <>
      <GlassCard className="p-3 sm:p-6 mt-4 sm:mt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">Send e-post til grupper <span className="text-xs text-muted-foreground font-normal">v.2</span></h2>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={!content.trim()}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              <Eye className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"}`} />
              {isMobile ? "Vis" : "Forhåndsvis"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={sending || recipientCount === 0}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              {sending ? (
                <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
              ) : (
                <FlaskConical className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
              )}
              {isMobile ? "Test" : "Test (dry run)"}
            </Button>
            <Button
              onClick={handleSendClick}
              disabled={sending || recipientCount === 0}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              {sending ? (
                <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
              ) : (
                <Send className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
              )}
              {sending ? "Sender..." : `Send til ${recipientCount}`}
            </Button>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Recipient Selection */}
          <div className="space-y-3">
            <Label className="text-xs sm:text-sm">Mottakere</Label>
            <RadioGroup
              value={recipientType}
              onValueChange={(value) => setRecipientType(value as RecipientType)}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/5 cursor-pointer">
                <RadioGroupItem value="users" id="users" />
                <Label htmlFor="users" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm sm:text-base">Alle brukere (min bedrift)</span>
                  <span className="ml-auto text-sm text-muted-foreground">{userCount} mottakere</span>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/5 cursor-pointer">
                <RadioGroupItem value="customers" id="customers" />
                <Label htmlFor="customers" className="flex items-center gap-2 cursor-pointer flex-1">
                  <UserCog className="h-4 w-4 text-primary" />
                  <span className="text-sm sm:text-base">Alle kunder</span>
                  <span className="ml-auto text-sm text-muted-foreground">{customerCount} mottakere</span>
                </Label>
              </div>
              {isSuperAdmin && (
                <div className="flex items-center space-x-3 p-3 rounded-lg border border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer">
                  <RadioGroupItem value="all_users" id="all_users" />
                  <Label htmlFor="all_users" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Globe className="h-4 w-4 text-amber-600" />
                    <span className="text-sm sm:text-base font-medium">Alle brukere (alle selskaper)</span>
                    <span className="ml-auto text-sm text-amber-600 font-medium">{allUsersCount} mottakere</span>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="bulk-subject" className="text-xs sm:text-sm">
              Emne
            </Label>
            <Input
              id="bulk-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Skriv inn e-post emne..."
              className={isMobile ? "h-9 text-sm" : ""}
            />
          </div>

          {/* Content Editor */}
          <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as "visual" | "html")}>
            <TabsList className={`grid w-full grid-cols-2 ${isMobile ? "h-8" : "max-w-md"}`}>
              <TabsTrigger value="visual" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? "text-xs" : ""}`}>
                <EyeIcon className={`${isMobile ? "h-3 w-3" : "h-4 w-4"}`} />
                {isMobile ? "Visuell" : "Visuell Editor"}
              </TabsTrigger>
              <TabsTrigger value="html" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? "text-xs" : ""}`}>
                <Code className={`${isMobile ? "h-3 w-3" : "h-4 w-4"}`} />
                {isMobile ? "HTML" : "HTML Kode"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">E-post innhold</Label>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <style>{`
                    .bulk-quill-container .ql-container {
                      min-height: ${isMobile ? "300px" : "400px"};
                    }
                    .bulk-quill-container .ql-editor {
                      min-height: ${isMobile ? "260px" : "360px"};
                    }
                  `}</style>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={getVisualEditorContent()}
                    onChange={handleVisualEditorChange}
                    modules={modules}
                    formats={formats}
                    placeholder="Skriv inn e-postinnholdet her..."
                    className="bulk-quill-container"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="html" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="bulk-content" className="text-xs sm:text-sm">
                    E-post innhold (HTML)
                  </Label>
                  <Label
                    htmlFor="bulk-html-image-upload"
                    className="inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border border-border hover:bg-accent/10"
                  >
                    <ImageIcon className="h-3 w-3" />
                    Last opp bilde
                    <input
                      id="bulk-html-image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleHtmlImageUpload}
                    />
                  </Label>
                </div>
                <textarea
                  id="bulk-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Skriv inn HTML-innhold..."
                  className={`w-full border rounded-lg p-3 font-mono text-sm min-h-[300px] sm:min-h-[400px] bg-background resize-y`}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </GlassCard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={`${isMobile ? "max-w-[95vw]" : "max-w-3xl"} max-h-[80vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={isMobile ? "text-base" : "text-lg"}>
              Forhåndsvisning
            </DialogTitle>
            <DialogDescription className={isMobile ? "text-xs" : "text-sm"}>
              Emne: {subject || "(Ikke angitt)"}
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div
              className="p-4"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft sending</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil sende denne e-posten til{" "}
              <strong>{recipientCount} {recipientType === "users" ? "brukere" : recipientType === "customers" ? "kunder" : "brukere i alle selskaper"}</strong>?
              {recipientType === "all_users" && (
                <span className="block mt-2 text-amber-600 font-medium">
                  Advarsel: Dette sender e-post til ALLE brukere i systemet!
                </span>
              )}
              <br /><br />
              <strong>Emne:</strong> {subject}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sender...
                </>
              ) : (
                "Send e-post"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const BulkEmailSenderWithHistory = () => (
  <>
    <BulkEmailSender />
    <CampaignHistorySection />
  </>
);
