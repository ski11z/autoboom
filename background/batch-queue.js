/**
 * AutoBoom — Batch Queue Manager
 * Manages the ordered queue of projects. Handles pause/resume/stop.
 */

const AB_BatchQueue = (() => {
    const MODULE = 'BatchQueue';
    let _running = false;
    let _paused = false;

    /**
     * Add a project to the batch queue.
     */
    async function addProject(projectId) {
        const queue = await AB_Storage.getBatchQueue();
        if (!queue.projectIds.includes(projectId)) {
            queue.projectIds.push(projectId);
            queue.projectStatuses.push(AB_Models.createBatchProjectStatus(projectId));
            await AB_Storage.saveBatchQueue(queue);
            AB_Logger.info(MODULE, `Added project to queue: ${projectId}`);
        }
        return queue;
    }

    /**
     * Remove a project from the batch queue.
     */
    async function removeProject(projectId) {
        const queue = await AB_Storage.getBatchQueue();
        queue.projectIds = queue.projectIds.filter(id => id !== projectId);
        queue.projectStatuses = queue.projectStatuses.filter(s => s.projectId !== projectId);
        await AB_Storage.saveBatchQueue(queue);
        return queue;
    }

    /**
     * Reorder the batch queue.
     */
    async function reorder(orderedProjectIds) {
        const queue = await AB_Storage.getBatchQueue();
        queue.projectIds = orderedProjectIds;
        // Reorder statuses to match
        const statusMap = Object.fromEntries(queue.projectStatuses.map(s => [s.projectId, s]));
        queue.projectStatuses = orderedProjectIds.map(id =>
            statusMap[id] || AB_Models.createBatchProjectStatus(id)
        );
        await AB_Storage.saveBatchQueue(queue);
        return queue;
    }

    /**
     * Start executing the batch queue.
     */
    async function start() {
        if (_running) return;
        _running = true;
        _paused = false;

        const queue = await AB_Storage.getBatchQueue();
        queue.status = AB_CONSTANTS.BATCH_STATUS.RUNNING;
        queue.startedAt = queue.startedAt || Date.now();

        // Find starting index (skip completed)
        let startIdx = 0;
        for (let i = 0; i < queue.projectStatuses.length; i++) {
            if (queue.projectStatuses[i].status === AB_CONSTANTS.BATCH_PROJECT_STATUS.COMPLETED) {
                startIdx = i + 1;
            } else {
                break;
            }
        }

        queue.currentIndex = startIdx;
        await AB_Storage.saveBatchQueue(queue);
        _broadcastBatch(queue);

        AB_Logger.info(MODULE, `Starting batch: ${queue.projectIds.length} projects, from index ${startIdx}`);

        for (let i = startIdx; i < queue.projectIds.length; i++) {
            if (!_running || _paused) break;

            const projectId = queue.projectIds[i];
            queue.currentIndex = i;
            queue.projectStatuses[i].status = AB_CONSTANTS.BATCH_PROJECT_STATUS.RUNNING;
            queue.projectStatuses[i].startedAt = Date.now();
            await AB_Storage.saveBatchQueue(queue);
            _broadcastBatch(queue);

            try {
                await AB_Orchestrator.startProject(projectId);
                queue.projectStatuses[i].status = AB_CONSTANTS.BATCH_PROJECT_STATUS.COMPLETED;
                queue.projectStatuses[i].completedAt = Date.now();
            } catch (err) {
                AB_Logger.error(MODULE, `Project ${projectId} failed in batch`, err.message);
                queue.projectStatuses[i].status = AB_CONSTANTS.BATCH_PROJECT_STATUS.ERROR;
                // Continue to next project in batch
            }

            await AB_Storage.saveBatchQueue(queue);
            _broadcastBatch(queue);

            // 60-second cooldown before next project (unless this is the last one)
            if (i < queue.projectIds.length - 1 && _running && !_paused) {
                AB_Logger.info(MODULE, 'Waiting 60s before next project...');
                queue.waitingUntil = Date.now() + 60000;
                await AB_Storage.saveBatchQueue(queue);
                _broadcastBatch(queue);

                // Wait in 1-second increments so we can break if stopped
                for (let s = 0; s < 60; s++) {
                    if (!_running || _paused) break;
                    await new Promise(r => setTimeout(r, 1000));
                }
                queue.waitingUntil = null;
                await AB_Storage.saveBatchQueue(queue);
            }
        }

        if (_running && !_paused) {
            queue.status = AB_CONSTANTS.BATCH_STATUS.COMPLETED;
            _running = false;
        }

        await AB_Storage.saveBatchQueue(queue);
        _broadcastBatch(queue);

        AB_Logger.info(MODULE, 'Batch execution finished');
    }

    /**
     * Pause batch execution.
     */
    async function pause() {
        _paused = true;
        _running = false;
        await AB_Orchestrator.pauseProject();

        const queue = await AB_Storage.getBatchQueue();
        queue.status = AB_CONSTANTS.BATCH_STATUS.PAUSED;
        await AB_Storage.saveBatchQueue(queue);
        _broadcastBatch(queue);

        AB_Logger.info(MODULE, 'Batch paused');
    }

    /**
     * Resume batch execution.
     */
    async function resume() {
        _paused = false;
        const queue = await AB_Storage.getBatchQueue();
        queue.status = AB_CONSTANTS.BATCH_STATUS.RUNNING;
        await AB_Storage.saveBatchQueue(queue);

        AB_Logger.info(MODULE, 'Resuming batch');
        await start(); // Will pick up from current index
    }

    /**
     * Stop batch execution entirely.
     */
    async function stop() {
        _running = false;
        _paused = false;
        await AB_Orchestrator.stopProject();

        const queue = await AB_Storage.getBatchQueue();
        queue.status = AB_CONSTANTS.BATCH_STATUS.IDLE;
        queue.currentIndex = -1;
        await AB_Storage.saveBatchQueue(queue);
        _broadcastBatch(queue);

        AB_Logger.info(MODULE, 'Batch stopped');
    }

    /**
     * Get current batch status.
     */
    async function getStatus() {
        const queue = await AB_Storage.getBatchQueue();
        return {
            ...queue,
            isRunning: _running,
            isPaused: _paused,
        };
    }

    function _broadcastBatch(queue) {
        chrome.runtime.sendMessage({
            type: AB_EVENTS.BATCH_UPDATE,
            payload: { ...queue, isRunning: _running, isPaused: _paused },
        }).catch(() => { });
    }

    /**
     * Re-queue only failed projects and restart the batch.
     */
    async function retryFailed() {
        const data = await chrome.storage.local.get('ab_batch_queue');
        const queue = data.ab_batch_queue || { projects: [], status: AB_CONSTANTS.BATCH_STATUS.IDLE };

        let retryCount = 0;
        for (const p of queue.projects) {
            if (p.status === AB_CONSTANTS.BATCH_PROJECT_STATUS.ERROR) {
                p.status = AB_CONSTANTS.BATCH_PROJECT_STATUS.QUEUED;
                p.error = null;
                retryCount++;
            }
        }

        if (retryCount === 0) {
            AB_Logger.info(MODULE, 'No failed projects to retry');
            return { retried: 0 };
        }

        queue.status = AB_CONSTANTS.BATCH_STATUS.RUNNING;
        await chrome.storage.local.set({ ab_batch_queue: queue });
        _broadcastBatch(queue);
        AB_Logger.info(MODULE, `Re-queued ${retryCount} failed project(s) — restarting batch`);

        // Start the batch run again
        _running = true;
        _paused = false;
        _runNext();

        return { retried: retryCount };
    }

    return { addProject, removeProject, reorder, start, pause, resume, stop, getStatus, retryFailed };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_BatchQueue = AB_BatchQueue;
}
