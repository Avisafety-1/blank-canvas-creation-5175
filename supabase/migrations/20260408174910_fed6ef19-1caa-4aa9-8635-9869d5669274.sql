ALTER TABLE public.company_sora_config 
ADD COLUMN default_buffer_mode text NOT NULL DEFAULT 'corridor' 
CHECK (default_buffer_mode IN ('corridor', 'convexHull'));