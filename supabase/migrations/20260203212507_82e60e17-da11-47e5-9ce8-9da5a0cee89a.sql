-- Change default values for notification preferences to be enabled by default for new users
ALTER TABLE public.notification_preferences 
  ALTER COLUMN email_new_incident SET DEFAULT true,
  ALTER COLUMN email_new_mission SET DEFAULT true,
  ALTER COLUMN email_document_expiry SET DEFAULT true,
  ALTER COLUMN email_new_user_pending SET DEFAULT true,
  ALTER COLUMN email_inspection_reminder SET DEFAULT true;