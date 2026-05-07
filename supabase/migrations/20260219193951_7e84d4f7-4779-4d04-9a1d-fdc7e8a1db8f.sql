CREATE TABLE company_sora_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  -- Hardstop-grenser
  max_wind_speed_ms numeric NOT NULL DEFAULT 10,
  max_wind_gust_ms numeric NOT NULL DEFAULT 15,
  max_visibility_km numeric NOT NULL DEFAULT 1,
  max_flight_altitude_m integer NOT NULL DEFAULT 120,
  require_backup_battery boolean NOT NULL DEFAULT false,
  require_observer boolean NOT NULL DEFAULT false,

  -- Fritekst operative begrensninger (til AI-prompt)
  operative_restrictions text,

  -- Nøkkelpunkter fra operasjonsmanual i klartekst (til AI-lesing)
  policy_notes text,

  -- Tilknyttede dokument-IDs (for referanse og visning)
  linked_document_ids uuid[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_sora_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company config"
  ON company_sora_config FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can upsert own company config"
  ON company_sora_config FOR ALL
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER update_company_sora_config_updated_at
  BEFORE UPDATE ON company_sora_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();