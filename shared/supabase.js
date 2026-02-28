/**
 * AutoBoom — Supabase Client
 * Initializes the Supabase JS client for auth + database operations.
 * Uses chrome.storage.local for token persistence (instead of localStorage).
 */
const AB_Supabase = (() => {
    const MODULE = 'Supabase';

    let _client = null;

    // ─── Chrome Storage Adapter ───
    // Supabase expects a localStorage-like interface for session persistence.
    // Chrome extensions can't use localStorage in service workers, so we bridge to chrome.storage.local.
    const _chromeStorageAdapter = {
        _cache: {},

        async getItem(key) {
            if (this._cache[key] !== undefined) return this._cache[key];
            const data = await chrome.storage.local.get(key);
            const val = data[key] || null;
            this._cache[key] = val;
            return val;
        },

        async setItem(key, value) {
            this._cache[key] = value;
            await chrome.storage.local.set({ [key]: value });
        },

        async removeItem(key) {
            delete this._cache[key];
            await chrome.storage.local.remove(key);
        },
    };

    /**
     * Get or create the Supabase client singleton.
     * @returns {object} Supabase client
     */
    function getClient() {
        if (_client) return _client;

        if (typeof supabase === 'undefined' || !supabase.createClient) {
            throw new Error('Supabase JS library not loaded. Ensure lib/supabase.min.js is included.');
        }

        _client = supabase.createClient(
            AB_CONSTANTS.SUPABASE_URL,
            AB_CONSTANTS.SUPABASE_ANON_KEY,
            {
                auth: {
                    storage: _chromeStorageAdapter,
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false, // No URL-based auth in extensions
                },
            }
        );

        if (typeof AB_Logger !== 'undefined') {
            AB_Logger.info(MODULE, 'Supabase client initialized');
        }

        return _client;
    }

    /**
     * Reset the client (useful for sign-out cleanup).
     */
    function resetClient() {
        _client = null;
        _chromeStorageAdapter._cache = {};
    }

    return {
        getClient,
        resetClient,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Supabase = AB_Supabase;
}
