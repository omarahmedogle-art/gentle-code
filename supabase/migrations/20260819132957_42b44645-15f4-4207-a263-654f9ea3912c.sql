GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self_or_teammate ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

CREATE POLICY profiles_insert_self
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_select_self_or_teammate
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.shares_project_with(id, auth.uid())
);

CREATE POLICY profiles_update_self
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pid uuid;
  c_backlog uuid;
  c_progress uuid;
  c_review uuid;
  c_done uuid;
  profile_name text;
BEGIN
  profile_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'New user'
  );

  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    profile_name,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = now();

  BEGIN
    INSERT INTO public.projects (name, slug, description, color, owner_id)
    VALUES (
      'Vistrao Launch',
      'vistrao-launch',
      'Ship the Vistrao 1.0 release across product, design and marketing.',
      'violet',
      NEW.id
    )
    RETURNING id INTO pid;

    -- trg_projects_owner_member creates the owner membership automatically.
    -- Do not insert it again here: the duplicate row previously aborted signup.

    INSERT INTO public.board_columns (project_id, title, position)
    VALUES (pid, 'Backlog', 0)
    RETURNING id INTO c_backlog;

    INSERT INTO public.board_columns (project_id, title, position)
    VALUES (pid, 'In Progress', 1)
    RETURNING id INTO c_progress;

    INSERT INTO public.board_columns (project_id, title, position)
    VALUES (pid, 'In Review', 2)
    RETURNING id INTO c_review;

    INSERT INTO public.board_columns (project_id, title, position)
    VALUES (pid, 'Done', 3)
    RETURNING id INTO c_done;

    INSERT INTO public.tasks (
      project_id, column_id, title, description, priority, due_date,
      estimated_hours, logged_hours, assignee_id, tags, position,
      created_by, completed_at
    )
    VALUES
      (pid, c_backlog, 'Define Q3 product roadmap', 'Collect input from design, engineering and support, then publish the roadmap.', 'high', CURRENT_DATE + 9, 12, 2, NEW.id, ARRAY['planning'], 0, NEW.id, NULL),
      (pid, c_backlog, 'Audit onboarding funnel', 'Instrument each onboarding step and find the biggest drop-off.', 'medium', CURRENT_DATE + 14, 8, 0, NULL, ARRAY['growth','analytics'], 1, NEW.id, NULL),
      (pid, c_progress, 'Rebuild Kanban drag & drop', 'Replace the legacy board interactions with the new pointer-based engine.', 'urgent', CURRENT_DATE + 3, 20, 11, NEW.id, ARRAY['frontend'], 0, NEW.id, NULL),
      (pid, c_progress, 'Design notification center', 'Drawer with unread badge, grouping and read/unread toggles.', 'medium', CURRENT_DATE + 5, 10, 4, NEW.id, ARRAY['design'], 1, NEW.id, NULL),
      (pid, c_review, 'Role-based access rules', 'Owner, Admin, Member and Viewer permissions across every project surface.', 'high', CURRENT_DATE + 2, 14, 13, NEW.id, ARRAY['backend','security'], 0, NEW.id, NULL),
      (pid, c_done, 'Set up analytics charts', 'Burndown, velocity and status distribution charts on the analytics tab.', 'low', CURRENT_DATE - 2, 6, 6, NEW.id, ARRAY['analytics'], 0, NEW.id, now() - INTERVAL '2 days'),
      (pid, c_done, 'Ship dark mode', 'Full dark/light theming with a persisted toggle.', 'medium', CURRENT_DATE - 5, 9, 8, NEW.id, ARRAY['design'], 1, NEW.id, now() - INTERVAL '5 days');

    INSERT INTO public.notifications (user_id, title, message, action_link, read)
    VALUES
      (NEW.id, 'Welcome to Vistrao', 'Your starter project is ready. Open the board to get going.', '/dashboard', false),
      (NEW.id, 'Task due soon', '"Role-based access rules" is due in 2 days.', '/dashboard', false),
      (NEW.id, 'Sprint report ready', 'Last sprint closed at 87% completion.', '/dashboard', true);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Optional starter workspace setup failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;