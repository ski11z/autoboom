/**
 * AutoBoom — Data Model Factories
 * Factory functions to create properly structured data objects.
 */

const AB_Models = (() => {
    const _uuid = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };

    return {
        /**
         * Create a new Project
         */
        createProject({ name, mode, aspectRatio, outputCount, imageModel, videoModel, imagePrompts, animationPrompts, videoPrompts, referenceUrls, chainMode, chainFirstRef, singleImageMode }) {
            const D = AB_CONSTANTS.DEFAULTS;
            return {
                id: _uuid(),
                name: name || 'Untitled Project',
                mode: mode || 'frames-to-video', // 'frames-to-video' | 'text-to-video' | 'create-image'
                aspectRatio: aspectRatio || D.ASPECT_RATIO,
                outputCount: outputCount || D.OUTPUTS_PER_PROMPT,
                outputsPerPrompt: outputCount || D.OUTPUTS_PER_PROMPT,
                imageModel: imageModel || D.IMAGE_MODEL,
                videoModel: videoModel || D.VIDEO_MODEL,
                imagePrompts: imagePrompts || [],
                animationPrompts: animationPrompts || [],
                videoPrompts: videoPrompts || [], // For text-to-video mode
                referenceUrls: referenceUrls || [], // For create-image mode
                chainMode: chainMode || false, // Image Chain: auto-reference previous image
                chainFirstRef: chainFirstRef || '', // Image Chain: optional URL for first image reference
                singleImageMode: singleImageMode || false, // Single Image Mode: each animation uses one image only
                settings: {
                    imageTimeout: D.IMAGE_TIMEOUT_MS,
                    videoTimeout: D.VIDEO_TIMEOUT_MS,
                    maxRetries: D.MAX_RETRIES,
                    referenceMethod: D.REFERENCE_METHOD,
                },
                status: AB_CONSTANTS.PROJECT_STATUS.DRAFT,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
        },

        /**
         * Create a new JobProgress for a project
         */
        createJobProgress(project) {
            const totalImages = project.imagePrompts.length;
            let totalVideos;

            if (project.singleImageMode) {
                // Single Image Mode: one video per animation prompt (each uses one image only)
                totalVideos = (project.animationPrompts || []).length;
            } else {
                // Normal mode: transitions between image pairs + optional extra
                const transitionCount = Math.max(0, totalImages - 1);
                const hasExtraAnim = (project.animationPrompts || []).length > transitionCount;
                totalVideos = transitionCount + (hasExtraAnim ? 1 : 0);
            }

            return {
                projectId: project.id,
                phase: null,
                currentIndex: -1,
                totalImages,
                totalVideos,
                currentState: AB_CONSTANTS.PROJECT_FSM.IDLE,
                retryCount: 0,
                lastError: null,
                startedAt: null,
                updatedAt: Date.now(),
                pausedPhase: null,
                imageResults: Array.from({ length: totalImages }, (_, i) => ({
                    index: i,
                    filename: `scene_${String(i + 1).padStart(2, '0')}.png`,
                    flowElementId: null,
                    status: AB_CONSTANTS.IMAGE_STATUS.PENDING,
                    completedAt: null,
                })),
                videoResults: Array.from({ length: totalVideos }, (_, i) => ({
                    index: i,
                    filename: project.singleImageMode
                        ? `video_single_${String(i + 1).padStart(2, '0')}.mp4`
                        : `video_${String(i + 1).padStart(2, '0')}_${String(i + 1).padStart(2, '0')}-${String(i + 2).padStart(2, '0')}.mp4`,
                    startScene: project.singleImageMode ? i + 1 : i + 1,
                    endScene: project.singleImageMode ? i + 1 : i + 2,
                    downloadId: null,
                    status: AB_CONSTANTS.VIDEO_STATUS.PENDING,
                    retryCount: 0,
                    completedAt: null,
                })),
            };
        },

        /**
         * Create a JobProgress for a Text-to-Video project.
         * No images — only video results (one per prompt).
         */
        createT2VJobProgress(project) {
            const totalVideos = (project.videoPrompts || []).length;
            return {
                projectId: project.id,
                phase: null,
                currentIndex: -1,
                totalImages: 0,
                totalVideos,
                currentState: AB_CONSTANTS.PROJECT_FSM.IDLE,
                retryCount: 0,
                lastError: null,
                startedAt: null,
                updatedAt: Date.now(),
                pausedPhase: null,
                imageResults: [],
                videoResults: Array.from({ length: totalVideos }, (_, i) => ({
                    index: i,
                    filename: `t2v_${String(i + 1).padStart(2, '0')}.mp4`,
                    downloadId: null,
                    status: AB_CONSTANTS.VIDEO_STATUS.PENDING,
                    retryCount: 0,
                    completedAt: null,
                })),
            };
        },

        /**
         * Create a JobProgress for a Create Image project.
         * Images only — no video results.
         */
        createCIJobProgress(project) {
            const totalImages = (project.imagePrompts || []).length;
            return {
                projectId: project.id,
                phase: null,
                currentIndex: -1,
                totalImages,
                totalVideos: 0,
                currentState: AB_CONSTANTS.PROJECT_FSM.IDLE,
                retryCount: 0,
                lastError: null,
                startedAt: null,
                updatedAt: Date.now(),
                pausedPhase: null,
                imageResults: Array.from({ length: totalImages }, (_, i) => ({
                    index: i,
                    filename: `img_${String(i + 1).padStart(2, '0')}.png`,
                    flowElementId: null,
                    status: AB_CONSTANTS.IMAGE_STATUS.PENDING,
                    completedAt: null,
                })),
                videoResults: [],
            };
        },

        /**
         * Create ImageResult
         */
        createImageResult(index) {
            return {
                index,
                filename: `scene_${String(index + 1).padStart(2, '0')}.png`,
                flowElementId: null,
                status: AB_CONSTANTS.IMAGE_STATUS.PENDING,
                completedAt: null,
            };
        },

        /**
         * Create VideoResult
         */
        createVideoResult(index) {
            return {
                index,
                filename: `video_${String(index + 1).padStart(2, '0')}_${String(index + 1).padStart(2, '0')}-${String(index + 2).padStart(2, '0')}.mp4`,
                startScene: index + 1,
                endScene: index + 2,
                downloadId: null,
                status: AB_CONSTANTS.VIDEO_STATUS.PENDING,
                retryCount: 0,
                completedAt: null,
            };
        },

        /**
         * Create a new BatchQueue
         */
        createBatchQueue() {
            return {
                projectIds: [],
                currentIndex: -1,
                status: AB_CONSTANTS.BATCH_STATUS.IDLE,
                startedAt: null,
                updatedAt: Date.now(),
                projectStatuses: [],
            };
        },

        /**
         * Create BatchProjectStatus
         */
        createBatchProjectStatus(projectId) {
            return {
                projectId,
                status: AB_CONSTANTS.BATCH_PROJECT_STATUS.QUEUED,
                startedAt: null,
                completedAt: null,
            };
        },

        /**
         * Generate a UUID v4.
         */
        uuid: _uuid,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Models = AB_Models;
}
