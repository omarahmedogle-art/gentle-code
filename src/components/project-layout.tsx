import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BoardColumn, Profile, Project, ProjectMember, ProjectRole, Task } from "@/lib/vistrao";

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data as Project | null;
    },
  });
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: ["members", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      const members = (data ?? []) as ProjectMember[];
      const ids = members.map((m) => m.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("*").in("id", ids)
        : { data: [] as Profile[] };
      return members.map((m) => ({
        ...m,
        profile: (profiles as Profile[] | null)?.find((p) => p.id === m.user_id) ?? null,
      }));
    },
  });
}

export function useMyRole(projectId: string): ProjectRole | null {
  const { user } = useAuth();
  const { data: members = [] } = useMembers(projectId);
  return members.find((m) => m.user_id === user?.id)?.role ?? null;
}

export function useColumns(projectId: string) {
  return useQuery({
    queryKey: ["columns", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_columns")
        .select("*")
        .eq("project_id", projectId)
        .order("position");
      if (error) throw error;
      return data as BoardColumn[];
    },
  });
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("position");
      if (error) throw error;
      return data as Task[];
    },
  });
}

export function ProjectHeader({
  projectId,
  children,
}: {
  projectId: string;
  children?: ReactNode;
}) {
  const { data: project } = useProject(projectId);
  const role = useMyRole(projectId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/projects/$projectId/board", label: "Board" },
    { to: "/projects/$projectId/analytics", label: "Analytics" },
    { to: "/projects/$projectId/settings", label: "Settings" },
  ] as const;

  return (
    <div className="border-b bg-background/60">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{project?.name ?? "Project"}</h1>
          <p className="truncate text-sm text-muted-foreground">{project?.description}</p>
        </div>
        {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
      <nav className="mt-3 flex gap-1 px-2 sm:px-4">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ projectId }}
            className={cn(
              "rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              pathname.endsWith(tab.label.toLowerCase()) && "border-primary text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
