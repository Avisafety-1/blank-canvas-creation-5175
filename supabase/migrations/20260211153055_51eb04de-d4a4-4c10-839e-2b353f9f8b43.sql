
-- Add approval columns to missions
ALTER TABLE missions ADD COLUMN approval_status text NOT NULL DEFAULT 'not_approved';
ALTER TABLE missions ADD COLUMN approval_comment text;
ALTER TABLE missions ADD COLUMN approved_by uuid REFERENCES auth.users(id);
ALTER TABLE missions ADD COLUMN approved_at timestamptz;
ALTER TABLE missions ADD COLUMN submitted_for_approval_at timestamptz;

-- Add can_approve_missions to profiles
ALTER TABLE profiles ADD COLUMN can_approve_missions boolean NOT NULL DEFAULT false;

-- Add email_mission_approval to notification_preferences
ALTER TABLE notification_preferences ADD COLUMN email_mission_approval boolean NOT NULL DEFAULT false;
