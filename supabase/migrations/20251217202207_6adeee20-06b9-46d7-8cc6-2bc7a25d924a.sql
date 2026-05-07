-- Create junction table for mission documents
CREATE TABLE public.mission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(mission_id, document_id)
);

-- Enable RLS
ALTER TABLE public.mission_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view mission documents from own company"
ON public.mission_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.missions
    WHERE missions.id = mission_documents.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Approved users can create mission documents"
ON public.mission_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.missions
    WHERE missions.id = mission_documents.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.approved = true
  )
);

CREATE POLICY "Admins can delete mission documents in own company"
ON public.mission_documents
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.missions
    WHERE missions.id = mission_documents.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can delete own mission documents"
ON public.mission_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.missions
    WHERE missions.id = mission_documents.mission_id
    AND missions.user_id = auth.uid()
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);