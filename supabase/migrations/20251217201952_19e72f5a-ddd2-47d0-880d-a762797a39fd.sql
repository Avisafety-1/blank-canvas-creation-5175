-- Drop the existing policy that only allows checklists
DROP POLICY IF EXISTS "Users can view globally shared checklists" ON public.documents;

-- Create a new policy that allows viewing all globally shared documents
CREATE POLICY "Users can view globally shared documents" 
ON public.documents 
FOR SELECT 
USING ((global_visibility = true) AND (auth.uid() IS NOT NULL));