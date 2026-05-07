import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Download, Loader2, Image, Upload } from "lucide-react";
import { VisualGeneratorDialog } from "./VisualGeneratorDialog";

export const MarketingVisuals = () => {
  const { companyId, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: media = [], isLoading, isError } = useQuery({
    queryKey: ["marketing-media", companyId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("marketing_media")
        .select("*")
        .order("created_at", { ascending: false });

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !authLoading,
  });

  const handleDelete = async (id: string, fileUrl: string) => {
    // Extract path from URL for storage deletion
    const pathMatch = fileUrl.match(/marketing-media\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from("marketing-media").remove([pathMatch[1]]);
    }
    const { error } = await supabase.from("marketing_media").delete().eq("id", id);
    if (error) {
      toast.error("Kunne ikke slette");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
    toast.success("Visuell slettet");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Visuelle</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={uploading || !companyId}
            onClick={() => document.getElementById('visuals-upload')?.click()}
            className="gap-1.5 flex-1 sm:flex-none"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Last opp
          </Button>
          <input
            id="visuals-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !companyId) return;
              setUploading(true);
              try {
                const ext = file.name.split('.').pop();
                const path = `${companyId}/uploads/${Date.now()}-${file.name}`;
                const { error: upErr } = await supabase.storage.from("marketing-media").upload(path, file);
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from("marketing-media").getPublicUrl(path);
                const { error: dbErr } = await supabase.from("marketing_media").insert({
                  company_id: companyId,
                  title: file.name.replace(/\.[^.]+$/, ''),
                  file_url: urlData.publicUrl,
                  source_type: "upload",
                  image_format: ext || "jpg",
                });
                if (dbErr) throw dbErr;
                queryClient.invalidateQueries({ queryKey: ["marketing-media"] });
                toast.success("Bilde lastet opp");
              } catch (err: any) {
                toast.error(err.message || "Opplasting feilet");
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
          <Button size="sm" onClick={() => setGeneratorOpen(true)} className="gap-1.5 flex-1 sm:flex-none">
            <Plus className="w-4 h-4" />
            Generer visuell
          </Button>
        </div>
      </div>

      {authLoading || isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Kunne ikke laste visuelle akkurat nå.</p>
        </div>
      ) : media.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Ingen visuelle ennå. Generer din første!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {media.map((item: any) => (
            <div key={item.id} className="rounded-lg border border-border bg-card overflow-hidden group">
              <div className="aspect-square bg-muted/30 relative">
                <img
                  src={item.file_url}
                  alt={item.title || "Marketing visual"}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(item.file_url, "_blank")}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(item.id, item.file_url)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium text-foreground truncate">{item.title || "Uten tittel"}</p>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{item.source_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{item.image_format}</Badge>
                  {item.layout_template && (
                    <Badge variant="secondary" className="text-[10px]">{item.layout_template}</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <VisualGeneratorDialog open={generatorOpen} onOpenChange={setGeneratorOpen} />
    </div>
  );
};
