import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { AppShell, useProjects } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { slugify } from "@/lib/vistrao";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Vistrao" },
      { name: "description", content: "Browse every Vistrao project you belong to and spin up new ones." },
      { property: "og:title", content: "Projects — Vistrao" },
      { property: "og:description", content: "All of your team's projects in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ProjectsPage />
    </AppShell>
  ),
});

function ProjectsPage() {
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function createProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name"));
    setBusy(true);
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name,
        slug: slugify(name),
        description: String(form.get("description") ?? ""),
        owner_id: user!.id,
      })
      .select()
      .single();

    if (error || !project) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create project");
      return;
    }

    await supabase.from("project_members").insert({ project_id: project.id, user_id: user!.id, role: "owner" });
    await supabase.from("board_columns").insert(
      ["Backlog", "In Progress", "In Review", "Done"].map((title, position) => ({
        project_id: project.id,
        title,
        position,
      })),
    );

    setBusy(false);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["projects", user!.id] });
    toast.success("Project created");
    navigate({ to: "/projects/$projectId/board", params: { projectId: project.id } });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Every workspace you're part of.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="ml-auto">
              <Plus className="mr-1.5 size-4" /> New project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createProject}>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>A board with four starter columns will be created for you.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input id="p-name" name="name" required placeholder="Website redesign" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea id="p-desc" name="description" placeholder="What is this project about?" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>Create project</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link key={project.id} to="/projects/$projectId/board" params={{ projectId: project.id }}>
            <Card className="surface-panel h-full transition-shadow hover:shadow-lift">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-gradient-brand" />
                  <p className="font-medium">{project.name}</p>
                  {project.archived && <Badge variant="secondary" className="ml-auto">Archived</Badge>}
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{project.description}</p>
                <p className="text-xs text-muted-foreground">/{project.slug}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {projects.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">No projects yet. Create your first one.</p>
      )}
    </div>
  );
}
