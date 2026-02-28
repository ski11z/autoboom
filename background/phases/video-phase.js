/**
 * AutoBoom — Video Phase
 * Handles video submission for Frames-to-Video mode (both normal and single-image modes).
 * Includes transition pair videos and optional extra animation.
 *
 * Updated 2026-02-26: Removed old tab navigation (SWITCH_TO_IMAGES_TAB, SELECT_FRAMES_TO_VIDEO)
 * and redundant CONFIGURE_SETTINGS calls. Settings (Video → Frames → aspect → output count)
 * are now configured by the orchestrator before this phase runs.
 * Uses unified ENTER_IMAGE_PROMPT + CLICK_GENERATE instead of video-specific actions.
 */

const AB_VideoPhase = (() => {
    const MODULE = 'Orchestrator';

    async function run() {
        const H = AB_PhaseHelpers;
        const project = H.getProject();
        const progress = H.getProgress();
        const maxRetries = project.settings.maxRetries;
        const totalImages = progress.totalImages;
        const animPrompts = project.animationPrompts || [];

        // ─── SINGLE IMAGE MODE ───
        if (project.singleImageMode) {
            await _runSingleImageMode(project, progress, maxRetries, totalImages, animPrompts);
            return;
        }

        // ─── NORMAL MODE (image pairs) ───
        await _runNormalMode(project, progress, maxRetries, totalImages, animPrompts);
    }

    // ─── Single Image Mode: each animation uses one image only ───

    async function _runSingleImageMode(project, progress, maxRetries, totalImages, animPrompts) {
        const H = AB_PhaseHelpers;
        const totalVideos = animPrompts.length;

        if (totalVideos === 0) {
            AB_Logger.info(MODULE, 'Single Image Mode: no animation prompts — skipping video phase');
            return;
        }

        AB_Logger.info(MODULE, `Single Image Mode: ${totalVideos} videos to submit (each using first image only)`);

        for (let i = 0; i < totalVideos; i++) {
            if (await H.shouldStop()) return;

            // ─── THROTTLE: 5-video concurrent limit ───
            if (i >= 5) await H.waitForVideoSlot(i, totalVideos);

            const imageDomIndex = i;
            AB_Logger.info(MODULE, `Single Image video ${i + 1}/${totalVideos}: Image ${i + 1} (picker index: ${imageDomIndex}) + Prompt "${animPrompts[i].substring(0, 40)}..."`);

            if (progress.videoResults[i]) {
                progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.GENERATING;
            }
            progress.currentIndex = i;
            await AB_Storage.saveJobProgress(progress);
            H.broadcastState();

            // Stealth: per-video progress
            const simPct = Math.round(55 + (40 * i / totalVideos));
            await H.updateStealth({
                phase: 'videos',
                step: `Submitting video ${i + 1}/${totalVideos}...`,
                progress: simPct,
                current: i + 1,
                total: totalVideos
            });

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    let reuseWorked = false;

                    if (retries > 0) {
                        AB_Logger.info(MODULE, `Single Image video ${i + 1}: retry ${retries} — trying Reuse prompt shortcut`);
                        try {
                            const reuseResult = await H.sendAction(AB_ACTIONS.CLICK_REUSE_PROMPT);
                            if (reuseResult?.success) {
                                AB_Logger.info(MODULE, `Reuse prompt clicked — submitting`);
                                reuseWorked = true;
                            }
                        } catch (e) {
                            AB_Logger.warn(MODULE, `Reuse prompt shortcut failed: ${e.message} — falling back to full flow`);
                        }
                    }

                    if (!reuseWorked) {
                        // Settings (Video → Frames → aspect ratio → output count) are already
                        // configured by the orchestrator's CONFIGURE_SETTINGS step.

                        // Step 1: Attach start frame
                        const startResult = await H.sendAction(AB_ACTIONS.ATTACH_START_FRAME, { imageIndex: imageDomIndex });
                        if (!startResult?.success) throw new Error(startResult?.error || 'Failed to attach frame');

                        // Step 2: Enter video prompt (same Slate editor)
                        const promptResult = await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, {
                            prompt: animPrompts[i],
                        });
                        if (!promptResult?.success) throw new Error(promptResult?.error || 'Failed to enter prompt');
                        await H.sleep(1000);
                    }

                    // Step 3: Click Create (same unified button)
                    const genResult = await H.sendAction(AB_ACTIONS.CLICK_GENERATE);
                    if (!genResult?.success) throw new Error(genResult?.error || 'Failed to click Create');
                    await H.sleep(3000);

                    if (progress.videoResults[i]) {
                        progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.SUBMITTED;
                        progress.videoResults[i].completedAt = Date.now();
                    }
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.info(MODULE, `Single Image video ${i + 1}/${totalVideos} submitted`);
                    success = true;

                    // Stealth: video submitted
                    const simDonePct = Math.round(55 + (40 * (i + 1) / totalVideos));
                    await H.updateStealth({
                        phase: 'videos',
                        step: `Video ${i + 1}/${totalVideos} submitted ✓`,
                        progress: simDonePct,
                        current: i + 1,
                        total: totalVideos
                    });

                } catch (err) {
                    retries++;
                    progress.lastError = err.message;
                    await AB_Storage.saveJobProgress(progress);
                    AB_Logger.warn(MODULE, `Single Image video ${i + 1} attempt ${retries} failed: ${err.message}`);

                    if (retries > maxRetries) {
                        if (progress.videoResults[i]) {
                            progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.ERROR;
                        }
                        AB_Logger.error(MODULE, `Single Image video ${i + 1} failed after ${maxRetries} retries: ${err.message} — skipping to next`);
                        await AB_Storage.saveJobProgress(progress);
                        break;
                    }

                    await H.retryDelay(retries);
                }
            }
        }

        AB_Logger.info(MODULE, 'Single Image Mode: video phase complete — all videos submitted');
    }

    // ─── Normal Mode: transition pairs ───

    async function _runNormalMode(project, progress, maxRetries, totalImages, animPrompts) {
        const H = AB_PhaseHelpers;
        const transitionCount = totalImages - 1;
        const hasExtraAnimation = animPrompts.length > transitionCount;
        const totalVideos = transitionCount + (hasExtraAnimation ? 1 : 0);

        if (totalVideos === 0) {
            AB_Logger.info(MODULE, 'No videos to generate (only 1 image or no animation prompts)');
            return;
        }

        AB_Logger.info(MODULE, `Video phase: ${transitionCount} transitions${hasExtraAnimation ? ' + 1 extra' : ''} to submit`);

        // ─── Submit transition videos (image pairs) ───
        for (let i = 0; i < transitionCount; i++) {
            if (await H.shouldStop()) return;

            // ─── THROTTLE: 5-video concurrent limit ───
            if (i >= 5) await H.waitForVideoSlot(i, totalVideos);

            const startDomIndex = i;
            const endDomIndex = i + 1;

            AB_Logger.info(MODULE, `Video ${i + 1}/${totalVideos}: Photo ${i + 1} → Photo ${i + 2} (picker: ${startDomIndex} → ${endDomIndex})`);

            if (progress.videoResults[i]) {
                progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.GENERATING;
            }
            progress.currentIndex = i;
            await AB_Storage.saveJobProgress(progress);
            H.broadcastState();

            // Stealth: per-video progress
            const vidPct = Math.round(55 + (40 * i / totalVideos));
            await H.updateStealth({
                phase: 'videos',
                step: `Submitting transition ${i + 1}/${totalVideos}...`,
                progress: vidPct,
                current: i + 1,
                total: totalVideos
            });

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    let reuseWorked = false;

                    if (retries > 0) {
                        AB_Logger.info(MODULE, `Video ${i + 1}: retry ${retries} — trying Reuse prompt shortcut`);
                        try {
                            const reuseResult = await H.sendAction(AB_ACTIONS.CLICK_REUSE_PROMPT);
                            if (reuseResult?.success) {
                                AB_Logger.info(MODULE, `Reuse prompt clicked — submitting`);
                                reuseWorked = true;
                            }
                        } catch (e) {
                            AB_Logger.warn(MODULE, `Reuse prompt shortcut failed: ${e.message} — falling back to full flow`);
                        }
                    }

                    if (!reuseWorked) {
                        // Settings (Video → Frames → aspect ratio → output count) are already
                        // configured by the orchestrator's CONFIGURE_SETTINGS step.

                        // Step 1: Attach start frame
                        const startResult = await H.sendAction(AB_ACTIONS.ATTACH_START_FRAME, { imageIndex: startDomIndex });
                        if (!startResult?.success) throw new Error(startResult?.error || 'Failed to attach start frame');

                        // Step 2: Attach end frame
                        const endResult = await H.sendAction(AB_ACTIONS.ATTACH_END_FRAME, { imageIndex: endDomIndex });
                        if (!endResult?.success) throw new Error(endResult?.error || 'Failed to attach end frame');

                        // Step 3: Enter video prompt (same Slate editor)
                        const promptResult = await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, {
                            prompt: animPrompts[i],
                        });
                        if (!promptResult?.success) throw new Error(promptResult?.error || 'Failed to enter prompt');
                        await H.sleep(1000);
                    }

                    // Step 4: Click Create (same unified button)
                    const genResult = await H.sendAction(AB_ACTIONS.CLICK_GENERATE);
                    if (!genResult?.success) throw new Error(genResult?.error || 'Failed to click Create');
                    await H.sleep(3000);

                    if (progress.videoResults[i]) {
                        progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.SUBMITTED;
                        progress.videoResults[i].completedAt = Date.now();
                    }
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.info(MODULE, `Video ${i + 1}/${totalVideos} submitted`);
                    success = true;

                    // Stealth: video submitted
                    const vidDonePct = Math.round(55 + (40 * (i + 1) / totalVideos));
                    await H.updateStealth({
                        phase: 'videos',
                        step: `Transition ${i + 1}/${totalVideos} submitted ✓`,
                        progress: vidDonePct,
                        current: i + 1,
                        total: totalVideos
                    });

                } catch (err) {
                    retries++;
                    if (progress.videoResults[i]) {
                        progress.videoResults[i].retryCount = retries;
                    }
                    progress.lastError = err.message;
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.warn(MODULE, `Video ${i + 1} attempt ${retries} failed: ${err.message}`);

                    if (retries > maxRetries) {
                        if (progress.videoResults[i]) {
                            progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.ERROR;
                        }
                        AB_Logger.error(MODULE, `Video ${i + 1} failed after ${maxRetries} retries: ${err.message} — skipping to next`);
                        await AB_Storage.saveJobProgress(progress);
                        break;
                    }

                    await H.retryDelay(retries);
                }
            }
        }

        // ─── Submit extra animation (single image, last photo) ───
        if (hasExtraAnimation) {
            if (await H.shouldStop()) return;

            await H.waitForVideoSlot(transitionCount, totalVideos);

            const extraIndex = transitionCount;
            const lastPhotoDomIndex = totalImages - 1;

            AB_Logger.info(MODULE, `Extra video ${totalVideos}/${totalVideos}: Photo ${totalImages} only (picker index: ${lastPhotoDomIndex})`);

            if (progress.videoResults[extraIndex]) {
                progress.videoResults[extraIndex].status = AB_CONSTANTS.VIDEO_STATUS.GENERATING;
            }
            progress.currentIndex = extraIndex;
            await AB_Storage.saveJobProgress(progress);
            H.broadcastState();

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    let reuseWorked = false;

                    if (retries > 0) {
                        AB_Logger.info(MODULE, `Extra video: retry ${retries} — trying Reuse prompt shortcut`);
                        try {
                            const reuseResult = await H.sendAction(AB_ACTIONS.CLICK_REUSE_PROMPT);
                            if (reuseResult?.success) {
                                AB_Logger.info(MODULE, `Reuse prompt clicked — submitting`);
                                reuseWorked = true;
                            }
                        } catch (e) {
                            AB_Logger.warn(MODULE, `Reuse prompt shortcut failed: ${e.message} — falling back to full flow`);
                        }
                    }

                    if (!reuseWorked) {
                        // Step 1: Attach start frame only (no end frame for extra animation)
                        const startResult = await H.sendAction(AB_ACTIONS.ATTACH_START_FRAME, { imageIndex: lastPhotoDomIndex });
                        if (!startResult?.success) throw new Error(startResult?.error || 'Failed to attach frame');

                        // Step 2: Enter prompt (same Slate editor)
                        const promptResult = await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, {
                            prompt: animPrompts[extraIndex],
                        });
                        if (!promptResult?.success) throw new Error(promptResult?.error || 'Failed to enter prompt');
                        await H.sleep(1000);
                    }

                    // Step 3: Click Create (same unified button)
                    const genResult = await H.sendAction(AB_ACTIONS.CLICK_GENERATE);
                    if (!genResult?.success) throw new Error(genResult?.error || 'Failed to click Create');
                    await H.sleep(3000);

                    if (progress.videoResults[extraIndex]) {
                        progress.videoResults[extraIndex].status = AB_CONSTANTS.VIDEO_STATUS.SUBMITTED;
                        progress.videoResults[extraIndex].completedAt = Date.now();
                    }
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.info(MODULE, `Extra video ${totalVideos}/${totalVideos} submitted`);
                    success = true;

                } catch (err) {
                    retries++;
                    progress.lastError = err.message;
                    await AB_Storage.saveJobProgress(progress);
                    AB_Logger.warn(MODULE, `Extra video attempt ${retries} failed: ${err.message}`);

                    if (retries > maxRetries) {
                        if (progress.videoResults[extraIndex]) {
                            progress.videoResults[extraIndex].status = AB_CONSTANTS.VIDEO_STATUS.ERROR;
                        }
                        AB_Logger.error(MODULE, `Extra video failed after ${maxRetries} retries: ${err.message} — skipping`);
                        await AB_Storage.saveJobProgress(progress);
                        break;
                    }

                    await H.retryDelay(retries);
                }
            }
        }

        AB_Logger.info(MODULE, 'Video phase complete — all videos submitted');
    }

    return { run };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_VideoPhase = AB_VideoPhase;
}
