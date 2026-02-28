/**
 * AutoBoom — CSS Selectors for Google Flow UI
 * Single source of truth for all DOM selectors.
 * 
 * ✅ Updated from live Flow DOM on 2026-02-26
 *    using tools/discover-selectors.js + screenshot reference
 *
 * Selectors can be a string or an array of strings (fallback chain).
 * Use AB_SELECTORS.resolve(key) to get the first matching selector.
 */

const AB_SELECTORS = {
    // ─── Prompt Input ───
    // Flow now uses a Slate.js rich-text editor (contenteditable div)
    PROMPT_TEXTAREA: ['div[data-slate-editor="true"]', 'div[role="textbox"][contenteditable="true"]'],
    PROMPT_INPUT_CONTAINER: ['.sc-c70e41ad-5', '.sc-f60f777e-0', '[class*="prompt" i]'],

    // ─── Generate / Create Button ───
    // Bottom bar button: text is "arrow_forwardCreate" (icon text + "Create")
    // NOT "add_2Create" which is the New Project button
    GENERATE_BUTTON: ['button.sc-d3791a4f-0'],

    // ─── Combined Settings Dropdown ───
    // Single button showing: "🍌 Nano Bananacrop_9_16x4" with data-state="closed"
    // Clicking it opens a Radix dropdown with aspect ratio, output count, model
    COMBINED_SETTINGS_BUTTON: ['button[class*="sc-16c4830a"]', 'button[class*="sc-e7a64add"]'],

    // No inline toggle buttons — all settings are inside the combined dropdown
    CONTENT_TYPE_IMAGE: null,
    CONTENT_TYPE_VIDEO: null,
    ASPECT_RATIO_LANDSCAPE: null,
    ASPECT_RATIO_PORTRAIT: null,
    OUTPUT_COUNT_BUTTONS: null,
    MODEL_DROPDOWN: null,

    // ─── Old selectors kept for reference / backward compat ───
    ASPECT_RATIO_OPTION_9_16: '[data-value="9:16"], [aria-label*="9:16"]',
    ASPECT_RATIO_OPTION_16_9: '[data-value="16:9"], [aria-label*="16:9"]',

    // ─── Generated Image Results ───
    IMAGE_RESULT_CONTAINER: ['div.sc-c6af9aa3-5', 'div:has(> img[alt="Generated image"])'],
    IMAGE_RESULT_IMG: 'img[alt="Generated image"]',
    IMAGE_RESULT_ITEM: ['div.sc-c6af9aa3-7', 'div:has(> img[alt="Generated image"])'],

    // ─── Reference / Add to Prompt ───
    ADD_TO_PROMPT_BUTTON: ['button.sc-c6af9aa3-1', 'button[aria-label*="Add to prompt" i]'],
    IMAGE_HOVER_OVERLAY: ['div.sc-c6af9aa3-5', 'div:has(> img[alt="Generated image"])'],

    // ─── Content Type Tabs (removed — now inline toggles) ───
    IMAGES_TAB: null,
    VIDEOS_TAB: null,

    // ─── Frames to Video Mode ───
    F2V_TAB: 'button[role="radio"]',
    F2V_MODE_SELECTOR: '[role="radiogroup"]',

    // ─── Frame Upload Slots / Swap ───
    START_FRAME_SLOT: '[class*="start" i][class*="frame" i], [class*="frame" i]:first-child [class*="upload" i]',
    END_FRAME_SLOT: '[class*="end" i][class*="frame" i], [class*="frame" i]:last-child [class*="upload" i]',
    FRAME_UPLOAD_BUTTON: '[class*="frame" i] button, [class*="frame" i] [class*="add" i]',
    FRAME_PLUS_ICON: '[class*="frame" i] [class*="plus" i], [class*="frame" i] [class*="add" i]',
    SWAP_FRAMES_BUTTON: ['button.sc-8f31d1ba-2'],

    // ─── Add Media Button (was "Add Ingredient") ───
    // The "+" button below the prompt
    ADD_MEDIA_BUTTON: ['button.sc-261bf959-1'],
    ADD_INGREDIENT_BUTTON: ['button.sc-261bf959-1', 'button[aria-label*="Add" i][aria-label*="ingredient" i]'],

    // The "Upload" tile in the media popout
    INGREDIENT_UPLOAD_TILE: null,

    // The "Crop and Save" button in the crop dialog
    CROP_AND_SAVE_BUTTON: null,

    // ─── File Upload (hidden input) ───
    FILE_INPUT: 'input[type="file"]',

    // ─── Status Indicators ───
    LOADING_INDICATOR: '[class*="loading" i], [class*="spinner" i], [class*="generating" i], [role="progressbar"]',
    ERROR_MESSAGE: '[role="alert"][class*="error" i], [class*="error" i][class*="message" i], [class*="snackbar" i][class*="error" i]',
    GENERATION_PROGRESS: '[class*="progress" i][class*="generation" i], [class*="progress" i][class*="bar" i]',

    // ─── Video Results ───
    VIDEO_RESULT_CONTAINER: '[class*="video" i][class*="result" i], [class*="output" i][class*="video" i]',
    VIDEO_RESULT_ELEMENT: 'video[src], [class*="video" i][class*="result" i] video',
    VIDEO_DOWNLOAD_BUTTON: 'button[aria-label*="download" i], [class*="download" i] button',

    // Dashboard: "New project" button
    NEW_PROJECT_BUTTON: ['button.sc-a38764c7-0', 'button[aria-label*="New project" i]'],
    PROJECT_TITLE: '[class*="project" i][class*="title" i], [class*="project" i][class*="name" i]',

    // ─── Go Back Button ───
    GO_BACK_BUTTON: ['button.sc-663e4cde-2'],

    // ─── Settings (OLD — no longer exists as standalone) ───
    SETTINGS_BUTTON: null,
    COMBINED_SETTINGS_BUTTON: null,

    // ─── Credits / Usage ───
    CREDITS_DISPLAY: '[class*="credit" i], [class*="quota" i], [class*="usage" i]',

    // ─── Add Media / Scenebuilder ───
    SCENEBUILDER_BUTTON: ['button.sc-c514a881-2'],

    // ─── Tool Selection Tabs ───
    TEXT_TO_IMAGE_TAB: null,
    IMAGE_GENERATOR_TAB: null,
};

/**
 * Resolve a selector key to the first CSS selector string that matches an element.
 * For array selectors, tries each in order and returns the first hit.
 * Falls back to the first selector if none match (for waitFor scenarios).
 * @param {string} key - The AB_SELECTORS key
 * @returns {string} - A CSS selector string
 */
function AB_resolveSelector(key) {
    const sel = AB_SELECTORS[key];
    if (!sel) return null;
    if (typeof sel === 'string') return sel;
    if (Array.isArray(sel)) {
        for (const s of sel) {
            try {
                if (document.querySelector(s)) return s;
            } catch (e) { /* invalid selector, skip */ }
        }
        return sel[0]; // fallback to primary even if nothing found yet
    }
    return null;
}

// Selector metadata — helps diagnostics report which selectors are critical
const AB_SELECTOR_META = {
    PROMPT_TEXTAREA: { critical: true, phase: 'image', description: 'Main prompt input (Slate.js contenteditable div)' },
    GENERATE_BUTTON: { critical: true, phase: 'both', description: 'Create button (bottom bar)' },
    ADD_TO_PROMPT_BUTTON: { critical: true, phase: 'image', description: 'Add to Prompt (hover overlay)' },
    IMAGE_RESULT_IMG: { critical: true, phase: 'image', description: 'Generated image element' },
    F2V_TAB: { critical: true, phase: 'video', description: 'Frames to Video tab/button' },
    START_FRAME_SLOT: { critical: true, phase: 'video', description: 'Start frame upload slot' },
    END_FRAME_SLOT: { critical: true, phase: 'video', description: 'End frame upload slot' },
    FILE_INPUT: { critical: true, phase: 'both', description: 'Hidden file input for uploads' },
    LOADING_INDICATOR: { critical: false, phase: 'both', description: 'Loading/generating indicator' },
    ERROR_MESSAGE: { critical: false, phase: 'both', description: 'Error alert message' },
    VIDEO_RESULT_ELEMENT: { critical: true, phase: 'video', description: 'Generated video element' },
    VIDEO_DOWNLOAD_BUTTON: { critical: true, phase: 'video', description: 'Video download button' },
    MODEL_DROPDOWN: { critical: false, phase: 'image', description: 'Model dropdown (combobox)' },
    NEW_PROJECT_BUTTON: { critical: true, phase: 'both', description: 'Dashboard "New project" button' },
    ADD_MEDIA_BUTTON: { critical: true, phase: 'image', description: 'Add media/ingredient button' },
};

if (typeof globalThis !== 'undefined') {
    globalThis.AB_SELECTORS = AB_SELECTORS;
    globalThis.AB_SELECTOR_META = AB_SELECTOR_META;
    globalThis.AB_resolveSelector = AB_resolveSelector;
}
