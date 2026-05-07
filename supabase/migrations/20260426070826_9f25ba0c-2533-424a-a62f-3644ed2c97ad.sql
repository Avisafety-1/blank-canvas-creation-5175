ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS propagate_fh2_credentials boolean NOT NULL DEFAULT false;