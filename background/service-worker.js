/**
 * AutoBoom — Background Service Worker
 * MV3 entry point. Routes messages, manages alarms, handles lifecycle.
 */

// Import modules (service worker uses importScripts)
importScripts(
    '../shared/constants.js',
    '../shared/events.js',
    '../shared/logger.js',
    '../shared/models.js',
    '../shared/changelog.js',
    'state-machine.js',
    'storage-manager.js',
    'download-manager.js',
    'notifications.js',
    'phases/phase-helpers.js',
    'phases/image-phase.js',
    'phases/create-image-phase.js',
    'phases/video-phase.js',
    'phases/text-to-video-phase.js',
    'phases/download-phase.js',
    'prompt-rewriter.js',
    'orchestrator.js',
    'batch-queue.js'
);

const SW_MODULE = 'ServiceWorker';

// ─── Lifecycle Events ───

chrome.runtime.onInstalled.addListener((details) => {
    AB_Logger.info(SW_MODULE, `Extension installed (reason: ${details.reason})`);

    // Set up keepalive alarm
    chrome.alarms.create('autoboom-keepalive', {
        periodInMinutes: AB_CONSTANTS.DEFAULTS.KEEPALIVE_ALARM_MINUTES,
    });

    // Enable side panel to open on action click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch(err => AB_Logger.warn(SW_MODULE, 'sidePanel setup error:', err.message));
});

chrome.runtime.onStartup.addListener(() => {
    AB_Logger.info(SW_MODULE, 'Extension started');
    _checkForInterruptedJobs();
});

// ─── Alarm Handler (Keepalive) ───

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autoboom-keepalive') {
        const status = AB_Orchestrator.getStatus();
        if (status.running) {
            AB_Logger.debug(SW_MODULE, 'Keepalive ping — job still running');
        }
    }
});

// ─── Message Router ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    _handleMessage(message, sender).then(response => {
        sendResponse(response);
    }).catch(err => {
        AB_Logger.error(SW_MODULE, `Message handler error: ${err.message}`);
        sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open for async
});

// ─── Port Connections (long-lived) ───

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'autoboom-content') {
        AB_Logger.info(SW_MODULE, 'Content script connected', { tabId: port.sender?.tab?.id });

        // Track active tab — but ONLY when no project is running.
        // During a run, START_PROJECT already set the correct tab.
        // Without this guard, the OLD tab's content script re-connecting
        // would overwrite the active tab mid-run (race condition).
        const tabId = port.sender?.tab?.id;
        if (tabId) {
            const runStatus = AB_Orchestrator.getStatus();
            if (!runStatus.running) {
                AB_Storage.setActiveTab(tabId);
            } else {
                AB_Logger.debug(SW_MODULE, `Skipping setActiveTab (project running), connected tab: ${tabId}`);
            }
        }

        port.onDisconnect.addListener(() => {
            AB_Logger.info(SW_MODULE, 'Content script disconnected', { tabId });
            // NOTE: Do NOT clearActiveTab here — the tab may just be refreshing.
            // The active tab is updated when a new content script connects.
        });

        port.onMessage.addListener((message) => {
            // Handle responses from content script via port
            if (message.type === 'ACTION_RESPONSE') {
                // Responses are handled by the orchestrator via tabs.sendMessage
            }
        });
    }

    if (port.name === 'autoboom-popup') {
        AB_Logger.info(SW_MODULE, 'Popup connected');

        // Send current state immediately
        const status = AB_Orchestrator.getStatus();
        port.postMessage({ type: AB_EVENTS.STATE_UPDATE, payload: status });

        port.onDisconnect.addListener(() => {
            AB_Logger.debug(SW_MODULE, 'Popup disconnected');
        });
    }
});

// ─── Notification Handler Registry ───
const _notifRegistry = {
    TELEGRAM: { storageKey: 'ab_telegram', testFn: (p) => AB_Notifications.sendTestMessage(p.botToken, p.chatId) },
    DISCORD: { storageKey: 'ab_discord', testFn: (p) => AB_Notifications.sendDiscordTest(p.webhookUrl) },
    WEBHOOK: { storageKey: 'ab_webhook', testFn: (p) => AB_Notifications.sendWebhookTest(p.url, p.headers) },
};

// ─── Message Handler ───

async function _handleMessage(message, sender) {
    const { type, payload } = message;

    switch (type) {
        // ─── Content Script Ready ───
        case AB_EVENTS.CONTENT_READY:
            AB_Logger.info(SW_MODULE, 'Content script ready', payload);
            if (sender.tab?.id) {
                const runStatus = AB_Orchestrator.getStatus();
                if (!runStatus.running) {
                    await AB_Storage.setActiveTab(sender.tab.id);
                } else {
                    AB_Logger.debug(SW_MODULE, `Skipping setActiveTab on CONTENT_READY (project running), tab: ${sender.tab.id}`);
                }
            }
            // Check if there's an interrupted job to resume
            await _checkForInterruptedJobs();
            return { success: true };

        // ─── Project Control ───
        case AB_EVENTS.START_PROJECT: {
            // Use the tab ID the popup resolved (it knows which window/tab the user is on)
            if (payload.targetTabId) {
                await AB_Storage.setActiveTab(payload.targetTabId);
                AB_Logger.info(SW_MODULE, `Active tab set from popup: ${payload.targetTabId}`);
            } else {
                // Fallback: query for the most recently accessed Flow tab
                const anyFlowTabs = await chrome.tabs.query({
                    url: ['*://labs.google/flow/*', '*://labs.google/fx/*'],
                });
                if (anyFlowTabs && anyFlowTabs.length > 0) {
                    anyFlowTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
                    await AB_Storage.setActiveTab(anyFlowTabs[0].id);
                    AB_Logger.info(SW_MODULE, `Active tab fallback to most recent: ${anyFlowTabs[0].id}`);
                }
            }
            AB_Orchestrator.startProject(payload.projectId).catch(err => {
                AB_Logger.error(SW_MODULE, 'Start project failed', err.message);
            });
            return { success: true, message: 'Project starting' };
        }

        case AB_EVENTS.PAUSE_PROJECT:
            await AB_Orchestrator.pauseProject();
            return { success: true };

        case AB_EVENTS.RESUME_PROJECT:
            AB_Orchestrator.resumeProject(payload.projectId).catch(err => {
                AB_Logger.error(SW_MODULE, 'Resume project failed', err.message);
            });
            return { success: true, message: 'Project resuming' };

        case AB_EVENTS.STOP_PROJECT:
            await AB_Orchestrator.stopProject();
            return { success: true };

        // ─── Batch Control ───
        case AB_EVENTS.START_BATCH:
            AB_BatchQueue.start().catch(err => {
                AB_Logger.error(SW_MODULE, 'Start batch failed', err.message);
            });
            return { success: true, message: 'Batch starting' };

        case AB_EVENTS.PAUSE_BATCH:
            await AB_BatchQueue.pause();
            return { success: true };

        case AB_EVENTS.RESUME_BATCH:
            AB_BatchQueue.resume().catch(err => {
                AB_Logger.error(SW_MODULE, 'Resume batch failed', err.message);
            });
            return { success: true };

        case AB_EVENTS.STOP_BATCH:
            await AB_BatchQueue.stop();
            return { success: true };

        // ─── Page Status (forwarded to content script) ───
        case AB_EVENTS.GET_PAGE_STATUS: {
            const flowTab = await _getFlowTab();
            if (!flowTab) {
                return { onFlowPage: false, url: null, projectOpen: false, hasPromptInput: false, hasGenerateButton: false };
            }
            return new Promise((resolve) => {
                chrome.tabs.sendMessage(flowTab.id, { type: AB_EVENTS.GET_PAGE_STATUS }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ onFlowPage: true, url: flowTab.url, contentScriptReady: false });
                    } else {
                        resolve(response);
                    }
                });
            });
        }

        // ─── State Queries ───
        case AB_EVENTS.REQUEST_STATE:
            return await AB_Storage.getFullState();

        case 'GET_ORCHESTRATOR_STATUS':
            return AB_Orchestrator.getStatus();

        case 'GET_BATCH_STATUS':
            return await AB_BatchQueue.getStatus();

        // ─── Project CRUD ───
        case 'CREATE_PROJECT':
            const newProject = AB_Models.createProject(payload);
            await AB_Storage.saveProject(newProject);
            return { success: true, project: newProject };

        case 'UPDATE_PROJECT':
            const existing = await AB_Storage.getProject(payload.id);
            if (!existing) return { success: false, error: 'Project not found' };
            Object.assign(existing, payload, { updatedAt: Date.now() });
            await AB_Storage.saveProject(existing);
            return { success: true, project: existing };

        case 'DELETE_PROJECT':
            await AB_Storage.deleteProject(payload.projectId);
            return { success: true };

        case 'CLONE_PROJECT': {
            const source = await AB_Storage.getProject(payload.projectId);
            if (!source) return { success: false, error: 'Project not found' };
            const clone = {
                ...source,
                id: AB_Models.uuid(),
                name: source.name + ' (Copy)',
                status: AB_CONSTANTS.PROJECT_STATUS.DRAFT,
                flowUrl: undefined,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await AB_Storage.saveProject(clone);
            AB_Logger.info(SW_MODULE, `Cloned project "${source.name}" → "${clone.name}"`);
            return { success: true, project: clone };
        }

        case 'GET_PROJECTS':
            return await AB_Storage.getAllProjects();

        case 'GET_PROJECT':
            return await AB_Storage.getProject(payload.projectId);

        case 'GET_PROJECT_PROGRESS':
            return await AB_Storage.getJobProgress(payload.projectId);

        case 'SAVE_PROJECT': {
            const proj = payload.project;
            if (proj && payload.projectId) {
                await AB_Storage.saveProject(proj);
            }
            return { success: true };
        }

        // ─── Navigate Flow tab to a project URL ───
        case 'NAVIGATE_TO_PROJECT': {
            const navFlowTabs = await chrome.tabs.query({
                url: ['*://labs.google/flow/*', '*://labs.google/fx/*']
            });
            if (!navFlowTabs || navFlowTabs.length === 0) {
                // Open a new tab
                await chrome.tabs.create({ url: payload.flowUrl });
                return { success: true };
            }
            const navTabId = navFlowTabs[0].id;
            await chrome.tabs.update(navTabId, { url: payload.flowUrl, active: true });
            await chrome.windows.update(navFlowTabs[0].windowId, { focused: true });
            return { success: true };
        }

        // ─── Get video URLs (with optional navigation to project) ───
        case 'GET_VIDEO_URLS_FOR_DOWNLOAD': {
            // Find Flow tab
            let flowTabs = await chrome.tabs.query({
                url: ['*://labs.google/flow/*', '*://labs.google/fx/*']
            });
            if (!flowTabs || flowTabs.length === 0) return { videos: [] };
            let dlTabId = flowTabs[0].id;

            // Navigate to project URL if provided
            if (payload?.flowUrl) {
                const currentUrl = flowTabs[0].url || '';
                const projectId = payload.flowUrl.split('/project/')[1];
                if (projectId && !currentUrl.includes(projectId)) {
                    AB_Logger.info('ServiceWorker', `Navigating to project: ${payload.flowUrl}`);
                    await chrome.tabs.update(dlTabId, { url: payload.flowUrl });

                    // Wait for page to fully load using onUpdated listener
                    await new Promise((resolve) => {
                        const onUpdated = (tabId, changeInfo) => {
                            if (tabId === dlTabId && changeInfo.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(onUpdated);
                                resolve();
                            }
                        };
                        chrome.tabs.onUpdated.addListener(onUpdated);
                        // Timeout after 20s
                        setTimeout(() => {
                            chrome.tabs.onUpdated.removeListener(onUpdated);
                            resolve();
                        }, 20000);
                    });

                    // Extra wait for content script to initialize
                    await new Promise(r => setTimeout(r, 3000));

                    // Try to inject content script if not connected
                    try {
                        await AB_Orchestrator._injectContentScript?.(dlTabId);
                    } catch (e) { /* may already be injected */ }

                    // Wait for content script to respond
                    for (let attempt = 0; attempt < 5; attempt++) {
                        try {
                            const status = await new Promise((resolve, reject) => {
                                chrome.tabs.sendMessage(dlTabId, {
                                    type: AB_EVENTS.EXECUTE_ACTION,
                                    payload: { action: AB_ACTIONS.CHECK_FLOW_PAGE, params: {} },
                                }, (resp) => {
                                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                                    else resolve(resp);
                                });
                            });
                            if (status?.isEditorPage || status?.hasPromptInput) {
                                AB_Logger.info('ServiceWorker', `Content script ready on attempt ${attempt + 1}`);
                                break;
                            }
                        } catch (e) {
                            AB_Logger.info('ServiceWorker', `Waiting for content script... attempt ${attempt + 1}/5`);
                        }
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
            }

            // Switch to Videos tab
            await new Promise(resolve => {
                chrome.tabs.sendMessage(dlTabId, {
                    type: AB_EVENTS.EXECUTE_ACTION,
                    payload: { action: AB_ACTIONS.SWITCH_TO_VIDEOS_TAB, params: {} },
                }, resolve);
            });
            await new Promise(r => setTimeout(r, 3000));

            // Get video URLs
            return new Promise(resolve => {
                chrome.tabs.sendMessage(dlTabId, {
                    type: AB_EVENTS.EXECUTE_ACTION,
                    payload: { action: AB_ACTIONS.GET_VIDEO_URLS, params: {} },
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ videos: [] });
                    } else {
                        resolve(response || { videos: [] });
                    }
                });
            });
        }

        // ─── Download videos to a named folder ───
        case 'DOWNLOAD_VIDEOS_TO_FOLDER': {
            const { videos, folderName } = payload;
            const safeName = folderName.replace(/[^a-zA-Z0-9_\- ]/g, '_');
            const results = [];

            for (let i = 0; i < videos.length; i++) {
                const videoUrl = videos[i]?.src;
                if (!videoUrl) continue;

                try {
                    const downloadId = await chrome.downloads.download({
                        url: videoUrl,
                        filename: `${safeName}/video_${String(i + 1).padStart(2, '0')}.mp4`,
                        conflictAction: 'uniquify',
                    });
                    results.push({ index: i, downloadId, success: true });
                } catch (err) {
                    AB_Logger.warn('ServiceWorker', `Failed to download video ${i + 1}: ${err.message}`);
                    results.push({ index: i, success: false, error: err.message });
                }
            }

            return { success: true, downloaded: results.filter(r => r.success).length, total: videos.length };
        }

        // ─── Batch Queue Management ───
        case 'ADD_TO_BATCH':
            return await AB_BatchQueue.addProject(payload.projectId);

        case 'REMOVE_FROM_BATCH':
            return await AB_BatchQueue.removeProject(payload.projectId);

        case 'REORDER_BATCH':
            return await AB_BatchQueue.reorder(payload.projectIds);

        case 'RETRY_FAILED_BATCH':
            return await AB_BatchQueue.retryFailed();

        // ─── Diagnostics ───
        case AB_EVENTS.RUN_DIAGNOSTICS: {
            const diagTabId = await AB_Storage.getActiveTab();
            const emptyDiag = { score: 0, found: 0, total: 0, criticalFound: 0, criticalTotal: 0, healthy: false, missing: [], criticalMissing: [], details: {} };
            if (!diagTabId) return { ...emptyDiag, error: 'No active Flow tab' };
            return new Promise((resolve) => {
                chrome.tabs.sendMessage(diagTabId, { type: AB_EVENTS.RUN_DIAGNOSTICS }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        resolve({ ...emptyDiag, error: chrome.runtime.lastError?.message || 'No response from content script' });
                    } else {
                        resolve(response);
                    }
                });
            });
        }

        // ─── Logs ───
        case AB_EVENTS.LOG_ENTRY:
            // Log entries from content script — just acknowledge
            return { success: true };

        // ─── Run History ───
        case AB_EVENTS.GET_RUN_HISTORY:
            return { success: true, history: await AB_Storage.getRunHistory() };

        case AB_EVENTS.CLEAR_RUN_HISTORY:
            await chrome.storage.local.remove(AB_CONSTANTS.STORAGE_KEYS.RUN_HISTORY);
            return { success: true };

        // ─── Notification Settings (Telegram, Discord, Webhook) ───
        case 'SAVE_TELEGRAM_SETTINGS': case 'SAVE_DISCORD_SETTINGS': case 'SAVE_WEBHOOK_SETTINGS': {
            const kind = type.replace('SAVE_', '').replace('_SETTINGS', '');
            const key = _notifRegistry[kind]?.storageKey;
            if (!key) return { success: false, error: 'Unknown notification type' };
            await chrome.storage.local.set({ [key]: payload });
            return { success: true };
        }

        case 'GET_TELEGRAM_SETTINGS': case 'GET_DISCORD_SETTINGS': case 'GET_WEBHOOK_SETTINGS': {
            const kind = type.replace('GET_', '').replace('_SETTINGS', '');
            const key = _notifRegistry[kind]?.storageKey;
            if (!key) return { success: false, error: 'Unknown notification type' };
            const result = await chrome.storage.local.get(key);
            return { success: true, settings: result[key] || {} };
        }

        case 'TEST_TELEGRAM': case 'TEST_DISCORD': case 'TEST_WEBHOOK': {
            const kind = type.replace('TEST_', '');
            const testFn = _notifRegistry[kind]?.testFn;
            if (!testFn) return { success: false, error: 'Unknown notification type' };
            try {
                await testFn(payload);
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }

        case 'GET_INTERRUPTED_JOBS': {
            const ijResult = await chrome.storage.local.get('ab_interrupted_jobs');
            return { success: true, jobs: ijResult.ab_interrupted_jobs || [] };
        }

        case 'CLEAR_INTERRUPTED_JOBS':
            await chrome.storage.local.remove('ab_interrupted_jobs');
            return { success: true };

        // ─── Main-World Typing (for Slate.js editors) ───
        case 'TYPE_IN_MAIN_WORLD': {
            const tabId = await AB_Storage.getActiveTab();
            if (!tabId) return { success: false, error: 'No active tab' };
            const selector = payload.selector || '[data-slate-editor="true"]';

            // ─── ATTEMPT 1: Direct Slate API via React fiber (no debugger bar) ───
            try {
                const slateResults = await chrome.scripting.executeScript({
                    target: { tabId },
                    world: 'MAIN',
                    func: (text, sel) => {
                        try {
                            const editorEl = document.querySelector(sel);
                            if (!editorEl) return { success: false, error: 'Editor element not found' };

                            // Find React fiber key on the DOM element
                            const fiberKey = Object.keys(editorEl).find(k =>
                                k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
                            );
                            if (!fiberKey) return { success: false, error: 'React fiber not found' };

                            // Walk up the fiber tree to find the Slate editor instance
                            let fiber = editorEl[fiberKey];
                            let slateEditor = null;
                            let walks = 0;
                            while (fiber && walks < 50) {
                                walks++;
                                const props = fiber.memoizedProps || {};
                                if (props.editor && typeof props.editor.apply === 'function' && props.editor.children) {
                                    slateEditor = props.editor;
                                    break;
                                }
                                fiber = fiber.return;
                            }
                            if (!slateEditor) return { success: false, error: 'Slate editor not found in fiber tree' };

                            // Select all content in the editor
                            if (slateEditor.children.length > 0) {
                                const lastBlockIdx = slateEditor.children.length - 1;
                                const lastBlock = slateEditor.children[lastBlockIdx];
                                const leaves = lastBlock.children || [lastBlock];
                                const lastLeafIdx = Math.max(0, leaves.length - 1);
                                const lastLeafText = leaves[lastLeafIdx]?.text || '';

                                slateEditor.apply({
                                    type: 'set_selection',
                                    properties: slateEditor.selection,
                                    newProperties: {
                                        anchor: { path: [0, 0], offset: 0 },
                                        focus: { path: [lastBlockIdx, lastLeafIdx], offset: lastLeafText.length },
                                    },
                                });
                            }

                            // Insert text — replaces the current selection
                            slateEditor.insertText(text);

                            // Verify insertion
                            const firstLeaf = slateEditor.children?.[0]?.children?.[0];
                            const inserted = firstLeaf?.text?.includes(text.substring(0, 20));
                            return { success: !!inserted };
                        } catch (err) {
                            return { success: false, error: err.message };
                        }
                    },
                    args: [payload.text, selector],
                });

                const slateResult = slateResults?.[0]?.result;
                if (slateResult?.success) {
                    AB_Logger.info(SW_MODULE, `Slate API text input succeeded: "${payload.text.substring(0, 40)}..."`);
                    return { success: true };
                }
                AB_Logger.info(SW_MODULE, `Slate API attempt failed: ${slateResult?.error || 'unknown'}, trying CDP fallback...`);
            } catch (e) {
                AB_Logger.info(SW_MODULE, 'Slate API attempt threw, trying CDP fallback:', e.message);
            }

            // ─── ATTEMPT 2: execCommand fallback via MAIN world (no debugger needed) ───
            try {
                const execResults = await chrome.scripting.executeScript({
                    target: { tabId },
                    world: 'MAIN',
                    func: (text, sel) => {
                        try {
                            const editor = document.querySelector(sel);
                            if (!editor) return { success: false, error: 'Editor element not found' };

                            // Focus the editor
                            editor.focus();
                            await_sleep: // Small delay via sync approach
                            void 0;

                            // Select all existing content
                            document.execCommand('selectAll', false, null);

                            // Try insertText via execCommand
                            const ok = document.execCommand('insertText', false, text);
                            if (ok) {
                                // Verify the text was actually inserted
                                const editorText = editor.textContent || '';
                                if (editorText.includes(text.substring(0, 20))) {
                                    return { success: true, method: 'execCommand' };
                                }
                            }

                            // Fallback: dispatch InputEvent (Slate.js listens to beforeinput)
                            const selection = window.getSelection();
                            if (selection && editor.textContent) {
                                selection.selectAllChildren(editor);
                                selection.deleteFromDocument();
                            }

                            editor.dispatchEvent(new InputEvent('beforeinput', {
                                inputType: 'insertText',
                                data: text,
                                bubbles: true,
                                cancelable: true,
                            }));

                            return { success: true, method: 'inputEvent' };
                        } catch (err) {
                            return { success: false, error: err.message };
                        }
                    },
                    args: [payload.text, selector],
                });

                const execResult = execResults?.[0]?.result;
                if (execResult?.success) {
                    AB_Logger.info(SW_MODULE, `execCommand/InputEvent fallback succeeded (method: ${execResult.method}): "${payload.text.substring(0, 40)}..."`);
                    return { success: true };
                }
                AB_Logger.info(SW_MODULE, `execCommand fallback failed: ${execResult?.error || 'unknown'}`);
                return { success: false, error: execResult?.error || 'Both typing attempts failed' };
            } catch (err) {
                AB_Logger.info(SW_MODULE, 'TYPE_IN_MAIN_WORLD both attempts failed:', err.message);
                return { success: false, error: err.message };
            }
        }

        default:
            AB_Logger.warn(SW_MODULE, `Unknown message type: ${type}`);
            return { success: false, error: `Unknown message type: ${type}` };
    }
}

/**
 * Find a tab with Google Flow open.
 */
async function _getFlowTab() {
    const tabs = await chrome.tabs.query({ url: ['*://labs.google/flow/*', '*://labs.google/fx/*'] });
    if (!tabs || tabs.length === 0) return null;

    // Prefer the stored active tab (set when user last started a project)
    const storedTabId = await AB_Storage.getActiveTab();
    if (storedTabId) {
        const match = tabs.find(t => t.id === storedTabId);
        if (match) return match;
    }

    return tabs[0];
}

// ─── Recovery ───

async function _checkForInterruptedJobs() {
    const projects = await AB_Storage.getAllProjects();
    const interrupted = [];

    for (const [id, project] of Object.entries(projects)) {
        if (project.status === AB_CONSTANTS.PROJECT_STATUS.RUNNING) {
            AB_Logger.warn(SW_MODULE, `Found interrupted job: "${project.name}" (${id})`);
            // Mark as paused for manual resume
            project.status = AB_CONSTANTS.PROJECT_STATUS.PAUSED;
            await AB_Storage.saveProject(project);

            const progress = await AB_Storage.getJobProgress(id);
            if (progress) {
                progress.currentState = AB_CONSTANTS.PROJECT_FSM.PAUSED;
                progress.pausedPhase = progress.phase;
                await AB_Storage.saveJobProgress(progress);
            }

            interrupted.push({
                projectId: id,
                projectName: project.name,
                phase: progress?.phase || 'unknown',
                currentIndex: progress?.currentIndex ?? -1,
                totalImages: progress?.totalImages || 0,
                totalVideos: progress?.totalVideos || 0,
                imagesCompleted: progress?.imageResults?.filter(r => r.status === AB_CONSTANTS.IMAGE_STATUS.READY).length || 0,
            });
        }
    }

    if (interrupted.length > 0) {
        await chrome.storage.local.set({ ab_interrupted_jobs: interrupted });
        AB_Logger.info(SW_MODULE, `Stored ${interrupted.length} interrupted job(s) for recovery prompt`);
    }
}

AB_Logger.info(SW_MODULE, 'Service worker initialized');
