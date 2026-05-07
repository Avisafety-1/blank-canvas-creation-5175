import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EccairsFormat } from "@/config/eccairsFields";

export interface IncidentEccairsAttribute {
  id: string;
  incident_id: string;
  attribute_code: number;
  taxonomy_code: string;
  entity_path: string | null;
  value_id: string | null;
  text_value: string | null;
  format: EccairsFormat | null;
  payload_json: any | null;
}

export type AttributeData = {
  value_id?: string | null;
  text_value?: string | null;
  taxonomy_code?: string;
  entity_path?: string | null;
  format?: EccairsFormat;
  payload_json?: any;
};

// Attributes that must always be at top-level (Entity 24)
const FORCE_TOP_LEVEL_CODES = new Set([432, 448]);

// Helper to coerce entity_path to null for top-level attributes
const coerceEntityPath = (code: number, entityPath: string | null | undefined): string | null => {
  if (FORCE_TOP_LEVEL_CODES.has(code)) return null;
  return entityPath ?? null;
};

type AttributeKey = `${number}_${string}_${string}`;
const makeKey = (code: number, taxonomy: string, entityPath: string | null): AttributeKey => 
  `${code}_${taxonomy}_${entityPath ?? 'top'}`;

export function useIncidentEccairsAttributes(incidentId: string, enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['incident-eccairs-attributes', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incident_eccairs_attributes')
        .select('*')
        .eq('incident_id', incidentId);
      
      if (error) throw error;
      
      const attributeMap: Record<AttributeKey, IncidentEccairsAttribute> = {};
      (data || []).forEach(row => {
        const key = makeKey(
          row.attribute_code, 
          row.taxonomy_code || '24',
          (row as any).entity_path ?? null
        );
        attributeMap[key] = row as IncidentEccairsAttribute;
      });
      return attributeMap;
    },
    enabled,
  });

  const getAttribute = (code: number, taxonomyCode = '24', entityPath: string | null = null) => {
    const key = makeKey(code, taxonomyCode, entityPath);
    return query.data?.[key] ?? null;
  };

  const saveAttributeMutation = useMutation({
    mutationFn: async ({ 
      code, 
      data 
    }: { 
      code: number; 
      data: AttributeData 
    }) => {
      const taxonomyCode = data.taxonomy_code ?? '24';
      const entityPath = coerceEntityPath(code, data.entity_path);
      
      const { error } = await supabase
        .from('incident_eccairs_attributes')
        .upsert({
          incident_id: incidentId,
          attribute_code: code,
          taxonomy_code: taxonomyCode,
          entity_path: entityPath,
          value_id: data.value_id ?? null,
          text_value: data.text_value ?? null,
          format: data.format ?? null,
          payload_json: data.payload_json ?? null,
          source: 'lovable',
        }, { 
          onConflict: 'incident_id,attribute_code,taxonomy_code' 
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['incident-eccairs-attributes', incidentId] 
      });
    },
  });

  const saveAllAttributesMutation = useMutation({
    mutationFn: async (attributes: Array<{ code: number; data: AttributeData }>) => {
      const rows = attributes.map(attr => ({
        incident_id: incidentId,
        attribute_code: attr.code,
        taxonomy_code: attr.data.taxonomy_code ?? '24',
        entity_path: coerceEntityPath(attr.code, attr.data.entity_path),
        value_id: attr.data.value_id ?? null,
        text_value: attr.data.text_value ?? null,
        format: attr.data.format ?? null,
        payload_json: attr.data.payload_json ?? null,
        source: 'lovable',
      }));

      const { error } = await supabase
        .from('incident_eccairs_attributes')
        .upsert(rows, { onConflict: 'incident_id,attribute_code,taxonomy_code' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['incident-eccairs-attributes', incidentId] 
      });
    },
  });

  return {
    attributes: query.data ?? {},
    getAttribute,
    isLoading: query.isLoading,
    error: query.error,
    saveAttribute: (code: number, data: AttributeData) => 
      saveAttributeMutation.mutateAsync({ code, data }),
    saveAllAttributes: saveAllAttributesMutation.mutateAsync,
    isSaving: saveAttributeMutation.isPending || saveAllAttributesMutation.isPending,
  };
}
