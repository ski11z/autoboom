/**
 * AutoBoom — Popup Premium Module
 * Handles upgrade card, usage display, feature locks, and Stripe checkout.
 */
const AB_PopupPremium = (() => {
    const H = AB_PopupHelpers;
    const MODULE = 'PopupPremium';

    let _initialized = false;

    // ─── Init ───
    async function init() {
        if (_initialized) return;
        _initialized = true;

        // Refresh plan status and update UI
        await refreshPlanUI();

        // Upgrade button
        const upgradeBtn = document.getElementById('btn-upgrade');
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', _handleUpgrade);
        }

        // Manage subscription button (in settings)
        const manageBtn = document.getElementById('btn-manage-subscription');
        if (manageBtn) {
            manageBtn.addEventListener('click', _handleManageSubscription);
        }

        // Lock click handlers — show upgrade nudge
        document.querySelectorAll('[data-premium-feature]').forEach(el => {
            el.addEventListener('click', (e) => {
                _handleLockedFeatureClick(e, el.dataset.premiumFeature);
            });
        });

        // Initialize nudge modal handlers
        _initNudgeModal();

        // ─── Inline Upgrade Auth Handlers ───
        const upgradeEmailBtn = document.getElementById('upgrade-email-btn');
        if (upgradeEmailBtn) {
            upgradeEmailBtn.addEventListener('click', _handleUpgradeEmail);
        }
        const upgradeOtpBtn = document.getElementById('upgrade-otp-btn');
        if (upgradeOtpBtn) {
            upgradeOtpBtn.addEventListener('click', _handleUpgradeOtp);
        }
        const upgradeOtpBack = document.getElementById('upgrade-otp-back');
        if (upgradeOtpBack) {
            upgradeOtpBack.addEventListener('click', () => {
                document.getElementById('upgrade-step-email')?.classList.remove('hidden');
                document.getElementById('upgrade-step-otp')?.classList.add('hidden');
            });
        }
        // Allow Enter key on email input
        const upgradeEmailInput = document.getElementById('upgrade-email-input');
        if (upgradeEmailInput) {
            upgradeEmailInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); _handleUpgradeEmail(); }
            });
        }
        // Allow Enter key on OTP input
        const upgradeOtpInput = document.getElementById('upgrade-otp-input');
        if (upgradeOtpInput) {
            upgradeOtpInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); _handleUpgradeOtp(); }
            });
        }

        // Periodically refresh plan (in case webhook updated it)
        setInterval(refreshPlanUI, 5 * 60 * 1000); // Every 5 min
    }

    /**
     * Refresh the UI based on current plan status.
     */
    async function refreshPlanUI() {
        try {
            const plan = await AB_License.getPlan();
            const isPremium = plan === AB_CONSTANTS.PLAN.PREMIUM;

            // Toggle premium/free UI elements
            _togglePremiumUI(isPremium);

            if (!isPremium) {
                await _updateUsageCounter();
            }

            // Update settings account section
            _updateAccountSection(isPremium);
        } catch (err) {
            // Silently fail — will retry on next refresh
        }
    }

    /**
     * Update the usage counter display for free users.
     */
    async function _updateUsageCounter() {
        const counter = document.getElementById('usage-counter');
        if (!counter) return;

        try {
            const { current, limit } = await AB_License.canGenerate();

            const displayCurrent = current === Infinity ? '∞' : current;
            const displayLimit = limit === Infinity ? '∞' : limit;
            counter.textContent = `${displayCurrent}/${displayLimit} prompts today`;
            counter.classList.remove('hidden');

            // Also update compact banner usage
            const compactUsage = document.getElementById('premium-usage-compact');
            if (compactUsage) compactUsage.textContent = `${displayCurrent}/${displayLimit} prompts today`;

            // Visual warning when near limit
            if (current >= limit) {
                counter.classList.add('usage-limit-reached');
            } else if (current >= limit * 0.8) {
                counter.classList.add('usage-limit-warning');
            } else {
                counter.classList.remove('usage-limit-reached', 'usage-limit-warning');
            }
        } catch {
            counter.classList.add('hidden');
        }
    }

    // ─── UI Toggle ───

    function _togglePremiumUI(isPremium) {
        // Show/hide upgrade card
        const upgradeCard = document.getElementById('premium-upgrade-card');
        if (upgradeCard) {
            upgradeCard.classList.toggle('hidden', isPremium);
        }

        // Show/hide usage counter
        const counter = document.getElementById('usage-counter');
        if (counter) {
            counter.classList.toggle('hidden', isPremium);
        }

        // Show/hide premium badges on locked features
        document.querySelectorAll('.premium-lock').forEach(lock => {
            lock.classList.toggle('hidden', isPremium);
        });

        // Enable/disable gated features
        document.querySelectorAll('[data-premium-feature]').forEach(el => {
            if (isPremium) {
                el.classList.remove('feature-locked');
                el.removeAttribute('data-locked');
            } else {
                el.classList.add('feature-locked');
                el.setAttribute('data-locked', 'true');
            }
        });

        // Show premium badge in header
        const premiumBadge = document.getElementById('premium-badge');
        if (premiumBadge) {
            premiumBadge.classList.toggle('hidden', !isPremium);
        }
    }

    async function _updateAccountSection(isPremium) {
        // Check if user is signed in
        let user = null;
        try {
            user = AB_Auth.getUser();
        } catch { /* not signed in */ }

        const isSignedIn = !!user;

        // Update plan display in settings
        const planDisplay = document.getElementById('account-plan-display');
        if (planDisplay) {
            if (isPremium) {
                planDisplay.innerHTML = '<span class="plan-badge plan-premium">⭐ Premium</span>';
            } else {
                planDisplay.innerHTML = '<span class="plan-badge plan-free">Free</span>';
            }
        }

        // Show/hide manage subscription button
        const manageBtn = document.getElementById('btn-manage-subscription');
        if (manageBtn) {
            manageBtn.classList.toggle('hidden', !isPremium);
        }

        // Update account email
        const emailDisplay = document.getElementById('account-email-display');
        if (emailDisplay) {
            emailDisplay.textContent = isSignedIn ? (user?.email || '') : 'Not signed in';
        }

        // Toggle sign-out / sign-in buttons
        const signOutBtn = document.getElementById('btn-sign-out');
        const signInBtn = document.getElementById('btn-settings-sign-in');
        if (signOutBtn) signOutBtn.classList.toggle('hidden', !isSignedIn);
        if (signInBtn) signInBtn.classList.toggle('hidden', isSignedIn);
    }

    let _pendingUpgradeEmail = '';

    async function _handleUpgrade() {
        // Check if user is authenticated
        const isAuthed = await AB_Auth.isAuthenticated();

        if (!isAuthed) {
            // Show inline auth form instead of going to checkout
            _showUpgradeAuth();
            return;
        }

        // User is authenticated → proceed to Stripe checkout
        await _proceedToCheckout();
    }

    function _showUpgradeAuth() {
        const form = document.getElementById('upgrade-auth-form');
        if (form) {
            form.classList.remove('hidden');
            document.getElementById('upgrade-step-email')?.classList.remove('hidden');
            document.getElementById('upgrade-step-otp')?.classList.add('hidden');
            document.getElementById('upgrade-email-input')?.focus();
        }
    }

    async function _handleUpgradeEmail() {
        const emailInput = document.getElementById('upgrade-email-input');
        const email = emailInput?.value?.trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            H.showNotification('Please enter a valid email address', 'error');
            return;
        }

        const btn = document.getElementById('upgrade-email-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

        const result = await AB_Auth.sendOtp(email);

        if (btn) { btn.disabled = false; btn.textContent = 'Send Code'; }

        if (result.success) {
            _pendingUpgradeEmail = email;
            document.getElementById('upgrade-step-email')?.classList.add('hidden');
            document.getElementById('upgrade-step-otp')?.classList.remove('hidden');
            document.getElementById('upgrade-otp-email-display').textContent = email;
            document.getElementById('upgrade-otp-input')?.focus();
        } else {
            H.showNotification(result.error || 'Failed to send code', 'error');
        }
    }

    async function _handleUpgradeOtp() {
        const otpInput = document.getElementById('upgrade-otp-input');
        const code = otpInput?.value?.trim();

        if (!code || code.length < 6 || !/^\d+$/.test(code)) {
            H.showNotification('Please enter the verification code', 'error');
            return;
        }

        const btn = document.getElementById('upgrade-otp-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

        const result = await AB_Auth.verifyOtp(_pendingUpgradeEmail, code);

        if (btn) { btn.disabled = false; btn.textContent = 'Verify ✓'; }

        if (result.success) {
            // Hide the auth form
            document.getElementById('upgrade-auth-form')?.classList.add('hidden');

            // Invalidate license cache to pick up server-side profile
            AB_License.invalidateCache();

            // Check if user is already premium (returning Pro user)
            const plan = await AB_License.getPlan();
            if (plan === AB_CONSTANTS.PLAN.PREMIUM) {
                H.showNotification('Welcome back! You already have Premium ⚡', 'success');
                await refreshPlanUI();
                return;
            }

            // Not premium yet — proceed to Stripe checkout
            H.showNotification('Signed in! Opening checkout...', 'success');
            await _proceedToCheckout();
        } else {
            H.showNotification(result.error || 'Invalid code', 'error');
            otpInput.value = '';
            otpInput?.focus();
        }
    }

    async function _proceedToCheckout() {
        const btn = document.getElementById('btn-upgrade');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Opening checkout... <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
        }

        try {
            const token = await AB_Auth.getAccessToken();
            if (!token) {
                H.showNotification('Authentication error. Please try again.', 'error');
                return;
            }

            const response = await fetch(`${AB_CONSTANTS.SUPABASE_URL}/functions/v1/create-checkout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ plan: 'monthly' }),
            });

            const data = await response.json();

            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            // Open Stripe Checkout in a new tab
            chrome.tabs.create({ url: data.url });

            H.showNotification('Checkout opened in new tab!', 'success');
        } catch (err) {
            H.showNotification('Upgrade failed: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Upgrade Now <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
            }
        }
    }

    async function _handleManageSubscription() {
        const btn = document.getElementById('btn-manage-subscription');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Opening...';
        }

        try {
            const token = await AB_Auth.getAccessToken();
            if (!token) {
                H.showNotification('Please sign in first', 'error');
                return;
            }

            const response = await fetch(`${AB_CONSTANTS.SUPABASE_URL}/functions/v1/create-portal`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to open portal');
            }

            chrome.tabs.create({ url: data.url });
        } catch (err) {
            H.showNotification('Failed to open subscription manager: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Manage Subscription';
            }
        }
    }

    function _handleLockedFeatureClick(e, featureName) {
        // Only intercept if feature is locked
        const el = e.currentTarget;
        if (!el.hasAttribute('data-locked')) return;

        e.preventDefault();
        e.stopPropagation();

        // Show upgrade nudge modal
        const nudge = document.getElementById('premium-nudge-modal');
        if (nudge) {
            const featureLabel = _getFeatureLabel(featureName);
            document.getElementById('nudge-feature-name').textContent = featureLabel;
            nudge.classList.remove('hidden');
        }
    }

    function _initNudgeModal() {
        const nudge = document.getElementById('premium-nudge-modal');
        if (!nudge) return;

        // Close on backdrop click or "Maybe later" button
        nudge.addEventListener('click', (ev) => {
            if (ev.target === nudge || ev.target.closest('.nudge-close')) {
                nudge.classList.add('hidden');
            }
        });

        // Upgrade button inside nudge
        const nudgeUpgradeBtn = document.getElementById('nudge-upgrade-btn');
        if (nudgeUpgradeBtn) {
            nudgeUpgradeBtn.addEventListener('click', () => {
                nudge.classList.add('hidden');
                _handleUpgrade();
            });
        }
    }

    function _getFeatureLabel(feature) {
        const labels = {
            chain_mode: 'Chain Mode',
            ai_prompt_parser: 'AI Prompt Parser',
            ai_parser: 'AI Prompt Parser',
            batch_queue: 'Batch Queue',
            stealth_mode: 'Stealth Mode',
            notifications: 'Notifications',
            reference_urls: 'Reference URLs',
        };
        return labels[feature] || feature;
    }

    /**
     * Check usage before starting a project.
     * @param {number} [promptCount=1] - Number of prompts in this project
     * @returns {boolean} true if allowed to proceed
     */
    async function checkUsageBeforeStart(promptCount = 1) {
        const result = await AB_License.incrementUsage(promptCount);

        if (!result.success || result.limitReached) {
            const msg = result.error || `Daily limit reached (${AB_CONSTANTS.FREE_TIER_DAILY_LIMIT} prompts). Upgrade to Premium for unlimited access!`;
            H.showNotification(msg, 'error');
            await _updateUsageCounter();
            return false;
        }

        await _updateUsageCounter();
        return true;
    }

    return {
        init,
        refreshPlanUI,
        checkUsageBeforeStart,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_PopupPremium = AB_PopupPremium;
}
