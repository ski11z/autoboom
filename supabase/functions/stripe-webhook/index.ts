// ─── Supabase Edge Function: stripe-webhook ───
// Handles Stripe webhook events to update subscription status.
// Uses service_role key — bypasses RLS for all DB writes.
//
// Deploy: supabase functions deploy stripe-webhook
// Set secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

serve(async (req) => {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
        apiVersion: "2023-10-16",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
        return new Response("Missing signature", { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
        event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? ""
        );
    } catch (err) {
        return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
    }

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.metadata?.supabase_user_id;
            if (!userId) break;

            // Update plan to premium
            await supabaseAdmin
                .from("profiles")
                .update({ plan: "premium" })
                .eq("id", userId);

            // Create subscription record
            const subscriptionId = session.subscription as string;
            if (subscriptionId) {
                const sub = await stripe.subscriptions.retrieve(subscriptionId);
                await supabaseAdmin.from("subscriptions").upsert({
                    user_id: userId,
                    stripe_subscription_id: subscriptionId,
                    status: "active",
                    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                }, { onConflict: "user_id" });
            }
            break;
        }

        case "customer.subscription.updated": {
            const sub = event.data.object as Stripe.Subscription;
            const customerId = sub.customer as string;

            // Find user by stripe_customer_id
            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", customerId)
                .single();

            if (profile) {
                const status = sub.status === "active" ? "active"
                    : sub.status === "past_due" ? "past_due"
                        : "canceled";

                await supabaseAdmin.from("subscriptions").upsert({
                    user_id: profile.id,
                    stripe_subscription_id: sub.id,
                    status,
                    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                }, { onConflict: "user_id" });

                // Update plan based on status
                await supabaseAdmin
                    .from("profiles")
                    .update({ plan: status === "active" ? "premium" : "free" })
                    .eq("id", profile.id);
            }
            break;
        }

        case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            const customerId = sub.customer as string;

            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", customerId)
                .single();

            if (profile) {
                // Revert to free
                await supabaseAdmin
                    .from("profiles")
                    .update({ plan: "free" })
                    .eq("id", profile.id);

                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "canceled" })
                    .eq("user_id", profile.id);
            }
            break;
        }

        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            const customerId = invoice.customer as string;

            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", customerId)
                .single();

            if (profile) {
                await supabaseAdmin
                    .from("subscriptions")
                    .update({ status: "past_due" })
                    .eq("user_id", profile.id);
            }
            break;
        }
    }

    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
});
