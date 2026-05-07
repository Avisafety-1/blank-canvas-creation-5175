
-- Fix DELETE policy for admins: include 'administrator' role
DROP POLICY IF EXISTS "Admins can delete documents in own company" ON public.documents;
CREATE POLICY "Admins can delete documents in own company"
ON public.documents
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'administrator'))
  AND company_id = get_user_company_id(auth.uid())
);

-- Fix DELETE policy for superadmins: remove company_id restriction
DROP POLICY IF EXISTS "Superadmins can delete all documents" ON public.documents;
CREATE POLICY "Superadmins can delete all documents"
ON public.documents
FOR DELETE
TO authenticated
USING (
  is_superadmin(auth.uid())
);

-- Fix UPDATE policy for admins: include 'administrator' role
DROP POLICY IF EXISTS "Admins can update documents in own company" ON public.documents;
CREATE POLICY "Admins can update documents in own company"
ON public.documents
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'administrator'))
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'administrator'))
  AND company_id = get_user_company_id(auth.uid())
);
