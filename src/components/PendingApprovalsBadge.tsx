import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

interface PendingApprovalsBadgeProps {
  isAdmin: boolean;
}

export const PendingApprovalsBadge = ({ isAdmin }: PendingApprovalsBadgeProps) => {
  const [pendingCount, setPendingCount] = useState(0);
  const { companyId } = useAuth();

  useEffect(() => {
    if (!isAdmin || !companyId) return;

    const fetchPendingCount = async () => {
      try {
        // Run both queries in parallel for faster badge rendering
        const [childrenResult, ownCompanyResult] = await Promise.all([
          supabase
            .from("companies")
            .select("id")
            .eq("parent_company_id", companyId),
          // @ts-ignore - Approved column might not be in types yet
          supabase
            .from("profiles")
            .select("id")
            .eq("approved", false)
            .eq("company_id", companyId),
        ]);

        const childIds = (childrenResult.data || []).map(c => c.id);
        
        if (childIds.length > 0) {
          // @ts-ignore
          const { data: childProfiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("approved", false)
            .in("company_id", childIds);
          
          setPendingCount((ownCompanyResult.data?.length || 0) + (childProfiles?.length || 0));
        } else {
          setPendingCount(ownCompanyResult.data?.length || 0);
        }
      } catch (error) {
        console.error("Error fetching pending count:", error);
      }
    };

    fetchPendingCount();

    const channel = supabase
      .channel("pending-approvals")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, companyId]);

  if (!isAdmin || pendingCount === 0) return null;

  return (
    <Badge 
      variant="destructive" 
      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
    >
      {pendingCount}
    </Badge>
  );
};
