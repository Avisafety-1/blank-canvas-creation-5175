import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CompanySettings {
  show_all_airspace_warnings: boolean;
  hide_reporter_identity: boolean;
  incident_reports_visible_to_all_companies: boolean;
  require_mission_approval: boolean;
  prevent_self_approval: boolean;
  require_sora_on_missions: boolean;
  require_sora_steps: number;
  deviation_report_enabled: boolean;
}

const defaultSettings: CompanySettings = {
  show_all_airspace_warnings: false,
  hide_reporter_identity: false,
  incident_reports_visible_to_all_companies: false,
  require_mission_approval: false,
  prevent_self_approval: false,
  require_sora_on_missions: false,
  require_sora_steps: 1,
  deviation_report_enabled: false,
};

// Simple in-memory cache keyed by companyId
const cache: Record<string, { settings: CompanySettings; ts: number }> = {};
const inflight: Record<string, Promise<CompanySettings>> = {};
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateCompanySettingsCache() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}

function fetchCompanySettings(companyId: string): Promise<CompanySettings> {
  if (inflight[companyId]) return inflight[companyId];

  const promise = (supabase
    .from("companies")
    .select("show_all_airspace_warnings, hide_reporter_identity, incident_reports_visible_to_all_companies, require_mission_approval, prevent_self_approval, require_sora_on_missions, require_sora_steps, deviation_report_enabled")
    .eq("id", companyId)
    .single() as any)
    .then(({ data }: any) => {
      const s: CompanySettings = {
        show_all_airspace_warnings: data?.show_all_airspace_warnings ?? false,
        hide_reporter_identity: data?.hide_reporter_identity ?? false,
        incident_reports_visible_to_all_companies: data?.incident_reports_visible_to_all_companies ?? false,
        require_mission_approval: data?.require_mission_approval ?? false,
        prevent_self_approval: data?.prevent_self_approval ?? false,
        require_sora_on_missions: data?.require_sora_on_missions ?? false,
        require_sora_steps: data?.require_sora_steps ?? 1,
        deviation_report_enabled: data?.deviation_report_enabled ?? false,
      };
      cache[companyId] = { settings: s, ts: Date.now() };
      return s;
    })
    .finally(() => {
      delete inflight[companyId];
    });

  inflight[companyId] = promise;
  return promise;
}

export function useCompanySettings() {
  const { companyId, parentCompanyId } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);

  useEffect(() => {
    if (!companyId) return;

    const cached = cache[companyId];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setSettings(cached.settings);
      return;
    }

    fetchCompanySettings(companyId).then(async (ownSettings) => {
      if (!parentCompanyId) {
        setSettings(ownSettings);
        return;
      }

      const parentSettings = await fetchCompanySettings(parentCompanyId);
      setSettings({
        ...ownSettings,
        incident_reports_visible_to_all_companies: parentSettings.incident_reports_visible_to_all_companies,
      });
    });
  }, [companyId, parentCompanyId]);

  return settings;
}
