import type { Database } from "@/integrations/supabase/types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectMember = Database["public"]["Tables"]["project_members"]["Row"];
export type BoardColumn = Database["public"]["Tables"]["board_columns"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Subtask = Database["public"]["Tables"]["subtasks"]["Row"];
export type TaskComment = Database["public"]["Tables"]["task_comments"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Priority = Database["public"]["Enums"]["task_priority"];
export type ProjectRole = Database["public"]["Enums"]["project_role"];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const ROLES: ProjectRole[] = ["owner", "admin", "member", "viewer"];

export const priorityStyles: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  high: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
};

export const roleRank: Record<ProjectRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
};

export function canEdit(role?: ProjectRole | null) {
  return !!role && roleRank[role] >= roleRank.member;
}

export function canManage(role?: ProjectRole | null) {
  return !!role && roleRank[role] >= roleRank.admin;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}
