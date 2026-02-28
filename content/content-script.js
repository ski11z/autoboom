/**
 * AutoBoom — Content Script Entry Point
 * Injected into Google Flow pages. Listens for commands from the background
 * service worker and delegates to action modules.
 */

(() => {
    const MODULE = 'ContentScript';
    let _port = null;
    let _initialized = false;

    /**
     * Search the DOM for text containing "AI credits" (e.g., "23190 AI credits").
     * Looks for the credit-token icon first, then falls back to text search.
     */
    function _findCreditsText() {
        // Strategy 1: Find the credit-token icon's parent link
        const tokenImg = document.querySelector('img[src*="credit-token"]');
        if (tokenImg) {
            const parentLink = tokenImg.closest('a');
            if (parentLink) {
                const text = parentLink.textContent.trim();
                if (text.includes('AI credits')) return text;
            }
        }
        // Strategy 2: Search all visible links/spans for "AI credits" text
        const candidates = document.querySelectorAll('a, span, div, p');
        for (const el of candidates) {
            const t = el.textContent.trim();
            if (/\d+\s*AI\s*credits/i.test(t) && el.children.length <= 2) {
                return t;
            }
        }
        return null;
    }

    function init() {
        if (_initialized) return;
        _initialized = true;

        AB_Logger.info(MODULE, 'Content script loaded', { url: window.location.href });

        // Initialize DOM Bridge with any saved selector overrides
        _loadSelectorOverrides().then(overrides => {
            AB_DomBridge.init(overrides);
        });

        // Set up message listener for one-shot messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            _handleMessage(message, sender).then(response => {
                sendResponse(response);
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true; // Keep channel open for async response
        });

        // Establish long-lived connection to keep service worker alive
        _connectPort();

        // Notify background that content script is ready
        chrome.runtime.sendMessage({
            type: AB_EVENTS.CONTENT_READY,
            payload: {
                url: window.location.href,
                pageStatus: AB_Navigation.getPageStatus(),
            },
        }).catch(() => {
            AB_Logger.warn(MODULE, 'Could not send CONTENT_READY — service worker may not be active');
        });

        AB_Logger.info(MODULE, 'Initialization complete');
    }

    /**
     * Establish a long-lived port connection to the service worker.
     * This keeps the SW alive during automation.
     */
    function _connectPort() {
        try {
            _port = chrome.runtime.connect({ name: 'autoboom-content' });

            _port.onMessage.addListener((message) => {
                _handleMessage(message, null).then(response => {
                    if (_port) {
                        _port.postMessage({ type: 'ACTION_RESPONSE', payload: response, requestId: message.requestId });
                    }
                });
            });

            _port.onDisconnect.addListener(() => {
                AB_Logger.info(MODULE, 'Port disconnected from service worker');
                _port = null;
                // Reconnect after a short delay
                setTimeout(() => {
                    if (!_port) _connectPort();
                }, 2000);
            });

            AB_Logger.info(MODULE, 'Port connection established');
        } catch (err) {
            AB_Logger.info(MODULE, 'Failed to connect port', err.message);
        }
    }

    /**
     * Handle incoming messages from background service worker.
     */
    async function _handleMessage(message, sender) {
        const { type, payload } = message;

        switch (type) {
            // ─── Diagnostics ───
            case AB_EVENTS.RUN_DIAGNOSTICS:
                return AB_Diagnostics.getSummary();

            // ─── Page Status ───
            case AB_EVENTS.GET_PAGE_STATUS:
                return AB_Navigation.getPageStatus();

            // ─── Execute Action ───
            case AB_EVENTS.EXECUTE_ACTION:
                return await _executeAction(payload);

            default:
                AB_Logger.warn(MODULE, `Unknown message type: ${type}`);
                return { success: false, error: `Unknown message type: ${type}` };
        }
    }

    /**
     * Execute a specific DOM action.
     */
    async function _executeAction(payload) {
        const { action, params } = payload;

        try {
            switch (action) {
                // ─── Image Generation ───
                case AB_ACTIONS.ENTER_IMAGE_PROMPT:
                    return await AB_ImageGen.enterPrompt(params.prompt);

                case AB_ACTIONS.SET_ASPECT_RATIO:
                    return await AB_ImageGen.setAspectRatio(params.ratio);

                case AB_ACTIONS.CONFIGURE_SETTINGS:
                    return await AB_ImageGen.configureSettings(params);

                case AB_ACTIONS.COUNT_IMAGES:
                    return { success: true, count: AB_ImageGen.getGeneratedImageCount() };

                case AB_ACTIONS.ATTACH_REFERENCE_ADD_TO_PROMPT:
                    return await AB_ImageGen.attachReferenceAddToPrompt(params.imageIndex);

                case AB_ACTIONS.ATTACH_REFERENCE_UPLOAD:
                    return await AB_ImageGen.attachReferenceUpload(params.imageIndex);

                case AB_ACTIONS.ATTACH_REFERENCE_URL:
                    return await AB_ImageGen.attachReferenceFromUrl(params.url);

                case AB_ACTIONS.CLICK_GENERATE:
                    return await AB_ImageGen.clickGenerate();

                case AB_ACTIONS.CLICK_RETRY_ICON:
                    return await AB_ImageGen.clickRetryIcon();

                case AB_ACTIONS.CLICK_REUSE_PROMPT_BUTTON:
                    return await AB_ImageGen.clickReusePromptButton();

                case AB_ACTIONS.WAIT_IMAGE_COMPLETE:
                    return await AB_ImageGen.waitForResult(params);

                // ─── Video Generation ───
                case AB_ACTIONS.SELECT_FRAMES_TO_VIDEO:
                    return await AB_VideoGen.selectF2VMode();

                case AB_ACTIONS.SELECT_TEXT_TO_VIDEO:
                    return { success: await AB_Navigation.selectTextToVideo() };

                case AB_ACTIONS.ATTACH_START_FRAME:
                    return await AB_VideoGen.attachStartFrame(params.imageIndex);

                case AB_ACTIONS.ATTACH_END_FRAME:
                    return await AB_VideoGen.attachEndFrame(params.imageIndex);

                case AB_ACTIONS.ENTER_VIDEO_PROMPT:
                    return await AB_VideoGen.enterAnimationPrompt(params.prompt);

                case AB_ACTIONS.CLICK_GENERATE_VIDEO:
                    return await AB_VideoGen.clickGenerate();

                case AB_ACTIONS.CLICK_REUSE_PROMPT:
                    return await AB_VideoGen.clickReusePrompt();

                case AB_ACTIONS.WAIT_VIDEO_COMPLETE:
                    return await AB_VideoGen.waitForResult(params);

                case AB_ACTIONS.DOWNLOAD_VIDEO:
                    return await AB_VideoGen.getVideoDownloadUrl(params.index);

                case AB_ACTIONS.COUNT_COMPLETED_VIDEOS:
                    return { success: true, count: await AB_VideoGen.countCompletedVideos() };

                case AB_ACTIONS.COUNT_PENDING_VIDEOS:
                    return { success: true, ...(await AB_VideoGen.countPendingVideos()) };

                case AB_ACTIONS.GET_VIDEO_URLS:
                    return await AB_VideoGen.getVideoDownloadUrls();

                // ─── Navigation ───
                case AB_ACTIONS.CHECK_FLOW_PAGE:
                    return AB_Navigation.getPageStatus();

                case AB_ACTIONS.CREATE_NEW_PROJECT:
                    return { success: await AB_Navigation.createNewProject() };

                case AB_ACTIONS.SWITCH_TO_IMAGES_TAB:
                    return { success: await AB_Navigation.switchToImagesTab() };

                case AB_ACTIONS.SWITCH_TO_VIDEOS_TAB:
                    return { success: await AB_Navigation.switchToVideosTab() };

                // ─── Diagnostics ───
                case AB_ACTIONS.RUN_SELECTOR_CHECK:
                    return AB_Diagnostics.getSummary();

                // ─── Credits ───
                case AB_ACTIONS.GET_CREDITS: {
                    try {
                        // Helper sleep
                        const _cSleep = ms => new Promise(r => setTimeout(r, ms));

                        // 1. Try to find credits text already visible (menu might be open)
                        let creditsText = _findCreditsText();

                        if (!creditsText) {
                            // 2. Click the profile avatar button to open account menu
                            const avatarBtn = document.querySelector(
                                'button:has(img[alt="User profile image"]), ' +
                                'button:has(img[src*="googleusercontent"])'
                            );
                            if (!avatarBtn) {
                                AB_Logger.warn('Credits', 'Avatar button not found');
                                return { success: false, credits: null, error: 'Avatar button not found' };
                            }

                            avatarBtn.click();
                            await _cSleep(800);

                            // 3. Scrape credits text from the opened menu
                            creditsText = _findCreditsText();

                            // 4. Close the menu
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                            await _cSleep(300);
                        }

                        if (creditsText) {
                            // Extract just the number from "23190 AI credits"
                            const match = creditsText.match(/([\d,]+)/);
                            const num = match ? match[1].replace(/,/g, '') : creditsText;
                            return { success: true, credits: num };
                        }
                        return { success: false, credits: null, error: 'Credits text not found' };
                    } catch (e) {
                        return { success: false, credits: null, error: e.message };
                    }
                }

                // ─── Stealth Overlay ───
                case AB_ACTIONS.SHOW_STEALTH_OVERLAY:
                    AB_StealthOverlay.show();
                    return { success: true };

                case AB_ACTIONS.HIDE_STEALTH_OVERLAY:
                    AB_StealthOverlay.hide();
                    return { success: true };

                case AB_ACTIONS.UPDATE_STEALTH_PROGRESS:
                    AB_StealthOverlay.updateProgress(params);
                    return { success: true };

                default:
                    AB_Logger.warn(MODULE, `Unknown action: ${action}`);
                    return { success: false, error: `Unknown action: ${action}` };
            }
        } catch (err) {
            AB_Logger.error(MODULE, `Action "${action}" failed`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Load selector overrides from storage.
     */
    async function _loadSelectorOverrides() {
        try {
            const result = await chrome.storage.local.get(AB_CONSTANTS.STORAGE_KEYS.SELECTOR_OVERRIDES);
            return result[AB_CONSTANTS.STORAGE_KEYS.SELECTOR_OVERRIDES] || {};
        } catch (e) {
            return {};
        }
    }

    // ─── Initialize ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
