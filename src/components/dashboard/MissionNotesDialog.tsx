import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Profile = Tables<"profiles">;
type Mission = {
  id: string;
  tittel?: string | null;
  lokasjon?: string | null;
  tidspunkt?: string | null;
  merknader?: string | null;
};

interface MissionNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onSaved: () => void;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractMentionedProfileIds = (text: string, profiles: Profile[]) => {
  const mentioned = new Set<string>();
  profiles.forEach((profile) => {
    const name = profile.full_name?.trim();
    if (!name) return;
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:)\\]])`, "i");
    if (pattern.test(text)) mentioned.add(profile.id);
  });
  return mentioned;
};

export const MissionNotesDialog = ({ open, onOpenChange, mission, onSaved }: MissionNotesDialogProps) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.trim().toLowerCase();
    return profiles
      .filter((profile) => {
        const name = profile.full_name?.trim();
        return name && (!query || name.toLowerCase().includes(query));
      })
      .slice(0, 6);
  }, [mentionQuery, profiles]);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setMentionQuery(null);
    setMentionStart(null);

    const fetchProfiles = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setCurrentProfile(profile || null);
      if (!profile?.company_id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("approved", true)
        .eq("company_id", profile.company_id)
        .order("full_name");
      if (error) {
        console.error("Error fetching mention profiles:", error);
        return;
      }
      setProfiles(data || []);
    };

    fetchProfiles();
  }, [open]);

  const updateMentionState = (value: string, cursorPosition: number) => {
    const beforeCursor = value.slice(0, cursorPosition);
    const match = beforeCursor.match(/(^|\s)@([^@\s]*)$/);
    if (match) {
      setMentionStart(cursorPosition - match[2].length - 1);
      setMentionQuery(match[2]);
    } else {
      setMentionStart(null);
      setMentionQuery(null);
    }
  };

  const insertMention = (profile: Profile) => {
    const name = profile.full_name?.trim();
    if (!name || mentionStart === null) return;
    const cursor = textareaRef.current?.selectionStart ?? note.length;
    const nextValue = `${note.slice(0, mentionStart)}@${name} ${note.slice(cursor)}`;
    const nextCursor = mentionStart + name.length + 2;
    setNote(nextValue);
    setMentionStart(null);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const sendMentionNotifications = async (missionId: string, savedNote: string) => {
    if (!currentProfile?.company_id || !currentProfile.id) return;
    const mentionedIds = [...extractMentionedProfileIds(savedNote, profiles)].filter((id) => id !== currentProfile.id);
    if (!mentionedIds.length) return;

    await Promise.all(mentionedIds.map((recipientId) => supabase.functions.invoke("send-notification-email", {
      body: {
        type: "notify_mission_mention",
        companyId: currentProfile.company_id,
        missionId,
        missionMention: {
          recipientId,
          senderId: currentProfile.id,
          senderName: currentProfile.full_name || "En kollega",
          missionTitle: mission?.tittel || "Oppdrag uten tittel",
          missionLocation: mission?.lokasjon || "Ikke oppgitt",
          missionDate: mission?.tidspunkt || new Date().toISOString(),
          missionNote: savedNote,
        },
      },
    })));
  };

  const handleSave = async () => {
    if (!mission?.id || !note.trim()) return;
    setLoading(true);
    try {
      const now = new Date().toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const author = currentProfile?.full_name || "Ukjent bruker";
      const savedNote = `[${now}] ${author}:\n${note.trim()}`;
      const nextNotes = [mission.merknader, savedNote].filter(Boolean).join("\n\n");
      const { error } = await supabase.from("missions").update({ merknader: nextNotes }).eq("id", mission.id);
      if (error) throw error;
      await sendMentionNotifications(mission.id, savedNote);
      toast.success("Merknad lagret");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving mission note:", error);
      toast.error("Kunne ikke lagre merknad");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle>Legg til merknad</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mission?.merknader && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {mission.merknader}
            </div>
          )}
          <div>
            <Label htmlFor="new-mission-note">Ny merknad</Label>
            <div className="relative mt-1">
              <Textarea
                ref={textareaRef}
                id="new-mission-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  updateMentionState(e.target.value, e.target.selectionStart);
                }}
                onKeyUp={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
                onClick={(e) => updateMentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
                rows={4}
                placeholder="Skriv ny merknad... Bruk @ for å tagge personer"
              />
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  {mentionSuggestions.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(profile);
                      }}
                    >
                      <span className="truncate">{profile.full_name || "Ukjent bruker"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="button" onClick={handleSave} disabled={loading || !note.trim()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Lagre merknad
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};