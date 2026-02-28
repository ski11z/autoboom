/**
 * AutoBoom — Navigation Actions
 * Helpers for navigating the Flow UI.
 */

const AB_Navigation = (() => {

    /**
     * Check if we're currently on a Flow editor page.
     */
    function isOnFlowPage() {
        const url = window.location.href;
        return url.includes('labs.google/flow') || url.includes('labs.google/fx');
    }

    /**
     * Check if a Flow project appears to be open.
     */
    function isProjectOpen() {
        // Look for prompt textarea as a signal that a project is loaded
        return AB_DomBridge.exists('PROMPT_TEXTAREA');
    }

    /**
     * Navigate to the Flow editor page.
     */
    function navigateToFlow() {
        window.location.href = AB_CONSTANTS.FLOW_URLS.EDITOR;
    }

    /**
     * Click the "New Project" button on the Flow dashboard.
     * The button text is "add_2New project" (icon + text).
     * It may be off-screen (bottom of page), so we scroll first.
     */
    async function createNewProject() {
        try {
            const beforeUrl = window.location.href;

            // Scroll to the bottom to ensure the New Project button is rendered
            window.scrollTo(0, document.body.scrollHeight);
            await _sleep(1000);

            let targetBtn = null;

            // Strategy 1: Find by text content — the button text includes "New project"
            const candidates = document.querySelectorAll('button, a, [role="button"], [role="link"]');
            for (const el of candidates) {
                const text = el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                if (text.includes('new project')) {
                    targetBtn = el;
                    AB_Logger.info('Navigation', `Found "New project" button by text: "${el.textContent.replace(/\s+/g, ' ').trim()}"`);
                    break;
                }
            }

            // Strategy 2: Try class-based selector (from live DOM: sc-a38764c7-0)
            if (!targetBtn) {
                targetBtn = document.querySelector('button.sc-a38764c7-0');
                if (targetBtn) {
                    AB_Logger.info('Navigation', 'Found "New project" button by class');
                }
            }

            // Strategy 3: Try the registered CSS selector
            if (!targetBtn && AB_DomBridge.exists('NEW_PROJECT_BUTTON')) {
                targetBtn = document.querySelector(AB_resolveSelector('NEW_PROJECT_BUTTON'));
                if (targetBtn) {
                    AB_Logger.info('Navigation', 'Found "New project" button by registered selector');
                }
            }

            if (!targetBtn) {
                AB_Logger.error('Navigation', 'Could not find "New Project" button on page');
                return false;
            }

            // Scroll the button into view and click it
            targetBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
            await _sleep(500);
            targetBtn.click();
            AB_Logger.info('Navigation', 'Clicked "New project" button');

            AB_Logger.info('Navigation', 'Waiting for editor to load...');

            // Wait for URL to change to /project/ or the Slate editor to appear
            const success = await _waitForCondition(() => {
                const urlChanged = window.location.href !== beforeUrl;
                const isProjectUrl = window.location.href.includes('/project/');
                // Check for new Slate editor OR legacy textarea
                const hasEditor = document.querySelector('div[data-slate-editor="true"]') !== null ||
                    document.querySelector('div[role="textbox"][contenteditable="true"]') !== null ||
                    document.querySelector('#PINHOLE_TEXT_AREA_ELEMENT_ID') !== null;
                return (urlChanged && isProjectUrl) || hasEditor;
            }, 15_000);

            if (!success) {
                AB_Logger.warn('Navigation', 'Editor did not load within 15s');
                return false;
            }

            // Extra wait for DOM to settle after navigation
            await _sleep(2000);
            AB_Logger.info('Navigation', 'Project editor loaded', { url: window.location.href });
            return true;
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to create new project', err.message);
            return false;
        }
    }

    /**
     * Wait for a condition function to return true.
     */
    async function _waitForCondition(condFn, timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (condFn()) return true;
            await _sleep(500);
        }
        return false;
    }

    /**
     * Switch to Image mode by clicking the "Image" inline toggle button.
     * In the new UI, content type is selected via inline pill buttons above the prompt.
     */
    async function switchToImagesTab() {
        try {
            return await _clickToggleByText('Image');
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to switch to Images mode', err.message);
            return false;
        }
    }

    /**
     * Switch to Video mode by clicking the "Video" inline toggle button.
     */
    async function switchToVideosTab() {
        try {
            return await _clickToggleByText('Video');
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to switch to Videos mode', err.message);
            return false;
        }
    }

    /**
     * Click an inline toggle/pill button by text content.
     * Scans all buttons for exact or partial match.
     */
    async function _clickToggleByText(labelText) {
        const allBtns = document.querySelectorAll('button');

        // Exact match first
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if (text === labelText) {
                btn.click();
                AB_Logger.info('Navigation', `Clicked "${labelText}" toggle (exact)`);
                await _sleep(800);
                return true;
            }
        }

        // Partial match — button text may include icon prefix (e.g. "photoImage")
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if (text.endsWith(labelText) || text.includes(labelText)) {
                // Avoid clicking the Create button or other large buttons
                const isLarge = btn.getBoundingClientRect().width > 200;
                if (!isLarge) {
                    btn.click();
                    AB_Logger.info('Navigation', `Clicked "${text}" toggle (partial match for "${labelText}")`);
                    await _sleep(800);
                    return true;
                }
            }
        }

        AB_Logger.info('Navigation', `Toggle button "${labelText}" not found`);
        return false;
    }

    /**
     * Select "Frames to Video" mode.
     * First switches to Video content type, then looks for F2V option.
     */
    async function selectFramesToVideo() {
        try {
            // Switch to Video mode first
            await switchToVideosTab();
            await _sleep(500);

            // Try to find F2V via combobox dropdown or toggle
            const combobox = document.querySelector('button[role="combobox"]');
            if (combobox && combobox.textContent.includes('Frames to Video')) {
                AB_Logger.info('Navigation', 'Already in Frames to Video mode');
                return true;
            }

            if (combobox) {
                combobox.click();
                await _sleep(800);

                const items = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"]');
                for (const item of items) {
                    const text = item.textContent.replace(/\s+/g, ' ').trim();
                    if (text.includes('Frames to Video')) {
                        item.click();
                        AB_Logger.info('Navigation', 'Selected "Frames to Video" from dropdown');
                        await _sleep(1000);
                        return true;
                    }
                }
            }

            // Fallback: try clicking a button with "Frames to Video" text directly
            return await _clickToggleByText('Frames to Video');
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to select Frames to Video', err.message);
            return false;
        }
    }

    /**
     * Select "Text to Video" mode.
     */
    async function selectTextToVideo() {
        try {
            // Switch to Video mode first
            await switchToVideosTab();
            await _sleep(500);

            const combobox = document.querySelector('button[role="combobox"]');
            if (combobox && combobox.textContent.includes('Text to Video')) {
                AB_Logger.info('Navigation', 'Already in Text to Video mode');
                return true;
            }

            if (combobox) {
                combobox.click();
                await _sleep(800);

                const items = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"]');
                for (const item of items) {
                    const text = item.textContent.replace(/\s+/g, ' ').trim();
                    if (text.includes('Text to Video')) {
                        item.click();
                        AB_Logger.info('Navigation', 'Selected "Text to Video" from dropdown');
                        await _sleep(1000);
                        return true;
                    }
                }
            }

            return await _clickToggleByText('Text to Video');
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to select Text to Video', err.message);
            return false;
        }
    }

    /**
     * Select the Image Generator mode.
     * In the new UI, this just means clicking the "Image" toggle.
     */
    async function selectImageGenerator() {
        try {
            return await switchToImagesTab();
        } catch (err) {
            AB_Logger.error('Navigation', 'Failed to select Image Generator', err.message);
            return false;
        }
    }

    /**
     * Get current page status info.
     */
    function getPageStatus() {
        const url = window.location.href;

        // Check if URL looks like an editor page
        // Dashboard: /fx/tools/flow  vs  Editor: /fx/tools/flow/project/[uuid]
        const isEditorPage = url.includes('/flow/project/');

        // Check for prompt input — try registered selector first, then broad fallback
        let hasPromptInput = AB_DomBridge.exists('PROMPT_TEXTAREA');

        // Fallback: look for any textarea or contenteditable on the page
        if (!hasPromptInput) {
            const textareas = document.querySelectorAll('textarea, [contenteditable="true"], div[data-slate-editor="true"]');
            hasPromptInput = textareas.length > 0;
            if (hasPromptInput) {
                AB_Logger.info('Navigation', 'Found prompt input via fallback (textarea/contenteditable)', {
                    count: textareas.length,
                    tags: [...textareas].map(el => `${el.tagName}[${el.className?.substring(0, 30) || ''}]`)
                });
            }
        }

        const hasGenerateButton = AB_DomBridge.exists('GENERATE_BUTTON');

        return {
            onFlowPage: isOnFlowPage(),
            url,
            isEditorPage,
            projectOpen: hasPromptInput || isEditorPage,
            hasPromptInput,
            hasGenerateButton,
        };
    }

    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    return {
        isOnFlowPage, isProjectOpen, navigateToFlow,
        createNewProject, switchToImagesTab, switchToVideosTab,
        selectFramesToVideo, selectTextToVideo, selectImageGenerator,
        getPageStatus,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Navigation = AB_Navigation;
}
