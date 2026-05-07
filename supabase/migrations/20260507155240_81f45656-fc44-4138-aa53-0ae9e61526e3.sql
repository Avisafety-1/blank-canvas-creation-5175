CREATE TABLE public."TEST" (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public."TEST" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can do everything on TEST"
ON public."TEST"
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));