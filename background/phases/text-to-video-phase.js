/**
 * AutoBoom — Text-to-Video Phase
 * Handles sequential video prompt submission for T2V mode.
 * Extracted from orchestrator.js during code splitting.
 */

const AB_TextToVideoPhase = (() => {
    const MODULE = 'Orchestrator';

    async function run() {
        const H = AB_PhaseHelpers;
        const project = H.getProject();
        const progress = H.getProgress();
        const prompts = project.videoPrompts || [];
        const totalVideos = prompts.length;
        const maxRetries = project.settings?.maxRetries ?? AB_CONSTANTS.DEFAULTS.MAX_RETRIES;

        if (totalVideos === 0) {
            AB_Logger.warn(MODULE, 'No video prompts provided — skipping T2V phase');
            return;
        }

        AB_Logger.info(MODULE, `Text-to-Video phase: ${totalVideos} prompts`);

        for (let i = 0; i < totalVideos; i++) {
            if (await H.shouldStop()) return;

            // ─── THROTTLE: 5-video concurrent limit ───
            if (i >= 5) await H.waitForVideoSlot(i, totalVideos);

            AB_Logger.info(MODULE, `T2V ${i + 1}/${totalVideos}: "${prompts[i].substring(0, 60)}..."`);

            // Update progress
            if (progress.videoResults[i]) {
                progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.GENERATING;
            }
            progress.currentIndex = i;
            await AB_Storage.saveJobProgress(progress);
            H.broadcastState();

            // Stealth: per-video progress (T2V: videos span 10% → 95%)
            const t2vPct = Math.round(10 + (85 * i / totalVideos));
            await H.updateStealth({
                phase: 'videos',
                step: `Submitting video ${i + 1}/${totalVideos}...`,
                progress: t2vPct,
                current: i + 1,
                total: totalVideos
            });

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    // Settings (Video → Frames → aspect ratio → output count) are already
                    // configured by the orchestrator's CONFIGURE_SETTINGS step.
                    // We just need to enter the prompt and click Create.

                    // Step 1: Enter the video prompt (same Slate editor as image mode)
                    const promptResult = await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, {
                        prompt: prompts[i],
                    });
                    if (!promptResult?.success) throw new Error(promptResult?.error || 'Failed to enter prompt');
                    await H.sleep(1000);

                    // Step 2: Click Create (same button as image mode)
                    const genResult = await H.sendAction(AB_ACTIONS.CLICK_GENERATE);
                    if (!genResult?.success) throw new Error(genResult?.error || 'Failed to click Create');

                    // Step 5: Brief wait for submission to register
                    await H.sleep(3000);

                    // Mark as submitted
                    if (progress.videoResults[i]) {
                        progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.SUBMITTED;
                        progress.videoResults[i].completedAt = Date.now();
                    }
                    await AB_Storage.saveJobProgress(progress);

                    AB_Logger.info(MODULE, `T2V ${i + 1}/${totalVideos} submitted`);
                    success = true;

                    // Stealth: video submitted
                    const t2vDonePct = Math.round(10 + (85 * (i + 1) / totalVideos));
                    await H.updateStealth({
                        phase: 'videos',
                        step: `Video ${i + 1}/${totalVideos} submitted ✓`,
                        progress: t2vDonePct,
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

                    AB_Logger.warn(MODULE, `T2V ${i + 1} attempt ${retries} failed: ${err.message}`);

                    if (retries > maxRetries) {
                        if (progress.videoResults[i]) {
                            progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.ERROR;
                        }
                        AB_Logger.error(MODULE, `T2V ${i + 1} failed after ${maxRetries} retries — skipping`);
                        break; // skip to next video instead of halting
                    }

                    await H.retryDelay(retries);
                }
            }
        }

        // ─── WAIT FOR ALL VIDEOS TO FINISH GENERATING ───
        AB_Logger.info(MODULE, 'All prompts submitted — waiting for videos to finish generating...');

        const POLL_INTERVAL = 15_000;   // Check every 15s
        const MAX_WAIT = 900_000;       // 15 minute timeout
        const waitStart = Date.now();

        while (true) {
            if (await H.shouldStop()) return;

            try {
                const result = await H.sendAction(AB_ACTIONS.COUNT_PENDING_VIDEOS);
                const pending = result?.pending || 0;
                const completed = result?.completed || 0;
                const total = pending + completed;
                const elapsed = Math.round((Date.now() - waitStart) / 1000);

                AB_Logger.info(MODULE, `Video generation: ${completed} completed, ${pending} pending (${elapsed}s elapsed)`);

                // Update progress in popup
                for (let v = 0; v < progress.videoResults.length; v++) {
                    if (v < completed && progress.videoResults[v].status !== AB_CONSTANTS.VIDEO_STATUS.ERROR) {
                        progress.videoResults[v].status = AB_CONSTANTS.VIDEO_STATUS.DOWNLOADED;
                    }
                }
                await AB_Storage.saveJobProgress(progress);
                H.broadcastState();

                // Update stealth overlay
                const waitPct = total > 0 ? Math.round(85 + (15 * completed / total)) : 95;
                await H.updateStealth({
                    phase: 'videos',
                    step: pending > 0
                        ? `Generating: ${completed}/${total} complete (${elapsed}s)...`
                        : 'All videos generated ✓',
                    progress: waitPct,
                    current: completed,
                    total: total
                });

                if (pending === 0 && completed > 0) {
                    AB_Logger.info(MODULE, `All ${completed} videos finished generating`);
                    // Mark all as downloaded/completed
                    for (const vr of progress.videoResults) {
                        if (vr.status === AB_CONSTANTS.VIDEO_STATUS.SUBMITTED) {
                            vr.status = AB_CONSTANTS.VIDEO_STATUS.DOWNLOADED;
                            vr.completedAt = Date.now();
                        }
                    }
                    await AB_Storage.saveJobProgress(progress);
                    break;
                }

                if (pending === 0 && completed === 0) {
                    // No videos detected at all — could be DOM hasn't loaded yet
                    if (elapsed > 30) {
                        AB_Logger.warn(MODULE, 'No videos detected on page — assuming they completed');
                        break;
                    }
                }

            } catch (err) {
                AB_Logger.warn(MODULE, `Video completion check failed: ${err.message}`);
            }

            if (Date.now() - waitStart > MAX_WAIT) {
                AB_Logger.warn(MODULE, 'Video completion wait timed out (15min) — marking as complete anyway');
                break;
            }

            await H.sleep(POLL_INTERVAL);
        }

        AB_Logger.info(MODULE, 'Text-to-Video phase complete — all videos generated');
    }

    return { run };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_TextToVideoPhase = AB_TextToVideoPhase;
}
