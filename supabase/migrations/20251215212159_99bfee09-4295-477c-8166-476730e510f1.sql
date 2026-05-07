-- Add inspection reminder notification columns
ALTER TABLE notification_preferences 
ADD COLUMN email_inspection_reminder boolean NOT NULL DEFAULT false,
ADD COLUMN inspection_reminder_days integer NOT NULL DEFAULT 14;