-- Create table for calendar subscription tokens
CREATE TABLE public.calendar_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_accessed_at timestamp with time zone
);

-- Create index for fast token lookups
CREATE INDEX idx_calendar_subscriptions_token ON public.calendar_subscriptions(token);

-- Enable Row Level Security
ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
ON public.calendar_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Approved users can create subscriptions for own company
CREATE POLICY "Approved users can create subscriptions"
ON public.calendar_subscriptions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND company_id = get_user_company_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own subscriptions"
ON public.calendar_subscriptions
FOR DELETE
USING (auth.uid() = user_id);