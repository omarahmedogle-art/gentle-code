DROP POLICY IF EXISTS tasks_update ON public.tasks;

CREATE POLICY tasks_update ON public.tasks
FOR UPDATE
TO authenticated
USING (
  public.can_manage_project(project_id, auth.uid())
  OR (public.can_edit_project(project_id, auth.uid()) AND assignee_id = auth.uid())
)
WITH CHECK (
  public.can_manage_project(project_id, auth.uid())
  OR (public.can_edit_project(project_id, auth.uid()) AND assignee_id = auth.uid())
);