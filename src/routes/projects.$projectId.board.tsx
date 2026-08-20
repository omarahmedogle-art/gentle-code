import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Lock, MessageSquare, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import {
  ProjectHeader,
  useColumns,
  useMembers,
  useMyRole,
  useTasks,
} from "@/components/project-layout";
import { TaskDialog } from "@/components/task-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { initials, useAuth } from "@/lib/auth";
import { canEdit, canManage, canMoveTask, PRIORITIES, priorityStyles, type Task } from "@/lib/vistrao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/board")({
  head: () => ({
    meta: [
      { title: "Kanban Board — Vistrao" },
      {
        name: "description",
        content: "Drag and drop Kanban board with filters by priority, assignee and tag, plus rich task details.",
      },
      { property: "og:title", content: "Kanban Board — Vistrao" },
      { property: "og:description", content: "Move work across columns and keep every task detail in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <BoardPage />
    </AppShell>
  ),
});

function BoardPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: columns = [] } = useColumns(projectId);
  const { data: tasks = [] } = useTasks(projectId);
  const { data: members = [] } = useMembers(projectId);
  const role = useMyRole(projectId);
  const { user } = useAuth();
  const editable = canEdit(role);

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [tag, setTag] = useState("all");
  const [status, setStatus] = useState("all");
  const [dragged, setDragged] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [composerColumn, setComposerColumn] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState("");

  const tags = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort(),
    [tasks],
  );

  const filtered = tasks.filter((task) => {
    if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (priority !== "all" && task.priority !== priority) return false;
    if (assignee !== "all" && (task.assignee_id ?? "none") !== assignee) return false;
    if (tag !== "all" && !task.tags.includes(tag)) return false;
    if (status === "open" && task.completed_at) return false;
    if (status === "done" && !task.completed_at) return false;
    return true;
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });

  async function moveTask(taskId: string, columnId: string) {
    const target = tasks.filter((t) => t.column_id === columnId);
    const { error } = await supabase
      .from("tasks")
      .update({ column_id: columnId, position: target.length })
      .eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  async function createTask(columnId: string, title: string) {
    if (!title.trim()) return;
    const target = tasks.filter((t) => t.column_id === columnId);
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      column_id: columnId,
      title: title.trim(),
      position: target.length,
    });
    if (error) { toast.error(error.message); return; }
    setComposerColumn(null);
    refresh();
  }

  async function addColumn() {
    if (!newColumn.trim()) return;
    const { error } = await supabase.from("board_columns").insert({
      project_id: projectId,
      title: newColumn.trim(),
      position: columns.length,
    });
    if (error) { toast.error(error.message); return; }
    setNewColumn("");
    queryClient.invalidateQueries({ queryKey: ["columns", projectId] });
  }

  return (
    <>
      <ProjectHeader projectId={projectId} />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards"
              className="pl-9"
            />
          </div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="none">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name || m.profile?.email || "Teammate"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-4 overflow-x-auto rounded-2xl pb-4">
          {columns.map((column) => {
            const columnTasks = filtered.filter((t) => t.column_id === column.id);
            return (
              <div
                key={column.id}
                onDragOver={(e) => editable && e.preventDefault()}
                onDrop={() => {
                  if (dragged && editable) moveTask(dragged, column.id);
                  setDragged(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-kanban-column-border bg-kanban-column p-3 shadow-soft"
              >
                <div className="flex items-center gap-2 px-1 pb-3">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {columnTasks.length}
                  </span>
                  {canManage(role) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                      onClick={async () => {
                        await supabase.from("board_columns").delete().eq("id", column.id);
                        queryClient.invalidateQueries({ queryKey: ["columns", projectId] });
                        refresh();
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {columnTasks.map((task) => {
                    const person = members.find((m) => m.user_id === task.assignee_id)?.profile;
                    const movable = canMoveTask(role, task, user?.id);
                    return (
                      <article
                        key={task.id}
                        draggable={movable}
                        onDragStart={() => movable && setDragged(task.id)}
                        onClick={() => setOpenTask(task)}
                        title={!movable && editable ? "Only the assignee, admins or owners can move this task" : undefined}
                        className={cn(
                          "rounded-lg border border-kanban-card-border bg-kanban-card p-3 shadow-md transition-shadow hover:shadow-lift",
                          movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <p className={cn("flex-1 text-sm font-medium", task.completed_at && "line-through opacity-60")}>
                            {task.title}
                          </p>
                          {!movable && editable && (
                            <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-label="Locked" />
                          )}
                          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize", priorityStyles[task.priority])}>
                            {task.priority}
                          </span>
                        </div>

                        {task.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.tags.map((t) => (
                              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="size-3" /> {format(new Date(task.due_date), "MMM d")}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" /> {Number(task.logged_hours)}h
                          </span>
                          {person && (
                            <Avatar className="ml-auto size-6">
                              <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                              <AvatarFallback className="bg-gradient-brand text-[9px] text-white">
                                {initials(person.full_name, person.email)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {editable &&
                  (composerColumn === column.id ? (
                    <Input
                      autoFocus
                      className="mt-2"
                      placeholder="Card title, press Enter"
                      onBlur={() => setComposerColumn(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createTask(column.id, e.currentTarget.value);
                        if (e.key === "Escape") setComposerColumn(null);
                      }}
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 justify-start text-muted-foreground"
                      onClick={() => setComposerColumn(column.id)}
                    >
                      <Plus className="mr-1.5 size-4" /> Create card
                    </Button>
                  ))}
              </div>
            );
          })}

          {canEdit(role) && (
            <div className="w-72 shrink-0 rounded-xl border border-dashed p-3">
              <p className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Add new column</p>
              <div className="flex gap-2">
                <Input
                  value={newColumn}
                  placeholder="Column title"
                  onChange={(e) => setNewColumn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addColumn()}
                />
                <Button variant="outline" size="icon" onClick={addColumn} aria-label="Add column">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TaskDialog
        task={openTask}
        projectId={projectId}
        editable={openTask ? canMoveTask(role, openTask, user?.id) : false}
        onOpenChange={(open) => !open && setOpenTask(null)}
      />
    </>
  );
}
