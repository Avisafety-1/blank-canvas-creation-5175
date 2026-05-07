import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";

export const ChecklistBadges = ({ checklistIds }: { checklistIds: string[] }) => {
  const [names, setNames] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchChecklistNames = async () => {
      if (!checklistIds || checklistIds.length === 0) return;
      
      const { data } = await supabase
        .from('documents')
        .select('id, tittel')
        .in('id', checklistIds);
      
      if (data) {
        setNames(data.map(d => d.tittel));
      }
    };
    
    fetchChecklistNames();
  }, [checklistIds]);
  
  if (names.length === 0) return null;
  
  return (
    <Badge variant="outline" className="text-xs bg-green-500/20 text-green-900 border-green-500/30">
      <ClipboardCheck className="h-3 w-3 mr-1" />
      ✓ {names.join(', ')}
    </Badge>
  );
};
