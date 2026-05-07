
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-attachments', 'feedback-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload feedback attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'feedback-attachments');

CREATE POLICY "Anyone can view feedback attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'feedback-attachments');
