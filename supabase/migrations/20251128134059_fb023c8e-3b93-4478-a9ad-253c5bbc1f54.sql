-- Drop existing storage policies for documents bucket
DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own company folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own company documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own company documents" ON storage.objects;

-- Create updated storage policies that respect superadmin role

-- SELECT: Superadmins can read all, users can read own company
CREATE POLICY "Superadmins can read all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  public.is_superadmin(auth.uid())
);

CREATE POLICY "Users can read own company documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- INSERT: Superadmins can upload anywhere, users to own company
CREATE POLICY "Superadmins can upload all documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  public.is_superadmin(auth.uid())
);

CREATE POLICY "Users can upload to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- UPDATE: Superadmins can update all, users own company
CREATE POLICY "Superadmins can update all documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  public.is_superadmin(auth.uid())
);

CREATE POLICY "Users can update own company documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- DELETE: Superadmins can delete all, users own company
CREATE POLICY "Superadmins can delete all documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  public.is_superadmin(auth.uid())
);

CREATE POLICY "Users can delete own company documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);