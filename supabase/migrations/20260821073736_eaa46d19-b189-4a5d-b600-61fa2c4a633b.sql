CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  plan_type text NOT NULL DEFAULT 'free_trial' CHECK (plan_type IN ('free_trial','starter','pro')),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled','unpaid')),
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_subscriptions_touch
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill existing users with a trial that is already generous.
INSERT INTO public.subscriptions (user_id, plan_type, status, trial_end)
SELECT u.id, 'free_trial', 'trialing', now() + interval '7 days'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- New signups get a 7-day trial.
CREATE OR REPLACE FUNCTION private.create_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_type, status, trial_end)
  VALUES (NEW.id, 'free_trial', 'trialing', now() + interval '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trial subscription creation failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION private.create_trial_subscription() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.create_trial_subscription();

-- Server-side project limit enforcement.
CREATE OR REPLACE FUNCTION private.enforce_project_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sub public.subscriptions%ROWTYPE;
  active_count integer;
  max_projects integer;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE user_id = NEW.owner_id;

  IF sub.id IS NULL THEN
    max_projects := 3;
  ELSE
    IF sub.status NOT IN ('trialing', 'active') THEN
      RAISE EXCEPTION 'Your subscription is % - reactivate your plan to create projects.', sub.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF sub.status = 'trialing' AND sub.trial_end IS NOT NULL AND sub.trial_end < now() THEN
      RAISE EXCEPTION 'Your free trial has ended. Choose a plan to keep creating projects.'
        USING ERRCODE = 'check_violation';
    END IF;
    max_projects := CASE WHEN sub.plan_type = 'pro' THEN NULL ELSE 3 END;
  END IF;

  IF max_projects IS NOT NULL THEN
    SELECT count(*) INTO active_count
    FROM public.projects
    WHERE owner_id = NEW.owner_id AND archived = false;

    IF active_count >= max_projects THEN
      RAISE EXCEPTION 'Project limit reached (% active projects). Upgrade to Pro for unlimited projects.', max_projects
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION private.enforce_project_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_projects_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.enforce_project_limit();