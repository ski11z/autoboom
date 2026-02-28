/**
 * AutoBoom — Popup Auth Module
 * Email OTP authentication UI controller.
 * Manages the email input → OTP verification → authenticated state flow.
 */
const AB_PopupAuth = (() => {
    const H = AB_PopupHelpers;

    let _pendingEmail = '';

    // ─── Init ───
    function init() {
        // Email submit
        const emailForm = document.getElementById('auth-email-form');
        if (emailForm) {
            emailForm.addEventListener('submit', (e) => {
                e.preventDefault();
                _handleEmailSubmit();
            });
        }

        // OTP submit
        const otpForm = document.getElementById('auth-otp-form');
        if (otpForm) {
            otpForm.addEventListener('submit', (e) => {
                e.preventDefault();
                _handleOtpSubmit();
            });
        }

        // Back to email from OTP
        const backBtn = document.getElementById('auth-otp-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                _showStep('email');
            });
        }

        // OTP digit inputs — auto-advance on type
        const otpInputs = document.querySelectorAll('.otp-digit');
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });

            // Allow paste of full OTP code (6-8 digits)
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\s/g, '');
                const digits = pasted.replace(/[^0-9]/g, '');
                if (digits.length >= 6 && digits.length <= 8) {
                    otpInputs.forEach((inp, i) => {
                        inp.value = digits[i] || '';
                    });
                    // Focus the last filled input
                    const lastIndex = Math.min(digits.length, otpInputs.length) - 1;
                    otpInputs[lastIndex]?.focus();
                }
            });
        });

        // Auth state listener
        AB_Auth.onAuthStateChange((event, user) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                _onAuthenticated(user);
            } else if (event === 'SIGNED_OUT') {
                _onSignedOut();
            }
        });
    }

    /**
     * Check if user is already authenticated and show appropriate view.
     * @returns {boolean} true if authenticated
     */
    async function checkAuth() {
        try {
            const { session, user } = await AB_Auth.getSession();
            if (session && user) {
                _onAuthenticated(user);
                return true;
            }
        } catch (err) {
            // Not authenticated
        }

        _showAuthScreen();
        return false;
    }

    // ─── Handlers ───

    async function _handleEmailSubmit() {
        const emailInput = document.getElementById('auth-email-input');
        const email = emailInput?.value?.trim();

        if (!email || !_isValidEmail(email)) {
            H.showNotification('Please enter a valid email address', 'error');
            return;
        }

        const btn = document.getElementById('auth-email-btn');
        _setButtonLoading(btn, true, 'Sending code...');

        const result = await AB_Auth.sendOtp(email);

        _setButtonLoading(btn, false, 'Continue');

        if (result.success) {
            _pendingEmail = email;
            _showStep('otp');
            document.getElementById('auth-otp-email-display').textContent = email;
            document.querySelector('.otp-digit')?.focus();
        } else {
            H.showNotification(result.error || 'Failed to send verification code', 'error');
        }
    }

    async function _handleOtpSubmit() {
        const otpInputs = document.querySelectorAll('.otp-digit');
        const code = Array.from(otpInputs).map(i => i.value).join('');

        if (code.length < 6 || code.length > 8 || !/^\d+$/.test(code)) {
            H.showNotification('Please enter the verification code', 'error');
            return;
        }

        const btn = document.getElementById('auth-otp-btn');
        _setButtonLoading(btn, true, 'Verifying...');

        const result = await AB_Auth.verifyOtp(_pendingEmail, code);

        _setButtonLoading(btn, false, 'Verify');

        if (result.success) {
            H.showNotification('Welcome to AutoBoom! 🚀', 'success');
            _onAuthenticated(result.user);
        } else {
            H.showNotification(result.error || 'Invalid code. Please try again.', 'error');
            // Clear OTP inputs
            otpInputs.forEach(i => { i.value = ''; });
            otpInputs[0]?.focus();
        }
    }

    // ─── State Management ───

    function _onAuthenticated(user) {
        // Hide auth screen, show main UI
        const authScreen = document.getElementById('auth-screen');
        const popupContainer = document.querySelector('.popup-container');

        if (authScreen) authScreen.classList.add('hidden');
        if (popupContainer) popupContainer.classList.remove('hidden');

        // Invalidate license cache on fresh auth
        AB_License.invalidateCache();

        // Initialize premium features after auth
        if (typeof AB_PopupPremium !== 'undefined') {
            AB_PopupPremium.init();
        }
    }

    function _onSignedOut() {
        // No login wall — stay on main UI, just reset premium state
        _pendingEmail = '';
        AB_License.invalidateCache();
        if (typeof AB_PopupPremium !== 'undefined') {
            AB_PopupPremium.refreshPlanUI();
        }
    }

    function _showAuthScreen() {
        const authScreen = document.getElementById('auth-screen');
        const popupContainer = document.querySelector('.popup-container');

        if (authScreen) authScreen.classList.remove('hidden');
        if (popupContainer) popupContainer.classList.add('hidden');

        _showStep('email');
    }

    function _showStep(step) {
        const emailStep = document.getElementById('auth-step-email');
        const otpStep = document.getElementById('auth-step-otp');

        if (step === 'email') {
            emailStep?.classList.remove('hidden');
            otpStep?.classList.add('hidden');
        } else {
            emailStep?.classList.add('hidden');
            otpStep?.classList.remove('hidden');
        }
    }

    // ─── Helpers ───

    function _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function _setButtonLoading(btn, loading, text) {
        if (!btn) return;
        btn.disabled = loading;
        btn.textContent = text;
        if (loading) {
            btn.classList.add('loading');
        } else {
            btn.classList.remove('loading');
        }
    }

    return {
        init,
        checkAuth,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_PopupAuth = AB_PopupAuth;
}
