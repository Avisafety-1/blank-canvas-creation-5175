
-- Add image_url to drone log entries
ALTER TABLE drone_log_entries ADD COLUMN IF NOT EXISTS image_url text;

-- Add image_url to equipment log entries
ALTER TABLE equipment_log_entries ADD COLUMN IF NOT EXISTS image_url text;

-- Add UPDATE policy for drone_log_entries (needed to set image_url after insert)
CREATE POLICY "Users can update own drone log entries"
ON public.drone_log_entries
FOR UPDATE
USING ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

-- Add UPDATE policy for equipment_log_entries (needed to set image_url after insert)
CREATE POLICY "Users can update own equipment log entries"
ON public.equipment_log_entries
FOR UPDATE
USING ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

-- Create personnel_log_entries table
CREATE TABLE IF NOT EXISTS public.personnel_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL,
  entry_date timestamptz NOT NULL,
  entry_type text,
  title text NOT NULL,
  description text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on personnel_log_entries
ALTER TABLE public.personnel_log_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for personnel_log_entries
CREATE POLICY "Users can view personnel log entries from own company"
ON public.personnel_log_entries
FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Approved users can create personnel log entries in own company"
ON public.personnel_log_entries
FOR INSERT
WITH CHECK (
  (company_id = get_user_company_id(auth.uid())) AND
  (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.approved = true
  ))
);

CREATE POLICY "Users can update own personnel log entries"
ON public.personnel_log_entries
FOR UPDATE
USING ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Users can delete own personnel log entries"
ON public.personnel_log_entries
FOR DELETE
USING ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admins can delete personnel log entries in own company"
ON public.personnel_log_entries
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) AND (company_id = get_user_company_id(auth.uid())));

-- Create logbook-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('logbook-images', 'logbook-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for logbook-images storage
CREATE POLICY "Anyone can view logbook images"
ON storage.objects FOR SELECT
USING (bucket_id = 'logbook-images');

CREATE POLICY "Authenticated users can upload logbook images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logbook-images' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete own logbook images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logbook-images' AND
  auth.uid() IS NOT NULL
);
