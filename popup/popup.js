/**
 * AutoBoom — Popup Coordinator
 * Thin entry point that wires all popup modules together.
 * Module loading order (defined in popup.html):
 *   1. supabase.js           — Supabase client init
 *   2. auth.js               — email OTP, session management
 *   3. license.js            — plan checking, feature gating
 *   4. popup-helpers.js      — shared state, messaging, notifications
 *   5. popup-auth.js         — auth UI controller
 *   6. popup-premium.js      — premium upgrade UI, feature locks
 *   7. popup-navigation.js   — domain gate, tab routing, view management
 *   8. popup-settings.js     — theme, stealth, Telegram
 *   9. popup-ai-parser.js    — multi-provider AI prompt parsing
 *  10. popup-f2v-form.js     — Frames-to-Video form & prompts
 *  11. popup-t2v-form.js     — Text-to-Video form
 *  12. popup-ci-form.js      — Create Image form
 *  13. popup-projects.js     — saved projects, batch, history, diagnostics, progress, polling
 *  14. popup.js (this file)  — coordinator / bootstrap
 */
(function () {
    'use strict';

    // ─── Bootstrap: Skip Auth Wall → Go Straight to App ───
    _bootstrap();

    async function _bootstrap() {
        // Init auth UI listeners (still needed for upgrade flow)
        AB_PopupAuth.init();

        // Set version from manifest
        const manifest = chrome.runtime.getManifest();
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.textContent = `v${manifest.version}`;

        // Silently check if user already has a session (returning premium user)
        // This does NOT block the UI — main UI shows immediately.
        try {
            const { session, user } = await AB_Auth.getSession();
            if (session && user) {
                AB_License.invalidateCache();
            }
        } catch {
            // No session — user is anonymous, that's fine
        }

        // Go straight to domain gate (no login wall)
        _startDomainGate();

        // Auth state listener — when user signs in later (via upgrade flow)
        AB_Auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                AB_License.invalidateCache();
                // Refresh premium UI after sign-in
                if (typeof AB_PopupPremium !== 'undefined') {
                    AB_PopupPremium.refreshPlanUI();
                }
            }
        });

        // Sign out button handler
        const signOutBtn = document.getElementById('btn-sign-out');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                try {
                    const result = await AB_Auth.signOut();
                    console.log('[Popup] Sign out result:', result);
                    AB_License.invalidateCache();
                    if (typeof AB_PopupPremium !== 'undefined') {
                        AB_PopupPremium.refreshPlanUI();
                    }
                } catch (err) {
                    console.error('[Popup] Sign out error:', err);
                }
            });
        }

        // Sign In button in settings (for free/anonymous users to register)
        const signInBtn = document.getElementById('btn-settings-sign-in');
        if (signInBtn) {
            signInBtn.addEventListener('click', _openAuthScreen);
        }

        // Header user icon button → auth screen or settings
        const userLoginBtn = document.getElementById('btn-user-login');
        if (userLoginBtn) {
            userLoginBtn.addEventListener('click', async () => {
                try {
                    const isAuthed = await AB_Auth.isAuthenticated();
                    if (isAuthed) {
                        // Signed in → go to settings account section
                        document.getElementById('btn-settings')?.click();
                        return;
                    }
                } catch { /* not signed in */ }
                _openAuthScreen();
            });
        }

        // Auth screen close button
        const authCloseBtn = document.getElementById('auth-close-btn');
        if (authCloseBtn) {
            authCloseBtn.addEventListener('click', () => {
                document.getElementById('auth-screen')?.classList.add('hidden');
            });
        }
    }

    function _openAuthScreen() {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) {
            authScreen.classList.remove('hidden');
            document.getElementById('auth-step-email')?.classList.remove('hidden');
            document.getElementById('auth-step-otp')?.classList.add('hidden');
            document.getElementById('auth-email-input')?.focus();
        }
    }

    function _startDomainGate() {
        // Register what to do on first successful domain check
        AB_PopupNavigation.setInitCallback(_initializeAll);

        // Run domain gate immediately, and on every focus
        AB_PopupNavigation.checkDomainGate();
        window.addEventListener('focus', () => AB_PopupNavigation.checkDomainGate());
    }

    // ─── One-time Initialization ───
    function _initializeAll() {
        // Theme & stealth (can run before connection)
        AB_PopupSettings.initTheme();
        AB_PopupSettings.initStealthToggle();

        // Navigation tabs
        AB_PopupNavigation.initTabs();

        // F2V form
        AB_PopupF2VForm.init();
        AB_PopupF2VForm.initCostEstimator();

        // T2V form
        AB_PopupT2VForm.init();

        // CI form
        AB_PopupCIForm.init();

        // Progress tab (F2V)
        AB_PopupProjects.initProgressTab();

        // Batch tab
        AB_PopupProjects.initBatchTab();

        // Saved projects controls (search + pagination)
        AB_PopupProjects.initSavedProjectsControls();

        // AI parser (F2V + CI)
        AB_PopupAIParser.initAIParser();
        AB_PopupAIParser.initCIAIParser();

        // Diagnostics button
        AB_PopupProjects.initDiagnosticsTab();

        // History tab & Telegram settings
        AB_PopupProjects.initHistoryTab();

        // Notification settings in settings view
        AB_PopupSettings.initTelegramSettings();
        AB_PopupSettings.initDiscordSettings();
        AB_PopupSettings.initWebhookSettings();

        // Version & changelog in settings view
        AB_PopupSettings.initVersionInfo();

        // How-To modals for notification setup
        AB_PopupSettings.initHowToModals();

        // Connection check & credits polling
        AB_PopupProjects.checkConnection();

        // Session recovery
        AB_PopupProjects.checkForRecovery();

        // State polling (background → popup)
        AB_PopupProjects.startStatePolling();

        // Premium / license (check plan, update feature locks, usage counter)
        AB_PopupPremium.init();
    }
})();
