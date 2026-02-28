// ─── Supabase Edge Function: ai-proxy ───
// Proxies AI API calls from the extension, keeping the master API key server-side.
// Enforces per-user rate limits (50 calls/day for premium users).
//
// Deploy: supabase functions deploy ai-proxy
// Set secrets:
//   supabase secrets set AI_DEEPSEEK_KEY=sk-...
//   supabase secrets set AI_OPENAI_KEY=sk-...
//   supabase secrets set AI_GEMINI_KEY=AIza...
//   supabase secrets set AI_CLAUDE_KEY=sk-ant-...
//   supabase secrets set AI_OPENROUTER_KEY=sk-or-...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_PROVIDERS: Record<string, {
    endpoint: string;
    model: string;
    authType: string;
    keyEnv: string;
}> = {
    deepseek: {
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-chat",
        authType: "bearer",
        keyEnv: "AI_DEEPSEEK_KEY",
    },
    openai: {
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        authType: "bearer",
        keyEnv: "AI_OPENAI_KEY",
    },
    gemini: {
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        model: "gemini-2.0-flash",
        authType: "query",
        keyEnv: "AI_GEMINI_KEY",
    },
    claude: {
        endpoint: "https://api.anthropic.com/v1/messages",
        model: "claude-sonnet-4-20250514",
        authType: "anthropic",
        keyEnv: "AI_CLAUDE_KEY",
    },
    openrouter: {
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "deepseek/deepseek-chat",
        authType: "bearer",
        keyEnv: "AI_OPENROUTER_KEY",
    },
};

const DAILY_AI_LIMIT = 50;

serve(async (req) => {
    // Handle CORS preflight
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

        // 2. Check plan (must be premium)
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("plan, ai_usage_today, last_usage_date")
            .eq("id", user.id)
            .single();

        if (!profile || profile.plan !== "premium") {
            return new Response(JSON.stringify({ error: "Premium subscription required" }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 3. Check rate limit
        const today = new Date().toISOString().split("T")[0];
        const currentUsage = profile.last_usage_date === today ? (profile.ai_usage_today || 0) : 0;

        if (currentUsage >= DAILY_AI_LIMIT) {
            return new Response(JSON.stringify({
                error: "Daily AI limit reached",
                limit: DAILY_AI_LIMIT,
                current: currentUsage,
            }), {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 4. Parse request body
        const body = await req.json();
        const { provider: providerName, rawText, systemPrompt } = body;

        const provider = AI_PROVIDERS[providerName];
        if (!provider) {
            return new Response(JSON.stringify({ error: `Unknown provider: ${providerName}` }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 5. Get API key from secrets
        const apiKey = Deno.env.get(provider.keyEnv);
        if (!apiKey) {
            return new Response(JSON.stringify({ error: `API key not configured for ${providerName}` }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 6. Build and forward the AI request
        const aiResponse = await forwardToAI(provider, apiKey, rawText, systemPrompt);

        // 7. Increment AI usage (server-side, tamper-proof)
        await supabaseAdmin
            .from("profiles")
            .update({
                ai_usage_today: profile.last_usage_date === today ? (profile.ai_usage_today || 0) + 1 : 1,
                last_usage_date: today,
            })
            .eq("id", user.id);

        // 8. Return AI response
        return new Response(JSON.stringify(aiResponse), {
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

async function forwardToAI(
    provider: typeof AI_PROVIDERS[string],
    apiKey: string,
    rawText: string,
    systemPrompt: string
): Promise<any> {
    let url = provider.endpoint;
    let options: RequestInit;

    if (provider.authType === "query") {
        // Gemini
        url = `${provider.endpoint}?key=${apiKey}`;
        options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: systemPrompt + "\n\nUser document:\n" + rawText }],
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
            }),
        };
    } else if (provider.authType === "anthropic") {
        // Claude
        options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: provider.model,
                max_tokens: 8000,
                system: systemPrompt,
                messages: [{ role: "user", content: rawText }],
            }),
        };
    } else {
        // OpenAI-compatible (DeepSeek, OpenAI, OpenRouter)
        options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: rawText },
                ],
                temperature: 0.1,
                max_tokens: 8000,
            }),
        };
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI provider error ${response.status}: ${errText.substring(0, 200)}`);
    }

    return await response.json();
}
