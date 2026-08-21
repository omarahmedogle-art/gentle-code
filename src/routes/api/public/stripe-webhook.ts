import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  trial_end?: number | null;
  items?: { data?: Array<{ price?: { id?: string; nickname?: string | null } }> };
  metadata?: Record<string, string>;
};

function planFromPrice(priceId?: string) {
  if (priceId && priceId === process.env['STRIPE_PRICE_PRO']) return "pro";
  if (priceId && priceId === process.env['STRIPE_PRICE_STARTER']) return "starter";
  return "starter";
}

function verifySignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v ?? ""];
    }),
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject replays older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function upsertFromSubscription(sub: StripeSubscription) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let userId = sub.metadata?.['user_id'] ?? null;
  if (!userId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", sub.customer)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    console.error("[stripe-webhook] no user for customer", sub.customer);
    return;
  }

  const priceId = sub.items?.data?.[0]?.price?.id;
  const isTrial = sub.status === "trialing";

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      plan_type: isTrial ? "free_trial" : planFromPrice(priceId),
      status: ["trialing", "active", "past_due", "canceled", "unpaid"].includes(sub.status)
        ? sub.status
        : "canceled",
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
}

async function setStatusByCustomer(customer: string, status: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("subscriptions").update({ status }).eq("stripe_customer_id", customer);
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['STRIPE_WEBHOOK_SECRET'];
        if (!secret) return new Response("Stripe not configured", { status: 503 });

        const body = await request.text();
        if (!verifySignature(body, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } };
        const object = event.data.object;

        try {
          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await upsertFromSubscription(object as unknown as StripeSubscription);
              break;
            case "customer.subscription.deleted":
              await upsertFromSubscription({
                ...(object as unknown as StripeSubscription),
                status: "canceled",
              });
              break;
            case "invoice.payment_succeeded":
              await setStatusByCustomer(String(object['customer']), "active");
              break;
            case "invoice.payment_failed":
              await setStatusByCustomer(String(object['customer']), "past_due");
              break;
            default:
              break;
          }
        } catch (error) {
          console.error("[stripe-webhook] handler failed", event.type, error);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
