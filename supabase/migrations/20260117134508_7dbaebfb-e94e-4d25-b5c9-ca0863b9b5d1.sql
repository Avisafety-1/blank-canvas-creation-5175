-- Add signature_url column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Create signatures storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for signatures bucket
CREATE POLICY "Users can upload their own signature"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signatures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own signature"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signatures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own signature"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'signatures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Signatures are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'signatures');