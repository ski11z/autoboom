/**
 * AutoBoom — Video Generation Actions
 * Performs DOM actions for the Frames-to-Video workflow.
 * Uses "Start" and "End" buttons near the prompt area to attach frames via the asset picker.
 */

const AB_VideoGen = (() => {

    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

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
     * Select Frames-to-Video mode via the editor dropdown.
     */
    async function selectF2VMode() {
        try {
            const success = await AB_Navigation.selectFramesToVideo();
            if (!success) throw new Error('Failed to switch to Frames to Video mode');
            return { success: true };
        } catch (err) {
            AB_Logger.error('VideoGen', 'Failed to select F2V mode', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Attach a frame by clicking the "Start" or "End" button near the prompt,
     * then selecting the image from the asset picker dialog.
     * Images in the picker are ordered OLD → NEW (index 0 = oldest = first generated).
     * @param {'Start'|'End'} frameType - Which frame button to click
     * @param {number} imageIndex - Index of the image to select (0 = first/oldest)
     */
    async function attachFrame(frameType, imageIndex) {
        try {
            AB_Logger.info('VideoGen', `Attaching ${frameType} frame: image index ${imageIndex}`);

            // Step 1: Find the "Start" or "End" element near the prompt area
            // NOTE: These are <div> elements, NOT <button> elements!
            let frameBtn = null;
            const allEls = document.querySelectorAll('button, div, [role="button"]');
            for (const el of allEls) {
                const text = el.textContent.replace(/\s+/g, ' ').trim();
                const rect = el.getBoundingClientRect();
                if (rect.height === 0 || rect.width === 0) continue;
                // Match exact "Start" or "End" text, ~50x50 size, near bottom of page
                if (text === frameType && rect.top > window.innerHeight * 0.3 && rect.width <= 80 && rect.height <= 80) {
                    frameBtn = el;
                    break;
                }
            }

            if (!frameBtn) {
                throw new Error(`"${frameType}" frame button not found near prompt area`);
            }

            AB_Logger.info('VideoGen', `Clicking "${frameType}" button...`);
            _simulateRealClick(frameBtn);
            await _sleep(2000);

            // Step 2: Find the asset picker dialog
            let pickerDialog = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                for (const d of document.querySelectorAll('[role="dialog"]')) {
                    if (d.textContent.includes('Recently Used') || d.textContent.includes('Search for Assets')) {
                        pickerDialog = d;
                        break;
                    }
                }
                if (pickerDialog) break;
                AB_Logger.debug('VideoGen', `Waiting for picker dialog... attempt ${attempt + 1}`);
                await _sleep(800);
            }

            if (!pickerDialog) {
                throw new Error('Asset picker dialog not found after clicking frame button');
            }

            AB_Logger.info('VideoGen', 'Asset picker dialog found');

            // Step 2.5: Sort by "Oldest" to ensure consistent ordering
            // The sort dropdown is in the top-right of the picker dialog
            try {
                // Find the sort dropdown button (contains text like "Recently Used", "Newest", "Oldest", etc.)
                let sortDropdown = null;
                for (const el of pickerDialog.querySelectorAll('button, [role="combobox"], [role="listbox"], div')) {
                    const text = el.textContent.replace(/\s+/g, ' ').trim();
                    const rect = el.getBoundingClientRect();
                    if (rect.height === 0 || rect.width === 0) continue;
                    // The dropdown shows one of: "Recently Used", "Most Used", "Newest", "Oldest"
                    if (['Recently Used', 'Most Used', 'Newest', 'Oldest'].includes(text) && rect.width >= 60) {
                        sortDropdown = el;
                        break;
                    }
                }

                if (sortDropdown) {
                    const currentSort = sortDropdown.textContent.replace(/\s+/g, ' ').trim();
                    if (currentSort !== 'Oldest') {
                        AB_Logger.info('VideoGen', `Sort is "${currentSort}", switching to "Oldest"...`);
                        _simulateRealClick(sortDropdown);
                        await _sleep(800);

                        // Find and click "Oldest" option in the dropdown menu
                        let oldestOption = null;
                        for (const el of document.querySelectorAll('[role="option"], [role="menuitem"], li, div')) {
                            const text = el.textContent.replace(/\s+/g, ' ').trim();
                            const rect = el.getBoundingClientRect();
                            if (rect.height === 0 || rect.width === 0) continue;
                            if (text === 'Oldest') {
                                oldestOption = el;
                                break;
                            }
                        }

                        if (oldestOption) {
                            _simulateRealClick(oldestOption);
                            AB_Logger.info('VideoGen', '✅ Sorted by "Oldest"');
                            await _sleep(1000); // Wait for list to re-sort
                        } else {
                            AB_Logger.warn('VideoGen', '"Oldest" option not found in dropdown');
                        }
                    } else {
                        AB_Logger.info('VideoGen', 'Already sorted by "Oldest" ✓');
                    }
                } else {
                    AB_Logger.warn('VideoGen', 'Sort dropdown not found in picker');
                }
            } catch (sortErr) {
                AB_Logger.warn('VideoGen', 'Sort step failed (non-fatal):', sortErr.message);
            }

            // Step 3: Find asset items by their small thumbnail images (~40x40)
            const assetItems = [];
            for (const img of pickerDialog.querySelectorAll('img')) {
                const rect = img.getBoundingClientRect();
                if (rect.width >= 20 && rect.width <= 80 && rect.height >= 20 && rect.height <= 80) {
                    const row = img.parentElement?.closest('div[class]') || img.parentElement;
                    if (row && row.getBoundingClientRect().height > 0) {
                        assetItems.push({ element: row, name: row.textContent.trim() });
                    }
                }
            }

            AB_Logger.info('VideoGen', `Found ${assetItems.length} items in picker: ${assetItems.map(a => a.name).join(', ')}`);

            if (assetItems.length === 0) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                throw new Error('No asset items found in picker');
            }

            // Step 4: Select the target image
            // Images are ordered OLD → NEW (index 0 = first/oldest = top of picker)
            const idx = Math.min(imageIndex, assetItems.length - 1);
            AB_Logger.info('VideoGen', `Clicking asset "${assetItems[idx].name}" (index ${idx}) for ${frameType} frame`);
            _simulateRealClick(assetItems[idx].element);
            await _sleep(1500);

            AB_Logger.info('VideoGen', `✅ ${frameType} frame attached: "${assetItems[idx].name}"`);
            return { success: true, method: 'frame-button-picker', assetName: assetItems[idx].name };
        } catch (err) {
            AB_Logger.error('VideoGen', `Failed to attach ${frameType} frame`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Attach the start frame by clicking "Start" button → picker → select image.
     * @param {number} imageIndex - Index of the image (0 = oldest/first)
     */
    async function attachStartFrame(imageIndex) {
        AB_Logger.info('VideoGen', `Attaching START frame: image ${imageIndex}`);
        return attachFrame('Start', imageIndex);
    }

    /**
     * Attach the end frame by clicking "End" button → picker → select image.
     * @param {number} imageIndex - Index of the image (0 = oldest/first)
     */
    async function attachEndFrame(imageIndex) {
        AB_Logger.info('VideoGen', `Attaching END frame: image ${imageIndex}`);
        return attachFrame('End', imageIndex);
    }

    /**
     * Count completed videos on the Videos tab.
     * Completed videos have a <video> element with a src.
     */
    async function countCompletedVideos() {
        const videos = document.querySelectorAll('video[src], video source[src]');
        let count = 0;
        for (const el of videos) {
            const src = el.src || el.getAttribute('src') || '';
            if (src && !src.startsWith('blob:')) count++;
        }
        // Also count blob videos (Flow uses blob URLs)
        const allVideos = document.querySelectorAll('video');
        return allVideos.length;
    }

    /**
     * Count in-progress (pending) videos — those still rendering.
     * In-progress videos show a percentage (e.g. "19%") but have no
     * playable <video> element. We look for cards/containers that
     * contain percentage text but no <video> tag.
     */
    async function countPendingVideos() {
        // Strategy: Find all output cards on the Videos tab.
        // A card is "pending" if it has text matching a percentage pattern
        // and does NOT contain a <video> element.
        // Flow renders video outputs as cards; pending ones show "XX%".
        let pending = 0;
        let completed = 0;

        // Look for all output containers (Flow uses various card elements)
        // Try multiple selectors since Flow's DOM can vary
        const cards = document.querySelectorAll(
            '[data-testid*="video"], [class*="video-card"], [class*="output-card"], ' +
            '.generation-card, .media-card, .output-item'
        );

        if (cards.length > 0) {
            for (const card of cards) {
                const hasVideo = card.querySelector('video');
                if (hasVideo) {
                    completed++;
                } else {
                    pending++;
                }
            }
        } else {
            // Fallback: scan the whole page for percentage indicators
            // that indicate a video is being generated
            const allText = document.body.innerText;
            const pctMatches = allText.match(/\b\d{1,2}%/g);
            const videoCount = document.querySelectorAll('video').length;

            // If we see percentage numbers, those are likely pending videos
            if (pctMatches && pctMatches.length > 0) {
                // Estimate: each percentage = one pending video
                // Subtract any that might be UI elements (progress bars etc)
                pending = pctMatches.length;
            }
            completed = videoCount;
        }

        return { pending, completed, total: pending + completed };
    }

    /**
     * Get download URLs for all completed videos on the Videos tab.
     * Handles virtual scrolling by scrolling incrementally and collecting
     * video URLs at each scroll position, then deduplicating.
     */
    async function getVideoDownloadUrls() {
        // Wait for videos tab to render
        await new Promise(r => setTimeout(r, 1000));

        // Find the scrollable container
        const scrollable = _findScrollableContainer();
        AB_Logger.info('VideoGen', `Scrollable container: ${scrollable ? scrollable.tagName + '.' + (scrollable.className || '').substring(0, 30) : 'window'}`);

        // Accumulated unique video URLs (keyed by URL to deduplicate)
        const urlMap = new Map();

        // Helper: collect all currently visible video URLs
        function collectVisibleVideos() {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                let src = video.currentSrc || video.src || '';
                if (!src) {
                    const source = video.querySelector('source');
                    if (source) src = source.src || source.getAttribute('src') || '';
                }
                if (!src) {
                    src = video.dataset?.src || video.getAttribute('data-src') || '';
                }
                if (src && !urlMap.has(src)) {
                    urlMap.set(src, { index: urlMap.size, src });
                }
            });
        }

        if (scrollable) {
            // 1) Scroll to the very top first
            scrollable.scrollTop = 0;
            await new Promise(r => setTimeout(r, 800));
            collectVisibleVideos();
            AB_Logger.info('VideoGen', `After scroll-to-top: ${urlMap.size} unique videos`);

            // 2) Scroll down incrementally
            const scrollStep = 300; // px per step
            const maxSteps = 50;
            let prevScrollTop = -1;

            for (let step = 0; step < maxSteps; step++) {
                scrollable.scrollTop += scrollStep;
                await new Promise(r => setTimeout(r, 400));

                collectVisibleVideos();

                // Check if we've reached the bottom (scrollTop didn't change)
                if (scrollable.scrollTop === prevScrollTop) {
                    break;
                }
                prevScrollTop = scrollable.scrollTop;
            }
        } else {
            // Fallback: try window scroll
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 800));
            collectVisibleVideos();

            const scrollStep = 300;
            const maxSteps = 50;
            let prevY = -1;

            for (let step = 0; step < maxSteps; step++) {
                window.scrollBy(0, scrollStep);
                await new Promise(r => setTimeout(r, 400));

                collectVisibleVideos();

                if (window.scrollY === prevY) break;
                prevY = window.scrollY;
            }
        }

        // Convert map to sorted array
        const results = Array.from(urlMap.values()).map((v, i) => ({ index: i, src: v.src }));

        AB_Logger.info('VideoGen', `Total unique video URLs collected: ${results.length}`);
        return { success: true, videos: results, count: results.length };
    }

    /**
     * Find the main scrollable container on the page.
     */
    function _findScrollableContainer() {
        // Try common scrollable ancestors
        const candidates = document.querySelectorAll('main, [role="main"], [class*="scroll"], [class*="content"], [class*="panel"], [class*="feed"]');
        for (const el of candidates) {
            if (el.scrollHeight > el.clientHeight + 50) {
                return el;
            }
        }
        // Try all elements with overflow auto/scroll
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const style = window.getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight + 100) {
                return el;
            }
        }
        return null;
    }

    /**
     * Get a single video download URL by index.
     */
    async function getVideoDownloadUrl(index = 0) {
        const allVideos = document.querySelectorAll('video');
        if (index >= allVideos.length) {
            return { success: false, error: `Video index ${index} out of range (${allVideos.length} videos)` };
        }

        const video = allVideos[index];
        let src = video.src || '';
        if (!src) {
            const source = video.querySelector('source');
            if (source) src = source.src || source.getAttribute('src') || '';
        }

        if (!src) {
            return { success: false, error: `No src found for video ${index}` };
        }

        return { success: true, url: src, index };
    }

    /**
     * Click the "Reuse prompt" button on a failed video to repopulate the prompt area.
     * This is used as a recovery mechanism when a video generation fails.
     * After clicking, the prompt text and frame attachments are restored by Flow.
     */
    async function clickReusePrompt() {
        try {
            // Look for "Reuse prompt" or "Reuse Prompt" button
            let reuseBtn = null;
            const allBtns = document.querySelectorAll('button');
            for (const btn of allBtns) {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                if (text.toLowerCase().includes('reuse prompt') || text.toLowerCase().includes('reuse')) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.height > 0 && rect.width > 0) {
                        reuseBtn = btn;
                        break;
                    }
                }
            }

            if (!reuseBtn) {
                AB_Logger.warn('VideoGen', 'No "Reuse prompt" button found on page');
                return { success: false, error: 'Reuse prompt button not found' };
            }

            // Scroll into view and click
            reuseBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
            await _sleep(500);
            reuseBtn.click();
            AB_Logger.info('VideoGen', 'Clicked "Reuse prompt" button');

            // Wait for the prompt area to be repopulated
            await _sleep(2000);

            return { success: true };
        } catch (err) {
            AB_Logger.error('VideoGen', 'Failed to click Reuse prompt', err.message);
            return { success: false, error: err.message };
        }
    }

    return {
        selectF2VMode, attachFrame, attachStartFrame, attachEndFrame,
        clickReusePrompt,
        countCompletedVideos, countPendingVideos,
        getVideoDownloadUrls, getVideoDownloadUrl,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_VideoGen = AB_VideoGen;
}
