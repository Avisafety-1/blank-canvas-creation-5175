
-- App config table for version tracking (force-reload feature)
CREATE TABLE public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow all authenticated users to read
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app_config"
  ON public.app_config FOR SELECT
  TO authenticated
  USING (true);

-- Only superadmins can update (via has_role function)
CREATE POLICY "Superadmins can update app_config"
  ON public.app_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- Seed initial version
INSERT INTO public.app_config (key, value) VALUES ('app_version', '1');
