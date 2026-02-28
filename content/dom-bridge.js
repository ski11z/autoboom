/**
 * AutoBoom — DOM Bridge
 * Selector abstraction layer. All DOM interactions go through this module.
 * Supports retries, timeouts, human-like delays, and selector overrides.
 */

const AB_DomBridge = (() => {
    let _overrides = {};

    /**
     * Initialize with any user-provided selector overrides.
     */
    function init(overrides) {
        _overrides = overrides || {};
        AB_Logger.info('DomBridge', 'Initialized', { overrideCount: Object.keys(_overrides).length });
    }

    /**
     * Resolve a selector key to its CSS selector string.
     * User overrides take priority, then fallback chain, then raw value.
     */
    function _resolve(selectorKey) {
        if (_overrides[selectorKey]) return _overrides[selectorKey];
        const raw = AB_SELECTORS[selectorKey];
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        // Array fallback chain — try each, return first match
        if (Array.isArray(raw)) {
            if (typeof AB_resolveSelector === 'function') {
                return AB_resolveSelector(selectorKey);
            }
            return raw[0]; // fallback to primary
        }
        return null;
    }

    /**
     * Query a single element with retry and timeout.
     */
    async function queryOne(selectorKey, opts = {}) {
        const timeout = opts.timeout || AB_CONSTANTS.DEFAULTS.DOM_QUERY_TIMEOUT_MS;
        const selector = _resolve(selectorKey);
        if (!selector) throw new Error(`Unknown selector key: ${selectorKey}`);

        const el = await _waitForElement(selector, timeout);
        if (el) return el;

        // Auto-heal: try heuristic fallbacks
        if (typeof AB_AutoHealer !== 'undefined') {
            const healed = AB_AutoHealer.tryHeal(selectorKey);
            if (healed) return healed;
        }

        throw new Error(`Element not found: ${selectorKey} (${selector})`);
    }

    /**
     * Query all matching elements.
     */
    async function queryAll(selectorKey, opts = {}) {
        const timeout = opts.timeout || AB_CONSTANTS.DEFAULTS.DOM_QUERY_TIMEOUT_MS;
        const selector = _resolve(selectorKey);
        if (!selector) throw new Error(`Unknown selector key: ${selectorKey}`);

        await _waitForElement(selector, timeout);
        return [...document.querySelectorAll(selector)];
    }

    /**
     * Click an element by selector key.
     */
    async function click(selectorKey, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        await _humanDelay();
        el.click();
        AB_Logger.debug('DomBridge', `Clicked: ${selectorKey}`);
        return el;
    }

    /**
     * Type text into an input/textarea OR a Slate.js contenteditable div.
     * Detects the element type and uses the appropriate strategy:
     * - INPUT/TEXTAREA: React-compatible native value setter
     * - Contenteditable DIV (Slate.js): Select-all + document.execCommand('insertText')
     */
    async function typeText(selectorKey, text, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        await _humanDelay();

        const isContentEditable = el.getAttribute('contenteditable') === 'true' ||
            el.hasAttribute('data-slate-editor');
        const isSlate = el.hasAttribute('data-slate-editor');

        // Focus the element
        el.focus();
        el.click();
        await _sleep(100);

        if (isContentEditable) {
            // ─── Slate.js / Contenteditable ───
            // Typing into Slate editors requires browser-level input (CDP).
            // This is handled by the TYPE_IN_MAIN_WORLD message in the service worker.
            // If we reach here as a fallback, just log a warning.
            AB_Logger.warn('DomBridge', `Slate editor detected for ${selectorKey}. Use TYPE_IN_MAIN_WORLD via background instead.`);
            // Don't throw — let the caller handle the failure gracefully
            return;

            AB_Logger.debug('DomBridge', `Typed into contenteditable: ${selectorKey}`);
        } else {
            // ─── Traditional Input/Textarea Strategy ───

            // Clear existing content
            if (opts.clear !== false) {
                _setReactValue(el, '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await _sleep(100);
            }

            if (opts.instant) {
                _setReactValue(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                let current = '';
                for (const char of text) {
                    current += char;
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                    _setReactValue(el, current);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                    await _sleep(Math.random() * 30 + 10);
                }
            }

            // Final change event
            el.dispatchEvent(new Event('change', { bubbles: true }));

            AB_Logger.debug('DomBridge', `Typed ${text.length} chars into: ${selectorKey}`);
        }

        return el;
    }

    /**
     * Set value on a React-controlled input/textarea.
     * React overrides the value property setter, so we use the native HTMLElement setter.
     * Note: This does NOT work for contenteditable divs — use execCommand instead.
     */
    function _setReactValue(el, value) {
        const tagName = el.tagName;
        let nativeSetter;

        if (tagName === 'TEXTAREA') {
            nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        } else if (tagName === 'INPUT') {
            nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        }

        if (nativeSetter) {
            nativeSetter.call(el, value);
        } else {
            el.value = value;
        }
    }

    /**
     * Wait for an element to appear in the DOM.
     */
    async function waitFor(selectorKey, opts = {}) {
        const timeout = opts.timeout || 10_000;
        const selector = _resolve(selectorKey);
        if (!selector) throw new Error(`Unknown selector key: ${selectorKey}`);

        const el = await _waitForElement(selector, timeout);
        if (!el) throw new Error(`Timeout waiting for: ${selectorKey} (${selector})`);
        return el;
    }

    /**
     * Wait for an element to disappear from the DOM.
     */
    async function waitForGone(selectorKey, opts = {}) {
        const timeout = opts.timeout || 30_000;
        const selector = _resolve(selectorKey);
        if (!selector) throw new Error(`Unknown selector key: ${selectorKey}`);

        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!document.querySelector(selector)) return true;
            await _sleep(500);
        }
        throw new Error(`Timeout waiting for element to disappear: ${selectorKey}`);
    }

    /**
     * Simulate hovering over an element.
     */
    async function hover(selectorKey, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        await _humanDelay();

        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        // Wait a bit for hover effects to appear
        await _sleep(500);
        AB_Logger.debug('DomBridge', `Hovered: ${selectorKey}`);
        return el;
    }

    /**
     * Check if a selector currently matches any element.
     */
    function exists(selectorKey) {
        const selector = _resolve(selectorKey);
        if (!selector) return false;
        return !!document.querySelector(selector);
    }

    /**
     * Check if an element is visible (not display:none, not zero-sized).
     */
    function isVisible(selectorKey) {
        const selector = _resolve(selectorKey);
        if (!selector) return false;
        const el = document.querySelector(selector);
        if (!el) return false;
        return el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    /**
     * Get text content of an element.
     */
    async function getText(selectorKey, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        return el.textContent.trim();
    }

    /**
     * Get attribute value of an element.
     */
    async function getAttribute(selectorKey, attr, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        return el.getAttribute(attr);
    }

    /**
     * Get the src/blob URL of an image element.
     */
    async function getImageSrc(selectorKey, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        return el.src || el.currentSrc || el.getAttribute('src');
    }

    /**
     * Simulate file upload by setting files on a hidden input.
     */
    async function uploadFile(selectorKey, file, opts = {}) {
        const input = await queryOne(selectorKey, opts);
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        AB_Logger.info('DomBridge', `Uploaded file via: ${selectorKey}`, { fileName: file.name });
        return input;
    }

    /**
     * Scroll an element into view.
     */
    async function scrollIntoView(selectorKey, opts = {}) {
        const el = await queryOne(selectorKey, opts);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await _sleep(300);
        return el;
    }

    // ─── Internal Helpers ───

    async function _waitForElement(selector, timeout) {
        // Try splitting comma-separated selectors
        const selectors = selector.split(',').map(s => s.trim());

        const start = Date.now();
        while (Date.now() - start < timeout) {
            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) return el;
                } catch (e) {
                    // Invalid selector, skip
                }
            }
            await _sleep(200);
        }
        return null;
    }

    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function _humanDelay() {
        const min = AB_CONSTANTS.DEFAULTS.ACTION_DELAY_MIN_MS;
        const max = AB_CONSTANTS.DEFAULTS.ACTION_DELAY_MAX_MS;
        const delay = Math.floor(Math.random() * (max - min) + min);
        await _sleep(delay);
    }

    return {
        init, queryOne, queryAll, click, typeText,
        waitFor, waitForGone, hover, exists, isVisible,
        getText, getAttribute, getImageSrc, uploadFile,
        scrollIntoView,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_DomBridge = AB_DomBridge;
}
