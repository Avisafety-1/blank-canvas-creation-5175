ALTER TABLE public.training_questions
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_start_seconds integer,
  ADD COLUMN IF NOT EXISTS video_end_seconds integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'training_questions'
      AND constraint_name = 'training_questions_slide_type_check'
  ) THEN
    ALTER TABLE public.training_questions DROP CONSTRAINT training_questions_slide_type_check;
  END IF;
END $$;

ALTER TABLE public.training_questions
  ADD CONSTRAINT training_questions_slide_type_check
  CHECK (slide_type IN ('content', 'question', 'video'));