import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCheckoutSession } from "@/lib/billing.functions";
import { PLANS, type PlanDef } from "@/lib/subscription";
import { cn } from "@/lib/utils";

export function useStartCheckout() {
  const checkout = useServerFn(createCheckoutSession);
  const [pending, setPending] = useState<string | null>(null);

  async function start(plan: "starter" | "pro") {
    setPending(plan);
    try {
      const result = await checkout({
        data: { plan, returnUrl: `${window.location.origin}/billing` },
      });
      if (!result.configured || !result.url) {
        toast.info("Payments aren't connected yet", {
          description: "Add your Stripe keys to start live billing. Everything else is ready.",
        });
        return;
      }
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout");
    } finally {
      setPending(null);
    }
  }

  return { start, pending };
}

export function PlanCard({
  plan,
  currentPlan,
  onSelect,
  pending,
}: {
  plan: PlanDef;
  currentPlan?: string | null | undefined;
  onSelect: (plan: "starter" | "pro") => void;
  pending?: string | null | undefined;
}) {
  const isCurrent = currentPlan === plan.id;
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-6",
        plan.featured ? "border-primary shadow-lift" : "surface-panel",
      )}
    >
      {plan.featured && (
        <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-gradient-brand px-2.5 py-1 text-[11px] font-semibold text-white">
          <Sparkles className="size-3" /> Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-3 text-4xl font-semibold tracking-tight">{plan.price}</p>
      <p className="text-sm text-muted-foreground">{plan.cadence}</p>
      <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
      <ul className="mt-5 space-y-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-primary" /> {feature}
          </li>
        ))}
      </ul>
      <Button
        className="mt-6 w-full"
        variant={plan.featured ? "default" : "outline"}
        disabled={isCurrent || pending === plan.id}
        onClick={() => onSelect(plan.id)}
      >
        {isCurrent ? "Current plan" : `Start 7-day free trial`}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Card required. Cancel any time during the trial.
      </p>
    </div>
  );
}

export function PricingPlans({ currentPlan }: { currentPlan?: string | null }) {
  const { start, pending } = useStartCheckout();
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} onSelect={start} pending={pending} />
      ))}
    </div>
  );
}

export function UpgradeDialog({
  open,
  onOpenChange,
  title = "Upgrade to Pro",
  description = "You've reached the 3 active project limit on your current plan. Upgrade to Pro for unlimited projects.",
  currentPlan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  currentPlan?: string | null | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <PricingPlans currentPlan={currentPlan} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
