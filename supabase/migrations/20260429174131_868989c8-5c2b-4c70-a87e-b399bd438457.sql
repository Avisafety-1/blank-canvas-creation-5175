ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_child_incidents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_child_missions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_child_new_user_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_child_document_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_child_maintenance_reminder boolean NOT NULL DEFAULT false;