/**
 * AutoBoom — Popup Helpers
 * Shared state, messaging, and utility functions used across all popup modules.
 */
const AB_PopupHelpers = (() => {
    // ─── Shared State ───
    let _currentProject = null;
    let _imagePrompts = [];
    let _animPrompts = [];
    let _ciImagePrompts = [];

    // ─── Messaging ───
    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Get the active Flow tab ID from the current browser window.
     * The popup opens from a specific window — we find the Flow tab in that window.
     */
    async function getActiveFlowTabId() {
        try {
            // First try: the active tab in the current window
            const activeTabs = await chrome.tabs.query({
                url: ['*://labs.google/flow/*', '*://labs.google/fx/*'],
                active: true,
                currentWindow: true,
            });
            if (activeTabs && activeTabs.length > 0) return activeTabs[0].id;

            // Second try: any Flow tab in the current window
            const windowTabs = await chrome.tabs.query({
                url: ['*://labs.google/flow/*', '*://labs.google/fx/*'],
                currentWindow: true,
            });
            if (windowTabs && windowTabs.length > 0) return windowTabs[0].id;

            // Third try: any Flow tab, sorted by lastAccessed
            const allTabs = await chrome.tabs.query({
                url: ['*://labs.google/flow/*', '*://labs.google/fx/*'],
            });
            if (allTabs && allTabs.length > 0) {
                allTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
                return allTabs[0].id;
            }
        } catch (e) {
            console.warn('getActiveFlowTabId failed:', e);
        }
        return null;
    }

    // ─── Notifications ───
    function showNotification(text, type = 'info') {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      z-index: 1000;
      animation: slideUp 0.3s ease;
      background: ${type === 'error' ? 'rgba(248,81,73,0.9)' : type === 'success' ? 'rgba(63,185,80,0.9)' : 'rgba(88,166,255,0.9)'};
      color: white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ─── Utility ───
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDuration(ms) {
        if (!ms || ms < 0) return '—';
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        if (mins < 60) return `${mins}m ${remSecs}s`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hrs}h ${remMins}m`;
    }

    return {
        // State accessors
        get currentProject() { return _currentProject; },
        set currentProject(v) { _currentProject = v; },
        get imagePrompts() { return _imagePrompts; },
        set imagePrompts(v) { _imagePrompts = v; },
        get animPrompts() { return _animPrompts; },
        set animPrompts(v) { _animPrompts = v; },
        get ciImagePrompts() { return _ciImagePrompts; },
        set ciImagePrompts(v) { _ciImagePrompts = v; },

        // Functions
        sendMessage,
        getActiveFlowTabId,
        showNotification,
        escapeHtml,
        formatDuration,
    };
})();
