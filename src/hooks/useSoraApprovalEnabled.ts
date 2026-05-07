import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const cache: Record<string, { enabled: boolean; ts: number }> = {};
const CACHE_TTL = 30_000;
const SORA_APPROVAL_EVENT = "sora-approval-enabled-changed";

type SoraApprovalEventDetail = {
  companyId: string;
  enabled: boolean;
};

export function invalidateSoraApprovalCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}

export function syncSoraApprovalEnabled(companyId: string, enabled: boolean) {
  cache[companyId] = { enabled, ts: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SoraApprovalEventDetail>(SORA_APPROVAL_EVENT, {
        detail: { companyId, enabled },
      })
    );
  }
}

export function useSoraApprovalEnabled(): boolean {
  const { companyId } = useAuth();
  const [enabled, setEnabled] = useState(false);

  const fetch = async () => {
    if (!companyId) return;
    const { data } = await (supabase as any).rpc(
      "get_effective_sora_approval_config",
      { _company_id: companyId }
    );

    const val = !!(data?.config?.sora_based_approval);
    cache[companyId] = { enabled: val, ts: Date.now() };
    setEnabled(val);
  };

  useEffect(() => {
    if (!companyId) return;

    const cached = cache[companyId];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setEnabled(cached.enabled);
    } else {
      fetch();
    }

    const channel = supabase
      .channel(`sora-config-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_sora_config",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          invalidateSoraApprovalCache();
          fetch();
        }
      )
      .subscribe();

    const handleLocalSync = (event: Event) => {
      const detail = (event as CustomEvent<SoraApprovalEventDetail>).detail;
      if (!detail || detail.companyId !== companyId) return;
      cache[companyId] = { enabled: detail.enabled, ts: Date.now() };
      setEnabled(detail.enabled);
    };

    window.addEventListener(SORA_APPROVAL_EVENT, handleLocalSync);

    return () => {
      window.removeEventListener(SORA_APPROVAL_EVENT, handleLocalSync);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return enabled;
}
