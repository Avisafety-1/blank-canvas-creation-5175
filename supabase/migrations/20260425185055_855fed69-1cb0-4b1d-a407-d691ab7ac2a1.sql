DROP POLICY IF EXISTS "Users can read own company documents" ON storage.objects;

CREATE POLICY "Users can read own company documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT unnest(public.get_user_visible_company_ids(auth.uid()))::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.fil_url = storage.objects.name
        AND d.global_visibility = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.fil_url = storage.objects.name
        AND d.visible_to_children = true
        AND d.company_id = public.get_parent_company_id((
          SELECT p.company_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
        ))
    )
  )
);