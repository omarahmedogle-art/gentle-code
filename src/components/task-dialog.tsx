import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/lib/auth";
import { useMembers } from "@/components/project-layout";
import { PRIORITIES, priorityStyles, type Priority, type Subtask, type Task, type TaskComment } from "@/lib/vistrao";
import { cn } from "@/lib/utils";

export function TaskDialog({
  task,
  projectId,
  editable,
  onOpenChange,
}: {
  task: Task | null;
  projectId: string;
  editable: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: members = [] } = useMembers(projectId);
  const [newSubtask, setNewSubtask] = useState("");
  const [comment, setComment] = useState("");

  const { data: subtasks = [] } = useQuery({
    queryKey: ["subtasks", task?.id],
    enabled: !!task,
    queryFn: async () => {
      const { data } = await supabase.from("subtasks").select("*").eq("task_id", task!.id).order("position");
      return (data ?? []) as Subtask[];
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", task?.id],
    enabled: !!task,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", task!.id)
        .order("created_at");
      return (data ?? []) as TaskComment[];
    },
  });

  if (!task) return null;

  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });

  async function patch(values: Partial<Task>) {
    const { error } = await supabase.from("tasks").update(values).eq("id", task!.id);
    if (error) return toast.error(error.message);
    refreshTasks();
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return;
    await supabase.from("subtasks").insert({
      task_id: task!.id,
      project_id: projectId,
      title: newSubtask.trim(),
      position: subtasks.length,
    });
    setNewSubtask("");
    queryClient.invalidateQueries({ queryKey: ["subtasks", task!.id] });
  }

  async function addComment() {
    if (!comment.trim()) return;
    await supabase.from("task_comments").insert({
      task_id: task!.id,
      project_id: projectId,
      author_id: user!.id,
      body: comment.trim(),
    });
    setComment("");
    queryClient.invalidateQueries({ queryKey: ["comments", task!.id] });
  }

  const doneCount = subtasks.filter((s) => s.done).length;
  const pct = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0;

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8 text-left text-lg">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                defaultValue={task.description}
                readOnly={!editable}
                rows={4}
                onBlur={(e) => editable && e.target.value !== task.description && patch({ description: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Label className="flex-1">Subtasks</Label>
                <span className="text-xs text-muted-foreground">{doneCount}/{subtasks.length}</span>
              </div>
              <Progress value={pct} className="h-1.5" />
              <ul className="space-y-2">
                {subtasks.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={sub.done}
                      disabled={!editable}
                      onCheckedChange={async (checked) => {
                        await supabase.from("subtasks").update({ done: !!checked }).eq("id", sub.id);
                        queryClient.invalidateQueries({ queryKey: ["subtasks", task.id] });
                      }}
                    />
                    <span className={cn("flex-1 text-sm", sub.done && "text-muted-foreground line-through")}>
                      {sub.title}
                    </span>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Delete subtask"
                        onClick={async () => {
                          await supabase.from("subtasks").delete().eq("id", sub.id);
                          queryClient.invalidateQueries({ queryKey: ["subtasks", task.id] });
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <div className="flex gap-2">
                  <Input
                    value={newSubtask}
                    placeholder="Add a subtask"
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                  />
                  <Button variant="outline" size="icon" onClick={addSubtask} aria-label="Add subtask">
                    <Plus className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Comments</Label>
              <ul className="space-y-3">
                {comments.map((item) => {
                  const author = members.find((m) => m.user_id === item.author_id)?.profile;
                  return (
                    <li key={item.id} className="flex gap-3">
                      <Avatar className="size-7">
                        <AvatarImage src={author?.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="bg-gradient-brand text-[10px] text-white">
                          {initials(author?.full_name, author?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {author?.full_name || "Teammate"} ·{" "}
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </p>
                        <p className="text-sm">{item.body}</p>
                      </div>
                    </li>
                  );
                })}
                {comments.length === 0 && <li className="text-sm text-muted-foreground">No comments yet.</li>}
              </ul>
              {editable && (
                <div className="flex gap-2">
                  <Input
                    value={comment}
                    placeholder="Write a comment"
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                  />
                  <Button variant="outline" onClick={addComment}>Post</Button>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                defaultValue={task.priority}
                disabled={!editable}
                onValueChange={(value) => patch({ priority: value as Priority })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority} className="capitalize">{priority}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className={cn("inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize", priorityStyles[task.priority])}>
                {task.priority}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                defaultValue={task.assignee_id ?? "none"}
                disabled={!editable}
                onValueChange={(value) => patch({ assignee_id: value === "none" ? null : value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profile?.full_name || member.profile?.email || "Teammate"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                readOnly={!editable}
                defaultValue={task.due_date ?? ""}
                onChange={(e) => editable && patch({ due_date: e.target.value || null })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="est">Est. h</Label>
                <Input
                  id="est"
                  type="number"
                  min={0}
                  readOnly={!editable}
                  defaultValue={Number(task.estimated_hours)}
                  onBlur={(e) => editable && patch({ estimated_hours: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="log">Logged h</Label>
                <Input
                  id="log"
                  type="number"
                  min={0}
                  readOnly={!editable}
                  defaultValue={Number(task.logged_hours)}
                  onBlur={(e) => editable && patch({ logged_hours: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                readOnly={!editable}
                defaultValue={task.tags.join(", ")}
                onBlur={(e) =>
                  editable &&
                  patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Button
                variant={task.completed_at ? "default" : "outline"}
                className="w-full"
                disabled={!editable}
                onClick={() => patch({ completed_at: task.completed_at ? null : new Date().toISOString() })}
              >
                {task.completed_at ? "Completed" : "Mark complete"}
              </Button>
              {task.completed_at && (
                <p className="text-xs text-muted-foreground">
                  Completed {format(new Date(task.completed_at), "MMM d, yyyy")}
                </p>
              )}
            </div>

            {editable && (
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={async () => {
                  await supabase.from("tasks").delete().eq("id", task.id);
                  onOpenChange(false);
                  refreshTasks();
                  toast.success("Task deleted");
                }}
              >
                <Trash2 className="mr-1.5 size-4" /> Delete task
              </Button>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
