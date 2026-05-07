CREATE POLICY "Users can update risk assessments in own company"
  ON mission_risk_assessments
  FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));