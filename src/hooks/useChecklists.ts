import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Checklist {
  id: string;
  tittel: string;
}

export const useChecklists = () => {
  const { companyId } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChecklists = async () => {
      if (!companyId) {
        setChecklists([]);
        setIsLoading(false);
        return;
      }

      try {
        // Look up parent company so we can include checklists shared from parent (visible_to_children = true)
        const { data: companyRow } = await supabase
          .from("companies")
          .select("parent_company_id")
          .eq("id", companyId)
          .maybeSingle();

        const parentId = companyRow?.parent_company_id || null;

        // Build OR-filter: own company, globally visible, OR parent company with visible_to_children
        const orParts = [
          `company_id.eq.${companyId}`,
          `global_visibility.eq.true`,
        ];
        if (parentId) {
          orParts.push(`and(company_id.eq.${parentId},visible_to_children.eq.true)`);
        }

        const { data, error } = await supabase
          .from("documents")
          .select("id, tittel, global_visibility")
          .eq("kategori", "sjekklister")
          .or(orParts.join(","))
          .order("tittel");

        if (error) throw error;

        // Deduplicate by id (a checklist could match multiple OR-clauses)
        const seen = new Set<string>();
        const unique = (data || []).filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        setChecklists(unique);
      } catch (error) {
        console.error("Error fetching checklists:", error);
        setChecklists([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChecklists();
  }, [companyId]);

  return { checklists, isLoading };
};
