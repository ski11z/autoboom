/**
 * AutoBoom — Auth Module
 * Email OTP authentication via Supabase.
 * Handles sign-in, sign-out, session management, and auth state changes.
 */
const AB_Auth = (() => {
    const MODULE = 'Auth';

    let _currentUser = null;
    let _authListeners = [];

    /**
     * Send a one-time password (OTP) to the user's email.
     * @param {string} email
     * @returns {{ success: boolean, error?: string }}
     */
    async function sendOtp(email) {
        try {
            const client = AB_Supabase.getClient();
            const { error } = await client.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true, // Auto-create new users
                },
            });

            if (error) {
                AB_Logger.error(MODULE, 'OTP send failed:', error.message);
                return { success: false, error: error.message };
            }

            AB_Logger.info(MODULE, `OTP sent to ${email}`);
            return { success: true };
        } catch (err) {
            AB_Logger.error(MODULE, 'OTP send error:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Verify the OTP code entered by the user.
     * @param {string} email
     * @param {string} token - The 6-digit OTP code
     * @returns {{ success: boolean, user?: object, error?: string }}
     */
    async function verifyOtp(email, token) {
        try {
            const client = AB_Supabase.getClient();
            const { data, error } = await client.auth.verifyOtp({
                email,
                token,
                type: 'email',
            });

            if (error) {
                AB_Logger.error(MODULE, 'OTP verify failed:', error.message);
                return { success: false, error: error.message };
            }

            _currentUser = data.user;
            _notifyListeners('SIGNED_IN', _currentUser);

            AB_Logger.info(MODULE, `User authenticated: ${email}`);
            return { success: true, user: _currentUser };
        } catch (err) {
            AB_Logger.error(MODULE, 'OTP verify error:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get the current session (JWT + user).
     * @returns {{ session: object|null, user: object|null }}
     */
    async function getSession() {
        try {
            const client = AB_Supabase.getClient();
            const { data: { session }, error } = await client.auth.getSession();

            if (error) {
                AB_Logger.warn(MODULE, 'Session fetch error:', error.message);
                return { session: null, user: null };
            }

            _currentUser = session?.user || null;
            return { session, user: _currentUser };
        } catch (err) {
            AB_Logger.error(MODULE, 'Session error:', err.message);
            return { session: null, user: null };
        }
    }

    /**
     * Get the current user (cached, call getSession() first for fresh data).
     * @returns {object|null}
     */
    function getUser() {
        return _currentUser;
    }

    /**
     * Get the current user's JWT access token.
     * @returns {string|null}
     */
    async function getAccessToken() {
        const { session } = await getSession();
        return session?.access_token || null;
    }

    /**
     * Sign out the current user.
     * @returns {{ success: boolean, error?: string }}
     */
    async function signOut() {
        try {
            const client = AB_Supabase.getClient();
            const { error } = await client.auth.signOut();

            if (error) {
                AB_Logger.warn(MODULE, 'Sign out error:', error.message);
            }

            _currentUser = null;
            _notifyListeners('SIGNED_OUT', null);

            AB_Logger.info(MODULE, 'User signed out');
            return { success: true };
        } catch (err) {
            AB_Logger.error(MODULE, 'Sign out error:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Check if a user is currently authenticated.
     * @returns {boolean}
     */
    async function isAuthenticated() {
        const { session } = await getSession();
        return !!session;
    }

    /**
     * Listen for auth state changes.
     * @param {function} callback - (event, user) => void
     * @returns {function} Unsubscribe function
     */
    function onAuthStateChange(callback) {
        _authListeners.push(callback);

        // Also set up Supabase's native listener
        try {
            const client = AB_Supabase.getClient();
            const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
                _currentUser = session?.user || null;
                callback(event, _currentUser);
            });

            return () => {
                _authListeners = _authListeners.filter(cb => cb !== callback);
                subscription?.unsubscribe();
            };
        } catch {
            return () => {
                _authListeners = _authListeners.filter(cb => cb !== callback);
            };
        }
    }

    /**
     * Get the user's profile from Supabase (includes plan, usage, etc).
     * @returns {object|null}
     */
    async function getProfile() {
        try {
            const client = AB_Supabase.getClient();
            const { data: { user } } = await client.auth.getUser();
            if (!user) return null;

            const { data, error } = await client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) {
                AB_Logger.warn(MODULE, 'Profile fetch error:', error.message);
                return null;
            }

            return data;
        } catch (err) {
            AB_Logger.error(MODULE, 'Profile error:', err.message);
            return null;
        }
    }

    // ─── Internal ───

    function _notifyListeners(event, user) {
        _authListeners.forEach(cb => {
            try { cb(event, user); } catch (e) { /* ignore listener errors */ }
        });
    }

    return {
        sendOtp,
        verifyOtp,
        getSession,
        getUser,
        getAccessToken,
        signOut,
        isAuthenticated,
        onAuthStateChange,
        getProfile,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Auth = AB_Auth;
}
