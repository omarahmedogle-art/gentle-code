import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, isBefore } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, ListTodo, TrendingUp } from "lucide-react";

import { AppShell, useProjects } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/lib/auth";
import { priorityStyles, type Profile, type Task } from "@/lib/vistrao";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Vistrao" },
      {
        name: "description",
        content: "Your delivery snapshot: key metrics, recent projects, upcoming deadlines and team activity.",
      },
      { property: "og:title", content: "Dashboard — Vistrao" },
      { property: "og:description", content: "Key project metrics, deadlines and activity in one view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <DashboardPage />
    </AppShell>
  ),
});

function DashboardPage() {
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();

  const { data: tasks = [] } = useQuery({
    queryKey: ["all-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: team = [] } = useQuery({
    queryKey: ["team", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").limit(12);
      if (error) throw error;
      return data as Profile[];
    },
  });

  const done = tasks.filter((t) => t.completed_at).length;
  const overdue = tasks.filter(
    (t) => !t.completed_at && t.due_date && isBefore(new Date(t.due_date), new Date()),
  ).length;
  const logged = tasks.reduce((sum, t) => sum + Number(t.logged_hours), 0);
  const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const upcoming = tasks
    .filter((t) => !t.completed_at && t.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 5);

  const stats = [
    { label: "Active projects", value: projects.filter((p) => !p.archived).length, icon: TrendingUp },
    { label: "Open tasks", value: tasks.length - done, icon: ListTodo },
    { label: "Completed", value: done, icon: CheckCircle2 },
    { label: "Overdue", value: overdue, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Here's how delivery is tracking today.</p>
        </div>
        <div className="ml-auto flex -space-x-2">
          {team.map((member) => (
            <Avatar key={member.id} className="size-8 border-2 border-background">
              <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name} />
              <AvatarFallback className="bg-gradient-brand text-[10px] text-white">
                {initials(member.full_name, member.email)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="surface-panel">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <stat.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent projects</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.slice(0, 5).map((project) => {
              const scoped = tasks.filter((t) => t.project_id === project.id);
              const complete = scoped.filter((t) => t.completed_at).length;
              const pct = scoped.length ? Math.round((complete / scoped.length) * 100) : 0;
              return (
                <Link
                  key={project.id}
                  to="/projects/$projectId/board"
                  params={{ projectId: project.id }}
                  className="block rounded-xl border p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="size-2.5 rounded-full bg-gradient-brand" />
                    <p className="font-medium">{project.name}</p>
                    <Badge variant="secondary" className="ml-auto">{pct}%</Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{project.description}</p>
                  <Progress value={pct} className="mt-3 h-1.5" />
                </Link>
              );
            })}
            {projects.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No projects yet — create one from the Projects page.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-medium tabular-nums">{completion}%</span>
                </div>
                <Progress value={completion} className="mt-2 h-2" />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" /> {logged.toFixed(1)}h logged across all projects
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming deadlines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcoming.map((task) => (
                <div key={task.id} className="flex items-start gap-3">
                  <span className={`mt-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${priorityStyles[task.priority]}`}>
                    {task.priority}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {format(new Date(task.due_date!), "MMM d")}
                    </p>
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing due. Enjoy the calm.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity feed</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {tasks.slice(0, 8).map((task) => (
              <li key={task.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{task.title}</span>{" "}
                    <span className="text-muted-foreground">
                      {task.completed_at ? "was completed" : "was updated"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            ))}
            {tasks.length === 0 && <li className="text-sm text-muted-foreground">No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
