-- Add slide_type and content_json columns to training_questions
ALTER TABLE training_questions
  ADD COLUMN IF NOT EXISTS slide_type text NOT NULL DEFAULT 'question',
  ADD COLUMN IF NOT EXISTS content_json jsonb;