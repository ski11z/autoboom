/**
 * AutoBoom — Image Phase
 * Handles sequential image generation for Frames-to-Video mode.
 * Extracted from orchestrator.js during code splitting.
 */

const AB_ImagePhase = (() => {
    const MODULE = 'Orchestrator';

    async function run() {
        const H = AB_PhaseHelpers;
        const project = H.getProject();
        const progress = H.getProgress();
        const maxRetries = project.settings.maxRetries;

        AB_Logger.info(MODULE, `Image phase: ${progress.totalImages} images to generate`);

        // Determine starting index (for resume support)
        let startIdx = 0;
        for (let i = 0; i < progress.imageResults.length; i++) {
            if (progress.imageResults[i].status === AB_CONSTANTS.IMAGE_STATUS.READY) {
                startIdx = i + 1;
            } else {
                break;
            }
        }

        for (let i = startIdx; i < progress.totalImages; i++) {
            if (await H.shouldStop()) return;

            progress.currentIndex = i;
            progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.GENERATING;
            await AB_Storage.saveJobProgress(progress);
            H.broadcastState();

            // Stealth: per-image progress (images span 10% → 50%)
            const imgPct = Math.round(10 + (40 * i / progress.totalImages));
            await H.updateStealth({
                phase: 'images',
                step: `Generating image ${i + 1}/${progress.totalImages}...`,
                progress: imgPct,
                current: i + 1,
                total: progress.totalImages
            });

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    // Step 2: Enter prompt
                    await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, { prompt: project.imagePrompts[i] });

                    // Step 3: Attach reference (for images after the first)
                    if (i > 0) {
                        const refMethod = project.settings.referenceMethod;
                        let refResult;

                        if (refMethod === 'auto' || refMethod === 'add-to-prompt') {
                            refResult = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_ADD_TO_PROMPT, { imageIndex: -1 });
                        }

                        if (!refResult?.success && (refMethod === 'auto' || refMethod === 'upload')) {
                            AB_Logger.info(MODULE, 'Add-to-Prompt failed, trying upload fallback');
                            refResult = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_UPLOAD, { imageIndex: -1 });
                        }

                        if (!refResult?.success) {
                            throw new Error(`Failed to attach reference for image ${i}`);
                        }
                    }

                    // Step 4: Generate
                    await H.sendAction(AB_ACTIONS.CLICK_GENERATE);

                    // Step 5: Wait for result
                    const result = await H.sendAction(AB_ACTIONS.WAIT_IMAGE_COMPLETE, {
                        timeout: project.settings.imageTimeout,
                    });

                    if (!result?.success) {
                        throw new Error(result?.error || 'Image generation failed');
                    }

                    // Mark as complete
                    progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.READY;
                    progress.imageResults[i].completedAt = Date.now();
                    progress.retryCount = 0;
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.info(MODULE, `Image ${i + 1}/${progress.totalImages} complete`);
                    success = true;

                    // Stealth: image complete
                    const donePct = Math.round(10 + (40 * (i + 1) / progress.totalImages));
                    await H.updateStealth({
                        phase: 'images',
                        step: `Image ${i + 1}/${progress.totalImages} complete ✓`,
                        progress: donePct,
                        current: i + 1,
                        total: progress.totalImages
                    });

                } catch (err) {
                    retries++;
                    progress.retryCount = retries;
                    progress.lastError = err.message;
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.warn(MODULE, `Image ${i + 1} attempt ${retries} failed: ${err.message}`);

                    if (retries > maxRetries) {
                        progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.ERROR;
                        AB_Logger.error(MODULE, `Image ${i + 1} failed after ${maxRetries} retries — skipping`);
                        break; // skip to next image instead of halting
                    }

                    // Wait before retry (exponential backoff)
                    await H.retryDelay(retries);
                }
            }
        }

        AB_Logger.info(MODULE, 'Image phase complete');
    }

    return { run };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_ImagePhase = AB_ImagePhase;
}
