
ALTER TABLE public.training_courses ADD COLUMN display_mode text NOT NULL DEFAULT 'list';
ALTER TABLE public.training_assignments ADD COLUMN saved_answers jsonb DEFAULT null;
