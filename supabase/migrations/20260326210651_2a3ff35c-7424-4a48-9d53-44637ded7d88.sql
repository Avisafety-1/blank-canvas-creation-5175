ALTER TABLE companies
  ADD COLUMN require_sora_on_missions boolean NOT NULL DEFAULT false,
  ADD COLUMN require_sora_steps integer NOT NULL DEFAULT 1;