/**
 * AutoBoom — License Module
 * Checks user plan, enforces feature gating, and tracks usage.
 * All usage writes go through Supabase Edge Functions (server-side).
 */
const AB_License = (() => {
    const MODULE = 'License';

    // ─── Cache ───
    let _profileCache = null;
    let _cacheTimestamp = 0;
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // ─── Anonymous Helper ───
    // Returns local usage data for users who haven't signed in.
    async function _getLocalUsage() {
        const key = AB_CONSTANTS.STORAGE_KEYS.LOCAL_USAGE;
        const data = await chrome.storage.local.get(key);
        const today = new Date().toISOString().split('T')[0];
        const stored = data[key];
        if (stored && stored.date === today) {
            return { date: today, count: stored.count || 0 };
        }
        return { date: today, count: 0 };
    }

    async function _setLocalUsage(usage) {
        const key = AB_CONSTANTS.STORAGE_KEYS.LOCAL_USAGE;
        await chrome.storage.local.set({ [key]: usage });
    }

    async function _isAnonymous() {
        try {
            const { session } = await AB_Auth.getSession();
            return !session;
        } catch {
            return true;
        }
    }

    /**
     * Get fresh profile data (plan, usage, etc).
     * Uses cache if fresh, otherwise fetches from Supabase.
     * @param {boolean} [forceRefresh=false]
     * @returns {object|null}
     */
    async function getProfile(forceRefresh = false) {
        // Anonymous users → return local profile
        if (await _isAnonymous()) {
            const localUsage = await _getLocalUsage();
            return {
                plan: AB_CONSTANTS.PLAN.FREE,
                daily_usage: localUsage.count,
                last_usage_date: localUsage.date,
                ai_usage_today: 0,
            };
        }

        const now = Date.now();

        if (!forceRefresh && _profileCache && (now - _cacheTimestamp) < CACHE_TTL_MS) {
            return _profileCache;
        }

        try {
            const profile = await AB_Auth.getProfile();
            if (profile) {
                _profileCache = profile;
                _cacheTimestamp = now;
            }
            return profile;
        } catch (err) {
            AB_Logger.error(MODULE, 'Profile fetch failed:', err.message);
            return _profileCache; // Return stale cache on error
        }
    }

    /**
     * Check if the current user has an active premium subscription.
     * @returns {boolean}
     */
    async function isPremium() {
        const profile = await getProfile();
        return profile?.plan === AB_CONSTANTS.PLAN.PREMIUM;
    }

    /**
     * Get the current user's plan.
     * @returns {'free'|'premium'}
     */
    async function getPlan() {
        const profile = await getProfile();
        return profile?.plan || AB_CONSTANTS.PLAN.FREE;
    }

    /**
     * Get today's prompt usage count.
     * @returns {number}
     */
    async function getUsageToday() {
        const profile = await getProfile(true); // Always fresh for usage
        if (!profile) return 0;

        // If last_usage_date is not today, usage resets to 0
        const today = new Date().toISOString().split('T')[0];
        if (profile.last_usage_date !== today) return 0;

        return profile.daily_usage || 0;
    }

    /**
     * Get today's AI parser usage count.
     * @returns {number}
     */
    async function getAIUsageToday() {
        const profile = await getProfile(true);
        if (!profile) return 0;

        const today = new Date().toISOString().split('T')[0];
        if (profile.last_usage_date !== today) return 0;

        return profile.ai_usage_today || 0;
    }

    /**
     * Increment daily prompt usage via Edge Function (tamper-proof).
     * @param {number} [count=1] - Number of prompts to count (e.g., 10 image prompts = 10)
     * @returns {{ success: boolean, currentUsage: number, limitReached: boolean, error?: string }}
     */
    async function incrementUsage(count = 1) {
        // Anonymous users → track locally
        if (await _isAnonymous()) {
            const local = await _getLocalUsage();
            const newCount = local.count + count;
            const limit = AB_CONSTANTS.FREE_TIER_DAILY_LIMIT;
            if (newCount > limit) {
                return { success: false, currentUsage: local.count, limitReached: true, error: `Daily limit reached. You have ${Math.max(0, limit - local.count)} prompt(s) remaining today.` };
            }
            await _setLocalUsage({ date: local.date, count: newCount });
            return { success: true, currentUsage: newCount, limitReached: false };
        }

        try {
            const client = AB_Supabase.getClient();
            const { data, error } = await client.functions.invoke('increment-usage', {
                body: { type: 'prompt', count },
            });

            if (error) {
                // Supabase functions.invoke() wraps non-2xx as FunctionsHttpError.
                // Try to extract the actual JSON body from the error context.
                let serverError = error.message || 'Usage increment failed';
                let serverData = null;
                try {
                    // The error.context is a Response object — try to read its body
                    if (error.context && typeof error.context.json === 'function') {
                        serverData = await error.context.json();
                        if (serverData?.error) serverError = serverData.error;
                    }
                } catch { /* couldn't parse response body */ }

                AB_Logger.error(MODULE, 'Usage increment error:', serverError);
                return {
                    success: false,
                    currentUsage: serverData?.currentUsage || 0,
                    limitReached: true,
                    remaining: serverData?.remaining ?? 0,
                    error: serverError,
                };
            }

            if (data?.limitReached) {
                return { success: false, currentUsage: data.currentUsage || 0, limitReached: true, error: data.error || 'Daily limit reached' };
            }

            // Invalidate cache after usage change
            _cacheTimestamp = 0;

            return {
                success: true,
                currentUsage: data?.currentUsage || 0,
                limitReached: false,
            };
        } catch (err) {
            AB_Logger.error(MODULE, 'Usage increment error:', err.message);
            return { success: false, currentUsage: 0, limitReached: true, error: err.message };
        }
    }

    /**
     * Check if a specific feature is available on the current plan.
     * @param {string} featureName - One of AB_CONSTANTS.PREMIUM_FEATURES
     * @returns {boolean}
     */
    async function canUseFeature(featureName) {
        const premium = await isPremium();
        if (premium) return true;

        // Free users: check if this feature is premium-only
        return !AB_CONSTANTS.PREMIUM_FEATURES.includes(featureName);
    }

    /**
     * Check if the free user can still generate (under daily limit).
     * Premium users always return true.
     * @returns {{ allowed: boolean, current: number, limit: number }}
     */
    async function canGenerate() {
        const premium = await isPremium();
        if (premium) return { allowed: true, current: 0, limit: Infinity };

        const usage = await getUsageToday();
        const limit = AB_CONSTANTS.FREE_TIER_DAILY_LIMIT;

        return {
            allowed: usage < limit,
            current: usage,
            limit,
        };
    }

    /**
     * Check if the user can use the AI proxy (under AI daily limit).
     * Only applies when using the AutoBoom shared key.
     * @returns {{ allowed: boolean, current: number, limit: number }}
     */
    async function canUseAIProxy() {
        const premium = await isPremium();
        if (!premium) return { allowed: false, current: 0, limit: 0 };

        const usage = await getAIUsageToday();
        const limit = AB_CONSTANTS.AI_PROXY_DAILY_LIMIT;

        return {
            allowed: usage < limit,
            current: usage,
            limit,
        };
    }

    /**
     * Invalidate the profile cache (e.g., after sign-in or plan change).
     */
    function invalidateCache() {
        _profileCache = null;
        _cacheTimestamp = 0;
    }

    return {
        getProfile,
        isPremium,
        getPlan,
        getUsageToday,
        getAIUsageToday,
        incrementUsage,
        canUseFeature,
        canGenerate,
        canUseAIProxy,
        invalidateCache,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_License = AB_License;
}
