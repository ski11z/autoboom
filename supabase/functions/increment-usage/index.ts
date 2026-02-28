// ─── Supabase Edge Function: increment-usage ───
// Securely increments a user's daily prompt usage.
// Called from the extension before starting a generation.
// Accepts a `count` parameter = number of prompts being submitted.
// Free users: rejects if at limit (10/day). Premium users: always allows.
//
// Deploy: supabase functions deploy increment-usage

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_DAILY_LIMIT = 10;

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // 1. Verify JWT
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

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

        // 2. Parse request body
        let count = 1;
        try {
            const body = await req.json();
            if (body && typeof body.count === "number" && body.count > 0) {
                count = Math.min(body.count, 100);
            } else if (body && typeof body.count === "string") {
                const parsed = parseInt(body.count, 10);
                if (!isNaN(parsed) && parsed > 0) count = Math.min(parsed, 100);
            }
        } catch {
            // No body or invalid JSON — default count = 1
        }

        // 3. Get profile
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("plan, daily_usage, last_usage_date")
            .eq("id", user.id)
            .single();

        if (!profile) {
            return new Response(JSON.stringify({ error: "Profile not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 4. Calculate current usage
        const today = new Date().toISOString().split("T")[0];
        const currentUsage = profile.last_usage_date === today ? (profile.daily_usage || 0) : 0;

        // 5. Check limit for free users
        if (profile.plan !== "premium" && (currentUsage + count) > FREE_DAILY_LIMIT) {
            const remaining = Math.max(0, FREE_DAILY_LIMIT - currentUsage);
            return new Response(JSON.stringify({
                error: `Daily limit reached. You have ${remaining} prompt(s) remaining today.`,
                currentUsage,
                remaining,
                limit: FREE_DAILY_LIMIT,
                limitReached: true,
            }), {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 6. Increment usage by count
        const newUsage = currentUsage + count;
        await supabaseAdmin
            .from("profiles")
            .update({
                daily_usage: newUsage,
                last_usage_date: today,
            })
            .eq("id", user.id);

        // 7. Return result
        return new Response(JSON.stringify({
            success: true,
            currentUsage: newUsage,
            limit: profile.plan === "premium" ? null : FREE_DAILY_LIMIT,
            limitReached: profile.plan !== "premium" && newUsage >= FREE_DAILY_LIMIT,
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
