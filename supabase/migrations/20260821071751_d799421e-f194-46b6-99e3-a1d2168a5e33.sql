create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 1. Move RLS helper functions out of the exposed API schema
alter function public.can_edit_project(uuid, uuid) set schema private;
alter function public.can_manage_project(uuid, uuid) set schema private;
alter function public.is_project_member(uuid, uuid) set schema private;
alter function public.project_role_of(uuid, uuid) set schema private;
alter function public.shares_project_with(uuid, uuid) set schema private;

revoke all on function private.can_edit_project(uuid, uuid) from public, anon;
revoke all on function private.can_manage_project(uuid, uuid) from public, anon;
revoke all on function private.is_project_member(uuid, uuid) from public, anon;
revoke all on function private.project_role_of(uuid, uuid) from public, anon;
revoke all on function private.shares_project_with(uuid, uuid) from public, anon;

grant execute on function private.can_edit_project(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_project_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.project_role_of(uuid, uuid) to authenticated, service_role;
grant execute on function private.shares_project_with(uuid, uuid) to authenticated, service_role;

-- 2. Invitation functions: server-side only
drop function if exists public.get_invitation(text);
drop function if exists public.accept_invitation(text);

create function private.get_invitation(_token text)
returns table(id uuid, project_id uuid, project_name text, email text, role public.project_role,
              status public.invitation_status, expires_at timestamptz, inviter_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.id, i.project_id, p.name, i.email, i.role,
         case when i.status = 'pending' and i.expires_at < now() then 'expired'::public.invitation_status else i.status end,
         i.expires_at,
         coalesce(pr.full_name, '')
  from public.project_invitations i
  join public.projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.invited_by
  where i.token = _token;
$$;

create function private.accept_invitation(_token text, _user_id uuid, _user_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  inv public.project_invitations%ROWTYPE;
  uemail text := lower(coalesce(_user_email, ''));
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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
  VALUES (inv.project_id, _user_id, inv.role)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.project_invitations
  SET status = 'accepted', accepted_by = _user_id, accepted_at = now()
  WHERE id = inv.id;

  INSERT INTO public.notifications (user_id, title, message, action_link)
  VALUES (_user_id, 'Joined a project', 'You are now a ' || inv.role || ' on ' ||
    (SELECT name FROM public.projects WHERE id = inv.project_id) || '.',
    '/projects/' || inv.project_id || '/board');

  RETURN inv.project_id;
END; $$;

revoke all on function private.get_invitation(text) from public, anon, authenticated;
revoke all on function private.accept_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function private.get_invitation(text) to service_role;
grant execute on function private.accept_invitation(text, uuid, text) to service_role;

-- 3. Guard invitation rows against tampering through the Data API
create or replace function private.guard_invitation_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
BEGIN
  IF new.project_id <> old.project_id
     OR lower(new.email) <> lower(old.email)
     OR new.token <> old.token
     OR new.invited_by <> old.invited_by THEN
    RAISE EXCEPTION 'Invitation project, email, token and inviter cannot be changed';
  END IF;

  IF (new.accepted_by IS DISTINCT FROM old.accepted_by
      OR new.accepted_at IS DISTINCT FROM old.accepted_at)
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Acceptance details can only be recorded by the invitation acceptance flow';
  END IF;

  IF new.status = 'accepted' AND old.status <> 'accepted' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Invitations can only be accepted through the invitation link flow';
  END IF;

  RETURN new;
END; $$;

drop trigger if exists trg_guard_invitation_update on public.project_invitations;
create trigger trg_guard_invitation_update
before update on public.project_invitations
for each row execute function private.guard_invitation_update();