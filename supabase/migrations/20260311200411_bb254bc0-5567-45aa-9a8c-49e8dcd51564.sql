
-- Create marketing_media table
CREATE TABLE public.marketing_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  draft_id UUID REFERENCES public.marketing_drafts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  layout_template TEXT,
  source_type TEXT NOT NULL DEFAULT 'ai',
  file_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  image_format TEXT DEFAULT '1200x1200',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_media ENABLE ROW LEVEL SECURITY;

-- RLS policies (superadmin only, company-scoped)
CREATE POLICY "marketing_media_select" ON public.marketing_media
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

CREATE POLICY "marketing_media_insert" ON public.marketing_media
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

CREATE POLICY "marketing_media_update" ON public.marketing_media
  FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

CREATE POLICY "marketing_media_delete" ON public.marketing_media
  FOR DELETE TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

-- Create public storage bucket for marketing media
INSERT INTO storage.buckets (id, name, public) VALUES ('marketing-media', 'marketing-media', true);

-- Storage RLS: authenticated users can upload
CREATE POLICY "marketing_media_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-media');

CREATE POLICY "marketing_media_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'marketing-media');

CREATE POLICY "marketing_media_delete_storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-media');
