// ─── Supabase Edge Function: create-checkout ───
// Creates a Stripe Checkout session for upgrading to premium.
// Returns the checkout URL for the extension to open in a new tab.
//
// Deploy: supabase functions deploy create-checkout
// Set secret: supabase secrets set STRIPE_SECRET_KEY=sk_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TODO: Replace with your actual Stripe price IDs
const PRICE_IDS: Record<string, string> = {
    monthly: "price_1T5ER9Rvldt8S2ePB4mc92Xq",
    yearly: "price_1T5ER9Rvldt8S2eP0orZei9d",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Verify user
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const supabaseUser = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const body = await req.json();
        const plan = body.plan || "monthly";
        const priceId = PRICE_IDS[plan];
        if (!priceId) {
            return new Response(JSON.stringify({ error: "Invalid plan" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check if user already has a Stripe customer ID
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("stripe_customer_id, email")
            .eq("id", user.id)
            .single();

        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
            apiVersion: "2023-10-16",
        });

        // Create or reuse Stripe customer
        let customerId = profile?.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: profile?.email || user.email,
                metadata: { supabase_user_id: user.id },
            });
            customerId = customer.id;

            // Store Stripe customer ID in profile
            await supabaseAdmin
                .from("profiles")
                .update({ stripe_customer_id: customerId })
                .eq("id", user.id);
        }

        // Create Checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "subscription",
            success_url: "https://labs.google/fx/tools/flow?payment=success",
            cancel_url: "https://labs.google/fx/tools/flow?payment=canceled",
            metadata: { supabase_user_id: user.id },
        });

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
