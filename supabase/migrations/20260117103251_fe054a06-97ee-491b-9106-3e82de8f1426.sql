-- Create email_template_attachments table
CREATE TABLE public.email_template_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, document_id)
);

-- Enable RLS
ALTER TABLE public.email_template_attachments ENABLE ROW LEVEL SECURITY;

-- Policy for viewing attachments (users can view attachments for templates in their company)
CREATE POLICY "Users can view attachments for their company templates"
ON public.email_template_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.email_templates et
    JOIN public.profiles p ON et.company_id = p.company_id
    WHERE et.id = email_template_attachments.template_id
    AND p.id = auth.uid()
  )
);

-- Policy for admins to manage attachments
CREATE POLICY "Admins can insert attachments"
ON public.email_template_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can delete attachments"
ON public.email_template_attachments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'superadmin')
  )
);