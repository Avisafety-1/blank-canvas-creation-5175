-- Runde 2: Fjern brede SELECT-policies på storage.objects som tillater listing
-- Public URL-tilgang via CDN (getPublicUrl) påvirkes ikke. Ingen kode bruker .list() på disse bucketene.

DROP POLICY IF EXISTS "Users can view all avatars"           ON storage.objects;
DROP POLICY IF EXISTS "Email images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Signatures are publicly readable"     ON storage.objects;
DROP POLICY IF EXISTS "marketing_media_read"                 ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback attachments" ON storage.objects;