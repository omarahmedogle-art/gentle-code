CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','revoked','expired');

CREATE TABLE public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.project_role NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX project_invitations_unique_pending
  ON public.project_invitations (project_id, lower(email))
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invitations TO authenticated;
GRANT ALL ON public.project_invitations TO service_role;

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_select ON public.project_invitations
FOR SELECT TO authenticated
USING (
  public.can_manage_project(project_id, auth.uid())
  OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

CREATE POLICY invitations_insert ON public.project_invitations
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_project(project_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY invitations_update ON public.project_invitations
FOR UPDATE TO authenticated
USING (public.can_manage_project(project_id, auth.uid()))
WITH CHECK (public.can_manage_project(project_id, auth.uid()));

CREATE POLICY invitations_delete ON public.project_invitations
FOR DELETE TO authenticated
USING (public.can_manage_project(project_id, auth.uid()));

CREATE TRIGGER trg_invitations_touch BEFORE UPDATE ON public.project_invitations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_invitation(_token text)
RETURNS TABLE (
  id uuid, project_id uuid, project_name text, email text,
  role public.project_role, status public.invitation_status,
  expires_at timestamptz, inviter_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.project_id, p.name, i.email, i.role,
         CASE WHEN i.status = 'pending' AND i.expires_at < now() THEN 'expired'::public.invitation_status ELSE i.status END,
         i.expires_at,
         COALESCE(pr.full_name, '')
  FROM public.project_invitations i
  JOIN public.projects p ON p.id = i.project_id
  LEFT JOIN public.profiles pr ON pr.id = i.invited_by
  WHERE i.token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv public.project_invitations%ROWTYPE;
  uid uuid := auth.uid();
  uemail text := lower(coalesce((auth.jwt() ->> 'email'), ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO inv FROM public.project_invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is no longer valid'; END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.project_invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;
  IF lower(inv.email) <> uemail THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (inv.project_id, uid, inv.role)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.project_invitations
  SET status = 'accepted', accepted_by = uid, accepted_at = now()
  WHERE id = inv.id;

  INSERT INTO public.notifications (user_id, title, message, action_link)
  VALUES (uid, 'Joined a project', 'You are now a ' || inv.role || ' on ' ||
    (SELECT name FROM public.projects WHERE id = inv.project_id) || '.',
    '/projects/' || inv.project_id || '/board');

  RETURN inv.project_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;