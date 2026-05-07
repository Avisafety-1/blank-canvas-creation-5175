-- Add global_visibility column to documents table for checklists
ALTER TABLE public.documents 
ADD COLUMN global_visibility boolean DEFAULT false;

-- Create policy for viewing globally shared checklists
CREATE POLICY "Users can view globally shared checklists"
ON public.documents
FOR SELECT
USING (
  global_visibility = true 
  AND kategori = 'sjekklister'
  AND auth.uid() IS NOT NULL
);

-- Allow superadmins to update global_visibility on any document
CREATE POLICY "Superadmins can update global visibility"
ON public.documents
FOR UPDATE
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));