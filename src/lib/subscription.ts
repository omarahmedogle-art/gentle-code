import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type PlanType = "free_trial" | "starter" | "pro";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid";

export type PlanDef = {
  id: Exclude<PlanType, "free_trial">;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  projectLimit: number | null;
  featured?: boolean;
};

export const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$5",
    cadence: "per month",
    tagline: "For small teams running a couple of boards.",
    features: [
      "Up to 3 active projects",
      "Standard Kanban features",
      "Sprint analytics",
      "Role-based access",
    ],
    projectLimit: 3,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$10",
    cadence: "per month",
    tagline: "For teams that need room to grow.",
    features: [
      "Unlimited projects",
      "Priority features",
      "Full workspace collaboration",
      "Everything in Starter",
    ],
    projectLimit: null,
    featured: true,
  },
];

export const TRIAL_DAYS = 7;

/** Active project allowance for a plan. null means unlimited. */
export function projectLimitFor(plan: PlanType | null | undefined): number | null {
  if (plan === "pro") return null;
  return 3;
}

export function planLabel(plan: PlanType | null | undefined) {
  if (plan === "pro") return "Pro";
  if (plan === "starter") return "Starter";
  return "Free trial";
}

export function statusLabel(status: SubscriptionStatus | string | null | undefined) {
  switch (status) {
    case "trialing":
      return "Trialing";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    default:
      return "Unknown";
  }
}

export function trialExpired(sub?: Subscription | null) {
  if (!sub || sub.status !== "trialing" || !sub.trial_end) return false;
  return new Date(sub.trial_end).getTime() < Date.now();
}

/** Whether the workspace currently allows write actions. */
export function subscriptionActive(sub?: Subscription | null) {
  if (!sub) return true; // no record yet — don't lock people out
  if (trialExpired(sub)) return false;
  return sub.status === "active" || sub.status === "trialing";
}

export function daysLeft(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function useSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
  });
}

/** Count of active (non-archived) projects the user owns. */
export function useOwnedProjectCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["owned-project-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user!.id)
        .eq("archived", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
