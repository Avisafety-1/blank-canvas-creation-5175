import { supabase } from "@/integrations/supabase/client";
import { generateDJIKMZ, sanitizeFilename } from "@/lib/kmzExport";
import { toast } from "sonner";

type Mission = any;

export const exportToKMZ = async (
  mission: Mission,
  userId: string | undefined,
  companyId: string | undefined
) => {
  const route = mission.route as { coordinates: { lat: number; lng: number }[]; totalDistance: number } | null;
  
  if (!route?.coordinates?.length) {
    toast.error("Oppdraget har ingen planlagt rute");
    return;
  }
  
  try {
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    const opprettetAv = userProfile?.full_name || 'Ukjent';

    const blob = await generateDJIKMZ(
      mission.tittel || 'Oppdrag',
      route,
      50
    );
    
    const fileName = `${sanitizeFilename(mission.tittel || 'oppdrag')}-${Date.now()}.kmz`;
    const filePath = `${companyId}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, blob, {
        contentType: 'application/vnd.google-earth.kmz',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    const { error: insertError } = await supabase
      .from('documents')
      .insert({
        tittel: `KMZ - ${mission.tittel}`,
        beskrivelse: `Eksportert rutefil for DJI Pilot 2 - ${mission.tittel}`,
        kategori: 'kml-kmz',
        fil_url: filePath,
        fil_navn: fileName,
        fil_storrelse: blob.size,
        company_id: companyId,
        user_id: userId,
        opprettet_av: opprettetAv,
      });
    
    if (insertError) throw insertError;
    
    toast.success("KMZ-fil eksportert og lagret i dokumenter");
  } catch (error) {
    console.error("Error exporting KMZ:", error);
    toast.error("Kunne ikke eksportere KMZ");
  }
};
