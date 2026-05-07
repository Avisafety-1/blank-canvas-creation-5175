
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-narration', 'training-narration', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('training-visuals', 'training-visuals', false)
ON CONFLICT (id) DO NOTHING;

-- Read policies (any authenticated user can read; signed URLs handle distribution)
CREATE POLICY "Authenticated can read training narration"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'training-narration');

CREATE POLICY "Authenticated can read training visuals"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'training-visuals');

-- Insert policies (authenticated users; service role bypasses RLS for edge functions)
CREATE POLICY "Authenticated can upload training narration"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'training-narration');

CREATE POLICY "Authenticated can upload training visuals"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'training-visuals');

-- Update/Delete (admin/service only — handled by service role; no public policies)
