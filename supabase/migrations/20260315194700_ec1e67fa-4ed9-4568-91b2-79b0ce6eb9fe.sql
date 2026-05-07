
-- Passkeys table for WebAuthn credentials
CREATE TABLE public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credential_id text UNIQUE NOT NULL,
  public_key text NOT NULL,
  counter bigint DEFAULT 0,
  device_name text,
  transports text[],
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

-- Users can read and delete their own passkeys
CREATE POLICY "Users can read own passkeys"
  ON public.passkeys FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own passkeys"
  ON public.passkeys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own passkeys"
  ON public.passkeys FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role needs to read passkeys for login verification (unauthenticated)
-- and update counter after authentication
CREATE POLICY "Service role full access"
  ON public.passkeys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for credential lookup during login
CREATE INDEX idx_passkeys_credential_id ON public.passkeys(credential_id);
CREATE INDEX idx_passkeys_user_id ON public.passkeys(user_id);
