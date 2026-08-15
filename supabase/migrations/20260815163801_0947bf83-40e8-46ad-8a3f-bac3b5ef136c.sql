-- ENUMS
CREATE TYPE public.project_role AS ENUM ('owner','admin','member','viewer');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- PROJECTS
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'violet',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- MEMBERS
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.project_role_of(_project_id UUID, _user_id UUID)
RETURNS public.project_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role_of(_project_id, _user_id) IN ('owner','admin');
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.project_role_of(_project_id, _user_id) IN ('owner','admin','member');
$$;

CREATE OR REPLACE FUNCTION public.shares_project_with(_other UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members a
    JOIN public.project_members b ON a.project_id = b.project_id
    WHERE a.user_id = _other AND b.user_id = _user_id
  );
$$;

-- PROFILE POLICIES
CREATE POLICY "profiles_select_self_or_teammate" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_project_with(id, auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- PROJECT POLICIES
CREATE POLICY "projects_select_member" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(id, auth.uid()));
CREATE POLICY "projects_insert_owner" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update_admin" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_project(id, auth.uid())) WITH CHECK (public.can_manage_project(id, auth.uid()));
CREATE POLICY "projects_delete_owner" ON public.projects FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- MEMBER POLICIES
CREATE POLICY "members_select" ON public.project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "members_insert" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_project(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
CREATE POLICY "members_update" ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_manage_project(project_id, auth.uid())) WITH CHECK (public.can_manage_project(project_id, auth.uid()));
CREATE POLICY "members_delete" ON public.project_members FOR DELETE TO authenticated
  USING (public.can_manage_project(project_id, auth.uid()) OR user_id = auth.uid());

-- COLUMNS
CREATE TABLE public.board_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_columns TO authenticated;
GRANT ALL ON public.board_columns TO service_role;
ALTER TABLE public.board_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "columns_select" ON public.board_columns FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "columns_insert" ON public.board_columns FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "columns_update" ON public.board_columns FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid())) WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "columns_delete" ON public.board_columns FOR DELETE TO authenticated USING (public.can_manage_project(project_id, auth.uid()));

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  column_id UUID REFERENCES public.board_columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_date DATE,
  estimated_hours NUMERIC NOT NULL DEFAULT 0,
  logged_hours NUMERIC NOT NULL DEFAULT 0,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (public.can_edit_project(project_id, auth.uid())) WITH CHECK (public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

-- SUBTASKS
CREATE TABLE public.subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtasks TO authenticated;
GRANT ALL ON public.subtasks TO service_role;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subtasks_select" ON public.subtasks FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "subtasks_write" ON public.subtasks FOR ALL TO authenticated USING (public.can_edit_project(project_id, auth.uid())) WITH CHECK (public.can_edit_project(project_id, auth.uid()));

-- COMMENTS
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON public.task_comments FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "comments_insert" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_edit_project(project_id, auth.uid()));
CREATE POLICY "comments_delete" ON public.task_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.can_manage_project(project_id, auth.uid()));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  action_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- New user bootstrap: profile + starter project
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid UUID;
  c_backlog UUID; c_progress UUID; c_review UUID; c_done UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.email,''), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.projects (name, slug, description, color, owner_id)
  VALUES ('Vistrao Launch','vistrao-launch','Ship the Vistrao 1.0 release across product, design and marketing.','violet', NEW.id)
  RETURNING id INTO pid;

  INSERT INTO public.project_members (project_id, user_id, role) VALUES (pid, NEW.id, 'owner');

  INSERT INTO public.board_columns (project_id, title, position) VALUES (pid,'Backlog',0) RETURNING id INTO c_backlog;
  INSERT INTO public.board_columns (project_id, title, position) VALUES (pid,'In Progress',1) RETURNING id INTO c_progress;
  INSERT INTO public.board_columns (project_id, title, position) VALUES (pid,'In Review',2) RETURNING id INTO c_review;
  INSERT INTO public.board_columns (project_id, title, position) VALUES (pid,'Done',3) RETURNING id INTO c_done;

  INSERT INTO public.tasks (project_id, column_id, title, description, priority, due_date, estimated_hours, logged_hours, assignee_id, tags, position, created_by, completed_at) VALUES
    (pid, c_backlog, 'Define Q3 product roadmap', 'Collect input from design, engineering and support, then publish the roadmap.', 'high', CURRENT_DATE + 9, 12, 2, NEW.id, ARRAY['planning'], 0, NEW.id, NULL),
    (pid, c_backlog, 'Audit onboarding funnel', 'Instrument each onboarding step and find the biggest drop-off.', 'medium', CURRENT_DATE + 14, 8, 0, NULL, ARRAY['growth','analytics'], 1, NEW.id, NULL),
    (pid, c_progress, 'Rebuild Kanban drag & drop', 'Replace the legacy board interactions with the new pointer-based engine.', 'urgent', CURRENT_DATE + 3, 20, 11, NEW.id, ARRAY['frontend'], 0, NEW.id, NULL),
    (pid, c_progress, 'Design notification center', 'Drawer with unread badge, grouping and read/unread toggles.', 'medium', CURRENT_DATE + 5, 10, 4, NEW.id, ARRAY['design'], 1, NEW.id, NULL),
    (pid, c_review, 'Role-based access rules', 'Owner, Admin, Member and Viewer permissions across every project surface.', 'high', CURRENT_DATE + 2, 14, 13, NEW.id, ARRAY['backend','security'], 0, NEW.id, NULL),
    (pid, c_done, 'Set up analytics charts', 'Burndown, velocity and status distribution charts on the analytics tab.', 'low', CURRENT_DATE - 2, 6, 6, NEW.id, ARRAY['analytics'], 0, NEW.id, now() - INTERVAL '2 days'),
    (pid, c_done, 'Ship dark mode', 'Full dark/light theming with a persisted toggle.', 'medium', CURRENT_DATE - 5, 9, 8, NEW.id, ARRAY['design'], 1, NEW.id, now() - INTERVAL '5 days');

  INSERT INTO public.notifications (user_id, title, message, action_link, read) VALUES
    (NEW.id, 'Welcome to Vistrao', 'Your starter project is ready. Open the board to get going.', '/dashboard', false),
    (NEW.id, 'Task due soon', '"Role-based access rules" is due in 2 days.', '/dashboard', false),
    (NEW.id, 'Sprint report ready', 'Last sprint closed at 87% completion.', '/dashboard', true);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();