/**
 * AutoBoom — Download Manager
 * Wraps chrome.downloads API with naming conventions and progress tracking.
 */

const AB_DownloadManager = (() => {
    const _activeDownloads = new Map(); // downloadId -> { projectId, type, index }

    /**
     * Download a video file with proper naming.
     * @param {string} url - URL or blob URL to download
     * @param {string} projectName - Project name for folder
     * @param {string} filename - e.g. "video_01_01-02.mp4"
     * @returns {Promise<number>} - chrome download ID
     */
    async function downloadVideo(url, projectName, filename) {
        const safeName = _sanitizeFolderName(projectName);
        const path = `AutoBoom/${safeName}/videos/${filename}`;

        return new Promise((resolve, reject) => {
            chrome.downloads.download({
                url,
                filename: path,
                saveAs: false,
                conflictAction: 'uniquify',
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    _activeDownloads.set(downloadId, { type: 'video', filename });
                    AB_Logger.info('Download', `Started download: ${path}`, { downloadId });
                    resolve(downloadId);
                }
            });
        });
    }

    /**
     * Download an image file (for export / backup).
     */
    async function downloadImage(url, projectName, filename) {
        const safeName = _sanitizeFolderName(projectName);
        const path = `AutoBoom/${safeName}/images/${filename}`;

        return new Promise((resolve, reject) => {
            chrome.downloads.download({
                url,
                filename: path,
                saveAs: false,
                conflictAction: 'uniquify',
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    _activeDownloads.set(downloadId, { type: 'image', filename });
                    AB_Logger.info('Download', `Started download: ${path}`, { downloadId });
                    resolve(downloadId);
                }
            });
        });
    }

    /**
     * Download the job metadata (job.json, results.json).
     */
    async function downloadMeta(projectName, filename, content) {
        const safeName = _sanitizeFolderName(projectName);
        const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const path = `AutoBoom/${safeName}/meta/${filename}`;

        return new Promise((resolve, reject) => {
            chrome.downloads.download({
                url,
                filename: path,
                saveAs: false,
                conflictAction: 'overwrite',
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    AB_Logger.info('Download', `Saved meta: ${path}`, { downloadId });
                    resolve(downloadId);
                }
            });
        });
    }

    /**
     * Wait for a download to complete.
     */
    function waitForDownload(downloadId, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                chrome.downloads.onChanged.removeListener(listener);
                reject(new Error(`Download ${downloadId} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            const listener = (delta) => {
                if (delta.id !== downloadId) return;

                if (delta.state) {
                    if (delta.state.current === 'complete') {
                        clearTimeout(timeout);
                        chrome.downloads.onChanged.removeListener(listener);
                        _activeDownloads.delete(downloadId);
                        resolve({ downloadId, state: 'complete' });
                    } else if (delta.state.current === 'interrupted') {
                        clearTimeout(timeout);
                        chrome.downloads.onChanged.removeListener(listener);
                        _activeDownloads.delete(downloadId);
                        reject(new Error(`Download ${downloadId} interrupted: ${delta.error?.current || 'unknown'}`));
                    }
                }
            };

            chrome.downloads.onChanged.addListener(listener);
        });
    }

    function _sanitizeFolderName(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    }

    return { downloadVideo, downloadImage, downloadMeta, waitForDownload };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_DownloadManager = AB_DownloadManager;
}
