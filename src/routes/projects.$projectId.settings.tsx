import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { InviteMemberDialog, PendingInvitations } from "@/components/invite-members";
import { ProjectHeader, useMembers, useMyRole, useProject } from "@/components/project-layout";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { initials, useAuth } from "@/lib/auth";
import { canManage, ROLES, slugify, type ProjectRole } from "@/lib/vistrao";

export const Route = createFileRoute("/projects/$projectId/settings")({
  head: () => ({
    meta: [
      { title: "Project Settings — Vistrao" },
      {
        name: "description",
        content: "Update project details, manage member roles and archive or delete the project.",
      },
      { property: "og:title", content: "Project Settings — Vistrao" },
      { property: "og:description", content: "Control project details, teammates and lifecycle actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

function SettingsPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: project } = useProject(projectId);
  const { data: members = [] } = useMembers(projectId);
  const role = useMyRole(projectId);
  const manage = canManage(role);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
    }
  }, [project]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  async function saveDetails() {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("projects")
      .update({ name: name.trim(), description, slug: slugify(name) })
      .eq("id", projectId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Project updated");
    refresh();
  }

  async function changeRole(memberId: string, next: ProjectRole) {
    const { error } = await supabase.from("project_members").update({ role: next }).eq("id", memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    refresh();
  }

  async function toggleArchive() {
    const { error } = await supabase
      .from("projects")
      .update({ archived: !project?.archived })
      .eq("id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(project?.archived ? "Project restored" : "Project archived");
    refresh();
  }

  async function deleteProject() {
    if (!window.confirm("Delete this project and all of its tasks? This cannot be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Project deleted");
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    navigate({ to: "/projects" });
  }

  const isOwner = project?.owner_id === user?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectHeader projectId={projectId} />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!manage}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!manage}
              />
            </div>
            {manage && (
              <Button onClick={saveDetails} disabled={busy}>
                Save changes
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Members</CardTitle>
            {manage && <InviteMemberDialog projectId={projectId} />}
          </CardHeader>
          <CardContent className="space-y-3">

            {members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(member.profile?.full_name ?? "?")}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.profile?.full_name ?? "Teammate"}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.profile?.email}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {manage && member.role !== "owner" ? (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(value) => changeRole(member.id, value as ProjectRole)}
                      >
                        <SelectTrigger className="w-32 capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => r !== "owner").map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => removeMember(member.id)}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm capitalize text-muted-foreground">{member.role}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {manage && (
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">Invitations</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingInvitations projectId={projectId} canManage={manage} />
            </CardContent>
          </Card>
        )}



        {isOwner && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={toggleArchive}>
                {project?.archived ? "Restore project" : "Archive project"}
              </Button>
              <Button variant="destructive" onClick={deleteProject}>
                Delete project
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
