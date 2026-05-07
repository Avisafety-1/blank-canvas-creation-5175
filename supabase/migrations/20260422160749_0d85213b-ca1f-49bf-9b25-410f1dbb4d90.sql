ALTER TABLE public.training_questions
  ADD COLUMN IF NOT EXISTS video_required_complete boolean NOT NULL DEFAULT false;