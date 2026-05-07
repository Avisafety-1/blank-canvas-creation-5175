-- 1. Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'logbook-images';

-- 2. Drop old open policies
DROP POLICY IF EXISTS "Anyone can view logbook images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logbook images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logbook images" ON storage.objects;

-- 3. Company-scoped SELECT
CREATE POLICY "Users can view own company logbook images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'logbook-images'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM unnest(
      (SELECT public.get_user_visible_company_ids(auth.uid()))
    ) AS id
  )
);

-- 4. Company-scoped INSERT (own company only)
CREATE POLICY "Users can upload to own company logbook images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logbook-images'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- 5. Company-scoped DELETE
CREATE POLICY "Users can delete own company logbook images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logbook-images'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM unnest(
      (SELECT public.get_user_visible_company_ids(auth.uid()))
    ) AS id
  )
);