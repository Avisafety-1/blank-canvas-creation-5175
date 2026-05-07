ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS prevent_self_approval boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS propagate_prevent_self_approval boolean NOT NULL DEFAULT false;