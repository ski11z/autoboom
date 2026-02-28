/**
 * AutoBoom — MutationObserver Helpers
 * Watches the Flow DOM for async state changes like generation completion.
 */

const AB_Observers = (() => {
    const _activeObservers = new Map();

    /**
     * Watch for an element matching a selector to appear in the DOM.
     * Returns a promise that resolves with the element.
     */
    function waitForElement(selector, opts = {}) {
        const timeout = opts.timeout || 30_000;
        const root = opts.root || document.body;

        return new Promise((resolve, reject) => {
            // Check if already present
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Observer timeout waiting for: ${selector}`));
            }, timeout);

            const observer = new MutationObserver((mutations) => {
                const el = document.querySelector(selector);
                if (el) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'aria-label', 'data-testid'],
            });
        });
    }

    /**
     * Watch for an element to disappear from the DOM.
     */
    function waitForElementRemoval(selector, opts = {}) {
        const timeout = opts.timeout || 60_000;

        return new Promise((resolve, reject) => {
            // Check if already gone
            if (!document.querySelector(selector)) {
                resolve();
                return;
            }

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Observer timeout waiting for removal: ${selector}`));
            }, timeout);

            const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
            });
        });
    }

    /**
     * Watch for new images appearing in the result area.
     * Callback is called with each new image element.
     */
    function watchForNewImages(callback, opts = {}) {
        const id = 'imageWatcher';
        _stopObserver(id);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // Check if it's an image or contains images
                    const images = node.tagName === 'IMG' ? [node] : node.querySelectorAll?.('img') || [];
                    for (const img of images) {
                        if (img.src && !img.dataset.abProcessed) {
                            img.dataset.abProcessed = 'true';
                            callback(img);
                        }
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        _activeObservers.set(id, observer);
        return id;
    }

    /**
     * Watch for new video elements appearing in the result area.
     */
    function watchForNewVideos(callback, opts = {}) {
        const id = 'videoWatcher';
        _stopObserver(id);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    const videos = node.tagName === 'VIDEO' ? [node] : node.querySelectorAll?.('video') || [];
                    for (const video of videos) {
                        if (video.src && !video.dataset.abProcessed) {
                            video.dataset.abProcessed = 'true';
                            callback(video);
                        }
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        _activeObservers.set(id, observer);
        return id;
    }

    /**
     * Watch for error messages / alerts appearing.
     */
    function watchForErrors(callback, opts = {}) {
        const id = 'errorWatcher';
        _stopObserver(id);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    const alerts = node.matches?.('[role="alert"]') ? [node] :
                        node.querySelectorAll?.('[role="alert"]') || [];

                    for (const alert of alerts) {
                        callback(alert.textContent.trim(), alert);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        _activeObservers.set(id, observer);
        return id;
    }

    /**
     * Wait for the loading/generating indicator to appear and then disappear.
     * Useful for waiting for a generation cycle to complete.
     */
    async function waitForGenerationCycle(opts = {}) {
        const generationTimeout = opts.timeout || AB_CONSTANTS.DEFAULTS.IMAGE_TIMEOUT_MS;
        const loadingSel = AB_SELECTORS.LOADING_INDICATOR;

        AB_Logger.info('Observers', 'Waiting for generation cycle...', { timeout: generationTimeout });

        // First, wait for loading indicator to appear (generation started)
        try {
            await waitForElement(loadingSel, { timeout: 10_000 });
            AB_Logger.info('Observers', 'Generation started (loading indicator appeared)');
        } catch (e) {
            // If no loading indicator appears, maybe it was instant or already done
            AB_Logger.warn('Observers', 'No loading indicator appeared, checking if result already present');
        }

        // Then wait for loading indicator to disappear (generation complete)
        try {
            await waitForElementRemoval(loadingSel, { timeout: generationTimeout });
            AB_Logger.info('Observers', 'Generation complete (loading indicator disappeared)');
        } catch (e) {
            throw new Error(`Generation timeout after ${generationTimeout}ms`);
        }

        // Small delay to let DOM settle
        await new Promise(r => setTimeout(r, 1000));
    }

    /**
     * Stop a specific observer by ID.
     */
    function _stopObserver(id) {
        const existing = _activeObservers.get(id);
        if (existing) {
            existing.disconnect();
            _activeObservers.delete(id);
        }
    }

    /**
     * Stop all observers.
     */
    function stopAll() {
        for (const [id, observer] of _activeObservers) {
            observer.disconnect();
        }
        _activeObservers.clear();
    }

    return {
        waitForElement, waitForElementRemoval,
        watchForNewImages, watchForNewVideos, watchForErrors,
        waitForGenerationCycle, stopAll,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Observers = AB_Observers;
}
