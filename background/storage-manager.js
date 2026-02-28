/**
 * AutoBoom — Storage Manager
 * Abstraction over chrome.storage.local with typed accessors and write-ahead support.
 */

const AB_Storage = (() => {
    const KEYS = AB_CONSTANTS.STORAGE_KEYS;

    // ─── Generic Helpers ───

    async function _get(key) {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? null;
    }

    async function _set(key, value) {
        await chrome.storage.local.set({ [key]: value });
    }

    async function _remove(key) {
        await chrome.storage.local.remove(key);
    }

    // ─── Projects ───

    async function getAllProjects() {
        return (await _get(KEYS.PROJECTS)) || {};
    }

    async function getProject(projectId) {
        const projects = await getAllProjects();
        return projects[projectId] || null;
    }

    async function saveProject(project) {
        const projects = await getAllProjects();
        project.updatedAt = Date.now();
        projects[project.id] = project;
        await _set(KEYS.PROJECTS, projects);
        return project;
    }

    async function deleteProject(projectId) {
        const projects = await getAllProjects();
        delete projects[projectId];
        await _set(KEYS.PROJECTS, projects);
        // Also clean up related job progress
        await _remove(KEYS.JOB_PROGRESS_PREFIX + projectId);
    }

    // ─── Job Progress ───

    async function getJobProgress(projectId) {
        return await _get(KEYS.JOB_PROGRESS_PREFIX + projectId);
    }

    async function saveJobProgress(progress) {
        progress.updatedAt = Date.now();
        await _set(KEYS.JOB_PROGRESS_PREFIX + progress.projectId, progress);
        return progress;
    }

    async function deleteJobProgress(projectId) {
        await _remove(KEYS.JOB_PROGRESS_PREFIX + projectId);
    }

    // ─── Batch Queue ───

    async function getBatchQueue() {
        return (await _get(KEYS.BATCH_QUEUE)) || AB_Models.createBatchQueue();
    }

    async function saveBatchQueue(queue) {
        queue.updatedAt = Date.now();
        await _set(KEYS.BATCH_QUEUE, queue);
        return queue;
    }

    // ─── Settings ───

    async function getSettings() {
        return (await _get(KEYS.SETTINGS)) || {};
    }

    async function saveSettings(settings) {
        await _set(KEYS.SETTINGS, settings);
    }

    // ─── Selector Overrides ───

    async function getSelectorOverrides() {
        return (await _get(KEYS.SELECTOR_OVERRIDES)) || {};
    }

    async function saveSelectorOverrides(overrides) {
        await _set(KEYS.SELECTOR_OVERRIDES, overrides);
    }

    // ─── Active Tab ───

    async function getActiveTab() {
        return await _get(KEYS.ACTIVE_TAB);
    }

    async function setActiveTab(tabId) {
        await _set(KEYS.ACTIVE_TAB, tabId);
    }

    async function clearActiveTab() {
        await _remove(KEYS.ACTIVE_TAB);
    }

    // ─── FSM Checkpoints ───

    async function saveFSMCheckpoint(fsmId, snapshot) {
        await _set(`ab_fsm:${fsmId}`, snapshot);
    }

    async function getFSMCheckpoint(fsmId) {
        return await _get(`ab_fsm:${fsmId}`);
    }

    async function deleteFSMCheckpoint(fsmId) {
        await _remove(`ab_fsm:${fsmId}`);
    }

    // ─── Bulk State (for popup sync) ───

    async function getFullState() {
        const projects = await getAllProjects();
        const batchQueue = await getBatchQueue();

        // Collect active job progresses
        const activeJobs = {};
        for (const pid of Object.keys(projects)) {
            const jp = await getJobProgress(pid);
            if (jp) activeJobs[pid] = jp;
        }

        return { projects, batchQueue, activeJobs };
    }

    // ─── Storage Usage ───

    async function getUsage() {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytes) => {
                resolve({
                    usedBytes: bytes,
                    maxBytes: chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024,
                    usedPercent: ((bytes / (chrome.storage.local.QUOTA_BYTES || 10485760)) * 100).toFixed(1),
                });
            });
        });
    }

    // ─── Run History ───

    async function getRunHistory() {
        return (await _get(KEYS.RUN_HISTORY)) || [];
    }

    async function saveRunRecord(record) {
        const history = await getRunHistory();
        history.unshift(record); // newest first
        // Cap at 100 records to avoid storage bloat
        if (history.length > 100) history.length = 100;
        await _set(KEYS.RUN_HISTORY, history);
    }

    return {
        getAllProjects, getProject, saveProject, deleteProject,
        getJobProgress, saveJobProgress, deleteJobProgress,
        getBatchQueue, saveBatchQueue,
        getSettings, saveSettings,
        getSelectorOverrides, saveSelectorOverrides,
        getActiveTab, setActiveTab, clearActiveTab,
        saveFSMCheckpoint, getFSMCheckpoint, deleteFSMCheckpoint,
        getFullState, getUsage,
        getRunHistory, saveRunRecord,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Storage = AB_Storage;
}
