import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { acceptInvitation, getInvitation } from "@/lib/invitations.functions";

type Search = { token?: string | undefined };

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search['token'] === "string" ? search['token'] : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Accept Invitation — Vistrao" },
      {
        name: "description",
        content: "Accept your Vistrao project invitation and join your team's workspace and board.",
      },
      { property: "og:title", content: "Accept Invitation — Vistrao" },
      { property: "og:description", content: "Join your team's Vistrao workspace in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const fetchInvitation = useServerFn(getInvitation);
  const acceptFn = useServerFn(acceptInvitation);

  const { data: invitation, isLoading } = useQuery({
    queryKey: ["invitation", token],
    enabled: !!token,
    queryFn: async () => (await fetchInvitation({ data: { token: token! } })) ?? undefined,
  });

  async function accept() {
    setBusy(true);
    try {
      const projectId = await acceptFn({ data: { token: token! } });
      toast.success("Welcome to the team!");
      queryClient.invalidateQueries();
      navigate({ to: "/projects/$projectId/board", params: { projectId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept this invitation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md surface-panel">
        <CardHeader>
          <CardTitle>Project invitation</CardTitle>
          <CardDescription>
            {!token
              ? "This link is missing an invitation token."
              : isLoading
                ? "Checking your invitation…"
                : invitation
                  ? `${invitation.inviter_name || "A teammate"} invited you to join ${invitation.project_name}.`
                  : "We couldn't find this invitation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Invited email</span>
                <span className="truncate font-medium">{invitation.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="secondary" className="capitalize">
                  {invitation.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="capitalize">
                  {invitation.status}
                </Badge>
              </div>
            </div>
          )}

          {invitation?.status === "pending" ? (
            loading ? null : user ? (
              user.email?.toLowerCase() === invitation.email.toLowerCase() ? (
                <Button className="w-full" onClick={accept} disabled={busy}>
                  {busy ? "Joining…" : `Join ${invitation.project_name}`}
                </Button>
              ) : (
                <p className="text-sm text-destructive">
                  You're signed in as {user.email}. Sign in as {invitation.email} to accept this invite.
                </p>
              )
            ) : (
              <Button asChild className="w-full">
                <Link to="/auth">Sign in to accept</Link>
              </Button>
            )
          ) : (
            invitation && (
              <p className="text-sm text-muted-foreground">
                This invitation is {invitation.status} and can no longer be used.
              </p>
            )
          )}

          <Button asChild variant="ghost" className="w-full">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
