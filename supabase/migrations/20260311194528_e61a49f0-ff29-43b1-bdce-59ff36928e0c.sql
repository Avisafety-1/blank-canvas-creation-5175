
-- Marketing content ideas
CREATE TABLE public.marketing_content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT DEFAULT 'new',
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Marketing drafts
CREATE TABLE public.marketing_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idea_id UUID REFERENCES public.marketing_content_ideas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  platform TEXT,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  ai_generated BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for marketing_content_ideas
ALTER TABLE public.marketing_content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company ideas"
  ON public.marketing_content_ideas FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own company ideas"
  ON public.marketing_content_ideas FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own company ideas"
  ON public.marketing_content_ideas FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own company ideas"
  ON public.marketing_content_ideas FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

-- RLS for marketing_drafts
ALTER TABLE public.marketing_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company drafts"
  ON public.marketing_drafts FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own company drafts"
  ON public.marketing_drafts FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own company drafts"
  ON public.marketing_drafts FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own company drafts"
  ON public.marketing_drafts FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
