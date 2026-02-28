/**
 * AutoBoom — Image Generation Actions
 * Performs DOM actions for the image generation phase.
 */

const AB_ImageGen = (() => {

    /**
     * Enter a prompt into the prompt textarea.
     * Uses background service worker to type in the page's MAIN world
     * (Slate.js ignores execCommand from the content script's isolated world).
     */
    async function enterPrompt(promptText) {
        try {
            // Use the background's main-world typing approach
            const result = await chrome.runtime.sendMessage({
                type: 'TYPE_IN_MAIN_WORLD',
                payload: {
                    text: promptText,
                    selector: '[data-slate-editor="true"]',
                },
            });

            if (result?.success) {
                AB_Logger.info('ImageGen', `Entered prompt via main-world (${promptText.length} chars)`);
                return { success: true };
            }

            // Fallback: try the old DomBridge approach
            AB_Logger.warn('ImageGen', `Main-world typing failed: ${result?.error}. Trying DomBridge fallback...`);
            await AB_DomBridge.typeText('PROMPT_TEXTAREA', promptText, { clear: true, instant: true });
            AB_Logger.info('ImageGen', `Entered prompt via DomBridge fallback (${promptText.length} chars)`);
            return { success: true };
        } catch (err) {
            AB_Logger.error('ImageGen', 'Failed to enter prompt', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Set the aspect ratio.
     */
    async function setAspectRatio(ratio) {
        try {
            // Click the aspect ratio control
            await AB_DomBridge.click('ASPECT_RATIO_BUTTON');
            await _sleep(500);

            // Select the option
            const optionKey = ratio === '16:9' ? 'ASPECT_RATIO_OPTION_16_9' : 'ASPECT_RATIO_OPTION_9_16';
            await AB_DomBridge.click(optionKey);
            await _sleep(300);

            AB_Logger.info('ImageGen', `Set aspect ratio to ${ratio}`);
            return { success: true };
        } catch (err) {
            AB_Logger.warn('ImageGen', `Failed to set aspect ratio to ${ratio}`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Attach a reference image using the "+" button below the prompt field.
     * Flow UI (2026-02): Click "+" → asset picker dialog (role="dialog") opens.
     * Asset items are <div> rows with ~40x40 thumbnail images.
     * @param {number} imageIndex - Index in picker list. -1 = first (most recent).
     */
    async function attachReferenceAddToPrompt(imageIndex) {
        try {
            // imageIndex -1 = most recently generated (handled in Step 4 as last item)
            if (imageIndex === undefined || imageIndex === null) {
                imageIndex = -1;
            }

            AB_Logger.info('ImageGen', `Attaching reference via + button (picker index: ${imageIndex})`);

            // Step 1: Find the "+" button — text starts with "add" (e.g. "add_2Create")
            let plusBtn = null;
            for (const btn of document.querySelectorAll('button')) {
                const rect = btn.getBoundingClientRect();
                if (rect.height === 0 || rect.width === 0) continue;
                if (btn.textContent.trim().startsWith('add') && rect.top > window.innerHeight * 0.5) {
                    plusBtn = btn;
                    break;
                }
            }

            if (!plusBtn) {
                throw new Error('"+" button not found (text starting with "add" near bottom)');
            }

            AB_Logger.info('ImageGen', 'Clicking "+" button...');
            _simulateRealClick(plusBtn);
            await _sleep(2000);

            // Step 2: Find the picker dialog (role="dialog" containing "Recently Used")
            let pickerDialog = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                for (const d of document.querySelectorAll('[role="dialog"]')) {
                    if (d.textContent.includes('Recently Used') || d.textContent.includes('Search for Assets')) {
                        pickerDialog = d;
                        break;
                    }
                }
                if (pickerDialog) break;
                AB_Logger.debug('ImageGen', `Waiting for picker dialog... attempt ${attempt + 1}`);
                await _sleep(800);
            }

            if (!pickerDialog) {
                throw new Error('Asset picker dialog not found');
            }

            AB_Logger.info('ImageGen', 'Asset picker dialog found');

            // Step 3: Find asset item rows by their small thumbnail images (~40x40)
            const assetItems = [];
            for (const img of pickerDialog.querySelectorAll('img')) {
                const rect = img.getBoundingClientRect();
                // Thumbnails are small (~40x40), skip the large preview image on the right
                if (rect.width >= 20 && rect.width <= 80 && rect.height >= 20 && rect.height <= 80) {
                    // The row container is the parent div with a class
                    const row = img.parentElement?.closest('div[class]') || img.parentElement;
                    if (row && row.getBoundingClientRect().height > 0) {
                        assetItems.push({ element: row, name: row.textContent.trim() });
                    }
                }
            }

            AB_Logger.info('ImageGen', `Found ${assetItems.length} items: ${assetItems.map(a => a.name).join(', ')}`);

            if (assetItems.length === 0) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                throw new Error('No asset items found in picker');
            }

            // Step 4: Click the target item row
            // imageIndex -1 means "most recent" = LAST item (picker is oldest-first, newest-last)
            let idx;
            if (imageIndex === -1) {
                idx = assetItems.length - 1; // Last item = most recently generated
            } else {
                idx = Math.min(imageIndex, assetItems.length - 1);
            }
            AB_Logger.info('ImageGen', `Clicking asset "${assetItems[idx].name}" (index ${idx})`);
            _simulateRealClick(assetItems[idx].element);
            await _sleep(1500);

            AB_Logger.info('ImageGen', `Reference attached: "${assetItems[idx].name}"`);
            return { success: true, method: 'plus-button-picker', assetName: assetItems[idx].name };
        } catch (err) {
            AB_Logger.warn('ImageGen', `+ button reference failed`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Attach a reference image by downloading and re-uploading.
     * Fallback method when "Add to Prompt" doesn't work.
     */
    async function attachReferenceUpload(imageIndex) {
        try {
            // Get all generated images
            const images = document.querySelectorAll('img[alt="Generated image"]');

            // If imageIndex is -1, use the NEWEST image (index 0 — Flow renders newest at the top)
            if (imageIndex === -1 || imageIndex === undefined || imageIndex === null) {
                imageIndex = 0;
            }

            if (imageIndex >= images.length || imageIndex < 0) {
                throw new Error(`Image index ${imageIndex} out of range (${images.length} images found)`);
            }

            const targetImage = images[imageIndex];
            const imgSrc = targetImage.src || targetImage.currentSrc;

            if (!imgSrc) {
                throw new Error('Could not get image source URL');
            }

            // Download the image as a File
            const file = await AB_Upload.fetchAsFile(imgSrc, `reference_${imageIndex}.png`);

            // Upload via file input
            const result = await AB_Upload.uploadViaFileInput(file);

            if (result.success) {
                AB_Logger.info('ImageGen', `Attached reference image ${imageIndex} via upload fallback`);
                return { success: true, method: 'upload' };
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            AB_Logger.error('ImageGen', `Upload fallback failed for image ${imageIndex}`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Attach reference with auto-fallback: try Add-to-Prompt first, then upload.
     */
    async function attachReference(imageIndex, method = 'auto') {
        if (method === 'upload') {
            return await attachReferenceUpload(imageIndex);
        }

        if (method === 'add-to-prompt') {
            return await attachReferenceAddToPrompt(imageIndex);
        }

        // Auto mode: try Add to Prompt first, fallback to upload
        const result = await attachReferenceAddToPrompt(imageIndex);
        if (result.success) return result;

        AB_Logger.info('ImageGen', 'Add-to-Prompt failed, falling back to upload method');
        return await attachReferenceUpload(imageIndex);
    }

    /**
     * Click the Generate/Create button to start image generation.
     * The "Create" button in Flow starts disabled="" until a prompt is entered.
     */
    async function clickGenerate() {
        try {
            let createBtn = null;

            // Strategy 1: Find by "arrow_forwardCreate" text (confirmed from diagnostic)
            // The Generate button text is "arrow_forwardCreate" — the icon text + "Create"
            // NOT "add_2Create" which is the New Project button!
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                if (text.includes('arrow_forward') && text.includes('Create')) {
                    createBtn = btn;
                    AB_Logger.info('ImageGen', `Found Create button by arrow_forward+Create: "${text}"`);
                    break;
                }
            }

            // Strategy 2: Find button with arrow_forward icon element
            if (!createBtn) {
                for (const btn of buttons) {
                    const icon = btn.querySelector('i');
                    if (icon && icon.textContent.trim() === 'arrow_forward') {
                        createBtn = btn;
                        AB_Logger.info('ImageGen', 'Found Create button by arrow_forward icon element');
                        break;
                    }
                }
            }

            // Strategy 3: Try registered selector
            if (!createBtn) {
                const selector = AB_resolveSelector('GENERATE_BUTTON');
                if (selector) {
                    createBtn = document.querySelector(selector);
                    if (createBtn) {
                        AB_Logger.info('ImageGen', 'Found Create button by registered selector');
                    }
                }
            }

            // Strategy 4: Find "Create" text but EXCLUDE "add_2Create" (New Project)
            if (!createBtn) {
                for (const btn of buttons) {
                    const text = btn.textContent.replace(/\s+/g, ' ').trim();
                    if (text.includes('Create') && !text.includes('add_2') &&
                        !text.includes('Create Image') &&
                        btn.getAttribute('role') !== 'combobox') {
                        createBtn = btn;
                        AB_Logger.info('ImageGen', `Found Create button by text (excluding add_2): "${text}"`);
                        break;
                    }
                }
            }

            if (!createBtn) {
                throw new Error('Could not find the Create/Generate button');
            }

            // Wait for button to become enabled (up to 5s)
            let waitAttempts = 0;
            while (createBtn.disabled && waitAttempts < 10) {
                AB_Logger.debug('ImageGen', `Create button is disabled, waiting... (${waitAttempts}/10)`);
                await _sleep(500);
                waitAttempts++;
            }

            if (createBtn.disabled) {
                throw new Error('Create button is still disabled — prompt may not have registered');
            }

            await _sleep(300); // Human-like pause
            createBtn.click();
            AB_Logger.info('ImageGen', 'Clicked Create button');
            await _sleep(500);
            return { success: true };
        } catch (err) {
            AB_Logger.error('ImageGen', 'Failed to click Create', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Wait for the image generation to complete.
     * Uses image count polling: checks if new images appeared since generation started.
     * @param {Object} opts - { timeout, beforeCount }
     */
    async function waitForResult(opts = {}) {
        const timeout = opts.timeout || AB_CONSTANTS.DEFAULTS.IMAGE_TIMEOUT_MS;
        const beforeCount = opts.beforeCount ?? getGeneratedImageCount();
        const start = Date.now();
        const maxRetries = 3;
        let retryCount = 0;
        let knownErrorCount = _countErrorCards(); // Track errors already present before we start

        AB_Logger.info('ImageGen', `Waiting for new image (current count: ${beforeCount}, timeout: ${timeout}ms, known errors: ${knownErrorCount})`);

        let stableCount = 0;
        let lastCount = beforeCount;

        while (Date.now() - start < timeout) {
            await _sleep(3000); // Poll every 3 seconds

            const currentCount = getGeneratedImageCount();

            // ─── Check for policy violation → return flag for phase to handle recovery ───
            const policyError = _detectPolicyViolation();
            if (policyError) {
                AB_Logger.warn('ImageGen', `Policy violation detected: ${policyError}`);
                return { success: false, policyViolation: true, error: policyError };
            }

            // ─── Check for NEW "Something went wrong." error cards ───
            const currentErrorCount = _countErrorCards();
            if (currentErrorCount > knownErrorCount) {
                // New error appeared!
                if (retryCount >= maxRetries) {
                    AB_Logger.error('ImageGen', `Max retries (${maxRetries}) reached for "Something went wrong." error`);
                    return { success: false, error: `Generation failed after ${maxRetries} retries` };
                }

                const recovered = await _clickReuseAndCreate();
                if (recovered) {
                    retryCount++;
                    knownErrorCount = _countErrorCards(); // Update known count so we don't re-detect same error
                    AB_Logger.info('ImageGen', `Retry ${retryCount}/${maxRetries} — clicked "Reuse prompt" + Create, waiting 15s...`);
                    await _sleep(15000); // Wait 15s for generation to complete before next check
                    continue;
                }
            }

            // Check for other error messages
            if (AB_DomBridge.exists('ERROR_MESSAGE')) {
                const errorText = await AB_DomBridge.getText('ERROR_MESSAGE').catch(() => 'Unknown error');
                AB_Logger.error('ImageGen', 'Generation error from Flow', errorText);
                return { success: false, error: `Flow error: ${errorText}` };
            }

            // Check if new images appeared
            if (currentCount > beforeCount) {
                // Verify it's stable (not still loading more)
                if (currentCount === lastCount) {
                    stableCount++;
                } else {
                    stableCount = 0;
                }
                lastCount = currentCount;

                // 2 consecutive stable polls = done
                if (stableCount >= 1) {
                    AB_Logger.info('ImageGen', `Image generation complete (before: ${beforeCount}, after: ${currentCount})`);

                    // Get the latest image info
                    const images = document.querySelectorAll('img[alt="Generated image"]');
                    const latestImage = images[images.length - 1];
                    const imgSrc = latestImage?.src || latestImage?.currentSrc;

                    return {
                        success: true,
                        imageCount: currentCount,
                        newImageCount: currentCount - beforeCount,
                        latestImageSrc: imgSrc,
                    };
                }
            }

            AB_Logger.debug('ImageGen', `Waiting... (${Math.round((Date.now() - start) / 1000)}s, count: ${currentCount})`);
        }

        // Timeout
        AB_Logger.error('ImageGen', `Generation timeout after ${timeout}ms`);
        return { success: false, error: `Image generation timed out after ${Math.round(timeout / 1000)}s` };
    }

    /**
     * Count how many "Something went wrong." error cards are currently on the page.
     */
    function _countErrorCards() {
        let count = 0;
        const allElements = document.querySelectorAll('div, span, p');
        for (const el of allElements) {
            if (el.textContent.trim() === 'Something went wrong.' && el.children.length === 0) {
                count++;
            }
        }
        return count;
    }

    /**
     * Detect policy violation errors ("Failed" + "might violate our policies").
     * Returns the error message string if found, or null if not.
     */
    function _detectPolicyViolation() {
        const allElements = document.querySelectorAll('div, span, p');
        for (const el of allElements) {
            const text = el.textContent.replace(/\s+/g, ' ').trim();
            if (text.includes('might violate our policies') || text.includes('violate our policies')) {
                return text.substring(0, 200);
            }
        }
        // Also check for "Failed" heading near policy text
        for (const el of allElements) {
            if (el.textContent.trim() === 'Failed' && el.children.length === 0) {
                const parent = el.closest('div');
                if (parent && parent.textContent.includes('policies')) {
                    return parent.textContent.replace(/\s+/g, ' ').trim().substring(0, 200);
                }
            }
        }
        return null;
    }

    /**
     * Click "Reuse prompt" then "Create" to retry a failed generation.
     * Returns true if recovery was attempted.
     */
    async function _clickReuseAndCreate() {
        // Find "Reuse prompt" button
        let reuseBtn = null;
        const allBtns = document.querySelectorAll('button');
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            if (text.includes('reuse prompt') || text.includes('reuse')) {
                reuseBtn = btn;
                break;
            }
        }

        if (!reuseBtn) {
            AB_Logger.warn('ImageGen', '"Reuse prompt" button not found');
            return false;
        }

        AB_Logger.info('ImageGen', 'Clicking "Reuse prompt"...');
        reuseBtn.click();
        await _sleep(2000);

        // Click Create/Send to regenerate
        const createBtn = document.querySelector('button[aria-label="Create"]')
            || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Create');
        if (createBtn) {
            AB_Logger.info('ImageGen', 'Clicking Create to retry generation...');
            createBtn.click();
            await _sleep(2000);
        }

        return true;
    }

    /**
     * Click the retry/refresh icon on a failed generation card.
     * The icon is a circular arrow button at the bottom of the error card.
     * Returns { success: true } if clicked, { success: false } if not found.
     */
    async function clickRetryIcon() {
        try {
            // Look for the retry icon — it's a button with a refresh/replay icon
            // near a "Failed" error card
            const allBtns = document.querySelectorAll('button');
            let retryBtn = null;

            for (const btn of allBtns) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                const rect = btn.getBoundingClientRect();
                if (rect.height === 0 || rect.width === 0) continue;

                // The retry icon contains "replay" or "refresh" or "autorenew" icon text
                if (text === 'replay' || text === 'refresh' || text === 'autorenew' || text === 'restart_alt') {
                    // Verify it's near a failed/error card
                    const parent = btn.closest('div');
                    if (parent && (parent.textContent.includes('Failed') || parent.textContent.includes('went wrong'))) {
                        retryBtn = btn;
                        break;
                    }
                }
            }

            // Fallback: find any small circular button near "Failed" text
            if (!retryBtn) {
                for (const btn of allBtns) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.height === 0 || rect.width === 0) continue;
                    // Small circular buttons (icon buttons are ~32x32 or ~40x40)
                    if (rect.width <= 48 && rect.height <= 48 && rect.width >= 24) {
                        const parent = btn.parentElement?.closest('div');
                        if (parent && parent.textContent.includes('Failed') && parent.textContent.includes('policies')) {
                            retryBtn = btn;
                            AB_Logger.info('ImageGen', `Found retry icon via proximity to Failed text: "${btn.textContent.trim()}"`);
                            break;
                        }
                    }
                }
            }

            if (!retryBtn) {
                AB_Logger.warn('ImageGen', 'Retry icon not found on page');
                return { success: false, error: 'Retry icon not found' };
            }

            AB_Logger.info('ImageGen', `Clicking retry icon: "${retryBtn.textContent.trim()}"...`);
            _simulateRealClick(retryBtn);
            await _sleep(2000);

            AB_Logger.info('ImageGen', 'Retry icon clicked');
            return { success: true };
        } catch (err) {
            AB_Logger.error('ImageGen', 'Failed to click retry icon', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Click the "Reuse Prompt" button to restore the prompt in the editor.
     * Used during policy violation recovery to get the prompt back before rewriting.
     */
    async function clickReusePromptButton() {
        try {
            let reuseBtn = null;
            const allBtns = document.querySelectorAll('button');
            for (const btn of allBtns) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                const rect = btn.getBoundingClientRect();
                if (rect.height === 0 || rect.width === 0) continue;
                if (text.toLowerCase().includes('reuse prompt') || text === 'Reuse Prompt') {
                    reuseBtn = btn;
                    break;
                }
            }

            if (!reuseBtn) {
                AB_Logger.warn('ImageGen', '"Reuse Prompt" button not found');
                return { success: false, error: '"Reuse Prompt" button not found' };
            }

            AB_Logger.info('ImageGen', 'Clicking "Reuse Prompt"...');
            _simulateRealClick(reuseBtn);
            await _sleep(2000);

            AB_Logger.info('ImageGen', '"Reuse Prompt" clicked — prompt restored');
            return { success: true };
        } catch (err) {
            AB_Logger.error('ImageGen', 'Failed to click Reuse Prompt', err.message);
            return { success: false, error: err.message };
        }
    }




    /**
     * Get the count of currently generated images on the page.
     */
    function getGeneratedImageCount() {
        try {
            return document.querySelectorAll('img[alt="Generated image"]').length;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Simulate a realistic click on an element.
     * React 17+ uses pointer events, so bare el.click() often doesn't work.
     * Dispatches: pointerdown → mousedown → pointerup → mouseup → click
     * at the element's center coordinates.
     */
    function _simulateRealClick(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const commonProps = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

        el.dispatchEvent(new PointerEvent('pointerdown', { ...commonProps, pointerId: 1 }));
        el.dispatchEvent(new MouseEvent('mousedown', commonProps));
        el.dispatchEvent(new PointerEvent('pointerup', { ...commonProps, pointerId: 1 }));
        el.dispatchEvent(new MouseEvent('mouseup', commonProps));
        el.dispatchEvent(new MouseEvent('click', commonProps));
    }

    /**
     * Configure Flow settings: aspect ratio, model, and output count.
     *
     * Updated 2026-02-26: The Flow UI has a COMBINED settings button
     * (e.g. "Videocrop_9_16x4" with data-state="closed"). Clicking it
     * opens a settings panel/popover with toggle buttons inside:
     *   - Image / Video mode toggle
     *   - Ingredients / Frames sub-mode toggle
     *   - Landscape / Portrait aspect ratio toggle
     *   - x1 / x2 / x3 / x4 output count toggle
     *   - Model dropdown (e.g. "Veo 3.1 - Fast")
     */
    async function configureSettings(opts = {}) {
        const aspectRatio = opts.aspectRatio || '9:16';
        const outputCount = opts.outputCount || 1;
        const imageModel = opts.imageModel || null;
        const videoModel = opts.videoModel || null;

        // Build model value→label map from central constants
        const MODEL_LABELS = {};
        [...AB_CONSTANTS.IMAGE_MODELS, ...AB_CONSTANTS.VIDEO_MODELS].forEach(m => {
            MODEL_LABELS[m.value] = m.label.replace(/^[^\w]*/, '').trim();
        });

        // Map aspect ratio to the toggle label
        const ASPECT_MAP = {
            '9:16': 'Portrait',
            '16:9': 'Landscape',
        };
        const targetAspectLabel = ASPECT_MAP[aspectRatio] || 'Portrait';

        try {
            AB_Logger.info('ImageGen', `Configuring settings: aspect=${aspectRatio} (${targetAspectLabel}), output=x${outputCount}, model=${imageModel || videoModel || 'default'}`);

            // ═══ STEP 0: Open the settings panel (with retry/verification) ═══
            AB_Logger.info('ImageGen', 'Step 0: Opening settings panel...');
            let settingsBtn = _findCombinedSettingsButton();
            if (settingsBtn) {
                const currentText = settingsBtn.textContent.replace(/\s+/g, ' ').trim();
                AB_Logger.info('ImageGen', `Found settings button: "${currentText}" [data-state=${settingsBtn.getAttribute('data-state')}]`);

                // Click to open with retry — verify data-state changes to 'open'
                for (let openAttempt = 1; openAttempt <= 3; openAttempt++) {
                    const state = settingsBtn.getAttribute('data-state');
                    if (state === 'open') {
                        AB_Logger.info('ImageGen', `Settings panel is open (attempt ${openAttempt})`);
                        break;
                    }
                    AB_Logger.info('ImageGen', `Clicking settings button (attempt ${openAttempt}/3)...`);
                    _simulateRealClick(settingsBtn);
                    await _sleep(1500);

                    // Re-find the button in case DOM changed
                    settingsBtn = _findCombinedSettingsButton();
                    if (!settingsBtn) {
                        AB_Logger.warn('ImageGen', 'Settings button disappeared after click');
                        break;
                    }
                    if (settingsBtn.getAttribute('data-state') === 'open') {
                        AB_Logger.info('ImageGen', `Settings panel opened on attempt ${openAttempt}`);
                        break;
                    }
                }
            } else {
                AB_Logger.warn('ImageGen', 'No combined settings button found');
            }

            // ═══ Wait for settings panel to fully render ═══
            // Poll for Landscape/Portrait buttons to appear (they're inside the popover)
            AB_Logger.info('ImageGen', 'Waiting for settings panel to render...');
            let panelReady = false;
            for (let wait = 0; wait < 15; wait++) {
                await _sleep(500);
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const t = btn.textContent.replace(/\s+/g, ' ').trim();
                    if (t.includes('Landscape') || t.includes('Portrait')) {
                        panelReady = true;
                        break;
                    }
                }
                if (panelReady) {
                    AB_Logger.info('ImageGen', `Settings panel ready after ${(wait + 1) * 500}ms`);
                    break;
                }
            }

            if (!panelReady) {
                // Debug: log ALL buttons on page to understand what's there
                const allBtnsDebug = document.querySelectorAll('button');
                AB_Logger.warn('ImageGen', `Settings panel toggles not found after 7.5s. Total buttons on page: ${allBtnsDebug.length}`);
                for (const btn of allBtnsDebug) {
                    const t = btn.textContent.replace(/\s+/g, ' ').trim();
                    if (t.length > 0 && t.length < 80) {
                        const rect = btn.getBoundingClientRect();
                        AB_Logger.info('ImageGen', `  Button: "${t}" [y=${Math.round(rect.y)}, h=${Math.round(rect.height)}, state=${btn.getAttribute('data-state') || '-'}]`);
                    }
                }
                return { success: false, error: 'Settings panel toggles did not appear' };
            }

            // ═══ STEP 1: Select Image / Video mode ═══
            const projectMode = opts.mode || 'create-image';
            const targetMode = (projectMode === 'create-image') ? 'Image' : 'Video';
            AB_Logger.info('ImageGen', `Step 1: Setting mode to ${targetMode} (project mode: ${projectMode})...`);
            let modeFound = false;
            const modeBtns = document.querySelectorAll('button');
            for (const btn of modeBtns) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                // Match "Image" or "Video" buttons (may contain icon text like "📷 Image")
                // Exclude buttons with extra text like "x4" or "Create"
                if (text.includes(targetMode) && !text.includes('x1') && !text.includes('x2') && !text.includes('x3') && !text.includes('x4') && !text.includes('Create') && !text.includes('crop_') && text.length < 30) {
                    _simulateRealClick(btn);
                    AB_Logger.info('ImageGen', `✅ Clicked mode button: "${text}"`);
                    modeFound = true;
                    await _sleep(500);
                    break;
                }
            }
            if (!modeFound) {
                AB_Logger.warn('ImageGen', `Mode "${targetMode}" button not found`);
            }

            // ═══ STEP 1.5: Select sub-mode (Frames) for Video ═══
            // Both F2V and T2V need the "Frames" sub-mode selected
            if (targetMode === 'Video') {
                await _sleep(500);
                const targetSubMode = 'Frames';
                AB_Logger.info('ImageGen', `Step 1.5: Selecting "${targetSubMode}" sub-mode...`);
                let subModeFound = false;
                const subBtns = document.querySelectorAll('button');
                for (const btn of subBtns) {
                    const text = btn.textContent.replace(/\s+/g, ' ').trim();
                    if (text.includes(targetSubMode) && !text.includes('x') && text.length < 30) {
                        _simulateRealClick(btn);
                        AB_Logger.info('ImageGen', `✅ Clicked sub-mode button: "${text}"`);
                        subModeFound = true;
                        await _sleep(500);
                        break;
                    }
                }
                if (!subModeFound) {
                    AB_Logger.warn('ImageGen', `Sub-mode "${targetSubMode}" button not found`);
                }
            }

            // ═══ STEP 2: Select aspect ratio (Landscape / Portrait toggle) ═══
            AB_Logger.info('ImageGen', 'Step 2: Setting aspect ratio...');
            let aspectFound = false;
            const allBtns = document.querySelectorAll('button');
            for (const btn of allBtns) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                // Match buttons containing the target label (text may include icon text like "crop_portraitPortrait")
                // Exclude the combined settings button itself (it contains both Landscape and Portrait info)
                if (text.includes(targetAspectLabel) && !text.includes('x1') && !text.includes('x2') && !text.includes('x3') && !text.includes('x4')) {
                    _simulateRealClick(btn);
                    AB_Logger.info('ImageGen', `✅ Clicked aspect ratio button: "${text}"`);
                    aspectFound = true;
                    await _sleep(400);
                    break;
                }
            }

            if (!aspectFound) {
                AB_Logger.warn('ImageGen', `Aspect ratio "${targetAspectLabel}" button not found`);
            }

            // ═══ STEP 3: Select output count (x1 / x2 / x3 / x4 toggle) ═══
            AB_Logger.info('ImageGen', `Step 3: Setting output count to x${outputCount}...`);
            const outputLabel = `x${outputCount}`;
            let outputFound = false;

            const allBtns2 = document.querySelectorAll('button');
            for (const btn of allBtns2) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                // Match exact "x1", "x2" etc. — must be SHORT (just the label)
                // Exclude the combined settings button which also ends with x1/x2/etc.
                if ((text === outputLabel || text.endsWith(outputLabel)) &&
                    text.length <= 5 &&
                    !text.includes('crop_') &&
                    !text.includes('Nano') &&
                    !text.includes('Imagen') &&
                    !text.includes('Veo')) {
                    _simulateRealClick(btn);
                    AB_Logger.info('ImageGen', `✅ Clicked output count button: "${text}"`);
                    outputFound = true;
                    await _sleep(400);
                    break;
                }
            }
            if (!outputFound) {
                AB_Logger.warn('ImageGen', `Output count "${outputLabel}" button not found`);
            }

            // ═══ STEP 4: Select model (dropdown) ═══
            // Use the correct model based on mode:
            // - create-image → imageModel
            // - text-to-video / frames-to-video → videoModel
            AB_Logger.info('ImageGen', `Step 4: mode="${projectMode}", imageModel="${imageModel}", videoModel="${videoModel}"`);
            const modelValue = (projectMode === 'create-image') ? imageModel : videoModel;
            if (modelValue) {
                const modelLabel = MODEL_LABELS[modelValue] || modelValue;
                AB_Logger.info('ImageGen', `Step 4: modelValue="${modelValue}" → modelLabel="${modelLabel}"`);
                await _selectModelDropdown(modelLabel);
            } else {
                AB_Logger.info('ImageGen', 'Step 4: No model override for this mode, keeping default');
            }

            // ═══ STEP 5: Close the settings panel by clicking settings button again ═══
            const closeBtn = _findCombinedSettingsButton();
            if (closeBtn && closeBtn.getAttribute('data-state') === 'open') {
                _simulateRealClick(closeBtn);
                AB_Logger.info('ImageGen', 'Clicked settings button to close panel');
            }
            await _sleep(400);

            // Verify by reading the updated button text
            const updatedBtn = _findCombinedSettingsButton();
            if (updatedBtn) {
                const updatedText = updatedBtn.textContent.replace(/\s+/g, ' ').trim();
                AB_Logger.info('ImageGen', `Settings after update: "${updatedText}"`);
            }

            return { success: true, aspectRatio, outputCount };
        } catch (err) {
            AB_Logger.error('ImageGen', 'Failed to configure settings', err.message);
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return { success: false, error: err.message };
        }
    }

    /**
     * Find the combined settings dropdown button.
     * Updated 2026-02-26: Button text is now like "Videocrop_9_16x4"
     * or "Imagecrop_16_9x2" (mode + crop icon + output count).
     */
    function _findCombinedSettingsButton() {
        // Strategy 1: Button with data-state containing crop + output count
        const allBtns = document.querySelectorAll('button[data-state]');
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if ((text.includes('crop_') || text.includes('x1') || text.includes('x2') || text.includes('x3') || text.includes('x4')) &&
                (text.includes('Video') || text.includes('Image') || text.includes('Nano Banana') || text.includes('Imagen') || text.includes('Veo') || text.includes('🍌'))) {
                return btn;
            }
        }

        // Strategy 2: Find by known class pattern
        const byClass = document.querySelector('button[class*="sc-16c4830a"], button[class*="sc-e7a64add"]');
        if (byClass) return byClass;

        // Strategy 3: Broader — any button with crop icon + output count
        const allBtns2 = document.querySelectorAll('button');
        for (const btn of allBtns2) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if (text.includes('crop_') &&
                (text.includes('x1') || text.includes('x2') || text.includes('x3') || text.includes('x4'))) {
                return btn;
            }
        }

        return null;
    }

    /**
     * Select a model from the model dropdown.
     * The model dropdown could be:
     *   - A Radix Select trigger (button with role="combobox")
     *   - A custom styled div/span with a click handler
     *   - A button showing the current model name
     * We search inside the settings popover first, then globally.
     */
    async function _selectModelDropdown(modelLabel) {
        try {
            AB_Logger.info('ImageGen', `=== MODEL SELECTION START: target="${modelLabel}" ===`);

            // Find the settings popover (it's already open from Step 0)
            const popover = document.querySelector('[data-radix-popper-content-wrapper]')
                || document.querySelector('[data-state="open"][role="dialog"]');

            if (!popover) {
                AB_Logger.warn('ImageGen', 'No settings popover found — searching entire document');
            } else {
                AB_Logger.info('ImageGen', `Settings popover found: ${popover.tagName}, children=${popover.children.length}`);
            }

            const searchRoot = popover || document;

            // Helper: strip Material Icons text from button content for cleaner matching
            const stripIcons = (t) => t.replace(/arrow_drop_down|arrow_drop_up|expand_more|expand_less|unfold_more|chevron_right|chevron_left/g, '').trim();

            // ─── Strategy 1: Radix Select / Combobox trigger ───
            let modelBtn = searchRoot.querySelector('button[role="combobox"]');
            if (modelBtn) {
                AB_Logger.info('ImageGen', `Strategy 1: Found combobox button: "${modelBtn.textContent.replace(/\s+/g, ' ').trim()}"`);
            }

            // ─── Strategy 1.5: Button with data-state inside popover containing model name ───
            // This matches the actual Flow DOM: <button data-state="closed">🍌 Nano Banana 2<i>arrow_drop_down</i></button>
            if (!modelBtn && popover) {
                const stateBtns = popover.querySelectorAll('button[data-state]');
                for (const btn of stateBtns) {
                    const rawText = btn.textContent.replace(/\s+/g, ' ').trim();
                    const cleanText = stripIcons(rawText);
                    const hasModel = cleanText.includes('Nano Banana') || cleanText.includes('Imagen') || cleanText.includes('Veo');
                    if (!hasModel) continue;
                    // Skip the mode tabs (Image/Video) and aspect ratio buttons
                    if (cleanText.includes('crop_')) continue;
                    if (btn.getAttribute('role') === 'tab') continue;

                    modelBtn = btn;
                    AB_Logger.info('ImageGen', `Strategy 1.5: Found model button via data-state: "${rawText}" (clean: "${cleanText}")`);
                    break;
                }
            }

            // ─── Strategy 2: Any clickable element with a model name AND short text ───
            if (!modelBtn) {
                const allEls = searchRoot.querySelectorAll('button, [role="combobox"], [role="listbox"], [data-radix-select-trigger], div[tabindex], span[tabindex], [class*="select"], [class*="dropdown"]');
                for (const el of allEls) {
                    const rawText = el.textContent.replace(/\s+/g, ' ').trim();
                    const cleanText = stripIcons(rawText);
                    const hasModel = cleanText.includes('Nano Banana') || cleanText.includes('Imagen') || cleanText.includes('Veo');
                    if (!hasModel) continue;
                    if (cleanText.length > 30) continue;
                    if (cleanText.includes('crop_')) continue;
                    if (el.getAttribute('role') === 'tab') continue;
                    if (cleanText.includes('Image') && cleanText.includes('Video')) continue;

                    modelBtn = el;
                    AB_Logger.info('ImageGen', `Strategy 2: Found model element: tag=${el.tagName}, role=${el.getAttribute('role') || '-'}, text="${cleanText}"`);
                    break;
                }
            }

            // ─── Strategy 3: Look for any element with SVG + model name inside popover ───
            if (!modelBtn && popover) {
                const elems = popover.querySelectorAll('*');
                for (const el of elems) {
                    if (el.children.length > 3) continue;
                    const rawText = el.textContent.replace(/\s+/g, ' ').trim();
                    const cleanText = stripIcons(rawText);
                    const hasModel = cleanText.includes('Nano Banana') || cleanText.includes('Imagen') || cleanText.includes('Veo');
                    if (!hasModel) continue;
                    if (cleanText.length > 30) continue;
                    if (cleanText.includes('crop_')) continue;
                    if (el.getAttribute('role') === 'tab') continue;
                    const isClickable = el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox' ||
                        el.getAttribute('tabindex') !== null || el.style?.cursor === 'pointer' ||
                        el.closest('button') !== null;
                    if (isClickable || el.querySelector('svg') || el.querySelector('i')) {
                        modelBtn = el.closest('button') || el;
                        AB_Logger.info('ImageGen', `Strategy 3: Found via deep search: tag=${modelBtn.tagName}, text="${cleanText}"`);
                        break;
                    }
                }
            }

            // ─── DEBUG: Dump all elements in popover if trigger not found ───
            if (!modelBtn) {
                AB_Logger.warn('ImageGen', '❌ Model dropdown trigger NOT found. Dumping popover contents:');
                if (popover) {
                    const allChildren = popover.querySelectorAll('*');
                    AB_Logger.info('ImageGen', `Popover has ${allChildren.length} elements total`);
                    let count = 0;
                    for (const el of allChildren) {
                        if (el.children.length > 2) continue; // skip deep containers
                        const text = el.textContent.replace(/\s+/g, ' ').trim();
                        if (text.length === 0 || text.length > 60) continue;
                        if (count < 30) { // Limit output
                            AB_Logger.info('ImageGen', `  [${el.tagName}] role=${el.getAttribute('role') || '-'} state=${el.getAttribute('data-state') || '-'} text="${text}"`);
                            count++;
                        }
                    }
                } else {
                    AB_Logger.warn('ImageGen', 'No popover container exists either');
                }
                return;
            }

            // Check if already the right model (strip Material Icons text like 'arrow_drop_down')
            const ICON_WORDS = ['arrow_drop_down', 'arrow_drop_up', 'expand_more', 'expand_less', 'check'];
            const currentText = modelBtn.textContent.replace(/\s+/g, ' ').trim();
            let cleanCurrent = currentText;
            for (const icon of ICON_WORDS) cleanCurrent = cleanCurrent.replace(icon, '');
            cleanCurrent = cleanCurrent.replace(/\s+/g, ' ').trim();
            if (cleanCurrent === modelLabel || cleanCurrent.endsWith(modelLabel)) {
                AB_Logger.info('ImageGen', `Model already set to "${modelLabel}" (current: "${cleanCurrent}") — skipping`);
                return;
            }

            // ─── Click the trigger to open the dropdown ───
            AB_Logger.info('ImageGen', `Clicking model trigger: "${currentText}" → want "${modelLabel}"`);
            _simulateRealClick(modelBtn);
            await _sleep(800);

            // ─── Find and click the target model option ───
            // After clicking, new elements appear. Scan the WHOLE document.
            let clicked = false;

            for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
                // Search for any element matching the target model
                const clickables = document.querySelectorAll(
                    '[role="option"], [role="menuitem"], [role="menuitemradio"], ' +
                    '[data-radix-select-item], [data-value], ' +
                    'button, [tabindex], div[class], span[class]'
                );

                // First pass: look for EXACT match (strip icons from option text too)
                let bestMatch = null;
                let bestMatchType = 'none'; // 'exact' > 'endsWith' > 'includes'
                for (const el of clickables) {
                    if (el === modelBtn) continue;
                    const rawText = el.textContent.replace(/\s+/g, ' ').trim();
                    if (rawText.length > 50) continue; // skip containers
                    let cleanText = rawText;
                    for (const icon of ICON_WORDS) cleanText = cleanText.replace(icon, '');
                    cleanText = cleanText.replace(/[\s🍌]+/g, ' ').trim();

                    if (cleanText === modelLabel) {
                        bestMatch = el;
                        bestMatchType = 'exact';
                        break; // exact match, no need to keep looking
                    } else if (cleanText.endsWith(modelLabel) && bestMatchType !== 'exact') {
                        bestMatch = el;
                        bestMatchType = 'endsWith';
                    } else if (cleanText.includes(modelLabel) && bestMatchType === 'none') {
                        bestMatch = el;
                        bestMatchType = 'includes';
                    }
                }

                if (bestMatch) {
                    const matchText = bestMatch.textContent.replace(/\s+/g, ' ').trim();
                    _simulateRealClick(bestMatch);
                    AB_Logger.info('ImageGen', `✅ Selected model: "${matchText}" (match=${bestMatchType}, tag=${bestMatch.tagName}, role=${bestMatch.getAttribute('role') || '-'})`);
                    clicked = true;
                    await _sleep(400);
                }

                if (!clicked) {
                    AB_Logger.info('ImageGen', `Attempt ${attempt + 1}: no matching option yet, waiting...`);
                    await _sleep(400);
                }
            }

            if (!clicked) {
                AB_Logger.warn('ImageGen', `Could not find option for "${modelLabel}". Closing dropdown.`);
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await _sleep(300);
            }
        } catch (err) {
            AB_Logger.warn('ImageGen', `Model selection failed: ${err.message}`);
        }
    }

    /**
     * Find the submit/create button at the bottom of the settings panel.
     * It shows the current mode + output count like "Video □ x4 →".
     */
    function _findSubmitButton() {
        const allBtns = document.querySelectorAll('button');
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if (text.includes('arrow_forward') && text.includes('Create')) {
                return btn;
            }
        }
        // Fallback: look for a button with the arrow icon
        for (const btn of allBtns) {
            const icon = btn.querySelector('i');
            if (icon && icon.textContent.trim() === 'arrow_forward') {
                return btn;
            }
        }
        return null;
    }

    /**
     * Find a button by its icon text content.
     * Searches both google-symbols and material-icons icon elements.
     */
    function _findButtonByIcon(iconName) {
        const allBtns = document.querySelectorAll('button');
        for (const btn of allBtns) {
            const icon = btn.querySelector('i.google-symbols, i[class*="google-symbols"], i.material-icons, i.material-icons-outlined, i[class*="material"]');
            if (icon && icon.textContent.trim() === iconName) return btn;
        }
        return null;
    }

    /**
     * Attach a reference image from an external URL.
     * Follows the actual Flow UI workflow with verification at every step:
     *   1. Click the "+" ingredient button → VERIFY popout opened
     *   2. Click the "Upload" tile → VERIFY file input appeared
     *   3. Set file on input → VERIFY crop dialog appeared
     *   4. Click "Crop and Save" → VERIFY dialog closed (ingredient attached)
     * @param {string} url - External image URL to use as reference.
     */
    async function attachReferenceFromUrl(url) {
        try {
            if (!url || typeof url !== 'string') {
                throw new Error('No URL provided for reference image');
            }

            AB_Logger.info('ImageGen', `Attaching reference from URL: ${url.substring(0, 80)}...`);

            // ═══ STEP 1: Download the image first (so it's ready when we need it) ═══
            AB_Logger.info('ImageGen', 'Step 1/5: Downloading reference image...');
            const file = await AB_Upload.fetchAsFile(url, 'reference.png');
            AB_Logger.info('ImageGen', `Downloaded: ${file.size} bytes`);

            // ═══ STEP 2: Click "+" button and VERIFY the picker dialog opened ═══
            AB_Logger.info('ImageGen', 'Step 2/5: Opening asset picker...');
            let pickerDialog = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
                // Find + button (text starts with "add", near bottom of page)
                let plusBtn = null;
                for (const btn of document.querySelectorAll('button')) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.height === 0 || rect.width === 0) continue;
                    if (btn.textContent.trim().startsWith('add') && rect.top > window.innerHeight * 0.5) {
                        plusBtn = btn;
                        break;
                    }
                }
                if (!plusBtn) {
                    throw new Error('Could not find the + button');
                }

                AB_Logger.info('ImageGen', `Clicking + button (attempt ${attempt}/3)...`);
                _simulateRealClick(plusBtn);

                // VERIFY: wait for picker dialog with upload button to appear
                for (let check = 0; check < 10; check++) {
                    await _sleep(500);
                    for (const d of document.querySelectorAll('[role="dialog"]')) {
                        if (d.textContent.includes('Search for Assets') || d.textContent.includes('Recently Used')) {
                            pickerDialog = d;
                            break;
                        }
                    }
                    if (pickerDialog) break;
                }
                if (pickerDialog) {
                    AB_Logger.info('ImageGen', 'Asset picker dialog opened');
                    break;
                }
                AB_Logger.warn('ImageGen', `Picker did not open on attempt ${attempt}, retrying...`);
                await _sleep(500);
            }

            if (!pickerDialog) {
                throw new Error('Asset picker dialog did not open after 3 attempts');
            }

            // ═══ STEP 3: Click upload icon in picker header and VERIFY file input ═══
            AB_Logger.info('ImageGen', 'Step 3/5: Clicking upload icon in picker...');
            // The upload icon is a button inside the picker with upload/cloud_upload icon
            let uploadBtn = null;
            for (const btn of pickerDialog.querySelectorAll('button')) {
                const text = btn.textContent.trim();
                const aria = btn.getAttribute('aria-label') || '';
                if (text.includes('upload') || text.includes('cloud_upload') ||
                    aria.toLowerCase().includes('upload')) {
                    uploadBtn = btn;
                    break;
                }
            }

            if (!uploadBtn) {
                // Fallback: find any clickable element with upload-related text/icon in header area
                const headerBtns = pickerDialog.querySelectorAll('button, [role="button"]');
                for (const btn of headerBtns) {
                    const rect = btn.getBoundingClientRect();
                    // Upload icon is typically small and in the header area
                    if (rect.width > 0 && rect.width < 60 && rect.height > 0 && rect.height < 60) {
                        const text = btn.textContent.trim().toLowerCase();
                        if (text.includes('upload') || text === '' || btn.querySelector('svg')) {
                            // Candidate — check if it's near the top of the picker
                            const pickerRect = pickerDialog.getBoundingClientRect();
                            if (rect.top < pickerRect.top + 60) {
                                uploadBtn = btn;
                                AB_Logger.info('ImageGen', `Found upload candidate: text="${btn.textContent.trim()}" at top of picker`);
                                break;
                            }
                        }
                    }
                }
            }

            if (!uploadBtn) {
                throw new Error('Upload button not found in picker dialog');
            }

            _simulateRealClick(uploadBtn);

            // VERIFY: wait for file input[type="file"] to appear
            let fileInput = null;
            for (let check = 0; check < 10; check++) {
                await _sleep(500);
                fileInput = document.querySelector('input[type="file"]');
                if (fileInput) {
                    AB_Logger.info('ImageGen', 'File input found');
                    break;
                }
            }

            if (!fileInput) {
                throw new Error('File input did not appear after clicking Upload tile');
            }

            // ═══ STEP 4: Set file on input and VERIFY crop dialog appeared ═══
            AB_Logger.info('ImageGen', 'Step 4/5: Setting file on input...');
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));

            // VERIFY: wait for "Crop and Save" button to appear (proves crop dialog is open)
            let cropBtn = null;
            AB_Logger.info('ImageGen', 'Waiting for crop dialog to appear...');
            for (let check = 0; check < 20; check++) {
                await _sleep(1000);
                cropBtn = _findButtonByText('Crop and Save');
                if (cropBtn) {
                    AB_Logger.info('ImageGen', '"Crop and Save" button found — crop dialog is ready');
                    break;
                }
            }

            if (!cropBtn) {
                throw new Error('Crop dialog did not appear (no "Crop and Save" button found)');
            }

            // ═══ STEP 5: Click "Crop and Save" and VERIFY the dialog closed ═══
            AB_Logger.info('ImageGen', 'Step 5/5: Clicking "Crop and Save"...');
            cropBtn.click();

            // VERIFY: wait for "Crop and Save" to disappear (proves upload is fully done)
            let cropGone = false;
            for (let check = 0; check < 15; check++) {
                await _sleep(1000);
                const stillThere = _findButtonByText('Crop and Save');
                if (!stillThere) {
                    cropGone = true;
                    AB_Logger.info('ImageGen', 'Crop dialog closed — ingredient attached');
                    break;
                }
            }

            if (!cropGone) {
                AB_Logger.warn('ImageGen', '"Crop and Save" button still visible — clicking again...');
                const retryBtn = _findButtonByText('Crop and Save');
                if (retryBtn) retryBtn.click();
                await _sleep(3000);
            }

            // Extra wait to let Flow finalize the ingredient
            await _sleep(2000);

            AB_Logger.info('ImageGen', '✅ Reference image attached from URL successfully');
            return { success: true, method: 'url-upload' };

        } catch (err) {
            AB_Logger.error('ImageGen', `Reference from URL failed: ${err.message}`);
            // Try to close any open dialogs/popouts
            try {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await _sleep(500);
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            } catch (_) { }
            return { success: false, error: err.message };
        }
    }

    /**
     * Find a button element by its text content (case-insensitive partial match).
     * Checks <button> elements and role="button" elements.
     */
    function _findButtonByText(text) {
        const lowerText = text.toLowerCase();
        // Check actual <button> elements
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim().toLowerCase().includes(lowerText)) {
                return btn;
            }
        }
        // Check role="button" elements
        const roleButtons = document.querySelectorAll('[role="button"]');
        for (const btn of roleButtons) {
            if (btn.textContent.trim().toLowerCase().includes(lowerText)) {
                return btn;
            }
        }
        return null;
    }

    /**
     * Find any clickable element (button, div, span, etc.) by text content.
     * Used for finding the Upload tile which may not be a <button>.
     */
    function _findClickableByText(text) {
        const lowerText = text.toLowerCase();
        // Try button first
        const btn = _findButtonByText(text);
        if (btn) return btn;
        // Try any clickable-looking element
        const all = document.querySelectorAll('div, span, a, label');
        for (const el of all) {
            const elText = el.textContent.trim().toLowerCase();
            // Match elements where the DIRECT text starts with the target
            // (avoid matching parents that contain the text in children)
            if (el.childElementCount <= 3 && elText.startsWith(lowerText)) {
                return el;
            }
        }
        return null;
    }

    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    return {
        enterPrompt, setAspectRatio, configureSettings,
        attachReferenceAddToPrompt, attachReferenceUpload, attachReference,
        attachReferenceFromUrl,
        clickGenerate, waitForResult, getGeneratedImageCount,
        clickRetryIcon, clickReusePromptButton,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_ImageGen = AB_ImageGen;
}
