ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS all_users_can_acknowledge_maintenance boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS propagate_all_users_can_acknowledge_maintenance boolean NOT NULL DEFAULT false;