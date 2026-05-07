DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;

CREATE POLICY "Users can read own company documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT unnest(public.get_user_visible_company_ids(auth.uid()))::text
  )
);