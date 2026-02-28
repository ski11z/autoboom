/**
 * AutoBoom — Phase Helpers
 * Shared utilities, state accessors, and communication functions used by all phase modules.
 * Extracted from orchestrator.js during code splitting.
 */

const AB_PhaseHelpers = (() => {
    const MODULE = 'Orchestrator';

    // ─── Shared State (managed by orchestrator, accessed by phases) ───
    let _activeProject = null;
    let _activeProgress = null;
    let _aborted = false;
    let _paused = false;
    let _stealthEnabled = false;

    // ─── State Accessors ───

    function getProject() { return _activeProject; }
    function getProgress() { return _activeProgress; }
    function isAborted() { return _aborted; }
    function isPaused() { return _paused; }
    function isStealthEnabled() { return _stealthEnabled; }

    function setProject(p) { _activeProject = p; }
    function setProgress(p) { _activeProgress = p; }
    function setAborted(v) { _aborted = v; }
    function setPaused(v) { _paused = v; }
    function setStealthEnabled(v) { _stealthEnabled = v; }

    // ─── Pause / Stop Helpers ───

    /**
     * Wait while paused. Returns true if aborted during wait.
     */
    async function waitIfPaused() {
        while (_paused && !_aborted) {
            await new Promise(r => setTimeout(r, 1000));
        }
        return _aborted;
    }

    /**
     * Check abort/pause state. Returns true if should exit.
     */
    async function shouldStop() {
        if (_aborted) return true;
        if (_paused) return await waitIfPaused();
        return false;
    }

    // ─── Communication with Content Script ───

    async function sendAction(action, params = {}) {
        const tabs = await chrome.tabs.query({ url: ['*://labs.google/flow/*', '*://labs.google/fx/*'] });

        if (!tabs || tabs.length === 0) {
            throw new Error('No Google Flow tab found. Please open https://labs.google/flow in a tab first.');
        }

        // Prefer the stored active tab (set when user last interacted)
        // This ensures multi-tab scenarios use the correct tab
        const storedTabId = await AB_Storage.getActiveTab();
        let tabId;

        if (storedTabId && tabs.some(t => t.id === storedTabId)) {
            tabId = storedTabId;
            AB_Logger.debug(MODULE, `sendAction: using stored active tab ${tabId}`);
        } else {
            // Fallback: use the most recently active Flow tab
            tabId = tabs[0].id;
            // Update stored tab so future sends use the same one
            AB_Storage.setActiveTab(tabId);
            AB_Logger.warn(MODULE, `sendAction: stored tab ${storedTabId} not found in Flow tabs, falling back to ${tabId}`);
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, {
                type: AB_EVENTS.EXECUTE_ACTION,
                payload: { action, params },
            }, (response) => {
                if (chrome.runtime.lastError) {
                    const errMsg = chrome.runtime.lastError.message;
                    if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
                        AB_Logger.warn(MODULE, 'Content script not found, attempting re-injection...', { tabId });
                        injectContentScript(tabId).then(() => {
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, {
                                    type: AB_EVENTS.EXECUTE_ACTION,
                                    payload: { action, params },
                                }, (retryResponse) => {
                                    if (chrome.runtime.lastError) {
                                        reject(new Error(`Content script not responding after re-injection. Please refresh the Flow tab and try again.`));
                                    } else {
                                        resolve(retryResponse);
                                    }
                                });
                            }, 2000);
                        }).catch(err => {
                            reject(new Error(`Failed to inject content script: ${err.message}. Please refresh the Flow tab.`));
                        });
                    } else {
                        reject(new Error(errMsg));
                    }
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Programmatically inject the content scripts into a tab.
     */
    async function injectContentScript(tabId) {
        const scripts = [
            'shared/constants.js',
            'shared/events.js',
            'shared/logger.js',
            'content/selectors.js',
            'content/dom-bridge.js',
            'content/observers.js',
            'content/diagnostics.js',
            'content/actions/navigation.js',
            'content/actions/upload.js',
            'content/actions/image-gen.js',
            'content/actions/video-gen.js',
            'content/content-script.js',
        ];

        await chrome.scripting.executeScript({
            target: { tabId },
            files: scripts,
        });

        AB_Logger.info(MODULE, 'Content scripts injected into tab', { tabId });
    }

    /**
     * Broadcast state update to popup / dashboard.
     */
    function broadcastState() {
        const status = getStatus();
        chrome.runtime.sendMessage({
            type: AB_EVENTS.STATE_UPDATE,
            payload: status,
        }).catch(() => { /* popup might not be open */ });
    }

    /**
     * Get current running state for popup.
     */
    function getStatus() {
        if (!_activeProject || !_activeProgress) {
            return { running: false };
        }
        const isFinished = _activeProgress.currentState === AB_CONSTANTS.PROJECT_FSM.COMPLETED
            || _activeProgress.currentState === AB_CONSTANTS.PROJECT_FSM.ERROR;

        return {
            running: !_aborted && !isFinished,
            projectId: _activeProject.id,
            projectName: _activeProject.name,
            flowUrl: _activeProject.flowUrl || '',
            phase: _activeProgress.phase,
            state: _activeProgress.currentState,
            currentIndex: _activeProgress.currentIndex,
            totalImages: _activeProgress.totalImages,
            totalVideos: _activeProgress.totalVideos,
            imageResults: _activeProgress.imageResults,
            videoResults: _activeProgress.videoResults,
            lastError: _activeProgress.lastError,
        };
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Record a run in history.
     */
    async function recordRunHistory(project, progress, status, errorMsg) {
        try {
            const record = {
                id: `run_${Date.now()}`,
                projectId: project.id,
                projectName: project.name,
                status,
                startedAt: progress.startedAt,
                finishedAt: Date.now(),
                durationMs: Date.now() - (progress.startedAt || Date.now()),
                totalImages: progress.totalImages,
                totalVideos: progress.totalVideos,
                imagesCompleted: progress.imageResults.filter(r => r.status === AB_CONSTANTS.IMAGE_STATUS.READY).length,
                videosCompleted: progress.videoResults.filter(r => r.status === AB_CONSTANTS.VIDEO_STATUS.SUBMITTED || r.status === AB_CONSTANTS.VIDEO_STATUS.DOWNLOADED).length,
                error: errorMsg || null,
            };
            await AB_Storage.saveRunRecord(record);
            AB_Logger.info(MODULE, 'Run history recorded', { runId: record.id });
        } catch (e) {
            AB_Logger.warn(MODULE, 'Failed to record run history:', e.message);
        }
    }

    /**
     * Helper: send stealth overlay progress update (no-op if stealth is off).
     */
    async function updateStealth(data) {
        if (!_stealthEnabled) return;
        try {
            await sendAction(AB_ACTIONS.UPDATE_STEALTH_PROGRESS, data);
        } catch (_) { /* ignore — overlay may not be visible */ }
    }

    /**
     * Wait for a video slot to become available.
     * Flow limits concurrent video generation to 5.
     */
    const MAX_CONCURRENT_VIDEOS = 5;
    async function waitForVideoSlot(currentIndex, totalVideos) {
        const POLL_INTERVAL = 15_000;
        const MAX_WAIT = 600_000;
        const startTime = Date.now();

        AB_Logger.info(MODULE, `Video ${currentIndex + 1}/${totalVideos}: checking concurrent video limit...`);

        while (true) {
            if (await shouldStop()) return;

            try {
                const result = await sendAction(AB_ACTIONS.COUNT_PENDING_VIDEOS);
                const pending = result?.pending || 0;

                if (pending < MAX_CONCURRENT_VIDEOS) {
                    AB_Logger.info(MODULE, `Video slot available: ${pending} pending (limit: ${MAX_CONCURRENT_VIDEOS})`);
                    return;
                }

                const elapsed = Math.round((Date.now() - startTime) / 1000);
                AB_Logger.info(MODULE, `${pending} videos still rendering — waiting for a slot... (${elapsed}s elapsed)`);

            } catch (err) {
                AB_Logger.warn(MODULE, `COUNT_PENDING_VIDEOS failed: ${err.message} — proceeding without throttle`);
                return;
            }

            if (Date.now() - startTime > MAX_WAIT) {
                AB_Logger.warn(MODULE, 'Video slot wait timed out (10min) — proceeding anyway');
                return;
            }

            await sleep(POLL_INTERVAL);
        }
    }

    /**
     * Exponential backoff delay with jitter.
     */
    async function retryDelay(attempt) {
        const D = AB_CONSTANTS.DEFAULTS;
        const base = D.RETRY_BASE_MS || 3000;
        const mult = D.RETRY_BACKOFF_MULTIPLIER || 2;
        const max = D.RETRY_MAX_DELAY_MS || 30000;
        const delay = Math.min(base * Math.pow(mult, attempt - 1), max);
        const jitter = delay * (0.8 + Math.random() * 0.4);
        AB_Logger.info(MODULE, `Retry ${attempt}: waiting ${Math.round(jitter / 1000)}s before next attempt`);
        broadcastState();
        await sleep(jitter);
    }

    return {
        // State accessors
        getProject, getProgress, isAborted, isPaused, isStealthEnabled,
        setProject, setProgress, setAborted, setPaused, setStealthEnabled,
        // Control flow
        waitIfPaused, shouldStop,
        // Communication
        sendAction, injectContentScript, broadcastState, getStatus,
        // Utilities
        sleep, retryDelay, recordRunHistory, updateStealth, waitForVideoSlot,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_PhaseHelpers = AB_PhaseHelpers;
}
