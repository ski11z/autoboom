/**
 * AutoBoom — Orchestrator
 * Coordinates the execution of a single project lifecycle:
 * IMAGE_PHASE (sequential) → VIDEO_PHASE (parallel submission).
 * Drives the project-level state machine and communicates with the content script.
 *
 * Phase logic has been split into separate modules in background/phases/.
 * This file is the thin coordinator that delegates to those modules.
 */

const AB_Orchestrator = (() => {
    const MODULE = 'Orchestrator';
    const H = AB_PhaseHelpers;

    /**
     * Start executing a project.
     */
    async function startProject(projectId) {
        // ─── GUARD: Prevent concurrent projects ───
        const currentStatus = H.getStatus();
        if (currentStatus.running) {
            const msg = `Another project "${currentStatus.projectName}" is already running. Stop it first before starting a new one.`;
            AB_Logger.warn(MODULE, msg);
            throw new Error(msg);
        }

        H.setAborted(false);
        H.setPaused(false);

        const project = await AB_Storage.getProject(projectId);
        if (!project) throw new Error(`Project not found: ${projectId}`);

        H.setProject(project);
        AB_Logger.setProjectId(projectId);
        AB_Logger.info(MODULE, `Starting project: "${project.name}"`, { id: projectId });

        // Load stealth mode preference
        try {
            const data = await chrome.storage.local.get({ stealthMode: false });
            H.setStealthEnabled(!!data.stealthMode);
            AB_Logger.info(MODULE, `Stealth mode: ${H.isStealthEnabled() ? 'ON' : 'OFF'}`);
        } catch (e) {
            H.setStealthEnabled(false);
        }

        // ─── GUARD RAIL: Pre-flight validation ───
        if (project.mode === 'frames-to-video' || (!project.mode || project.mode === undefined)) {
            const imgCount = (project.imagePrompts || []).length;
            const animCount = (project.animationPrompts || []).length;
            if (imgCount === 0) {
                throw new Error('No image prompts defined. Add at least one image prompt before running.');
            }
            if (animCount === 0) {
                throw new Error('No animation prompts defined. Add at least one animation prompt before running.');
            }
            if (!project.singleImageMode && animCount < imgCount - 1) {
                AB_Logger.warn(MODULE, `Prompt count mismatch: ${imgCount} images but only ${animCount} animation prompts (need at least ${imgCount - 1} for transitions). Some transitions will have no animation.`);
            }
            AB_Logger.info(MODULE, `✅ Pre-flight validation passed: ${imgCount} image prompts, ${animCount} animation prompts, singleImageMode=${!!project.singleImageMode}`);
        }

        let progress = await AB_Storage.getJobProgress(projectId);
        if (!progress || progress.currentState === AB_CONSTANTS.PROJECT_FSM.COMPLETED) {
            if (project.mode === 'text-to-video') {
                progress = AB_Models.createT2VJobProgress(project);
            } else if (project.mode === 'create-image') {
                progress = AB_Models.createCIJobProgress(project);
            } else {
                progress = AB_Models.createJobProgress(project);
            }
        }
        H.setProgress(progress);

        // Update project status
        project.status = AB_CONSTANTS.PROJECT_STATUS.RUNNING;
        await AB_Storage.saveProject(project);

        // Set initial phase based on project mode
        if (project.mode === 'text-to-video') {
            progress.phase = AB_CONSTANTS.PHASE.TEXT_TO_VIDEO;
            progress.currentState = AB_CONSTANTS.PROJECT_FSM.TEXT_TO_VIDEO_PHASE;
        } else if (project.mode === 'create-image') {
            progress.phase = AB_CONSTANTS.PHASE.CREATE_IMAGE;
            progress.currentState = AB_CONSTANTS.PROJECT_FSM.CREATE_IMAGE_PHASE;
        } else {
            progress.phase = AB_CONSTANTS.PHASE.IMAGES;
            progress.currentState = AB_CONSTANTS.PROJECT_FSM.IMAGE_PHASE;
        }
        progress.startedAt = progress.startedAt || Date.now();
        await AB_Storage.saveJobProgress(progress);

        H.broadcastState();

        try {
            // ─── PRE-FLIGHT: Always create a NEW project ───
            AB_Logger.info(MODULE, 'Pre-flight: creating a new Flow project...');

            // Navigate to dashboard first (ensures we start fresh)
            try {
                const storedTabId = await AB_Storage.getActiveTab();
                const tabs = await chrome.tabs.query({ url: ['*://labs.google/flow/*', '*://labs.google/fx/*'] });
                let tabId = null;

                // Prefer the stored active tab (set by popup for correct multi-tab behavior)
                if (storedTabId && tabs?.some(t => t.id === storedTabId)) {
                    tabId = storedTabId;
                } else if (tabs && tabs.length > 0) {
                    tabId = tabs[0].id;
                }

                if (tabId) {
                    await chrome.tabs.update(tabId, { url: 'https://labs.google/fx/tools/flow' });
                    // Ensure the active tab is set correctly
                    await AB_Storage.setActiveTab(tabId);
                    AB_Logger.info(MODULE, `Navigated tab ${tabId} to Flow dashboard`);
                    await H.sleep(5000);
                } else {
                    AB_Logger.warn(MODULE, 'No Flow tab found for dashboard navigation');
                }
            } catch (e) {
                AB_Logger.warn(MODULE, 'Dashboard navigation failed:', e.message);
            }

            // Show stealth overlay on the dashboard page immediately
            if (H.isStealthEnabled()) {
                try {
                    await H.sendAction(AB_ACTIONS.SHOW_STEALTH_OVERLAY);
                    await H.sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, {
                        phase: 'navigation', step: 'Creating new project...', progress: 2
                    });
                } catch (e) {
                    AB_Logger.warn(MODULE, 'Stealth overlay show failed on dashboard:', e.message);
                }
            }

            // Click "New Project" on the dashboard
            try {
                await H.sendAction(AB_ACTIONS.CREATE_NEW_PROJECT);
            } catch (e) {
                AB_Logger.warn(MODULE, 'CREATE_NEW_PROJECT action threw (may be due to navigation):', e.message);
            }

            // Wait for the new page to load and content script to re-inject
            AB_Logger.info(MODULE, 'Waiting for new page to load and content script to reconnect...');
            let editorReady = false;

            for (let attempt = 1; attempt <= 10; attempt++) {
                await H.sleep(3000);
                try {
                    const recheckStatus = await H.sendAction(AB_ACTIONS.CHECK_FLOW_PAGE);
                    AB_Logger.info(MODULE, `Editor check attempt ${attempt}/10`, recheckStatus);

                    if (recheckStatus && (recheckStatus.hasPromptInput || recheckStatus.isEditorPage)) {
                        editorReady = true;
                        break;
                    }
                } catch (e) {
                    AB_Logger.info(MODULE, `Connection attempt ${attempt}/10 failed: ${e.message}`);
                }
            }

            if (!editorReady) {
                throw new Error('Flow project editor did not load. Please try again.');
            }
            AB_Logger.info(MODULE, 'New Flow project editor is ready');

            // Show stealth overlay on editor page
            if (H.isStealthEnabled()) {
                try {
                    await H.sendAction(AB_ACTIONS.SHOW_STEALTH_OVERLAY);
                    await H.sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, {
                        phase: 'settings', step: 'Configuring project settings...', progress: 8
                    });
                } catch (e) {
                    AB_Logger.warn(MODULE, 'Stealth overlay show failed:', e.message);
                }
            }

            // ─── CAPTURE FLOW PROJECT URL ───
            try {
                const pageStatus = await H.sendAction(AB_ACTIONS.CHECK_FLOW_PAGE);
                if (pageStatus?.url && pageStatus.url.includes('/project/')) {
                    project.flowUrl = pageStatus.url;
                    await AB_Storage.saveProject(project);
                    AB_Logger.info(MODULE, `Captured Flow project URL: ${project.flowUrl}`);
                }
            } catch (e) {
                AB_Logger.warn(MODULE, 'Failed to capture Flow URL:', e.message);
            }

            // ─── GUARD RAIL: Settings Hard Gate (retry 3x, abort on failure) ───
            AB_Logger.info(MODULE, 'Configuring settings (hard gate)...');
            // For F2V mode, we configure IMAGE settings first (images must be generated first)
            // then switch to Video+Frames settings before the video phase.
            const settingsMode = (project.mode === 'frames-to-video') ? 'create-image' : project.mode;
            let settingsOk = false;
            for (let sAttempt = 1; sAttempt <= 3; sAttempt++) {
                if (await H.shouldStop()) return;
                try {
                    const settingsResult = await H.sendAction(AB_ACTIONS.CONFIGURE_SETTINGS, {
                        mode: settingsMode,
                        aspectRatio: project.aspectRatio || '9:16',
                        outputCount: project.outputCount || 1,
                        imageModel: project.imageModel || null,
                        videoModel: project.videoModel || null,
                    });
                    if (settingsResult?.success) {
                        settingsOk = true;
                        AB_Logger.info(MODULE, `✅ Settings configured on attempt ${sAttempt} (mode: ${settingsMode})`);
                        break;
                    }
                    AB_Logger.warn(MODULE, `Settings attempt ${sAttempt}/3 returned failure: ${settingsResult?.error || 'unknown'}`);
                } catch (e) {
                    AB_Logger.warn(MODULE, `Settings attempt ${sAttempt}/3 threw: ${e.message}`);
                }
                await H.sleep(2000);
            }
            if (!settingsOk) {
                throw new Error('Failed to configure settings (aspect ratio / output count) after 3 attempts. Aborting to prevent wrong settings.');
            }
            await H.sleep(1000);

            // Stealth: settings done
            await H.updateStealth({ phase: 'settings', step: 'Settings applied ✓', progress: 10 });

            // ─── DISPATCH TO MODE-SPECIFIC PHASE ───

            if (project.mode === 'text-to-video') {
                // ─── TEXT-TO-VIDEO MODE ───
                progress.phase = AB_CONSTANTS.PHASE.TEXT_TO_VIDEO;
                progress.currentState = AB_CONSTANTS.PROJECT_FSM.TEXT_TO_VIDEO_PHASE;
                progress.startedAt = progress.startedAt || Date.now();
                await AB_Storage.saveJobProgress(progress);
                H.broadcastState();

                await AB_TextToVideoPhase.run();
                if (await H.shouldStop()) return;
            } else if (project.mode === 'create-image') {
                // ─── CREATE IMAGE MODE ───
                progress.phase = AB_CONSTANTS.PHASE.CREATE_IMAGE;
                progress.currentState = AB_CONSTANTS.PROJECT_FSM.CREATE_IMAGE_PHASE;
                progress.startedAt = progress.startedAt || Date.now();
                await AB_Storage.saveJobProgress(progress);
                H.broadcastState();

                await AB_CreateImagePhase.run();
                if (await H.shouldStop()) return;
            } else {
                // ─── FRAMES-TO-VIDEO MODE ───
                // PHASE 1: IMAGE GENERATION (settings already set to Image mode above)
                if (H.isStealthEnabled()) {
                    try {
                        await H.sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, {
                            phase: 'images', step: 'Starting image generation...', progress: 10, current: 0, total: progress.totalImages
                        });
                    } catch (_) { }
                }
                await AB_ImagePhase.run();
                if (await H.shouldStop()) return;

                // ─── GUARD RAIL: Image Count Gate ───
                AB_Logger.info(MODULE, 'Image Count Gate: verifying actual image count on page...');
                try {
                    const countResult = await H.sendAction(AB_ACTIONS.COUNT_IMAGES);
                    const actualCount = countResult?.count || 0;
                    const expectedCount = progress.totalImages;

                    if (actualCount !== expectedCount) {
                        AB_Logger.warn(MODULE, `⚠️ Image count mismatch: expected ${expectedCount}, found ${actualCount} on page`);
                        progress.totalImages = actualCount;
                        await AB_Storage.saveJobProgress(progress);
                        AB_Logger.info(MODULE, `Updated totalImages to ${actualCount} to match actual DOM state`);
                    } else {
                        AB_Logger.info(MODULE, `✅ Image count verified: ${actualCount} images match expected ${expectedCount}`);
                    }

                    if (actualCount < 2 && !project.singleImageMode) {
                        throw new Error(`Only ${actualCount} image(s) generated — need at least 2 for transitions. Aborting video phase.`);
                    }
                } catch (gateErr) {
                    if (gateErr.message.includes('Aborting')) throw gateErr;
                    AB_Logger.warn(MODULE, `Image count gate check failed: ${gateErr.message} — proceeding with original count`);
                }

                // ─── PHASE 2: SWITCH SETTINGS TO VIDEO → FRAMES ───
                AB_Logger.info(MODULE, 'Switching settings to Video → Frames for video phase...');
                let videoSettingsOk = false;
                for (let sAttempt = 1; sAttempt <= 3; sAttempt++) {
                    if (await H.shouldStop()) return;
                    try {
                        const vSettingsResult = await H.sendAction(AB_ACTIONS.CONFIGURE_SETTINGS, {
                            mode: 'frames-to-video',
                            aspectRatio: project.aspectRatio || '9:16',
                            outputCount: project.outputCount || 1,
                            videoModel: project.videoModel || null,
                        });
                        if (vSettingsResult?.success) {
                            videoSettingsOk = true;
                            AB_Logger.info(MODULE, `✅ Video settings configured on attempt ${sAttempt}`);
                            break;
                        }
                        AB_Logger.warn(MODULE, `Video settings attempt ${sAttempt}/3 failed: ${vSettingsResult?.error || 'unknown'}`);
                    } catch (e) {
                        AB_Logger.warn(MODULE, `Video settings attempt ${sAttempt}/3 threw: ${e.message}`);
                    }
                    await H.sleep(2000);
                }
                if (!videoSettingsOk) {
                    AB_Logger.error(MODULE, 'Failed to switch to Video settings — proceeding with caution');
                }
                await H.sleep(1000);

                await H.updateStealth({ phase: 'videos', step: 'Video settings applied ✓', progress: 53 });

                // PHASE 2: VIDEO SUBMISSION
                progress.phase = AB_CONSTANTS.PHASE.VIDEOS;
                progress.currentState = AB_CONSTANTS.PROJECT_FSM.VIDEO_PHASE;
                progress.currentIndex = 0;
                await AB_Storage.saveJobProgress(progress);
                H.broadcastState();
                if (H.isStealthEnabled()) {
                    try {
                        await H.sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, {
                            phase: 'videos', step: 'Starting video submission...', progress: 55, current: 0, total: progress.totalVideos
                        });
                    } catch (_) { }
                }
                await AB_VideoPhase.run();
                if (await H.shouldStop()) return;
            }

            // ─── COMPLETED ───
            // Check for partial failures (skip-and-continue may have left errored items)
            const hasErrors = (progress.imageResults || []).some(r => r.status === AB_CONSTANTS.IMAGE_STATUS.ERROR)
                || (progress.videoResults || []).some(r => r.status === AB_CONSTANTS.VIDEO_STATUS.ERROR);

            progress.currentState = AB_CONSTANTS.PROJECT_FSM.COMPLETED;
            project.status = hasErrors
                ? AB_CONSTANTS.PROJECT_STATUS.COMPLETED_WITH_ERRORS
                : AB_CONSTANTS.PROJECT_STATUS.COMPLETED;
            await AB_Storage.saveJobProgress(progress);
            await AB_Storage.saveProject(project);
            await AB_Logger.persistToStorage(projectId);
            await H.recordRunHistory(project, progress, hasErrors ? 'completed_with_errors' : 'completed');
            AB_Notifications.notifyProjectCompleted(project, progress).catch(() => { });
            chrome.storage.local.remove('ab_interrupted_jobs');

            // Hide stealth overlay on completion
            if (H.isStealthEnabled()) {
                try {
                    await H.sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, {
                        phase: 'complete', step: 'All done!', progress: 100
                    });
                    await H.sleep(2000);
                    await H.sendAction(AB_ACTIONS.HIDE_STEALTH_OVERLAY);
                } catch (_) { }
            }

            AB_Logger.info(MODULE, `Project completed: "${project.name}"`);
            H.broadcastState();

        } catch (err) {
            if (H.isAborted()) return;
            AB_Logger.error(MODULE, `Project failed: ${err.message}`);
            progress.currentState = AB_CONSTANTS.PROJECT_FSM.ERROR;
            progress.lastError = err.message;
            project.status = AB_CONSTANTS.PROJECT_STATUS.ERROR;
            await AB_Storage.saveJobProgress(progress);
            await AB_Storage.saveProject(project);
            await AB_Logger.persistToStorage(projectId);
            await H.recordRunHistory(project, progress, 'error', err.message);
            AB_Notifications.notifyProjectError(project, progress, err.message).catch(() => { });
            chrome.storage.local.remove('ab_interrupted_jobs');

            // Hide stealth overlay on error
            if (H.isStealthEnabled()) {
                try { await H.sendAction(AB_ACTIONS.HIDE_STEALTH_OVERLAY); } catch (_) { }
            }

            H.broadcastState();
        }
    }

    /**
     * Pause the currently running project.
     */
    async function pauseProject() {
        const project = H.getProject();
        const progress = H.getProgress();
        if (!project || !progress) return;

        H.setPaused(true);
        progress.currentState = AB_CONSTANTS.PROJECT_FSM.PAUSED;
        progress.pausedPhase = progress.phase;
        project.status = AB_CONSTANTS.PROJECT_STATUS.PAUSED;

        await AB_Storage.saveJobProgress(progress);
        await AB_Storage.saveProject(project);

        AB_Logger.info(MODULE, 'Project paused — execution suspended in place');
        H.broadcastState();
    }

    /**
     * Resume a paused project (in-place).
     */
    async function resumeProject(projectId) {
        const project = H.getProject();
        const progress = H.getProgress();

        if (H.isPaused() && project && progress) {
            H.setPaused(false);
            progress.currentState = progress.pausedPhase === AB_CONSTANTS.PHASE.VIDEOS
                ? AB_CONSTANTS.PROJECT_FSM.VIDEO_PHASE
                : AB_CONSTANTS.PROJECT_FSM.IMAGE_PHASE;
            project.status = AB_CONSTANTS.PROJECT_STATUS.RUNNING;

            await AB_Storage.saveJobProgress(progress);
            await AB_Storage.saveProject(project);

            AB_Logger.info(MODULE, 'Project resumed — execution continues');
            H.broadcastState();
            return;
        }

        // Fallback: cold resume from saved progress (e.g. after crash)
        const savedProgress = await AB_Storage.getJobProgress(projectId);
        if (!savedProgress) throw new Error('No progress found to resume');
        AB_Logger.info(MODULE, `Cold-resuming project from state: ${savedProgress.currentState}, phase: ${savedProgress.phase}`);
        await startProject(projectId);
    }

    /**
     * Stop the currently running project (abort).
     */
    async function stopProject() {
        const project = H.getProject();
        const progress = H.getProgress();
        if (!project || !progress) return;

        H.setAborted(true);
        H.setPaused(false);
        progress.currentState = AB_CONSTANTS.PROJECT_FSM.IDLE;
        project.status = AB_CONSTANTS.PROJECT_STATUS.READY;

        await AB_Storage.saveJobProgress(progress);
        await AB_Storage.saveProject(project);

        AB_Logger.info(MODULE, 'Project stopped');

        // Hide stealth overlay on abort
        if (H.isStealthEnabled()) {
            try { await H.sendAction(AB_ACTIONS.HIDE_STEALTH_OVERLAY); } catch (_) { }
        }

        H.broadcastState();

        H.setProject(null);
        H.setProgress(null);
    }

    /**
     * Get current running state for popup.
     */
    function getStatus() {
        return H.getStatus();
    }

    return { startProject, resumeProject, pauseProject, stopProject, getStatus };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Orchestrator = AB_Orchestrator;
}
