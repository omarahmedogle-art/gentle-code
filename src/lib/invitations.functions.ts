import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InvitationPreview = {
  id: string;
  project_id: string;
  project_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  inviter_name: string;
};

const tokenSchema = z.object({ token: z.string().min(8).max(200) });

export const getInvitation = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<InvitationPreview | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .schema("private")
      .rpc("get_invitation", { _token: data.token });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as InvitationPreview[];
    return list[0] ?? null;
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data, context }): Promise<string> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string } | null)?.email ?? "";
    const { data: projectId, error } = await supabaseAdmin
      .schema("private")
      .rpc("accept_invitation", {
        _token: data.token,
        _user_id: context.userId,
        _user_email: email,
      });
    if (error) throw new Error(error.message);
    return projectId as unknown as string;
  });
