ALTER TABLE incidents ADD COLUMN bilde_url TEXT;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('incident-images', 'incident-images', true);

CREATE POLICY "Users can view incident images from own company"
ON storage.objects FOR SELECT USING (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Approved users can upload incident images"
ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Users can delete own incident images"
ON storage.objects FOR DELETE USING (
  bucket_id = 'incident-images' AND
  (storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE id = auth.uid())
);