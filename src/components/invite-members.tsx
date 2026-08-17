import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectRole } from "@/lib/vistrao";

export type Invitation = Database["public"]["Tables"]["project_invitations"]["Row"];

const INVITE_ROLES: ProjectRole[] = ["admin", "member", "viewer"];

export function inviteUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/accept-invite?token=${token}`;
}

export function useInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["invitations", projectId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_invitations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invitation[];
    },
  });
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(inviteUrl(token));
        setCopied(true);
        toast.success("Invite link copied");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-1.5 hidden sm:inline">Copy link</span>
    </Button>
  );
}

export function InviteMemberDialog({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("member");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address");
      const { data, error } = await supabase
        .from("project_invitations")
        .insert({ project_id: projectId, email: clean, role, invited_by: user!.id })
        .select("token")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("There is already a pending invite for that email");
        throw error;
      }
      return data.token as string;
    },
    onSuccess: (token) => {
      setCreatedToken(token);
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["invitations", projectId] });
      toast.success("Invitation created — share the link");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreatedToken(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            Send an invite link. They join with the role you pick once they accept.
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-3">
            <Label>Invitation link</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteUrl(createdToken)} className="text-xs" />
              <CopyLinkButton token={createdToken} />
            </div>
            <p className="text-xs text-muted-foreground">
              The link is valid for 14 days and only works for the invited email address.
            </p>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setCreatedToken(null)}>
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") invite.mutate();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as ProjectRole)}>
                <SelectTrigger className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
                {invite.isPending ? "Creating…" : "Create invite"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PendingInvitations({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data: invitations = [] } = useInvitations(projectId, canManage);

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["invitations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) return null;

  const pending = invitations.filter((i) => i.status === "pending");
  const past = invitations.filter((i) => i.status !== "pending").slice(0, 5);

  return (
    <div className="space-y-3">
      {pending.length === 0 && (
        <p className="text-sm text-muted-foreground">No pending invitations.</p>
      )}
      {pending.map((invitation) => (
        <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(invitation.expires_at).toLocaleDateString()}
            </p>
          </div>
          <Badge variant="secondary" className="capitalize">
            {invitation.role}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <CopyLinkButton token={invitation.token} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revoke.mutate(invitation.id)}
              disabled={revoke.isPending}
            >
              <Trash2 className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Revoke</span>
            </Button>
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
          {past.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-sm"
            >
              <span className="truncate text-muted-foreground">{invitation.email}</span>
              <Badge variant="outline" className="ml-auto capitalize">
                {invitation.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
