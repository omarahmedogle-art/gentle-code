-- Owner-scoped access alongside membership-based access
DROP POLICY IF EXISTS projects_select_member ON public.projects;
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_project_member(id, auth.uid()));

DROP POLICY IF EXISTS projects_update_admin ON public.projects;
CREATE POLICY projects_update_admin ON public.projects
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.can_manage_project(id, auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.can_manage_project(id, auth.uid()));

-- Auto-add creator as owner member
CREATE OR REPLACE FUNCTION public.add_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projects_owner_member ON public.projects;
CREATE TRIGGER trg_projects_owner_member
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.add_owner_membership();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;