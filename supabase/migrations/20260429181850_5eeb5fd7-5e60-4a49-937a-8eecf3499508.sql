ALTER TABLE public.notification_preferences
  ALTER COLUMN email_child_incidents SET DEFAULT true,
  ALTER COLUMN email_child_missions SET DEFAULT true,
  ALTER COLUMN email_child_new_user_pending SET DEFAULT true,
  ALTER COLUMN email_child_document_expiry SET DEFAULT true,
  ALTER COLUMN email_child_maintenance_reminder SET DEFAULT true;

UPDATE public.notification_preferences
SET
  email_child_incidents = true,
  email_child_missions = true,
  email_child_new_user_pending = true,
  email_child_document_expiry = true,
  email_child_maintenance_reminder = true
WHERE
  email_child_incidents = false
  OR email_child_missions = false
  OR email_child_new_user_pending = false
  OR email_child_document_expiry = false
  OR email_child_maintenance_reminder = false;