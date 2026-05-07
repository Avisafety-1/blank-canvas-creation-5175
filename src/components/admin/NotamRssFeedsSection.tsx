import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Rss, RefreshCw, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface RssFeed {
  id: string;
  name: string;
  feed_url: string;
  enabled: boolean;
  created_at: string;
}

export function NotamRssFeedsSection() {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchFeeds();
  }, []);

  const fetchFeeds = async () => {
    const { data, error } = await supabase
      .from("notam_rss_feeds" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching RSS feeds:", error);
    } else {
      setFeeds((data as any) || []);
    }
    setLoading(false);
  };

  const addFeed = async () => {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error("Fyll inn navn og URL");
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .insert({ name: newName.trim(), feed_url: newUrl.trim() } as any);
    if (error) {
      toast.error("Kunne ikke legge til feed: " + error.message);
    } else {
      toast.success("RSS-feed lagt til");
      setNewName("");
      setNewUrl("");
      fetchFeeds();
    }
    setAdding(false);
  };

  const toggleFeed = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .update({ enabled } as any)
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke oppdatere feed");
    } else {
      setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled } : f));
    }
  };

  const deleteFeed = async (id: string) => {
    const { error } = await supabase
      .from("notam_rss_feeds" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke slette feed");
    } else {
      setFeeds(prev => prev.filter(f => f.id !== id));
      toast.success("Feed slettet");
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-notams");
      if (error) throw error;
      toast.success(`NOTAM-synk fullført: ${data?.upserted || 0} oppdatert (kilde: ${data?.source || "ukjent"})`);
    } catch (err: any) {
      toast.error("Synkronisering feilet: " + (err?.message || String(err)));
    }
    setSyncing(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rss className="h-5 w-5" />
              NOTAM RSS-feeder
            </CardTitle>
            <CardDescription>
              Konfigurer RSS-feeder fra notaminfo.com for å hente NOTAMs. Legg til flere feeder for å dekke hele Norge.
            </CardDescription>
          </div>
          <Button onClick={syncNow} disabled={syncing} size="sm" variant="outline">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Synk nå
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feeds.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen feeder konfigurert. Legg til minst én RSS-feed for å hente NOTAMs.</p>
        )}
        {feeds.map(feed => (
          <div key={feed.id} className="flex items-center gap-3 p-3 border rounded-lg">
            <Switch
              checked={feed.enabled}
              onCheckedChange={(checked) => toggleFeed(feed.id, checked)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{feed.name}</span>
                <Badge variant={feed.enabled ? "default" : "secondary"} className="text-xs">
                  {feed.enabled ? "Aktiv" : "Inaktiv"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{feed.feed_url}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteFeed(feed.id)}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="border-t pt-4 space-y-3">
          <Label className="text-sm font-medium">Legg til ny feed</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Navn (f.eks. Nord-Norge)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="https://notaminfo.com/feed?u=..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-[2]"
            />
            <Button onClick={addFeed} disabled={adding} size="icon" className="shrink-0">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Opprett kontoer på notaminfo.com med ulike dekningsområder, og legg til RSS-feed-URLene her.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
