import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planInput = z.object({
  plan: z.enum(["starter", "pro"]),
  returnUrl: z.string().url(),
});

const portalInput = z.object({ returnUrl: z.string().url() });

async function stripeForm(
  path: string,
  secretKey: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json['error'] as { message?: string } | undefined;
    console.error("[stripe]", path, err?.message);
    throw new Error(err?.message ?? "Stripe request failed");
  }
  return json;
}

/**
 * Creates a Stripe Checkout session in subscription mode with a 7-day trial.
 * Returns { configured: false } until Stripe keys are added to the project.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planInput.parse(input))
  .handler(async ({ data, context }) => {
    const secretKey = process.env['STRIPE_SECRET_KEY'];
    const priceId =
      data.plan === "pro" ? process.env['STRIPE_PRICE_PRO'] : process.env['STRIPE_PRICE_STARTER'];

    if (!secretKey || !priceId) {
      return { configured: false as const, url: null };
    }

    const { supabase, userId, claims } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripeForm("customers", secretKey, {
        email: String(claims['email'] ?? ""),
        "metadata[user_id]": userId,
      });
      customerId = String(customer['id']);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("subscriptions")
        .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    const session = await stripeForm("checkout/sessions", secretKey, {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": "7",
      "subscription_data[metadata][user_id]": userId,
      "metadata[user_id]": userId,
      success_url: `${data.returnUrl}?checkout=success`,
      cancel_url: `${data.returnUrl}?checkout=cancelled`,
    });

    return { configured: true as const, url: String(session['url']) };
  });

/** Creates a Stripe Customer Portal session so users can manage or cancel their plan. */
export const createCustomerPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => portalInput.parse(input))
  .handler(async ({ data, context }) => {
    const secretKey = process.env['STRIPE_SECRET_KEY'];
    if (!secretKey) return { configured: false as const, url: null };

    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return { configured: true as const, url: null };
    }

    const session = await stripeForm("billing_portal/sessions", secretKey, {
      customer: sub.stripe_customer_id,
      return_url: data.returnUrl,
    });

    return { configured: true as const, url: String(session['url']) };
  });
