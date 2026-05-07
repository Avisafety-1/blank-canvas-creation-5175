import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EQUIPMENT_CATEGORIES } from "@/config/equipmentCategories";

export const useEquipmentTypes = (companyId: string, open: boolean) => {
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId || !open) return;

    const fetchTypes = async () => {
      const predefined = EQUIPMENT_CATEGORIES.map((c) => c.id);

      const { data } = await supabase
        .from("equipment")
        .select("type")
        .eq("company_id", companyId);

      const dbTypes = data
        ? [...new Set(data.map((e) => e.type).filter(Boolean))]
        : [];

      // Merge: predefined first, then any custom DB types not already in the list
      const predefinedLower = new Set(predefined.map((t) => t.toLowerCase()));
      const extras = dbTypes.filter((t) => !predefinedLower.has(t.toLowerCase()));

      setEquipmentTypes([...predefined, ...extras.sort()]);
    };

    fetchTypes();
  }, [companyId, open]);

  return equipmentTypes;
};
