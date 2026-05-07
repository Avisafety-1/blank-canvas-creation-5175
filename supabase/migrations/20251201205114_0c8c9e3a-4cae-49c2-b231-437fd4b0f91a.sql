-- Update documents bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'documents';

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own company folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own company documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own company documents" ON storage.objects;

-- RLS Policies for documents bucket
-- Users can read files from their own company folder
CREATE POLICY "Users can read own company documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Users can upload files to their own company folder
CREATE POLICY "Users can upload to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Users can update files in their own company folder
CREATE POLICY "Users can update own company documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Users can delete files from their own company folder
CREATE POLICY "Users can delete own company documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text 
    FROM profiles 
    WHERE id = auth.uid()
  )
);