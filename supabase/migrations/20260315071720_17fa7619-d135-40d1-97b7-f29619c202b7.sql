-- Company subscriptions table
CREATE TABLE public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_customer_id text,
  billing_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan text NOT NULL DEFAULT 'starter',
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'inactive',
  seat_count integer NOT NULL DEFAULT 1,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  is_trial boolean NOT NULL DEFAULT false,
  trial_end timestamptz,
  addons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Add billing_user_id to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billing_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

-- All authenticated company members can read their own company subscription
CREATE POLICY "Company members can read own subscription"
ON public.company_subscriptions
FOR SELECT
TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Only billing user can update
CREATE POLICY "Billing user can update subscription"
ON public.company_subscriptions
FOR UPDATE
TO authenticated
USING (billing_user_id = auth.uid())
WITH CHECK (billing_user_id = auth.uid());

-- Service can insert/update via service_role (no policy needed for service_role as it bypasses RLS)