import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { PricingPlans } from "@/components/pricing-plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createCustomerPortal } from "@/lib/billing.functions";
import {
  daysLeft,
  formatDate,
  planLabel,
  statusLabel,
  subscriptionActive,
  useOwnedProjectCount,
  useSubscription,
  projectLimitFor,
  type PlanType,
} from "@/lib/subscription";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plans — Vistrao" },
      {
        name: "description",
        content: "Manage your Vistrao subscription, view your plan status and upgrade for unlimited projects.",
      },
      { property: "og:title", content: "Billing & Plans — Vistrao" },
      { property: "og:description", content: "Your Vistrao plan, trial countdown and subscription management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <BillingPage />
    </AppShell>
  ),
});

function BillingPage() {
  const { data: sub, isLoading } = useSubscription();
  const { data: ownedCount = 0 } = useOwnedProjectCount();
  const portal = useServerFn(createCustomerPortal);
  const [busy, setBusy] = useState(false);

  const plan = (sub?.plan_type ?? "free_trial") as PlanType;
  const active = subscriptionActive(sub);
  const limit = projectLimitFor(plan);
  const trialDays = sub?.status === "trialing" ? daysLeft(sub.trial_end) : null;

  async function openPortal() {
    setBusy(true);
    try {
      const result = await portal({ data: { returnUrl: `${window.location.origin}/billing` } });
      if (!result.configured || !result.url) {
        toast.info("Payments aren't connected yet", {
          description: "Add your Stripe keys to enable the customer portal.",
        });
        return;
      }
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the billing portal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & plans</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription and workspace limits.</p>
      </div>

      {!active && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Your workspace is read-only</p>
            <p className="text-muted-foreground">
              Your plan is {statusLabel(sub?.status)}. Choose a plan below to restore full access.
            </p>
          </div>
        </div>
      )}

      <Card className="surface-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" /> Current plan
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading your subscription..." : "Your active subscription details."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">{planLabel(plan)}</span>
              <Badge variant={active ? "secondary" : "destructive"}>{statusLabel(sub?.status)}</Badge>
            </div>
            {trialDays !== null && (
              <p className="text-muted-foreground">
                Trial ends in <span className="font-medium text-foreground">{trialDays} day{trialDays === 1 ? "" : "s"}</span> ({formatDate(sub?.trial_end)})
              </p>
            )}
            <p className="text-muted-foreground">
              Renews on <span className="font-medium text-foreground">{formatDate(sub?.current_period_end)}</span>
            </p>
            {sub?.cancel_at_period_end && (
              <p className="text-destructive">Cancels at the end of the current period.</p>
            )}
            <p className="text-muted-foreground">
              Active projects:{" "}
              <span className="font-medium text-foreground">
                {ownedCount}
                {limit === null ? " / unlimited" : ` / ${limit}`}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button onClick={openPortal} disabled={busy} variant="outline">
              Manage subscription <ExternalLink className="ml-1.5 size-4" />
            </Button>
            <p className="text-xs text-muted-foreground sm:text-right">
              Update your card, change plan or cancel through the secure Stripe portal.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {plan === "pro" ? "Your plans" : "Upgrade your plan"}
          </h2>
          <p className="text-sm text-muted-foreground">Every plan starts with a 7-day free trial.</p>
        </div>
        <PricingPlans currentPlan={plan} />
      </div>
    </div>
  );
}
