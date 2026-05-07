
-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store the edge function URL + a shared secret in Vault
DO $$
DECLARE
  v_existing_secret text;
BEGIN
  -- Generate or reuse shared secret
  SELECT decrypted_secret INTO v_existing_secret
  FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_secret' LIMIT 1;

  IF v_existing_secret IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'resend_audience_sync_secret',
      'Shared secret used by profiles trigger to call sync-user-to-resend-audience edge function'
    );
  END IF;

  -- Store function URL
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_url') THEN
    PERFORM vault.create_secret(
      'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/sync-user-to-resend-audience',
      'resend_audience_sync_url',
      'URL of sync-user-to-resend-audience edge function'
    );
  END IF;
END $$;

-- Trigger function: fire pg_net.http_post for each profile change
CREATE OR REPLACE FUNCTION public.sync_profile_to_resend_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_payload jsonb;
  v_first text;
  v_last text;
BEGIN
  SELECT decrypted_secret INTO v_url   FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'resend_audience_sync_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    IF OLD.email IS NULL OR OLD.email = '' THEN RETURN OLD; END IF;
    v_payload := jsonb_build_object('action', 'delete', 'email', OLD.email);

  ELSIF (TG_OP = 'INSERT') THEN
    IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;
    v_first := split_part(COALESCE(NEW.full_name, ''), ' ', 1);
    v_last  := NULLIF(regexp_replace(COALESCE(NEW.full_name, ''), '^\S+\s*', ''), '');
    v_payload := jsonb_build_object(
      'action', 'upsert',
      'email', NEW.email,
      'first_name', v_first,
      'last_name', COALESCE(v_last, '')
    );

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only fire if email or full_name changed
    IF COALESCE(NEW.email, '') = COALESCE(OLD.email, '')
       AND COALESCE(NEW.full_name, '') = COALESCE(OLD.full_name, '') THEN
      RETURN NEW;
    END IF;
    IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;

    v_first := split_part(COALESCE(NEW.full_name, ''), ' ', 1);
    v_last  := NULLIF(regexp_replace(COALESCE(NEW.full_name, ''), '^\S+\s*', ''), '');
    v_payload := jsonb_build_object(
      'action', 'upsert',
      'email', NEW.email,
      'first_name', v_first,
      'last_name', COALESCE(v_last, ''),
      'old_email', OLD.email
    );
  END IF;

  IF v_payload IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never block profile mutations on sync failure
  RAISE WARNING 'sync_profile_to_resend_audience failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop & recreate triggers
DROP TRIGGER IF EXISTS trg_profiles_resend_audience_ins ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_resend_audience_upd ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_resend_audience_del ON public.profiles;

CREATE TRIGGER trg_profiles_resend_audience_ins
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_resend_audience();

CREATE TRIGGER trg_profiles_resend_audience_upd
AFTER UPDATE OF email, full_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_resend_audience();

CREATE TRIGGER trg_profiles_resend_audience_del
AFTER DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_resend_audience();
