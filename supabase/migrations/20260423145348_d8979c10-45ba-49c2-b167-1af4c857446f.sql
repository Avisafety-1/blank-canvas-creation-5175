ALTER TABLE public.incidents
  ADD COLUMN reported_anonymously boolean NOT NULL DEFAULT false;