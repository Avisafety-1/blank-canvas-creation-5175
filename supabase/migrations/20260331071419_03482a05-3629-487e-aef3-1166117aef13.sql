-- Add pptx_file_url column to training_courses
ALTER TABLE public.training_courses ADD COLUMN IF NOT EXISTS pptx_file_url TEXT;

-- Create training-slides storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-slides', 'training-slides', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for training-slides bucket
CREATE POLICY "Authenticated users can upload training slides"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'training-slides');

CREATE POLICY "Authenticated users can view training slides"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'training-slides');

CREATE POLICY "Authenticated users can delete training slides"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'training-slides');