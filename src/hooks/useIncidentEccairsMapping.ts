import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IncidentEccairsMapping {
  id: string;
  incident_id: string;
  company_id: string;
  occurrence_class: string | null;
  phase_of_flight: string | null;
  aircraft_category: string | null;
  event_types: string[] | null;
  headline: string | null;
  narrative: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export function useIncidentEccairsMapping(incidentId: string, enabled: boolean = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['incident-eccairs-mapping', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incident_eccairs_mappings')
        .select('*')
        .eq('incident_id', incidentId)
        .maybeSingle();
      
      if (error) throw error;
      return data as IncidentEccairsMapping | null;
    },
    enabled,
  });

  const saveMutation = useMutation({
    mutationFn: async (mapping: Partial<IncidentEccairsMapping> & { incident_id: string; company_id: string }) => {
      const { data: existing } = await supabase
        .from('incident_eccairs_mappings')
        .select('id')
        .eq('incident_id', mapping.incident_id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('incident_eccairs_mappings')
          .update({
            occurrence_class: mapping.occurrence_class,
            phase_of_flight: mapping.phase_of_flight,
            aircraft_category: mapping.aircraft_category,
            event_types: mapping.event_types,
            headline: mapping.headline,
            narrative: mapping.narrative,
            location_name: mapping.location_name,
            latitude: mapping.latitude,
            longitude: mapping.longitude,
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('incident_eccairs_mappings')
          .insert({
            incident_id: mapping.incident_id,
            company_id: mapping.company_id,
            occurrence_class: mapping.occurrence_class,
            phase_of_flight: mapping.phase_of_flight,
            aircraft_category: mapping.aircraft_category,
            event_types: mapping.event_types,
            headline: mapping.headline,
            narrative: mapping.narrative,
            location_name: mapping.location_name,
            latitude: mapping.latitude,
            longitude: mapping.longitude,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-eccairs-mapping', incidentId] });
    },
  });

  return {
    mapping: query.data,
    isLoading: query.isLoading,
    error: query.error,
    saveMapping: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
