-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Manuals table
CREATE TABLE public.manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  page_count INTEGER,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manuals_company ON public.manuals(company_id);

ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view manuals in their company hierarchy"
ON public.manuals FOR SELECT
USING (company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid()))));

CREATE POLICY "Admins can insert manuals for their company"
ON public.manuals FOR INSERT
WITH CHECK (
  company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

CREATE POLICY "Admins can delete manuals in their company"
ON public.manuals FOR DELETE
USING (
  company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

-- Manual chunks table
CREATE TABLE public.manual_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  section_heading TEXT,
  embedding vector(1536),
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_chunks_manual ON public.manual_chunks(manual_id);
CREATE INDEX idx_manual_chunks_embedding ON public.manual_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.manual_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chunks for their manuals"
ON public.manual_chunks FOR SELECT
USING (manual_id IN (SELECT id FROM public.manuals WHERE company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))));

CREATE POLICY "Admins can insert chunks for their manuals"
ON public.manual_chunks FOR INSERT
WITH CHECK (
  manual_id IN (
    SELECT id FROM public.manuals
    WHERE company_id IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  )
  AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

-- Add source_manual_id to training_courses
ALTER TABLE public.training_courses
ADD COLUMN IF NOT EXISTS source_manual_id UUID REFERENCES public.manuals(id) ON DELETE SET NULL;

-- Vector similarity search function
CREATE OR REPLACE FUNCTION public.match_manual_chunks(
  p_manual_id UUID,
  p_query_embedding vector(1536),
  p_match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  chunk_index INTEGER,
  chunk_text TEXT,
  section_heading TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mc.id,
    mc.chunk_index,
    mc.chunk_text,
    mc.section_heading,
    1 - (mc.embedding <=> p_query_embedding) AS similarity
  FROM public.manual_chunks mc
  WHERE mc.manual_id = p_manual_id
    AND mc.embedding IS NOT NULL
  ORDER BY mc.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('manuals', 'manuals', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies (path: {company_id}/{manual_id}.pdf)
CREATE POLICY "Users can read their company manuals"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'manuals'
  AND (storage.foldername(name))[1]::uuid IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
);

CREATE POLICY "Admins can upload manuals for their company"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'manuals'
  AND (storage.foldername(name))[1]::uuid IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

CREATE POLICY "Admins can delete manuals in their company"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'manuals'
  AND (storage.foldername(name))[1]::uuid IN (SELECT unnest(get_user_visible_company_ids(auth.uid())))
  AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);