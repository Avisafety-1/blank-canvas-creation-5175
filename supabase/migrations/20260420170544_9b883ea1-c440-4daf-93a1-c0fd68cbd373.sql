ALTER TABLE public.personnel_competencies
ADD COLUMN IF NOT EXISTS varsel_dager integer NOT NULL DEFAULT 30;