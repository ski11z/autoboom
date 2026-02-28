/**
 * AutoBoom — Create Image Phase
 * Handles image-only generation with optional reference URLs and chain mode.
 * Extracted from orchestrator.js during code splitting.
 */

const AB_CreateImagePhase = (() => {
    const MODULE = 'Orchestrator';

    async function run() {
        const H = AB_PhaseHelpers;
        const project = H.getProject();
        const progress = H.getProgress();
        const maxRetries = project.settings.maxRetries;
        const referenceUrls = project.referenceUrls || [];

        // ─── Determine if we can use fast-fire mode ───
        // Fast-fire: submit all prompts back-to-back without waiting for each image
        // Only when: 1) chain mode OFF, 2) no per-image reference URLs
        const hasAnyRefs = referenceUrls.some(r => r && r.trim());
        const canFastFire = !project.chainMode && !hasAnyRefs;

        AB_Logger.info(MODULE, `Create Image phase: ${progress.totalImages} images to generate`
            + (canFastFire ? ' [FAST-FIRE MODE]' : ' [SEQUENTIAL MODE]'));

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

            // Stealth: per-image progress (Create Image: images span 10% → 95%)
            const ciPct = Math.round(10 + (85 * i / progress.totalImages));
            await H.updateStealth({
                phase: 'images',
                step: `Generating image ${i + 1}/${progress.totalImages}...`,
                progress: ciPct,
                current: i + 1,
                total: progress.totalImages
            });

            let success = false;
            let retries = 0;

            while (!success && retries <= maxRetries) {
                if (await H.shouldStop()) return;

                try {
                    // Step 1: Attach reference image FIRST (before entering prompt)
                    // The + picker may disrupt the Slate editor, so we attach reference first
                    if (project.chainMode) {
                        // ─── CHAIN MODE ───
                        if (i === 0 && project.chainFirstRef && project.chainFirstRef.trim()) {
                            AB_Logger.info(MODULE, `Chain: attaching first-image reference URL: ${project.chainFirstRef.substring(0, 60)}...`);
                            const refResult = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_URL, { url: project.chainFirstRef.trim() });
                            if (!refResult?.success) {
                                AB_Logger.warn(MODULE, `Chain first-ref upload failed: ${refResult?.error}`);
                            }
                            await H.sleep(3000);
                        } else if (i > 0) {
                            AB_Logger.info(MODULE, `Chain: attaching previous image as reference for image ${i + 1}`);
                            const refResult = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_ADD_TO_PROMPT, { imageIndex: -1 });
                            if (!refResult?.success) {
                                AB_Logger.warn(MODULE, `Chain auto-ref failed, trying upload fallback`);
                                const fallback = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_UPLOAD, { imageIndex: -1 });
                                if (!fallback?.success) {
                                    AB_Logger.warn(MODULE, `Chain reference attachment failed for image ${i + 1}`);
                                }
                            }
                            await H.sleep(2000);
                        }
                    } else {
                        // ─── NORMAL MODE: per-image reference URLs ───
                        const refUrl = referenceUrls[i];
                        if (refUrl && refUrl.trim()) {
                            AB_Logger.info(MODULE, `Attaching reference URL for image ${i + 1}: ${refUrl.substring(0, 60)}...`);
                            const refResult = await H.sendAction(AB_ACTIONS.ATTACH_REFERENCE_URL, { url: refUrl.trim() });
                            if (!refResult?.success) {
                                AB_Logger.warn(MODULE, `Reference URL upload failed for image ${i + 1}: ${refResult?.error}`);
                            }
                            await H.sleep(3000);
                        }
                    }

                    // Step 2: Enter prompt (AFTER reference is attached)
                    await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, { prompt: project.imagePrompts[i] });

                    // Step 3: Generate
                    await H.sendAction(AB_ACTIONS.CLICK_GENERATE);

                    // ─── FAST-FIRE: skip waiting (except for the last image) ───
                    const isLastImage = (i === progress.totalImages - 1);
                    if (canFastFire && !isLastImage) {
                        AB_Logger.info(MODULE, `⚡ Fast-fire: image ${i + 1}/${progress.totalImages} submitted, moving to next immediately`);
                        // Mark as submitted (still generating, we don't wait for result)
                        progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.READY;
                        progress.imageResults[i].completedAt = Date.now();
                        await AB_Storage.saveJobProgress(progress);
                        success = true;

                        // Stealth update
                        const ciDonePct = Math.round(10 + (85 * (i + 1) / progress.totalImages));
                        await H.updateStealth({
                            phase: 'images',
                            step: `⚡ Image ${i + 1}/${progress.totalImages} submitted`,
                            progress: ciDonePct,
                            current: i + 1,
                            total: progress.totalImages
                        });

                        // Short delay for UI to process before next prompt
                        await H.sleep(3000);
                        continue;
                    }

                    // Step 4: Wait for result (sequential mode, or last image in fast-fire)
                    const result = await H.sendAction(AB_ACTIONS.WAIT_IMAGE_COMPLETE, {
                        timeout: project.settings.imageTimeout,
                    });

                    // ─── POLICY VIOLATION RECOVERY ───
                    if (result?.policyViolation) {
                        AB_Logger.warn(MODULE, `⚠️ Policy violation on image ${i + 1}: ${result.error}`);

                        // Update stealth with warning
                        await H.updateStealth({
                            phase: 'images',
                            step: `⚠️ Image ${i + 1} policy violation — retrying...`,
                            progress: ciPct,
                            current: i + 1,
                            total: progress.totalImages
                        });

                        // Step A: Click retry icon (one attempt)
                        AB_Logger.info(MODULE, 'Policy recovery Step A: clicking retry icon...');
                        const retryResult = await H.sendAction(AB_ACTIONS.CLICK_RETRY_ICON);

                        if (retryResult?.success) {
                            AB_Logger.info(MODULE, 'Retry icon clicked, waiting for generation...');
                            await H.sleep(5000);

                            const retryWait = await H.sendAction(AB_ACTIONS.WAIT_IMAGE_COMPLETE, {
                                timeout: project.settings.imageTimeout,
                            });

                            if (retryWait?.success) {
                                AB_Logger.info(MODULE, `✅ Policy retry succeeded for image ${i + 1}`);

                                // Send Telegram notification (recovery succeeded)
                                try {
                                    await AB_Notifications.notifyPolicyViolation(
                                        project, i, project.imagePrompts[i], null, true
                                    );
                                } catch (e) { /* notification failure is non-fatal */ }

                                // Mark as complete and continue
                                progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.READY;
                                progress.imageResults[i].completedAt = Date.now();
                                progress.retryCount = 0;
                                await AB_Storage.saveJobProgress(progress);
                                success = true;

                                await H.updateStealth({
                                    phase: 'images',
                                    step: `Image ${i + 1}/${progress.totalImages} complete (after retry) ✓`,
                                    progress: Math.round(10 + (85 * (i + 1) / progress.totalImages)),
                                    current: i + 1,
                                    total: progress.totalImages
                                });
                                continue;
                            }

                            AB_Logger.warn(MODULE, 'Retry also failed, proceeding to AI rewrite...');
                        } else {
                            AB_Logger.warn(MODULE, 'Retry icon not found, proceeding to AI rewrite...');
                        }

                        // Step B: Click "Reuse Prompt" to restore the prompt
                        AB_Logger.info(MODULE, 'Policy recovery Step B: clicking "Reuse Prompt"...');
                        await H.sendAction(AB_ACTIONS.CLICK_REUSE_PROMPT_BUTTON);
                        await H.sleep(2000);

                        // Step C: Call AI to rewrite the prompt
                        AB_Logger.info(MODULE, 'Policy recovery Step C: rewriting prompt via AI...');
                        await H.updateStealth({
                            phase: 'images',
                            step: `⚠️ Image ${i + 1} — AI rewriting prompt...`,
                            progress: ciPct,
                            current: i + 1,
                            total: progress.totalImages
                        });

                        const originalPrompt = project.imagePrompts[i];
                        const rewriteResult = await AB_PromptRewriter.rewritePrompt(originalPrompt);

                        if (rewriteResult?.success && rewriteResult.newPrompt) {
                            AB_Logger.info(MODULE, `AI rewrote prompt via ${rewriteResult.provider}: "${rewriteResult.newPrompt.substring(0, 80)}..."`);

                            // Step D: Enter the new prompt and generate
                            await H.sendAction(AB_ACTIONS.ENTER_IMAGE_PROMPT, { prompt: rewriteResult.newPrompt });
                            await H.sendAction(AB_ACTIONS.CLICK_GENERATE);

                            const rewriteWait = await H.sendAction(AB_ACTIONS.WAIT_IMAGE_COMPLETE, {
                                timeout: project.settings.imageTimeout,
                            });

                            // Send Telegram notification
                            try {
                                await AB_Notifications.notifyPolicyViolation(
                                    project, i, originalPrompt, rewriteResult.newPrompt, rewriteWait?.success
                                );
                            } catch (e) { /* notification failure is non-fatal */ }

                            if (rewriteWait?.success) {
                                AB_Logger.info(MODULE, `✅ AI-rewritten prompt succeeded for image ${i + 1}`);
                                progress.imageResults[i].status = AB_CONSTANTS.IMAGE_STATUS.READY;
                                progress.imageResults[i].completedAt = Date.now();
                                progress.retryCount = 0;
                                await AB_Storage.saveJobProgress(progress);
                                success = true;

                                await H.updateStealth({
                                    phase: 'images',
                                    step: `Image ${i + 1}/${progress.totalImages} complete (AI rewrite) ✓`,
                                    progress: Math.round(10 + (85 * (i + 1) / progress.totalImages)),
                                    current: i + 1,
                                    total: progress.totalImages
                                });
                                continue;
                            } else {
                                AB_Logger.error(MODULE, `AI-rewritten prompt also failed for image ${i + 1}`);
                                throw new Error(`Policy violation — retry and AI rewrite both failed`);
                            }
                        } else {
                            AB_Logger.error(MODULE, `AI rewrite failed: ${rewriteResult?.error}`);

                            // Send Telegram notification (AI rewrite failed)
                            try {
                                await AB_Notifications.notifyPolicyViolation(
                                    project, i, originalPrompt, null, false
                                );
                            } catch (e) { /* notification failure is non-fatal */ }

                            throw new Error(`Policy violation — AI rewrite failed: ${rewriteResult?.error}`);
                        }
                    }

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
                    const ciDonePct = Math.round(10 + (85 * (i + 1) / progress.totalImages));
                    await H.updateStealth({
                        phase: 'images',
                        step: `Image ${i + 1}/${progress.totalImages} complete ✓`,
                        progress: ciDonePct,
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

                    await H.retryDelay(retries);
                }
            }
        }

        AB_Logger.info(MODULE, 'Create Image phase complete');
    }

    return { run };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_CreateImagePhase = AB_CreateImagePhase;
}
