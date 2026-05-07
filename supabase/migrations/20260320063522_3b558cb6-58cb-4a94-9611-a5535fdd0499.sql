-- Add visible_to_children column to news
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS visible_to_children boolean DEFAULT false;

-- Add visible_to_children column to documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS visible_to_children boolean DEFAULT false;

-- Drop existing SELECT policy on news and recreate with parent company support
DROP POLICY IF EXISTS "Users can view news from own company" ON public.news;
CREATE POLICY "Users can view news from own company" ON public.news
  FOR SELECT USING (
    company_id = ANY(get_user_visible_company_ids(auth.uid()))
    OR (
      visible_to_children = true
      AND company_id = get_parent_company_id(
        (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- Drop existing SELECT policy on documents for own company and recreate
DROP POLICY IF EXISTS "Users can view documents from own company" ON public.documents;
CREATE POLICY "Users can view documents from own company" ON public.documents
  FOR SELECT USING (
    company_id = ANY(get_user_visible_company_ids(auth.uid()))
    OR (
      visible_to_children = true
      AND company_id = get_parent_company_id(
        (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );