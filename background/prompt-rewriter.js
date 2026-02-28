/**
 * AutoBoom — Prompt Rewriter Module
 * Background-level AI prompt rewriting for policy violation recovery.
 * Reuses the same provider config and encrypted API key storage as popup-ai-parser.js.
 */

const AB_PromptRewriter = (() => {
    const MODULE = 'PromptRewriter';

    const _ENCRYPT_KEY = 'AB_AutoBoom_2024_XOR';

    const _AI_PROVIDERS = {
        deepseek: {
            name: 'DeepSeek',
            endpoint: 'https://api.deepseek.com/chat/completions',
            model: 'deepseek-chat',
            authType: 'bearer',
        },
        openai: {
            name: 'OpenAI',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o-mini',
            authType: 'bearer',
        },
        gemini: {
            name: 'Google Gemini',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            model: 'gemini-2.0-flash',
            authType: 'query',
        },
        claude: {
            name: 'Claude',
            endpoint: 'https://api.anthropic.com/v1/messages',
            model: 'claude-sonnet-4-20250514',
            authType: 'anthropic',
        },
        openrouter: {
            name: 'OpenRouter',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'deepseek/deepseek-chat',
            authType: 'bearer',
        },
    };

    const _REWRITE_SYSTEM_PROMPT = `You are a prompt rewriter. The user's image generation prompt was rejected by the AI image generator for potentially violating content policies.

Your job is to rewrite the prompt to avoid policy violations while keeping the SAME visual intent, scene, and composition.

RULES:
1. Keep the same scene, camera angle, lighting, and overall composition
2. Remove or soften any language that might trigger safety filters (violence, destruction, explicit content, etc.)
3. Replace potentially sensitive descriptions with neutral alternatives
4. Keep all technical photography terms (lens, f-stop, ISO, etc.) unchanged
5. Maintain the same level of detail and quality
6. Return ONLY the rewritten prompt text — no explanations, no markdown, no quotes
7. The rewritten prompt should be roughly the same length as the original
8. Focus on describing the scene in a neutral, architectural or documentary style`;

    // ─── Crypto (same as popup-ai-parser.js) ───
    function _xorDecrypt(text, key) {
        return Array.from(text).map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join('');
    }

    // ─── Load API key from storage ───
    async function _loadApiKey(provider) {
        const storageKey = `ab_apikey_${provider}`;
        const data = await chrome.storage.local.get(storageKey);
        if (!data[storageKey]) return '';
        try {
            return _xorDecrypt(atob(data[storageKey]), _ENCRYPT_KEY);
        } catch { return ''; }
    }

    // ─── Get selected provider from storage ───
    async function _getProvider() {
        const data = await chrome.storage.local.get('ab_selected_provider');
        return data.ab_selected_provider || 'deepseek';
    }

    // ─── Build fetch request (same logic as popup-ai-parser.js) ───
    function _buildFetchRequest(provider, apiKey, promptText) {
        const cfg = _AI_PROVIDERS[provider];

        if (provider === 'gemini') {
            return {
                url: `${cfg.endpoint}?key=${apiKey}`,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: _REWRITE_SYSTEM_PROMPT + '\n\nOriginal prompt that was rejected:\n' + promptText }]
                        }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
                    }),
                },
            };
        }

        if (provider === 'claude') {
            return {
                url: cfg.endpoint,
                options: {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: cfg.model,
                        max_tokens: 4000,
                        system: _REWRITE_SYSTEM_PROMPT,
                        messages: [{ role: 'user', content: 'Rewrite this rejected prompt:\n\n' + promptText }],
                    }),
                },
            };
        }

        // OpenAI-compatible (DeepSeek, OpenAI, OpenRouter)
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'chrome-extension://autoboom';
        }

        return {
            url: cfg.endpoint,
            options: {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: cfg.model,
                    messages: [
                        { role: 'system', content: _REWRITE_SYSTEM_PROMPT },
                        { role: 'user', content: 'Rewrite this rejected prompt:\n\n' + promptText },
                    ],
                    temperature: 0.3,
                    max_tokens: 4000,
                }),
            },
        };
    }

    // ─── Extract content from provider response ───
    function _extractContent(provider, data) {
        if (provider === 'gemini') {
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        }
        if (provider === 'claude') {
            const block = data.content?.find(b => b.type === 'text');
            return block?.text?.trim();
        }
        return data.choices?.[0]?.message?.content?.trim();
    }

    /**
     * Rewrite a prompt that was rejected by the image generator.
     * @param {string} failedPrompt - The original prompt that was rejected
     * @returns {{ success: boolean, newPrompt?: string, provider?: string, error?: string }}
     */
    async function rewritePrompt(failedPrompt) {
        try {
            const provider = await _getProvider();
            const cfg = _AI_PROVIDERS[provider];
            if (!cfg) {
                return { success: false, error: `Unknown AI provider: ${provider}` };
            }

            const apiKey = await _loadApiKey(provider);
            if (!apiKey) {
                return { success: false, error: `No API key configured for ${cfg.name}. Set it in the extension settings.` };
            }

            AB_Logger.info(MODULE, `Rewriting prompt via ${cfg.name}...`);

            const { url, options } = _buildFetchRequest(provider, apiKey, failedPrompt);
            const response = await fetch(url, options);

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`${cfg.name} API error ${response.status}: ${errBody.substring(0, 200)}`);
            }

            const data = await response.json();
            const newPrompt = _extractContent(provider, data);

            if (!newPrompt) {
                throw new Error(`Empty response from ${cfg.name}`);
            }

            // Clean up: remove any markdown formatting or quotes
            let cleaned = newPrompt;
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '');
            }
            cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

            AB_Logger.info(MODULE, `✅ Prompt rewritten via ${cfg.name} (${cleaned.length} chars)`);

            return {
                success: true,
                newPrompt: cleaned,
                provider: cfg.name,
            };
        } catch (err) {
            AB_Logger.error(MODULE, 'Prompt rewrite failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    return { rewritePrompt };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_PromptRewriter = AB_PromptRewriter;
}
