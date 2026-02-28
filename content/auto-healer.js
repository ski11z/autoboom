/**
 * AutoBoom — Selector Auto-Healer
 * When a CSS selector fails, attempts to find the element using heuristic fallbacks:
 *   1. Text content matching
 *   2. ARIA role/label matching
 *   3. Tag + attribute pattern matching
 */

const AB_AutoHealer = (() => {
    const MODULE = 'AutoHealer';

    /**
     * Fallback hints for critical selectors.
     * Each entry describes properties the target element is expected to have.
     */
    const HINTS = {
        PROMPT_TEXTAREA: {
            tag: 'div',
            role: 'textbox',
            altTags: ['div[data-slate-editor="true"]', 'div[contenteditable="true"][role="textbox"]'],
        },
        GENERATE_BUTTON: {
            tag: 'button',
            textContains: 'Create',
            hasIcon: 'arrow_forward',
        },
        ADD_TO_PROMPT_BUTTON: {
            tag: 'button',
            textContains: 'Add to prompt',
        },
        IMAGE_RESULT_IMG: {
            tag: 'img',
            attrPrefix: { alt: 'Generated image' },
        },
        LOADING_INDICATOR: {
            role: 'progressbar',
            altTags: ['[class*="loading"]', '[class*="spinner"]', '[class*="generating"]'],
        },
        ERROR_MESSAGE: {
            role: 'alert',
            altTags: ['[class*="error"]', '[class*="snackbar"]'],
        },
        FILE_INPUT: {
            tag: 'input',
            attrs: { type: 'file' },
        },
        MODEL_DROPDOWN: {
            tag: 'button',
            role: 'combobox',
            textContains: 'Banana',
        },
        ASPECT_RATIO_BUTTON: {
            tag: 'button',
            hasIcon: 'aspect_ratio',
            ariaLabel: 'Aspect ratio',
        },
        VIDEO_DOWNLOAD_BUTTON: {
            tag: 'button',
            ariaLabel: 'download',
            hasIcon: 'download',
        },
        IMAGE_MODEL_SELECTOR: {
            tag: 'button',
            role: 'combobox',
        },
        NEW_PROJECT_BUTTON: {
            tag: 'button',
            textContains: 'New project',
            hasIcon: 'add_2',
        },
        ADD_INGREDIENT_BUTTON: {
            tag: 'button',
            hasIcon: 'add',
            ariaLabel: 'Add',
        },
        IMAGE_RESULT_CONTAINER: {
            tag: 'div',
            hasChildSelector: 'img[alt="Generated image"]',
        },
        START_FRAME_SLOT: {
            altTags: ['[class*="start"][class*="frame"]', '[class*="frame"]:first-child'],
        },
        END_FRAME_SLOT: {
            altTags: ['[class*="end"][class*="frame"]', '[class*="frame"]:last-child'],
        },
    };

    /**
     * Attempt to find an element using heuristic fallbacks.
     * @param {string} selectorKey - The AB_SELECTORS key that failed
     * @returns {Element|null} - Found element or null
     */
    function tryHeal(selectorKey) {
        const hint = HINTS[selectorKey];
        if (!hint) return null;

        let candidate = null;

        // Strategy 1: Direct ID lookup
        if (hint.id) {
            candidate = document.getElementById(hint.id);
            if (candidate) {
                _logHeal(selectorKey, 'id', hint.id);
                return candidate;
            }
        }

        // Strategy 2: ARIA role matching
        if (hint.role) {
            const els = document.querySelectorAll(`[role="${hint.role}"]`);
            if (els.length === 1) {
                _logHeal(selectorKey, 'role', hint.role);
                return els[0];
            }
            // If multiple, try to narrow by text
            if (hint.textContains && els.length > 1) {
                candidate = _findByText(els, hint.textContains);
                if (candidate) {
                    _logHeal(selectorKey, 'role+text', `${hint.role} + "${hint.textContains}"`);
                    return candidate;
                }
            }
        }

        // Strategy 3: ARIA label matching
        if (hint.ariaLabel) {
            const el = document.querySelector(
                `[aria-label*="${hint.ariaLabel}" i]`
            );
            if (el) {
                _logHeal(selectorKey, 'aria-label', hint.ariaLabel);
                return el;
            }
        }

        // Strategy 4: Tag + text content
        if (hint.tag && hint.textContains) {
            const els = document.querySelectorAll(hint.tag);
            candidate = _findByText(els, hint.textContains);
            if (candidate) {
                _logHeal(selectorKey, 'tag+text', `${hint.tag} + "${hint.textContains}"`);
                return candidate;
            }
        }

        // Strategy 5: Tag + icon text (Material Symbols)
        if (hint.tag && hint.hasIcon) {
            const els = document.querySelectorAll(hint.tag);
            for (const el of els) {
                const iconEl = el.querySelector('.google-symbols, .material-symbols-outlined, .material-icons, [class*="icon"]');
                if (iconEl && iconEl.textContent.trim().toLowerCase().includes(hint.hasIcon.toLowerCase())) {
                    _logHeal(selectorKey, 'icon', hint.hasIcon);
                    return el;
                }
                // Also check if the button text itself contains the icon name
                if (el.textContent.includes(hint.hasIcon)) {
                    _logHeal(selectorKey, 'icon-text', hint.hasIcon);
                    return el;
                }
            }
        }

        // Strategy 6: Tag + attribute matching
        if (hint.tag && hint.attrs) {
            let sel = hint.tag;
            for (const [attr, val] of Object.entries(hint.attrs)) {
                sel += `[${attr}="${val}"]`;
            }
            candidate = document.querySelector(sel);
            if (candidate) {
                _logHeal(selectorKey, 'tag+attrs', sel);
                return candidate;
            }
        }

        // Strategy 7: Tag + attribute prefix matching
        if (hint.tag && hint.attrPrefix) {
            const els = document.querySelectorAll(hint.tag);
            for (const el of els) {
                for (const [attr, prefix] of Object.entries(hint.attrPrefix)) {
                    const val = el.getAttribute(attr);
                    if (val && val.startsWith(prefix)) {
                        _logHeal(selectorKey, 'attr-prefix', `${attr}^="${prefix}"`);
                        return el;
                    }
                }
            }
        }

        // Strategy 8: Alternative tag selectors
        if (hint.altTags) {
            for (const altSel of hint.altTags) {
                try {
                    candidate = document.querySelector(altSel);
                    if (candidate) {
                        _logHeal(selectorKey, 'alt-selector', altSel);
                        return candidate;
                    }
                } catch (e) { /* invalid selector */ }
            }
        }

        // Strategy 9: Parent element that has a child matching a known selector
        if (hint.tag && hint.hasChildSelector) {
            const els = document.querySelectorAll(hint.tag);
            for (const el of els) {
                if (el.querySelector(hint.hasChildSelector)) {
                    _logHeal(selectorKey, 'has-child', hint.hasChildSelector);
                    return el;
                }
            }
        }

        return null;
    }

    /**
     * Find the best match by text content from a NodeList.
     */
    function _findByText(elements, text) {
        const lower = text.toLowerCase();
        for (const el of elements) {
            if (el.textContent.toLowerCase().includes(lower)) {
                return el;
            }
        }
        return null;
    }

    function _logHeal(selectorKey, strategy, detail) {
        AB_Logger.warn(MODULE, `🩹 Healed "${selectorKey}" via ${strategy}: ${detail}`);
    }

    return { tryHeal, HINTS };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_AutoHealer = AB_AutoHealer;
}
