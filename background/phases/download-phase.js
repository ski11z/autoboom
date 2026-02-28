/**
 * AutoBoom — Download Phase
 * Waits for videos to complete and downloads them.
 * Extracted from orchestrator.js during code splitting.
 */

const AB_DownloadPhase = (() => {
    const MODULE = 'Orchestrator';

    async function run() {
        const H = AB_PhaseHelpers;
        const project = H.getProject();
        const progress = H.getProgress();
        const totalImages = progress.totalImages;
        const transitionCount = totalImages - 1;
        const animPrompts = project.animationPrompts || [];
        const hasExtraAnimation = animPrompts.length > transitionCount;
        const expectedVideos = transitionCount + (hasExtraAnimation ? 1 : 0);

        if (expectedVideos === 0) return;

        AB_Logger.info(MODULE, `Download phase: waiting for ${expectedVideos} videos to complete`);

        // Switch to Videos tab to see completed videos
        await H.sendAction(AB_ACTIONS.SWITCH_TO_VIDEOS_TAB);
        await H.sleep(2000);

        // Poll until all videos are ready (max 10 minutes)
        const maxWaitMs = 600_000;
        const pollInterval = 15_000;
        const startTime = Date.now();
        let completedCount = 0;

        while (completedCount < expectedVideos && Date.now() - startTime < maxWaitMs) {
            if (H.isAborted()) return;

            const countResult = await H.sendAction(AB_ACTIONS.COUNT_COMPLETED_VIDEOS);
            completedCount = countResult?.count || 0;

            AB_Logger.info(MODULE, `Videos ready: ${completedCount}/${expectedVideos}`);

            if (completedCount >= expectedVideos) break;

            await H.sleep(pollInterval);
        }

        if (completedCount < expectedVideos) {
            AB_Logger.warn(MODULE, `Only ${completedCount}/${expectedVideos} videos completed within timeout`);
        }

        // Download all available videos
        if (completedCount > 0) {
            const urlsResult = await H.sendAction(AB_ACTIONS.GET_VIDEO_URLS);
            const videos = urlsResult?.videos || [];

            for (let i = 0; i < videos.length && i < expectedVideos; i++) {
                if (H.isAborted()) return;

                const videoUrl = videos[i]?.src;
                if (!videoUrl) continue;

                try {
                    const filename = `${project.name}/video_${i + 1}.mp4`;
                    const downloadId = await AB_DownloadManager.downloadVideo(
                        videoUrl, project.name,
                        `video_${i + 1}.mp4`
                    );

                    if (progress.videoResults[i]) {
                        progress.videoResults[i].status = AB_CONSTANTS.VIDEO_STATUS.DOWNLOADED;
                        progress.videoResults[i].downloadId = downloadId;
                    }
                    await AB_Storage.saveJobProgress(progress);
                    H.broadcastState();

                    AB_Logger.info(MODULE, `Video ${i + 1} downloaded`);
                } catch (err) {
                    AB_Logger.warn(MODULE, `Video ${i + 1} download failed: ${err.message}`);
                }
            }
        }

        AB_Logger.info(MODULE, 'Download phase complete');
    }

    return { run };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_DownloadPhase = AB_DownloadPhase;
}
