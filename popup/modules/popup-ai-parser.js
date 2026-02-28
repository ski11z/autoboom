/**
 * AutoBoom — Popup AI Parser
 * Multi-provider AI prompt parsing for F2V (image + animation) and CI (image-only).
 */
const AB_PopupAIParser = (() => {
    const H = AB_PopupHelpers;

    const _ENCRYPT_KEY = 'AB_AutoBoom_2024_XOR';

    // ─── AI Key Mode ───
    // 'autoboom' = proxied through Edge Function (default for premium)
    // 'own'      = direct API call with user's own key
    async function _getKeyMode() {
        const data = await chrome.storage.local.get(AB_CONSTANTS.STORAGE_KEYS.AI_KEY_MODE);
        return data[AB_CONSTANTS.STORAGE_KEYS.AI_KEY_MODE] || 'autoboom';
    }

    async function _setKeyMode(mode) {
        await chrome.storage.local.set({ [AB_CONSTANTS.STORAGE_KEYS.AI_KEY_MODE]: mode });
    }

    const _AI_PROVIDERS = {
        deepseek: {
            name: 'DeepSeek',
            endpoint: 'https://api.deepseek.com/chat/completions',
            model: 'deepseek-chat',
            placeholder: 'sk-...',
            authType: 'bearer',
        },
        openai: {
            name: 'OpenAI',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o-mini',
            placeholder: 'sk-...',
            authType: 'bearer',
        },
        gemini: {
            name: 'Google Gemini',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            model: 'gemini-2.0-flash',
            placeholder: 'AIza...',
            authType: 'query',
        },
        claude: {
            name: 'Claude',
            endpoint: 'https://api.anthropic.com/v1/messages',
            model: 'claude-sonnet-4-20250514',
            placeholder: 'sk-ant-...',
            authType: 'anthropic',
        },
        openrouter: {
            name: 'OpenRouter',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'deepseek/deepseek-chat',
            placeholder: 'sk-or-...',
            authType: 'bearer',
        },
    };

    // ─── System Prompts ───
    const _SYSTEM_PROMPT = `You are a strict text separator. The user will paste a document containing IMAGE prompts and VIDEO/ANIMATION prompts. Your ONLY job is to separate them into two arrays.

CRITICAL RULES:
1. Copy each prompt EXACTLY as written — character for character, word for word. Do NOT change, rephrase, improve, shorten, or summarize ANY text.
2. REMOVE section headers/titles. These are lines that mark the START of a new prompt section. Common formats:
   - "IMAGE 1 — ORIGINAL BASELINE"
   - "🖼 SCENE 01"
   - "🖼 PART 1 — IMAGE PROMPTS"
   - "🎬 ANIMATION 01"
   - "🎬 PART 2 — ANIMATION PROMPTS"
   - "VIDEO 1 — DEMOLITION (IMAGE 1 → IMAGE 2)"
   - "Generation Prompt:"
   - Lines starting with emoji like 🖼 or 🎬 followed by SCENE/ANIMATION/PART numbers
   Do NOT include these header lines in the output.
3. KEEP everything else exactly as-is: the actual descriptive prompt text, camera instructions, animation directions, constraints (like "No teleportation", "No shaking"), all of it verbatim.
4. Prompts are separated by these header lines. Each header starts a NEW prompt. All text between two consecutive headers belongs to ONE prompt.
5. For IMAGE sections (marked by 🖼, IMAGE, SCENE, or similar): extract all text AFTER the header line until the next header.
6. For VIDEO/ANIMATION sections (marked by 🎬, ANIMATION, VIDEO, or similar): extract all text AFTER the header line until the next header.
7. Return ONLY valid JSON. No markdown, no code fences, no explanation.
8. JSON format: {"imagePrompts": ["prompt1", "prompt2"], "animationPrompts": ["anim1", "anim2"]}
9. If unsure whether something is a header or content, INCLUDE IT. Never lose text.
10. The number of image prompts and animation prompts should match the number of section headers found for each type.`;

    const _CI_SYSTEM_PROMPT = `You are a strict text separator. The user will paste a document containing IMAGE prompts. Your ONLY job is to extract them into an array.

CRITICAL RULES:
1. Copy each prompt EXACTLY as written — character for character, word for word. Do NOT change, rephrase, improve, shorten, or summarize ANY text.
2. REMOVE section headers/titles. These are lines like:
   - "IMAGE 1 — ORIGINAL BASELINE"
   - "IMAGE 2 — PARTIAL DEMOLITION STATE"
   - "Generation Prompt:"
   Do NOT include these header lines in the output.
3. KEEP everything else exactly as-is: the actual descriptive prompt text, camera instructions, quality tags, constraints, all of it verbatim.
4. Return ONLY valid JSON. No markdown, no code fences, no explanation.
5. JSON format: {"imagePrompts": ["prompt1", "prompt2", ...]}
6. If unsure whether something is a header or content, INCLUDE IT. Never lose text.`;

    // ─── Crypto ───
    function _xorEncrypt(text, key) {
        return Array.from(text).map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        ).join('');
    }

    function _getSelectedProvider() {
        return document.getElementById('ai-provider').value;
    }

    function _storageKeyFor(provider) {
        return `ab_apikey_${provider}`;
    }

    async function _saveApiKey() {
        const provider = _getSelectedProvider();
        const input = document.getElementById('ai-api-key');
        const raw = input.value.trim();
        if (!raw) { H.showNotification('Enter an API key first', 'error'); return; }

        const encrypted = btoa(_xorEncrypt(raw, _ENCRYPT_KEY));
        await chrome.storage.local.set({ [_storageKeyFor(provider)]: encrypted, ab_selected_provider: provider });
        H.showNotification(`${_AI_PROVIDERS[provider].name} key saved!`, 'success');
    }

    async function loadApiKey(provider) {
        const key = _storageKeyFor(provider || _getSelectedProvider());
        const data = await chrome.storage.local.get(key);
        if (!data[key]) return '';
        try {
            return _xorEncrypt(atob(data[key]), _ENCRYPT_KEY);
        } catch { return ''; }
    }

    function _updateProviderUI() {
        const provider = _getSelectedProvider();
        const cfg = _AI_PROVIDERS[provider];
        document.getElementById('api-key-label').textContent = `${cfg.name} API Key`;
        document.getElementById('ai-api-key').placeholder = cfg.placeholder;

        // SECURITY: Never auto-populate the API key field.
        // Users must type/paste their own key.
        document.getElementById('ai-api-key').value = '';
    }

    // ─── Init F2V AI Parser ───
    function initAIParser() {
        document.getElementById('ai-provider').addEventListener('change', _updateProviderUI);
        document.getElementById('btn-save-api-key').addEventListener('click', _saveApiKey);

        // AI key mode toggle
        const modeToggle = document.getElementById('ai-key-mode');
        if (modeToggle) {
            _getKeyMode().then(mode => {
                modeToggle.value = mode;
                _updateKeyModeUI(mode);
            });
            modeToggle.addEventListener('change', async (e) => {
                const mode = e.target.value;

                // "Use own API key" requires premium
                if (mode === 'own') {
                    const premium = await AB_License.isPremium();
                    if (!premium) {
                        e.target.value = 'autoboom';
                        H.showNotification('Own API key is a Premium feature. Upgrade to unlock!', 'error');
                        return;
                    }
                }

                _setKeyMode(mode);
                _updateKeyModeUI(mode);

                // Clear the API key field when switching modes (security)
                document.getElementById('ai-api-key').value = '';
            });
        }

        chrome.storage.local.get('ab_selected_provider').then(data => {
            if (data.ab_selected_provider && _AI_PROVIDERS[data.ab_selected_provider]) {
                document.getElementById('ai-provider').value = data.ab_selected_provider;
            }
            _updateProviderUI();
        });

        document.getElementById('btn-paste-all').addEventListener('click', () => {
            const area = document.getElementById('paste-area');
            const isHidden = area.classList.contains('hidden');
            if (isHidden) {
                area.classList.remove('hidden');
                document.getElementById('paste-all-textarea').value = '';
                _setParseStatus('', '');
                document.getElementById('paste-all-textarea').focus();
            } else {
                area.classList.add('hidden');
            }
        });

        document.getElementById('btn-cancel-paste').addEventListener('click', () => {
            document.getElementById('paste-area').classList.add('hidden');
            document.getElementById('paste-all-textarea').value = '';
            _setParseStatus('', '');
        });

        document.getElementById('btn-parse-ai').addEventListener('click', _parseWithAI);
    }

    function _updateKeyModeUI(mode) {
        const ownKeySection = document.getElementById('ai-own-key-section');
        const proxyInfo = document.getElementById('ai-proxy-info');

        if (ownKeySection) {
            ownKeySection.classList.toggle('hidden', mode === 'autoboom');
        }
        if (proxyInfo) {
            proxyInfo.classList.toggle('hidden', mode !== 'autoboom');
        }
    }

    function _setParseStatus(text, type) {
        const el = document.getElementById('parse-status');
        if (!text) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden', 'loading', 'success', 'error');
        el.classList.add(type);
        el.textContent = text;
    }

    // ─── Init CI AI Parser ───
    function initCIAIParser() {
        document.getElementById('btn-ci-paste-all')?.addEventListener('click', () => {
            const area = document.getElementById('ci-paste-area');
            const isHidden = area.classList.contains('hidden');
            if (isHidden) {
                area.classList.remove('hidden');
                document.getElementById('ci-paste-textarea').value = '';
                _setCIParseStatus('', '');
                document.getElementById('ci-paste-textarea').focus();
            } else {
                area.classList.add('hidden');
            }
        });

        document.getElementById('btn-ci-cancel-paste')?.addEventListener('click', () => {
            document.getElementById('ci-paste-area').classList.add('hidden');
            document.getElementById('ci-paste-textarea').value = '';
            _setCIParseStatus('', '');
        });

        document.getElementById('btn-ci-parse-ai')?.addEventListener('click', _parseWithAIForCI);
    }

    function _setCIParseStatus(text, type) {
        const el = document.getElementById('ci-parse-status');
        if (!el) return;
        if (!text) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden', 'loading', 'success', 'error');
        el.classList.add(type);
        el.textContent = text;
    }

    // ─── Build Fetch Requests ───
    function _buildFetchRequest(provider, apiKey, rawText, systemPrompt) {
        const cfg = _AI_PROVIDERS[provider];

        if (provider === 'gemini') {
            return {
                url: `${cfg.endpoint}?key=${apiKey}`,
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: systemPrompt + '\n\nUser document:\n' + rawText }]
                        }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
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
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model: cfg.model,
                        max_tokens: 8000,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: rawText }],
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
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: rawText },
                    ],
                    temperature: 0.1,
                    max_tokens: 8000,
                }),
            },
        };
    }

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

    // ─── Proxy Parse (AutoBoom key) ───
    async function _parseViaProxy(rawText, systemPrompt) {
        const provider = _getSelectedProvider();
        const token = await AB_Auth.getAccessToken();
        if (!token) throw new Error('Not authenticated. Please sign in first.');

        const response = await fetch(`${AB_CONSTANTS.SUPABASE_URL}/functions/v1/ai-proxy`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ provider, rawText, systemPrompt }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            if (response.status === 429) {
                throw new Error(`Daily AI limit reached (${err.limit || 50} calls). Switch to your own API key in Settings.`);
            }
            if (response.status === 403) {
                throw new Error('Premium subscription required for AutoBoom AI. Upgrade or use your own API key.');
            }
            throw new Error(err.error || `Proxy error ${response.status}`);
        }

        const data = await response.json();
        return { data, provider };
    }

    // ─── F2V Parse ───
    async function _parseWithAI() {
        const rawText = document.getElementById('paste-all-textarea').value.trim();
        if (!rawText) { H.showNotification('Paste your prompt document first', 'error'); return; }

        const provider = _getSelectedProvider();
        const cfg = _AI_PROVIDERS[provider];
        const keyMode = await _getKeyMode();

        // Own key mode: require API key
        let apiKey = null;
        if (keyMode === 'own') {
            apiKey = document.getElementById('ai-api-key').value.trim();
            if (!apiKey) apiKey = await loadApiKey(provider);
            if (!apiKey) { H.showNotification(`Enter your ${cfg.name} API key first`, 'error'); return; }
        }

        const parseBtn = document.getElementById('btn-parse-ai');
        parseBtn.disabled = true;
        parseBtn.textContent = '⏳ Parsing...';
        _setParseStatus(`Sending to ${keyMode === 'autoboom' ? 'AutoBoom AI' : cfg.name}...`, 'loading');

        try {
            let data, content;

            if (keyMode === 'autoboom') {
                // Proxy path — server holds the key
                const result = await _parseViaProxy(rawText, _SYSTEM_PROMPT);
                data = result.data;
                content = _extractContent(result.provider, data);
            } else {
                // Direct path — user's own key
                const { url, options } = _buildFetchRequest(provider, apiKey, rawText, _SYSTEM_PROMPT);
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`${cfg.name} API error ${response.status}: ${errBody.substring(0, 200)}`);
                }
                data = await response.json();
                content = _extractContent(provider, data);
            }
            if (!content) throw new Error(`Empty response from ${cfg.name}`);

            let cleaned = content;
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleaned);
            const imgPrompts = parsed.imagePrompts || [];
            const animPrompts = parsed.animationPrompts || [];

            if (imgPrompts.length === 0) throw new Error('No image prompts found in parsed result');

            // Auto-fill the prompt lists via F2V form module
            H.imagePrompts = [];
            H.animPrompts = [];

            const imgList = document.getElementById('image-prompts-list');
            imgList.innerHTML = '';
            imgPrompts.forEach(prompt => {
                AB_PopupF2VForm.addPromptItem('image');
                const textareas = imgList.querySelectorAll('textarea');
                const lastTA = textareas[textareas.length - 1];
                if (lastTA) {
                    lastTA.value = prompt;
                    H.imagePrompts[H.imagePrompts.length - 1] = prompt;
                }
            });

            const animList = document.getElementById('anim-prompts-list');
            animList.innerHTML = '';
            animPrompts.forEach(prompt => {
                AB_PopupF2VForm.addPromptItem('anim');
                const textareas = animList.querySelectorAll('textarea');
                const lastTA = textareas[textareas.length - 1];
                if (lastTA) {
                    lastTA.value = prompt;
                    H.animPrompts[H.animPrompts.length - 1] = prompt;
                }
            });

            AB_PopupF2VForm.updatePromptCounts();
            _setParseStatus(`✅ Found ${imgPrompts.length} image prompts + ${animPrompts.length} animation prompts`, 'success');
            H.showNotification(`Parsed! ${imgPrompts.length} images, ${animPrompts.length} animations`, 'success');

            setTimeout(() => document.getElementById('paste-area').classList.add('hidden'), 1500);

        } catch (err) {
            _setParseStatus(`❌ Error: ${err.message}`, 'error');
            H.showNotification('Parse failed: ' + err.message, 'error');
        } finally {
            parseBtn.disabled = false;
            parseBtn.textContent = '🤖 Parse with AI';
        }
    }

    // ─── CI Parse ───
    async function _parseWithAIForCI() {
        const rawText = document.getElementById('ci-paste-textarea').value.trim();
        if (!rawText) { H.showNotification('Paste your prompt document first', 'error'); return; }

        const provider = _getSelectedProvider();
        const cfg = _AI_PROVIDERS[provider];

        let apiKey = null;
        const keyMode = await _getKeyMode();
        if (keyMode === 'own') {
            apiKey = document.getElementById('ai-api-key')?.value?.trim();
            if (!apiKey) apiKey = await loadApiKey(provider);
            if (!apiKey) { H.showNotification(`Configure your ${cfg.name} API key in Settings ⚙️`, 'error'); return; }
        }

        const parseBtn = document.getElementById('btn-ci-parse-ai');
        parseBtn.disabled = true;
        parseBtn.textContent = '⏳ Parsing...';
        _setCIParseStatus(`Sending to ${cfg.name}...`, 'loading');

        try {
            let data, content;

            if (keyMode === 'autoboom') {
                const result = await _parseViaProxy(rawText, _CI_SYSTEM_PROMPT);
                data = result.data;
                content = _extractContent(result.provider, data);
            } else {
                const { url, options } = _buildFetchRequest(provider, apiKey, rawText, _CI_SYSTEM_PROMPT);
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errBody = await response.text();
                    throw new Error(`${cfg.name} API error ${response.status}: ${errBody.substring(0, 200)}`);
                }
                data = await response.json();
                content = _extractContent(provider, data);
            }
            if (!content) throw new Error(`Empty response from ${cfg.name}`);

            let cleaned = content;
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleaned);
            const imgPrompts = parsed.imagePrompts || [];

            if (imgPrompts.length === 0) throw new Error('No image prompts found in parsed result');

            const list = document.getElementById('ci-image-prompts-list');
            H.ciImagePrompts = [];
            list.innerHTML = '';

            imgPrompts.forEach(prompt => {
                AB_PopupCIForm.addCIPromptItem();
                const textareas = list.querySelectorAll('textarea');
                const lastTA = textareas[textareas.length - 1];
                if (lastTA) {
                    lastTA.value = prompt;
                    H.ciImagePrompts[H.ciImagePrompts.length - 1] = prompt;
                }
            });

            _setCIParseStatus(`✅ Found ${imgPrompts.length} image prompts`, 'success');
            H.showNotification(`Parsed! ${imgPrompts.length} image prompts`, 'success');

            setTimeout(() => document.getElementById('ci-paste-area').classList.add('hidden'), 1500);

        } catch (err) {
            _setCIParseStatus(`❌ Error: ${err.message}`, 'error');
            H.showNotification('Parse failed: ' + err.message, 'error');
        } finally {
            parseBtn.disabled = false;
            parseBtn.textContent = '🤖 Parse with AI';
        }
    }

    return {
        initAIParser,
        initCIAIParser,
        loadApiKey,
        getSelectedProvider: _getSelectedProvider,
    };
})();
