/**
 * AutoBoom — Popup Settings
 * Theme toggle, stealth mode toggle, Telegram notification settings.
 */
const AB_PopupSettings = (() => {
    const H = AB_PopupHelpers;

    // ─── Theme Toggle ───
    function initTheme() {
        chrome.storage.local.get('ab_theme').then(data => {
            if (data.ab_theme === 'dark') {
                document.body.classList.add('theme-dark');
                _updateThemeIcon(false);
            } else {
                _updateThemeIcon(true);
            }
        });

        document.getElementById('btn-theme-toggle').addEventListener('click', () => {
            const isDark = document.body.classList.toggle('theme-dark');
            _updateThemeIcon(!isDark);
            chrome.storage.local.set({ ab_theme: isDark ? 'dark' : 'light' });
        });
    }

    function _updateThemeIcon(isLight) {
        const btn = document.getElementById('btn-theme-toggle');
        if (isLight) {
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            btn.title = 'Switch to Dark Theme';
        } else {
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
            btn.title = 'Switch to Light Theme';
        }
    }

    // ─── Stealth Mode Toggle ───
    function initStealthToggle() {
        const btn = document.getElementById('stealth-mode-btn');
        const checkbox = document.getElementById('stealth-mode-toggle');
        if (!btn || !checkbox) return;

        chrome.storage.local.get({ stealthMode: false }, (data) => {
            checkbox.checked = data.stealthMode;
            btn.classList.toggle('stealth-active', data.stealthMode);
            btn.title = data.stealthMode ? 'Stealth Mode: ON' : 'Stealth Mode: OFF';
        });

        btn.addEventListener('click', async (e) => {
            e.preventDefault();

            // Stealth mode requires premium
            const premium = await AB_License.isPremium();
            if (!premium && !checkbox.checked) {
                // Trying to enable — block it
                H.showNotification('Stealth Mode is a Premium feature. Upgrade to unlock!', 'error');
                return;
            }

            checkbox.checked = !checkbox.checked;
            const isOn = checkbox.checked;
            btn.classList.toggle('stealth-active', isOn);
            btn.title = isOn ? 'Stealth Mode: ON' : 'Stealth Mode: OFF';
            chrome.storage.local.set({ stealthMode: isOn });
        });
    }

    // ─── Telegram Settings ───
    async function initTelegramSettings() {
        try {
            const resp = await chrome.runtime.sendMessage({ type: 'GET_TELEGRAM_SETTINGS' });
            const s = resp?.settings || {};
            document.getElementById('tg-bot-token').value = s.botToken || '';
            document.getElementById('tg-chat-id').value = s.chatId || '';
            document.getElementById('tg-enabled').checked = s.enabled || false;
        } catch (e) { /* ignore */ }

        document.getElementById('btn-save-telegram').addEventListener('click', async () => {
            const settings = {
                botToken: document.getElementById('tg-bot-token').value.trim(),
                chatId: document.getElementById('tg-chat-id').value.trim(),
                enabled: document.getElementById('tg-enabled').checked,
            };
            await chrome.runtime.sendMessage({ type: 'SAVE_TELEGRAM_SETTINGS', payload: settings });
            _tgStatus('✅ Settings saved!', 'var(--success)');
        });

        document.getElementById('btn-test-telegram').addEventListener('click', async () => {
            const botToken = document.getElementById('tg-bot-token').value.trim();
            const chatId = document.getElementById('tg-chat-id').value.trim();
            if (!botToken || !chatId) {
                _tgStatus('⚠️ Enter bot token and chat ID first.', 'var(--warning)');
                return;
            }
            _tgStatus('⏳ Sending test message...', 'var(--text-muted)');
            try {
                const resp = await chrome.runtime.sendMessage({
                    type: 'TEST_TELEGRAM',
                    payload: { botToken, chatId },
                });
                if (resp?.success) {
                    _tgStatus('✅ Test message sent! Check Telegram.', 'var(--success)');
                } else {
                    _tgStatus(`❌ ${resp?.error || 'Failed'}`, 'var(--danger)');
                }
            } catch (e) {
                _tgStatus(`❌ ${e.message}`, 'var(--danger)');
            }
        });
    }

    function _tgStatus(text, color) {
        const el = document.getElementById('tg-status');
        el.textContent = text;
        el.style.color = color || 'var(--text-muted)';
    }

    // ─── Discord Settings ───
    async function initDiscordSettings() {
        try {
            const resp = await chrome.runtime.sendMessage({ type: 'GET_DISCORD_SETTINGS' });
            const s = resp?.settings || {};
            document.getElementById('dc-webhook-url').value = s.webhookUrl || '';
            document.getElementById('dc-enabled').checked = s.enabled || false;
        } catch (e) { /* ignore */ }

        document.getElementById('btn-save-discord').addEventListener('click', async () => {
            const settings = {
                webhookUrl: document.getElementById('dc-webhook-url').value.trim(),
                enabled: document.getElementById('dc-enabled').checked,
            };
            await chrome.runtime.sendMessage({ type: 'SAVE_DISCORD_SETTINGS', payload: settings });
            _dcStatus('✅ Settings saved!', 'var(--success)');
        });

        document.getElementById('btn-test-discord').addEventListener('click', async () => {
            const webhookUrl = document.getElementById('dc-webhook-url').value.trim();
            if (!webhookUrl) {
                _dcStatus('⚠️ Enter a Discord webhook URL first.', 'var(--warning)');
                return;
            }
            _dcStatus('⏳ Sending test embed...', 'var(--text-muted)');
            try {
                const resp = await chrome.runtime.sendMessage({
                    type: 'TEST_DISCORD',
                    payload: { webhookUrl },
                });
                if (resp?.success) {
                    _dcStatus('✅ Test embed sent! Check Discord.', 'var(--success)');
                } else {
                    _dcStatus(`❌ ${resp?.error || 'Failed'}`, 'var(--danger)');
                }
            } catch (e) {
                _dcStatus(`❌ ${e.message}`, 'var(--danger)');
            }
        });
    }

    function _dcStatus(text, color) {
        const el = document.getElementById('dc-status');
        el.textContent = text;
        el.style.color = color || 'var(--text-muted)';
    }

    // ─── Generic Webhook Settings ───
    async function initWebhookSettings() {
        try {
            const resp = await chrome.runtime.sendMessage({ type: 'GET_WEBHOOK_SETTINGS' });
            const s = resp?.settings || {};
            document.getElementById('wh-url').value = s.url || '';
            document.getElementById('wh-headers').value = s.headers || '';
            document.getElementById('wh-enabled').checked = s.enabled || false;
        } catch (e) { /* ignore */ }

        document.getElementById('btn-save-webhook').addEventListener('click', async () => {
            const settings = {
                url: document.getElementById('wh-url').value.trim(),
                headers: document.getElementById('wh-headers').value.trim(),
                enabled: document.getElementById('wh-enabled').checked,
            };
            await chrome.runtime.sendMessage({ type: 'SAVE_WEBHOOK_SETTINGS', payload: settings });
            _whStatus('✅ Settings saved!', 'var(--success)');
        });

        document.getElementById('btn-test-webhook').addEventListener('click', async () => {
            const url = document.getElementById('wh-url').value.trim();
            if (!url) {
                _whStatus('⚠️ Enter a webhook URL first.', 'var(--warning)');
                return;
            }
            const headers = document.getElementById('wh-headers').value.trim();
            _whStatus('⏳ Sending test payload...', 'var(--text-muted)');
            try {
                const resp = await chrome.runtime.sendMessage({
                    type: 'TEST_WEBHOOK',
                    payload: { url, headers },
                });
                if (resp?.success) {
                    _whStatus('✅ Test payload sent!', 'var(--success)');
                } else {
                    _whStatus(`❌ ${resp?.error || 'Failed'}`, 'var(--danger)');
                }
            } catch (e) {
                _whStatus(`❌ ${e.message}`, 'var(--danger)');
            }
        });
    }

    function _whStatus(text, color) {
        const el = document.getElementById('wh-status');
        el.textContent = text;
        el.style.color = color || 'var(--text-muted)';
    }

    // ─── Version & Changelog ───
    function initVersionInfo() {
        const versionEl = document.getElementById('version-info');
        const listEl = document.getElementById('changelog-list');
        if (!versionEl || !listEl) return;

        const version = chrome.runtime.getManifest().version;
        versionEl.textContent = `Version ${version}`;

        if (typeof AB_CHANGELOG === 'undefined' || !AB_CHANGELOG.length) return;
        listEl.innerHTML = AB_CHANGELOG.map(entry => `
            <div class="changelog-entry">
                <div class="changelog-header">
                    <span class="changelog-version">v${entry.version}</span>
                    <span class="changelog-date">${entry.date}</span>
                </div>
                <ul>${entry.changes.map(c => `<li>${c}</li>`).join('')}</ul>
            </div>
        `).join('');
    }

    // ─── How-To Modals ───
    function initHowToModals() {
        const modal = document.getElementById('howto-modal');
        const title = document.getElementById('howto-title');
        const body = document.getElementById('howto-body');
        const closeBtn = document.getElementById('howto-close');
        if (!modal || !title || !body) return;

        const guides = {
            telegram: {
                title: '📲 Set Up Telegram Notifications',
                html: `<ol>
                    <li>Open Telegram and search for <strong>@BotFather</strong></li>
                    <li>Send <code>/newbot</code> and follow the prompts to create your bot</li>
                    <li>Copy the <strong>Bot Token</strong> (looks like <code>123456:ABC-DEF...</code>) and paste it above</li>
                    <li>Start a chat with your new bot (send it any message)</li>
                    <li>To get your <strong>Chat ID</strong>: visit <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> in your browser</li>
                    <li>Find <code>"chat":{"id": 123456789}</code> in the response — that number is your Chat ID</li>
                    <li>Paste the Chat ID above, enable notifications, and hit <strong>Save</strong></li>
                    <li>Click <strong>Test</strong> to verify — you should get a message in Telegram!</li>
                </ol>`
            },
            discord: {
                title: '🎮 Set Up Discord Notifications',
                html: `<ol>
                    <li>Open <strong>Discord</strong> and go to your server</li>
                    <li>Right-click the channel you want notifications in → <strong>Edit Channel</strong></li>
                    <li>Go to <strong>Integrations</strong> → <strong>Webhooks</strong></li>
                    <li>Click <strong>New Webhook</strong> — give it a name like "AutoBoom"</li>
                    <li>Click <strong>Copy Webhook URL</strong></li>
                    <li>Paste the URL above, enable notifications, and hit <strong>Save</strong></li>
                    <li>Click <strong>Test</strong> to verify — you should see an embed in Discord!</li>
                </ol>`
            },
            webhook: {
                title: '🔗 Set Up HTTP Webhook',
                html: `<ol>
                    <li>You need a URL that accepts <strong>POST</strong> requests with JSON body</li>
                    <li>Services like <strong>Zapier</strong>, <strong>n8n</strong>, <strong>Make</strong>, or your own API work great</li>
                    <li>Paste your webhook URL above</li>
                    <li>If your endpoint requires authentication, add headers like:<br><code>Authorization: Bearer your-token</code></li>
                    <li>AutoBoom sends a JSON payload with: <code>event</code>, <code>project</code>, <code>status</code>, <code>timestamp</code></li>
                    <li>Enable notifications and hit <strong>Save</strong></li>
                    <li>Click <strong>Test</strong> to send a sample payload to your URL</li>
                </ol>`
            }
        };

        // Open modal
        document.querySelectorAll('.howto-btn, .howto-btn-label').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.howto;
                const guide = guides[key];
                if (!guide) return;
                title.textContent = guide.title;
                body.innerHTML = guide.html;
                modal.classList.remove('hidden');
            });
        });

        // Close modal
        closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    }

    return {
        initTheme,
        initStealthToggle,
        initTelegramSettings,
        initDiscordSettings,
        initWebhookSettings,
        initVersionInfo,
        initHowToModals,
    };
})();

