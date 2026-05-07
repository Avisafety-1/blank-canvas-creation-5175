-- Create email-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-images', 'email-images', true);

-- RLS policies for email-images bucket
-- Users can upload images to their own company folder
CREATE POLICY "Users can upload email images to their company folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-images' AND
  (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Anyone can view email images (since emails are sent to external recipients)
CREATE POLICY "Email images are publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'email-images');

-- Users can update their company's email images
CREATE POLICY "Users can update their company email images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'email-images' AND
  (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);

-- Users can delete their company's email images
CREATE POLICY "Users can delete their company email images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'email-images' AND
  (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);